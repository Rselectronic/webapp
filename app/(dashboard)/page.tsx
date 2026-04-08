import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils/format";
import { KpiCard } from "@/components/kpi-card";
import { ActiveWorkflows, type ActiveWorkflowItem } from "@/components/workflow/active-workflows";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import {
  AlertTriangle,
  Briefcase,
  Calculator,
  Clock,
  DollarSign,
  Factory,
  FileText,
  TrendingUp,
  Users,
} from "lucide-react";

type ActivityItem = {
  id: string;
  type: "quote" | "job" | "invoice";
  label: string;
  status: string;
  customerCode: string | null;
  createdAt: string;
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "draft":
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    case "review":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300";
    case "sent":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
    case "accepted":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
    case "rejected":
    case "overdue":
    case "cancelled":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
    case "paid":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
    case "production":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300";
    case "procurement":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  }
}

function activityIcon(type: "quote" | "job" | "invoice") {
  switch (type) {
    case "quote":
      return <Calculator className="h-4 w-4 text-blue-500" />;
    case "job":
      return <Briefcase className="h-4 w-4 text-purple-500" />;
    case "invoice":
      return <FileText className="h-4 w-4 text-green-500" />;
  }
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthStart = startOfMonth.toISOString();

  // Primary KPI queries + secondary KPI queries + recent activity — all in parallel
  const [
    customersResult,
    quotesResult,
    jobsResult,
    invoicesResult,
    quotesThisMonthResult,
    jobsInProductionResult,
    overdueInvoicesResult,
    avgQuoteResult,
    recentQuotes,
    recentJobs,
    recentInvoices,
    activeWorkflowJobs,
  ] = await Promise.all([
    // Primary KPIs
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
      .select("total")
      .in("status", ["sent", "overdue"]),
    // Secondary KPIs
    supabase
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStart),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "production"),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("status", "overdue"),
    supabase
      .from("quotes")
      .select("pricing")
      .not("pricing", "is", null),
    // Recent activity
    supabase
      .from("quotes")
      .select("id, quote_number, status, created_at, customers(code)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("jobs")
      .select("id, job_number, status, created_at, customers(code)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, total, created_at, customers(code)")
      .order("created_at", { ascending: false })
      .limit(5),
    // Active workflows — recent jobs not archived, with linked entities
    supabase
      .from("jobs")
      .select(
        "id, job_number, status, bom_id, quote_id, customer_id, customers(code, company_name), gmps(gmp_number)"
      )
      .not("status", "in", '("archived")')
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  // Compute KPI values
  const activeCustomers = customersResult.count ?? 0;
  const openQuotes = quotesResult.count ?? 0;
  const activeJobs = jobsResult.count ?? 0;
  const outstandingAmount =
    invoicesResult.data?.reduce(
      (sum, inv) => sum + (Number(inv.total) || 0),
      0
    ) ?? 0;

  const quotesThisMonth = quotesThisMonthResult.count ?? 0;
  const jobsInProduction = jobsInProductionResult.count ?? 0;
  const overdueInvoices = overdueInvoicesResult.count ?? 0;

  // Calculate average quote value from first tier pricing
  let avgQuoteValue = 0;
  if (avgQuoteResult.data && avgQuoteResult.data.length > 0) {
    const values = avgQuoteResult.data
      .map((q) => {
        const pricing = q.pricing as Record<string, unknown> | null;
        if (!pricing) return null;
        // Try to extract the first tier total or per_unit
        const tiers = Object.values(pricing);
        if (tiers.length > 0) {
          const firstTier = tiers[0] as Record<string, unknown> | null;
          if (firstTier && typeof firstTier === "object") {
            return Number(firstTier.per_unit) || Number(firstTier.total) || 0;
          }
        }
        return 0;
      })
      .filter((v): v is number => v !== null && v > 0);
    if (values.length > 0) {
      avgQuoteValue = values.reduce((a, b) => a + b, 0) / values.length;
    }
  }

  // Merge recent activity
  const activity: ActivityItem[] = [];

  if (recentQuotes.data) {
    for (const q of recentQuotes.data) {
      const custArr = q.customers as unknown as { code: string }[] | null;
      const cust = custArr?.[0] ?? null;
      activity.push({
        id: q.id,
        type: "quote",
        label: q.quote_number,
        status: q.status,
        customerCode: cust?.code ?? null,
        createdAt: q.created_at,
      });
    }
  }

  if (recentJobs.data) {
    for (const j of recentJobs.data) {
      const custArr2 = j.customers as unknown as { code: string }[] | null;
      const cust2 = custArr2?.[0] ?? null;
      activity.push({
        id: j.id,
        type: "job",
        label: j.job_number,
        status: j.status,
        customerCode: cust2?.code ?? null,
        createdAt: j.created_at,
      });
    }
  }

  if (recentInvoices.data) {
    for (const inv of recentInvoices.data) {
      const custArr3 = inv.customers as unknown as { code: string }[] | null;
      const cust3 = custArr3?.[0] ?? null;
      activity.push({
        id: inv.id,
        type: "invoice",
        label: inv.invoice_number,
        status: inv.status,
        customerCode: cust3?.code ?? null,
        createdAt: inv.created_at,
      });
    }
  }

  activity.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const recentActivity = activity.slice(0, 10);

  // Build active workflow items from jobs
  const workflows: ActiveWorkflowItem[] = (activeWorkflowJobs.data ?? []).map(
    (j) => {
      const jCust = j.customers as unknown as {
        code: string;
        company_name: string;
      } | null;
      const jGmp = j.gmps as unknown as { gmp_number: string } | null;
      return {
        title: `${jCust?.code ?? "?"} / ${jGmp?.gmp_number ?? j.job_number}`,
        entities: {
          bomId: j.bom_id ?? undefined,
          bomStatus: "parsed" as const,
          quoteId: j.quote_id ?? undefined,
          quoteStatus: j.quote_id ? "accepted" : undefined,
          jobId: j.id,
          jobStatus: j.status,
        },
      };
    }
  );

  const overviewContent = (
    <div className="space-y-6">
      {/* Primary KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Active Customers"
          value={activeCustomers}
          description="Total active accounts"
          icon={Users}
        />
        <KpiCard
          title="Open Quotes"
          value={openQuotes}
          description="Draft, review, or sent"
          icon={Calculator}
        />
        <KpiCard
          title="Active Jobs"
          value={activeJobs}
          description="In progress"
          icon={Briefcase}
        />
        <KpiCard
          title="Outstanding Invoices"
          value={formatCurrency(outstandingAmount)}
          description="Sent + overdue balance"
          icon={DollarSign}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Quotes This Month"
          value={quotesThisMonth}
          description="Created this month"
          icon={Clock}
        />
        <KpiCard
          title="Jobs in Production"
          value={jobsInProduction}
          description="Currently on the floor"
          icon={Factory}
        />
        <KpiCard
          title="Avg Quote Value"
          value={avgQuoteValue > 0 ? formatCurrency(avgQuoteValue) : "--"}
          description="Per unit, first tier"
          icon={TrendingUp}
        />
        <KpiCard
          title="Overdue Invoices"
          value={overdueInvoices}
          description="Past due date"
          icon={AlertTriangle}
        />
      </div>

      {/* Recent Activity */}
      <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="border-b px-6 py-4 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Recent Activity
          </h3>
        </div>
        {recentActivity.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-sm">
              Activity feed will appear here as quotes, jobs, and invoices are
              created.
            </p>
          </div>
        ) : (
          <ul className="divide-y dark:divide-gray-800">
            {recentActivity.map((item) => (
              <li
                key={`${item.type}-${item.id}`}
                className="flex items-center gap-4 px-6 py-3"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 dark:bg-gray-900">
                  {activityIcon(item.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {item.type === "quote" && `Quote ${item.label}`}
                    {item.type === "job" && `Job ${item.label}`}
                    {item.type === "invoice" && `Invoice ${item.label}`}
                    {item.customerCode && (
                      <span className="text-gray-500">
                        {" "}
                        &middot; {item.customerCode}
                      </span>
                    )}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(item.status)}`}
                >
                  {item.status}
                </span>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {timeAgo(item.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  const workflowsContent = (
    <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
      <div className="border-b px-6 py-4 dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Active Workflows
        </h3>
        <p className="text-sm text-gray-500">
          Track jobs through the full lifecycle: BOM &rarr; Classify &rarr; Quote &rarr; Job &rarr; Procurement &rarr; Production &rarr; Ship &rarr; Invoice
        </p>
      </div>
      <ActiveWorkflows workflows={workflows} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h2>
        <p className="text-gray-500">
          Welcome to the RS PCB Assembly management system.
        </p>
      </div>

      <DashboardTabs
        overviewContent={overviewContent}
        workflowsContent={workflowsContent}
        workflowCount={workflows.length}
      />
    </div>
  );
}
