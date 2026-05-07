import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import { getJobInvoiceTotals } from "@/lib/invoices/totals";
import { todayMontreal, addDaysMontreal, addDaysToDate, montrealInvoiceNumber } from "@/lib/utils/format";
import { computeTaxes, type TaxRegion } from "@/lib/tax/regions";
import { resolveFxRate } from "@/lib/fx/boc";
import {
  taxRegionForAddress,
  currencyForAddress,
  normalizeCountry,
} from "@/lib/address/regions";

// ---------------------------------------------------------------------------
// Invoices API — multi-job, partial-billing aware (after migration 100).
//
// Shape:
//   invoices       : the invoice header (one customer, taxes, totals, status)
//   invoice_lines  : one row per job covered, with its quantity + unit_price
//
// Validation:
//   - lines non-empty; every line.job_id belongs to the supplied customer_id
//   - per-job over-invoice guard:
//       SUM(existing invoice_lines.quantity for that job, excl. cancelled)
//         + proposed.quantity  ≤  jobs.quantity
//   - if shipment_line_id is supplied, it must point to a shipment_line whose
//     job_id matches the line's job_id
//
// Auto-status cascade (per linked job):
//   delivered → invoiced when the job is fully invoiced
//   invoiced  → delivered when no longer fully invoiced (e.g. invoice deleted
//              or a line shrunk)
//
// Mark-paid does NOT cascade — see [id]/route.ts PATCH for the explanation.
// ---------------------------------------------------------------------------

// ===========================================================================
// Types
// ===========================================================================
interface LineInput {
  job_id: string;
  quantity: number;
  unit_price?: number;
  description?: string;
  shipment_line_id?: string | null;
}

interface CreateInvoiceBody {
  customer_id?: string;
  lines?: LineInput[];
  freight?: number;
  discount?: number;
  notes?: string;
  // Backdated invoicing — admin-only override for issue date / due date.
  // When `issued_date` is supplied, FX (USD invoices) is fetched for that
  // date instead of "today", and the invoice number's date prefix matches.
  // `due_date` is auto-derived from issued_date + payment_terms when not
  // supplied. `backdate_reason` is appended to notes for the audit trail.
  issued_date?: string;
  due_date?: string;
  backdate_reason?: string;
  // Legacy back-compat:
  job_id?: string;
  job_ids?: string[];
}

// Validate a YYYY-MM-DD calendar string. Used to gate backdated issue
// dates — they must be a real date and not in the future.
function validateBackdatedIsoDate(
  s: string
): { ok: true } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { ok: false, error: `Date "${s}" is not in YYYY-MM-DD format` };
  }
  const [y, m, d] = s.split("-").map(Number);
  const stamp = new Date(Date.UTC(y, m - 1, d));
  if (
    stamp.getUTCFullYear() !== y ||
    stamp.getUTCMonth() !== m - 1 ||
    stamp.getUTCDate() !== d
  ) {
    return { ok: false, error: `Date "${s}" is not a real calendar date` };
  }
  // No future-dating — allow today (Montreal) but nothing beyond.
  if (s > todayMontreal()) {
    return {
      ok: false,
      error: `Issue date "${s}" cannot be in the future (today is ${todayMontreal()})`,
    };
  }
  return { ok: true };
}

interface JobWithQuote {
  id: string;
  job_number: string;
  quantity: number;
  customer_id: string;
  gmp_id: string;
  nre_invoiced?: boolean;
  gmps: { gmp_number: string; board_name: string | null } | null;
  quotes: {
    pricing: {
      tiers?: {
        board_qty: number;
        subtotal: number;
        per_unit?: number;
        nre_charge?: number;
      }[];
    };
    quantities: Record<string, number>;
  } | null;
}

const INVOICE_LINE_EMBED =
  "*, customers(code, company_name, contact_name), invoice_lines(*, jobs(id, job_number, quantity, gmps(gmp_number, board_name)))";

// Tier resolution. Exact match wins; otherwise pick the highest tier whose
// board_qty ≤ job.quantity (price-break model — a 60-board order falls into
// the 50-tier, a 120-board order into the 100-tier). When the job is below
// every tier (e.g., 30 boards on a 50/100/150 quote) we fall back to the
// smallest tier — that's the most expensive per-unit and the safest default.
function matchedTier(job: JobWithQuote) {
  const tiers = job.quotes?.pricing?.tiers;
  if (!tiers?.length) return null;
  const exact = tiers.find((t) => t.board_qty === job.quantity);
  if (exact) return exact;
  const sorted = [...tiers].sort((a, b) => a.board_qty - b.board_qty);
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].board_qty <= job.quantity) return sorted[i];
  }
  return sorted[0];
}

