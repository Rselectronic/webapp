import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// POST /api/pricing/manual
// Manually enter a unit price for an MPN that DigiKey/Mouser/LCSC couldn't
// price. Upserts into api_pricing_cache with source='manual' and a 365-day
// expiry so the recalc path picks it up exactly like any other cached price.
// ---------------------------------------------------------------------------

interface ManualPriceBody {
  mpn?: string;
  bom_line_id?: string;
  unit_price: number;
  currency?: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ManualPriceBody;
  try {
    body = (await req.json()) as ManualPriceBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { mpn: rawMpn, bom_line_id, unit_price, currency } = body;

  // Accept either a real MPN or a bom_line_id as identifier
  if ((!rawMpn || !rawMpn.trim()) && !bom_line_id) {
    return NextResponse.json(
      { error: "Missing required field: mpn or bom_line_id" },
      { status: 400 }
    );
  }

  if (typeof unit_price !== "number" || !Number.isFinite(unit_price) || unit_price < 0) {
    return NextResponse.json(
      { error: "unit_price must be a non-negative number" },
      { status: 400 }
    );
  }

  // Resolve the cache key: prefer real MPN, else look up CPC from bom_line, else use bom_line_id
  let cacheKey: string;
  let mpnForRecord: string;

  if (rawMpn && rawMpn.trim()) {
    cacheKey = rawMpn.trim().toUpperCase();
    mpnForRecord = rawMpn.trim();
  } else if (bom_line_id) {
    // Look up the bom_line to find its CPC or MPN
    const { data: bomLine } = await supabase
      .from("bom_lines")
      .select("mpn, cpc")
      .eq("id", bom_line_id)
      .single();

    if (bomLine?.mpn && bomLine.mpn.trim()) {
      cacheKey = bomLine.mpn.trim().toUpperCase();
      mpnForRecord = bomLine.mpn.trim();
    } else if (bomLine?.cpc && bomLine.cpc.trim()) {
      cacheKey = bomLine.cpc.trim().toUpperCase();
      mpnForRecord = bomLine.cpc.trim();
    } else {
      // Last resort: use bom_line_id itself as the cache key
      cacheKey = bom_line_id.toUpperCase();
      mpnForRecord = bom_line_id;
    }
  } else {
    return NextResponse.json(
      { error: "Missing required field: mpn or bom_line_id" },
      { status: 400 }
    );
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 365);

  const { error: upsertError } = await supabase
    .from("api_pricing_cache")
    .upsert(
      {
        source: "manual",
        mpn: mpnForRecord,
        search_key: cacheKey,
        response: {
          manual: true,
          entered_by: user.id,
          entered_at: new Date().toISOString(),
          bom_line_id: bom_line_id ?? null,
        },
        unit_price,
        stock_qty: null,
        currency: currency ?? "CAD",
        fetched_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: "source,search_key,supplier_part_number,warehouse_code" }
    );

  if (upsertError) {
    return NextResponse.json(
      { error: "Failed to save manual price", details: upsertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, mpn: mpnForRecord, unit_price });
}
