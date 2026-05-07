import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayMontreal } from "@/lib/utils/format";
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("labour_settings")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

export async function POST(req: Request) {
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
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Record<string, unknown>;

  // Deactivate current active row, insert new active row (versioned history).
  const { error: deactErr } = await supabase
    .from("labour_settings")
    .update({ is_active: false })
    .eq("is_active", true);
  if (deactErr) return NextResponse.json({ error: deactErr.message }, { status: 500 });

  const insertRow = {
    effective_date: todayMontreal(),
    is_active: true,
    monthly_overhead: Number(body.monthly_overhead ?? 0),
    production_staff_count: Number(body.production_staff_count ?? 1),
    hours_per_day: Number(body.hours_per_day ?? 8),
    days_per_month: Number(body.days_per_month ?? 21),
    utilization_pct: Number(body.utilization_pct ?? 75),
    conveyor_mm_per_sec: numOrNull(body.conveyor_mm_per_sec),
    oven_length_mm: numOrNull(body.oven_length_mm),
    reflow_passes_default: numOrNull(body.reflow_passes_default) ?? 1,
    cycle_cp_seconds: numOrNull(body.cycle_cp_seconds),
    cycle_0402_seconds: numOrNull(body.cycle_0402_seconds),
    cycle_0201_seconds: numOrNull(body.cycle_0201_seconds),
    cycle_ip_seconds: numOrNull(body.cycle_ip_seconds),
    cycle_mansmt_seconds: numOrNull(body.cycle_mansmt_seconds),
    cycle_th_base_seconds: numOrNull(body.cycle_th_base_seconds),
    cycle_th_per_pin_seconds: numOrNull(body.cycle_th_per_pin_seconds),
    cycle_depanel_seconds: numOrNull(body.cycle_depanel_seconds),
    smt_line_setup_minutes: numOrNull(body.smt_line_setup_minutes),
    feeder_setup_minutes_each: numOrNull(body.feeder_setup_minutes_each),
    first_article_minutes: numOrNull(body.first_article_minutes),
    inspection_minutes_per_board: numOrNull(body.inspection_minutes_per_board),
    touchup_minutes_per_board: numOrNull(body.touchup_minutes_per_board),
    packing_minutes_per_board: numOrNull(body.packing_minutes_per_board),
    updated_by: user.id,
  };

  const { data, error } = await supabase
    .from("labour_settings")
    .insert(insertRow)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