// Per-board unit price = the tier's quoted per_unit AS-IS (the customer-
// facing rate Anas wrote into the quote — NRE is billed as a separate line
// IN ADDITION to this, not subtracted from it). When per_unit isn't stored,
// derive subtotal/board_qty.
function getJobPerUnit(job: JobWithQuote, qty: number): number {
  const matched = matchedTier(job);
  if (!matched) return 0;
  if (matched.per_unit != null) return Number(matched.per_unit);
  const subtotal = Number(matched.subtotal ?? 0);
  if (matched.board_qty > 0) return subtotal / matched.board_qty;
  return qty > 0 ? subtotal / qty : 0;
}

// Total NRE owed for this job (snapshot from the matched tier on the linked
// quote). Returns 0 when the quote has no NRE or no tiers — auto-add is then
// a no-op.
function getJobNreAmount(job: JobWithQuote): number {
  const matched = matchedTier(job);
  if (!matched) return 0;
  const v = Number(matched.nre_charge ?? 0);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
}

// ===========================================================================
// GET /api/invoices — List invoices (with embedded lines)
// ===========================================================================
export async function GET(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const customerId = url.searchParams.get("customer_id");

  let query = supabase
    .from("invoices")
    .select(INVOICE_LINE_EMBED)
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);
  if (customerId) query = query.eq("customer_id", customerId);

  const { data, error } = await query;

  if (error) {
    console.error("[invoices GET] supabase error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const enriched = (data ?? []).map((inv: { issued_date?: string | null; status?: string | null }) => {
    let days_outstanding: number | null = null;
    if (inv.issued_date && inv.status !== "paid" && inv.status !== "cancelled") {
      const issued = new Date(inv.issued_date).getTime();
      days_outstanding = Math.floor((now - issued) / (1000 * 60 * 60 * 24));
    }
    return { ...inv, days_outstanding };
  });

  return NextResponse.json(enriched);
}

// ===========================================================================
// Helpers
// ===========================================================================

/**
 * Re-evaluate a single job's status based on its current invoice coverage.
 *   Forward: delivered → invoiced when fully invoiced.
 *   Reverse: invoiced  → delivered when no longer fully invoiced.
 *
 * Reads through whichever supabase client we were handed, but writes through
 * the admin client because production-role users have no UPDATE policy on
 * `jobs` and we don't want server-internal cascades silently failing.
 */
async function reevaluateJobInvoiceStatus(
  supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"],
  jobId: string,
  userId: string | null,
  reasonNote: string
): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: job } = await supabase
      .from("jobs")
      .select("status, quantity")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) return;

    const totals = await getJobInvoiceTotals(supabase, jobId);
    const fullyInvoiced =
      totals.jobQuantity > 0 && totals.invoiced >= totals.jobQuantity;

    if (fullyInvoiced && job.status === "delivered") {
      const { error } = await admin
        .from("jobs")
        .update({ status: "invoiced", updated_at: new Date().toISOString() })
        .eq("id", jobId);
      if (error) {
        console.warn("[invoices] advance to invoiced failed", error.message);
        return;
      }
      await admin.from("job_status_log").insert({
        job_id: jobId,
        field: "status",
        old_status: "delivered",
        new_status: "invoiced",
        changed_by: userId,
        notes: reasonNote,
      });
      return;
    }

    if (!fullyInvoiced && job.status === "invoiced") {
      const { error } = await admin
        .from("jobs")
        .update({ status: "delivered", updated_at: new Date().toISOString() })
        .eq("id", jobId);
      if (error) {
        console.warn("[invoices] revert to delivered failed", error.message);
        return;
      }
      await admin.from("job_status_log").insert({
        job_id: jobId,
        field: "status",
        old_status: "invoiced",
        new_status: "delivered",
        changed_by: userId,
        notes: reasonNote,
      });
    }
  } catch (e) {
    console.warn("[invoices] reevaluateJobInvoiceStatus threw", e);
  }
}

/**
 * Validate proposed lines against jobs + existing invoice coverage.
 *   - non-empty array of {job_id, quantity}, integer qty > 0
 *   - all jobs belong to customerId
 *   - shipment_line_id (when provided) must reference a shipment_line on the
 *     same job_id
 *   - SUM(existing.quantity for non-cancelled) + proposed ≤ jobs.quantity
 *
 * `excludeInvoiceId` is used during PATCH so we don't double-count the lines
 * we're about to replace.
 */
