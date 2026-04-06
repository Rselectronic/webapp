import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { JobCardPDF } from "@/components/production/job-card-pdf";
import { TravellerPDF } from "@/components/production/traveller-pdf";
import { PrintBomPDF } from "@/components/production/print-bom-pdf";
import { ReceptionPDF } from "@/components/production/reception-pdf";
import type { BomLine } from "@/components/production/print-bom-pdf";
import type { ReceptionLine } from "@/components/production/reception-pdf";

const VALID_TYPES = ["job-card", "traveller", "print-bom", "reception"] as const;
type DocType = (typeof VALID_TYPES)[number];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const typeParam = req.nextUrl.searchParams.get("type") as DocType | null;

  if (!typeParam || !VALID_TYPES.includes(typeParam)) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Fetch job with related entities
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(
      `id, job_number, status, quantity, assembly_type, po_number, notes,
       scheduled_start, scheduled_completion,
       customer_id, gmp_id, bom_id, quote_id,
       customers(code, company_name),
       gmps(gmp_number, board_name),
       boms(id, file_name, revision, component_count),
       quotes(quote_number)`
    )
    .eq("id", id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const customer = job.customers as unknown as {
    code: string;
    company_name: string;
  } | null;
  const gmp = job.gmps as unknown as {
    gmp_number: string;
    board_name: string | null;
  } | null;
  const bom = job.boms as unknown as {
    id: string;
    file_name: string;
    revision: string;
    component_count: number;
  } | null;
  const quote = job.quotes as unknown as { quote_number: string } | null;

  const customerCode = customer?.code ?? "UNKNOWN";
  const customerName = customer?.company_name ?? "Unknown Customer";
  const gmpNumber = gmp?.gmp_number ?? "—";
  const boardName = gmp?.board_name;

  // Look up procurement batch code if available
  let procBatchCode: string | null = null;
  const { data: proc } = await supabase
    .from("procurements")
    .select("proc_code")
    .eq("job_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (proc) {
    procBatchCode = proc.proc_code;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pdfElement: any;
  let fileName: string;

  switch (typeParam) {
    case "job-card": {
      pdfElement = createElement(JobCardPDF, {
        jobNumber: job.job_number,
        customerName,
        customerCode,
        gmpNumber,
        boardName,
        quantity: job.quantity,
        assemblyType: job.assembly_type ?? "TB",
        procBatchCode,
        scheduledStart: job.scheduled_start,
        scheduledCompletion: job.scheduled_completion,
        componentCount: bom?.component_count ?? 0,
        poNumber: job.po_number,
        quoteNumber: quote?.quote_number,
        notes: job.notes,
      });
      fileName = `${job.job_number}-Job-Card.pdf`;
      break;
    }

    case "traveller": {
      pdfElement = createElement(TravellerPDF, {
        jobNumber: job.job_number,
        customerName,
        customerCode,
        gmpNumber,
        boardName,
        quantity: job.quantity,
        assemblyType: job.assembly_type ?? "TB",
      });
      fileName = `${job.job_number}-Traveller.pdf`;
      break;
    }

    case "print-bom": {
      if (!bom) {
        return NextResponse.json(
          { error: "No BOM linked to this job" },
          { status: 400 }
        );
      }

      const { data: bomLines, error: bomError } = await supabase
        .from("bom_lines")
        .select(
          "line_number, quantity, reference_designator, cpc, description, mpn, manufacturer, m_code"
        )
        .eq("bom_id", bom.id)
        .order("quantity", { ascending: false });

      if (bomError) {
        return NextResponse.json(
          { error: "Failed to fetch BOM lines" },
          { status: 500 }
        );
      }

      const lines: BomLine[] = (bomLines ?? []).map((l) => ({
        lineNumber: l.line_number,
        quantity: l.quantity,
        referenceDesignator: l.reference_designator,
        cpc: l.cpc,
        description: l.description,
        mpn: l.mpn,
        manufacturer: l.manufacturer,
        mCode: l.m_code,
      }));

      pdfElement = createElement(PrintBomPDF, {
        jobNumber: job.job_number,
        customerName,
        customerCode,
        gmpNumber,
        boardName,
        quantity: job.quantity,
        bomFileName: bom.file_name,
        bomRevision: bom.revision,
        lines,
      });
      fileName = `${job.job_number}-BOM.pdf`;
      break;
    }

    case "reception": {
      if (!bom) {
        return NextResponse.json(
          { error: "No BOM linked to this job" },
          { status: 400 }
        );
      }

      const { data: bomLines2, error: bomError2 } = await supabase
        .from("bom_lines")
        .select(
          "line_number, quantity, mpn, description, manufacturer, m_code"
        )
        .eq("bom_id", bom.id)
        .order("line_number", { ascending: true });

      if (bomError2) {
        return NextResponse.json(
          { error: "Failed to fetch BOM lines" },
          { status: 500 }
        );
      }

      // Build reception lines: qty_needed = qty_per_board * board_qty, plus overage lookup
      // For now, compute totalExpected as qty * boardQty (overage would come from overage_table)
      const boardQty = job.quantity;

      // Fetch overage table for calculation
      const { data: overageRows } = await supabase
        .from("overage_table")
        .select("m_code, qty_threshold, extras")
        .order("m_code")
        .order("qty_threshold", { ascending: true });

      const overageMap = new Map<string, { threshold: number; extras: number }[]>();
      for (const row of overageRows ?? []) {
        const existing = overageMap.get(row.m_code) ?? [];
        existing.push({ threshold: row.qty_threshold, extras: row.extras });
        overageMap.set(row.m_code, existing);
      }

      function getOverage(mCode: string | null, qty: number): number {
        if (!mCode) return 0;
        const tiers = overageMap.get(mCode);
        if (!tiers) return 0;
        let extras = 0;
        for (const tier of tiers) {
          if (qty >= tier.threshold) {
            extras = tier.extras;
          }
        }
        return extras;
      }

      const receptionLines: ReceptionLine[] = (bomLines2 ?? []).map((l) => {
        const qtyNeeded = l.quantity * boardQty;
        const qtyExtra = getOverage(l.m_code, boardQty);
        return {
          lineNumber: l.line_number,
          mpn: l.mpn,
          description: l.description,
          manufacturer: l.manufacturer,
          mCode: l.m_code,
          qtyNeeded,
          qtyExtra,
          totalExpected: qtyNeeded + qtyExtra,
        };
      });

      pdfElement = createElement(ReceptionPDF, {
        jobNumber: job.job_number,
        customerName,
        customerCode,
        gmpNumber,
        boardName,
        quantity: job.quantity,
        procBatchCode,
        lines: receptionLines,
      });
      fileName = `${job.job_number}-Reception.pdf`;
      break;
    }
  }

  const pdfBuffer = await renderToBuffer(pdfElement);
  const bytes = new Uint8Array(pdfBuffer);

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
