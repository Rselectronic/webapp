import { isAdminRole } from "@/lib/auth/roles";
// ----------------------------------------------------------------------------
// app/api/inventory/[id]/movements/route.ts
//
// GET  /api/inventory/[id]/movements        â€” paginated movement history
//   ?limit=50  ?offset=0
//
// POST /api/inventory/[id]/movements        â€” record a manual movement
//   Body: { kind, delta, notes? }
//   Allowed kinds via this route: buy_external, manual_adjust,
//                                 safety_topup, initial_stock.
//   Disallowed: buy_for_proc, consume_proc â€” those happen via the
//   PROC integration (a supplier PO landing for a PROC shortfall, or
//   consumeAllocation when a production_event fires).
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import { recordMovement } from "@/lib/inventory/allocator";
import {
  INVENTORY_MOVEMENT_KINDS,
  type InventoryMovementKind,
} from "@/lib/inventory/types";

const MANUAL_ALLOWED: InventoryMovementKind[] = [
  "buy_external",
  "manual_adjust",
  "safety_topup",
  "initial_stock",
];

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

  const sp = req.nextUrl.searchParams;
  const limitRaw = Number(sp.get("limit") ?? 50);
  const offsetRaw = Number(sp.get("offset") ?? 0);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), 200) : 50;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0;

  // Confirm the part exists so a 404 doesn't get masked as an empty list.
  const { data: part, error: partErr } = await supabase
    .from("inventory_parts")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (partErr) {
    console.error("GET inventory movements â€” part lookup failed:", partErr);
    return NextResponse.json({ error: partErr.message }, { status: 500 });
  }
  if (!part) {
    return NextResponse.json({ error: "Inventory part not found" }, { status: 404 });
  }

  // PostgREST embed: use the FK constraint name to disambiguate. The
  // `name:column (...)` colon syntax PostgREST treats as an alias rename,
  // not as an FK hint, so the previous version silently returned no
  // joined rows. Hint with the actual FK name (`<table>_<col>_fkey`)
  // instead â€” that always wins.
  const { data, error, count } = await supabase
    .from("inventory_movements")
    .select(
      `id, inventory_part_id, delta, kind, proc_id, po_id, job_id,
       qty_before, qty_after, notes, created_by, created_at,
       procurements!inventory_movements_proc_id_fkey (id, proc_code),
       supplier_pos!inventory_movements_po_id_fkey (id, po_number),
       jobs!inventory_movements_job_id_fkey (id, job_number),
       users!inventory_movements_created_by_fkey (id, full_name)`,
      { count: "exact" }
    )
    .eq("inventory_part_id", id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("GET inventory movements failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten the joined `users` so the client can read `created_by_name`
  // directly without unwrapping. The render path also tolerates the
  // nested shape, but a flat string is the simplest contract.
  const flattened = (data ?? []).map((row) => {
    const r = row as typeof row & {
      users?: { full_name?: string | null } | { full_name?: string | null }[] | null;
    };
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return { ...r, created_by_name: u?.full_name ?? null };
  });

  return NextResponse.json({
    movements: flattened,
    total: count ?? 0,
    limit,
    offset,
  });
}

export async function POST(
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

  const kind = body.kind as InventoryMovementKind | undefined;
  if (!kind || !INVENTORY_MOVEMENT_KINDS.includes(kind)) {
    return NextResponse.json(
      { error: `kind is required and must be one of ${INVENTORY_MOVEMENT_KINDS.join(", ")}` },
      { status: 400 }
    );
  }
  if (!MANUAL_ALLOWED.includes(kind)) {
    return NextResponse.json(
      {
        error: `kind "${kind}" is reserved for the PROC integration and cannot be recorded manually here. Allowed: ${MANUAL_ALLOWED.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const deltaRaw = body.delta;
  const delta = Number(deltaRaw);
  if (!Number.isInteger(delta) || delta === 0) {
    return NextResponse.json(
      { error: "delta must be a non-zero integer" },
      { status: 400 }
    );
  }

  const notes = body.notes != null && body.notes !== "" ? String(body.notes).trim() || null : null;

  // Confirm the part exists (recordMovement throws otherwise, but we want a
  // proper 404).
  const { data: part, error: partErr } = await supabase
    .from("inventory_parts")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (partErr) {
    console.error("POST inventory movement â€” part lookup failed:", partErr);
    return NextResponse.json({ error: partErr.message }, { status: 500 });
  }
  if (!part) {
    return NextResponse.json({ error: "Inventory part not found" }, { status: 404 });
  }

  try {
    const movement = await recordMovement(supabase, {
      inventory_part_id: id,
      delta,
      kind,
      notes,
      user_id: user.id,
    });
    return NextResponse.json(movement, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to record movement";
    console.error("POST inventory movement failed:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
