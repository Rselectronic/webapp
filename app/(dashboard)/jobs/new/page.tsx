import { createClient } from "@/lib/supabase/server";
import { NewJobFromPoForm } from "@/components/jobs/new-job-from-po-form";

export default async function NewJobFromPoPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase
    .from("customers")
    .select("id, code, company_name")
    .eq("is_active", true)
    .order("code");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          New Job from PO
        </h2>
        <p className="text-sm text-gray-500">
          Enter customer PO details. The system will find the best-matching
          quote tier and freeze the price on the job.
        </p>
      </div>
      <NewJobFromPoForm customers={customers ?? []} />
    </div>
  );
}