async function validateInvoiceLines(
  supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"],
  customerId: string,
  lines: LineInput[],
  excludeInvoiceId: string | null = null
): Promise<{ ok: true; jobs: JobWithQuote[] } | { ok: false; status: number; error: string }> {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { ok: false, status: 400, error: "lines must be a non-empty array" };
  }
  for (const l of lines) {
    if (!l.job_id) {
      return { ok: false, status: 400, error: "Every line requires job_id" };
    }
    const q = Number(l.quantity);
    if (!Number.isFinite(q) || !Number.isInteger(q) || q <= 0) {
      return {
        ok: false,
        status: 400,
        error: `Line quantity for job ${l.job_id} must be a positive integer`,
      };
    }
    if (l.unit_price !== undefined) {
      const u = Number(l.unit_price);
      if (!Number.isFinite(u) || u < 0) {
        return {
          ok: false,
          status: 400,
          error: `Line unit_price for job ${l.job_id} must be non-negative`,
        };
      }
    }
  }

  const jobIds = Array.from(new Set(lines.map((l) => l.job_id)));
  // Pull jobs with quote pricing — needed to derive per-unit when the caller
  // doesn't supply unit_price explicitly. Also pull nre_invoiced so the
  // NRE auto-add step can decide whether to append a synthetic NRE line.
  // jobs has two FKs to quotes (quote_id, source_quote_id) — disambiguate.
  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select(
      "id, job_number, quantity, customer_id, gmp_id, nre_invoiced, gmps(gmp_number, board_name), quotes!jobs_quote_id_fkey(pricing, quantities)"
    )
    .in("id", jobIds);

  if (jobsErr) return { ok: false, status: 500, error: jobsErr.message };
  if (!jobs || jobs.length === 0) {
    return { ok: false, status: 404, error: "No valid jobs found" };
  }

  const typedJobs = jobs as unknown as JobWithQuote[];
  const jobMap = new Map(typedJobs.map((j) => [j.id, j]));

  for (const id of jobIds) {
    if (!jobMap.has(id)) {
      return { ok: false, status: 400, error: `Job ${id} not found` };
    }
    const j = jobMap.get(id)!;
    if (j.customer_id !== customerId) {
      return {
        ok: false,
        status: 400,
        error: `Job ${j.job_number} does not belong to customer ${customerId}`,
      };
    }
  }

  // Validate any shipment_line_id references.
  const shipmentLineIds = lines
    .map((l) => l.shipment_line_id)
    .filter((x): x is string => typeof x === "string" && x.length > 0);
  if (shipmentLineIds.length > 0) {
    const { data: shipLines, error: shipErr } = await supabase
      .from("shipment_lines")
      .select("id, job_id")
      .in("id", shipmentLineIds);
    if (shipErr) return { ok: false, status: 500, error: shipErr.message };
    const shipMap = new Map((shipLines ?? []).map((s) => [s.id, s]));
    for (const l of lines) {
      if (!l.shipment_line_id) continue;
      const sl = shipMap.get(l.shipment_line_id);
      if (!sl) {
        return {
          ok: false,
          status: 400,
          error: `shipment_line ${l.shipment_line_id} not found`,
        };
      }
      if (sl.job_id !== l.job_id) {
        return {
          ok: false,
          status: 400,
          error: `shipment_line ${l.shipment_line_id} does not belong to job ${l.job_id}`,
        };
      }
    }
  }

  // Aggregate proposed per job, then check per-job over-invoice.
  const proposedByJob = new Map<string, number>();
  for (const l of lines) {
    proposedByJob.set(l.job_id, (proposedByJob.get(l.job_id) ?? 0) + Number(l.quantity));
  }

  for (const [jobId, proposed] of proposedByJob.entries()) {
    // NRE lines (is_nre=true) carry qty=1 but represent an engineering
    // charge, not a board — they MUST be excluded from the per-job
    // board-quantity guard or the second invoice for a partially-shipped
    // job would always trip it.
    let existingQuery = supabase
      .from("invoice_lines")
      .select("quantity, invoice_id, is_nre, invoices!inner(status)")
      .eq("job_id", jobId)
      .eq("is_nre", false);
    if (excludeInvoiceId) {
      existingQuery = existingQuery.neq("invoice_id", excludeInvoiceId);
    }
    const { data: existing, error: existErr } = await existingQuery;
    if (existErr) return { ok: false, status: 500, error: existErr.message };

    const existingTotal = (existing ?? []).reduce(
      (
        acc: number,
        r: {
          quantity: number | null;
          invoices: { status?: string | null } | { status?: string | null }[] | null;
        }
      ) => {
        const inv = Array.isArray(r.invoices) ? r.invoices[0] : r.invoices;
        if (inv?.status === "cancelled") return acc;
        const q = Number(r.quantity ?? 0);
        return acc + (Number.isFinite(q) ? q : 0);
      },
      0
    );

    const job = jobMap.get(jobId)!;
    const total = existingTotal + proposed;
    if (total > job.quantity) {
      const over = total - job.quantity;
      return {
        ok: false,
        status: 400,
        error: `Job ${job.job_number}: invoice qty ${proposed} would exceed job quantity by ${over}. Job total ${job.quantity}, already invoiced ${existingTotal}.`,
      };
    }
  }

  return { ok: true, jobs: typedJobs };
}

/**
 * Build the persistable line rows from validated input, deriving unit_price
 * from quote pricing when not explicitly provided. Returns:
 *   - rows : ready to .insert into invoice_lines (no invoice_id yet)
 *   - subtotal : sum of line_total (already rounded to cents)
 */
type PersistedLine = {
  job_id: string;
  shipment_line_id: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  description: string | null;
  is_nre: boolean;
};

