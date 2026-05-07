import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
// ---------------------------------------------------------------------------
// PATCH /api/quotes/[id]/wizard â€” generic step-by-step saver for the wizard.
//
// Body allows any of the known wizard fields. Unknown fields are dropped.
// Validation is permissive â€” the client only sends what the user just edited.
//
//   { tier_quantities: [50, 100, 500] }      â€” Step 1
//   { procurement_mode: 'turnkey' }          â€” Step 1
//   { wizard_status: 'quantities_done' }     â€” Step 1 â†’ Step 2 transition
//   { boards_per_panel: 4 }                  â€” Step 3
//   { ipc_class: 2 }                         â€” Step 3
//   { solder_type: 'leaded' }                â€” Step 3
//   { board_side: 'single' | 'double' }      â€” Step 3 (writes onto gmps.board_side)
//   { pinned_preference: '<uuid>' }          â€” Step 2 auto-pick
//   { tier_pcb_prices: [{ qty, pcb_unit_price }] }  â€” Step 3 (writes into quantities JSONB)
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROCUREMENT_MODES = new Set([
  "turnkey",
  "consignment",
  "assembly_only",
]);

const WIZARD_STATUSES = new Set([
  "draft",
  "quantities_done",
  "pricing_done",
  "complete",
]);

const BOARD_SIDES = new Set(["single", "double"]);
const SOLDER_TYPES = new Set(["leaded", "leadfree", "lead-free", "lead_free"]);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid quote id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  // Build the update payload from validated fields only.
  const update: Record<string, unknown> = {};

  if ("procurement_mode" in body) {
    const v = body.procurement_mode;
    if (v === null) {
      update.procurement_mode = null;
    } else if (typeof v === "string" && PROCUREMENT_MODES.has(v)) {
      update.procurement_mode = v;
    } else {
      return NextResponse.json(
        { error: `procurement_mode must be one of ${[...PROCUREMENT_MODES].join(", ")}` },
        { status: 400 }
      );
    }
  }

  if ("wizard_status" in body) {
    const v = body.wizard_status;
    if (typeof v === "string" && WIZARD_STATUSES.has(v)) {
      update.wizard_status = v;
    } else {
      return NextResponse.json({ error: "Invalid wizard_status" }, { status: 400 });
    }
  }

  // board_side is stored on `gmps`, not on `quotes`. We collect it here and
  // apply it to the linked GMP after the quote update succeeds (or before,
  // if the quote update is a no-op for everything else).
  let pendingGmpBoardSide: "single" | "double" | null | "INVALID" | undefined = undefined;
  if ("board_side" in body) {
    const v = body.board_side;
    if (v === null) {
      pendingGmpBoardSide = null;
    } else if (typeof v === "string" && BOARD_SIDES.has(v)) {
      pendingGmpBoardSide = v as "single" | "double";
    } else {
      return NextResponse.json({ error: "Invalid board_side (expected 'single' or 'double')" }, { status: 400 });
    }
  }

  if ("boards_per_panel" in body) {
    const v = Number(body.boards_per_panel);
    if (!Number.isInteger(v) || v <= 0) {
      return NextResponse.json({ error: "boards_per_panel must be a positive integer" }, { status: 400 });
    }
    update.boards_per_panel = v;
  }

  if ("ipc_class" in body) {
    const v = Number(body.ipc_class);
    if (![1, 2, 3].includes(v)) {
      return NextResponse.json({ error: "ipc_class must be 1, 2, or 3" }, { status: 400 });
    }
    update.ipc_class = v;
  }

  if ("solder_type" in body) {
    const v = typeof body.solder_type === "string" ? body.solder_type.toLowerCase() : "";
    if (!SOLDER_TYPES.has(v)) {
      return NextResponse.json({ error: "solder_type must be 'leaded' or 'leadfree'" }, { status: 400 });
    }
    // Normalize the variants to a single canonical value.
    update.solder_type = v === "leaded" ? "leaded" : "leadfree";
  }

  if ("pinned_preference" in body) {
    const v = body.pinned_preference;
    if (v === null) {
      update.pinned_preference = null;
    } else if (typeof v === "string" && UUID_RE.test(v)) {
      update.pinned_preference = v;
    } else {
      return NextResponse.json({ error: "pinned_preference must be a UUID or null" }, { status: 400 });
    }
  }

  // tier_quantities â€” stored inside `quantities` JSONB so we don't have to
  // change the DB schema for something this flexible.
  if ("tier_quantities" in body) {
    const raw = body.tier_quantities;
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json({ error: "tier_quantities must be a non-empty array" }, { status: 400 });
    }
    const parsed: number[] = [];
    for (const n of raw) {
      const v = Number(n);
      if (!Number.isInteger(v) || v <= 0) {
        return NextResponse.json({ error: "tier_quantities must be positive integers" }, { status: 400 });
      }
      parsed.push(v);
    }
    const unique = [...new Set(parsed)].sort((a, b) => a - b);
    update.quantities = { tiers: unique };
  }

  if (Object.keys(update).length === 0 && pendingGmpBoardSide === undefined) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  // Apply quotes update (if anything to update) and capture gmp_id either
  // way so we can mirror board_side onto the GMP.
  let quoteRow: Record<string, unknown> | null = null;
  if (Object.keys(update).length > 0) {
    const { data, error } = await supabase
      .from("quotes")
      .update(update)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Failed to update quote", details: error.message },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }
    quoteRow = data;
  }

  if (pendingGmpBoardSide !== undefined) {
    const { data: q } = quoteRow
      ? { data: quoteRow as { gmp_id?: string } }
      : await supabase.from("quotes").select("gmp_id").eq("id", id).maybeSingle();
    const gmpId = (q as { gmp_id?: string } | null)?.gmp_id;
    if (gmpId) {
      await supabase
        .from("gmps")
        .update({ board_side: pendingGmpBoardSide })
        .eq("id", gmpId);
    }
  }

  return NextResponse.json({ ok: true, quote: quoteRow });
}
