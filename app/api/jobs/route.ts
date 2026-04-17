import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/api-auth";

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
    const { data: candidateJobs, error: jobsErr } = await supabase
      .from("jobs")
      .select(
        "id, job_number, quantity, gmps(gmp_number, board_name), quotes(pricing)"
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
      "id, job_number, status, quantity, assembly_type, scheduled_start, scheduled_completion, created_at, customers(code, company_name), gmps(gmp_number, board_name)"
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

  const body = (await req.json()) as {
    quote_id: string;
    quantity: number;
    assembly_type?: string;
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
    .select("id, customer_id, gmp_id, bom_id, status, customers(code)")
    .eq("id", body.quote_id)
    .single();

  if (!quote)
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  if (quote.status !== "accepted") {
    return NextResponse.json(
      { error: "Quote must be accepted first" },
      { status: 400 }
    );
  }

  const customer = quote.customers as unknown as { code: string } | null;
  const jobNumber = await generateJobNumber(
    supabase,
    customer?.code ?? "UNK"
  );

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      job_number: jobNumber,
      quote_id: body.quote_id,
      customer_id: quote.customer_id,
      gmp_id: quote.gmp_id,
      bom_id: quote.bom_id,
      quantity: body.quantity,
      assembly_type: body.assembly_type ?? "TB",
      status: "created",
      scheduled_start: body.scheduled_start ?? null,
      scheduled_completion: body.scheduled_completion ?? null,
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
