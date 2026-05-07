// ----------------------------------------------------------------------------
// lib/inventory/allocator.ts
//
// Pure helpers for the BG / Safety inventory feature. None of these functions
// open their own Supabase connection — callers pass in an authenticated
// SupabaseClient (typically the one returned by getAuthUser). RLS policies
// (see migration 079) enforce who can read/write.
//
// The schema lives in supabase/migrations/079_inventory.sql (refactored to
// key on CPC in migration 080):
//   • inventory_parts        — master parts list (one row per stocked CPC)
//   • inventory_movements    — append-only ledger; SUM(delta) = physical_qty
//   • inventory_allocations  — soft holds against a PROC (one open row per
//                              (part, PROC) pair via partial unique index)
//   • inventory_part_stock   — view exposing physical / reserved / available
//
// Why this lives in lib/ instead of in each route:
//   1. The PROC integration agent needs to call reserveAllocation from a
//      different route than the inventory module.
//   2. recordMovement always has to read physical_qty first (for the
//      qty_before/qty_after snapshot), so centralising it avoids
//      copy-pasted "fetch then insert" blocks everywhere.
//   3. Tests can mock the Supabase client directly.
// ----------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InventoryAllocation,
  InventoryMovement,
  InventoryMovementKind,
  InventoryPartStock,
} from "./types";

// We intentionally type the Supabase client loosely — the project doesn't
// generate Database types into this folder yet, and these helpers only
// touch a handful of columns.
type SB = SupabaseClient<any, any, any>;

// ----------------------------------------------------------------------------
// recordMovement
//
// Inserts a row into inventory_movements with a correct qty_before/qty_after
// snapshot. Used by every code path that mutates physical stock:
//   • POST /api/inventory                      (initial_stock on create)
//   • POST /api/inventory/[id]/movements       (manual adjusts, external buys, top-ups)
//   • PROC integration (buy_for_proc when a supplier PO covers a shortfall)
//   • consumeAllocation (consume_proc, written from this very file)
//
// Returns the inserted movement row.
// ----------------------------------------------------------------------------
export interface RecordMovementInput {
  inventory_part_id: string;
  delta: number; // signed, must be non-zero
  kind: InventoryMovementKind;
  proc_id?: string | null;
  po_id?: string | null;
  job_id?: string | null;
  notes?: string | null;
  user_id?: string | null;
}

