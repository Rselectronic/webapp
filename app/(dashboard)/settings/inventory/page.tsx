import { isAdminRole } from "@/lib/auth/roles";
// ----------------------------------------------------------------------------
// app/(dashboard)/settings/inventory/page.tsx
// Settings â†’ Inventory landing page. Lets ops manage the BG / Safety part
// catalog (add, import, edit min thresholds, retire parts).
// ----------------------------------------------------------------------------

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { InventorySettingsClient } from "@/components/inventory/inventory-settings-client";
import type { InventoryPartStock } from "@/lib/inventory/types";

export const dynamic = "force-dynamic";

export default async function InventorySettingsPage() {
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
  if (!isAdminRole(profile?.role)) {
    redirect("/");
  }

  const { data: parts } = await supabase
    .from("inventory_part_stock")
    .select(
      "id, serial_no, cpc, mpn, manufacturer, description, pool, min_stock_threshold, is_active, notes, created_at, updated_at, physical_qty, reserved_qty, available_qty",
    )
    .order("cpc", { ascending: true });

  const initialParts: InventoryPartStock[] = (parts ??
    []) as InventoryPartStock[];

  return (
    <div className="space-y-6">
      <Link href="/settings">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
      </Link>

      <div>
        <h2 className="text-2xl font-bold text-gray-900">Inventory</h2>
        <p className="text-sm text-gray-500">
          Manage BG (background feeder) and Safety stock parts. Stock movements
          (buys, consumption, manual adjustments) are recorded automatically as
          parts are used on PROCs.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manage parts</CardTitle>
          <CardDescription>
            Add new parts, update min-stock thresholds, retire inactive parts.
            Use Import to bulk-load a list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InventorySettingsClient initialParts={initialParts} />
        </CardContent>
      </Card>
    </div>
  );
}
