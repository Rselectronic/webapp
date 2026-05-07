import { isAdminRole } from "@/lib/auth/roles";
// ----------------------------------------------------------------------------
// app/(dashboard)/inventory/page.tsx
// Top-level Inventory list page. Server-rendered initial fetch from the
// inventory_part_stock view; client-side filtering/search lives in
// <InventoryListClient />.
// ----------------------------------------------------------------------------

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { InventoryListClient } from "@/components/inventory/inventory-list-client";
import type { InventoryPartStock } from "@/lib/inventory/types";
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Inventory is admin-only (RLS enforces this too â€” production users see no
  // rows). Redirect non-admins so they don't land on an empty page that looks
  // like a bug.
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role)) redirect("/");

  // Read directly from the view â€” same shape the API would return. We pull
  // both active and inactive so the "Show inactive" toggle works without a
  // re-fetch.
  const { data: parts, error } = await supabase
    .from("inventory_part_stock")
    .select(
      "id, serial_no, cpc, mpn, manufacturer, description, pool, min_stock_threshold, is_active, notes, created_at, updated_at, physical_qty, reserved_qty, available_qty",
    )
    .order("cpc", { ascending: true });

  const initialParts: InventoryPartStock[] = (parts ??
    []) as InventoryPartStock[];

  const activeCount = initialParts.filter((p) => p.is_active).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Inventory</h2>
        <p className="text-sm text-gray-500">
          BG (background) feeder stock and Safety stock.{" "}
          {activeCount} active part{activeCount === 1 ? "" : "s"}.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load inventory: {error.message}
        </div>
      ) : (
        <InventoryListClient initialParts={initialParts} />
      )}
    </div>
  );
}
