import { isAdminRole } from "@/lib/auth/roles";
// ----------------------------------------------------------------------------
// app/api/proc/[id]/selections/buy-qty/route.ts
//
// PATCH /api/proc/[id]/selections/buy-qty
//   Body: { cpc: string, mpn?: string | null, manual_buy_qty: number | null }
//
// Persists the operator's "Buy Qty" override on the merged BOM. NULL clears
// the override and falls back to the computed default (BG shortfall for
// BG-short rows, total_with_extras otherwise).
//
// The unique constraint on procurement_line_selections is (procurement_id,
// mpn). This route looks up an existing row by CPC first (the row identity
// in the UI), falling back to MPN. If neither matches it errors â€” buy-qty
// override is only valid on a row where a distributor has already been
// picked, because the row needs a non-null chosen_supplier.
//
// Auth: admin only.
// ----------------------------------------------------------------------------

import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";

interface PatchBody {
  cpc: string;
  mpn?: string | null;
  manual_buy_qty: number | null;
}

async function requireRole(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !isAdminRole(profile.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const auth = await requireRole(supabase);
  if ("error" in auth) return auth.error;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const cpc = (body?.cpc ?? "").trim();
  if (!cpc) {
    return NextResponse.json({ error: "cpc required" }, { status: 400 });
  }

  // manual_buy_qty: null = clear, otherwise non-negative integer.
  let manual_buy_qty: number | null;
  if (body.manual_buy_qty === null || body.manual_buy_qty === undefined) {
    manual_buy_qty = null;
  } else {
    const n = Number(body.manual_buy_qty);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      return NextResponse.json(
        { error: "manual_buy_qty must be a non-negative integer or null" },
        { status: 400 }
      );
    }
    manual_buy_qty = n;
  }

  // Look up an existing selection row. CPC lookup wins (row identity in the
  // UI); MPN is the fallback for legacy rows that pre-date the CPC backfill.
  let existing: { id: string; mpn: string; cpc: string | null } | null = null;
  {
    const { data, error } = await supabase
      .from("procurement_line_selections")
      .select("id, mpn, cpc")
      .eq("procurement_id", id)
      .eq("cpc", cpc)
      .limit(1)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    existing = data ?? null;
  }
  if (!existing && body.mpn) {
    const { data, error } = await supabase
      .from("procurement_line_selections")
      .select("id, mpn, cpc")
      .eq("procurement_id", id)
      .eq("mpn", body.mpn)
      .limit(1)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    existing = data ?? null;
  }

  if (!existing) {
    return NextResponse.json(
      {
        error:
          "Pick a distributor first â€” buy-qty override needs an existing selection row.",
      },
      { status: 400 }
    );
  }

  const updateRow: Record<string, unknown> = { manual_buy_qty };
  // Backfill cpc on legacy rows so future lookups by CPC succeed.
  if (!existing.cpc) updateRow.cpc = cpc;

  const { error: updErr } = await supabase
    .from("procurement_line_selections")
    .update(updateRow)
    .eq("id", existing.id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, manual_buy_qty });
}
