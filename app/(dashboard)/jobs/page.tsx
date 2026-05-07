import Link from "next/link";
import { LayoutGrid, List, Download, Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { JobKanban } from "@/components/jobs/job-kanban";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import { formatDate } from "@/lib/utils/format";

interface Job {
  id: string;
  job_number: string;
  status: string;
  quantity: number;
  scheduled_start: string | null;
  /** Production's internal target completion date (derived from quote
   *  lead-time at job creation). Distinct from due_date which is the
   *  customer-promised deadline. */
  scheduled_completion: string | null;
  /** Customer-promised delivery deadline (set on job creation from
   *  quote lead-time; admin can override). Distinct from
   *  scheduled_completion which is production's internal target. */
  due_date: string | null;
  created_at: string;
  po_number: string | null;
  po_date: string | null;
  programming_status: string | null;
  gmp_id: string | null;
  procurement_id: string | null;
  customers: { code: string; company_name: string } | null;
  gmps: { gmp_number: string; board_name: string | null; board_side: string | null } | null;
  procurements: {
    id: string;
    proc_code: string | null;
    procurement_mode: string | null;
  } | null;
  source_quote: { id: string; quote_number: string } | null;
}

interface PcbOrderRow {
  procurement_id: string;
  gmp_id: string | null;
  status: string | null;
  created_at: string;
}

interface StencilOrderRow {
  procurement_id: string;
  covered_gmp_ids: string[] | null;
  stencil_type: string | null;
  status: string | null;
  created_at: string;
}

interface SelectionRow {
  procurement_id: string;
  order_status: string | null;
}

function modeLabel(mode: string | null | undefined): { label: string; raw: string } {
  switch (mode) {
    case "turnkey":
      return { label: "Turnkey", raw: "turnkey" };
    case "consignment":
    case "consign_parts_supplied":
    case "consign_pcb_supplied":
      return { label: "Consignment", raw: "consignment" };
    case "assembly_only":
      return { label: "Assy Only", raw: "assembly_only" };
    default:
      return { label: "—", raw: "unknown" };
  }
}

function Badge({
  text,
  tone,
}: {
  text: string;
  tone: "grey" | "amber" | "green" | "red" | "blue";
}) {
  const cls =
    tone === "green"
      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
      : tone === "amber"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
      : tone === "red"
      ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
      : tone === "blue"
      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
      : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {text}
    </span>
  );
}

function pcbStatusTone(status: string | null): "grey" | "amber" | "green" | "red" {
  if (!status) return "grey";
  if (status === "received") return "green";
  if (status === "cancelled") return "red";
  if (status === "shipped") return "amber";
  return "amber"; // ordered
}

function stencilStatusTone(status: string | null): "grey" | "amber" | "green" | "red" {
  return pcbStatusTone(status);
}

function programmingTone(
  status: string | null
): "grey" | "amber" | "green" | "blue" {
  // New three-state schema (migration 090):
  //   not_required → grey, ready → green, not_ready → amber.
  if (!status || status === "not_required") return "grey";
  if (status === "ready") return "green";
  return "amber"; // not_ready (or any unknown legacy value)
}

function programmingLabel(status: string | null): string {
  if (!status) return "not ready";
  if (status === "not_ready") return "not ready";
  if (status === "not_required") return "not required";
  return status; // "ready"
}

type ComponentsRollup = "not_started" | "partial" | "ordered" | "all_received";

function rollupComponents(rows: SelectionRow[]): ComponentsRollup {
  if (rows.length === 0) return "not_started";
  const statuses = rows.map((r) => r.order_status).filter((s): s is string => !!s);
  if (statuses.length === 0) return "not_started";
  const allReceived = statuses.every((s) => s === "received");
  if (allReceived) return "all_received";
  const allOrderedish = statuses.every(
    (s) => s === "ordered" || s === "shipped" || s === "received"
  );
  if (allOrderedish) return "ordered";
  return "partial";
}