function buildLineRows(
  lines: LineInput[],
  jobs: JobWithQuote[]
): {
  rows: PersistedLine[];
  subtotal: number;
} {
  const jobMap = new Map(jobs.map((j) => [j.id, j]));
  const rows: PersistedLine[] = lines.map((l) => {
    const job = jobMap.get(l.job_id)!;
    const unitPrice =
      l.unit_price !== undefined ? Number(l.unit_price) : getJobPerUnit(job, l.quantity);
    const qty = Number(l.quantity);
    const lineTotal = Math.round(unitPrice * qty * 100) / 100;
    return {
      job_id: l.job_id,
      shipment_line_id: l.shipment_line_id ?? null,
      quantity: qty,
      unit_price: Math.round(unitPrice * 10000) / 10000,
      line_total: lineTotal,
      description: l.description ?? "PCB Assembly",
      is_nre: false,
    };
  });
  const subtotal = Math.round(rows.reduce((s, r) => s + r.line_total, 0) * 100) / 100;
  return { rows, subtotal };
}

/**
 * For each unique job on the new invoice, append a synthetic NRE line
 * (qty=1, unit_price=tier.nre_charge) IF:
 *   - the job has a non-zero NRE on its matched quote tier, AND
 *   - jobs.nre_invoiced is FALSE (no live NRE billed elsewhere yet).
 *
 * Returns the augmented row list, recomputed subtotal, and the set of jobs
 * we just added an NRE line for — the caller flips jobs.nre_invoiced=TRUE
 * for those after the lines insert succeeds.
 *
 * The freshness check uses both the cached jobs.nre_invoiced flag AND a
 * defensive direct lookup against invoice_lines (excluding the current
 * invoice on PATCH) so a stale flag never causes a missed or duplicated
 * NRE line.
 */
async function appendNreLines(
  supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"],
  jobs: JobWithQuote[],
  rows: PersistedLine[],
  excludeInvoiceId: string | null = null
): Promise<{ rows: PersistedLine[]; subtotal: number; nreJobIds: string[] }> {
  const jobIdsOnInvoice = Array.from(new Set(rows.map((r) => r.job_id)));
  if (jobIdsOnInvoice.length === 0) {
    const subtotal = Math.round(rows.reduce((s, r) => s + r.line_total, 0) * 100) / 100;
    return { rows, subtotal, nreJobIds: [] };
  }

  // Defensive freshness check — what jobs already have a live NRE line
  // somewhere (excluding the invoice we're rebuilding, if any)?
  let q = supabase
    .from("invoice_lines")
    .select("job_id, invoices!inner(status)")
    .eq("is_nre", true)
    .in("job_id", jobIdsOnInvoice);
  if (excludeInvoiceId) q = q.neq("invoice_id", excludeInvoiceId);
  const { data: liveNre } = await q;
  const alreadyBilled = new Set(
    ((liveNre ?? []) as Array<{
      job_id: string;
      invoices: { status?: string | null } | { status?: string | null }[] | null;
    }>)
      .filter((r) => {
        const inv = Array.isArray(r.invoices) ? r.invoices[0] : r.invoices;
        return inv?.status !== "cancelled";
      })
      .map((r) => r.job_id)
  );

  const jobMap = new Map(jobs.map((j) => [j.id, j]));
  const newRows = [...rows];
  const nreJobIds: string[] = [];

  for (const jobId of jobIdsOnInvoice) {
    if (alreadyBilled.has(jobId)) continue;
    const job = jobMap.get(jobId);
    if (!job) continue;
    const nre = getJobNreAmount(job);
    if (nre <= 0) continue;

    newRows.push({
      job_id: jobId,
      shipment_line_id: null,
      quantity: 1,
      unit_price: nre,
      line_total: nre,
      description: "NRC",
      is_nre: true,
    });
    nreJobIds.push(jobId);
  }

  const subtotal = Math.round(newRows.reduce((s, r) => s + r.line_total, 0) * 100) / 100;
  return { rows: newRows, subtotal, nreJobIds };
}

/**
 * Re-derive jobs.nre_invoiced from the current state of invoice_lines.
 * Called after invoice cancel / delete / line-replacement so the cached flag
 * reflects whether any live (non-cancelled) is_nre line still exists for the
 * job.
 */
async function reevaluateJobNreInvoiced(jobIds: string[]): Promise<void> {
  if (jobIds.length === 0) return;
  const admin = createAdminClient();

  const { data: liveNre } = await admin
    .from("invoice_lines")
    .select("job_id, invoices!inner(status)")
    .eq("is_nre", true)
    .in("job_id", jobIds);

  const stillBilled = new Set(
    ((liveNre ?? []) as Array<{
      job_id: string;
      invoices: { status?: string | null } | { status?: string | null }[] | null;
    }>)
      .filter((r) => {
        const inv = Array.isArray(r.invoices) ? r.invoices[0] : r.invoices;
        return inv?.status !== "cancelled";
      })
      .map((r) => r.job_id)
  );

  for (const jobId of jobIds) {
    const desired = stillBilled.has(jobId);
    await admin.from("jobs").update({ nre_invoiced: desired }).eq("id", jobId);
  }
}

