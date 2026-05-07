import { isAdminRole } from "@/lib/auth/roles";
// ----------------------------------------------------------------------------
// app/api/proc/[id]/lines/receive/route.ts
//
// POST /api/proc/[id]/lines/receive
//   Body: {
//     cpc: string,
//     qty_received: number,
//     supplier?: string,        // optional; defaults to chosen_supplier on the selection
//     notes?: string,           // optional; PO ref or any free-text
//   }
//
// What it does:
//   1. Find the procurement_line_selections row for (procurement_id, cpc).
//      Use that row's chosen_supplier if `supplier` not provided in body.
//   2. If the part is in the inventory_parts BG / Safety pool, write a
//      positive inventory_movements row (kind='buy_for_proc'). The
//      recordMovement helper auto-runs a top-up pass that bumps every
//      still-reserved allocation against this part up to its PROC's
//      qty_needed (see lib/inventory/allocator.ts), so the operator never
//      has to click "Re-run allocation" by hand.
//   3. Flip the selection's order_status to 'received' regardless of pool.
//
// For non-BG / non-Safety rows this just flips the status (today's behaviour).
// BG-aware rows additionally write to inventory and self-heal reservations.
//
// Auth: admin only.
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import { recordMovement } from "@/lib/inventory/allocator";
interface PostBody {
  cpc?: string;
  qty_received?: number;
  supplier?: string | null;
  notes?: string | null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: procurement_id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const cpc = (body?.cpc ?? "").trim();
  if (!cpc) {
    return NextResponse.json({ error: "cpc required" }, { status: 400 });
  }
  const qty_received = Number(body?.qty_received);
  if (!Number.isFinite(qty_received) || !Number.isInteger(qty_received) || qty_received <= 0) {
    return NextResponse.json(
      { error: "qty_received must be a positive integer" },
      { status: 400 }
    );
  }

  // 1. Find the selection row by CPC. Fall back to chosen_supplier from the
  //    row when the body didn't provide a supplier.
  const { data: sel, error: selErr } = await supabase
    .from("procurement_line_selections")
    .select("id, mpn, cpc, chosen_supplier")
    .eq("procurement_id", procurement_id)
    .eq("cpc", cpc)
    .limit(1)
    .maybeSingle();
  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  if (!sel) {
    return NextResponse.json(
      {
        error:
          "No selection row found for this CPC. Pick a distributor first, then mark received.",
      },
      { status: 404 }
    );
  }

  const supplier =
    (body?.supplier && String(body.supplier).trim()) ||
    sel.chosen_supplier ||
    null;
  const noteRef = body?.notes ? String(body.notes).trim() : "";

  // 2. Look up the inventory part (best-effort â€” the row may not be in the
  //    BG / Safety pool, in which case we just skip the inventory write).
  const { data: part, error: partErr } = await supabase
    .from("inventory_parts")
    .select("id, pool, is_active")
    .eq("cpc", cpc)
    .maybeSingle();
  if (partErr) {
    // Don't block the status flip on a part-lookup failure â€” log and continue.
    console.warn("[lines/receive] inventory_parts lookup failed", {
      procurement_id,
      cpc,
      err: partErr.message,
    });
  }

  let movement_id: string | null = null;
  if (part && part.is_active && (part.pool === "bg" || part.pool === "safety")) {
    try {
      const movement = await recordMovement(supabase, {
        inventory_part_id: part.id,
        delta: qty_received,
        kind: "buy_for_proc",
        proc_id: procurement_id,
        notes:
          `From ${supplier ?? "supplier"}${noteRef ? ` Â· ${noteRef}` : ""}`.slice(0, 500),
        user_id: user.id,
      });
      movement_id = movement.id;
      // recordMovement's internal top-up pass already bumped this PROC's
      // reservation toward procurement_lines.qty_needed (or held the existing
      // reservation as a no-shrink floor). No explicit reserveAllocation
      // needed here.
    } catch (err) {
      // If the inventory write fails (e.g. RLS), don't silently swallow â€”
      // surface a 500 so the operator sees that stock didn't land. The
      // selection status still gets flipped below intentionally? No â€”
      // safer to fail the whole request and let the operator retry.
      const msg = err instanceof Error ? err.message : "Failed to record movement";
      console.error("[lines/receive] recordMovement failed", { procurement_id, cpc, err: msg });
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // 3. Flip the selection's order_status to 'received'. Only update the
  //    fields we care about â€” chosen_supplier etc. are preserved.
  const { error: updErr } = await supabase
    .from("procurement_line_selections")
    .update({ order_status: "received" })
    .eq("id", sel.id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // 4. Return the active reservation (if any) so the client can refresh the
  //    Stock badge without a full re-fetch.
  let allocation_id: string | null = null;
  let new_reservation_qty: number | null = null;
  if (part) {
    const { data: alloc } = await supabase
      .from("inventory_allocations")
      .select("id, qty_allocated")
      .eq("inventory_part_id", part.id)
      .eq("procurement_id", procurement_id)
      .eq("status", "reserved")
      .limit(1)
      .maybeSingle();
    if (alloc) {
      allocation_id = alloc.id;
      new_reservation_qty = Number(alloc.qty_allocated ?? 0);
    }
  }

  return NextResponse.json({
    ok: true,
    movement_id,
    allocation_id,
    new_reservation_qty,
  });
}
