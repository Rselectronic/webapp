// ----------------------------------------------------------------------------
// /settings/historic-import — bulk-import legacy invoices for revenue
// reporting continuity. Admin-only. The import is atomic — a single bad
// row rejects the whole file with a per-row error list, so the file the
// operator commits matches the books bit-for-bit.
// ----------------------------------------------------------------------------

import { redirect } from "next/navigation";
import { isAdminRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { HistoricImportWizard } from "@/components/settings/historic-import-wizard";

export default async function HistoricImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_active || !isAdminRole(profile?.role)) {
    redirect("/settings");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Historic Invoice Import
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Bulk-load pre-web-app invoices so the Revenue Report spans the full
          RS history. Operational queries (Pending Invoice, AR aging) hide
          historic invoices automatically — only the reports include them.
        </p>
      </div>

      <HistoricImportWizard />
    </div>
  );
}
