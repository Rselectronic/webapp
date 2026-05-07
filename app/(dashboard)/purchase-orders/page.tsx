import { isAdminRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PurchaseOrdersFilterBar } from "@/components/purchase-orders/purchase-orders-filter-bar";
import {
  PurchaseOrdersTable,
  type PurchaseOrderRow,
} from "@/components/purchase-orders/purchase-orders-table";

interface SearchParams {
  supplier?: string;
  status?: string;
  from?: string;
  to?: string;
  search?: string;
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Admin-only â€” supplier_pos RLS rejects production-role reads, which would
  // render an empty page that looks like a query bug. Redirect home instead.
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role)) redirect("/");

  // The supplier_pos table stores the PDF blob's storage path in
  // `pdf_path`; the table component expects a signed `pdf_url`. We have to
  // select the path here and convert each row before render â€” the previous
  // code asked PostgREST for `pdf_url`, a non-existent column, which made
  // the entire SELECT fail and the page rendered as empty even though
  // newly-created POs were sitting in the table.
  let query = supabase
    .from("supplier_pos")
    .select(
      "id, po_number, supplier_name, total_amount, status, pdf_path, created_at, procurement_id, procurements(proc_code, customers(code, company_name))"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (params.supplier) query = query.ilike("supplier_name", `%${params.supplier}%`);
  if (params.status) query = query.eq("status", params.status);
  if (params.from) query = query.gte("created_at", params.from);
  if (params.to) query = query.lte("created_at", `${params.to}T23:59:59`);
  if (params.search) query = query.ilike("po_number", `%${params.search}%`);

  const { data, error } = await query;
  if (error) {
    console.error("[purchase-orders] query failed:", error.message);
  }

  // PostgREST returns nested embeds (`procurements`, `customers`) as
  // arrays; the runtime code defensively unwraps via `Array.isArray`.
  // TS's auto-generated Supabase types disagree with our hand-rolled
  // shape (single-or-array union), hence the `unknown` shim.
  const rawRows = (data ?? []) as unknown as Array<{
    id: string;
    po_number: string;
    supplier_name: string;
    total_amount: number | null;
    status: string;
    pdf_path: string | null;
    created_at: string;
    procurement_id: string | null;
    procurements:
      | {
          proc_code: string | null;
          customers:
            | { code: string | null; company_name: string | null }
            | Array<{ code: string | null; company_name: string | null }>
            | null;
        }
      | Array<{
          proc_code: string | null;
          customers:
            | { code: string | null; company_name: string | null }
            | Array<{ code: string | null; company_name: string | null }>
            | null;
        }>
      | null;
  }>;

  const rows: PurchaseOrderRow[] = await Promise.all(
    rawRows.map(async (r) => {
      let pdf_url: string | null = null;
      if (r.pdf_path) {
        try {
          const { data: signed } = await supabase.storage
            .from("procurement")
            .createSignedUrl(r.pdf_path, 60 * 60 * 24);
          pdf_url = signed?.signedUrl ?? null;
        } catch {
          pdf_url = null;
        }
      }
      const proc = Array.isArray(r.procurements) ? r.procurements[0] ?? null : r.procurements;
      const cust = proc
        ? Array.isArray(proc.customers)
          ? proc.customers[0] ?? null
          : proc.customers
        : null;
      return {
        id: r.id,
        po_number: r.po_number,
        supplier_name: r.supplier_name,
        total_amount: r.total_amount,
        status: r.status,
        pdf_url,
        created_at: r.created_at,
        procurement_id: r.procurement_id,
        procurements: proc
          ? {
              proc_code: proc.proc_code,
              customers: cust
                ? {
                    code: cust.code,
                    company_name: cust.company_name,
                  }
                : null,
            }
          : null,
      };
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Purchase Orders</h2>
        <p className="mt-1 text-sm text-gray-500">
          All supplier purchase orders across procurements.
        </p>
      </div>

      <PurchaseOrdersFilterBar initial={params} />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {rows.length} order{rows.length === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PurchaseOrdersTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
