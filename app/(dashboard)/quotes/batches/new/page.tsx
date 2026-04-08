import { createClient } from "@/lib/supabase/server";
import { NewBatchForm } from "@/components/quotes/new-batch-form";

export default async function NewBatchPage() {
  const supabase = await createClient();

  const { data: customers } = await supabase
    .from("customers")
    .select("id, code, company_name")
    .eq("is_active", true)
    .order("code", { ascending: true });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">New Quote Batch</h2>
        <p className="text-gray-500">
          Select a customer and their parsed BOMs to create a quoting batch.
          You&apos;ll assign M-codes, calculate extras, and run pricing step by step.
        </p>
      </div>
      <NewBatchForm customers={customers ?? []} />
    </div>
  );
}
