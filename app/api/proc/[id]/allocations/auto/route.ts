import { isAdminRole } from "@/lib/auth/roles";
// ----------------------------------------------------------------------------
// app/api/proc/[id]/allocations/auto/route.ts
//
// POST /api/proc/[id]/allocations/auto
//
// Auto-reserve inventory against this PROC's merged BOM. The PROC integration
// agent computes the merged BOM (qty per effective CPC Ã— member.quantity +
// overage extras) and POSTs it here as { lines: [{ cpc, qty_needed }] }.
//
// CPC is the matching key â€” it's the business identity at RS, and the BOM
// parser fills CPC from MPN when a customer doesn't supply one, so this
// covers both cases.
//
// We do that delegation rather than recomputing the BOM here because:
//   1. The merge logic lives in app/(dashboard)/proc/[id]/page.tsx and the
//      PROC integration agent owns it.
//   2. Re-implementing the merge (pcb_orders extras, overage_table, alts)
//      in two places would drift.
//   3. This route stays pure: lookup â†’ reserve â†’ return.
//
// Returns:
//   {
//     allocations: Array<{
//       cpc, inventory_part_id, qty_needed, allocated_qty, shortfall,
//       allocation: InventoryAllocation | null
//     }>,
//     shortfalls: Array<{ cpc, qty_short }>,   // includes both partial-fill
//                                                and no-match cases
//     unmatched_cpcs: string[]                 // not in inventory_parts at all
//   }
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import {
  findInventoryByCpc,
  reserveAllocation,
} from "@/lib/inventory/allocator";
import { computeMergedCpcs } from "@/lib/inventory/auto-allocate-proc";

interface AutoLine {
  cpc: string;
  qty_needed: number;
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Two ways to call this endpoint:
  //   â€¢ Body { lines: Array<{ cpc, qty_needed }> } â€” caller (e.g. PROC
  //     creation hook) precomputes the merged list.
  //   â€¢ Empty body (or no `lines`) â€” server recomputes the merged BOM
  //     itself. The "Re-run allocation" button on the stock-allocations
  //     panel uses this path because the client doesn't have the merged
  //     list cheaply available.
  let linesRaw: unknown = body.lines;
  if (!Array.isArray(linesRaw)) {
    try {
      const merged = await computeMergedCpcs(supabase, procurement_id);
      linesRaw = merged;
    } catch (e) {
      console.error("auto-allocate â€” computeMergedCpcs failed:", e);
      return NextResponse.json(
        { error: "Failed to compute merged BOM for allocation" },
        { status: 500 }
      );
    }
  }
  if (!Array.isArray(linesRaw)) {
    return NextResponse.json(
      { error: "Body must include `lines: Array<{ cpc, qty_needed }>` or omit body for server-side merge" },
      { status: 400 }
    );
  }

  // Confirm the PROC exists. Without this check a typo'd procurement_id
  // would silently produce zero allocations.
  const { data: proc, error: procErr } = await supabase
    .from("procurements")
    .select("id")
    .eq("id", procurement_id)
    .maybeSingle();
  if (procErr) {
    console.error("auto-allocate â€” proc lookup failed:", procErr);
    return NextResponse.json({ error: procErr.message }, { status: 500 });
  }
  if (!proc) {
    return NextResponse.json({ error: "Procurement not found" }, { status: 404 });
  }

  // Coerce + dedupe input lines. If the caller sends the same CPC twice
  // (which can happen when the merge upstream wasn't strict), sum the
  // quantities so we make one reservation per part instead of fighting
  // the partial unique index.
  const merged = new Map<string, AutoLine>();
  for (const raw of linesRaw) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const cpc = r.cpc == null ? "" : String(r.cpc).trim();
    const qty = Number(r.qty_needed);
    if (!cpc || !Number.isFinite(qty) || qty <= 0) continue;
    const key = cpc.toUpperCase();
    const prev = merged.get(key);
    if (prev) {
      prev.qty_needed += Math.floor(qty);
    } else {
      merged.set(key, { cpc, qty_needed: Math.floor(qty) });
    }
  }

  if (merged.size === 0) {
    return NextResponse.json({
      allocations: [],
      shortfalls: [],
      unmatched_cpcs: [],
    });
  }

  // Bulk inventory lookup â€” one round-trip for all CPCs.
  const inventoryMap = await findInventoryByCpc(
    supabase,
    Array.from(merged.keys())
  );

  const allocations: Array<{
    cpc: string;
    inventory_part_id: string | null;
    qty_needed: number;
    allocated_qty: number;
    shortfall: number;
    allocation: unknown;
  }> = [];
  const shortfalls: Array<{ cpc: string; qty_short: number }> = [];
  const unmatched_cpcs: string[] = [];

  for (const [cpcUpper, line] of merged) {
    const part = inventoryMap.get(cpcUpper);
    if (!part) {
      // Not in inventory at all â€” full shortfall, no allocation row.
      unmatched_cpcs.push(line.cpc);
      shortfalls.push({ cpc: line.cpc, qty_short: line.qty_needed });
      continue;
    }

    try {
      const result = await reserveAllocation(supabase, {
        inventory_part_id: part.id,
        procurement_id,
        qty_needed: line.qty_needed,
        user_id: user.id,
      });

      allocations.push({
        cpc: line.cpc,
        inventory_part_id: part.id,
        qty_needed: line.qty_needed,
        allocated_qty: result.allocated_qty,
        shortfall: result.shortfall,
        allocation: result.allocation,
      });

      if (result.shortfall > 0) {
        shortfalls.push({ cpc: line.cpc, qty_short: result.shortfall });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`auto-allocate failed for ${line.cpc}:`, msg);
      // Treat a single failed reservation as a full shortfall and keep going
      // â€” one bad row shouldn't sink the whole PROC's allocation pass.
      shortfalls.push({ cpc: line.cpc, qty_short: line.qty_needed });
      allocations.push({
        cpc: line.cpc,
        inventory_part_id: part.id,
        qty_needed: line.qty_needed,
        allocated_qty: 0,
        shortfall: line.qty_needed,
        allocation: null,
      });
    }
  }

  return NextResponse.json({
    allocations,
    shortfalls,
    unmatched_cpcs,
  });
}
