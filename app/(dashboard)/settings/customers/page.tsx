import { isAdminRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BomConfigEditor } from "@/components/settings/bom-config-editor";
export default async function CustomerBomConfigsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role)) redirect("/");

  const { data: customers } = await supabase
    .from("customers")
    .select("id, code, company_name, bom_config")
    .order("code", { ascending: true });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Customer BOM Configs
        </h2>
        <p className="text-sm text-gray-500">
          Per-customer BOM parsing configurations. These control column
          mappings, encoding, header rows, and other parsing behavior.
        </p>
      </div>

      {!customers || customers.length === 0 ? (
        <p className="text-sm text-gray-500">No customers found.</p>
      ) : (
        <div className="space-y-4">
          {customers.map((c) => (
            <BomConfigEditor
              key={c.id}
              customerId={c.id}
              customerCode={`${c.code} - ${c.company_name}`}
              currentConfig={
                (c.bom_config as Record<string, unknown>) ?? {}
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
