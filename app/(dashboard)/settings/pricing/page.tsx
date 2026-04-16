import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PricingSettingsForm } from "@/components/settings/pricing-settings-form";
import type { PricingSettings } from "@/lib/pricing/types";

const DEFAULTS: PricingSettings = {
  component_markup_pct: 20,
  pcb_markup_pct: 30,
  smt_cost_per_placement: 0.035,
  th_cost_per_placement: 0.75,
  mansmt_cost_per_placement: 1.25,
  default_nre: 350,
  default_shipping: 200,
  quote_validity_days: 30,
  labour_rate_per_hour: 130,
  smt_rate_per_hour: 165,
  currency: "CAD",
  nre_programming: 100,
  nre_stencil: 100,
  nre_setup: 100,
  nre_pcb_fab: 0,
  nre_misc: 50,
  setup_time_hours: 1,
  programming_time_hours: 1,
  // Time-based assembly model (CPH rates from DM/TIME V11)
  cp_cph: 4500,
  small_cph: 3500,
  ultra_small_cph: 2500,
  ip_cph: 2000,
  th_cph: 150,
  mansmt_cph: 100,
  cp_load_time_min: 2,
  ip_load_time_min: 3,
  printer_setup_min: 15,
  use_time_model: true,
};

export default async function PricingSettingsPage() {
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
  if (profile?.role !== "ceo") redirect("/");

  const { data: settingsRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "pricing")
    .single();

  // Merge stored settings with defaults so new fields always have a value
  const stored = (settingsRow?.value ?? {}) as Partial<PricingSettings>;
  const settings: PricingSettings = { ...DEFAULTS, ...stored };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Pricing &amp; Labour Settings
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Configure markup rates, placement costs, labour rates, and NRE defaults.
          These values are used by the pricing engine when generating quotes.
          Equivalent to the TIME File V11 settings in the Excel system.
        </p>
      </div>
      <PricingSettingsForm settings={settings} />
    </div>
  );
}
