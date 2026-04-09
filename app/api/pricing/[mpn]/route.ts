import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchPartPrice } from "@/lib/pricing/digikey";
import { searchMouserPrice } from "@/lib/pricing/mouser";
import { searchLCSCPrice } from "@/lib/pricing/lcsc";

interface SupplierResult {
  source: string;
  mpn: string;
  unit_price: number;
  currency: string;
  in_stock: boolean;
  supplier_pn: string;
  stock_qty?: number;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mpn: string }> }
) {
  const { mpn } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check cache for all sources
  const { data: cached } = await supabase
    .from("api_pricing_cache")
    .select("unit_price, stock_qty, fetched_at, source, response")
    .eq("search_key", mpn)
    .gt("expires_at", new Date().toISOString());

  if (cached && cached.length > 0) {
    const results = cached.map((c) => ({
      source: c.source,
      unit_price: c.unit_price,
      stock_qty: c.stock_qty,
      fetched_at: c.fetched_at,
    }));
    const best = results.reduce((a, b) =>
      (a.unit_price ?? Infinity) <= (b.unit_price ?? Infinity) ? a : b
    );
    return NextResponse.json({
      mpn,
      best_price: best.unit_price,
      best_source: best.source,
      source: "cache",
      suppliers: results,
    });
  }

  // Query all 3 suppliers in parallel
  const [digikey, mouser, lcsc] = await Promise.allSettled([
    searchPartPrice(mpn),
    searchMouserPrice(mpn),
    searchLCSCPrice(mpn),
  ]);

  const suppliers: SupplierResult[] = [];
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Process DigiKey
  if (digikey.status === "fulfilled" && digikey.value) {
    const r = digikey.value;
    suppliers.push({
      source: "digikey",
      mpn: r.mpn,
      unit_price: r.unit_price,
      currency: r.currency,
      in_stock: r.in_stock,
      supplier_pn: r.digikey_pn,
    });
    await supabase.from("api_pricing_cache").upsert(
      {
        source: "digikey",
        mpn: r.mpn,
        search_key: mpn,
        response: r as unknown as Record<string, unknown>,
        unit_price: r.unit_price,
        stock_qty: null,
        currency: r.currency,
        expires_at: expiresAt,
      },
      { onConflict: "source,search_key" }
    );
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
  }

  if (suppliers.length === 0) {
    return NextResponse.json(
      { mpn, best_price: null, suppliers: [], error: "Not found at any supplier" },
      { status: 404 }
    );
  }

  // Find best price
  const best = suppliers.reduce((a, b) =>
    a.unit_price <= b.unit_price ? a : b
  );

  return NextResponse.json({
    mpn,
    best_price: best.unit_price,
    best_source: best.source,
    best_supplier_pn: best.supplier_pn,
    in_stock: best.in_stock,
    suppliers: suppliers.map((s) => ({
      source: s.source,
      unit_price: s.unit_price,
      currency: s.currency,
      in_stock: s.in_stock,
      supplier_pn: s.supplier_pn,
      stock_qty: s.stock_qty,
    })),
  });
}
