import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

const STATUSES = ["all", "draft", "review", "sent", "accepted", "rejected", "expired"] as const;

interface SearchParams {
  status?: string;
}

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const activeStatus = params.status ?? "all";
  const supabase = await createClient();

  let query = supabase
    .from("quotes")
    .select("*, customers(code, company_name), gmps(gmp_number)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (activeStatus !== "all") {
    query = query.eq("status", activeStatus);
  }

  const { data: quotes, error } = await query;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Quotes</h2>
          <p className="text-gray-500">
            {quotes?.length ?? 0} quote{quotes?.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/quotes/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Quote
          </Button>
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/quotes" : `/quotes?status=${s}`}
          >
            <Button
              variant={activeStatus === s ? "default" : "outline"}
              size="sm"
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          </Link>
        ))}
      </div>

      {/* Error state */}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to load quotes. Make sure your Supabase connection is configured.
        </div>
      ) : !quotes || quotes.length === 0 ? (
        /* Empty state */
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-lg">No quotes found</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Link href="/quotes/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create your first quote
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        /* Quote table */
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>GMP</TableHead>
                <TableHead>Quantities</TableHead>
                <TableHead className="text-right">Per Unit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((q) => {
                const customer = q.customers as unknown as {
                  code: string;
                  company_name: string;
                } | null;
                const gmp = q.gmps as unknown as {
                  gmp_number: string;
                } | null;
                const quantities = q.quantities as unknown as Record<string, number> | null;
                const pricing = q.pricing as unknown as {
                  tiers?: Array<{ per_unit: number }>;
                } | null;
                const firstTierPerUnit = pricing?.tiers?.[0]?.per_unit;
                const qtyValues = quantities
                  ? Object.values(quantities).join(" / ")
                  : "—";

                return (
                  <TableRow key={q.id}>
                    <TableCell>
                      <Link
                        href={`/quotes/${q.id}`}
                        className="font-mono font-medium text-blue-600 hover:underline"
                      >
                        {q.quote_number}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      {customer
                        ? `${customer.code} — ${customer.company_name}`
                        : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {gmp?.gmp_number ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{qtyValues}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {firstTierPerUnit != null
                        ? formatCurrency(firstTierPerUnit)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <QuoteStatusBadge status={q.status} />
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {q.created_at ? formatDateTime(q.created_at) : "—"}
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
