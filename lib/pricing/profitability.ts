import type { SupabaseClient } from "@supabase/supabase-js";

export interface JobProfitability {
  job_id: string;
  job_number: string;
  customer_code: string;
  customer_name: string;
  quoted_total: number;
  actual_component_cost: number;
  actual_pcb_cost: number;
  gross_margin: number;
  margin_pct: number;
}

export interface ProfitabilitySummary {
  jobs: JobProfitability[];
  total_quoted: number;
  total_actual: number;
  total_margin: number;
  avg_margin_pct: number;
}

/**
 * Calculate profitability for a single job by comparing
 * quoted pricing against actual procurement costs.
 */
export async function getJobProfitability(
  supabase: SupabaseClient,
  jobId: string
): Promise<JobProfitability | null> {
  // Fetch job with quote and customer
  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, job_number, quantity, quote_id, customers(code, company_name)"
    )
    .eq("id", jobId)
    .single();

  if (!job || !job.quote_id) return null;

  // Fetch the quote pricing
  const { data: quote } = await supabase
    .from("quotes")
    .select("pricing, quantities")
    .eq("id", job.quote_id)
    .single();

  if (!quote) return null;

  // Determine which tier was accepted based on job quantity
  const quantities = quote.quantities as Record<string, number> | null;
  const pricing = quote.pricing as Record<string, unknown> | null;

  let quotedTotal = 0;

  if (pricing && quantities) {
    // pricing.tiers is an array matching the quantities order
    const tiers = (pricing as { tiers?: Array<{ board_qty: number; subtotal: number }> }).tiers;
    if (tiers && Array.isArray(tiers)) {
      // Find the tier matching the job quantity
      const matchingTier = tiers.find((t) => t.board_qty === job.quantity);
      if (matchingTier) {
        quotedTotal = matchingTier.subtotal ?? 0;
      } else {
        // Fallback: use the first tier
        quotedTotal = tiers[0]?.subtotal ?? 0;
      }
    }
  }

  // Fetch actual procurement costs
  const { data: procurements } = await supabase
    .from("procurements")
    .select("id")
    .eq("job_id", jobId);

  let actualComponentCost = 0;
  let actualPcbCost = 0;

  if (procurements && procurements.length > 0) {
    const procIds = procurements.map((p) => p.id);

    const { data: procLines } = await supabase
      .from("procurement_lines")
      .select("unit_price, qty_ordered, m_code, mpn")
      .in("procurement_id", procIds);

    for (const line of procLines ?? []) {
      const lineCost =
        (Number(line.unit_price) || 0) * (line.qty_ordered || 0);
      // PCB lines don't have an m_code and typically have "PCB" in mpn
      // but procurement excludes is_pcb lines, so all costs are component costs
      actualComponentCost += lineCost;
    }
  }

  const customer = job.customers as unknown as {
    code: string;
    company_name: string;
  } | null;

  const totalActual = actualComponentCost + actualPcbCost;
  const grossMargin = quotedTotal - totalActual;
  const marginPct = quotedTotal > 0 ? (grossMargin / quotedTotal) * 100 : 0;

  return {
    job_id: job.id,
    job_number: job.job_number,
    customer_code: customer?.code ?? "?",
    customer_name: customer?.company_name ?? "Unknown",
    quoted_total: Math.round(quotedTotal * 100) / 100,
    actual_component_cost: Math.round(actualComponentCost * 100) / 100,
    actual_pcb_cost: Math.round(actualPcbCost * 100) / 100,
    gross_margin: Math.round(grossMargin * 100) / 100,
    margin_pct: Math.round(marginPct * 10) / 10,
  };
}

/**
 * Calculate profitability across multiple completed/invoiced jobs.
 */
export async function getProfitabilitySummary(
  supabase: SupabaseClient,
  options?: { customerCode?: string; status?: string[] }
): Promise<ProfitabilitySummary> {
  const statuses = options?.status ?? [
    "delivered",
    "invoiced",
    "archived",
    "shipping",
    "production",
    "inspection",
  ];

  let query = supabase
    .from("jobs")
    .select("id, job_number, customers(code)")
    .in("status", statuses)
    .not("quote_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (options?.customerCode) {
    // Need to filter by customer code via a sub-query on customers
    const { data: customers } = await supabase
      .from("customers")
      .select("id")
      .eq("code", options.customerCode);

    if (customers && customers.length > 0) {
      query = query.in(
        "customer_id",
        customers.map((c) => c.id)
      );
    }
  }

  const { data: jobs } = await query;

  const results: JobProfitability[] = [];

  for (const job of jobs ?? []) {
    const profitability = await getJobProfitability(supabase, job.id);
    if (profitability) {
      results.push(profitability);
    }
  }

  const totalQuoted = results.reduce((s, r) => s + r.quoted_total, 0);
  const totalActual = results.reduce(
    (s, r) => s + r.actual_component_cost + r.actual_pcb_cost,
    0
  );
  const totalMargin = totalQuoted - totalActual;
  const avgMarginPct =
    results.length > 0
      ? results.reduce((s, r) => s + r.margin_pct, 0) / results.length
      : 0;

  return {
    jobs: results,
    total_quoted: Math.round(totalQuoted * 100) / 100,
    total_actual: Math.round(totalActual * 100) / 100,
    total_margin: Math.round(totalMargin * 100) / 100,
    avg_margin_pct: Math.round(avgMarginPct * 10) / 10,
  };
}
