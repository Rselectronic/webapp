import Link from "next/link";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CreateCustomerDialog } from "@/components/customers/create-customer-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";

interface SearchParams {
  search?: string;
  status?: string;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select("*")
    .order("company_name", { ascending: true });

  if (params.status === "inactive") {
    query = query.eq("is_active", false);
  } else if (params.status !== "all") {
    query = query.eq("is_active", true);
  }

  if (params.search) {
    const sanitized = params.search.replace(/[,.()"\\]/g, "");
    query = query.or(
      `code.ilike.%${sanitized}%,company_name.ilike.%${sanitized}%`
    );
  }

  const { data: customers, error } = await query;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Customers</h2>
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <form className="flex items-center gap-2">
          <Input
            name="search"
            placeholder="Search customers..."
            defaultValue={params.search ?? ""}
            className="w-full sm:w-64"
          />
          <input type="hidden" name="status" value={params.status ?? ""} />
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
        </form>
        <div className="flex gap-1">
          {["active", "inactive", "all"].map((s) => (
            <Link
              key={s}
              href={`/customers?status=${s}${params.search ? `&search=${params.search}` : ""}`}
            >
              <Button
                variant={(params.status ?? "active") === s ? "default" : "outline"}
                size="sm"
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            </Link>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to load customers. Make sure your Supabase connection is configured.
        </div>
      ) : (
        <div className="table-responsive rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Company Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Payment Terms</TableHead>
                <TableHead className="w-24">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers && customers.length > 0 ? (
                customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Link
                        href={`/customers/${customer.id}`}
                        className="font-mono font-medium text-blue-600 hover:underline"
                      >
                        {customer.code}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      {customer.company_name}
                    </TableCell>
                    <TableCell>{customer.contact_name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {customer.contact_email ?? "—"}
                    </TableCell>
                    <TableCell>{customer.payment_terms}</TableCell>
                    <TableCell>
                      <Badge variant={customer.is_active ? "default" : "secondary"}>
                        {customer.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-0">
                    <EmptyState
                      icon={Users}
                      title="No customers found"
                      description={params.search ? `No results for "${params.search}". Try a different search term.` : "Add your first customer to get started."}
                      className="border-0"
                    >
                      <CreateCustomerDialog />
                    </EmptyState>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
