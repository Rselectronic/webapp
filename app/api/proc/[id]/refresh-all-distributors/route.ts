import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import { runSupplierSearch } from "@/lib/pricing/registry";
import { BUILT_IN_SUPPLIER_NAMES } from "@/lib/supplier-metadata";

// POST /api/proc/[id]/refresh-all-distributors
// For every unique MPN in this PROC's merged BOM, query every known
// distributor's API and refresh api_pricing_cache. Emits NDJSON progress
// events. Skips (supplier, mpn) pairs that have a recent negative sentinel
// (unit_price IS NULL, fetched within 48h) to avoid wasting API calls.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Optional supplier filter from client-side distributor picker. Defensive:
  // only accept names that exist in BUILT_IN_SUPPLIER_NAMES.
  let suppliersToQuery: readonly string[] = BUILT_IN_SUPPLIER_NAMES;
  try {
    const body = (await req.json().catch(() => null)) as
      | { suppliers?: unknown }
      | null;
    if (body && Array.isArray(body.suppliers) && body.suppliers.length > 0) {
      const builtIn = new Set(BUILT_IN_SUPPLIER_NAMES as readonly string[]);
      const filtered = body.suppliers.filter(
        (s): s is string => typeof s === "string" && builtIn.has(s)
      );
      if (filtered.length > 0) suppliersToQuery = filtered;
    }
  } catch {
    // ignore â€” fall back to all built-ins
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

  // 1. Derive unique CPC -> winning MPN pairs from the PROC's member BOMs.
  // Phase 3: aggregation is on CPC, so two BOM lines with the same CPC but
  // different MPNs no longer fan out into two API calls. We pick the MPN with
  // the highest aggregated quantity within each CPC group as the
  // distributor-facing part number to query.
  const { data: members } = await supabase
    .from("jobs")
    .select("bom_id, quantity")
    .eq("procurement_id", id);
  const bomIds = Array.from(
    new Set((members ?? []).map((m) => m.bom_id).filter((b): b is string => !!b))
  );
  if (bomIds.length === 0) {
    return NextResponse.json({ updated: 0, failed: 0, skipped: 0, total: 0 });
  }

  const memberQtyByBom = new Map<string, number>();
  for (const m of members ?? []) {
    if (m.bom_id) memberQtyByBom.set(m.bom_id, m.quantity ?? 0);
  }

  const { data: bomLines } = await supabase
    .from("bom_lines")
    .select("bom_id, quantity, mpn, cpc, manufacturer")
    .in("bom_id", bomIds);

  // qty-by-MPN within each CPC group, plus a single manufacturer per MPN
  // (first seen â€” manufacturers rarely vary between rotated MPNs).
  type MpnInfo = { mpn: string; manufacturer: string | null };
  const qtyByMpnPerCpc = new Map<string, Map<string, number>>();
  const mfgByMpn = new Map<string, string | null>();
  for (const l of (bomLines ?? []) as {
    bom_id: string;
    quantity: number | null;
    mpn: string | null;
    cpc: string | null;
    manufacturer: string | null;
  }[]) {
    const mpn = (l.mpn ?? "").trim();
    if (!mpn) continue;
    const cpcRaw = (l.cpc ?? "").trim() || mpn;
    const cpc = cpcRaw.toUpperCase();
    const memberQty = memberQtyByBom.get(l.bom_id) ?? 0;
    const add = (l.quantity ?? 0) * memberQty;
    let inner = qtyByMpnPerCpc.get(cpc);
    if (!inner) {
      inner = new Map();
      qtyByMpnPerCpc.set(cpc, inner);
    }
    inner.set(mpn, (inner.get(mpn) ?? 0) + add);
    if (!mfgByMpn.has(mpn)) mfgByMpn.set(mpn, l.manufacturer ?? null);
  }
  // Pick winning MPN per CPC (highest aggregated qty).
  const cpcWinners = new Map<string, MpnInfo>(); // cpc -> winning MPN info
  for (const [cpc, inner] of qtyByMpnPerCpc) {
    const sorted = Array.from(inner.entries()).sort((a, b) => b[1] - a[1]);
    const winner = sorted[0]?.[0];
    if (!winner) continue;
    cpcWinners.set(cpc, { mpn: winner, manufacturer: mfgByMpn.get(winner) ?? null });
  }
  const mpns = Array.from(cpcWinners.values());
  if (mpns.length === 0) {
    return NextResponse.json({ updated: 0, failed: 0, skipped: 0, total: 0 });
  }

  // 2. Preload negative sentinels (last 48h) so we can skip pairs already
  //    known to have no match. Sentinel = cache row with unit_price IS NULL
  //    written when a supplier returned 0 quotes.
  const sinceIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const mpnUpper = mpns.map((m) => m.mpn.toUpperCase());
  const { data: sentinelRows } = await supabase
    .from("api_pricing_cache")
    .select("source, search_key, unit_price, fetched_at")
    .in("search_key", mpnUpper)
    .is("unit_price", null)
    .gte("fetched_at", sinceIso);
  const sentinelSet = new Set<string>();
  for (const r of sentinelRows ?? []) {
    sentinelSet.add(`${r.source}|${r.search_key.toUpperCase()}`);
  }

  // 3. Build (supplier, mpn) pair list, filtering sentinels
  type Pair = { supplier: string; mpn: string; manufacturer: string | null };
  const pairs: Pair[] = [];
  let skipped = 0;
  for (const supplier of suppliersToQuery) {
    for (const info of mpns) {
      const key = `${supplier}|${info.mpn.toUpperCase()}`;
      if (sentinelSet.has(key)) {
        skipped++;
        continue;
      }
      pairs.push({ supplier, mpn: info.mpn, manufacturer: info.manufacturer });
    }
  }

  const total = pairs.length;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      write({ type: "init", total, skipped });

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
                mpn: p.mpn,
                manufacturer: p.manufacturer,
              });
              if (quotes.length === 0) {
                // Write negative sentinel so we don't retry for 48h
                await supabase.from("api_pricing_cache").upsert(
                  {
                    source: p.supplier,
                    mpn: p.mpn,
                    search_key: p.mpn.toUpperCase(),
                    response: {} as Record<string, unknown>,
                    unit_price: null,
                    stock_qty: null,
                    currency: null,
                    fetched_at: new Date().toISOString(),
                    expires_at: expiresAt,
                  },
                  { onConflict: "source,search_key,supplier_part_number,warehouse_code" }
                );
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

      write({ type: "done", updated, failed, skipped, total });
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
