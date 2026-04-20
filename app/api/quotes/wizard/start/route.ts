import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// POST /api/quotes/wizard/start — body: { bom_id }
//
// Creates a DRAFT quote row (wizard_status = 'draft') and returns its id +
// auto-generated quote_number. All subsequent wizard steps save against that
// quote_id, so refresh / close-and-resume doesn't lose progress.
//
// Quote-number rule (per Anas, 2026-04-20):
//   - If the GMP has NEVER been quoted → <CUSTOMER_CODE><4-digit-seq>
//     e.g. TLAN0001. The sequence increments across all distinct GMPs that
//     customer has been quoted for.
//   - If the GMP already has at least one quote → take the BASE number from
//     the oldest existing quote (strip any R<N> suffix) and append R<N+1>.
//     e.g. TLAN0001 → TLAN0001R1 → TLAN0001R2.
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEQ_PAD = 4;

/** Strip any trailing R<digits> from a quote number. */
function baseQuoteNumber(qn: string): string {
  return qn.replace(/R\d+$/i, "");
}

/** Zero-pad an integer sequence to SEQ_PAD digits. */
function padSeq(n: number): string {
  return String(n).padStart(SEQ_PAD, "0");
}

export async function POST(req: Request) {
  let body: { bom_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const bomId = typeof body.bom_id === "string" ? body.bom_id : "";
  if (!UUID_RE.test(bomId)) {
    return NextResponse.json({ error: "bom_id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if (!profile || (profile.role !== "ceo" && profile.role !== "operations_manager")) {
    return NextResponse.json({ error: "CEO or operations manager role required" }, { status: 403 });
  }

  // --- Resolve BOM + customer ---
  const { data: bom, error: bomErr } = await supabase
    .from("boms")
    .select("id, customer_id, gmp_id, customers(code)")
    .eq("id", bomId)
    .maybeSingle();
  if (bomErr || !bom) {
    return NextResponse.json({ error: "BOM not found" }, { status: 404 });
  }
  const customerCode = (bom.customers as { code?: string } | null)?.code;
  if (!customerCode) {
    return NextResponse.json({ error: "Customer missing code abbreviation" }, { status: 400 });
  }

  // --- Does this GMP already have any quote? ---
  const { data: sameGmpQuotes } = await supabase
    .from("quotes")
    .select("id, quote_number, created_at")
    .eq("gmp_id", bom.gmp_id)
    .order("created_at", { ascending: true });

  let quoteNumber: string;

  if (!sameGmpQuotes || sameGmpQuotes.length === 0) {
    // ---- First quote for this GMP → fresh sequence number ----
    // Walk every existing quote for the customer, parse the "base" number
    // (stripping R-suffix), and find the max sequence integer. Next is max+1.
    const { data: customerQuotes } = await supabase
      .from("quotes")
      .select("quote_number")
      .eq("customer_id", bom.customer_id);
    const codeRe = new RegExp(`^${escapeRegex(customerCode)}(\\d+)(?:R\\d+)?$`, "i");
    let maxSeq = 0;
    for (const q of customerQuotes ?? []) {
      const match = q.quote_number.match(codeRe);
      if (!match) continue;
      const n = parseInt(match[1], 10);
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    }
    quoteNumber = `${customerCode}${padSeq(maxSeq + 1)}`;
  } else {
    // ---- GMP already quoted → append the next R suffix ----
    // The oldest quote for this GMP (ascending by created_at) holds the
    // authoritative base. Count the existing Rs and add one.
    const base = baseQuoteNumber(sameGmpQuotes[0].quote_number);
    const rRe = new RegExp(`^${escapeRegex(base)}R(\\d+)$`, "i");
    let maxR = 0;
    for (const q of sameGmpQuotes) {
      const m = q.quote_number.match(rRe);
      if (!m) continue;
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxR) maxR = n;
    }
    quoteNumber = `${base}R${maxR + 1}`;
  }

  // --- Insert the draft. Unique constraint on quote_number will catch the
  //     rare race where two wizards start at the same millisecond. ---
  const { data: inserted, error: insertErr } = await supabase
    .from("quotes")
    .insert({
      quote_number: quoteNumber,
      customer_id: bom.customer_id,
      gmp_id: bom.gmp_id,
      bom_id: bom.id,
      status: "draft",
      wizard_status: "draft",
      quantities: {},          // required NOT NULL JSONB — filled in step 1
      pricing: {},             // filled in step 3
      created_by: user.id,
    })
    .select("id, quote_number")
    .single();

  if (insertErr || !inserted) {
    // If it was a race on quote_number, tell the caller to retry.
    const isDuplicate = insertErr?.code === "23505";
    return NextResponse.json(
      {
        error: isDuplicate
          ? "Quote number collision — refresh and retry."
          : "Failed to create draft quote",
        details: insertErr?.message,
      },
      { status: isDuplicate ? 409 : 500 }
    );
  }

  return NextResponse.json({
    quote_id: inserted.id,
    quote_number: inserted.quote_number,
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
