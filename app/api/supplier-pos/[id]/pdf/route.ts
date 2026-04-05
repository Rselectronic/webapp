import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import {
  SupplierPOPDF,
  type POLine,
} from "@/components/procurement/supplier-po-pdf";

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

  // Fetch PO with related procurement -> job -> customer
  const { data: po, error } = await supabase
    .from("supplier_pos")
    .select(
      "*, procurements(proc_code, jobs(job_number, customers(code, company_name)))"
    )
    .eq("id", id)
    .single();

  if (error || !po) {
    return NextResponse.json(
      { error: "Supplier PO not found" },
      { status: 404 }
    );
  }

  const procurement = po.procurements as unknown as {
    proc_code: string;
    jobs: {
      job_number: string;
      customers: { code: string; company_name: string } | null;
    } | null;
  } | null;

  const lines = (po.lines ?? []) as POLine[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfElement = createElement(SupplierPOPDF, {
    poNumber: po.po_number,
    supplierName: po.supplier_name,
    supplierEmail: po.supplier_email,
    procCode: procurement?.proc_code ?? null,
    jobNumber: procurement?.jobs?.job_number ?? null,
    customerName: procurement?.jobs?.customers?.company_name ?? null,
    lines,
    totalAmount: Number(po.total_amount) || 0,
    createdAt: po.created_at,
    notes: null,
  });

  // @ts-expect-error -- @react-pdf/renderer types expect DocumentProps but SupplierPOPDF wraps <Document> internally
  const pdfBuffer = await renderToBuffer(pdfElement);

  // Upload to Supabase Storage
  const customerCode =
    procurement?.jobs?.customers?.code ?? "unknown";
  const storagePath = `${customerCode}/${po.po_number}.pdf`;

  await supabase.storage.from("procurement").upload(storagePath, pdfBuffer, {
    contentType: "application/pdf",
    upsert: true,
  });

  // Persist storage path on the PO record
  await supabase
    .from("supplier_pos")
    .update({ pdf_path: storagePath })
    .eq("id", id);

  const bytes = new Uint8Array(pdfBuffer);

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${po.po_number}.pdf"`,
    },
  });
}
