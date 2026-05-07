import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import type { PricingTier } from "@/lib/pricing/types";
import { deriveInitialProgrammingStatus } from "@/lib/jobs/programming-status";
import { computeDueDate } from "@/lib/jobs/due-date";
type LineInput = {
  gmp_id: string;
  quantity: number;
  po_unit_price?: number | null;
  preferred_quote_id?: string;
  manual_tier_qty?: number;
  nre_charge_cad?: number | null;
  nre_included_on_po?: boolean;
};

type MultiBody = {
  customer_id: string;
  po_number: string;
  po_date: string;
  notes?: string;
  lines: LineInput[];
};

type LegacyBody = {
  customer_id: string;
  gmp_id: string;
  po_number: string;
  po_quantity: number;
  po_date: string;
  preferred_quote_id?: string;
  manual_tier_qty?: number;
  po_unit_price?: number | null;
  notes?: string;
};

type QuoteRow = {
  id: string;
  quote_number: string;
  status: string;
  expires_at: string | null;
  created_at: string;
  bom_id: string;
  customer_id: string;
  gmp_id: string;
  pricing: { tiers?: PricingTier[] } | null;
  quantities: {
    nre?: {
      programming?: number;
      stencil?: number;
      pcb_fab?: number;
    };
  } | null;
  /** Per-tier lead times, keyed tier_1 / tier_2 / â€¦ positionally aligned
   *  with pricing.tiers. Used to auto-compute jobs.due_date. */
  lead_times: Record<string, string> | null;
};

type MatchReason = "exact" | "closest-not-greater" | "manual-override";

interface Candidate {
  quote_id: string;
  quote_number: string;
  tier_qty: number;
  unit_price: number;
  subtotal: number;
  match_reason: MatchReason;
}

function computeQuotedNre(quote: QuoteRow, tier: PricingTier | null): number {
  const tierNre = tier?.nre_charge ?? 0;
  const nreBlock = quote.quantities?.nre ?? {};
  const blockTotal =
    (nreBlock.programming ?? 0) +
    (nreBlock.stencil ?? 0) +
    (nreBlock.pcb_fab ?? 0);
  // Prefer tier.nre_charge when non-zero; otherwise fall back to quantities.nre block.
  if (tierNre && tierNre > 0) return tierNre;
  return blockTotal;
}

function pickTier(tiers: PricingTier[], poQty: number): PricingTier | null {
  const eligible = tiers
    .filter((t) => t.board_qty <= poQty)
    .sort((a, b) => b.board_qty - a.board_qty);
  return eligible[0] ?? null;
}

async function generateJobNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerCode: string,
  offset = 0
): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `JB-${yy}${mm}-${customerCode}-`;
  const { count } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .like("job_number", `${prefix}%`);
  return `${prefix}${String((count ?? 0) + 1 + offset).padStart(3, "0")}`;
}

// Match one line against the customer's active quotes for that GMP.
async function matchLine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerId: string,
  line: LineInput
) {
  const nowIso = new Date().toISOString();
  const { data: quotesRaw, error: qErr } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, status, expires_at, created_at, bom_id, customer_id, gmp_id, pricing, quantities, lead_times"
    )
    .eq("customer_id", customerId)
    .eq("gmp_id", line.gmp_id)
    .in("status", ["sent", "review", "draft", "accepted"])
    .order("created_at", { ascending: false });

  if (qErr) throw new Error(qErr.message);

  const quotes = ((quotesRaw ?? []) as unknown as QuoteRow[]).filter(
    (q) => !q.expires_at || q.expires_at > nowIso
  );

  const candidates: (Candidate & { quote: QuoteRow; tier: PricingTier })[] = [];
  for (const q of quotes) {
    const tiers = q.pricing?.tiers ?? [];
    if (!tiers.length) continue;
    const tier = pickTier(tiers, line.quantity);
    if (!tier) continue;
    candidates.push({
      quote_id: q.id,
      quote_number: q.quote_number,
      tier_qty: tier.board_qty,
      unit_price: tier.per_unit,
      subtotal: tier.per_unit * line.quantity,
      match_reason:
        tier.board_qty === line.quantity ? "exact" : "closest-not-greater",
      quote: q,
      tier,
    });
  }

  let chosen: (typeof candidates)[number] | null = null;
  if (line.preferred_quote_id && line.manual_tier_qty) {
    const q = quotes.find((x) => x.id === line.preferred_quote_id);
    const tier = q?.pricing?.tiers?.find(
      (t) => t.board_qty === line.manual_tier_qty
    );
    if (q && tier) {
      chosen = {
        quote_id: q.id,
        quote_number: q.quote_number,
        tier_qty: tier.board_qty,
        unit_price: tier.per_unit,
        subtotal: tier.per_unit * line.quantity,
        match_reason: "manual-override",
        quote: q,
        tier,
      };
    }
  } else if (candidates.length) {
    chosen = candidates[0];
  }

  const candidatesOut = candidates.map((c) => ({
    quote_id: c.quote_id,
    quote_number: c.quote_number,
    tier_qty: c.tier_qty,
    unit_price: c.unit_price,
    subtotal: c.subtotal,
    match_reason: c.match_reason,
  }));

  return { chosen, candidates: candidatesOut };
}

