import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateLabourCost } from "@/lib/pricing/engine";
import type { PricingSettings } from "@/lib/pricing/types";

// ---------------------------------------------------------------------------
// POST /api/labour — Calculate labour cost breakdown for a BOM + quantity
// ---------------------------------------------------------------------------
//
// Body: { bom_id: string, board_qty: number }
// Returns: Labour breakdown with placement stats, setup/programming costs, NRE
// ---------------------------------------------------------------------------

interface LabourRequestBody {
  bom_id: string;
  board_qty: number;
  // Optional overrides — if not provided, uses app_settings defaults
  labour_rate_per_hour?: number;
  smt_rate_per_hour?: number;
  smt_cost_per_placement?: number;
  th_cost_per_placement?: number;
  mansmt_cost_per_placement?: number;
  setup_time_hours?: number;
  programming_time_hours?: number;
}

const SMT_MCODES = new Set(["CP", "CPEXP", "0402", "0201", "IP"]);
const TH_MCODES = new Set(["TH"]);
const MANSMT_MCODES = new Set(["MANSMT"]);
const CP_FEEDER_MCODES = new Set(["CP", "CPEXP", "0402", "0201"]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as LabourRequestBody;
  const { bom_id, board_qty } = body;

  if (!bom_id || !board_qty || board_qty <= 0) {
    return NextResponse.json(
      { error: "Missing required fields: bom_id, board_qty (positive number)" },
      { status: 400 }
    );
  }

  // Fetch BOM lines
  const { data: bomLines, error: bomError } = await supabase
    .from("bom_lines")
    .select("id, mpn, description, m_code, quantity")
    .eq("bom_id", bom_id)
    .eq("is_pcb", false)
    .eq("is_dni", false);

  if (bomError) {
    return NextResponse.json(
      { error: "Failed to fetch BOM lines", details: bomError.message },
      { status: 500 }
    );
  }

  if (!bomLines || bomLines.length === 0) {
    return NextResponse.json(
      { error: "No component lines found for this BOM" },
      { status: 400 }
    );
  }

  // Fetch pricing settings
  const { data: settingsRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "pricing")
    .single();

  const settings = (settingsRow?.value ?? {}) as PricingSettings;

  // Calculate M-code placement stats
  let smtPlacements = 0;
  let thPlacements = 0;
  let mansmtPlacements = 0;
  let totalUniqueLines = 0;
  let cpFeederCount = 0;
  let ipFeederCount = 0;
  let cpPlacementSum = 0;
  let ipPlacementSum = 0;
  let thPlacementSum = 0;
  let mansmtCountSum = 0;

  for (const line of bomLines) {
    const qty = line.quantity ?? 0;
    if (qty > 0) totalUniqueLines++;

    const mc = line.m_code as string | null;
    if (mc && SMT_MCODES.has(mc)) {
      smtPlacements += qty;
      if (CP_FEEDER_MCODES.has(mc)) {
        cpFeederCount++;
        cpPlacementSum += qty;
      } else {
        // IP
        ipFeederCount++;
        ipPlacementSum += qty;
      }
    } else if (mc && TH_MCODES.has(mc)) {
      thPlacements += qty;
      thPlacementSum += qty;
    } else if (mc && MANSMT_MCODES.has(mc)) {
      mansmtPlacements += qty;
      mansmtCountSum += qty;
    }
  }

  // Use overrides or defaults
  const labourRate = body.labour_rate_per_hour ?? settings.labour_rate_per_hour ?? 130;
  const smtCostPerPlacement = body.smt_cost_per_placement ?? settings.smt_cost_per_placement ?? 0.035;
  const thCostPerPlacement = body.th_cost_per_placement ?? settings.th_cost_per_placement ?? 0.75;
  const mansmtCostPerPlacement = body.mansmt_cost_per_placement ?? settings.mansmt_cost_per_placement ?? 1.25;
  const setupTimeHours = body.setup_time_hours ?? settings.setup_time_hours ?? 0;
  const programmingTimeHours = body.programming_time_hours ?? settings.programming_time_hours ?? 0;

  const labourCost = calculateLabourCost({
    smtPlacements,
    thPlacements,
    mansmtPlacements,
    boardQty: board_qty,
    smtCostPerPlacement: smtCostPerPlacement,
    thCostPerPlacement: thCostPerPlacement,
    mansmtCostPerPlacement: mansmtCostPerPlacement,
    labourRatePerHour: labourRate,
    setupTimeHours,
    programmingTimeHours,
  });

  // NRE breakdown
  const nreProgramming = settings.nre_programming ?? 0;
  const nreStencil = settings.nre_stencil ?? 0;
  const nreSetup = settings.nre_setup ?? 0;
  const nrePcbFab = settings.nre_pcb_fab ?? 0;
  const nreMisc = settings.nre_misc ?? 0;
  const nreTotal = nreProgramming + nreStencil + nreSetup + nrePcbFab + nreMisc;

  return NextResponse.json({
    bom_id,
    board_qty,
    // Placement stats
    stats: {
      total_unique_lines: totalUniqueLines,
      total_smt_placements: smtPlacements + mansmtPlacements,
      cp_feeder_count: cpFeederCount,
      ip_feeder_count: ipFeederCount,
      cp_placement_sum: cpPlacementSum,
      ip_placement_sum: ipPlacementSum,
      mansmt_count: mansmtCountSum,
      th_placement_sum: thPlacementSum,
    },
    // Rates used
    rates: {
      labour_rate_per_hour: labourRate,
      smt_cost_per_placement: smtCostPerPlacement,
      th_cost_per_placement: thCostPerPlacement,
      mansmt_cost_per_placement: mansmtCostPerPlacement,
      setup_time_hours: setupTimeHours,
      programming_time_hours: programmingTimeHours,
    },
    // Calculated costs
    labour: labourCost,
    // NRE breakdown
    nre: {
      programming: nreProgramming,
      stencil: nreStencil,
      setup: nreSetup,
      pcb_fab: nrePcbFab,
      misc: nreMisc,
      total: nreTotal,
    },
    // Grand total (labour + NRE)
    grand_total: Math.round((labourCost.total_labour_cost + nreTotal) * 100) / 100,
  });
}
