import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchLiveRates, setManualRate, getRate } from "@/lib/pricing/fx";
// Common distributor currencies we may need to convert from.
const DEFAULT_CURRENCIES = ["USD", "EUR", "GBP", "CNY", "JPY", "AUD", "CHF", "HKD", "PLN"];

/** GET â€” read current cached rates for a set of currency pairs (to=CAD by default). */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const to = url.searchParams.get("to") ?? "CAD";
  const fromParam = url.searchParams.get("from");
  const currencies = fromParam ? fromParam.split(",") : DEFAULT_CURRENCIES;

  const rates = await Promise.all(currencies.map(async (c) => await getRate(c, to)));
  return NextResponse.json({
    to,
    rates: rates.filter(Boolean),
  });
}

/**
 * POST â€” either fetch live rates from the provider, or save a manual override.
 * Body: { action: "fetch_live", currencies?: string[], to?: string }
 *     | { action: "manual", from: string, to: string, rate: number }
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;

  if (action === "fetch_live") {
    const currencies = Array.isArray(body.currencies) && body.currencies.length > 0
      ? (body.currencies as string[])
      : DEFAULT_CURRENCIES;
    const to = typeof body.to === "string" ? body.to : "CAD";
    try {
      const rates = await fetchLiveRates(currencies, to, user.id);
      return NextResponse.json({ ok: true, rates });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: "Failed to fetch live rates", details: msg }, { status: 502 });
    }
  }

  if (action === "manual") {
    const from = typeof body.from === "string" ? body.from : "";
    const to = typeof body.to === "string" ? body.to : "CAD";
    const rate = typeof body.rate === "number" ? body.rate : Number(body.rate);
    if (!from) {
      return NextResponse.json({ error: "from currency required" }, { status: 400 });
    }
    try {
      const saved = await setManualRate(from, to, rate, user.id);
      return NextResponse.json({ ok: true, rate: saved });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "Unknown action. Expected 'fetch_live' or 'manual'." }, { status: 400 });
}
