import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recomputeQuotePricing } from "@/lib/pricing/recompute";
import type { TierInput } from "@/lib/pricing/types";
// ---------------------------------------------------------------------------
// POST /api/quotes/[id]/recalculate
// Re-runs the pricing engine against the stored BOM using the current
// api_pricing_cache state (which may now include manually-entered prices).
// Only allowed for quotes in 'draft' or 'review' status.
// ---------------------------------------------------------------------------
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin-only: recalc rewrites quote.pricing â€” production users have no
  // UPDATE policy on quotes (the user-scoped update would silently no-op),
  // and this is a commercial-money operation regardless. Gate explicitly.
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  // --- Fetch the quote ---
  const { data: quote, error: fetchError } = await supabase
    .from("quotes")
    .select("id, status, bom_id, quantities, pricing, pcb_cost_per_unit, nre_charge")
    .eq("id", id)
    .single();

  if (fetchError || !quote) {
    return NextResponse.json(
      { error: "Quote not found", details: fetchError?.message },
      { status: 404 }
    );
  }

  // --- Gate by status ---
  if (quote.status !== "draft" && quote.status !== "review") {
    return NextResponse.json(
      {
        error: `Cannot recalculate a quote with status '${quote.status}'. Only 'draft' or 'review' quotes can be recalculated.`,
      },
      { status: 400 }
    );
  }

  // --- Reconstruct tier inputs ---
  const existingPricing =
    (quote.pricing as {
      tier_inputs?: TierInput[];
    } | null) ?? null;

  let resolvedTiers: TierInput[] | null = null;
  if (Array.isArray(existingPricing?.tier_inputs) && existingPricing!.tier_inputs!.length > 0) {
    resolvedTiers = existingPricing!.tier_inputs!;
  } else {
    // Fallback: reconstruct from top-level fields
    const quantities = quote.quantities as Record<string, number> | null;
    const qtyValues = quantities ? Object.values(quantities) : [];
    if (qtyValues.length > 0) {
      resolvedTiers = qtyValues.map((qty) => ({
        qty,
        pcb_unit_price: Number(quote.pcb_cost_per_unit ?? 0),
        nre_programming: 0,
        nre_stencil: 0,
        nre_pcb_fab: 0,
      }));
    }
  }

  if (!resolvedTiers || resolvedTiers.length === 0) {
    return NextResponse.json(
      { error: "Quote has no tier inputs â€” cannot recalculate" },
      { status: 400 }
    );
  }

  // --- Shipping flat: read from stored pricing if present, else default 200 ---
  const storedPricingAny = (quote.pricing ?? {}) as {
    tiers?: Array<{ shipping?: number }>;
  };
  const shipping_flat =
    storedPricingAny.tiers?.[0]?.shipping != null
      ? Number(storedPricingAny.tiers[0].shipping)
      : 200;

  // --- Run pricing engine via shared helper ---
  let pricing;
  try {
    const result = await recomputeQuotePricing(
      supabase,
      quote.bom_id,
      resolvedTiers,
      shipping_flat
    );
    pricing = result.pricing;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pricing failed";
    const status = message.includes("No component lines") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  // --- Persist back onto the quote ---
  const { error: updateError } = await supabase
    .from("quotes")
    .update({
      pricing: {
        tiers: pricing.tiers,
        warnings: pricing.warnings,
        missing_price_components: pricing.missing_price_components,
        tier_inputs: resolvedTiers,
      },
      pcb_cost_per_unit: resolvedTiers[0]?.pcb_unit_price ?? 0,
      assembly_cost: pricing.tiers[0]?.assembly_cost ?? 0,
      nre_charge: pricing.tiers[0]?.nre_charge ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update quote", details: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, pricing });
}
