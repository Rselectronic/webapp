import Link from "next/link";
import { Plus, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatCurrency } from "@/lib/utils/format";

const STATUS_LABELS: Record<string, string> = {
  created: "Created",
  merged: "Merged",
  extras_calculated: "Extras Calculated",
  suppliers_allocated: "Suppliers Allocated",
  pos_created: "POs Created",
  receiving: "Receiving",
  split_back: "Split Back",
  completed: "Completed",
  archived: "Archived",
};

const STATUS_COLORS: Record<string, string> = {
  created: "bg-gray-100 text-gray-700",
  merged: "bg-blue-100 text-blue-700",
  extras_calculated: "bg-orange-100 text-orange-700",
  suppliers_allocated: "bg-purple-100 text-purple-700",
  pos_created: "bg-indigo-100 text-indigo-700",
  receiving: "bg-yellow-100 text-yellow-700",
  split_back: "bg-green-100 text-green-700",
  completed: "bg-emerald-100 text-emerald-800",
  archived: "bg-gray-100 text-gray-500",
};

export default async function ProcurementBatchesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const { data: batches, error } = await admin
    .from("procurement_batches")
    .select("*, procurement_batch_items(id, procurement_id)")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Procurement Batches</h2>
          <p className="text-gray-500 dark:text-gray-400">
            Merge multiple procurements, recalculate overage at combined volumes, allocate suppliers, and generate POs.
          </p>
        </div>
        <Link href="/procurement/batches/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Batch
          </Button>
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to load batches. Check Supabase connection.
        </div>
      ) : !batches || batches.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No procurement batches"
          description="Create a batch to consolidate components across multiple procurements for batch ordering. This saves money by ordering larger volumes together."
        >
          <Link href="/procurement/batches/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create your first batch
            </Button>
          </Link>
        </EmptyState>
      ) : (
        <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch Name</TableHead>
                <TableHead>Proc Code</TableHead>
                <TableHead>Procurements</TableHead>
                <TableHead>Unique MPNs</TableHead>
                <TableHead>Order Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => {
                const itemCount = Array.isArray(b.procurement_batch_items) ? b.procurement_batch_items.length : 0;
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link href={`/procurement/batches/${b.id}`} className="font-medium text-blue-600 hover:underline">
                        {b.batch_name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{b.proc_batch_code ?? "—"}</TableCell>
                    <TableCell className="font-mono">{itemCount}</TableCell>
                    <TableCell className="font-mono">{b.total_unique_mpns ?? 0}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {b.total_order_value ? formatCurrency(Number(b.total_order_value)) : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[b.status] ?? "bg-gray-100"}`}>
                        {STATUS_LABELS[b.status] ?? b.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {b.created_at ? formatDateTime(b.created_at) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
