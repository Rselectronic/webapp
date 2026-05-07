// ----------------------------------------------------------------------------
// lib/inventory/types.ts — shared types for the BG / Safety stock feature.
// Schema lives in supabase/migrations/079_inventory.sql.
// ----------------------------------------------------------------------------

export type InventoryPool = "bg" | "safety";

export const INVENTORY_POOLS: InventoryPool[] = ["bg", "safety"];

export function poolLabel(pool: InventoryPool | null | undefined): string {
  if (pool === "bg") return "BG";
  if (pool === "safety") return "Safety";
  return "—";
}

export type InventoryMovementKind =
  | "buy_for_proc"
  | "buy_external"
  | "consume_proc"
  | "manual_adjust"
  | "safety_topup"
  | "initial_stock";

export const INVENTORY_MOVEMENT_KINDS: InventoryMovementKind[] = [
  "buy_for_proc",
  "buy_external",
  "consume_proc",
  "manual_adjust",
  "safety_topup",
  "initial_stock",
];

export function movementKindLabel(k: InventoryMovementKind): string {
  switch (k) {
    case "buy_for_proc":
      return "Bought (PROC)";
    case "buy_external":
      return "Bought (external)";
    case "consume_proc":
      return "Consumed";
    case "manual_adjust":
      return "Manual adjust";
    case "safety_topup":
      return "Safety top-up";
    case "initial_stock":
      return "Initial import";
  }
}

export type InventoryAllocationStatus = "reserved" | "consumed" | "released";

// CPC is the business identity at RS — every BOM is keyed on it, and the
// BOM parser fills CPC from MPN when a customer doesn't supply one. MPN is
// informational ("what's currently in the bin"); it can rotate as supplier
// alternates change. So `cpc` is required + unique, `mpn` is optional.
export interface InventoryPart {
  id: string;
  // serial_no is the BG feeder-slot identifier on the production floor. It's
  // the slot, not the part — when a part is removed from BG status, this
  // clears and the slot can be reassigned to a different CPC. See the
  // inventory_serial_history table for the assignment audit trail.
  // Rendered immediately before CPC in every table, per the operator's
  // existing BG list layout.
  serial_no: string | null;
  cpc: string;
  mpn: string | null;
  manufacturer: string | null;
  description: string | null;
  pool: InventoryPool;
  min_stock_threshold: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Mirrors the inventory_part_stock view — the UI's primary read shape.
export interface InventoryPartStock extends InventoryPart {
  physical_qty: number;
  reserved_qty: number;
  available_qty: number;
}

// One row of the inventory_serial_history audit log. The "open" assignment
// (currently active) has unassigned_at = null. The flattened *_by_name
// fields come from the joined users rows in the server fetch.
export interface SerialHistoryRow {
  id: string;
  serial_no: string;
  inventory_part_id: string;
  assigned_at: string;
  unassigned_at: string | null;
  notes: string | null;
  assigned_by_name: string | null;
  unassigned_by_name: string | null;
}

export interface InventoryMovement {
  id: string;
  inventory_part_id: string;
  delta: number;
  kind: InventoryMovementKind;
  proc_id: string | null;
  po_id: string | null;
  job_id: string | null;
  qty_before: number;
  qty_after: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface InventoryAllocation {
  id: string;
  inventory_part_id: string;
  procurement_id: string;
  qty_allocated: number;
  status: InventoryAllocationStatus;
  notes: string | null;
  created_at: string;
  consumed_at: string | null;
  released_at: string | null;
  created_by: string | null;
}
