import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";

// PATCH/DELETE /api/proc/[id]/selections
// Save or clear the operator's distributor pick for a single MPN within a
// PROC. Rows live in procurement_line_selections (migration 064).

type OrderStatus = "not_ordered" | "ordered" | "shipped" | "received" | "cancelled";

const ORDER_STATUSES: readonly OrderStatus[] = [
  "not_ordered",
  "ordered",
  "shipped",
  "received",
  "cancelled",
] as const;

interface PatchBody {
  mpn: string;
  cpc?: string | null;
  chosen_supplier: string;
  chosen_supplier_pn?: string | null;
  chosen_unit_price_cad?: number | null;
  chosen_effective_qty?: number | null;
  order_status?: OrderStatus | null;
  order_external_id?: string | null;
  ordered_at?: string | null;
  manual_unit_price_cad?: number | null;
  manual_price_note?: string | null;
  manual_buy_qty?: number | null;
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

  const body = (await req.json()) as PatchBody;
  if (!body?.mpn || !body?.chosen_supplier) {
    return NextResponse.json({ error: "mpn and chosen_supplier required" }, { status: 400 });
  }

  // Whitelist order-tracking fields
  let orderStatus: OrderStatus | undefined;
  if (body.order_status != null) {
    if (!ORDER_STATUSES.includes(body.order_status)) {
      return NextResponse.json({ error: "invalid order_status" }, { status: 400 });
    }
    if (!body.chosen_supplier || !body.chosen_supplier.trim()) {
      return NextResponse.json(
        { error: "pick a distributor before setting order status" },
        { status: 400 }
      );
    }
    orderStatus = body.order_status;
  }

  const row: Record<string, unknown> = {
    procurement_id: id,
    mpn: body.mpn,
    chosen_supplier: body.chosen_supplier,
    chosen_supplier_pn: body.chosen_supplier_pn ?? null,
    chosen_unit_price_cad: body.chosen_unit_price_cad ?? null,
    chosen_effective_qty: body.chosen_effective_qty ?? null,
    chose_at: new Date().toISOString(),
    chosen_by: auth.user.id,
  };
  if (orderStatus !== undefined) row.order_status = orderStatus;
  if (body.order_external_id !== undefined) row.order_external_id = body.order_external_id;
  if (body.ordered_at !== undefined) row.ordered_at = body.ordered_at;
  if (body.manual_unit_price_cad !== undefined) {
    if (body.manual_unit_price_cad === null) {
      row.manual_unit_price_cad = null;
    } else if (
      typeof body.manual_unit_price_cad !== "number" ||
      !Number.isFinite(body.manual_unit_price_cad)
    ) {
      return NextResponse.json(
        { error: "manual_unit_price_cad must be a finite number or null" },
        { status: 400 }
      );
    } else {
      row.manual_unit_price_cad = body.manual_unit_price_cad;
    }
  }
  if (body.manual_price_note !== undefined) {
    row.manual_price_note = body.manual_price_note ?? null;
  }
  if (body.manual_buy_qty !== undefined) {
    if (body.manual_buy_qty === null) {
      row.manual_buy_qty = null;
    } else {
      const n = Number(body.manual_buy_qty);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
        return NextResponse.json(
          { error: "manual_buy_qty must be a non-negative integer or null" },
          { status: 400 }
        );
      }
      row.manual_buy_qty = n;
    }
  }
  if (body.cpc !== undefined) {
    row.cpc = body.cpc ?? null;
  }

  const { error } = await supabase
    .from("procurement_line_selections")
    .upsert(row, { onConflict: "procurement_id,mpn" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const auth = await requireRole(supabase);
  if ("error" in auth) return auth.error;

  // Match-key priority: explicit row id > cpc > mpn (backward compat).
  // Prior contract identified the row by (procurement_id, mpn). MPN is unstable
  // (can rotate between selection and delete), so accept a row id or cpc when
  // the caller can supply one. Old callers passing only `mpn` still work.
  const body = (await req.json()) as {
    id?: string;
    cpc?: string;
    mpn?: string;
  };

  if (!body?.id && !body?.cpc && !body?.mpn) {
    return NextResponse.json(
      { error: "id, cpc, or mpn required" },
      { status: 400 }
    );
  }

  let q = supabase
    .from("procurement_line_selections")
    .delete()
    .eq("procurement_id", id);

  if (body.id) {
    q = q.eq("id", body.id);
  } else if (body.cpc) {
    q = q.eq("cpc", body.cpc);
  } else {
    q = q.eq("mpn", body.mpn!);
  }

  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
