import { isAdminRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  PendingOrdersTable,
  type PendingOrderRow,
} from "@/components/proc/pending-orders-table";

interface JobRow {
  id: string;
  po_number: string | null;
  po_date: string | null;
  quantity: number;
  customer_id: string;
  source_quote_id: string | null;
  frozen_unit_price: number | null;
  frozen_subtotal: number | null;
  created_at: string;
  customers: { code: string; company_name: string } | null;
  gmps: { gmp_number: string | null; board_name: string | null } | null;
  boms: { file_name: string | null } | null;
}

export default async function PendingOrdersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Admin-only â€” creating a PROC batch from pending POs is a sourcing action.
  // Production users should never land here; redirect home rather than show
  // an empty list (RLS would hide jobs that aren't theirs anyway).
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role)) redirect("/");

  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, po_number, po_date, quantity, customer_id, source_quote_id, frozen_unit_price, frozen_subtotal, created_at, customers(code, company_name), gmps(gmp_number, board_name), boms(file_name)"
    )
    .is("procurement_id", null)
    .order("created_at", { ascending: true })
    .limit(500);

  const jobs = (data ?? []) as unknown as JobRow[];

  const quoteIds = Array.from(
    new Set(jobs.map((j) => j.source_quote_id).filter((v): v is string => !!v))
  );
  const quoteMap = new Map<string, { quote_number: string; procurement_mode: string | null }>();
  if (quoteIds.length) {
    const { data: quotes } = await supabase
      .from("quotes")
      .select("id, quote_number, procurement_mode")
      .in("id", quoteIds);
    for (const q of quotes ?? []) {
      quoteMap.set(q.id, {
        quote_number: q.quote_number,
        procurement_mode: (q as { procurement_mode: string | null }).procurement_mode,
      });
    }
  }

  // Group by customer
  const groups = new Map<
    string,
    { code: string; name: string; rows: PendingOrderRow[] }
  >();
  for (const j of jobs) {
    const cid = j.customer_id;
    const qInfo = j.source_quote_id ? quoteMap.get(j.source_quote_id) : null;
    const row: PendingOrderRow = {
      id: j.id,
      po_number: j.po_number,
      po_date: j.po_date,
      quantity: j.quantity,
      gmp_number: j.gmps?.gmp_number ?? null,
      board_name: j.gmps?.board_name ?? null,
      bom_file_name: j.boms?.file_name ?? null,
      quote_number: qInfo?.quote_number ?? null,
      procurement_mode: qInfo?.procurement_mode ?? null,
      frozen_unit_price: j.frozen_unit_price,
      frozen_subtotal: j.frozen_subtotal,
    };
    const existing = groups.get(cid);
    if (existing) existing.rows.push(row);
    else
      groups.set(cid, {
        code: j.customers?.code ?? "UNK",
        name: j.customers?.company_name ?? "Unknown",
        rows: [row],
      });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Pending Orders
        </h2>
        <p className="mt-1 text-gray-500">
          Orders awaiting grouping into a PROC Batch. Select one or more orders
          for the same customer and procurement mode, then create a batch.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          Failed to load pending orders: {error.message}
        </div>
      )}

      {groups.size === 0 && !error ? (
        <div className="rounded-xl bg-card p-8 text-center text-gray-500 ring-1 ring-foreground/10">
          No pending orders. New POs will appear here until grouped into a PROC Batch.
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(groups.entries()).map(([cid, g]) => (
            <PendingOrdersTable
              key={cid}
              customerCode={g.code}
              customerName={g.name}
              rows={g.rows}
            />
          ))}
        </div>
      )}
    </div>
  );
}
