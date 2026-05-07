import { isAdminRole } from "@/lib/auth/roles";
// ----------------------------------------------------------------------------
// app/api/proc/[id]/allocations/route.ts
//
// GET /api/proc/[id]/allocations â€” list inventory allocations against this
// PROC. The PROC stock allocations panel reads from this endpoint to show
// what's reserved/consumed/released for the PROC at a glance.
//
// Returns:
//   {
//     allocations: Array<{
//       ...allocation,
//       inventory_parts: { id, mpn, cpc, manufacturer, description, pool, ... }
//     }>
//   }
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Optionally filter by status â€” defaults to all so the panel can show
  // the full lifecycle (reserved + consumed + released).
  const sp = req.nextUrl.searchParams;
  const statusFilter = sp.get("status");

  // Use the FK constraint name as the embed hint. The colon-alias syntax
  // (`inventory_parts:inventory_part_id`) is for renames, not FK hints â€”
  // PostgREST silently returns no nested data, so the panel rendered
  // empty Pool / CPC / MPN / Description cells after a Re-run.
  let query = supabase
    .from("inventory_allocations")
    .select(
      `id, inventory_part_id, procurement_id, qty_allocated, status, notes,
       created_at, consumed_at, released_at, created_by,
       inventory_parts!inventory_allocations_inventory_part_id_fkey (
         id, mpn, cpc, manufacturer, description, pool, min_stock_threshold, is_active
       )`
    )
    .eq("procurement_id", id)
    .order("created_at", { ascending: false });

  if (statusFilter) query = query.eq("status", statusFilter);

  const { data, error } = await query;
  if (error) {
    console.error("GET /api/proc/[id]/allocations failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ allocations: data ?? [] });
}
