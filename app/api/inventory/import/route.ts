import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import {
  INVENTORY_POOLS,
  type InventoryPool,
} from "@/lib/inventory/types";

// =============================================================================
// POST /api/inventory/import â€” bulk import inventory parts (BG / Safety stock).
//
// Mirrors /api/suppliers/import semantics. Each row creates (or upserts) one
// inventory_parts row by CPC (the business identity at RS â€” operators wrote
// these CPCs themselves on the BG list, so they're authoritative). MPN is
// optional metadata. If the row carries a positive Stock value, we also
// write a kind='initial_stock' inventory_movement so the on-hand qty matches
// what the operator's Excel said.
//
// Operator's BG Excel column shape (alias-tolerant â€” see the dialog):
//   CPC | Serial No. | Description | MPN | Manufacturer | BG or SS? | Stock
// Serial No. maps to the BG feeder-slot identifier (inventory_parts.serial_no)
// and is recorded in inventory_serial_history for the audit trail.
//
// NOTE â€” CPC is required per row. We do NOT auto-fill CPC from MPN here.
// That copying convention is a BOM-import behaviour for customer BOMs that
// don't supply a CPC; the operator's own BG/SS list is expected to have
// CPCs because they wrote it.
//
// IMPORTANT â€” Upsert behaviour for stock reconciliation:
//   In upsert mode we never touch existing movements. If the imported Stock
//   differs from the part's current physical_qty, we write a single
//   kind='manual_adjust' movement with the delta (note: "Reconciled from
//   import"). This brings the ledger into alignment without rewriting
//   history.
// =============================================================================

interface ImportRow {
  cpc?: unknown;
  serial_no?: unknown;
  description?: unknown;
  mpn?: unknown;
  manufacturer?: unknown;
  pool?: unknown;
  stock?: unknown;
  min_stock_threshold?: unknown;
  notes?: unknown;
}

interface RowResult {
  row: number; // 1-based row index for user-facing reporting
  cpc: string;
  serial_no: string;
  mpn: string;
  status: "created" | "updated" | "skipped" | "error";
  message?: string;
  inventory_part_id?: string;
}

// "import" â†’ insert-only, skip rows whose CPC already exists.
// "upsert" â†’ insert new CPCs; for existing CPCs, update fields and (if Stock
// changed) write a manual_adjust movement to reconcile physical_qty.
type ImportMode = "import" | "upsert";

function asStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function asInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const s = String(v).trim().replace(/,/g, "");
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

// Normalise the operator's "BG or SS?" column into our enum.
function normalisePool(v: unknown): InventoryPool | null {
  const s = asStr(v).toLowerCase();
  if (!s) return null;
  if (s === "bg") return "bg";
  if (s === "ss" || s === "safety" || s === "safety_stock" || s === "safety stock") {
    return "safety";
  }
  // Some operators may write the full word.
  if (INVENTORY_POOLS.includes(s as InventoryPool)) return s as InventoryPool;
  return null;
}

