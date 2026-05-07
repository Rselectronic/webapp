import Link from "next/link";
import { Plus, Download, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { QuotesTable, type QuoteRow } from "@/components/quotes/quotes-table";

export default async function QuotesPage() {
  const supabase = await createClient();

  // Fetch ALL quotes — client component handles search + status filter +
  // sort + pagination instantly. Same pattern as the customers page.
  const { data: quotes, error } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, status, quantities, pricing, created_at, customers(code, company_name), gmps(gmp_number)"
    )
    .order("created_at", { ascending: false });

  const rows = (quotes ?? []) as unknown as QuoteRow[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Quotes</h2>
          <p className="text-gray-500">
            {rows.length} quote{rows.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/quotes/batches">
            <Button variant="outline" size="sm">
              <Layers className="mr-2 h-4 w-4" />
              Batches
            </Button>
          </Link>
          <a href="/api/export?table=quotes" download>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </a>
          <Link href="/quotes/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Quote
            </Button>
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          Failed to load quotes. Make sure your Supabase connection is configured.
        </div>
      ) : (
        <QuotesTable quotes={rows} />
      )}
    </div>
  );
}
