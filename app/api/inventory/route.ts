import { isAdminRole } from "@/lib/auth/roles";
// ----------------------------------------------------------------------------
// app/api/inventory/route.ts
//
// GET  /api/inventory                       â€” list parts (with stock)
//   ?pool=bg|safety
//   ?active=true|false
//   ?search=<cpc|mpn|description fragment>
//
// POST /api/inventory                       â€” create a new part
//   Body: { cpc, mpn?, manufacturer?, description?, pool,
//           min_stock_threshold?, notes?, initial_stock? }
//   CPC is the required business identity; MPN is optional metadata.
//
// Read access: admin only (RLS enforces this too).
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import { recordMovement } from "@/lib/inventory/allocator";
import {
  INVENTORY_POOLS,
  type InventoryPartStock,
  type InventoryPool,
} from "@/lib/inventory/types";

// Helper â€” escape a value used inside a PostgREST `or(...)` `ilike` filter.
// PostgREST splits on commas at the top level, so any commas inside the
// search pattern itself would break the filter. We strip them rather than
// escape, since users searching for a literal comma in a CPC/MPN is exotic
// and a no-op fall-through to a broader match is fine.
function escapeIlikeValue(s: string): string {
  return s.replace(/,/g, " ").replace(/\s+/g, " ").trim();
}

export async function GET(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const pool = sp.get("pool");
  const active = sp.get("active");
  const search = sp.get("search");

  let query = supabase
    .from("inventory_part_stock")
    .select("*")
    .order("cpc");

  if (pool) {
    if (!INVENTORY_POOLS.includes(pool as InventoryPool)) {
      return NextResponse.json(
        { error: `Invalid pool â€” must be one of ${INVENTORY_POOLS.join(", ")}` },
        { status: 400 }
      );
    }
    query = query.eq("pool", pool);
  }
  if (active === "true") query = query.eq("is_active", true);
  if (active === "false") query = query.eq("is_active", false);

  if (search && search.trim()) {
    const term = escapeIlikeValue(search);
    if (term) {
      const pat = `%${term}%`;
      query = query.or(
        `serial_no.ilike.${pat},cpc.ilike.${pat},mpn.ilike.${pat},description.ilike.${pat}`
      );
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error("GET /api/inventory failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ parts: (data ?? []) as InventoryPartStock[] });
}

export async function POST(req: NextRequest) {
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

  const cpc = String(body.cpc ?? "").trim();
  if (!cpc) {
    return NextResponse.json({ error: "cpc is required" }, { status: 400 });
  }

  const pool = body.pool as InventoryPool | undefined;
  if (!pool || !INVENTORY_POOLS.includes(pool)) {
    return NextResponse.json(
      { error: `pool is required and must be one of ${INVENTORY_POOLS.join(", ")}` },
      { status: 400 }
    );
  }

  const manufacturer = body.manufacturer != null ? String(body.manufacturer).trim() || null : null;
  const description = body.description != null ? String(body.description).trim() || null : null;
  const mpn = body.mpn != null ? String(body.mpn).trim() || null : null;
  const notes = body.notes != null ? String(body.notes).trim() || null : null;
  const serial_no =
    body.serial_no != null ? String(body.serial_no).trim() || null : null;

  let min_stock_threshold: number | null = null;
  if (body.min_stock_threshold != null && body.min_stock_threshold !== "") {
    const n = Number(body.min_stock_threshold);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json(
        { error: "min_stock_threshold must be a non-negative integer" },
        { status: 400 }
      );
    }
    min_stock_threshold = n;
  }

  let initial_stock: number | null = null;
  if (body.initial_stock != null && body.initial_stock !== "") {
    const n = Number(body.initial_stock);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json(
        { error: "initial_stock must be a positive integer" },
        { status: 400 }
      );
    }
    initial_stock = n;
  }

  // Friendlier error than waiting on the unique-constraint violation.
  // Surface the existing part's id so the UI can deep-link to it.
  const { data: dup } = await supabase
    .from("inventory_parts")
    .select("id")
    .eq("cpc", cpc)
    .maybeSingle();
  if (dup) {
    return NextResponse.json(
      {
        error: `An inventory part with CPC "${cpc}" already exists.`,
        existing_part_id: dup.id,
      },
      { status: 409 }
    );
  }

  // Same friendlier-error treatment for serial collisions. The partial
  // unique index on inventory_parts.serial_no would catch this anyway, but
  // we want a clean 409 with `existing_part_id` so the UI can offer a
  // deep-link to clear the slot from the conflicting part first.
  if (serial_no) {
    const { data: serialDup } = await supabase
      .from("inventory_parts")
      .select("id, cpc")
      .eq("serial_no", serial_no)
      .maybeSingle();
    if (serialDup) {
      return NextResponse.json(
        {
          error: `Serial "${serial_no}" is already assigned to ${serialDup.cpc}. Clear it from that part first.`,
          existing_part_id: serialDup.id,
        },
        { status: 409 }
      );
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from("inventory_parts")
    .insert({
      cpc,
      mpn,
      manufacturer,
      description,
      pool,
      min_stock_threshold,
      notes,
      serial_no,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    console.error("POST /api/inventory insert failed:", insErr);
    // 23505 = unique_violation. Most likely a race against the serial
    // collision check above; map it to a 409 so the UI gets the same
    // shape as the explicit duplicate path.
    if ((insErr as { code?: string } | null)?.code === "23505") {
      return NextResponse.json(
        {
          error:
            insErr?.message?.includes("serial_no")
              ? `Serial "${serial_no}" is already assigned to another part. Clear it first.`
              : insErr?.message ?? "Duplicate constraint",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: insErr?.message ?? "Failed to create inventory part" },
      { status: 500 }
    );
  }

  // Open a serial_history row so the audit trail is correct from creation.
  // Best-effort â€” if it fails the part still exists; operator can edit
  // the serial later, which will retry the history write.
  if (serial_no) {
    const { error: histErr } = await supabase
      .from("inventory_serial_history")
      .insert({
        serial_no,
        inventory_part_id: inserted.id,
        assigned_by: user.id,
        notes: "Initial assignment on part creation",
      });
    if (histErr) {
      console.error(
        "POST /api/inventory serial history insert failed:",
        histErr,
      );
    }
  }

  // Optionally seed initial stock with a single movement row. We do this
  // after the part exists so recordMovement can compute qty_before from
  // the view (which will be 0).
  if (initial_stock != null) {
    try {
      await recordMovement(supabase, {
        inventory_part_id: inserted.id,
        delta: initial_stock,
        kind: "initial_stock",
        notes: "Initial stock on creation",
        user_id: user.id,
      });
    } catch (e) {
      console.error("Failed to record initial stock movement:", e);
      // Don't roll back the part â€” the operator can record the movement
      // manually from the part detail page if this fails.
      return NextResponse.json(
        {
          error:
            "Part created, but failed to record initial stock. Adjust stock manually from the part page.",
          part_id: inserted.id,
        },
        { status: 207 }
      );
    }
  }

  // Fetch from the view so the response shape matches GET.
  const { data: stockRow, error: viewErr } = await supabase
    .from("inventory_part_stock")
    .select("*")
    .eq("id", inserted.id)
    .single();
  if (viewErr || !stockRow) {
    return NextResponse.json(
      { error: viewErr?.message ?? "Part created but stock view lookup failed" },
      { status: 500 }
    );
  }

  return NextResponse.json(stockRow as InventoryPartStock, { status: 201 });
}
