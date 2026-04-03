import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { QuotePDF } from "@/components/quotes/quote-pdf";
import type { PricingTier } from "@/lib/pricing/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quote, error } = await supabase
    .from("quotes")
    .select(
      "*, customers(code, company_name, contact_name), gmps(gmp_number, board_name), boms(file_name, revision)"
    )
    .eq("id", id)
    .single();

  if (error || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const customer = quote.customers as unknown as {
    code: string;
    company_name: string;
    contact_name: string | null;
  } | null;
  const gmp = quote.gmps as unknown as {
    gmp_number: string;
    board_name: string | null;
  } | null;
  const bom = quote.boms as unknown as {
    file_name: string;
    revision: string;
  } | null;
  const pricing = quote.pricing as unknown as {
    tiers?: PricingTier[];
    warnings?: string[];
  } | null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfElement = createElement(QuotePDF, {
    quoteNumber: quote.quote_number,
    customerName: customer?.company_name ?? "Unknown",
    contactName: customer?.contact_name,
    gmpNumber: gmp?.gmp_number ?? "\u2014",
    boardName: gmp?.board_name,
    bomFile: bom ? `${bom.file_name} Rev ${bom.revision}` : "\u2014",
    tiers: pricing?.tiers ?? [],
    warnings: pricing?.warnings ?? [],
    nreCharge: quote.nre_charge ?? 0,
    validityDays: quote.validity_days ?? 30,
    issuedAt: quote.issued_at,
    notes: quote.notes,
  });

  // @ts-expect-error -- @react-pdf/renderer types expect DocumentProps but QuotePDF wraps <Document> internally
  const pdfBuffer = await renderToBuffer(pdfElement);

  // Upload PDF to Supabase Storage
  const customerCode = customer?.code ?? "unknown";
  const gmpNumber = gmp?.gmp_number ?? "unknown";
  const storagePath = `${customerCode}/${gmpNumber}/${quote.quote_number}.pdf`;

  await supabase.storage
    .from("quotes")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  // Persist the storage path on the quote record
  await supabase
    .from("quotes")
    .update({ pdf_path: storagePath })
    .eq("id", id);

  const bytes = new Uint8Array(pdfBuffer);

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.quote_number}.pdf"`,
    },
  });
}
