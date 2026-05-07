import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import {
  SUPPLIER_CURRENCIES,
  type SupplierCurrency,
} from "@/lib/suppliers/types";

// ============================================================================
// /api/proc/[id]/quotes â€” list + create supplier quotes against a PROC.
// ============================================================================

// Lines arrive keyed by cpc â€” the merged BOM aggregates on CPC (the business
// identity at RS). procurement_lines may not yet exist for a fresh PROC, so
// we materialise them on save (procurement_lines now has a `cpc` column from
// migration 081) so supplier_quote_lines can keep its FK to
// procurement_lines.id intact. mpn is optional and stored alongside cpc.
interface IncomingLine {
  cpc: string;
  mpn?: string | null;
  description?: string | null;
  manufacturer?: string | null;
  m_code?: string | null;
  qty: number;
  unit_price: number;
  notes?: string | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// GET /api/proc/[id]/quotes â€” list all quotes for this PROC.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Quotes + supplier display info.
  const { data: quotes, error } = await supabase
    .from("supplier_quotes")
    .select(
      `id, procurement_id, supplier_id, supplier_contact_id, currency, status,
       subtotal, shipping, tax, total, valid_until, notes,
       requested_at, received_at, accepted_at, accepted_by, resulting_po_id,
       created_at, updated_at, created_by,
       suppliers(id, code, legal_name, online_only, default_currency),
       supplier_contacts(id, name, email)`
    )
    .eq("procurement_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach line counts.
  const quoteIds = (quotes ?? []).map((q) => q.id);
  const countByQuote = new Map<string, number>();
  if (quoteIds.length > 0) {
    const { data: lines } = await supabase
      .from("supplier_quote_lines")
      .select("supplier_quote_id")
      .in("supplier_quote_id", quoteIds);
    for (const r of lines ?? []) {
      countByQuote.set(r.supplier_quote_id, (countByQuote.get(r.supplier_quote_id) ?? 0) + 1);
    }
  }

  const enriched = (quotes ?? []).map((q) => ({
    ...q,
    line_count: countByQuote.get(q.id) ?? 0,
  }));

  return NextResponse.json(enriched);
}

// POST /api/proc/[id]/quotes â€” create a draft quote with line items.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: procurementId } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supplierId = body.supplier_id ? String(body.supplier_id) : "";
  const supplierContactId = body.supplier_contact_id
    ? String(body.supplier_contact_id)
    : null;
  const currency = (body.currency as SupplierCurrency) ?? "CAD";
  const validUntil = body.valid_until ? String(body.valid_until) : null;
  const notes = body.notes ? String(body.notes) : null;
  const shipping = round2(Number(body.shipping ?? 0) || 0);
  const tax = round2(Number(body.tax ?? 0) || 0);
  const initialStatus = body.mark_received === true ? "received" : "draft";

  if (!supplierId) {
    return NextResponse.json({ error: "supplier_id is required" }, { status: 400 });
  }
  if (!SUPPLIER_CURRENCIES.includes(currency)) {
    return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
  }

  const lines = Array.isArray(body.lines) ? (body.lines as IncomingLine[]) : [];
  if (lines.length === 0) {
    return NextResponse.json({ error: "At least one line is required" }, { status: 400 });
  }

