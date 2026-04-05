import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * rs_business_overview — High-level business snapshot for AI orientation.
 * Any AI connecting for the first time calls this to understand the current
 * state of the business in one shot.
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [
      customersRes,
      quotesRes,
      jobsRes,
      invoicesRes,
      jobsByStatusRes,
      recentQuotesRes,
      recentJobsRes,
    ] = await Promise.all([
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      supabase
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .in("status", ["draft", "review", "sent"]),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .not("status", "in", '("delivered","invoiced","archived")'),
      supabase
        .from("invoices")
        .select("id, total, status")
        .in("status", ["sent", "overdue"]),
      supabase.from("jobs").select("status").not("status", "in", '("archived")'),
      supabase
        .from("quotes")
        .select("id, quote_number, status, created_at, customers(company_name)")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("jobs")
        .select("id, job_number, status, created_at, customers(company_name)")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    // Aggregate jobs by status
    const jobsByStatus: Record<string, number> = {};
    for (const job of jobsByStatusRes.data ?? []) {
      jobsByStatus[job.status] = (jobsByStatus[job.status] ?? 0) + 1;
    }

    // Outstanding invoice totals
    const invoiceData = invoicesRes.data ?? [];
    const totalOutstanding = invoiceData.reduce(
      (sum, inv) => sum + (Number(inv.total) || 0),
      0
    );
    const overdueCount = invoiceData.filter(
      (inv) => inv.status === "overdue"
    ).length;

    // Build recent activity from quotes and jobs
    type ActivityItem = { type: string; title: string; status: string; date: string };
    const recentActivity: ActivityItem[] = [];

    for (const q of recentQuotesRes.data ?? []) {
      const row = q as Record<string, unknown>;
      const customers = row.customers as
        | { company_name: string }
        | { company_name: string }[]
        | null;
      const name = Array.isArray(customers)
        ? customers[0]?.company_name
        : customers?.company_name;
      recentActivity.push({
        type: "quote",
        title: `${row.quote_number} — ${name ?? "Unknown"}`,
        status: row.status as string,
        date: row.created_at as string,
      });
    }

    for (const j of recentJobsRes.data ?? []) {
      const row = j as Record<string, unknown>;
      const customers = row.customers as
        | { company_name: string }
        | { company_name: string }[]
        | null;
      const name = Array.isArray(customers)
        ? customers[0]?.company_name
        : customers?.company_name;
      recentActivity.push({
        type: "job",
        title: `${row.job_number} — ${name ?? "Unknown"}`,
        status: row.status as string,
        date: row.created_at as string,
      });
    }

    recentActivity.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return NextResponse.json({
      company:
        "RS PCB Assembly (R.S. Electronique Inc.), Montreal, ~$2.5M/yr, 5-6 people",
      active_customers: customersRes.count ?? 0,
      open_quotes: quotesRes.count ?? 0,
      active_jobs: jobsRes.count ?? 0,
      jobs_by_status: jobsByStatus,
      outstanding_invoices: {
        total_amount: totalOutstanding,
        overdue_count: overdueCount,
      },
      recent_activity: recentActivity.slice(0, 10),
    });
  } catch (err) {
    console.error("[MCP OVERVIEW]", err);
    return NextResponse.json(
      { error: "Failed to fetch overview" },
      { status: 500 }
    );
  }
}
