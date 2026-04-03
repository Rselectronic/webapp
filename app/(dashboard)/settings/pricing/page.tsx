import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PricingSettingsForm } from "@/components/settings/pricing-settings-form";
import type { PricingSettings } from "@/lib/pricing/types";

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
  const settings = (settingsRow?.value ?? {}) as PricingSettings;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Pricing Settings</h2>
        <p className="text-sm text-gray-500">
          Adjust markup rates, assembly costs, and NRE defaults.
        </p>
      </div>
      <PricingSettingsForm settings={settings} />
    </div>
  );
}