export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json(
      { error: "Only an admin can import inventory parts." },
      { status: 403 }
    );
  }

  let body: { rows?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? (body.rows as ImportRow[]) : null;
  if (!rows || rows.length === 0) {
    return NextResponse.json(
      { error: "Body must include a non-empty `rows` array" },
      { status: 400 }
    );
  }
  if (rows.length > 1000) {
    return NextResponse.json(
      { error: "Imports are capped at 1000 rows per request" },
      { status: 400 }
    );
  }

  const mode: ImportMode = body.mode === "upsert" ? "upsert" : "import";

  // Pre-fetch every existing part (id + cpc + serial_no) so we can detect
  // duplicates and look up ids for the upsert path without per-row
  // roundtrips. For upsert we also need physical_qty, so pull it from the
  // stock view.
  const { data: existing } = await supabase
    .from("inventory_part_stock")
    .select("id, cpc, serial_no, physical_qty");
  const existingByCpc = new Map<
    string,
    { id: string; serial_no: string | null; physical_qty: number }
  >(); // CPC(upper) -> { id, serial_no, physical_qty }
  // Reverse lookup: which part currently holds a given serial. Used to
  // detect "this serial is already on a different part" for both insert
  // and upsert paths.
  const partIdBySerial = new Map<string, string>(); // serial -> part id
  for (const r of existing ?? []) {
    if (r.cpc) {
      const serial = (r.serial_no as string | null) ?? null;
      existingByCpc.set(String(r.cpc).toUpperCase(), {
        id: r.id as string,
        serial_no: serial,
        physical_qty: Number(r.physical_qty ?? 0),
      });
      if (serial) partIdBySerial.set(serial, r.id as string);
    }
  }
  const seenInBatch = new Set<string>();
  // Track serials assigned earlier in the same batch so two import rows
  // can't both claim the same slot.
  const serialsAssignedInBatch = new Map<string, string>(); // serial -> CPC

  const results: RowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1;
    const cpc = asStr(r.cpc);
    const mpn = asStr(r.mpn);
    const serialRaw = asStr(r.serial_no);
    const serialOrNull = serialRaw === "" ? null : serialRaw;
    const cpcUpper = cpc.toUpperCase();

    // --- Validation ---------------------------------------------------------
    if (!cpc) {
      // Note â€” we deliberately do NOT auto-fill CPC from MPN here. The BG
      // list is operator-authored, so a missing CPC is a real error worth
      // flagging.
      results.push({
        row: rowNum,
        cpc: "",
        serial_no: serialRaw,
        mpn,
        status: "error",
        message: "Missing CPC",
      });
      continue;
    }
    const pool = normalisePool(r.pool);
    if (!pool) {
      results.push({
        row: rowNum,
        cpc,
        serial_no: serialRaw,
        mpn,
        status: "error",
        message: `Invalid or missing pool. Use "BG" or "SS" (got "${asStr(r.pool)}")`,
      });
      continue;
    }
    if (seenInBatch.has(cpcUpper)) {
      results.push({
        row: rowNum,
        cpc,
        serial_no: serialRaw,
        mpn,
        status: "skipped",
        message: "Duplicate CPC earlier in this import",
      });
      continue;
    }
    seenInBatch.add(cpcUpper);

    const existingRec = existingByCpc.get(cpcUpper);
    if (existingRec && mode === "import") {
      results.push({
        row: rowNum,
        cpc,
        serial_no: serialRaw,
        mpn,
        status: "skipped",
        message: "CPC already exists in inventory",
      });
      continue;
    }

    // --- Build the part payload --------------------------------------------
    const stockRaw = asInt(r.stock);
    const minThreshold = asInt(r.min_stock_threshold);
    const description = asStr(r.description) || null;
    const manufacturer = asStr(r.manufacturer) || null;
    const mpnOrNull = mpn || null;
    const notes = asStr(r.notes) || null;

    if (stockRaw != null && stockRaw < 0) {
      results.push({
        row: rowNum,
        cpc,
        serial_no: serialRaw,
        mpn,
        status: "error",
        message: "Stock cannot be negative",
      });
      continue;
    }

    // ----- Serial-no validation -------------------------------------------
    // Detect collisions BEFORE attempting any DB write so we can return
    // a clean per-row error and the operator can fix the file. Three
    // cases to check (serial only matters when the imported value is set):
    //   A) Earlier row in this batch already claimed the same serial.
    //   B) An existing OTHER part already holds the imported serial.
    //   C) For upsert mode: the imported serial differs from THIS part's
    //      current serial AND another active part holds it.
    let serialConflictMessage: string | null = null;
    if (serialOrNull) {
      const earlierClaimer = serialsAssignedInBatch.get(serialOrNull);
      if (earlierClaimer && earlierClaimer !== cpc) {
        serialConflictMessage = `Serial "${serialOrNull}" was already claimed earlier in this import (CPC ${earlierClaimer}).`;
      } else {
        const holderId = partIdBySerial.get(serialOrNull);
        const myId = existingRec?.id ?? null;
        if (holderId && holderId !== myId) {
          serialConflictMessage = `Serial "${serialOrNull}" is already assigned to a different part. Clear it from that part first.`;
        }
      }
    }
    if (serialConflictMessage) {
      results.push({
        row: rowNum,
        cpc,
        serial_no: serialRaw,
        mpn,
        status: "error",
        message: serialConflictMessage,
      });
      continue;
    }

    const corePayload = {
      cpc,
      mpn: mpnOrNull,
      manufacturer,
      description,
      pool,
      min_stock_threshold: minThreshold,
      notes,
      serial_no: serialOrNull,
    };

    let partId: string | null = null;
    let actionTaken: "created" | "updated" = "created";
    let movementWarning: string | null = null;

    if (!existingRec) {
      // ---- INSERT (new CPC) ------------------------------------------------
      const { data: inserted, error: insErr } = await supabase
        .from("inventory_parts")
        .insert({ ...corePayload, created_by: user.id })
        .select("id, cpc")
        .single();
      if (insErr || !inserted) {
        // 23505 from the serial_no partial unique catches a race that
        // slipped past our pre-check (e.g. another import running). Treat
        // it as a row-level error.
        results.push({
          row: rowNum,
          cpc,
          serial_no: serialRaw,
          mpn,
          status: "error",
          message: insErr?.message ?? "Insert failed",
        });
        continue;
      }
      partId = inserted.id as string;
      existingByCpc.set(cpcUpper, {
        id: partId,
        serial_no: serialOrNull,
        physical_qty: 0,
      });
      if (serialOrNull) {
        partIdBySerial.set(serialOrNull, partId);
        serialsAssignedInBatch.set(serialOrNull, cpc);

        // Open the audit-trail row for this fresh assignment.
        const { error: histErr } = await supabase
          .from("inventory_serial_history")
          .insert({
            serial_no: serialOrNull,
            inventory_part_id: partId,
            assigned_by: user.id,
            notes: "Imported from BG/SS Excel",
          });
        if (histErr) {
          movementWarning = `part created, but serial history insert failed: ${histErr.message}`;
        }
      }

      // Initial stock movement â€” only if Stock > 0. qty_before=0,
      // qty_after=stock since the part is brand new.
      if (stockRaw != null && stockRaw > 0) {
        const { error: movErr } = await supabase
          .from("inventory_movements")
          .insert({
            inventory_part_id: partId,
            delta: stockRaw,
            kind: "initial_stock",
            qty_before: 0,
            qty_after: stockRaw,
            notes: "Imported from BG/SS Excel",
            created_by: user.id,
          });
        if (movErr) {
          movementWarning = movementWarning
            ? `${movementWarning}; initial_stock movement failed: ${movErr.message}`
            : `part created, but initial_stock movement failed: ${movErr.message}`;
        }
      }
    } else {
      // ---- UPDATE (existing CPC, upsert mode) ------------------------------
      // We matched on CPC, so don't change it. Bump updated_at so listings
      // re-sort. Existing movements/allocations are NOT touched.
      const { error: updErr } = await supabase
        .from("inventory_parts")
        .update({ ...corePayload, updated_at: new Date().toISOString() })
        .eq("id", existingRec.id);
      if (updErr) {
        results.push({
          row: rowNum,
          cpc,
          serial_no: serialRaw,
          mpn,
          status: "error",
          message: updErr.message,
        });
        continue;
      }
      partId = existingRec.id;
      actionTaken = "updated";

      // ----- Serial reassignment audit trail ----------------------------
      // Three cases mirroring the PATCH route:
      //   - unchanged: no history writes
      //   - cleared: close the part's open history row
      //   - changed (or first-time set): close any existing open row for
      //     THIS part, then open a new one with the new serial
      const prevSerial = existingRec.serial_no;
      if (prevSerial !== serialOrNull) {
        if (prevSerial) {
          const { error: closeErr } = await supabase
            .from("inventory_serial_history")
            .update({
              unassigned_at: new Date().toISOString(),
              unassigned_by: user.id,
            })
            .eq("inventory_part_id", partId)
            .is("unassigned_at", null);
          if (closeErr) {
            movementWarning = `serial history close failed: ${closeErr.message}`;
          }
          // Free the slot in our local lookup so a later row in the same
          // import can claim it cleanly.
          partIdBySerial.delete(prevSerial);
        }
        if (serialOrNull) {
          const { error: openErr } = await supabase
            .from("inventory_serial_history")
            .insert({
              serial_no: serialOrNull,
              inventory_part_id: partId,
              assigned_by: user.id,
              notes: "Imported from BG/SS Excel",
            });
          if (openErr) {
            movementWarning = movementWarning
              ? `${movementWarning}; serial history open failed: ${openErr.message}`
              : `serial history open failed: ${openErr.message}`;
          } else {
            partIdBySerial.set(serialOrNull, partId);
            serialsAssignedInBatch.set(serialOrNull, cpc);
          }
        }
        // Keep our cached snapshot in sync for downstream rows.
        existingRec.serial_no = serialOrNull;
      } else if (serialOrNull) {
        // Unchanged â€” but still mark the slot as touched in this batch so
        // a later row that tries to claim the same slot is flagged.
        serialsAssignedInBatch.set(serialOrNull, cpc);
      }

      // If Stock was provided and differs from current physical_qty, write a
      // single manual_adjust movement to reconcile.
      if (stockRaw != null && stockRaw !== existingRec.physical_qty) {
        const delta = stockRaw - existingRec.physical_qty;
        if (delta !== 0) {
          const { error: movErr } = await supabase
            .from("inventory_movements")
            .insert({
              inventory_part_id: partId,
              delta,
              kind: "manual_adjust",
              qty_before: existingRec.physical_qty,
              qty_after: stockRaw,
              notes: "Reconciled from import",
              created_by: user.id,
            });
          if (movErr) {
            movementWarning = movementWarning
              ? `${movementWarning}; reconcile movement failed: ${movErr.message}`
              : `part updated, but reconcile movement failed: ${movErr.message}`;
          } else {
            const reconcileMsg = `reconciled physical_qty ${existingRec.physical_qty} â†’ ${stockRaw}`;
            movementWarning = movementWarning
              ? `${movementWarning}; ${reconcileMsg}`
              : reconcileMsg;
          }
        }
      }
    }

    results.push({
      row: rowNum,
      cpc,
      serial_no: serialRaw,
      mpn,
      status: actionTaken,
      inventory_part_id: partId ?? undefined,
      message: movementWarning ?? undefined,
    });
  }

  const createdCount = results.filter((r) => r.status === "created").length;
  const updatedCount = results.filter((r) => r.status === "updated").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  return NextResponse.json({
    mode,
    summary: {
      total: rows.length,
      created: createdCount,
      updated: updatedCount,
      skipped: skippedCount,
      errors: errorCount,
    },
    results,
  });
}
