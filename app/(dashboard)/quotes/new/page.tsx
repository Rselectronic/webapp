import { createClient } from "@/lib/supabase/server";
import { NewQuoteForm } from "@/components/quotes/new-quote-form";

export default async function NewQuotePage() {
  const supabase = await createClient();
  const { data: customers } = await supabase
    .from("customers")
    .select("id, code, company_name")
    .eq("is_active", true)
    .order("code");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">New Quote</h2>
        <p className="text-sm text-gray-500">
          Select a parsed BOM, enter quantities, and generate pricing.
        </p>
      </div>
      <NewQuoteForm customers={customers ?? []} />
    </div>
  );
}
