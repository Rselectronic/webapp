import { createAdminClient, createClient } from "@/lib/supabase/server";
import { NewProcBatchForm } from "@/components/procurement/new-proc-batch-form";

export default async function NewProcBatchPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  // Fetch procurements that are not already in a batch and not completed
  const { data: procurements } = await admin
    .from("procurements")
    .select(
      "id, proc_code, status, total_lines, lines_ordered, lines_received, created_at, procurement_batch_id, jobs(job_number, quantity, customers(code, company_name), gmps(gmp_number, board_name))"
    )
    .is("procurement_batch_id", null)
    .neq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(100);

  // Normalize the nested join data
  const normalized = (procurements ?? []).map((p) => {
    const job = p.jobs as unknown as {
      job_number: string;
      quantity: number;
      customers: { code: string; company_name: string } | null;
      gmps: { gmp_number: string; board_name: string | null } | null;
    } | null;
    return {
      id: p.id,
      proc_code: p.proc_code,
      status: p.status,
      total_lines: p.total_lines,
      lines_ordered: p.lines_ordered,
      lines_received: p.lines_received,
      created_at: p.created_at,
      jobs: job,
    };
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">New Procurement Batch</h2>
        <p className="text-gray-500 dark:text-gray-400">
          Select procurements to consolidate for batch ordering. Components with the same MPN
          across multiple procurements will be merged, and overage will be recalculated at the
          combined volume — saving money on extras.
        </p>
      </div>
      <NewProcBatchForm procurements={normalized} />
    </div>
  );
}
