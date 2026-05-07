import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import { recomputeQuotePricing } from "@/lib/pricing/recompute";
import type { TierInput } from "@/lib/pricing/types";
import type { TaxRegion } from "@/lib/tax/regions";
import { resolveFxRate } from "@/lib/fx/boc";
import {
  taxRegionForAddress,
  currencyForAddress,
  normalizeCountry,
} from "@/lib/address/regions";

// ---------------------------------------------------------------------------
// GET /api/quotes — List quotes with optional filters
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const customerId = url.searchParams.get("customer_id");

  let query = supabase
    .from("quotes")
    .select(
      "*, customers(code, company_name), gmps(gmp_number, board_name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq("status", status);
  }
  if (customerId) {
    query = query.eq("customer_id", customerId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// ---------------------------------------------------------------------------
// POST /api/quotes — Create a new quote from a parsed BOM
// ---------------------------------------------------------------------------

interface CreateQuoteTierInput {
  qty: number;
  pcb_unit_price: number;
  nre_programming: number;
  nre_stencil: number;
  nre_pcb_fab: number;
}

interface CreateQuoteBody {
  bom_id: string;
  gmp_id: string;
  customer_id: string;
  /** New per-tier inputs */
  tiers?: CreateQuoteTierInput[];
  /** @deprecated — legacy flat fields */
  quantities?: number[];
  pcb_unit_price?: number;
  nre_charge?: number;
  shipping_flat: number;
  notes?: string;
  /** Per-tier lead times, e.g. {"tier_1": "4-6 weeks", "tier_2": "3-4 weeks"} */
  lead_times?: Record<string, string>;
  /** Per-quote markup overrides (optional — fall back to global settings) */
  component_markup_pct?: number;
  pcb_markup_pct?: number;
  /** Board details */
  boards_per_panel?: number;
  ipc_class?: string;
  solder_type?: string;
}

export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as CreateQuoteBody;
  const {
    bom_id,
    gmp_id,
    customer_id,
    tiers: tierInputs,
    quantities: legacyQuantities,
    pcb_unit_price: legacyPcbPrice,
    shipping_flat,
    notes,
  } = body;

  const hasTiers = Array.isArray(tierInputs) && tierInputs.length > 0;
  const hasLegacy = Array.isArray(legacyQuantities) && legacyQuantities.length > 0;

  if (!bom_id || !gmp_id || !customer_id || (!hasTiers && !hasLegacy)) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: bom_id, gmp_id, customer_id, tiers (array) or quantities (array)",
      },
      { status: 400 }
    );
  }

  // Resolve to unified TierInput format
  const resolvedTiers: TierInput[] = hasTiers
    ? tierInputs!.map((t) => ({
        qty: t.qty,
        pcb_unit_price: t.pcb_unit_price ?? 0,
        nre_programming: t.nre_programming ?? 0,
        nre_stencil: t.nre_stencil ?? 0,
        nre_pcb_fab: t.nre_pcb_fab ?? 0,
      }))
    : legacyQuantities!.map((qty) => ({
        qty,
        pcb_unit_price: legacyPcbPrice ?? 0,
        nre_programming: 0,
        nre_stencil: 0,
        nre_pcb_fab: 0,
      }));

  const quantities = resolvedTiers.map((t) => t.qty);

  // Pull physical board layout off the GMP — drives the single- vs
  // double-sided programming fee lookup. Falls back to NULL (engine treats
  // unknown as double-sided, which is the most common board style at RS).
  const { data: gmpRow } = await supabase
    .from("gmps")
    .select("board_side")
    .eq("id", gmp_id)
    .maybeSingle();
  const boardSide =
    gmpRow?.board_side === "single" || gmpRow?.board_side === "double"
      ? gmpRow.board_side
      : null;

  // --- Run pricing engine via shared helper ---
  let pricing;
  let settings;
  try {
    const result = await recomputeQuotePricing(
      supabase,
      bom_id,
      resolvedTiers,
      shipping_flat,
      boardSide,
      {
        component_markup_pct: body.component_markup_pct,
        pcb_markup_pct: body.pcb_markup_pct,
      }
    );
    pricing = result.pricing;
    settings = result.settings;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pricing failed";
    const status =
      message.includes("No component lines") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  // --- Generate quote number: QT-YYMM-NNN ---
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `QT-${yy}${mm}`;

  const { count } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .like("quote_number", `${prefix}%`);

  const seq = String((count ?? 0) + 1).padStart(3, "0");
  const quoteNumber = `${prefix}-${seq}`;

  // --- Snapshot the billing address used for this quote. tax_region +
  // currency derive from the address; customer-level fields are LEGACY
  // fallbacks for customers with no billing addresses yet.
  const { data: customerForSnap } = await supabase
    .from("customers")
    .select("default_currency, tax_region, billing_addresses")
    .eq("id", customer_id)
    .maybeSingle();

  type BillingAddr = {
    label?: string;
    street?: string;
    city?: string;
    province?: string;
    postal_code?: string;
    country?: string;
    country_code?: "CA" | "US" | "OTHER";
    is_default?: boolean;
  };
  const billingAddresses =
    (customerForSnap?.billing_addresses as BillingAddr[] | null) ?? [];
  const requestedLabel = (body as { billing_address_label?: string })
    .billing_address_label;
  const requestedAddr = (body as { billing_address?: BillingAddr })
    .billing_address;

  let resolvedAddr: BillingAddr | null = null;
  if (requestedAddr && typeof requestedAddr === "object") {
    resolvedAddr = requestedAddr;
  } else if (requestedLabel) {
    resolvedAddr =
      billingAddresses.find((a) => a.label === requestedLabel) ?? null;
  }
  if (!resolvedAddr) {
    resolvedAddr =
      billingAddresses.find((a) => a.is_default) ??
      billingAddresses[0] ??
      null;
  }

  let quoteTaxRegion: TaxRegion;
  let quoteCurrency: "CAD" | "USD";
  if (resolvedAddr) {
    quoteTaxRegion = taxRegionForAddress({
      country_code: resolvedAddr.country_code,
      country: resolvedAddr.country,
      province: resolvedAddr.province,
    });
    quoteCurrency = currencyForAddress({
      country_code: resolvedAddr.country_code,
      country: resolvedAddr.country,
    });
  } else {
    quoteTaxRegion = (customerForSnap?.tax_region as TaxRegion) ?? "QC";
    quoteCurrency =
      (customerForSnap?.default_currency as "CAD" | "USD" | undefined) === "USD"
        ? "USD"
        : "CAD";
  }
  const billingSnapshot: BillingAddr | null = resolvedAddr
    ? {
        ...resolvedAddr,
        country_code:
          resolvedAddr.country_code ??
          normalizeCountry(resolvedAddr.country ?? ""),
      }
    : null;
  const quoteFx = await resolveFxRate(quoteCurrency, null);

  // --- Insert quote ---
  const { data: quote, error: insertError } = await supabase
    .from("quotes")
    .insert({
      quote_number: quoteNumber,
      customer_id,
      gmp_id,
      bom_id,
      status: "draft",
      quantities: Object.fromEntries(
        quantities.map((q, i) => [`qty_${i + 1}`, q])
      ),
      pricing: {
        tiers: pricing.tiers,
        warnings: pricing.warnings,
        missing_price_components: pricing.missing_price_components,
        tier_inputs: resolvedTiers,
      },
      component_markup: settings.component_markup_pct ?? 25,
      pcb_cost_per_unit: resolvedTiers[0]?.pcb_unit_price ?? 0,
      assembly_cost: pricing.tiers[0]?.assembly_cost ?? 0,
      nre_charge: pricing.tiers[0]?.nre_charge ?? 0,
      labour_rate: settings.labour_rate_per_hour ?? null,
      smt_rate: (settings.use_time_model !== false)
        ? (settings.smt_rate_per_hour ?? null)
        : (settings.smt_cost_per_placement ?? null),
      validity_days: settings.quote_validity_days ?? 30,
      notes: notes ?? null,
      lead_times: body.lead_times ?? {},
      boards_per_panel: body.boards_per_panel ?? 1,
      ipc_class: body.ipc_class ?? "2",
      solder_type: body.solder_type ?? "lead-free",
      currency: quoteCurrency,
      fx_rate_to_cad: quoteFx.rate,
      tax_region: quoteTaxRegion,
      billing_address: billingSnapshot,
      created_by: user.id,
    })
    .select("id, quote_number")
    .single();

  if (insertError || !quote) {
    return NextResponse.json(
      { error: "Failed to create quote", details: insertError?.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      quote_id: quote.id,
      quote_number: quote.quote_number,
      pricing,
    },
    { status: 201 }
  );
}
