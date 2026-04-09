import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch BOM info
  const { data: bom } = await supabase
    .from("boms")
    .select("file_name, gmps(gmp_number)")
    .eq("id", id)
    .single();

  if (!bom) return NextResponse.json({ error: "BOM not found" }, { status: 404 });

  // Fetch lines
  const { data: lines } = await supabase
    .from("bom_lines")
    .select("line_number, quantity, reference_designator, cpc, description, mpn, manufacturer, m_code, m_code_source, m_code_reasoning, is_pcb, is_dni")
    .eq("bom_id", id)
    .eq("is_dni", false)
    .order("line_number", { ascending: true });

  if (!lines) return NextResponse.json({ error: "No lines found" }, { status: 404 });

  // Build export data — CP IP BOM format
  const rows = lines.map((line) => ({
    "Quantity": line.quantity,
    "Reference Designator": line.reference_designator ?? "",
    "CPC": line.cpc ?? "",
    "Description": line.description ?? "",
    "MPN": line.mpn ?? "",
    "Manufacturer": line.manufacturer ?? "",
    "M-Code": line.m_code ?? "",
    "M-Code Source": line.m_code_source ?? "",
    "Reasoning": line.m_code_reasoning ?? "",
    "PCB": line.is_pcb ? "Yes" : "",
  }));

  // Create workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  ws["!cols"] = [
    { wch: 8 },   // Quantity
    { wch: 25 },  // Reference Designator
    { wch: 25 },  // CPC
    { wch: 40 },  // Description
    { wch: 25 },  // MPN
    { wch: 20 },  // Manufacturer
    { wch: 10 },  // M-Code
    { wch: 10 },  // Source
    { wch: 40 },  // Reasoning
    { wch: 5 },   // PCB
  ];

  const gmp = bom.gmps as unknown as { gmp_number: string } | null;
  const sheetName = (gmp?.gmp_number ?? "BOM").slice(0, 31); // Excel max sheet name 31 chars
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="CP IP BOM ${sheetName}.xlsx"`,
    },
  });
}