// ===========================================================================
// POST /api/invoices — Create an invoice (1..N job lines, partial allowed)
// ===========================================================================
export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminRole(user.role)) {
    return NextResponse.json(
      { error: "Forbidden — only admins can create invoices." },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as CreateInvoiceBody;
  const { freight = 0, discount = 0, notes } = body;

  // Translate legacy shapes to the new lines[] shape.
  // Legacy single-job: { job_id }
  // Legacy multi-job:  { job_ids, customer_id }
  let lines: LineInput[] = Array.isArray(body.lines) ? body.lines : [];
  let customerId = body.customer_id;

  if (lines.length === 0) {
    if (Array.isArray(body.job_ids) && body.job_ids.length > 0) {
      // Legacy multi-job — full-quantity lines for each job.
      const { data: legacyJobs } = await supabase
        .from("jobs")
        .select("id, customer_id, quantity")
        .in("id", body.job_ids);
      lines = (legacyJobs ?? []).map((j) => ({
        job_id: j.id,
        quantity: Number(j.quantity ?? 0),
      }));
      if (!customerId && legacyJobs && legacyJobs.length > 0) {
        customerId = legacyJobs[0].customer_id;
      }
    } else if (body.job_id) {
      // Legacy single-job — full-quantity line.
      const { data: legacyJob } = await supabase
        .from("jobs")
        .select("id, customer_id, quantity")
        .eq("id", body.job_id)
        .maybeSingle();
      if (legacyJob) {
        lines = [{ job_id: legacyJob.id, quantity: Number(legacyJob.quantity ?? 0) }];
        customerId = customerId ?? legacyJob.customer_id;
      }
    }
  }

  if (lines.length === 0) {
    return NextResponse.json(
      { error: "Missing required field: lines (or legacy job_id / job_ids)" },
      { status: 400 }
    );
  }
  if (!customerId) {
    return NextResponse.json(
      { error: "Missing required field: customer_id" },
      { status: 400 }
    );
  }

  const validation = await validateInvoiceLines(supabase, customerId, lines);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }
  const jobs = validation.jobs;

  // Build board lines, then append a synthetic NRE line for every job on
  // this invoice that hasn't already had NRE billed elsewhere. NRE bills in
  // full on the FIRST shipment of a board — partial shipments after that
  // are board-only.
  const built = buildLineRows(lines, jobs);
  const { rows: lineRows, subtotal, nreJobIds } = await appendNreLines(
    supabase,
    jobs,
    built.rows,
    null
  );
  void built.subtotal;

  // Pull customer config — payment terms drive due_date, billing addresses
  // drive tax math + currency. tax_region / default_currency on the customer
  // are LEGACY fallbacks (kept for invoices created before any billing
  // address exists).
  const { data: customer } = await supabase
    .from("customers")
    .select(
      "payment_terms, tax_region, default_currency, billing_addresses"
    )
    .eq("id", customerId)
    .single();
  const paymentTerms = customer?.payment_terms ?? "Net 30";
  const netDaysMatch = paymentTerms.match(/\d+/);
  const netDays = netDaysMatch ? parseInt(netDaysMatch[0], 10) : 30;

  // ── Resolve billing address ──
  // Caller may pass billing_address_label OR billing_address (full object).
  // Otherwise we pick the address marked is_default, falling back to the
  // first entry. If the customer has no billing addresses at all, we fall
  // back to the legacy customer-level fields.
  type BillingAddr = {
    label?: string;
    street?: string;
    city?: string;
    province?: string;
    postal_code?: string;
    country?: string;
    country_code?: "CA" | "US" | "OTHER";
    is_default?: boolean;
  };
  const billingAddresses =
    (customer?.billing_addresses as BillingAddr[] | null) ?? [];
  const requestedLabel = (body as { billing_address_label?: string })
    .billing_address_label;
  const requestedAddr = (body as { billing_address?: BillingAddr })
    .billing_address;

  let resolvedAddr: BillingAddr | null = null;
  if (requestedAddr && typeof requestedAddr === "object") {
    resolvedAddr = requestedAddr;
  } else if (requestedLabel) {
    resolvedAddr =
      billingAddresses.find((a) => a.label === requestedLabel) ?? null;
  }
  if (!resolvedAddr) {
    resolvedAddr =
      billingAddresses.find((a) => a.is_default) ??
      billingAddresses[0] ??
      null;
  }

  // Snapshot tax_region + currency. Address takes precedence; legacy
  // customer-level columns are the fallback when no address exists yet.
  let taxRegion: TaxRegion;
  let currency: "CAD" | "USD";
  if (resolvedAddr) {
    taxRegion = taxRegionForAddress({
      country_code: resolvedAddr.country_code,
      country: resolvedAddr.country,
      province: resolvedAddr.province,
    });
    currency = currencyForAddress({
      country_code: resolvedAddr.country_code,
      country: resolvedAddr.country,
    });
  } else {
    taxRegion = ((customer?.tax_region as TaxRegion) ?? "QC") as TaxRegion;
    currency = ((customer?.default_currency as "CAD" | "USD") ?? "CAD") as
      | "CAD"
      | "USD";
  }

  // Normalize the snapshot we'll persist so legacy rows without
  // country_code still get one when the invoice is created.
  const billingSnapshot: BillingAddr | null = resolvedAddr
    ? {
        ...resolvedAddr,
        country_code:
          resolvedAddr.country_code ??
          normalizeCountry(resolvedAddr.country ?? ""),
      }
    : null;

  // Taxes — computed on subtotal (before freight, after discount) using the
  // region's rate table. INTERNATIONAL → all zeros. QC → GST + QST. HST_*
  // → HST only. CA_OTHER → GST only.
  const taxableBase = Math.max(0, subtotal - discount);
  const tax = computeTaxes(taxableBase, taxRegion);
  const total =
    Math.round(
      (subtotal + tax.gst + tax.qst + tax.hst + freight - discount) * 100
    ) / 100;

  // ── Backdating: admin can override issue date (and optionally due date).
  // Validated up front so we fail fast before touching FX / inserts.
  let issuedDate = todayMontreal();
  let dueDate = addDaysMontreal(netDays);
  let backdateNote: string | null = null;

  if (body.issued_date) {
    const v = validateBackdatedIsoDate(body.issued_date);
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }
    issuedDate = body.issued_date;
    // due date follows issue date unless explicitly overridden too.
    dueDate = addDaysToDate(issuedDate, netDays);
    if (issuedDate !== todayMontreal()) {
      const reason = (body.backdate_reason ?? "").trim();
      // Stamp the human-readable name (not the UUID) into notes so the
      // invoice page is legible without a join. Fall back to the id only
      // when we genuinely can't resolve a profile.
      const { data: actor } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const actorLabel = actor?.full_name ?? user.id;
      backdateNote = `[BACKDATED to ${issuedDate} on ${todayMontreal()} by ${actorLabel}${reason ? ` — reason: ${reason}` : ""}]`;
    }
  }
  if (body.due_date) {
    const v = validateBackdatedIsoDate(body.due_date);
    // due_date can be in the future (it usually is); only the format /
    // calendar checks apply, not the no-future rule. Re-validate with a
    // looser pass.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) {
      return NextResponse.json(
        { error: `Due date "${body.due_date}" is not in YYYY-MM-DD format` },
        { status: 400 }
      );
    }
    void v; // calendar+future check above already ran for issue date.
    dueDate = body.due_date;
  }

  // FX rate snapshot — fetched live from Bank of Canada for USD invoices.
  // For backdated invoices we look up the rate AS OF the issue date so the
  // CAD-equivalent and downstream FX-delta math reflect what the rate
  // actually was that day, not "right now."
  let previousRate: number | null = null;
  if (currency === "USD") {
    const { data: prev } = await supabase
      .from("invoices")
      .select("fx_rate_to_cad")
      .eq("customer_id", customerId)
      .eq("currency", "USD")
      .order("issued_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    previousRate = prev?.fx_rate_to_cad ? Number(prev.fx_rate_to_cad) : null;
  }
  const fx = await resolveFxRate(currency, previousRate, issuedDate);

  // Generate invoice number: 14-digit YYYYMMDDHHMMSS in Montreal local
  // time. The date portion uses `issuedDate` so a backdated invoice gets
  // a number whose prefix matches the document date. Time portion always
  // uses NOW so the number stays unique even when two backdated invoices
  // are issued for the same calendar day.
  const baseNumber = montrealInvoiceNumber(issuedDate);
  let invoiceNumber = baseNumber;
  for (let collisionSuffix = 1; collisionSuffix < 100; collisionSuffix++) {
    const { count: dupCount } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("invoice_number", invoiceNumber);
    if (!dupCount) break;
    invoiceNumber = `${baseNumber}-${collisionSuffix}`;
  }

  // Stamp the backdate marker into notes so the audit trail (already
  // captured by audit_log triggers) and the human-readable invoice page
  // both show why this invoice's issue date isn't its created_at date.
  const finalNotes = backdateNote
    ? notes
      ? `${backdateNote}\n${notes}`
      : backdateNote
    : notes ?? null;

  // invoices.job_id is NOT NULL; pin it to the first line's job for back-compat.
  const primaryJobId = lineRows[0].job_id;

  const { data: invoice, error: insertError } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      job_id: primaryJobId,
      customer_id: customerId,
      subtotal,
      discount,
      tps_gst: tax.gst,
      tvq_qst: tax.qst,
      hst: tax.hst,
      freight,
      total,
      status: "draft",
      issued_date: issuedDate,
      due_date: dueDate,
      notes: finalNotes,
      currency,
      fx_rate_to_cad: fx.rate,
      tax_region: taxRegion,
      billing_address: billingSnapshot,
    })
    .select("*")
    .single();

  if (insertError || !invoice) {
    return NextResponse.json(
      { error: "Failed to create invoice", details: insertError?.message },
      { status: 500 }
    );
  }

  // Insert lines. If any fail, roll back the invoice (best-effort — Supabase
  // JS doesn't expose real client transactions).
  const linesPayload = lineRows.map((r) => ({ ...r, invoice_id: invoice.id }));
  const { error: linesErr } = await supabase.from("invoice_lines").insert(linesPayload);
  if (linesErr) {
    await supabase.from("invoices").delete().eq("id", invoice.id);
    return NextResponse.json(
      { error: `Failed to insert invoice lines: ${linesErr.message}` },
      { status: 500 }
    );
  }

  // Cascade job status for every job touched.
  const uniqueJobIds = Array.from(new Set(lineRows.map((r) => r.job_id)));
  for (const jobId of uniqueJobIds) {
    await reevaluateJobInvoiceStatus(
      supabase,
      jobId,
      user.id,
      `Invoice ${invoiceNumber} created`
    );
  }

  // Flip the cached nre_invoiced flag for every job whose NRE we just billed.
  // Done through admin client because production-role users have no UPDATE
  // policy on jobs and we don't want the cascade silently failing.
  if (nreJobIds.length > 0) {
    const admin = createAdminClient();
    await admin
      .from("jobs")
      .update({ nre_invoiced: true, updated_at: new Date().toISOString() })
      .in("id", nreJobIds);
  }

  // Refetch with the standard embed shape.
  const { data: full } = await supabase
    .from("invoices")
    .select(INVOICE_LINE_EMBED)
    .eq("id", invoice.id)
    .single();

  return NextResponse.json(full ?? invoice, { status: 201 });
}

