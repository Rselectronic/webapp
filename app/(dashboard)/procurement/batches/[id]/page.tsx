import { createClient, createAdminClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ProcBatchWorkflow } from "@/components/procurement/batch-workflow";

export default async function ProcBatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const { data: batch } = await admin
    .from("procurement_batches")
    .select("*")
    .eq("id", id)
    .single();

  if (!batch) notFound();

  const { data: items } = await admin
    .from("procurement_batch_items")
    .select("*, procurements(proc_code, status, total_lines, jobs(job_number, quantity, customers(code, company_name), gmps(gmp_number, board_name)))")
    .eq("batch_id", id)
    .order("board_letter", { ascending: true });

  const { data: lines } = await admin
    .from("procurement_batch_lines")
    .select("*")
    .eq("batch_id", id)
    .order("line_number", { ascending: true });

  const { data: log } = await admin
    .from("procurement_batch_log")
    .select("*")
    .eq("batch_id", id)
    .order("created_at", { ascending: true });

  return (
    <ProcBatchWorkflow
      batch={batch}
      items={(items ?? []) as never[]}
      lines={(lines ?? []) as never[]}
      log={(log ?? []) as never[]}
    />
  );
}
