import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CreateCustomerDialog } from "@/components/customers/create-customer-dialog";
import { Button } from "@/components/ui/button";
import { CustomersTable } from "@/components/customers/customers-table";

export default async function CustomersPage() {
  const supabase = await createClient();

  // Fetch ALL customers — client component handles search + status filtering instantly
  const { data: customers, error } = await supabase
    .from("customers")
    .select("*")
    .order("company_name", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Customers</h2>
          <p className="text-gray-500">
            {customers?.length ?? 0} customer{customers?.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CreateCustomerDialog />
          <a href="/api/export?table=customers" download>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">CSV</span>
            </Button>
          </a>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          Failed to load customers. Make sure your Supabase connection is configured.
        </div>
      ) : (
        <CustomersTable customers={customers ?? []} />
      )}
    </div>
  );
}
