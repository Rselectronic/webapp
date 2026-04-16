import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { searchPartPrice } from "@/lib/pricing/digikey";
import { searchMouserPrice } from "@/lib/pricing/mouser";
import { searchLCSCPrice } from "@/lib/pricing/lcsc";
import { enrichComponentFromAPI } from "@/lib/pricing/enrich-components";
import {
  lookupHistoricalPrice,
  lookupComponentSupplierPNs,
  cacheHistoricalPrice,
} from "@/lib/pricing/historical";

type StockStatus = "in_stock" | "out_of_stock" | "unknown" | "not_found";

interface SupplierResult {
  source: string;
  mpn: string;
  unit_price: number;
  currency: string;
  in_stock: boolean;
  supplier_pn: string;
  stock_qty: number | null;
  stock_status: StockStatus;
}

/**
 * Determine stock status from stock_qty.
 * - null → unknown (old cached entries or missing data — don't penalize)
 * - 0 → out_of_stock
 * - >0 → in_stock
 */
function deriveStockStatus(stock_qty: number | null): StockStatus {
  if (stock_qty === null || stock_qty === undefined) return "unknown";
  return stock_qty > 0 ? "in_stock" : "out_of_stock";
}

/**
 * Stock-aware best-price selection (matches Excel SOP Phase G2):
 * 1. Prefer cheapest supplier WITH stock (stock_qty > 0 or unknown/null)
 * 2. If all suppliers have zero stock → pick cheapest anyway, flag out_of_stock
 * 3. If no suppliers at all → return null
 */
