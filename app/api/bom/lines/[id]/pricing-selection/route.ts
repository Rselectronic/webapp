import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRate } from "@/lib/pricing/fx";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SelectionBody {
  tier_qty: number;
  supplier: string;
  supplier_part_number?: string | null;
  selected_unit_price: number;
  selected_currency: string;
  selected_lead_time_days?: number | null;
  selected_stock_qty?: number | null;
  warehouse_code?: string | null;
  notes?: string | null;
  /** Optional override — if not provided, we look up the cached FX rate. */
  fx_rate?: number | null;
  /** Reporting currency (defaults to CAD). */
  reporting_currency?: string;
}

/**
 * POST — upsert a per-tier supplier pick for a BOM line.
 * DELETE — remove the pick for a specific tier.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bomLineId } = await params;
  if (!UUID_RE.test(bomLineId)) {
    return NextResponse.json({ error: "Invalid BOM line id" }, { status: 400 });
  }

  let body: SelectionBody;
  try {
    body = (await req.json()) as SelectionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Number.isInteger(body.tier_qty) || body.tier_qty <= 0) {
    return NextResponse.json({ error: "tier_qty must be a positive integer" }, { status: 400 });
  }
  if (!body.supplier || typeof body.supplier !== "string") {
    return NextResponse.json({ error: "supplier required" }, { status: 400 });
  }
  if (!Number.isFinite(body.selected_unit_price) || body.selected_unit_price <= 0) {
    return NextResponse.json({ error: "selected_unit_price must be a positive number" }, { status: 400 });
  }
  if (!body.selected_currency) {
    return NextResponse.json({ error: "selected_currency required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if (!profile || (profile.role !== "ceo" && profile.role !== "operations_manager")) {
    return NextResponse.json({ error: "CEO or operations manager role required" }, { status: 403 });
  }

  const reportingCurrency = body.reporting_currency ?? "CAD";

  // Resolve FX rate. If native currency, use 1. If override provided, use it.
  // Otherwise look up the cached rate; error if none (forces user to click
  // "Fetch Live Rates" before saving a pick in a foreign currency).
  let fxRate: number | null = null;
  let unitPriceCad: number | null = null;
  if (body.selected_currency === reportingCurrency) {
    fxRate = 1.0;
    unitPriceCad = body.selected_unit_price;
  } else if (Number.isFinite(body.fx_rate ?? NaN) && (body.fx_rate ?? 0) > 0) {
    fxRate = body.fx_rate!;
    unitPriceCad = body.selected_unit_price * fxRate;
  } else {
    const fx = await getRate(body.selected_currency, reportingCurrency);
    if (!fx) {
      return NextResponse.json(
        {
          error: `No FX rate cached for ${body.selected_currency} → ${reportingCurrency}. Click "Fetch Live Rates" or pass fx_rate explicitly.`,
        },
        { status: 400 }
      );
    }
    fxRate = fx.rate;
    unitPriceCad = body.selected_unit_price * fx.rate;
  }

  const { data, error } = await supabase
    .from("bom_line_pricing")
    .upsert(
      {
        bom_line_id: bomLineId,
        tier_qty: body.tier_qty,
        supplier: body.supplier,
        supplier_part_number: body.supplier_part_number ?? null,
        selected_unit_price: body.selected_unit_price,
        selected_currency: body.selected_currency,
        selected_unit_price_cad: unitPriceCad,
        fx_rate: fxRate,
        selected_lead_time_days: body.selected_lead_time_days ?? null,
        selected_stock_qty: body.selected_stock_qty ?? null,
        warehouse_code: body.warehouse_code ?? null,
        notes: body.notes ?? null,
        selected_by: user.id,
        selected_at: new Date().toISOString(),
      },
      { onConflict: "bom_line_id,tier_qty" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to save pricing selection", details: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, selection: data });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bomLineId } = await params;
  if (!UUID_RE.test(bomLineId)) {
    return NextResponse.json({ error: "Invalid BOM line id" }, { status: 400 });
  }
  const url = new URL(req.url);
  const tierQtyRaw = url.searchParams.get("tier_qty");
  const tierQty = tierQtyRaw ? Number(tierQtyRaw) : NaN;
  if (!Number.isInteger(tierQty) || tierQty <= 0) {
    return NextResponse.json({ error: "tier_qty query param required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if (!profile || (profile.role !== "ceo" && profile.role !== "operations_manager")) {
    return NextResponse.json({ error: "CEO or operations manager role required" }, { status: 403 });
  }

  const { error } = await supabase
    .from("bom_line_pricing")
    .delete()
    .eq("bom_line_id", bomLineId)
    .eq("tier_qty", tierQty);
  if (error) {
    return NextResponse.json({ error: "Failed to delete selection", details: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
