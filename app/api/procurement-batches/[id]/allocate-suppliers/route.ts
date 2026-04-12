import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { searchPartPrice } from "@/lib/pricing/digikey";
import { searchMouserPrice } from "@/lib/pricing/mouser";
import { searchLCSCPrice } from "@/lib/pricing/lcsc";

/**
 * POST /api/procurement-batches/[id]/allocate-suppliers
 *
 * For each component line, finds the best supplier (cheapest price)
 * by checking cache first, then querying DigiKey/Mouser/LCSC APIs.
 *
 * This is the second API run (BUILD_PROMPT.md §2.6) — pricing at ORDER
 * quantities (with overage), not BOM quantities.
 *
 * Input: Batch must be in status "extras_calculated"
 * Output: Batch moves to "suppliers_allocated", lines updated with supplier info
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: batchId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Validate batch
  const { data: batch } = await admin
    .from("procurement_batches")
    .select("id, status")
    .eq("id", batchId)
    .single();

  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  if (batch.status !== "extras_calculated") {
    return NextResponse.json(
      { error: `Batch is "${batch.status}". Allocate suppliers requires "extras_calculated".` },
      { status: 400 }
    );
  }

  // Fetch all lines
  const { data: lines } = await admin
    .from("procurement_batch_lines")
    .select("id, mpn, cpc, description, order_qty, is_bg")
    .eq("batch_id", batchId)
    .order("line_number", { ascending: true });

  if (!lines || lines.length === 0) {
    return NextResponse.json({ error: "No component lines found" }, { status: 400 });
  }

  let apiCalls = 0;
  let cacheHits = 0;
  let notFound = 0;
  let totalOrderValue = 0;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const supplierCounts: Record<string, number> = {};

  for (const line of lines) {
    // Skip BG stock items — they come from internal inventory
    if (line.is_bg) continue;

    const searchKey = (line.mpn || line.cpc || "").trim();
    if (!searchKey) continue;

    // --- Step 1: Check cache (7-day TTL) ---
    const { data: cachedResults } = await admin
      .from("api_pricing_cache")
      .select("unit_price, stock_qty, source, response")
      .eq("search_key", searchKey.toUpperCase())
      .gte("expires_at", new Date().toISOString())
      .order("unit_price", { ascending: true })
      .limit(3);

    let bestPrice: number | null = null;
    let bestSupplier: string | null = null;
    let bestSupplierPn: string | null = null;
    let stockQty: number | null = null;

    if (cachedResults && cachedResults.length > 0) {
      const best = cachedResults[0];
      bestPrice = Number(best.unit_price);
      bestSupplier = best.source === "digikey" ? "DigiKey"
        : best.source === "mouser" ? "Mouser"
        : best.source === "lcsc" ? "LCSC"
        : best.source;
      stockQty = best.stock_qty;
      // Try to extract supplier PN from cached response
      const resp = best.response as Record<string, unknown> | null;
      if (resp) {
        bestSupplierPn = (resp.digikey_pn ?? resp.mouser_pn ?? resp.lcsc_pn ?? null) as string | null;
      }
      cacheHits++;
    } else {
      // --- Step 2: Query all 3 suppliers in parallel ---
      const [digikey, mouser, lcsc] = await Promise.allSettled([
        searchPartPrice(searchKey),
        searchMouserPrice(searchKey),
        searchLCSCPrice(searchKey),
      ]);
      apiCalls++;

      interface SupplierHit {
        source: string;
        displayName: string;
        unit_price: number;
        supplier_pn: string;
        stock_qty: number | null;
        mpn: string;
        currency: string;
      }
      const hits: SupplierHit[] = [];

      if (digikey.status === "fulfilled" && digikey.value) {
        const r = digikey.value;
        hits.push({
          source: "digikey", displayName: "DigiKey",
          unit_price: r.unit_price, supplier_pn: r.digikey_pn,
          stock_qty: null, mpn: r.mpn, currency: r.currency,
        });
        await admin.from("api_pricing_cache").upsert({
          source: "digikey", mpn: r.mpn,
          search_key: searchKey.toUpperCase(),
          response: r as unknown as Record<string, unknown>,
          unit_price: r.unit_price, stock_qty: null,
          currency: r.currency, expires_at: expiresAt,
        }, { onConflict: "source,search_key" });
      }

      if (mouser.status === "fulfilled" && mouser.value) {
        const r = mouser.value;
        hits.push({
          source: "mouser", displayName: "Mouser",
          unit_price: r.unit_price, supplier_pn: r.mouser_pn,
          stock_qty: r.stock_qty, mpn: r.mpn, currency: r.currency,
        });
        await admin.from("api_pricing_cache").upsert({
          source: "mouser", mpn: r.mpn,
          search_key: searchKey.toUpperCase(),
          response: r as unknown as Record<string, unknown>,
          unit_price: r.unit_price, stock_qty: r.stock_qty,
          currency: r.currency, expires_at: expiresAt,
        }, { onConflict: "source,search_key" });
      }

      if (lcsc.status === "fulfilled" && lcsc.value) {
        const r = lcsc.value;
        hits.push({
          source: "lcsc", displayName: "LCSC",
          unit_price: r.unit_price, supplier_pn: r.lcsc_pn,
          stock_qty: r.stock_qty, mpn: r.mpn, currency: r.currency,
        });
        await admin.from("api_pricing_cache").upsert({
          source: "lcsc", mpn: r.mpn,
          search_key: searchKey.toUpperCase(),
          response: r as unknown as Record<string, unknown>,
          unit_price: r.unit_price, stock_qty: r.stock_qty,
          currency: r.currency, expires_at: expiresAt,
        }, { onConflict: "source,search_key" });
      }

      if (hits.length > 0) {
        const best = hits.reduce((a, b) => a.unit_price <= b.unit_price ? a : b);
        bestPrice = best.unit_price;
        bestSupplier = best.displayName;
        bestSupplierPn = best.supplier_pn;
        stockQty = best.stock_qty;
      } else {
        notFound++;
      }
    }

    const extendedPrice = bestPrice ? +(bestPrice * line.order_qty).toFixed(2) : null;
    if (extendedPrice) totalOrderValue += extendedPrice;
    if (bestSupplier) {
      supplierCounts[bestSupplier] = (supplierCounts[bestSupplier] ?? 0) + 1;
    }

    await admin
      .from("procurement_batch_lines")
      .update({
        supplier: bestSupplier,
        supplier_pn: bestSupplierPn,
        unit_price: bestPrice ? +bestPrice.toFixed(4) : null,
        extended_price: extendedPrice,
        stock_qty: stockQty,
        pricing_source: bestSupplier?.toLowerCase() ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", line.id);
  }

  // Update batch status
  await admin
    .from("procurement_batches")
    .update({
      status: "suppliers_allocated",
      total_order_value: +totalOrderValue.toFixed(2),
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  // Log
  await admin.from("procurement_batch_log").insert({
    batch_id: batchId,
    action: "suppliers_allocated",
    old_status: "extras_calculated",
    new_status: "suppliers_allocated",
    details: {
      components: lines.length,
      api_calls: apiCalls,
      cache_hits: cacheHits,
      not_found: notFound,
      supplier_breakdown: supplierCounts,
      total_order_value: +totalOrderValue.toFixed(2),
    },
    performed_by: user.id,
  });

  return NextResponse.json({
    status: "suppliers_allocated",
    components: lines.length,
    api_calls: apiCalls,
    cache_hits: cacheHits,
    not_found: notFound,
    supplier_breakdown: supplierCounts,
    total_order_value: +totalOrderValue.toFixed(2),
    message: notFound > 0
      ? `Suppliers allocated. ${lines.length - notFound} priced, ${notFound} not found. Review and generate POs.`
      : `Suppliers allocated — all ${lines.length} components priced. Review and generate POs.`,
  });
}
