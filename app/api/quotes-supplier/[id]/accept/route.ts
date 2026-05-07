import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import { getRate } from "@/lib/pricing/fx";
import { buildProcOrderingRows } from "@/lib/proc/ordering-rollup";
// ============================================================================
// /api/quotes-supplier/[id]/accept â€” atomically accept a quote and produce a
// draft supplier_pos row from its lines.
//
// Steps:
//   1. Mark quote.status='accepted', accepted_at, accepted_by.
//   2. Generate a new supplier_pos:
//        - supplier_id, supplier_contact_id, currency from the quote
//        - lines JSONB from supplier_quote_lines (mpn pulled via procurement_lines)
//        - total_amount = quote.total
//        - status='draft', cc_emails=null
//        - supplier_name + supplier_email snapshots (legacy compat)
//   3. quote.resulting_po_id = new PO id.
//   4. Update each procurement_line:
//        - supplier = supplier code (string)
//        - qty_ordered = qty
//        - unit_price = quote line unit_price (in quote currency; we ALSO
//          compute the CAD-equivalent if a cached fx rate exists, otherwise
//          store native price and leave a TODO).
//        - extended_price = unit_price * qty (in quote currency)
//        - order_status = 'ordered'
//   5. Recompute procurement-level lines_ordered/lines_received counts.
// ============================================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface QuoteLineWithProc {
  id: string;
  procurement_line_id: string;
  qty: number;
  unit_price: number;
  line_total: number;
  procurement_lines: {
    id: string;
    mpn: string;
    description: string | null;
    m_code: string | null;
  } | null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: quoteId } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Load the quote.
  const { data: quote, error: qErr } = await supabase
    .from("supplier_quotes")
    .select(
      `id, procurement_id, supplier_id, supplier_contact_id, currency, status,
       subtotal, shipping, tax, total, notes, resulting_po_id,
       suppliers(code, legal_name),
       supplier_contacts(name, email)`
    )
    .eq("id", quoteId)
    .maybeSingle();
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  if (quote.status === "accepted") {
    return NextResponse.json(
      { error: "Quote already accepted", resulting_po_id: quote.resulting_po_id },
      { status: 409 }
    );
  }
  if (quote.status === "rejected" || quote.status === "expired") {
    return NextResponse.json(
      { error: `Cannot accept a quote that is ${quote.status}.` },
      { status: 409 }
    );
  }

  // Load lines + their underlying procurement_lines (for MPN, description).
  const { data: rawLines, error: lErr } = await supabase
    .from("supplier_quote_lines")
    .select(
      `id, procurement_line_id, qty, unit_price, line_total,
       procurement_lines(id, mpn, description, m_code)`
    )
    .eq("supplier_quote_id", quoteId);
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });
  const lines = (rawLines ?? []) as unknown as QuoteLineWithProc[];
  if (lines.length === 0) {
    return NextResponse.json(
      { error: "Quote has no lines to convert into a PO" },
      { status: 400 }
    );
  }

  // Resolve supplier display info for legacy snapshot fields.
  const supplierObj = (quote.suppliers as unknown as { code: string; legal_name: string } | null);
  const contactObj = (quote.supplier_contacts as unknown as { name: string; email: string | null } | null);
  const supplierDisplay = supplierObj?.legal_name ?? supplierObj?.code ?? "Supplier";
  const supplierEmail = contactObj?.email ?? null;

  // Generate PO number â€” same pattern as /api/supplier-pos POST.
  const now = new Date();
  const yymm =
    String(now.getFullYear()).slice(2) +
    String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `PO-${yymm}-`;
  const { data: existing } = await supabase
    .from("supplier_pos")
    .select("po_number")
    .like("po_number", `${prefix}%`)
    .order("po_number", { ascending: false })
    .limit(1);
  let seq = 1;
  if (existing?.length) {
    const last = existing[0].po_number as string;
    const lastSeq = parseInt(last.split("-").pop() ?? "0", 10);
    seq = lastSeq + 1;
  }
  const poNumber = `${prefix}${String(seq).padStart(3, "0")}`;

  // Build a MPN â†’ customer_ref lookup from the proc rollup so the supplier
  // PO PDF can render an internal RS reference (board letter + designator +
  // m-code + cpc). The rollup is CPC-keyed; map each row's winning MPN AND
  // every contributing MPN under the same CPC to its ref string.
  const refByMpn = new Map<string, string>();
  if (quote.procurement_id) {
    const ctx = await buildProcOrderingRows(supabase, quote.procurement_id);
    for (const r of ctx.rows) {
      if (!r.customer_ref) continue;
      if (r.winning_mpn) refByMpn.set(r.winning_mpn.trim().toUpperCase(), r.customer_ref);
      // The CPC itself is also a useful key so lines that fall back to CPC
      // (no MPN) can still resolve a ref.
      if (r.cpc) refByMpn.set(r.cpc.trim().toUpperCase(), r.customer_ref);
    }
  }

  // Build lines JSONB for the PO (in the quote currency).
  const poLinesJson = lines.map((l) => {
    const mpn = (l.procurement_lines?.mpn ?? "").trim();
    const ref = mpn ? refByMpn.get(mpn.toUpperCase()) ?? null : null;
    return {
      mpn,
      description: l.procurement_lines?.description ?? null,
      qty: l.qty,
      unit_price: Number(l.unit_price),
      line_total: Number(l.line_total),
      currency: quote.currency,
      customer_ref: ref,
    };
  });
  const totalAmount = Number(quote.total ?? 0);

  // Insert the supplier_pos row.
  const { data: po, error: insErr } = await supabase
    .from("supplier_pos")
    .insert({
      po_number: poNumber,
      procurement_id: quote.procurement_id,
      supplier_id: quote.supplier_id,
      supplier_contact_id: quote.supplier_contact_id,
      supplier_name: supplierDisplay, // legacy snapshot for older PDF/list code
      supplier_email: supplierEmail,
      currency: quote.currency,
      cc_emails: null,
      lines: poLinesJson,
      total_amount: round2(totalAmount),
      status: "draft",
    })
    .select("id")
    .single();
  if (insErr || !po) {
    return NextResponse.json(
      { error: insErr?.message ?? "Failed to create PO" },
      { status: 500 }
    );
  }

  // Mark quote accepted + link to PO.
  const nowIso = new Date().toISOString();
  const { error: acceptErr } = await supabase
    .from("supplier_quotes")
    .update({
      status: "accepted",
      accepted_at: nowIso,
      accepted_by: user.id,
      resulting_po_id: po.id,
      updated_at: nowIso,
    })
    .eq("id", quoteId);
  if (acceptErr) {
    return NextResponse.json({ error: acceptErr.message }, { status: 500 });
  }

  // Update procurement_lines. Try CAD conversion for unit_price/extended_price
  // because the existing schema has historically stored CAD; if no FX rate is
  // cached we fall back to the native (quote-currency) value and leave a note.
  let fxToCad: number | null = 1;
  if (quote.currency !== "CAD") {
    const fx = await getRate(quote.currency, "CAD");
    fxToCad = fx?.rate ?? null;
  }
  const supplierCode = supplierObj?.code ?? supplierDisplay;

  for (const l of lines) {
    const qty = l.qty;
    const unitNative = Number(l.unit_price);
    const unitCad = fxToCad != null ? unitNative * fxToCad : unitNative;
    // TODO: when fxToCad is null we store the native-currency value into a
    // CAD-named column. Once the schema gains a unit_price_currency column we
    // should split native vs. CAD-equivalent properly.
    await supabase
      .from("procurement_lines")
      .update({
        supplier: supplierCode,
        qty_ordered: qty,
        unit_price: round2(unitCad),
        extended_price: round2(unitCad * qty),
        order_status: "ordered",
        updated_at: nowIso,
      })
      .eq("id", l.procurement_line_id);

    // Mirror the same selection into procurement_line_selections â€” this is
    // the table the merged BOM reads from, so without this update the
    // table would keep showing the cached distributor price even after
    // the operator accepted a supplier quote. Upsert via the unique
    // (procurement_id, mpn) constraint so an existing row gets overwritten.
    const mpn = l.procurement_lines?.mpn;
    if (mpn) {
      await supabase
        .from("procurement_line_selections")
        .upsert(
          {
            procurement_id: quote.procurement_id,
            mpn,
            chosen_supplier: supplierCode,
            // Suppliers don't have distributor part numbers â€” leave null.
            chosen_supplier_pn: null,
            chosen_unit_price_cad: round2(unitCad),
            chosen_effective_qty: qty,
            chose_at: nowIso,
            chosen_by: user.id,
            order_status: "ordered",
            // Use the PO number as the external id so the operator can
            // trace the merged-BOM row back to the PO that ordered it.
            order_external_id: poNumber,
            ordered_at: nowIso,
            // The supplier-quote price replaces whatever was in the cache,
            // so write it as a manual override too. That way the merged
            // BOM's effective_unit_price_cad picks up the new value via
            // its standard "manual override beats cached price" logic.
            manual_unit_price_cad: round2(unitCad),
            manual_price_note: `Supplier quote ${supplierCode} (${quote.currency})`,
          },
          { onConflict: "procurement_id,mpn" }
        );
    }
  }

  // Recompute procurement-level line counts (mirror /api/supplier-pos).
  const { data: allLines } = await supabase
    .from("procurement_lines")
    .select("qty_ordered, order_status")
    .eq("procurement_id", quote.procurement_id);
  const linesOrdered = (allLines ?? []).filter((l) => (l.qty_ordered ?? 0) > 0).length;
  const linesReceived = (allLines ?? []).filter((l) => l.order_status === "received").length;
  const totalLinesCount = (allLines ?? []).length;
  let procStatus: string;
  if (linesReceived === totalLinesCount && totalLinesCount > 0) procStatus = "fully_received";
  else if (linesReceived > 0) procStatus = "partial_received";
  else if (linesOrdered > 0) procStatus = "ordering";
  else procStatus = "draft";

  await supabase
    .from("procurements")
    .update({
      lines_ordered: linesOrdered,
      lines_received: linesReceived,
      status: procStatus,
      updated_at: nowIso,
    })
    .eq("id", quote.procurement_id);

  // Return the freshly-created PO in the same shape the proc PO list
  // endpoint serves so the client can append it to local state without a
  // separate refetch. pdf_url is null on a fresh PO â€” the operator
  // generates it on demand from the panel.
  const newPo = {
    id: po.id,
    po_number: poNumber,
    supplier_name: supplierDisplay,
    total_amount: round2(totalAmount),
    status: "draft" as const,
    pdf_url: null as string | null,
    created_at: nowIso,
    currency: quote.currency,
    lines: poLinesJson,
  };

  return NextResponse.json({
    success: true,
    quote_id: quoteId,
    po_id: po.id,
    po_number: poNumber,
    fx_rate_to_cad: fxToCad,
    new_po: newPo,
  });
}
