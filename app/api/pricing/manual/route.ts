import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// POST /api/pricing/manual
// Manually enter a unit price for an MPN that DigiKey/Mouser/LCSC couldn't
// price. Upserts into api_pricing_cache with source='manual' and a 365-day
// expiry so the recalc path picks it up exactly like any other cached price.
// ---------------------------------------------------------------------------

interface ManualPriceBody {
  mpn: string;
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

  const { mpn, unit_price, currency } = body;

  if (!mpn || typeof mpn !== "string" || !mpn.trim()) {
    return NextResponse.json(
      { error: "Missing required field: mpn" },
      { status: 400 }
    );
  }

  if (typeof unit_price !== "number" || !Number.isFinite(unit_price) || unit_price < 0) {
    return NextResponse.json(
      { error: "unit_price must be a non-negative number" },
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
        mpn,
        search_key: mpn.toUpperCase(),
        response: {
          manual: true,
          entered_by: user.id,
          entered_at: new Date().toISOString(),
        },
        unit_price,
        stock_qty: null,
        currency: currency ?? "CAD",
        fetched_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: "source,search_key" }
    );

  if (upsertError) {
    return NextResponse.json(
      { error: "Failed to save manual price", details: upsertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, mpn, unit_price });
}