function componentsBadge(r: ComponentsRollup) {
  switch (r) {
    case "not_started":
      return <Badge text="not started" tone="grey" />;
    case "partial":
      return <Badge text="partial" tone="amber" />;
    case "ordered":
      return <Badge text="ordered" tone="blue" />;
    case "all_received":
      return <Badge text="received" tone="green" />;
  }
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string }>;
}) {
  const { view, status } = await searchParams;
  const activeView = view === "table" ? "table" : "kanban";

  const supabase = await createClient();

  let query = supabase
    .from("jobs")
    .select(
      "id, job_number, status, quantity, scheduled_start, scheduled_completion, due_date, created_at, po_number, po_date, programming_status, gmp_id, procurement_id, customers(code, company_name), gmps(gmp_number, board_name, board_side), procurements!jobs_procurement_id_fkey(id, proc_code, procurement_mode), source_quote:quotes!jobs_source_quote_id_fkey(id, quote_number)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  const jobs = (data ?? []) as unknown as Job[];

  // Procurement ids visible in the current page — used to scope the
  // auxiliary fetches (pcb_orders, stencil_orders, selections).
  const procIds = Array.from(
    new Set(jobs.map((j) => j.procurement_id).filter((p): p is string => !!p))
  );

  // Only run the auxiliary fetches when there is something to look up.
  const [pcbOrdersRes, stencilOrdersRes, selectionsRes] = await Promise.all([
    procIds.length
      ? supabase
          .from("pcb_orders")
          .select("procurement_id, gmp_id, status, created_at")
          .in("procurement_id", procIds)
      : Promise.resolve({ data: [] as PcbOrderRow[] }),
    procIds.length
      ? supabase
          .from("stencil_orders")
          .select("procurement_id, covered_gmp_ids, stencil_type, status, created_at")
          .in("procurement_id", procIds)
      : Promise.resolve({ data: [] as StencilOrderRow[] }),
    procIds.length
      ? supabase
          .from("procurement_line_selections")
          .select("procurement_id, order_status")
          .in("procurement_id", procIds)
      : Promise.resolve({ data: [] as SelectionRow[] }),
  ]);

  const pcbOrders = (pcbOrdersRes.data ?? []) as unknown as PcbOrderRow[];
  const stencilOrders = (stencilOrdersRes.data ?? []) as unknown as StencilOrderRow[];
  const selections = (selectionsRes.data ?? []) as unknown as SelectionRow[];

  // Stencil library lookup — maps gmp_number -> { stencil_name, position_no }.
  // Used to surface an on-shelf stencil when no active stencil order exists.
  const gmpNumbers = Array.from(
    new Set(
      jobs
        .map((j) => j.gmps?.gmp_number)
        .filter((g): g is string => !!g)
    )
  );
  const libByGmp = new Map<string, { stencil_name: string; position_no: number | null; comments: string | null }>();
  if (gmpNumbers.length > 0) {
    const { data: libRows } = await supabase
      .from("stencils_library_gmps")
      .select("gmp_number, stencils_library!inner(stencil_name, position_no, comments, discarded_at)")
      .in("gmp_number", gmpNumbers);
    for (const row of (libRows ?? []) as unknown as Array<{
      gmp_number: string;
      stencils_library: { stencil_name: string; position_no: number | null; comments: string | null; discarded_at: string | null } | null;
    }>) {
      // Skip discarded stencils — inventory no longer has them.
      if (row.stencils_library && !row.stencils_library.discarded_at && !libByGmp.has(row.gmp_number)) {
        libByGmp.set(row.gmp_number, {
          stencil_name: row.stencils_library.stencil_name,
          position_no: row.stencils_library.position_no,
          comments: row.stencils_library.comments,
        });
      }
    }
  }

  // Latest pcb_order per (procurement_id, gmp_id).
  const pcbByKey = new Map<string, PcbOrderRow>();
  for (const p of pcbOrders) {
    const key = `${p.procurement_id}::${p.gmp_id ?? ""}`;
    const prev = pcbByKey.get(key);
    if (!prev || new Date(p.created_at) > new Date(prev.created_at)) {
      pcbByKey.set(key, p);
    }
  }

  // Latest stencil_order per (procurement_id, gmp_id) where gmp_id is in
  // covered_gmp_ids.
  const stencilByKey = new Map<string, StencilOrderRow>();
  for (const s of stencilOrders) {
    const covered = s.covered_gmp_ids ?? [];
    for (const gid of covered) {
      const key = `${s.procurement_id}::${gid}`;
      const prev = stencilByKey.get(key);
      if (!prev || new Date(s.created_at) > new Date(prev.created_at)) {
        stencilByKey.set(key, s);
      }
    }
  }

  // Aggregate selections per procurement_id for components rollup.
  const selectionsByProc = new Map<string, SelectionRow[]>();
  for (const r of selections) {
    const arr = selectionsByProc.get(r.procurement_id) ?? [];
    arr.push(r);
    selectionsByProc.set(r.procurement_id, arr);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Job Queue</h2>
          <p className="mt-1 text-gray-500">
            Track jobs from creation through production to delivery.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/proc/pending">
            <Button size="sm" variant="secondary">Go to Pending Orders</Button>
          </Link>
          <Link href="/jobs/new">
            <Button size="sm">New Job from PO</Button>
          </Link>
          <a href="/api/export?table=jobs" download>
            <Button variant="outline" size="sm">
              <Download className="mr-1.5 h-4 w-4" />
              Export CSV
            </Button>
          </a>
          <Link href={`/jobs?view=kanban${status ? `&status=${status}` : ""}`}>
            <Button
              variant={activeView === "kanban" ? "default" : "outline"}
              size="sm"
            >
              <LayoutGrid className="mr-1.5 h-4 w-4" />
              Kanban
            </Button>
          </Link>
          <Link href={`/jobs?view=table${status ? `&status=${status}` : ""}`}>
            <Button
              variant={activeView === "table" ? "default" : "outline"}
              size="sm"
            >
              <List className="mr-1.5 h-4 w-4" />
              Table
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          Failed to load jobs: {error.message}
        </div>
      )}

      {jobs.length === 0 && !error ? (
        <EmptyState
          icon={Briefcase}
          title="No jobs yet"
          description="Jobs are created when a quote is accepted. Start by creating and sending a quote to a customer."
        >
          <Link href="/quotes/new">
            <Button variant="outline">Create a Quote</Button>
          </Link>
        </EmptyState>
      ) : activeView === "kanban" ? (
        <JobKanban jobs={jobs} />
      ) : (
        // Flat table — no PROC-batch grouping. The proc batch code lives
        // in its own column instead. Column order matches the spec given
        // by the CEO: customer/PO/GMP/order-type/proc-batch/quote/qty/
        // PO date/lead-time due/customer due, then the four status pills.
        <div className="table-responsive overflow-x-auto rounded-md border">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800 [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Job #</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Customer</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">PO Number</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">GMP Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Order Type</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Proc Batch</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Quote #</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Order Qty</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">PO Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500" title="Production's internal target — derived from quote lead-time at job creation">
                  Due Date (Lead Time)
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500" title="Customer-promised deadline">
                  Due Date (Customer)
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">PCB Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Stencil</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Components</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Programming</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {jobs.map((job) => {
                const mode = modeLabel(job.procurements?.procurement_mode);
                const pcbKey = `${job.procurement_id ?? ""}::${job.gmp_id ?? ""}`;
                const pcb = job.procurement_id ? pcbByKey.get(pcbKey) : undefined;
                const stencil = job.procurement_id ? stencilByKey.get(pcbKey) : undefined;
                const procSelections = job.procurement_id
                  ? selectionsByProc.get(job.procurement_id) ?? []
                  : [];
                const compsRollup = rollupComponents(procSelections);
                const fmtDate = (d: string | null) => (d ? formatDate(d) : "—");
                return (
                  <tr
                    key={job.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    {/* 1. Job # — internal RS identifier, primary link to
                        job detail. Distinct from PO Number (customer's). */}
                    <td className="px-4 py-2 font-mono text-xs">
                      <a
                        href={`/jobs/${job.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {job.job_number}
                      </a>
                    </td>
                    {/* 2. Customer Name */}
                    <td className="px-4 py-2">
                      {job.customers
                        ? `${job.customers.code} — ${job.customers.company_name}`
                        : "—"}
                    </td>
                    {/* 3. PO Number — plain text now that Job # carries the
                        link (kept distinct so the customer's identifier and
                        ours don't collide). */}
                    <td className="px-4 py-2 font-mono text-xs">
                      {job.po_number ?? "—"}
                    </td>
                    {/* 3. GMP Name — prefer the human-readable board_name
                        (e.g. "Knorr-Bremse air monitor"), fall back to the
                        technical gmp_number (e.g. "TL265-5040-000-T") when
                        no board_name is on file. */}
                    <td className="px-4 py-2 text-xs">
                      {job.gmps?.board_name ? (
                        <span title={job.gmps.gmp_number}>{job.gmps.board_name}</span>
                      ) : (
                        <span className="font-mono">{job.gmps?.gmp_number ?? "—"}</span>
                      )}
                    </td>
                    {/* 4. Order Type — full label */}
                    <td className="px-4 py-2 text-xs">
                      <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        {mode.label}
                      </span>
                    </td>
                    {/* 5. Proc Batch Code — links to /proc/[id] */}
                    <td className="px-4 py-2 font-mono text-xs">
                      {job.procurements?.id ? (
                        <Link
                          href={`/proc/${job.procurements.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {job.procurements.proc_code ?? "(unnamed)"}
                        </Link>
                      ) : (
                        <span className="italic text-gray-400">unassigned</span>
                      )}
                    </td>
                    {/* 6. Quote # — links to quote detail */}
                    <td className="px-4 py-2 font-mono text-xs">
                      {job.source_quote ? (
                        <Link
                          href={`/quotes/${job.source_quote.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {job.source_quote.quote_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    {/* 7. Order Qty */}
                    <td className="px-4 py-2 text-right font-mono">{job.quantity}</td>
                    {/* 8. PO Date */}
                    <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">
                      {fmtDate(job.po_date)}
                    </td>
                    {/* 9. Due Date as per lead time (production target) */}
                    <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">
                      {fmtDate(job.scheduled_completion)}
                    </td>
                    {/* 10. Due date as per Customer */}
                    <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">
                      {fmtDate(job.due_date)}
                    </td>
                    {/* 11. PCB Status */}
                    <td className="px-4 py-2">
                      {pcb ? (
                        <Badge text={pcb.status ?? "—"} tone={pcbStatusTone(pcb.status)} />
                      ) : (
                        <Badge text="none" tone="grey" />
                      )}
                    </td>
                    {/* 12. Stencil */}
                    <td className="px-4 py-2">
                      {(() => {
                        const lib = job.gmps?.gmp_number
                          ? libByGmp.get(job.gmps.gmp_number)
                          : undefined;
                        // Active (unreceived) stencil order takes precedence.
                        if (stencil && stencil.status !== "received") {
                          return (
                            <Badge
                              text={stencil.status ?? "—"}
                              tone={stencilStatusTone(stencil.status)}
                            />
                          );
                        }
                        // Library hit — on the shelf.
                        if (lib) {
                          return (
                            <span
                              className="text-xs"
                              title={(() => {
                                const parts: string[] = [];
                                if (lib.position_no != null) parts.push(`Position ${lib.position_no}`);
                                if (lib.comments) parts.push(lib.comments);
                                return parts.length ? parts.join(" · ") : undefined;
                              })()}
                            >
                              {lib.stencil_name}
                            </span>
                          );
                        }
                        // Received order without a library match (transitional).
                        if (stencil && stencil.status === "received" && stencil.stencil_type) {
                          return <span className="text-xs">{stencil.stencil_type}</span>;
                        }
                        return <Badge text="none" tone="grey" />;
                      })()}
                    </td>
                    {/* 13. Components */}
                    <td className="px-4 py-2">{componentsBadge(compsRollup)}</td>
                    {/* 14. Programming */}
                    <td className="px-4 py-2">
                      <Badge
                        text={programmingLabel(job.programming_status)}
                        tone={programmingTone(job.programming_status)}
                      />
                    </td>
                    {/* 15. Status — overall job lifecycle pill. */}
                    <td className="px-4 py-2">
                      <JobStatusBadge status={job.status} />
                    </td>
                    {/* 16. Created — when the job row was created in RS. */}
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">
                      {fmtDate(job.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