  // Validate supplier: must be approved AND not online-only.
  const { data: supplier, error: supErr } = await supabase
    .from("suppliers")
    .select("id, is_approved, online_only")
    .eq("id", supplierId)
    .maybeSingle();
  if (supErr) return NextResponse.json({ error: supErr.message }, { status: 500 });
  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }
  if (!supplier.is_approved) {
    return NextResponse.json(
      { error: "Supplier is not approved" },
      { status: 400 }
    );
  }
  if (supplier.online_only) {
    return NextResponse.json(
      {
        error:
          "Online-only suppliers (e.g. DigiKey/Mouser/LCSC) are not part of " +
          "the supplier-quote flow â€” RS buys directly from their websites.",
      },
      { status: 400 }
    );
  }

  // Validate inputs first. CPC is required; MPN is optional (may be null when
  // a BOM never carried an MPN, or when the line tracks a CPC-only spec).
  for (const l of lines) {
    if (!l.cpc || typeof l.cpc !== "string" || !l.cpc.trim()) {
      return NextResponse.json(
        { error: "Each line must include a cpc" },
        { status: 400 }
      );
    }
    const qty = Number(l.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json(
        { error: `qty must be a positive integer (cpc: ${l.cpc})` },
        { status: 400 }
      );
    }
    const unit = Number(l.unit_price);
    if (!Number.isFinite(unit) || unit < 0) {
      return NextResponse.json(
        { error: `unit_price must be >= 0 (cpc: ${l.cpc})` },
        { status: 400 }
      );
    }
  }

  // Materialise procurement_lines for any incoming CPC that doesn't yet have
  // one under this PROC. We match on (procurement_id, cpc) â€” the canonical
  // identity at RS â€” instead of the legacy MPN match. New rows start in
  // `pending` order_status and only flip to `ordered` when a quote is
  // accepted (see /accept). Existing rows are reused as-is.
  const norm = (s: string) => s.trim();
  const incomingCpcs = Array.from(
    new Set(lines.map((l) => norm(l.cpc)))
  );
  const { data: existingPL, error: existingErr } = await supabase
    .from("procurement_lines")
    .select("id, cpc")
    .eq("procurement_id", procurementId)
    .in("cpc", incomingCpcs);
  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }
  const procLineIdByCpc = new Map<string, string>();
  for (const r of (existingPL ?? []) as { id: string; cpc: string | null }[]) {
    if (r.cpc) procLineIdByCpc.set(r.cpc, r.id);
  }

  // Insert any CPC that doesn't have a procurement_line yet. Use the first
  // incoming line for each new CPC to seed descriptive fields and
  // qty_needed; quote_lines.qty remains the authoritative quoted qty.
  const linesByCpc = new Map<string, IncomingLine>();
  for (const l of lines) {
    const k = norm(l.cpc);
    if (!linesByCpc.has(k)) linesByCpc.set(k, l);
  }
  const toCreate: Array<Record<string, unknown>> = [];
  for (const [cpc, src] of linesByCpc.entries()) {
    if (procLineIdByCpc.has(cpc)) continue;
    toCreate.push({
      procurement_id: procurementId,
      cpc,
      mpn: src.mpn ? norm(src.mpn) : null,
      description: src.description ?? null,
      m_code: src.m_code ?? null,
      qty_needed: Math.max(1, Math.floor(Number(src.qty))),
      qty_extra: 0,
      qty_ordered: 0,
      qty_received: 0,
      order_status: "pending",
    });
  }
  if (toCreate.length > 0) {
    const { data: created, error: createErr } = await supabase
      .from("procurement_lines")
      .insert(toCreate)
      .select("id, cpc");
    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 500 });
    }
    for (const r of (created ?? []) as { id: string; cpc: string | null }[]) {
      if (r.cpc) procLineIdByCpc.set(r.cpc, r.id);
    }
  }

  // Compute line totals + subtotal/total in the quote currency.
  const computedLines = lines.map((l) => {
    const qty = Math.max(1, Math.floor(Number(l.qty)));
    const unit = Number(l.unit_price);
    const procLineId = procLineIdByCpc.get(norm(l.cpc));
    if (!procLineId) {
      // Should never happen â€” we just materialised it. Defensive throw.
      throw new Error(`Failed to materialise procurement_line for cpc ${l.cpc}`);
    }
    return {
      procurement_line_id: procLineId,
      qty,
      unit_price: unit,
      line_total: round2(qty * unit),
      notes: l.notes ?? null,
    };
  });
  const subtotal = round2(computedLines.reduce((s, l) => s + l.line_total, 0));
  const total = round2(subtotal + shipping + tax);

  const nowIso = new Date().toISOString();
  const { data: quote, error: insertErr } = await supabase
    .from("supplier_quotes")
    .insert({
      procurement_id: procurementId,
      supplier_id: supplierId,
      supplier_contact_id: supplierContactId,
      currency,
      status: initialStatus,
      subtotal,
      shipping,
      tax,
      total,
      valid_until: validUntil,
      notes,
      requested_at: initialStatus === "received" ? nowIso : null,
      received_at: initialStatus === "received" ? nowIso : null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertErr || !quote) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to create quote" },
      { status: 500 }
    );
  }

  // Insert lines.
  const { error: linesErr } = await supabase.from("supplier_quote_lines").insert(
    computedLines.map((l) => ({
      supplier_quote_id: quote.id,
      procurement_line_id: l.procurement_line_id,
      qty: l.qty,
      unit_price: l.unit_price,
      line_total: l.line_total,
      notes: l.notes,
    }))
  );
  if (linesErr) {
    // Best-effort cleanup if line insert fails.
    await supabase.from("supplier_quotes").delete().eq("id", quote.id);
    return NextResponse.json({ error: linesErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: quote.id, subtotal, total }, { status: 201 });
}
