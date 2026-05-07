"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Loader2, ExternalLink, AlertCircle, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils/format";

// ---------------------------------------------------------------------------
// Octopart-style cross-distributor part search.
// ---------------------------------------------------------------------------

type SupplierStatus =
  | "ok"
  | "empty"
  | "error"
  | "filtered"
  | "no_credentials"
  | "loading"; // placeholder state used during streaming; replaced by the real result

interface Quote {
  source: string;
  display_name: string;
  mpn: string;
  manufacturer: string | null;
  supplier_part_number: string | null;
  warehouse_code: string | null;
  unit_price: number;
  unit_price_cad: number | null;
  currency: string;
  extended_cad: number | null;
  effective_qty: number;
  stock_qty: number | null;
  moq: number | null;
  order_multiple: number | null;
  lead_time_days: number | null;
  lifecycle_status: string | null;
  ncnr: boolean | null;
  franchised: boolean | null;
  datasheet_url: string | null;
  product_url: string | null;
}

interface SupplierBlock {
  source: string;
  display_name: string;
  status: SupplierStatus;
  duration_ms: number;
  error?: string;
  quotes: Quote[];
}

interface SearchResponse {
  mpn: string;
  description: string | null;
  queried_at: string;
  suppliers: SupplierBlock[];
  totals: {
    total_suppliers_queried: number;
    suppliers_with_stock: number;
    total_quotes: number;
    cheapest_extended_cad: number | null;
    cheapest_source: string | null;
  };
}

const DISTRIBUTORS =
  "DigiKey, Mouser, LCSC, Arrow, Future, Avnet, Samtec, TTI, TME, Newark, e-Sonic, Texas Instruments";

