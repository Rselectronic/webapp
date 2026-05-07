import { isAdminRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LabourSettingsForm, type LabourSettingsInput } from "@/components/settings/labour-settings-form";
const DEFAULTS: LabourSettingsInput = {
  monthly_overhead: 50000,
  production_staff_count: 4,
  hours_per_day: 8,
  days_per_month: 21,
  utilization_pct: 75,
  conveyor_mm_per_sec: null,
  oven_length_mm: null,
  reflow_passes_default: 1,
  cycle_cp_seconds: null,
  cycle_0402_seconds: null,
  cycle_0201_seconds: null,
  cycle_ip_seconds: null,
  cycle_mansmt_seconds: null,
  cycle_th_base_seconds: null,
  cycle_th_per_pin_seconds: null,
  cycle_depanel_seconds: 40,
  smt_line_setup_minutes: null,
  feeder_setup_minutes_each: null,
  first_article_minutes: null,
  inspection_minutes_per_board: null,
  touchup_minutes_per_board: null,
  packing_minutes_per_board: null,
};

export default async function LabourSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role)) redirect("/");

  const { data: row } = await supabase
    .from("labour_settings")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  const initial: LabourSettingsInput = row
    ? {
        monthly_overhead: row.monthly_overhead,
        production_staff_count: row.production_staff_count,
        hours_per_day: row.hours_per_day,
        days_per_month: row.days_per_month,
        utilization_pct: row.utilization_pct,
        conveyor_mm_per_sec: row.conveyor_mm_per_sec,
        oven_length_mm: row.oven_length_mm,
        reflow_passes_default: row.reflow_passes_default,
        cycle_cp_seconds: row.cycle_cp_seconds,
        cycle_0402_seconds: row.cycle_0402_seconds,
        cycle_0201_seconds: row.cycle_0201_seconds,
        cycle_ip_seconds: row.cycle_ip_seconds,
        cycle_mansmt_seconds: row.cycle_mansmt_seconds,
        cycle_th_base_seconds: row.cycle_th_base_seconds,
        cycle_th_per_pin_seconds: row.cycle_th_per_pin_seconds,
        cycle_depanel_seconds: row.cycle_depanel_seconds ?? 40,
        smt_line_setup_minutes: row.smt_line_setup_minutes,
        feeder_setup_minutes_each: row.feeder_setup_minutes_each,
        first_article_minutes: row.first_article_minutes,
        inspection_minutes_per_board: row.inspection_minutes_per_board,
        touchup_minutes_per_board: row.touchup_minutes_per_board,
        packing_minutes_per_board: row.packing_minutes_per_board,
      }
    : DEFAULTS;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/settings">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
      </Link>
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Labour Settings</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Configure the burdened shop rate and per-part cycle times that drive the assembly
          pricing engine. Every save creates a new versioned row â€” historical quotes reference
          the settings row that was active at their creation time.
        </p>
      </div>
      <LabourSettingsForm initial={initial} />
    </div>
  );
}
