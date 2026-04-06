import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import {
  InvoicePDF,
  type InvoiceLineItem,
} from "@/components/invoices/invoice-pdf";

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
      "*, customers(code, company_name, contact_name, payment_terms), jobs(job_number, gmp_id, quantity, gmps(gmp_number, board_name), quotes(pricing))"
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
    quantity: number;
    gmps: { gmp_number: string; board_name: string | null } | null;
    quotes: { pricing: { tiers?: { board_qty: number; subtotal: number; per_unit?: number }[] } } | null;
  } | null;

  // Detect consolidated invoice by checking notes for the marker
  let lineItems: InvoiceLineItem[] | undefined;
  const notesStr = invoice.notes as string | null;

  if (notesStr && notesStr.includes("Consolidated invoice for jobs:")) {
    // Extract job numbers from the notes, then look them up
    const jobListMatch = notesStr.match(
      /Consolidated invoice for jobs:\s*(.+?)$/m
    );
    if (jobListMatch) {
      // Parse "JB-2604-TLAN-001 (TL265-5040-000-T), JB-2604-TLAN-002 (GMP2)"
      const jobEntries = jobListMatch[1].split(",").map((s) => s.trim());
      const jobNumbers = jobEntries.map((entry) => {
        const match = entry.match(/^([^\s(]+)/);
        return match ? match[1] : entry;
      });

      // Fetch all related jobs with their pricing
      const { data: relatedJobs } = await supabase
        .from("jobs")
        .select("id, job_number, quantity, gmps(gmp_number, board_name), quotes(pricing)")
        .in("job_number", jobNumbers);

      if (relatedJobs && relatedJobs.length > 1) {
        type RelatedJob = {
          id: string;
          job_number: string;
          quantity: number;
          gmps: { gmp_number: string; board_name: string | null } | null;
          quotes: { pricing: { tiers?: { board_qty: number; subtotal: number; per_unit?: number }[] } } | null;
        };

        lineItems = (relatedJobs as unknown as RelatedJob[]).map((rj) => {
          const tiers = rj.quotes?.pricing?.tiers;
          let subtotal = 0;
          let perUnit = 0;
          if (tiers?.length) {
            const matched = tiers.find((t) => t.board_qty === rj.quantity) ?? tiers[0];
            subtotal = matched.subtotal;
            perUnit = matched.per_unit ?? (rj.quantity > 0 ? matched.subtotal / rj.quantity : 0);
          }
          return {
            job_number: rj.job_number,
            gmp_number: rj.gmps?.gmp_number ?? "Unknown",
            board_name: rj.gmps?.board_name,
            quantity: rj.quantity,
            per_unit: Math.round(perUnit * 100) / 100,
            subtotal: Math.round(subtotal * 100) / 100,
          };
        });
      }
    }
  }

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
    lineItems,
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