export default function PartSearchPage() {
  const [mpn, setMpn] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [quantity, setQuantity] = useState<number>(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mpn.trim().length < 2) return;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    setResult(null);

    try {
      const res = await fetch("/api/parts/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mpn: mpn.trim(),
          manufacturer: manufacturer.trim() || undefined,
          quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        let msg = `Request failed (${res.status})`;
        try {
          const parsed = JSON.parse(text) as { error?: string };
          if (parsed.error) msg = parsed.error;
        } catch {
          if (text) msg = text;
        }
        throw new Error(msg);
      }

      // NDJSON stream: read line-by-line and update state as events arrive.
      // `init` seeds placeholder supplier rows with status="loading" so the
      // UI can show them appearing one at a time; each `supplier` event
      // replaces the corresponding placeholder with the real result; `done`
      // delivers totals + best description.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let liveResult: SearchResponse | null = null;

      const handleEvent = (evt: Record<string, unknown>) => {
        const type = evt.type as string;
        if (type === "init") {
          const queried_at = (evt.queried_at as string) ?? new Date().toISOString();
          const seeds = Array.isArray(evt.suppliers) ? evt.suppliers : [];
          liveResult = {
            mpn: (evt.mpn as string) ?? mpn,
            description: null,
            queried_at,
            suppliers: seeds.map((s) => {
              const src = (s as { source: string; display_name: string });
              return {
                source: src.source,
                display_name: src.display_name,
                // Placeholder status so the UI can render an animated
                // "loading" row until the real supplier event replaces it.
                status: "loading",
                duration_ms: 0,
                quotes: [],
              } as SupplierBlock;
            }),
            totals: {
              total_suppliers_queried: seeds.length,
              suppliers_with_stock: 0,
              total_quotes: 0,
              cheapest_extended_cad: null,
              cheapest_source: null,
            },
          };
          setResult(liveResult);
        } else if (type === "supplier" && liveResult) {
          const r = evt.result as SupplierBlock;
          const idx = liveResult.suppliers.findIndex((s) => s.source === r.source);
          const nextSuppliers = [...liveResult.suppliers];
          if (idx >= 0) nextSuppliers[idx] = r;
          else nextSuppliers.push(r);
          liveResult = { ...liveResult, suppliers: nextSuppliers };
          setResult(liveResult);
        } else if (type === "done" && liveResult) {
          const totals = (evt.totals as SearchResponse["totals"]) ?? liveResult.totals;
          const description = (evt.description as string | null) ?? null;
          liveResult = { ...liveResult, totals, description };
          setResult(liveResult);
        } else if (type === "error") {
          throw new Error((evt.error as string) ?? "Stream error");
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const raw = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!raw) continue;
          try {
            handleEvent(JSON.parse(raw));
          } catch {
            // ignore unparseable fragment
          }
        }
      }
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // Filter to in-stock quotes only — "out-of-stock at price X" is useless
  // noise when the operator is trying to actually buy the part. A supplier
  // whose rows all have stock=0 is hidden; suppliers with a mix show only
  // the stocked subset. "Best overall" is computed over the same stocked
  // set so recommendations can't surface a part nobody has.
  //
  // Exception: DigiKey and Mouser are kept in the list even when out of
  // stock. Those two are our primary franchised distributors for
  // operator-visible part number references (manufacturer PN → distributor
  // PN crossref, lead-time signal, pricing breadcrumb), so hiding them
  // entirely on a stock miss hurts more than it helps. The stock cell
  // still shows "0" so the operator can tell at a glance.
  const ALWAYS_SHOW_SUPPLIERS = new Set(["digikey", "mouser"]);
  const stockedSuppliers = useMemo(() => {
    if (!result) return [] as SupplierBlock[];
    return result.suppliers
      .map((s) => {
        const alwaysShow = ALWAYS_SHOW_SUPPLIERS.has(s.source);
        const quotes = alwaysShow
          ? s.quotes
          : s.quotes.filter((q) => q.stock_qty != null && q.stock_qty > 0);
        return { ...s, quotes };
      })
      .filter((s) => s.quotes.length > 0);
  }, [result]);

  const bestQuote = useMemo<Quote | null>(() => {
    if (!result) return null;
    let best: Quote | null = null;
    for (const s of stockedSuppliers) {
      for (const q of s.quotes) {
        if (q.extended_cad == null) continue;
        // Skip out-of-stock rows even for the always-shown suppliers
        // (DigiKey/Mouser). Best overall should recommend something you
        // can actually buy today.
        if (q.stock_qty == null || q.stock_qty <= 0) continue;
        if (!best || (best.extended_cad ?? Infinity) > q.extended_cad) best = q;
      }
    }
    return best;
  }, [result, stockedSuppliers]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Global Part Search Engine</h2>
        <p className="text-sm text-gray-500">
          Search across every configured distributor — {DISTRIBUTORS}.
        </p>
      </div>

      <Card>
        <CardContent className="p-3">
          <form onSubmit={handleSubmit}>
            <div className="grid gap-3 md:grid-cols-[2fr_1.2fr_0.8fr_auto]">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Manufacturer Part Number
                </label>
                <Input
                  value={mpn}
                  onChange={(e) => setMpn(e.target.value)}
                  placeholder="e.g. CRCW06031001F"
                  minLength={2}
                  required
                  disabled={loading}
                  className="h-11 text-base"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Manufacturer (optional)
                </label>
                <Input
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  placeholder="Optional — e.g. Yageo"
                  disabled={loading}
                  className="h-11"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Quantity
                </label>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                  disabled={loading}
                  className="h-11"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={loading || mpn.trim().length < 2} className="h-11 w-full md:w-auto">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Searching…
                    </>
                  ) : (
                    "Search"
                  )}
                </Button>
              </div>
            </div>
            {/* Part description — populated after a successful search from
                the most precise (longest) description returned by any
                queried distributor. While loading we render an animated
                skeleton bar so the description area reads as "fetching"
                instead of leaving the previous search's description sitting
                there until the new response arrives. */}
            {loading ? (
              <div className="mt-2 space-y-1">
                <span className="inline-block h-3 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
                <span className="inline-block h-3 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
              </div>
            ) : (
              result?.description && (
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                  {result.description}
                </p>
              )
            )}
          </form>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <div className="font-medium">Search failed</div>
            <div className="text-red-700 dark:text-red-400">{error}</div>
          </div>
        </div>
      )}

      {!hasSearched && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            Enter an MPN above to search across all configured distributors.
          </CardContent>
        </Card>
      )}

      {/* Streamed results. We render the results table as soon as the
          `init` event arrives so every supplier that has landed shows up
          immediately; a compact footer below the table lists the suppliers
          still in flight with an animated skeleton until they arrive or
          fail. LoadingRows (5 anonymous skeleton rows) still renders as a
          standalone card pre-init when nothing has arrived yet. */}
      {hasSearched && !result && loading && <LoadingRows />}

      {hasSearched && result && (
        <>
          {stockedSuppliers.length > 0 ? (
            <ResultsSection
              best={bestQuote}
              stockedSuppliers={stockedSuppliers}
            />
          ) : !loading && result.totals.total_quotes === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                No supplier returned quotes for{" "}
                <span className="font-mono font-semibold">{result.mpn}</span>.
                Check manufacturer / spelling, or it may not be carried by any
                franchised distributor.
              </CardContent>
            </Card>
          ) : null}

          {/* In-flight supplier footer — shows as long as at least one
              supplier hasn't responded yet. Hides automatically when every
              supplier has transitioned out of "loading". */}
          {loading && (
            <InFlightSupplierFooter
              suppliers={result.suppliers.filter((s) => s.status === "loading")}
            />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ResultsSection({
  best,
  stockedSuppliers,
}: {
  best: Quote | null;
  stockedSuppliers: SupplierBlock[];
}) {
  return (
    <div className="space-y-3">
      {/* Best overall — compact single-line banner. The full detail lives
          in the main table below (and the winning row is tinted green), so
          this just announces the winner without repeating every column. */}
      {best && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-green-300 bg-green-50/60 px-3 py-2 text-sm dark:border-green-900 dark:bg-green-950/20">
          <div className="flex items-center gap-1.5 text-green-800 dark:text-green-300 font-medium">
            <Trophy className="h-4 w-4" />
            Best deal
          </div>
          <span className="text-gray-900 dark:text-gray-100 font-medium">{best.display_name}</span>
          {best.supplier_part_number && (
            <span className="font-mono text-xs text-gray-500">{best.supplier_part_number}</span>
          )}
          <span className="font-mono">
            {best.unit_price_cad != null ? `$${best.unit_price_cad.toFixed(4)}` : "—"}
            <span className="text-gray-500"> /ea</span>
          </span>
          {best.extended_cad != null && (
            <span className="font-semibold text-green-700 dark:text-green-400">
              ext {formatCurrency(best.extended_cad)}
            </span>
          )}
          {best.stock_qty != null && (
            <span className="text-xs text-gray-500">stock {best.stock_qty.toLocaleString()}</span>
          )}
          {best.product_url && (
            <a
              href={best.product_url}
              target="_blank"
              rel="noreferrer noopener"
              className="ml-auto inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              View deal <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {/* Flat results list — every in-stock quote from every supplier on a
          single table so the operator can scan + compare without clicking
          into per-supplier cards. Sorted by extended CAD so the best deal
          is always at the top. */}
      {stockedSuppliers.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-gray-500">
            None of the queried distributors have stock for this part right now.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Distributor</TableHead>
                    <TableHead>Distributor PN</TableHead>
                    <TableHead>CPC</TableHead>
                    <TableHead>MPN</TableHead>
                    <TableHead>Manufacturer</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">MOQ</TableHead>
                    <TableHead className="text-right">Multi</TableHead>
                    <TableHead className="text-right">Lead</TableHead>
                    <TableHead className="text-right">Unit CAD</TableHead>
                    <TableHead className="text-right">Extended CAD</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockedSuppliers
                    .flatMap((s) =>
                      s.quotes.map((q) => ({
                        ...q,
                        display_name: s.display_name,
                        source: s.source,
                      }))
                    )
                    .sort((a, b) => {
                      const aExt = a.extended_cad ?? Number.POSITIVE_INFINITY;
                      const bExt = b.extended_cad ?? Number.POSITIVE_INFINITY;
                      return aExt - bExt;
                    })
                    .map((q, i) => (
                      <TableRow
                        key={`${q.source}-${q.supplier_part_number ?? "spn"}-${q.warehouse_code ?? ""}-${i}`}
                      >
                        <TableCell className="font-medium">
                          {q.display_name}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {q.supplier_part_number ?? "—"}
                          {q.warehouse_code && (
                            <span className="ml-1 text-gray-400">/ {q.warehouse_code}</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-gray-400">—</TableCell>
                        <TableCell className="font-mono text-xs">
                          {q.mpn || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {q.manufacturer ?? (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{q.stock_qty ?? "—"}</TableCell>
                        <TableCell className="text-right">{q.moq ?? "—"}</TableCell>
                        <TableCell className="text-right">{q.order_multiple ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          {q.lead_time_days != null ? `${q.lead_time_days}d` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold font-mono">
                          {q.unit_price_cad != null ? `$${q.unit_price_cad.toFixed(4)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {q.extended_cad != null ? formatCurrency(q.extended_cad) : "—"}
                        </TableCell>
                        <TableCell>
                          {q.datasheet_url && (
                            <a
                              href={q.datasheet_url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                            >
                              DS <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder rows shown while the API is querying every supplier. Visually
// reads as "distributor rows are fetching" instead of a generic spinner —
// one row per distributor with animated-skeleton cells that resolve into
// the real table when the response lands.
// ---------------------------------------------------------------------------

function LoadingRows() {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Distributor</TableHead>
                <TableHead>Distributor PN</TableHead>
                <TableHead>CPC</TableHead>
                <TableHead>MPN</TableHead>
                <TableHead>Manufacturer</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">MOQ</TableHead>
                <TableHead className="text-right">Multi</TableHead>
                <TableHead className="text-right">Lead</TableHead>
                <TableHead className="text-right">Unit CAD</TableHead>
                <TableHead className="text-right">Extended CAD</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <Skeleton className="h-3 w-28" asCell />
                  <Skeleton className="h-3 w-24" asCell />
                  <Skeleton className="h-3 w-20" asCell />
                  <Skeleton className="h-3 w-20" asCell />
                  <Skeleton className="h-3 w-24" asCell />
                  <Skeleton className="h-3 w-12 ml-auto" asCell />
                  <Skeleton className="h-3 w-10 ml-auto" asCell />
                  <Skeleton className="h-3 w-10 ml-auto" asCell />
                  <Skeleton className="h-3 w-10 ml-auto" asCell />
                  <Skeleton className="h-3 w-16 ml-auto" asCell />
                  <Skeleton className="h-3 w-16 ml-auto" asCell />
                  <Skeleton className="h-3 w-8" asCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Skeleton({ className, asCell }: { className?: string; asCell?: boolean }) {
  const bar = (
    <span
      className={`inline-block animate-pulse rounded bg-gray-200 dark:bg-gray-800 ${className ?? ""}`}
    />
  );
  return asCell ? <TableCell>{bar}</TableCell> : bar;
}

// ---------------------------------------------------------------------------
// In-flight supplier footer — shown under the results table while the NDJSON
// stream is still delivering events. Each listed supplier has not yet
// returned; as its event lands the parent strips it from this list. The
// footer vanishes on its own once every supplier has finished.
// ---------------------------------------------------------------------------

function InFlightSupplierFooter({ suppliers }: { suppliers: SupplierBlock[] }) {
  if (suppliers.length === 0) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
      <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
      <span>
        Waiting on {suppliers.length} supplier{suppliers.length === 1 ? "" : "s"}:
      </span>
      <div className="flex flex-wrap gap-1">
        {suppliers.map((s) => (
          <span
            key={s.source}
            className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[11px] dark:bg-gray-800"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
            {s.display_name}
          </span>
        ))}
      </div>
    </div>
  );
}

