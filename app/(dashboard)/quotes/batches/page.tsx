import Link from "next/link";
import { Plus, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils/format";

const STATUS_LABELS: Record<string, string> = {
  created: "Created",
  merged: "Merged",
  mcodes_assigned: "M-Codes Assigned",
  extras_calculated: "Extras Calculated",
  priced: "Priced",
  sent_back: "Quotes Generated",
  quotes_generated: "Complete",
  archived: "Archived",
};

const STATUS_COLORS: Record<string, string> = {
  created: "bg-gray-100 text-gray-700",
  merged: "bg-blue-100 text-blue-700",
  mcodes_assigned: "bg-yellow-100 text-yellow-700",
  extras_calculated: "bg-orange-100 text-orange-700",
  priced: "bg-purple-100 text-purple-700",
  sent_back: "bg-green-100 text-green-700",
  quotes_generated: "bg-green-100 text-green-700",
  archived: "bg-gray-100 text-gray-500",
};

export default async function QuoteBatchesPage() {
  const supabase = await createClient();

  const { data: batches, error } = await supabase
    .from("quote_batches")
    .select("*, customers(code, company_name), quote_batch_boms(id)")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Quote Batches</h2>
          <p className="text-gray-500">
            Merge multiple BOMs, assign M-codes, calculate pricing — then generate individual quotes.
          </p>
        </div>
        <Link href="/quotes/batches/new">
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
          title="No quote batches"
          description="Create a batch to start the quoting workflow. Upload BOMs first, then group them into a batch."
        >
          <Link href="/quotes/batches/new">
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
                <TableHead>Customer</TableHead>
                <TableHead>BOMs</TableHead>
                <TableHead>Qty Tiers</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => {
                const customer = b.customers as unknown as { code: string; company_name: string } | null;
                const bomCount = Array.isArray(b.quote_batch_boms) ? b.quote_batch_boms.length : 0;
                const tiers = [b.qty_1, b.qty_2, b.qty_3, b.qty_4].filter(Boolean).join(" / ");

                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link href={`/quotes/batches/${b.id}`} className="font-medium text-blue-600 hover:underline">
                        {b.batch_name}
                      </Link>
                    </TableCell>
                    <TableCell>{customer ? `${customer.code} — ${customer.company_name}` : "—"}</TableCell>
                    <TableCell className="font-mono">{bomCount}</TableCell>
                    <TableCell className="font-mono text-sm">{tiers || "Not set"}</TableCell>
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
