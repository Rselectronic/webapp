import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// PATCH /api/quotes/[id]/markup
// Body: {
//   tier_markup_overrides: {
//     [tier_qty: string]: {
//       component_markup_pct?: number | null,
//       pcb_markup_pct?: number | null,
//       assembly_markup_pct?: number | null,
//     }
//   }
// }
//
// Each markup type is independent within a tier — null/undefined clears that
// type's override for the tier (falls back to global). Writes into
// `quotes.quantities.tier_markup_overrides` JSONB. Does NOT trigger
// recalculation; caller hits /calculate afterwards.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  type TierOverride = {
    component_markup_pct?: number | null;
    pcb_markup_pct?: number | null;
    assembly_markup_pct?: number | null;
  };
  const body = (await req.json()) as {
    tier_markup_overrides?: Record<string, TierOverride>;
  };

  const supabase = await createClient();
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

  if (!body.tier_markup_overrides || typeof body.tier_markup_overrides !== "object") {
    return NextResponse.json(
      { error: "tier_markup_overrides object required" },
      { status: 400 }
    );
  }

  // Pull current quantities JSONB so we don't clobber tiers/tier_pcb_prices/etc.
  const { data: quote, error: loadErr } = await supabase
    .from("quotes")
    .select("quantities")
    .eq("id", id)
    .single();
  if (loadErr || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  // Build the cleaned overrides map. Drop empty tier entries (all three null)
  // so the JSONB stays tidy and doesn't accumulate dead keys.
  const cleaned: Record<string, {
    component_markup_pct?: number;
    pcb_markup_pct?: number;
    assembly_markup_pct?: number;
  }> = {};
  for (const [qty, tier] of Object.entries(body.tier_markup_overrides)) {
    if (!tier || typeof tier !== "object") continue;
    const entry: Record<string, number> = {};
    const pick = (key: keyof TierOverride) => {
      const v = tier[key];
      if (v === null || v === undefined) return;
      const n = Number(v);
      if (Number.isFinite(n)) entry[key] = n;
    };
    pick("component_markup_pct");
    pick("pcb_markup_pct");
    pick("assembly_markup_pct");
    if (Object.keys(entry).length > 0) {
      cleaned[qty] = entry;
    }
  }

  const nextQuantities = {
    ...((quote.quantities as Record<string, unknown> | null) ?? {}),
    tier_markup_overrides: cleaned,
  };

  const { error } = await supabase
    .from("quotes")
    .update({ quantities: nextQuantities })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, tier_markup_overrides: cleaned });
}
