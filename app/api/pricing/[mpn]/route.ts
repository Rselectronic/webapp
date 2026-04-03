import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchPartPrice } from "@/lib/pricing/digikey";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mpn: string }> }
) {
  const { mpn } = await params;
  const supabase = await createClient();

  // Check cache
  const { data: cached } = await supabase
    .from("api_pricing_cache")
    .select("unit_price, stock_qty, fetched_at, source")
    .eq("source", "digikey")
    .eq("search_key", mpn)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (cached)
    return NextResponse.json({
      mpn,
      unit_price: cached.unit_price,
      source: "cache",
      fetched_at: cached.fetched_at,
    });

  try {
    const result = await searchPartPrice(mpn);
    if (!result)
      return NextResponse.json(
        { mpn, unit_price: null, source: "digikey", error: "Not found" },
        { status: 404 }
      );

    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    await supabase.from("api_pricing_cache").upsert(
      {
        source: "digikey",
        mpn: result.mpn,
        search_key: mpn,
        response: result as unknown as Record<string, unknown>,
        unit_price: result.unit_price,
        stock_qty: null,
        currency: result.currency,
        expires_at: expiresAt,
      },
      { onConflict: "source,search_key" }
    );

    return NextResponse.json({
      mpn: result.mpn,
      unit_price: result.unit_price,
      currency: result.currency,
      in_stock: result.in_stock,
      digikey_pn: result.digikey_pn,
      source: "digikey",
    });
  } catch (err) {
    return NextResponse.json(
      {
        mpn,
        unit_price: null,
        error:
          err instanceof Error ? err.message : "DigiKey unavailable",
      },
      { status: 502 }
    );
  }
}
