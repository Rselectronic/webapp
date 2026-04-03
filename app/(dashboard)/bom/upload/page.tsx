import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "@/components/bom/upload-form";

export default async function BomUploadPage() {
  const supabase = await createClient();

  const { data: customers } = await supabase
    .from("customers")
    .select("id, code, company_name")
    .eq("is_active", true)
    .order("code", { ascending: true });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Upload BOM</h2>
        <p className="text-gray-500">
          Upload a Bill of Materials file to parse and classify components.
        </p>
      </div>
      <UploadForm customers={customers ?? []} />
    </div>
  );
}
