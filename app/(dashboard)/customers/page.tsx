import Link from "next/link";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CreateCustomerDialog } from "@/components/customers/create-customer-dialog";
import { Button } from "@/components/ui/button";
import { CustomersTable } from "@/components/customers/customers-table";

interface SearchParams {
  status?: string;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // Fetch ALL customers — client-side search handles filtering instantly
  let query = supabase
    .from("customers")
    .select("*")
    .order("company_name", { ascending: true });

  if (params.status === "inactive") {
    query = query.eq("is_active", false);
  } else if (params.status !== "all") {
    query = query.eq("is_active", true);
  }

  const { data: customers, error } = await query;

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

      <div className="flex gap-1">
        {["active", "inactive", "all"].map((s) => (
          <Link key={s} href={`/customers?status=${s}`}>
            <Button
              variant={(params.status ?? "active") === s ? "default" : "outline"}
              size="sm"
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          </Link>
        ))}
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