export async function recordMovement(
  supabase: SB,
  input: RecordMovementInput
): Promise<InventoryMovement> {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new Error("delta must be a non-zero integer");
  }

  // Read physical_qty from the view. The view computes SUM(movements.delta),
  // so it always reflects what's been committed up to this point.
  const { data: stock, error: stockErr } = await supabase
    .from("inventory_part_stock")
    .select("physical_qty")
    .eq("id", input.inventory_part_id)
    .maybeSingle();
  if (stockErr) throw new Error(`Failed to read current stock: ${stockErr.message}`);
  if (!stock) throw new Error(`Inventory part ${input.inventory_part_id} not found`);

  const qty_before = Number(stock.physical_qty ?? 0);
  const qty_after = qty_before + input.delta;

  const { data, error } = await supabase
    .from("inventory_movements")
    .insert({
      inventory_part_id: input.inventory_part_id,
      delta: input.delta,
      kind: input.kind,
      proc_id: input.proc_id ?? null,
      po_id: input.po_id ?? null,
      job_id: input.job_id ?? null,
      qty_before,
      qty_after,
      notes: input.notes ?? null,
      created_by: input.user_id ?? null,
    })
    .select(
      "id, inventory_part_id, delta, kind, proc_id, po_id, job_id, qty_before, qty_after, notes, created_by, created_at"
    )
    .single();

  if (error) throw new Error(`Failed to record movement: ${error.message}`);

  // Fail-safe: when stock arrives (delta > 0), bump every still-reserved
  // allocation against this part up to the relevant PROC's qty_needed. This
  // makes reservations self-heal regardless of how the stock landed (Mark
  // Received button, manual adjust on inventory page, future PO receive,
  // etc.) — the operator never has to click "Re-run allocation" by hand.
  //
  // Wrapped in try/catch so the top-up is best-effort: a follow-on bug here
  // must NEVER cause a successful movement insert to look like a failure
  // (the stock is already in the ledger).
  if (input.delta > 0) {
    try {
      await topUpReservationsForPart(supabase, input.inventory_part_id, input.user_id ?? null);
    } catch (err) {
      console.warn("[recordMovement] auto-top-up failed (non-fatal)", {
        inventory_part_id: input.inventory_part_id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return data as InventoryMovement;
}

// ----------------------------------------------------------------------------
// topUpReservationsForPart
//
// For a given inventory_part_id, find every still-reserved allocation and
// re-run reserveAllocation against the relevant PROC's qty_needed target.
//
// "Relevant qty_needed" is found by joining procurement_lines on
// (procurement_id, cpc) — that's the materialised buy target post-quote-save.
// If no procurement_lines row exists yet (PROC is still in draft / merged-BOM
// only), we leave the existing qty_allocated as a floor (don't shrink) by
// passing it as the qty_needed target.
//
// reserveAllocation already handles the "add back the existing reservation
// before recomputing available" math and updates in place via the partial
// unique index, so this is just a thin orchestration helper.
// ----------------------------------------------------------------------------
async function topUpReservationsForPart(
  supabase: SB,
  inventory_part_id: string,
  user_id: string | null
): Promise<void> {
  // 1. Get all open reservations for this part.
  const { data: reservations, error: resErr } = await supabase
    .from("inventory_allocations")
    .select("id, procurement_id, qty_allocated")
    .eq("inventory_part_id", inventory_part_id)
    .eq("status", "reserved");
  if (resErr) throw new Error(`Failed to list reservations: ${resErr.message}`);
  if (!reservations || reservations.length === 0) return;

  // 2. Look up the part's CPC so we can find matching procurement_lines.
  const { data: part, error: partErr } = await supabase
    .from("inventory_parts")
    .select("cpc")
    .eq("id", inventory_part_id)
    .maybeSingle();
  if (partErr) throw new Error(`Failed to read inventory part: ${partErr.message}`);
  const cpcUpper = part?.cpc ? String(part.cpc).trim().toUpperCase() : null;

  // 3. Bulk-fetch procurement_lines for every PROC we have an allocation
  //    against, filtered by this CPC (case-insensitive — DB stores raw case).
  const procIds = Array.from(new Set(reservations.map((r) => r.procurement_id)));
  let qtyTargetByProc = new Map<string, number>();
  if (cpcUpper && procIds.length > 0) {
    const { data: plRows } = await supabase
      .from("procurement_lines")
      .select("procurement_id, cpc, qty_needed, qty_extra")
      .in("procurement_id", procIds);
    for (const r of (plRows ?? []) as Array<{
      procurement_id: string;
      cpc: string | null;
      qty_needed: number;
      qty_extra: number | null;
    }>) {
      if (!r.cpc) continue;
      if (r.cpc.trim().toUpperCase() !== cpcUpper) continue;
      const target = (r.qty_needed ?? 0) + (r.qty_extra ?? 0);
      // Sum if multiple lines share (procurement_id, cpc). Defensive — should
      // be one line per pair but the upstream merger doesn't enforce it.
      qtyTargetByProc.set(
        r.procurement_id,
        (qtyTargetByProc.get(r.procurement_id) ?? 0) + target
      );
    }
  }

  // 4. For each open reservation, recompute. Use the procurement_lines target
  //    when present; otherwise use the existing qty_allocated as a no-shrink
  //    floor (we only want to top up, never reduce on a positive movement).
  for (const r of reservations) {
    const target =
      qtyTargetByProc.get(r.procurement_id) ?? Number(r.qty_allocated ?? 0);
    if (!Number.isFinite(target) || target <= 0) continue;
    // Skip if the reservation already covers the target — nothing to do.
    if (Number(r.qty_allocated ?? 0) >= target) continue;
    try {
      await reserveAllocation(supabase, {
        inventory_part_id,
        procurement_id: r.procurement_id,
        qty_needed: target,
        user_id,
      });
    } catch (err) {
      // Log per-reservation; keep going so one bad PROC doesn't block others.
      console.warn("[topUpReservationsForPart] reserve retry failed", {
        inventory_part_id,
        procurement_id: r.procurement_id,
        target,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ----------------------------------------------------------------------------
// reserveAllocation
//
// Caps qty_allocated at min(qty_needed, available_qty). Returns
// { allocated_qty, shortfall } so the caller can show the operator what
// still needs to be sourced.
//
// • If available_qty <= 0, returns { allocated_qty: 0, shortfall: qty_needed }
//   without inserting anything. (The caller does not want a useless zero-row.)
// • If a 'reserved' allocation already exists for this (part, PROC) pair,
//   updates qty_allocated in place. The partial unique index
//   idx_inventory_allocations_one_reserved enforces only one open reservation
//   per pair — historical 'consumed' / 'released' rows are not touched.
//
// NOTE on consistency: between the SELECT-from-view and the INSERT/UPDATE,
// another reservation could land for the same part. In practice the
// allocator runs from a single operator session per PROC, so we accept the
// race rather than wrapping in a SELECT FOR UPDATE — Supabase doesn't
// support row-level locks via PostgREST, and adding an RPC just for this
// would be overkill. If the race ever bites in production, we can either
// wrap reservations in a small RPC or recompute on read.
// ----------------------------------------------------------------------------
export interface ReserveAllocationInput {
  inventory_part_id: string;
  procurement_id: string;
  qty_needed: number;
  user_id?: string | null;
  notes?: string | null;
}

export interface ReserveAllocationResult {
  allocated_qty: number;
  shortfall: number;
  allocation: InventoryAllocation | null;
}

export async function reserveAllocation(
  supabase: SB,
  input: ReserveAllocationInput
): Promise<ReserveAllocationResult> {
  if (!Number.isInteger(input.qty_needed) || input.qty_needed <= 0) {
    throw new Error("qty_needed must be a positive integer");
  }

  // Look up available stock from the view.
  const { data: stock, error: stockErr } = await supabase
    .from("inventory_part_stock")
    .select("available_qty, is_active")
    .eq("id", input.inventory_part_id)
    .maybeSingle();
  if (stockErr) {
    throw new Error(`Failed to read available stock: ${stockErr.message}`);
  }
  if (!stock) {
    throw new Error(`Inventory part ${input.inventory_part_id} not found`);
  }
  if (stock.is_active === false) {
    // Don't reserve against deactivated parts — caller should treat this as
    // a full shortfall.
    return { allocated_qty: 0, shortfall: input.qty_needed, allocation: null };
  }

  // available_qty can technically be < 0 if movements outpaced reservations
  // (over-consumption), so clamp.
  const available = Math.max(0, Number(stock.available_qty ?? 0));

  // Check for an existing open reservation on this (part, PROC) pair. If one
  // already exists, we recompute its qty (this lets the operator hit
  // "Re-run allocation" after stock changes without first having to release).
  const { data: existing, error: existErr } = await supabase
    .from("inventory_allocations")
    .select(
      "id, inventory_part_id, procurement_id, qty_allocated, status, notes, created_at, consumed_at, released_at, created_by"
    )
    .eq("inventory_part_id", input.inventory_part_id)
    .eq("procurement_id", input.procurement_id)
    .eq("status", "reserved")
    .maybeSingle();
  if (existErr) {
    throw new Error(`Failed to check existing allocation: ${existErr.message}`);
  }

  // Compute the new allocation. When recomputing an existing reservation, the
  // current row's qty_allocated is already reserved against availability, so
  // we add it back to the pool of "what we could allocate".
  const reservedByUs = existing ? Number(existing.qty_allocated) : 0;
  const effectiveAvailable = available + reservedByUs;
  const allocated_qty = Math.min(input.qty_needed, effectiveAvailable);
  const shortfall = input.qty_needed - allocated_qty;

  // Nothing to allocate and no existing row → bail out without touching the
  // table. Caller treats this as a 100% shortfall.
  if (allocated_qty <= 0 && !existing) {
    return { allocated_qty: 0, shortfall, allocation: null };
  }

  // If we'd zero-out an existing reservation, release it instead (so it
  // doesn't hold against availability with qty 0, which the CHECK constraint
  // forbids anyway).
  if (allocated_qty <= 0 && existing) {
    const { data: released, error: relErr } = await supabase
      .from("inventory_allocations")
      .update({
        status: "released",
        released_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select(
        "id, inventory_part_id, procurement_id, qty_allocated, status, notes, created_at, consumed_at, released_at, created_by"
      )
      .single();
    if (relErr) throw new Error(`Failed to release stale allocation: ${relErr.message}`);
    return { allocated_qty: 0, shortfall: input.qty_needed, allocation: released as InventoryAllocation };
  }

  if (existing) {
    // Update existing reservation in place.
    const { data: updated, error: updErr } = await supabase
      .from("inventory_allocations")
      .update({ qty_allocated: allocated_qty })
      .eq("id", existing.id)
      .select(
        "id, inventory_part_id, procurement_id, qty_allocated, status, notes, created_at, consumed_at, released_at, created_by"
      )
      .single();
    if (updErr) throw new Error(`Failed to update allocation: ${updErr.message}`);
    return {
      allocated_qty,
      shortfall,
      allocation: updated as InventoryAllocation,
    };
  }

  // Fresh insert.
  const { data: inserted, error: insErr } = await supabase
    .from("inventory_allocations")
    .insert({
      inventory_part_id: input.inventory_part_id,
      procurement_id: input.procurement_id,
      qty_allocated: allocated_qty,
      status: "reserved",
      notes: input.notes ?? null,
      created_by: input.user_id ?? null,
    })
    .select(
      "id, inventory_part_id, procurement_id, qty_allocated, status, notes, created_at, consumed_at, released_at, created_by"
    )
    .single();
  if (insErr) throw new Error(`Failed to insert allocation: ${insErr.message}`);

  return {
    allocated_qty,
    shortfall,
    allocation: inserted as InventoryAllocation,
  };
}

// ----------------------------------------------------------------------------
// consumeAllocation
//
// Flips an allocation from 'reserved' to 'consumed' AND writes the matching
// negative inventory_movements row (kind='consume_proc'). This is the moment
// stock physically leaves the shelf.
//
// We do these as two sequential writes. There is no real transaction across
// PostgREST calls, but:
//   • If the status flip succeeds and the movement insert fails, the caller
//     gets an error and the allocation is already 'consumed' but no stock
//     has been deducted. That's the worst-case race and is logged loudly.
//   • The reverse (movement first, then status flip) would be worse — stock
//     deducted but allocation still reserved would double-deduct on retry.
//
// In practice this is called from a webhook on production_events, which
// retries on failure, so an interrupted run heals itself.
// ----------------------------------------------------------------------------
export interface ConsumeAllocationInput {
  job_id?: string | null;
  user_id?: string | null;
  notes?: string | null;
}

export interface ConsumeAllocationResult {
  allocation: InventoryAllocation;
  movement: InventoryMovement;
}

export async function consumeAllocation(
  supabase: SB,
  allocation_id: string,
  input: ConsumeAllocationInput = {}
): Promise<ConsumeAllocationResult> {
  // Fetch the allocation and confirm it's still reserved (idempotent guard:
  // calling consume twice should error rather than double-deduct stock).
  const { data: alloc, error: allocErr } = await supabase
    .from("inventory_allocations")
    .select(
      "id, inventory_part_id, procurement_id, qty_allocated, status, notes, created_at, consumed_at, released_at, created_by"
    )
    .eq("id", allocation_id)
    .maybeSingle();
  if (allocErr) throw new Error(`Failed to read allocation: ${allocErr.message}`);
  if (!alloc) throw new Error(`Allocation ${allocation_id} not found`);
  if (alloc.status !== "reserved") {
    throw new Error(
      `Allocation ${allocation_id} is ${alloc.status}, not reserved — cannot consume`
    );
  }

  // 1. Flip status. Once this lands, we're committed to writing the matching
  //    movement row.
  const consumedAt = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("inventory_allocations")
    .update({ status: "consumed", consumed_at: consumedAt })
    .eq("id", allocation_id)
    .eq("status", "reserved") // optimistic guard against concurrent consume
    .select(
      "id, inventory_part_id, procurement_id, qty_allocated, status, notes, created_at, consumed_at, released_at, created_by"
    )
    .single();
  if (updErr || !updated) {
    throw new Error(
      `Failed to mark allocation consumed: ${updErr?.message ?? "row vanished mid-update"}`
    );
  }

  // 2. Write the matching consume_proc movement.
  const movement = await recordMovement(supabase, {
    inventory_part_id: alloc.inventory_part_id,
    delta: -alloc.qty_allocated,
    kind: "consume_proc",
    proc_id: alloc.procurement_id,
    job_id: input.job_id ?? null,
    notes: input.notes ?? null,
    user_id: input.user_id ?? null,
  });

  return { allocation: updated as InventoryAllocation, movement };
}

// ----------------------------------------------------------------------------
// releaseAllocation
//
// Flips a reserved allocation to 'released'. No movement row — releasing a
// reservation has no physical-stock effect, it just frees up available_qty
// for other PROCs. Used by the "Undo" button on the PROC stock allocations
// panel.
// ----------------------------------------------------------------------------
export async function releaseAllocation(
  supabase: SB,
  allocation_id: string,
  input: { user_id?: string | null; notes?: string | null } = {}
): Promise<InventoryAllocation> {
  const { data: alloc, error: allocErr } = await supabase
    .from("inventory_allocations")
    .select("id, status")
    .eq("id", allocation_id)
    .maybeSingle();
  if (allocErr) throw new Error(`Failed to read allocation: ${allocErr.message}`);
  if (!alloc) throw new Error(`Allocation ${allocation_id} not found`);
  if (alloc.status !== "reserved") {
    throw new Error(
      `Allocation ${allocation_id} is ${alloc.status}, not reserved — cannot release`
    );
  }

  const { data: updated, error: updErr } = await supabase
    .from("inventory_allocations")
    .update({
      status: "released",
      released_at: new Date().toISOString(),
      // Append-rather-than-overwrite — keep prior notes if present.
      ...(input.notes ? { notes: input.notes } : {}),
    })
    .eq("id", allocation_id)
    .eq("status", "reserved")
    .select(
      "id, inventory_part_id, procurement_id, qty_allocated, status, notes, created_at, consumed_at, released_at, created_by"
    )
    .single();
  if (updErr || !updated) {
    throw new Error(
      `Failed to release allocation: ${updErr?.message ?? "row vanished mid-update"}`
    );
  }
  return updated as InventoryAllocation;
}

// ----------------------------------------------------------------------------
// findInventoryByCpc
//
// Bulk lookup used by the auto-allocator: takes the merged BOM's distinct
// CPCs, returns a Map keyed by uppercase CPC. Only active parts are
// returned — deactivated rows (operator-flagged "don't allocate") are
// filtered out so they don't reserve.
//
// CPC is the business identity at RS. The BOM parser fills CPC from MPN
// when a customer doesn't supply one, so matching on CPC catches both the
// "customer-provided CPC" and "MPN-as-fallback CPC" cases. CPCs are
// normalised by uppercasing both sides of the comparison.
// ----------------------------------------------------------------------------
export async function findInventoryByCpc(
  supabase: SB,
  cpcs: string[]
): Promise<Map<string, InventoryPartStock>> {
  const out = new Map<string, InventoryPartStock>();
  if (!Array.isArray(cpcs) || cpcs.length === 0) return out;

  // Dedupe + uppercase. Filter blanks so we don't waste a round-trip.
  const normalized = Array.from(
    new Set(
      cpcs
        .map((c) => (c == null ? "" : String(c).trim().toUpperCase()))
        .filter((s) => s.length > 0)
    )
  );
  if (normalized.length === 0) return out;

  const { data, error } = await supabase
    .from("inventory_part_stock")
    .select("*")
    .in("cpc", normalized)
    .eq("is_active", true);
  if (error) throw new Error(`Failed to look up inventory: ${error.message}`);

  for (const row of (data ?? []) as InventoryPartStock[]) {
    out.set(String(row.cpc).toUpperCase(), row);
  }
  return out;
}