// ===========================================================================
// PATCH /api/invoices — Update invoice fields and/or replace lines
// ===========================================================================
export async function PATCH(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminRole(user.role)) {
    return NextResponse.json(
      { error: "Forbidden — only admins can modify invoices." },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    lines?: LineInput[];
    freight?: number;
    discount?: number;
    notes?: string;
    status?: string;
    paid_date?: string | null;
    payment_method?: string | null;
    issued_date?: string;
    due_date?: string;
    backdate_reason?: string;
    fx_rate_to_cad?: number;
  } & Record<string, unknown>;

  const { id, lines } = body;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { data: existing, error: existErr } = await supabase
    .from("invoices")
    .select(
      "id, customer_id, status, invoice_number, tax_region, currency, issued_date, notes"
    )
    .eq("id", id)
    .maybeSingle();
  if (existErr) {
    return NextResponse.json({ error: existErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // Capture every job that's being touched (prior + new) so we can cascade.
  const { data: priorLines } = await supabase
    .from("invoice_lines")
    .select("job_id")
    .eq("invoice_id", id);
  const priorJobIds = new Set((priorLines ?? []).map((l) => l.job_id));

  // Decide which scalar invoice fields to update.
  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) {
    updates.status = body.status;
    // Auto-set paid_date when marking as paid (if not explicitly provided).
    if (body.status === "paid" && body.paid_date === undefined) {
      updates.paid_date = todayMontreal();
    }
  }
  if (body.paid_date !== undefined) updates.paid_date = body.paid_date;
  if (body.payment_method !== undefined) updates.payment_method = body.payment_method;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.freight !== undefined) updates.freight = body.freight;
  if (body.discount !== undefined) updates.discount = body.discount;

  // ── Backdate corrections ──
  // Issue/due-date overrides on an existing invoice. Same validation as
  // POST: issue_date can't be in the future; due_date is format-only.
  // When issue_date changes for a USD invoice and the caller didn't supply
  // a fx_rate_to_cad explicitly, we re-snapshot FX for the new date so
  // CAD-equivalent math stays honest.
  if (body.issued_date !== undefined) {
    const v = validateBackdatedIsoDate(body.issued_date);
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }
    updates.issued_date = body.issued_date;
  }
  if (body.due_date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) {
      return NextResponse.json(
        { error: `Due date "${body.due_date}" is not in YYYY-MM-DD format` },
        { status: 400 }
      );
    }
    updates.due_date = body.due_date;
  }
  if (body.fx_rate_to_cad !== undefined) {
    const r = Number(body.fx_rate_to_cad);
    if (!Number.isFinite(r) || r <= 0) {
      return NextResponse.json(
        { error: "fx_rate_to_cad must be a positive number" },
        { status: 400 }
      );
    }
    updates.fx_rate_to_cad = r;
  }
  // Auto re-snapshot FX when the issue date changed on a USD invoice
  // (and the caller didn't already supply a rate override).
  if (
    body.issued_date !== undefined &&
    body.fx_rate_to_cad === undefined &&
    existing.currency === "USD" &&
    body.issued_date !== existing.issued_date
  ) {
    try {
      const fx = await resolveFxRate("USD", null, body.issued_date);
      updates.fx_rate_to_cad = fx.rate;
    } catch (err) {
      console.warn("[invoices PATCH] FX re-snapshot failed", err);
    }
  }
  // Stamp a backdate marker into notes so the change is human-visible
  // (audit_log triggers already capture the row diff). We append; never
  // overwrite existing notes.
  if (
    body.issued_date !== undefined &&
    body.issued_date !== existing.issued_date
  ) {
    const reason = (body.backdate_reason ?? "").trim();
    const { data: actor } = await supabase
      .from("users")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const actorLabel = actor?.full_name ?? user.id;
    const marker = `[BACKDATE EDIT to ${body.issued_date} on ${todayMontreal()} by ${actorLabel}${reason ? ` — reason: ${reason}` : ""}]`;
    const baseNotes =
      typeof updates.notes === "string"
        ? (updates.notes as string)
        : (existing.notes as string | null);
    updates.notes = baseNotes ? `${marker}\n${baseNotes}` : marker;
  }

  // Replace lines if provided. Re-validate with this invoice excluded so we
  // don't trip the over-invoice guard against our own existing lines.
  let lineReplacement: { rows: LineInput[]; jobs: JobWithQuote[] } | null = null;
  if (Array.isArray(lines)) {
    const validation = await validateInvoiceLines(supabase, existing.customer_id, lines, id);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }
    lineReplacement = { rows: lines, jobs: validation.jobs };
  }

  // If we're replacing lines, rebuild totals from the new lines.
  let nreJobIdsForPatch: string[] = [];
  if (lineReplacement) {
    const built = buildLineRows(lineReplacement.rows, lineReplacement.jobs);
    // Re-run NRE auto-add against this rebuilt invoice. excludeInvoiceId=id
    // so the freshness check ignores the lines we're about to wipe.
    const augmented = await appendNreLines(
      supabase,
      lineReplacement.jobs,
      built.rows,
      id
    );
    const newRows = augmented.rows;
    const subtotal = augmented.subtotal;
    nreJobIdsForPatch = augmented.nreJobIds;
    const discount = (updates.discount as number | undefined) ?? 0;
    const freight = (updates.freight as number | undefined) ?? 0;
    const taxableBase = Math.max(0, subtotal - discount);
    // Honor the invoice's snapshotted tax_region — never use a hardcoded
    // QC rule. If a legacy invoice predates the snapshot, the migration
    // default ('QC') is still in place so behaviour is unchanged.
    const region = ((existing.tax_region as TaxRegion) ?? "QC") as TaxRegion;
    const taxR = computeTaxes(taxableBase, region);
    const total =
      Math.round(
        (subtotal + taxR.gst + taxR.qst + taxR.hst + freight - discount) * 100
      ) / 100;

    updates.subtotal = subtotal;
    updates.tps_gst = taxR.gst;
    updates.tvq_qst = taxR.qst;
    updates.hst = taxR.hst;
    updates.total = total;
    updates.job_id = newRows[0].job_id; // keep denormalised pointer in sync

    // Wipe + reinsert.
    const { error: delErr } = await supabase
      .from("invoice_lines")
      .delete()
      .eq("invoice_id", id);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
    const linesPayload = newRows.map((r) => ({ ...r, invoice_id: id }));
    const { error: insErr } = await supabase.from("invoice_lines").insert(linesPayload);
    if (insErr) {
      return NextResponse.json(
        { error: `Failed to replace invoice lines: ${insErr.message}` },
        { status: 500 }
      );
    }
  }

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("invoices")
      .update(updates)
      .eq("id", id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  }

  // Cascade job status for every affected job.
  const newJobIds = new Set((lineReplacement?.rows ?? []).map((l) => l.job_id));
  const allJobIds = new Set<string>([...priorJobIds, ...newJobIds]);
  for (const jobId of allJobIds) {
    await reevaluateJobInvoiceStatus(
      supabase,
      jobId,
      user.id,
      `Invoice ${existing.invoice_number} updated`
    );
  }

  // Re-evaluate NRE state. Flip TRUE for the jobs we just added an NRE
  // line for, then re-derive every other touched job from live state — a
  // line-replacement could have removed an NRE line that was the only live
  // NRE record for a job (e.g., the user manually edited the description).
  if (nreJobIdsForPatch.length > 0) {
    const admin = createAdminClient();
    await admin
      .from("jobs")
      .update({ nre_invoiced: true, updated_at: new Date().toISOString() })
      .in("id", nreJobIdsForPatch);
  }
  const reevalIds = Array.from(allJobIds).filter(
    (j) => !nreJobIdsForPatch.includes(j)
  );
  await reevaluateJobNreInvoiced(reevalIds);

  const { data: full } = await supabase
    .from("invoices")
    .select(INVOICE_LINE_EMBED)
    .eq("id", id)
    .single();

  return NextResponse.json(full);
}
