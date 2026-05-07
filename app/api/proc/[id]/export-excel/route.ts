import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";
import { buildProcOrderingRows } from "@/lib/proc/ordering-rollup";
export const dynamic = "force-dynamic";

// GET /api/proc/[id]/export-excel?supplier=<SupplierName>
// Exports the rows whose operator-chosen supplier === <supplier>, in the
// simplified 3-column format (distributor PN / qty / customer ref) expected
// by each distributor's bulk-upload / BOM tool.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const supplier = url.searchParams.get("supplier");
  if (!supplier) {
    return NextResponse.json({ error: "Missing supplier query param" }, { status: 400 });
  }
  const supplierLower = supplier.toLowerCase();

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

  const { proc, rows } = await buildProcOrderingRows(supabase, id);
  if (!proc) return NextResponse.json({ error: "PROC not found" }, { status: 404 });

  const filteredRows = rows.filter((r) => {
    if (r.is_customer_supplied) return false;
    const sel = r.selection;
    if (!sel) return false;
    return (sel.chosen_supplier ?? "").toLowerCase() === supplierLower;
  });

  const pnHeader = (() => {
    switch (supplierLower) {
      case "digikey": return "Part Number";
      case "mouser": return "Mouser #";
      case "lcsc": return "LCSC Part Number";
      case "arrow": return "Part Number";
      default: return "Part Number";
    }
  })();

  const data: (string | number)[][] = [[pnHeader, "Quantity", "Customer Reference"]];
  for (const r of filteredRows) {
    const sel = r.selection!;
    // Phase 3: ordering rows are CPC-keyed. Fall through to winning MPN, then
    // CPC, so the export never produces a blank PN cell.
    const pn = sel.chosen_supplier_pn ?? r.winning_mpn ?? r.cpc;
    const qty = sel.chosen_effective_qty ?? r.total_with_extras;
    data.push([pn, qty, r.customer_ref]);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Order");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const filename = `${proc.proc_code}_${supplier}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
