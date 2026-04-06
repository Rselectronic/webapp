import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { PackingSlipPDF } from "@/components/shipping/packing-slip-pdf";
import { ComplianceCertificatePDF } from "@/components/shipping/compliance-certificate-pdf";

export async function GET(
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

  // Determine which document to generate
  const docType =
    req.nextUrl.searchParams.get("type") ?? "packing-slip";

  const { data: job, error } = await supabase
    .from("jobs")
    .select(
      "*, customers(code, company_name, contact_name, shipping_address), gmps(gmp_number, board_name)"
    )
    .eq("id", id)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const customer = job.customers as unknown as {
    code: string;
    company_name: string;
    contact_name: string | null;
    shipping_address: Record<string, string> | null;
  } | null;

  const gmp = job.gmps as unknown as {
    gmp_number: string;
    board_name: string | null;
  } | null;

  const metadata = (job.metadata ?? {}) as Record<string, unknown>;
  const shipDate =
    (metadata.ship_date as string) ??
    new Date().toISOString().split("T")[0];
  const courierName = (metadata.courier_name as string) ?? null;
  const trackingId = (metadata.tracking_id as string) ?? null;

  // Build ship-to address string from JSONB
  const addr = customer?.shipping_address;
  const shipToAddress = addr
    ? [addr.street, addr.city, addr.province, addr.postal_code, addr.country]
        .filter(Boolean)
        .join(", ")
    : null;

  // Look up procurement batch code for this job
  const { data: procurement } = await supabase
    .from("procurements")
    .select("proc_code")
    .eq("job_id", id)
    .limit(1)
    .maybeSingle();

  const procBatchCode = procurement?.proc_code ?? null;
  const customerCode = customer?.code ?? "unknown";
  const gmpNumber = gmp?.gmp_number ?? "unknown";

  let pdfBuffer: Buffer;
  let fileName: string;

  if (docType === "compliance") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfElement = createElement(ComplianceCertificatePDF, {
      jobNumber: job.job_number,
      customerName: customer?.company_name ?? "Unknown",
      contactName: customer?.contact_name,
      gmpNumber: gmpNumber,
      boardName: gmp?.board_name,
      quantity: job.quantity,
      shipDate,
      procBatchCode,
    });

    // @ts-expect-error -- @react-pdf/renderer types expect DocumentProps but component wraps <Document> internally
    pdfBuffer = await renderToBuffer(pdfElement);
    fileName = `${job.job_number}-compliance.pdf`;
  } else {
    // Default: packing slip
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfElement = createElement(PackingSlipPDF, {
      jobNumber: job.job_number,
      procBatchCode,
      customerName: customer?.company_name ?? "Unknown",
      contactName: customer?.contact_name,
      shipToAddress,
      courierName,
      trackingId,
      shipDate,
      items: [
        {
          gmpNumber: gmpNumber,
          boardName: gmp?.board_name,
          quantity: job.quantity,
          description: `PCB Assembly — ${gmpNumber}`,
        },
      ],
      notes: job.notes,
    });

    // @ts-expect-error -- @react-pdf/renderer types expect DocumentProps but component wraps <Document> internally
    pdfBuffer = await renderToBuffer(pdfElement);
    fileName = `${job.job_number}-packing-slip.pdf`;
  }

  // Upload to Supabase Storage under the jobs bucket
  const storagePath = `${customerCode}/${gmpNumber}/${fileName}`;
  await supabase.storage.from("jobs").upload(storagePath, pdfBuffer, {
    contentType: "application/pdf",
    upsert: true,
  });

  const bytes = new Uint8Array(pdfBuffer);

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
