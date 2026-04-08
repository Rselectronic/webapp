import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { BatchWorkflow } from "@/components/quotes/batch-workflow";

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: batch } = await supabase
    .from("quote_batches")
    .select(`
      *,
      customers(code, company_name),
      quote_batch_boms(*, boms(file_name, component_count), gmps(gmp_number, board_name))
    `)
    .eq("id", id)
    .single();

  if (!batch) notFound();

  const { data: lines } = await supabase
    .from("quote_batch_lines")
    .select("*")
    .eq("batch_id", id)
    .order("line_number", { ascending: true });

  const { data: log } = await supabase
    .from("quote_batch_log")
    .select("*")
    .eq("batch_id", id)
    .order("created_at", { ascending: true });

  return (
    <BatchWorkflow
      batch={batch}
      lines={lines ?? []}
      log={log ?? []}
    />
  );
}
