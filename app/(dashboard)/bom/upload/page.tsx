import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "@/components/bom/upload-form";

interface SearchParams {
  /** Pre-select this customer when launched from a customer or GMP detail page. */
  customer_id?: string;
  /** Pre-select this GMP. Implies customer_id, but we resolve it independently. */
  gmp_id?: string;
}

export default async function BomUploadPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: customers } = await supabase
    .from("customers")
    .select("id, code, company_name")
    .eq("is_active", true)
    .order("code", { ascending: true });

  // Resolve any pre-selection from the URL. When the operator clicked
  // "Upload BOM" on a GMP detail page we already know both customer and
  // GMP — skip those steps and drop them straight at the file picker.
  let prefilledGmp: {
    id: string;
    gmp_number: string;
    board_name: string | null;
    customer_id: string;
  } | null = null;
  if (params.gmp_id) {
    const { data: gmp } = await supabase
      .from("gmps")
      .select("id, gmp_number, board_name, customer_id")
      .eq("id", params.gmp_id)
      .maybeSingle();
    if (gmp) prefilledGmp = gmp;
  }
  const prefilledCustomerId =
    prefilledGmp?.customer_id ?? params.customer_id ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Upload BOM</h2>
        <p className="text-gray-500">
          Upload a Bill of Materials file to parse and classify components.
        </p>
      </div>
      <UploadForm
        customers={customers ?? []}
        prefilledCustomerId={prefilledCustomerId}
        prefilledGmp={prefilledGmp}
      />
    </div>
  );
}
