import type { SupabaseClient } from "@supabase/supabase-js";
import type { DigiKeyPartResult } from "./digikey";

/**
 * Enrich the components table with data from supplier API responses.
 * Called after pricing lookups — saves package, mounting type, dimensions, supplier PNs.
 * This data feeds the M-code size rules (PAR-20 through PAR-24).
 *
 * Uses upsert: if component exists, update missing fields without overwriting manual data.
 */
export async function enrichComponentFromAPI(
  supabase: SupabaseClient,
  data: {
    mpn: string;
    manufacturer?: string;
    description?: string;
    mounting_type?: string;
    package_case?: string;
    category?: string;
    length_mm?: number;
    width_mm?: number;
    height_mm?: number;
    digikey_pn?: string;
    mouser_pn?: string;
    lcsc_pn?: string;
  }
): Promise<void> {
  if (!data.mpn) return;

  // Check if component exists
  const { data: existing } = await supabase
    .from("components")
    .select("id, m_code, m_code_source, mounting_type, package_case, length_mm, width_mm")
    .eq("mpn", data.mpn)
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Update only fields that are currently empty (don't overwrite manual data)
    const updates: Record<string, unknown> = {};
    if (!existing.mounting_type && data.mounting_type) updates.mounting_type = data.mounting_type;
    if (!existing.package_case && data.package_case) updates.package_case = data.package_case;
    if (!existing.length_mm && data.length_mm) updates.length_mm = data.length_mm;
    if (!existing.width_mm && data.width_mm) updates.width_mm = data.width_mm;
    if (data.category) updates.category = data.category;
    if (data.digikey_pn) updates.digikey_pn = data.digikey_pn;
    if (data.mouser_pn) updates.mouser_pn = data.mouser_pn;
    if (data.lcsc_pn) updates.lcsc_pn = data.lcsc_pn;
    if (data.height_mm) updates.height_mm = data.height_mm;
    updates.last_api_update = new Date().toISOString();
    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length > 2) { // more than just timestamps
      await supabase.from("components").update(updates).eq("id", existing.id);
    }
  } else {
    // Insert new component (no M-code yet — classifier will assign it)
    // Use upsert to handle unique constraint on (mpn, manufacturer)
    await supabase.from("components").upsert({
      mpn: data.mpn,
      manufacturer: data.manufacturer ?? "Unknown",
      description: data.description ?? null,
      mounting_type: data.mounting_type ?? null,
      package_case: data.package_case ?? null,
      category: data.category ?? null,
      length_mm: data.length_mm ?? null,
      width_mm: data.width_mm ?? null,
      height_mm: data.height_mm ?? null,
      digikey_pn: data.digikey_pn ?? null,
      mouser_pn: data.mouser_pn ?? null,
      lcsc_pn: data.lcsc_pn ?? null,
      last_api_update: new Date().toISOString(),
    }, { onConflict: "mpn,manufacturer", ignoreDuplicates: true });
  }
}

/**
 * Batch enrich components from DigiKey results.
 * Fire-and-forget — doesn't block pricing flow.
 */
export async function enrichComponentsFromDigiKey(
  supabase: SupabaseClient,
  results: DigiKeyPartResult[]
): Promise<void> {
  const promises = results
    .filter((r) => r.mpn && (r.mounting_type || r.package_case || r.length_mm))
    .map((r) =>
      enrichComponentFromAPI(supabase, {
        mpn: r.mpn,
        description: r.description,
        mounting_type: r.mounting_type,
        package_case: r.package_case,
        category: r.category,
        length_mm: r.length_mm,
        width_mm: r.width_mm,
        height_mm: r.height_mm,
        digikey_pn: r.digikey_pn,
      })
    );
  await Promise.all(promises);
}