export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const preview = url.searchParams.get("preview") === "1";

  const raw = (await req.json()) as Partial<MultiBody & LegacyBody>;

  // Normalize legacy single-line payload into multi-line shape.
  const legacy = !("lines" in raw) && !!raw.gmp_id;
  const body: MultiBody = legacy
    ? {
        customer_id: raw.customer_id as string,
        po_number: raw.po_number as string,
        po_date: raw.po_date as string,
        notes: raw.notes,
        lines: [
          {
            gmp_id: raw.gmp_id as string,
            quantity: raw.po_quantity as number,
            po_unit_price: raw.po_unit_price ?? null,
            preferred_quote_id: raw.preferred_quote_id,
            manual_tier_qty: raw.manual_tier_qty,
            nre_charge_cad: (raw as Partial<LineInput>).nre_charge_cad ?? null,
            nre_included_on_po:
              (raw as Partial<LineInput>).nre_included_on_po ?? false,
          },
        ],
      }
    : (raw as MultiBody);

  if (
    !body.customer_id ||
    !body.po_number ||
    !body.po_date ||
    !Array.isArray(body.lines) ||
    body.lines.length === 0
  ) {
    return NextResponse.json(
      { error: "customer_id, po_number, po_date, lines[] required" },
      { status: 400 }
    );
  }

  for (const [i, ln] of body.lines.entries()) {
    if (!ln.gmp_id || !ln.quantity || ln.quantity <= 0) {
      return NextResponse.json(
        { error: `Line ${i + 1}: gmp_id and quantity > 0 required` },
        { status: 400 }
      );
    }
  }

  // Match every line first.
  const matched = [] as Array<
    Awaited<ReturnType<typeof matchLine>> & { line: LineInput; index: number }
  >;
  try {
    for (let i = 0; i < body.lines.length; i++) {
      const m = await matchLine(supabase, body.customer_id, body.lines[i]);
      matched.push({ ...m, line: body.lines[i], index: i });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Preview path: return per-line preview without inserting.
  if (preview) {
    const previews = matched.map((m) => {
      if (!m.chosen) {
        return {
          line_index: m.index,
          needs_manual: true,
          candidates: m.candidates,
        };
      }
      const quotedNre = computeQuotedNre(m.chosen.quote, m.chosen.tier);
      return {
        line_index: m.index,
        needs_manual: false,
        matched_quote_id: m.chosen.quote_id,
        matched_quote_number: m.chosen.quote_number,
        source_tier_qty: m.chosen.tier_qty,
        frozen_unit_price: m.chosen.unit_price,
        frozen_subtotal: m.chosen.unit_price * m.line.quantity,
        price_match_reason: m.chosen.match_reason,
        quoted_nre_total: quotedNre,
        candidates: m.candidates,
      };
    });
    // Legacy single-line preview: preserve original flat shape.
    if (legacy) {
      const p = previews[0];
      if (p.needs_manual) {
        return NextResponse.json({
          needs_manual: true,
          candidates: p.candidates,
        });
      }
      return NextResponse.json({
        matched_quote_id: p.matched_quote_id,
        matched_quote_number: p.matched_quote_number,
        source_tier_qty: p.source_tier_qty,
        frozen_unit_price: p.frozen_unit_price,
        frozen_subtotal: p.frozen_subtotal,
        price_match_reason: p.price_match_reason,
        quoted_nre_total: p.quoted_nre_total,
        candidates: p.candidates,
      });
    }
    return NextResponse.json({ previews });
  }

  // Atomic guard: if any line still needs manual, reject whole batch.
  const unresolved = matched
    .filter((m) => !m.chosen)
    .map((m) => ({ line_index: m.index, candidates: m.candidates }));
  if (unresolved.length) {
    return NextResponse.json(
      {
        error: "One or more lines need manual quote selection",
        needs_manual_lines: unresolved,
      },
      { status: 400 }
    );
  }

  // Fetch customer code once for job number generation.
  const { data: customer } = await supabase
    .from("customers")
    .select("code")
    .eq("id", body.customer_id)
    .single();
  const customerCode = customer?.code ?? "UNK";

  // Create jobs sequentially; offset job-number counter for each new insert.
  const createdJobs: Array<{
    id: string;
    job_number: string;
    matched_quote_number: string;
    source_tier_qty: number;
    frozen_unit_price: number;
    frozen_subtotal: number;
    price_match_reason: MatchReason;
  }> = [];

  for (let i = 0; i < matched.length; i++) {
    const m = matched[i];
    const chosen = m.chosen!;
    const frozenSubtotal = chosen.unit_price * m.line.quantity;
    const jobNumber = await generateJobNumber(supabase, customerCode, i);

    // Programming readiness: 'ready' if a prior job already exists for the
    // same BOM (we've programmed this revision before), 'not_ready' for
    // first-time builds. The user can flip to 'not_required' on jobs whose
    // boards have no programming step.
    const programmingStatus = await deriveInitialProgrammingStatus(
      supabase,
      chosen.quote.bom_id
    );

    // Customer-promised due date: anchor to the PO date and add the
    // matching tier's lead time. Independent of scheduled_completion
    // (production target). Admin can override later for rush orders.
    const tiersForDue = chosen.quote.pricing?.tiers ?? [];
    const dueTierIdx = tiersForDue.findIndex(
      (t) => t.board_qty === chosen.tier_qty
    );
    const computedDueDate =
      dueTierIdx >= 0
        ? computeDueDate({
            leadTimes: chosen.quote.lead_times,
            tierIndex: dueTierIdx,
            baseDate: body.po_date,
          })
        : null;

    const { data: job, error } = await supabase
      .from("jobs")
      .insert({
        job_number: jobNumber,
        quote_id: chosen.quote.id,
        customer_id: chosen.quote.customer_id,
        gmp_id: chosen.quote.gmp_id,
        bom_id: chosen.quote.bom_id,
        quantity: m.line.quantity,
        status: "created",
        programming_status: programmingStatus,
        po_number: body.po_number,
        po_date: body.po_date,
        po_unit_price: m.line.po_unit_price ?? null,
        notes: body.notes ?? null,
        due_date: computedDueDate,
        source_quote_id: chosen.quote.id,
        source_tier_qty: chosen.tier_qty,
        frozen_unit_price: chosen.unit_price,
        frozen_subtotal: frozenSubtotal,
        price_match_reason: chosen.match_reason,
        nre_charge_cad: m.line.nre_charge_cad ?? null,
        nre_included_on_po: m.line.nre_included_on_po ?? false,
        procurement_id: null,
        created_by: user.id,
      })
      .select("id, job_number")
      .single();

    if (error) {
      // Best-effort rollback of any jobs created so far in this batch.
      if (createdJobs.length) {
        await supabase
          .from("jobs")
          .delete()
          .in(
            "id",
            createdJobs.map((j) => j.id)
          );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.from("job_status_log").insert({
      job_id: job.id,
      old_status: null,
      new_status: "created",
      changed_by: user.id,
    });

    createdJobs.push({
      id: job.id,
      job_number: job.job_number,
      matched_quote_number: chosen.quote_number,
      source_tier_qty: chosen.tier_qty,
      frozen_unit_price: chosen.unit_price,
      frozen_subtotal: frozenSubtotal,
      price_match_reason: chosen.match_reason,
    });
  }

  // Legacy single-line response shape preserved.
  if (legacy) {
    const j = createdJobs[0];
    return NextResponse.json({
      job_id: j.id,
      job_number: j.job_number,
      matched_quote_number: j.matched_quote_number,
      source_tier_qty: j.source_tier_qty,
      frozen_unit_price: j.frozen_unit_price,
      frozen_subtotal: j.frozen_subtotal,
      price_match_reason: j.price_match_reason,
    });
  }

  return NextResponse.json({ jobs: createdJobs });
}
