import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import { deriveInitialProgrammingStatus } from "@/lib/jobs/programming-status";
import {
  computeDueDate,
  findMatchingTierIndex,
} from "@/lib/jobs/due-date";

async function generateJobNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerCode: string
): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `JB-${yy}${mm}-${customerCode}-`;
  const { count } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .like("job_number", `${prefix}%`);
  return `${prefix}${String((count ?? 0) + 1).padStart(3, "0")}`;
}

export async function GET(req: NextRequest) {
  const { supabase } = await getAuthUser(req);
  // Note: job list is available to all authenticated roles
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const customerId = url.searchParams.get("customer_id");
  const invoicable = url.searchParams.get("invoicable");

  // Special mode: return jobs eligible for invoicing (shipped/delivered, not yet invoiced)
  if (invoicable === "true" && customerId) {
    // Get jobs that are shipped or delivered for this customer
    // jobs has TWO FKs to quotes (quote_id and source_quote_id), so the
    // embed must be explicitly hinted with the constraint name â€”
    // otherwise PostgREST returns a 300 ambiguity error and the
    // dialog silently lands on an empty list.
    const { data: candidateJobs, error: jobsErr } = await supabase
      .from("jobs")
      .select(
        "id, job_number, quantity, gmps(gmp_number, board_name), quotes!jobs_quote_id_fkey(pricing)"
      )
      .eq("customer_id", customerId)
      .in("status", ["shipping", "delivered"])
      .order("created_at", { ascending: false });

    if (jobsErr) {
      return NextResponse.json({ error: jobsErr.message }, { status: 500 });
    }

    // Filter out jobs that already have an invoice
    const { data: existingInvoices } = await supabase
      .from("invoices")
      .select("job_id")
      .eq("customer_id", customerId)
      .neq("status", "cancelled");

    const invoicedJobIds = new Set(
      (existingInvoices ?? []).map((inv) => inv.job_id)
    );

    type CandidateJob = {
      id: string;
      job_number: string;
      quantity: number;
      gmps: { gmp_number: string; board_name: string | null } | null;
      quotes: {
        pricing: {
          tiers?: { board_qty: number; subtotal: number }[];
        };
      } | null;
    };

    const invoicableJobs = ((candidateJobs ?? []) as unknown as CandidateJob[])
      .filter((j) => !invoicedJobIds.has(j.id))
      .map((j) => {
        const tiers = j.quotes?.pricing?.tiers;
        let subtotal = 0;
        if (tiers?.length) {
          const matched =
            tiers.find((t) => t.board_qty === j.quantity) ?? tiers[0];
          subtotal = matched.subtotal;
        }
        return {
          id: j.id,
          job_number: j.job_number,
          quantity: j.quantity,
          gmp_number: j.gmps?.gmp_number ?? "Unknown",
          board_name: j.gmps?.board_name ?? null,
          subtotal,
        };
      });

    return NextResponse.json(invoicableJobs);
  }

  let query = supabase
    .from("jobs")
    .select(
      "id, job_number, status, quantity, scheduled_start, scheduled_completion, created_at, customers(code, company_name), gmps(gmp_number, board_name, board_side)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);
  if (customerId) query = query.eq("customer_id", customerId);

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Job creation from a quote is admin-only â€” production users see jobs
  // through the kanban but don't author new ones. Middleware now admits
  // production to /api/jobs (so the shipment dialog can GET ?status=â€¦),
  // so the role gate has to live here.
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    quote_id: string;
    quantity: number;
    scheduled_start?: string;
    scheduled_completion?: string;
    notes?: string;
  };

  if (!body.quote_id || !body.quantity) {
    return NextResponse.json(
      { error: "quote_id and quantity required" },
      { status: 400 }
    );
  }

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, customer_id, gmp_id, bom_id, status, lead_times, pricing, customers(code)"
    )
    .eq("id", body.quote_id)
    .single();

  if (!quote)
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  const customer = quote.customers as unknown as { code: string } | null;
  const jobNumber = await generateJobNumber(
    supabase,
    customer?.code ?? "UNK"
  );

  // Programming readiness: 'ready' if we've already built this exact BOM
  // before (no revision change), otherwise 'not_ready'.
  const programmingStatus = await deriveInitialProgrammingStatus(
    supabase,
    quote.bom_id
  );

  // Customer-promised due date: derived from the matching quote tier's
  // lead time, anchored to today. Independent of scheduled_completion
  // (which is a production-internal target). Admin can override later
  // for rush orders via the job detail page.
  const tiers =
    (quote as { pricing?: { tiers?: { board_qty: number }[] } }).pricing
      ?.tiers ?? null;
  const tierIdx = findMatchingTierIndex(tiers, body.quantity);
  const computedDueDate =
    tierIdx !== null
      ? computeDueDate({
          leadTimes: (quote as { lead_times?: Record<string, string> | null })
            .lead_times,
          tierIndex: tierIdx,
          baseDate: new Date(),
        })
      : null;

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      job_number: jobNumber,
      quote_id: body.quote_id,
      customer_id: quote.customer_id,
      gmp_id: quote.gmp_id,
      bom_id: quote.bom_id,
      quantity: body.quantity,
      status: "created",
      programming_status: programmingStatus,
      scheduled_start: body.scheduled_start ?? null,
      scheduled_completion: body.scheduled_completion ?? null,
      due_date: computedDueDate,
      notes: body.notes ?? null,
      created_by: user.id,
    })
    .select("id, job_number")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("job_status_log").insert({
    job_id: job.id,
    old_status: null,
    new_status: "created",
    changed_by: user.id,
  });

  return NextResponse.json(job);
}
