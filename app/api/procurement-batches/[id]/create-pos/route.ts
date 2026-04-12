import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/procurement-batches/[id]/create-pos
 *
 * Groups batch lines by supplier and generates one Supplier PO per supplier.
 *
 * Each PO is linked to the batch and contains all components from that supplier.
 * This replaces the manual process of creating individual POs per supplier
 * from the PROC template.
 *
 * Input: Batch must be in status "suppliers_allocated"
 * Output: Batch moves to "pos_created", supplier_pos records created
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: batchId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Validate batch
  const { data: batch } = await admin
    .from("procurement_batches")
    .select("id, status, proc_batch_code")
    .eq("id", batchId)
    .single();

  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  if (batch.status !== "suppliers_allocated") {
    return NextResponse.json(
      { error: `Batch is "${batch.status}". Create POs requires "suppliers_allocated".` },
      { status: 400 }
    );
  }

  // Fetch all lines with suppliers allocated (skip BG stock and unpriced)
  const { data: lines } = await admin
    .from("procurement_batch_lines")
    .select("id, mpn, description, order_qty, unit_price, supplier, supplier_pn, is_bg")
    .eq("batch_id", batchId)
    .not("supplier", "is", null)
    .eq("is_bg", false)
    .order("supplier", { ascending: true });

  if (!lines || lines.length === 0) {
    return NextResponse.json({ error: "No lines with supplier allocation found" }, { status: 400 });
  }

  // Get the first procurement to link POs (for backward compatibility with existing supplier_pos.procurement_id)
  const { data: batchItems } = await admin
    .from("procurement_batch_items")
    .select("procurement_id")
    .eq("batch_id", batchId)
    .order("board_letter", { ascending: true })
    .limit(1);

  const primaryProcurementId = batchItems?.[0]?.procurement_id;
  if (!primaryProcurementId) {
    return NextResponse.json({ error: "No procurements found in batch" }, { status: 400 });
  }

  // Group lines by supplier
  const supplierGroups = new Map<string, typeof lines>();
  for (const line of lines) {
    const supplier = line.supplier!;
    const group = supplierGroups.get(supplier) ?? [];
    group.push(line);
    supplierGroups.set(supplier, group);
  }

  // Generate POs per supplier
  const now = new Date();
  const yymm = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, "0");
  const poPrefix = `PO-${yymm}-`;

  // Find existing PO sequence
  const { data: existingPos } = await admin
    .from("supplier_pos")
    .select("po_number")
    .like("po_number", `${poPrefix}%`)
    .order("po_number", { ascending: false })
    .limit(1);

  let seq = 1;
  if (existingPos?.length) {
    const last = existingPos[0].po_number as string;
    const lastSeq = parseInt(last.split("-").pop() ?? "0", 10);
    seq = lastSeq + 1;
  }

  const createdPOs: { po_number: string; supplier: string; lines: number; total: number }[] = [];

  for (const [supplier, supplierLines] of supplierGroups) {
    const poNumber = `${poPrefix}${String(seq++).padStart(3, "0")}`;

    // Build PO lines
    interface POLine {
      mpn: string;
      description: string | null;
      qty: number;
      unit_price: number;
      line_total: number;
    }

    const poLines: POLine[] = supplierLines.map((pl) => {
      const unitPrice = Number(pl.unit_price) || 0;
      return {
        mpn: pl.mpn,
        description: pl.description ?? null,
        qty: pl.order_qty,
        unit_price: unitPrice,
        line_total: Math.round(pl.order_qty * unitPrice * 100) / 100,
      };
    });

    const totalAmount = poLines.reduce((sum, l) => sum + l.line_total, 0);

    // Look up supplier email from app_settings or known suppliers
    const supplierEmails: Record<string, string> = {
      DigiKey: "",
      Mouser: "",
      LCSC: "",
    };

    // Insert supplier PO
    const { data: po, error: poError } = await admin
      .from("supplier_pos")
      .insert({
        po_number: poNumber,
        procurement_id: primaryProcurementId,
        supplier_name: supplier,
        supplier_email: supplierEmails[supplier] ?? null,
        lines: poLines,
        total_amount: Math.round(totalAmount * 100) / 100,
        status: "draft",
      })
      .select("id")
      .single();

    if (poError) {
      continue; // Skip failed PO, log will show it
    }

    // Update batch lines with PO reference and mark as ordered
    for (const line of supplierLines) {
      await admin
        .from("procurement_batch_lines")
        .update({
          supplier_po_id: po.id,
          qty_ordered: line.order_qty,
          order_status: "ordered",
          updated_at: new Date().toISOString(),
        })
        .eq("id", line.id);
    }

    createdPOs.push({
      po_number: poNumber,
      supplier,
      lines: supplierLines.length,
      total: Math.round(totalAmount * 100) / 100,
    });
  }

  // Update batch status
  await admin
    .from("procurement_batches")
    .update({
      status: "pos_created",
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  // Log
  await admin.from("procurement_batch_log").insert({
    batch_id: batchId,
    action: "pos_created",
    old_status: "suppliers_allocated",
    new_status: "pos_created",
    details: {
      pos_created: createdPOs.length,
      pos: createdPOs,
      total_value: createdPOs.reduce((s, p) => s + p.total, 0),
    },
    performed_by: user.id,
  });

  return NextResponse.json({
    status: "pos_created",
    pos_created: createdPOs.length,
    pos: createdPOs,
    message: `${createdPOs.length} supplier PO(s) created. Review POs, then receive and split back to individual procurements.`,
  });
}
