import { createClient } from "@/lib/supabase/server";
import { NewQuoteForm } from "@/components/quotes/new-quote-form";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ bom_id?: string }>;
}) {
  const { bom_id } = await searchParams;
  const supabase = await createClient();

  const [{ data: customers }, prefilledBomResult] = await Promise.all([
    supabase
      .from("customers")
      .select("id, code, company_name")
      .eq("is_active", true)
      .order("code"),
    bom_id
      ? supabase
          .from("boms")
          .select("id, customer_id, status")
          .eq("id", bom_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const prefilledBom = prefilledBomResult.data;
  const canPrefill = prefilledBom?.status === "parsed";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">New Quote</h2>
        <p className="text-sm text-gray-500">
          {canPrefill
            ? "BOM pre-selected — set your pricing tiers and calculate."
            : "Select a parsed BOM, enter quantities, and generate pricing."}
        </p>
      </div>
      <NewQuoteForm
        customers={customers ?? []}
        initialCustomerId={canPrefill ? prefilledBom!.customer_id : undefined}
        initialBomId={canPrefill ? prefilledBom!.id : undefined}
      />
    </div>
  );
}