function selectBestSupplier(suppliers: SupplierResult[]): (SupplierResult & { stock_status: StockStatus }) | null {
  if (suppliers.length === 0) return null;

  // Separate into "has stock or unknown" vs "confirmed zero stock"
  const withStockOrUnknown = suppliers.filter(
    (s) => s.stock_qty === null || s.stock_qty === undefined || s.stock_qty > 0
  );
  const confirmedZeroStock = suppliers.filter(
    (s) => s.stock_qty !== null && s.stock_qty !== undefined && s.stock_qty <= 0
  );

  if (withStockOrUnknown.length > 0) {
    // Prefer cheapest with stock (or unknown stock)
    const best = withStockOrUnknown.reduce((a, b) =>
      a.unit_price <= b.unit_price ? a : b
    );
    return { ...best, stock_status: deriveStockStatus(best.stock_qty) };
  }

  // All confirmed zero stock — pick cheapest anyway but flag it
  const best = confirmedZeroStock.reduce((a, b) =>
    a.unit_price <= b.unit_price ? a : b
  );
  return { ...best, stock_status: "out_of_stock" };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mpn: string }> }
) {
  const { mpn } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminDb = createAdminClient();

  // --- Step 1: Check api_pricing_cache (7-day TTL) ---
  const { data: cached } = await supabase
    .from("api_pricing_cache")
    .select("unit_price, stock_qty, fetched_at, source, response")
    .eq("search_key", mpn)
    .gt("expires_at", new Date().toISOString());

  if (cached && cached.length > 0) {
    const results: SupplierResult[] = cached.map((c) => ({
      source: c.source,
      mpn,
      unit_price: c.unit_price,
      currency: "CAD",
      in_stock: c.stock_qty === null || c.stock_qty > 0,
      supplier_pn: "",
      stock_qty: c.stock_qty,
      stock_status: deriveStockStatus(c.stock_qty),
    }));

    const best = selectBestSupplier(results);

    return NextResponse.json({
      mpn,
      best_price: best?.unit_price ?? null,
      best_source: best?.source ?? null,
      stock_status: best?.stock_status ?? "unknown",
      source: "cache",
      suppliers: results.map((s) => ({
        source: s.source,
        unit_price: s.unit_price,
        stock_qty: s.stock_qty,
        stock_status: s.stock_status,
        fetched_at: cached.find((c) => c.source === s.source)?.fetched_at,
      })),
    });
  }

  // --- Step 2: Check historical procurement prices ---
  const historical = await lookupHistoricalPrice(adminDb, mpn);

  // --- Step 3: Check components table for supplier PNs ---
  const componentPNs = await lookupComponentSupplierPNs(adminDb, mpn);

  // --- Step 4: Query all 3 suppliers in parallel ---
  // Use supplier-specific PNs from components table if available (better search keys)
  const [digikey, mouser, lcsc] = await Promise.allSettled([
    searchPartPrice(componentPNs.digikey_pn || mpn),
    searchMouserPrice(componentPNs.mouser_pn || mpn),
    searchLCSCPrice(componentPNs.lcsc_pn || mpn),
  ]);

  const suppliers: SupplierResult[] = [];
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  let digikeyPnForFallback: string | null = null;

  if (digikey.status === "fulfilled" && digikey.value) {
    const r = digikey.value;
    digikeyPnForFallback = r.digikey_pn;
    suppliers.push({
      source: "digikey",
      mpn: r.mpn,
      unit_price: r.unit_price,
      currency: r.currency,
      in_stock: r.in_stock,
      supplier_pn: r.digikey_pn,
      stock_qty: r.stock_qty,
      stock_status: deriveStockStatus(r.stock_qty),
    });
    await supabase.from("api_pricing_cache").upsert(
      {
        source: "digikey",
        mpn: r.mpn,
        search_key: mpn,
        response: r as unknown as Record<string, unknown>,
        unit_price: r.unit_price,
        stock_qty: r.stock_qty,
        currency: r.currency,
        expires_at: expiresAt,
      },
      { onConflict: "source,search_key" }
    );
    // Enrich components table with DigiKey details (fire-and-forget)
    enrichComponentFromAPI(adminDb, {
      mpn: r.mpn,
      description: r.description,
      mounting_type: r.mounting_type,
      package_case: r.package_case,
      category: r.category,
      length_mm: r.length_mm,
      width_mm: r.width_mm,
      height_mm: r.height_mm,
      digikey_pn: r.digikey_pn,
    }).catch(() => {});
  }

  // Process Mouser
  if (mouser.status === "fulfilled" && mouser.value) {
    const r = mouser.value;
    suppliers.push({
      source: "mouser",
      mpn: r.mpn,
      unit_price: r.unit_price,
      currency: r.currency,
      in_stock: r.in_stock,
      supplier_pn: r.mouser_pn,
      stock_qty: r.stock_qty,
      stock_status: deriveStockStatus(r.stock_qty),
    });
    await supabase.from("api_pricing_cache").upsert(
      {
        source: "mouser",
        mpn: r.mpn,
        search_key: mpn,
        response: r as unknown as Record<string, unknown>,
        unit_price: r.unit_price,
        stock_qty: r.stock_qty,
        currency: r.currency,
        expires_at: expiresAt,
      },
      { onConflict: "source,search_key" }
    );
    // Enrich components table with Mouser supplier PN
    enrichComponentFromAPI(adminDb, {
      mpn: r.mpn,
      description: r.description,
      mouser_pn: r.mouser_pn,
    }).catch(() => {});
  }

  // Process LCSC
  if (lcsc.status === "fulfilled" && lcsc.value) {
    const r = lcsc.value;
    suppliers.push({
      source: "lcsc",
      mpn: r.mpn,
      unit_price: r.unit_price,
      currency: r.currency,
      in_stock: r.in_stock,
      supplier_pn: r.lcsc_pn,
      stock_qty: r.stock_qty,
      stock_status: deriveStockStatus(r.stock_qty),
    });
    await supabase.from("api_pricing_cache").upsert(
      {
        source: "lcsc",
        mpn: r.mpn,
        search_key: mpn,
        response: r as unknown as Record<string, unknown>,
        unit_price: r.unit_price,
        stock_qty: r.stock_qty,
        currency: r.currency,
        expires_at: expiresAt,
      },
      { onConflict: "source,search_key" }
    );
    // Enrich components table with LCSC supplier PN
    enrichComponentFromAPI(adminDb, {
      mpn: r.mpn,
      description: r.description,
      lcsc_pn: r.lcsc_pn,
    }).catch(() => {});
  }

  // Build historical context for response
  const historicalInfo = historical.latest
    ? {
        historical_price: historical.latest.unit_price,
        historical_supplier: historical.latest.supplier,
        historical_date: historical.latest.procured_at,
        historical_age_days: historical.latest.age_days,
      }
    : {};

  // If no API results but we have historical data, use it as fallback
  if (suppliers.length === 0 && historical.latest) {
    await cacheHistoricalPrice(adminDb, mpn, mpn, historical.latest);
    return NextResponse.json({
      mpn,
      best_price: historical.latest.unit_price,
      best_source: "procurement_history",
      best_supplier_pn: historical.latest.supplier_pn,
      price_source: "historical",
      stock_status: "unknown" as StockStatus,
      digikey_pn: digikeyPnForFallback,
      suppliers: [{
        source: "procurement_history",
        unit_price: historical.latest.unit_price,
        currency: "CAD",
        in_stock: null,
        supplier_pn: historical.latest.supplier_pn,
        stock_qty: null,
      }],
      ...historicalInfo,
    });
  }

  // No suppliers found and no historical data — preserve DigiKey PN for manual lookup
  if (suppliers.length === 0) {
    return NextResponse.json(
      {
        mpn,
        best_price: null,
        best_source: null,
        best_supplier_pn: null,
        digikey_pn: digikeyPnForFallback,
        stock_status: "not_found" as StockStatus,
        suppliers: [],
        error: "Not found at any supplier",
        ...historicalInfo,
      },
      { status: 404 }
    );
  }

  // Stock-aware best price selection
  const best = selectBestSupplier(suppliers);
  if (!best) {
    return NextResponse.json(
      { mpn, best_price: null, suppliers: [], error: "Selection failed", ...historicalInfo },
      { status: 500 }
    );
  }

  return NextResponse.json({
    mpn,
    best_price: best.unit_price,
    best_source: best.source,
    best_supplier_pn: best.supplier_pn,
    stock_status: best.stock_status,
    stock_qty: best.stock_qty,
    in_stock: best.in_stock,
    digikey_pn: digikeyPnForFallback,
    suppliers: suppliers.map((s) => ({
      source: s.source,
      unit_price: s.unit_price,
      currency: s.currency,
      in_stock: s.in_stock,
      supplier_pn: s.supplier_pn,
      stock_qty: s.stock_qty,
      stock_status: s.stock_status,
    })),
    ...historicalInfo,
  });
}
