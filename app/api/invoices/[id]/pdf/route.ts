import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { InvoicePDF } from "@/components/invoices/invoice-pdf";

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

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(
      "*, customers(code, company_name, contact_name, payment_terms), jobs(job_number, gmp_id, gmps(gmp_number, board_name))"
    )
    .eq("id", id)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const customer = invoice.customers as unknown as {
    code: string;
    company_name: string;
    contact_name: string | null;
    payment_terms: string | null;
  } | null;

  const job = invoice.jobs as unknown as {
    job_number: string;
    gmp_id: string;
    gmps: { gmp_number: string; board_name: string | null } | null;
  } | null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfElement = createElement(InvoicePDF, {
    invoiceNumber: invoice.invoice_number,
    customerName: customer?.company_name ?? "Unknown",
    contactName: customer?.contact_name,
    jobNumber: job?.job_number ?? "\u2014",
    gmpNumber: job?.gmps?.gmp_number ?? "\u2014",
    issuedDate: invoice.issued_date,
    dueDate: invoice.due_date,
    subtotal: Number(invoice.subtotal) || 0,
    tpsGst: Number(invoice.tps_gst) || 0,
    tvqQst: Number(invoice.tvq_qst) || 0,
    freight: Number(invoice.freight) || 0,
    discount: Number(invoice.discount) || 0,
    total: Number(invoice.total) || 0,
    paymentTerms: customer?.payment_terms ?? "Net 30",
    notes: invoice.notes,
  });

  // @ts-expect-error -- @react-pdf/renderer types expect DocumentProps but InvoicePDF wraps <Document> internally
  const pdfBuffer = await renderToBuffer(pdfElement);

  // Upload PDF to Supabase Storage
  const customerCode = customer?.code ?? "unknown";
  const gmpNumber = job?.gmps?.gmp_number ?? "unknown";
  const storagePath = `${customerCode}/${gmpNumber}/${invoice.invoice_number}.pdf`;

  await supabase.storage
    .from("invoices")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  // Persist the storage path on the invoice record
  await supabase
    .from("invoices")
    .update({ pdf_path: storagePath })
    .eq("id", id);

  const bytes = new Uint8Array(pdfBuffer);

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoice_number}.pdf"`,
    },
  });
}
