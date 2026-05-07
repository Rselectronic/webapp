import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Admin-only â€” supplier POs are financial documents. RLS would block the
  // read anyway, but an explicit 403 is clearer than a confusing empty 404.
  const { data: gateProfile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!gateProfile || gateProfile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // procurements â†” jobs has TWO FKs (procurements.job_id and jobs.procurement_id),
  // so PostgREST can't disambiguate on its own. Hint with the constraint name
  // â€” same fix as the supplier-pos PDF route.
  const { data: po, error } = await supabase
    .from("supplier_pos")
    .select(
      "*, procurements(proc_code, jobs!procurements_job_id_fkey(job_number, customers(code, company_name)))"
    )
    .eq("id", id)
    .single();

  if (error || !po) {
    return NextResponse.json({ error: "Supplier PO not found" }, { status: 404 });
  }

  return NextResponse.json(po);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Admin-only â€” PO status / tracking edits are a sourcing action.
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === "sent") {
      updates.sent_at = new Date().toISOString();
    }
  }
  if (body.tracking_number !== undefined) {
    updates.tracking_number = body.tracking_number;
  }
  if (body.expected_arrival !== undefined) {
    updates.expected_arrival = body.expected_arrival;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data: po, error } = await supabase
    .from("supplier_pos")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(po);
}

// DELETE /api/supplier-pos/[id] â€” remove a supplier_po row and its PDF.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: row, error: loadErr } = await supabase
    .from("supplier_pos")
    .select("id, po_number, pdf_path, procurement_id")
    .eq("id", id)
    .maybeSingle();

  if (loadErr) {
    console.error("[supplier-pos DELETE] load failed:", loadErr.message);
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // -------------------------------------------------------------------------
  // Unwind FK references first. Two tables reference supplier_pos.id:
  //   supplier_quotes.resulting_po_id   â† created by /api/quotes-supplier/[id]/accept
  //   procurement_batch_lines.supplier_po_id â† legacy distributor PO flow
  //
  // Postgres blocks the supplier_pos delete until those references go away.
  // We clear them and, where possible, reverse the side-effects the original
  // accept flow applied so the operator can re-quote / re-accept cleanly:
  //   â€¢ supplier_quotes that pointed at this PO drop their resulting_po_id
  //     and roll back to status='received' (re-acceptable).
  //   â€¢ procurement_line_selections rows whose order_external_id is this PO's
  //     po_number get reverted to status='not_ordered' with the manual price
  //     cleared. This makes the merged BOM stop showing "Ordered" for those
  //     MPNs â€” matching the user's expectation when they delete a PO.
  //   â€¢ procurement_lines that recorded the supplier+qty_ordered for this PO's
  //     MPNs roll back to order_status='pending' with qty_ordered=0.
  // -------------------------------------------------------------------------

  // 1. Find any supplier_quote pointing at this PO and the MPNs it covered.
  const { data: linkedQuotes } = await supabase
    .from("supplier_quotes")
    .select(
      `id,
       supplier_quote_lines(
         procurement_line_id,
         procurement_lines(mpn)
       )`
    )
    .eq("resulting_po_id", id);

  const quoteIds: string[] = [];
  const affectedLineIds = new Set<string>();
  const affectedMpns = new Set<string>();
  for (const q of (linkedQuotes ?? []) as Array<{
    id: string;
    supplier_quote_lines:
      | Array<{
          procurement_line_id: string;
          procurement_lines: { mpn: string | null } | { mpn: string | null }[] | null;
        }>
      | null;
  }>) {
    quoteIds.push(q.id);
    for (const ql of q.supplier_quote_lines ?? []) {
      if (ql.procurement_line_id) affectedLineIds.add(ql.procurement_line_id);
      const pl = Array.isArray(ql.procurement_lines)
        ? ql.procurement_lines[0]
        : ql.procurement_lines;
      if (pl?.mpn) affectedMpns.add(pl.mpn);
    }
  }

  // 2. Clear the FKs on the linked rows.
  if (quoteIds.length > 0) {
    const nowIso = new Date().toISOString();
    await supabase
      .from("supplier_quotes")
      .update({
        resulting_po_id: null,
        status: "received",
        accepted_at: null,
        accepted_by: null,
        updated_at: nowIso,
      })
      .in("id", quoteIds);
  }
  await supabase
    .from("procurement_batch_lines")
    .update({ supplier_po_id: null })
    .eq("supplier_po_id", id);

  // 3. Drop the procurement_line_selections rows that this PO populated.
  //    We match on order_external_id = po_number (the accept flow stamps
  //    that). DELETE (not UPDATE) so the chosen_supplier / unit_price
  //    fields go away too â€” otherwise the merged BOM keeps showing the
  //    quote's supplier (e.g. SCHOTT) in the "Place to Buy" column even
  //    after the operator deleted the PO. The merged BOM falls back to
  //    the cached AUTO winner; the operator can re-pin a distributor if
  //    they want one before generating a new quote.
  if (row.po_number) {
    await supabase
      .from("procurement_line_selections")
      .delete()
      .eq("procurement_id", row.procurement_id)
      .eq("order_external_id", row.po_number);
  }

  // 4. Revert procurement_lines for the affected MPNs back to pending.
  if (affectedLineIds.size > 0) {
    await supabase
      .from("procurement_lines")
      .update({
        supplier: null,
        qty_ordered: 0,
        unit_price: null,
        extended_price: null,
        order_status: "pending",
      })
      .in("id", Array.from(affectedLineIds));
  }

  // 5. Best-effort PDF cleanup.
  if (row.pdf_path) {
    try {
      const { error: storageErr } = await supabase.storage
        .from("procurement")
        .remove([row.pdf_path]);
      if (storageErr) {
        console.error("[supplier-pos DELETE] storage remove failed:", storageErr.message);
      }
    } catch (e) {
      console.error("[supplier-pos DELETE] storage remove threw:", e);
    }
  }

  // 6. Now the FKs are clear â€” drop the PO.
  const { error: delErr } = await supabase.from("supplier_pos").delete().eq("id", id);
  if (delErr) {
    console.error("[supplier-pos DELETE] delete failed:", delErr.message);
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deleted_id: id,
    reverted_quote_ids: quoteIds,
    reverted_mpn_count: affectedMpns.size,
  });
}
