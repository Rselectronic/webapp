import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// POST /api/pricing/customer-quote
//
// Import a real distributor quote (emailed PDF, rep quote, ad-hoc supplier
// like WMD) for a single BOM line. Writes into api_pricing_cache with
// source='customer_quote' so the existing recompute pipeline picks it up;
// the price-source ranking in lib/pricing/recompute.ts treats customer_quote
// as outranking both manual entry and any API source for the same line.
//
// Identifier resolution mirrors /api/pricing/manual:
//   - if mpn provided → cache key is uppercase MPN
//   - else if bom_line_id provided → look up the line's MPN/CPC, fall back
//     to the bom_line_id itself when neither exists
// ---------------------------------------------------------------------------

interface CustomerQuoteBody {
  mpn?: string;
  bom_line_id?: string;
  supplier_name: string;
  unit_price: number;
  currency?: string;
  qty_break?: number;
  quote_ref?: string;
  valid_until?: string; // ISO date YYYY-MM-DD
  supplier_part_number?: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CustomerQuoteBody;
  try {
    body = (await req.json()) as CustomerQuoteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await upsertCustomerQuote(supabase, user.id, body);
  if (!result.ok)
    return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, mpn: result.mpn, unit_price: body.unit_price });
}

interface UpsertResult {
  ok: boolean;
  status: number;
  error?: string;
  mpn?: string;
}

export async function upsertCustomerQuote(
  // Typed as `any` to avoid a tight coupling to the supabase-js generic; the
  // caller already has an authenticated client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  body: CustomerQuoteBody
): Promise<UpsertResult> {
  const {
    mpn: rawMpn,
    bom_line_id,
    supplier_name,
    unit_price,
    currency,
    qty_break,
    quote_ref,
    valid_until,
    supplier_part_number,
  } = body;

  if (!supplier_name || !supplier_name.trim())
    return { ok: false, status: 400, error: "Missing required field: supplier_name" };
  if ((!rawMpn || !rawMpn.trim()) && !bom_line_id)
    return { ok: false, status: 400, error: "Missing required field: mpn or bom_line_id" };
  if (typeof unit_price !== "number" || !Number.isFinite(unit_price) || unit_price <= 0)
    return { ok: false, status: 400, error: "unit_price must be a positive number" };
  if (valid_until && !/^\d{4}-\d{2}-\d{2}$/.test(valid_until))
    return { ok: false, status: 400, error: "valid_until must be YYYY-MM-DD" };

  // Resolve cache key. Prefer real MPN; fall back to bom_line lookup.
  let cacheKey: string;
  let mpnForRecord: string;
  if (rawMpn && rawMpn.trim()) {
    cacheKey = rawMpn.trim().toUpperCase();
    mpnForRecord = rawMpn.trim();
  } else {
    const { data: bomLine } = await supabase
      .from("bom_lines")
      .select("mpn, cpc")
      .eq("id", bom_line_id)
      .single();
    if (bomLine?.mpn?.trim()) {
      cacheKey = bomLine.mpn.trim().toUpperCase();
      mpnForRecord = bomLine.mpn.trim();
    } else if (bomLine?.cpc?.trim()) {
      cacheKey = bomLine.cpc.trim().toUpperCase();
      mpnForRecord = bomLine.cpc.trim();
    } else {
      cacheKey = (bom_line_id as string).toUpperCase();
      mpnForRecord = bom_line_id as string;
    }
  }

  // Build a one-tier price_breaks entry so the cache row looks shaped like
  // any other supplier quote downstream (auto-pick already iterates breaks).
  const priceBreaks = [
    {
      min_qty: typeof qty_break === "number" && qty_break > 0 ? qty_break : 1,
      max_qty: null,
      unit_price,
      currency: currency ?? "CAD",
    },
  ];

  // Generous expiry: customer quotes are typically valid 30-90 days. We
  // honour the stated valid_until when given, otherwise default to 90 days
  // so the row stays in cache until the operator either re-imports or the
  // pricing review surfaces an expiry warning.
  const fallbackExpiry = new Date();
  fallbackExpiry.setDate(fallbackExpiry.getDate() + 90);
  const expiresAt = valid_until
    ? new Date(`${valid_until}T23:59:59Z`)
    : fallbackExpiry;

  const { error: upsertError } = await supabase
    .from("api_pricing_cache")
    .upsert(
      {
        source: "customer_quote",
        mpn: mpnForRecord,
        search_key: cacheKey,
        supplier_name: supplier_name.trim(),
        supplier_part_number: supplier_part_number?.trim() || null,
        quote_ref: quote_ref?.trim() || null,
        valid_until: valid_until ?? null,
        response: {
          customer_quote: true,
          entered_by: userId,
          entered_at: new Date().toISOString(),
          bom_line_id: bom_line_id ?? null,
        },
        unit_price,
        stock_qty: null,
        currency: currency ?? "CAD",
        price_breaks: priceBreaks,
        fetched_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: "source,search_key,supplier_part_number,warehouse_code" }
    );

  if (upsertError)
    return {
      ok: false,
      status: 500,
      error: `Failed to save customer quote: ${upsertError.message}`,
    };

  return { ok: true, status: 200, mpn: mpnForRecord };
}
