import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import { runSupplierSearch } from "@/lib/pricing/registry";
import { BUILT_IN_SUPPLIER_NAMES } from "@/lib/supplier-metadata";

// POST /api/proc/[id]/refresh-prices
// Re-queries the pinned distributor API for every unique (supplier, MPN) pair
// in the PROC's merged BOM, updating api_pricing_cache with fresh stock_qty
// and unit_price. The merged BOM table reads from that cache on the next
// render via router.refresh().
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Optional supplier filter from client-side distributor picker.
  let supplierFilter: Set<string> | null = null;
  try {
    const body = (await req.json().catch(() => null)) as
      | { suppliers?: unknown }
      | null;
    if (body && Array.isArray(body.suppliers) && body.suppliers.length > 0) {
      const builtIn = new Set(BUILT_IN_SUPPLIER_NAMES as readonly string[]);
      const filtered = body.suppliers.filter(
        (s): s is string => typeof s === "string" && builtIn.has(s)
      );
      if (filtered.length > 0) supplierFilter = new Set(filtered);
    }
  } catch {
    // ignore â€” treat as no filter
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get member bom_ids
  const { data: members } = await supabase
    .from("jobs")
    .select("bom_id")
    .eq("procurement_id", id);
  const bomIds = Array.from(
    new Set((members ?? []).map((m) => m.bom_id).filter((b): b is string => !!b))
  );
  if (bomIds.length === 0) {
    return NextResponse.json({ updated: 0, failed: 0, skipped: 0 });
  }

  // bom_line_ids + pinned supplier per line. Pull cpc as well so we can
  // de-dupe pairs at the CPC level (multiple bom_lines sharing one CPC but
  // different MPNs no longer fan out into separate API calls).
  const { data: bomLines } = await supabase
    .from("bom_lines")
    .select("id, mpn, cpc, manufacturer")
    .in("bom_id", bomIds);
  const lineIds = (bomLines ?? []).map((l) => l.id);
  const lineInfoByLineId = new Map<
    string,
    { mpn: string; cpc: string; manufacturer: string | null }
  >();
  for (const l of bomLines ?? []) {
    if (!l.mpn) continue;
    const cpc = (l.cpc ?? "").trim() || l.mpn.trim();
    lineInfoByLineId.set(l.id, {
      mpn: l.mpn,
      cpc: cpc.toUpperCase(),
      manufacturer: l.manufacturer ?? null,
    });
  }

  const { data: pricingRows } = lineIds.length > 0
    ? await supabase
        .from("bom_line_pricing")
        .select("bom_line_id, supplier, supplier_part_number")
        .in("bom_line_id", lineIds)
    : { data: [] };

  // Unique (supplier, CPC) pairs. We query the distributor API using the
  // Distributor PN (supplier_part_number) when present â€” falls back to MPN
  // when the quote didn't capture a distributor PN. The cache row is still
  // keyed under the MPN (search_key column) because that's what the
  // merged-BOM lookup uses for the winning MPN per CPC.
  type Pair = {
    supplier: string;
    search_term: string;        // what we send to the API
    mpn: string;                // used as cache search_key
    cpc: string;                // dedupe scope
    manufacturer: string | null;
  };
  const seen = new Set<string>();
  const pairs: Pair[] = [];
  for (const r of pricingRows ?? []) {
    const line = lineInfoByLineId.get(r.bom_line_id);
    if (!line) continue;
    if (supplierFilter && !supplierFilter.has(r.supplier)) continue;
    const term = (r.supplier_part_number ?? line.mpn).trim();
    if (!term) continue;
    // Dedupe on (supplier, cpc) â€” one query per CPC per supplier even if
    // multiple bom_lines share the CPC.
    const key = `${r.supplier}|${line.cpc}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({
      supplier: r.supplier,
      search_term: term,
      mpn: line.mpn,
      cpc: line.cpc,
      manufacturer: line.manufacturer,
    });
  }

  if (pairs.length === 0) {
    return NextResponse.json({ updated: 0, failed: 0, skipped: 0 });
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const total = pairs.length;

  // NDJSON stream so the client can render a real progress bar. Each pair
  // emits one line of JSON when it completes, followed by a final "done"
  // event with summary counts.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      write({ type: "init", total });

      let updated = 0;
      let failed = 0;
      let done = 0;
      const CONCURRENCY = 6;

      for (let i = 0; i < pairs.length; i += CONCURRENCY) {
        const batch = pairs.slice(i, i + CONCURRENCY);
        await Promise.all(
          batch.map(async (p) => {
            try {
              const quotes = await runSupplierSearch(p.supplier, {
                mpn: p.search_term,
                manufacturer: p.manufacturer,
              });
              if (quotes.length === 0) {
                failed++;
              } else {
                const q = quotes[0];
                await supabase.from("api_pricing_cache").upsert(
                  {
                    source: p.supplier,
                    mpn: q.mpn || p.mpn,
                    search_key: p.mpn.toUpperCase(),
                    response: q as unknown as Record<string, unknown>,
                    unit_price: q.unit_price,
                    stock_qty: q.stock_qty,
                    currency: q.currency,
                    manufacturer: q.manufacturer,
                    supplier_part_number: q.supplier_part_number,
                    price_breaks: q.price_breaks as unknown as Record<string, unknown>,
                    lead_time_days: q.lead_time_days,
                    moq: q.moq,
                    order_multiple: q.order_multiple,
                    lifecycle_status: q.lifecycle_status,
                    ncnr: q.ncnr,
                    franchised: q.franchised,
                    warehouse_code: q.warehouse_code,
                    fetched_at: new Date().toISOString(),
                    expires_at: expiresAt,
                  },
                  { onConflict: "source,search_key,supplier_part_number,warehouse_code" }
                );
                updated++;
              }
            } catch {
              failed++;
            } finally {
              done++;
              write({
                type: "progress",
                supplier: p.supplier,
                mpn: p.mpn,
                done,
                total,
              });
            }
          })
        );
      }

      write({ type: "done", updated, failed, total });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
