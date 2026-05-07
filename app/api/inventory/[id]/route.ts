import { isAdminRole } from "@/lib/auth/roles";
// ----------------------------------------------------------------------------
// app/api/inventory/[id]/route.ts
//
// GET    /api/inventory/[id]   â€” single part from inventory_part_stock
// PATCH  /api/inventory/[id]   â€” update editable fields. CPC and MPN are
//                                both editable â€” operators correct typos
//                                without losing movement history (the
//                                ledger is keyed on inventory_part_id, not
//                                CPC). The CPC unique constraint will
//                                still catch collisions.
//                                (NOT stock â€” that's a movement)
// DELETE /api/inventory/[id]   â€” admin only; blocked if any movements or
//                                active allocations reference this part.
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import {
  INVENTORY_POOLS,
  type InventoryPartStock,
  type InventoryPool,
} from "@/lib/inventory/types";

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

  const { data, error } = await supabase
    .from("inventory_part_stock")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("GET /api/inventory/[id] failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Inventory part not found" }, { status: 404 });
  }

  return NextResponse.json(data as InventoryPartStock);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  // CPC and MPN are both editable. Movements and allocations are keyed on
  // inventory_part_id (not CPC/MPN), so renames don't orphan history.

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.manufacturer !== undefined) {
    updates.manufacturer =
      body.manufacturer == null || body.manufacturer === ""
        ? null
        : String(body.manufacturer).trim() || null;
  }
  if (body.description !== undefined) {
    updates.description =
      body.description == null || body.description === ""
        ? null
        : String(body.description).trim() || null;
  }
  if (body.cpc !== undefined) {
    // CPC is required + unique. Don't let it be blanked.
    const trimmed =
      body.cpc == null ? "" : String(body.cpc).trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: "cpc cannot be blank â€” it is the part's business identity." },
        { status: 400 }
      );
    }
    updates.cpc = trimmed;
  }
  if (body.mpn !== undefined) {
    // MPN is optional metadata â€” allow null/empty to clear it.
    updates.mpn =
      body.mpn == null || body.mpn === ""
        ? null
        : String(body.mpn).trim() || null;
  }
  if (body.notes !== undefined) {
    updates.notes =
      body.notes == null || body.notes === "" ? null : String(body.notes).trim() || null;
  }
  if (body.pool !== undefined) {
    if (!INVENTORY_POOLS.includes(body.pool as InventoryPool)) {
      return NextResponse.json(
        { error: `Invalid pool â€” must be one of ${INVENTORY_POOLS.join(", ")}` },
        { status: 400 }
      );
    }
    updates.pool = body.pool;
  }
  if (body.min_stock_threshold !== undefined) {
    if (body.min_stock_threshold == null || body.min_stock_threshold === "") {
      updates.min_stock_threshold = null;
    } else {
      const n = Number(body.min_stock_threshold);
      if (!Number.isInteger(n) || n < 0) {
        return NextResponse.json(
          { error: "min_stock_threshold must be a non-negative integer" },
          { status: 400 }
        );
      }
      updates.min_stock_threshold = n;
    }
  }
  if (body.is_active !== undefined) {
    updates.is_active = !!body.is_active;
  }

  // ---------------------------------------------------------------------------
  // Serial-no reassignment is handled out-of-band from the rest of the field
  // updates because it has to maintain the inventory_serial_history audit
  // trail. The three paths are:
  //
  //   1. Unchanged          â€” no-op on history.
  //   2. Clear (set null)   â€” close the part's currently-open history row.
  //   3. Set new value      â€” collision check vs. other active rows; if
  //                           clean, close any prior open history for THIS
  //                           part, then open a new history row.
  //
  // We don't have transactions in the supabase client, so this is best-effort
  // sequential. The two partial unique indexes on inventory_serial_history
  // (one open per serial, one open per part) will catch any race that lands
  // between our reads and writes â€” they raise 23505, which we map to 409.
  // ---------------------------------------------------------------------------
  let serialChange:
    | { kind: "unchanged" }
    | { kind: "clear" }
    | { kind: "set"; value: string }
    | null = null;
  let currentSerial: string | null = null;
  if (body.serial_no !== undefined) {
    const incoming =
      body.serial_no == null
        ? null
        : String(body.serial_no).trim() === ""
          ? null
          : String(body.serial_no).trim();

    // Need the current value so we can decide what history rows to write.
    const { data: existing, error: existErr } = await supabase
      .from("inventory_parts")
      .select("serial_no")
      .eq("id", id)
      .maybeSingle();
    if (existErr || !existing) {
      return NextResponse.json(
        { error: existErr?.message ?? "Part not found" },
        { status: 404 }
      );
    }
    currentSerial = (existing.serial_no as string | null) ?? null;

    if (currentSerial === incoming) {
      serialChange = { kind: "unchanged" };
    } else if (incoming == null) {
      serialChange = { kind: "clear" };
    } else {
      // Collision check against another active row. Note: a row that
      // has currentSerial=incoming would be us â€” but we already know the
      // values differ at this point, so any hit is genuinely a different
      // part. We surface its id so the UI can deep-link to clear it.
      const { data: holder } = await supabase
        .from("inventory_parts")
        .select("id, cpc")
        .eq("serial_no", incoming)
        .neq("id", id)
        .maybeSingle();
      if (holder) {
        return NextResponse.json(
          {
            error: `Serial "${incoming}" is already assigned to ${holder.cpc}. Clear it from that part first.`,
            existing_part_id: holder.id,
          },
          { status: 409 }
        );
      }
      serialChange = { kind: "set", value: incoming };
    }

    // Stage the column update; the history writes happen below after the
    // main UPDATE succeeds.
    if (serialChange.kind === "clear") {
      updates.serial_no = null;
    } else if (serialChange.kind === "set") {
      updates.serial_no = serialChange.value;
    }
    // "unchanged" â€” leave updates.serial_no out entirely.
  }

  const { error } = await supabase.from("inventory_parts").update(updates).eq("id", id);
  if (error) {
    console.error("PATCH /api/inventory/[id] failed:", error);
    // 23505 = unique_violation. Could be the cpc unique index OR the
    // serial_no partial unique index. Disambiguate by message text.
    if ((error as { code?: string }).code === "23505") {
      const msg = error.message ?? "";
      if (msg.includes("serial_no")) {
        return NextResponse.json(
          {
            error:
              "Another inventory part already holds that serial. Clear it from that part first.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Another inventory part already uses that CPC." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // History writes happen AFTER the column update succeeds. If they fail we
  // log loudly but don't roll back the column â€” the partial unique indexes
  // on the history table prevent inconsistency (you can't end up with two
  // open rows for the same serial or the same part), and the operator can
  // re-edit to retry.
  if (serialChange && serialChange.kind !== "unchanged") {
    // Always close the part's currently-open history row, if any. Both the
    // "clear" and "set" paths need this: clear has nothing to open, set
    // opens a fresh row right after.
    if (currentSerial) {
      const { error: closeErr } = await supabase
        .from("inventory_serial_history")
        .update({
          unassigned_at: new Date().toISOString(),
          unassigned_by: user.id,
        })
        .eq("inventory_part_id", id)
        .is("unassigned_at", null);
      if (closeErr) {
        console.error(
          "PATCH /api/inventory/[id] failed to close serial history row:",
          closeErr,
        );
      }
    }

    if (serialChange.kind === "set") {
      const { error: openErr } = await supabase
        .from("inventory_serial_history")
        .insert({
          serial_no: serialChange.value,
          inventory_part_id: id,
          assigned_by: user.id,
        });
      if (openErr) {
        console.error(
          "PATCH /api/inventory/[id] failed to open serial history row:",
          openErr,
        );
        // The serial_no column update already succeeded, so the partial
        // unique on inventory_parts.serial_no holds. The audit trail will
        // have a missing "open" row; operator can re-edit to retry.
      }
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json(
      { error: "Only an admin can delete inventory parts." },
      { status: 403 }
    );
  }

  // Block delete if any movement references this part â€” the ledger is
  // append-only and we do not want to lose history. The FK has
  // ON DELETE RESTRICT anyway; we check first to return a friendlier
  // error than the raw constraint violation.
  const { count: movementCount, error: movErr } = await supabase
    .from("inventory_movements")
    .select("id", { count: "exact", head: true })
    .eq("inventory_part_id", id);
  if (movErr) {
    console.error("DELETE /api/inventory/[id] movement count failed:", movErr);
    return NextResponse.json({ error: movErr.message }, { status: 500 });
  }
  if ((movementCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete â€” ${movementCount} movement(s) reference this part. Deactivate it instead (set is_active=false).`,
      },
      { status: 409 }
    );
  }

  // Block delete if any active (reserved) allocation exists. Consumed/
  // released allocations are historical and would be cascaded by the FK,
  // but we'd rather block on those too if movements exist (handled above).
  const { count: allocCount, error: allocErr } = await supabase
    .from("inventory_allocations")
    .select("id", { count: "exact", head: true })
    .eq("inventory_part_id", id)
    .eq("status", "reserved");
  if (allocErr) {
    console.error("DELETE /api/inventory/[id] allocation count failed:", allocErr);
    return NextResponse.json({ error: allocErr.message }, { status: 500 });
  }
  if ((allocCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete â€” ${allocCount} active allocation(s) reference this part. Release them first.`,
      },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("inventory_parts").delete().eq("id", id);
  if (error) {
    console.error("DELETE /api/inventory/[id] failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, deleted: id });
}
