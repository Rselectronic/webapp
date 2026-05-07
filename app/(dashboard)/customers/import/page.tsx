import { isAdminRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CustomerImportWizard } from "@/components/customers/customer-import-wizard";

export default async function CustomerImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Admin-only â€” customer import wholesale-rewrites the directory.
  // (Pre-088 this gate looked for legacy 'ceo' / 'operations_manager'
  // strings that no longer exist, so the page was effectively unreachable
  // for everyone. Now matches the canonical admin role.)
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role)) redirect("/");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Import customers</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Paste tab-separated rows from Excel or upload an .xlsx file. Map the columns, preview, then import.
        </p>
      </div>
      <CustomerImportWizard />
    </div>
  );
}
