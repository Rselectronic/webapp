import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";

// POST /api/proc/[id]/selections/bulk
// Bulk upsert of procurement_line_selections rows for a single PROC.
// Replaces client-side N-parallel PATCH fan-out.

type OrderStatus = "not_ordered" | "ordered" | "shipped" | "received" | "cancelled";

const ORDER_STATUSES: readonly OrderStatus[] = [
  "not_ordered",
  "ordered",
  "shipped",
  "received",
  "cancelled",
] as const;

interface BulkRow {
  mpn: string;
  chosen_supplier: string;
  chosen_supplier_pn?: string | null;
  chosen_unit_price_cad?: number | null;
  chosen_effective_qty?: number | null;
}

interface BulkBody {
  status?: OrderStatus | null;
  external_order_id?: string | null;
  rows: BulkRow[];
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const auth = await requireRole(supabase);
  if ("error" in auth) return auth.error;

  const body = (await req.json()) as BulkBody;
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  let status: OrderStatus | undefined;
  if (body.status != null) {
    if (!ORDER_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    status = body.status;
  }

  // Mirror PATCH constraint: reject setting order_status when any row has
  // empty chosen_supplier.
  for (const r of rows) {
    if (!r?.mpn || typeof r.mpn !== "string") {
      return NextResponse.json({ error: "every row needs mpn" }, { status: 400 });
    }
    if (!r.chosen_supplier || !String(r.chosen_supplier).trim()) {
      return NextResponse.json(
        { error: "pick a distributor before setting order status" },
        { status: 400 }
      );
    }
  }

  const nowIso = new Date().toISOString();
  const upsertRows = rows.map((r) => {
    const base: Record<string, unknown> = {
      procurement_id: id,
      mpn: r.mpn,
      chosen_supplier: r.chosen_supplier,
      chosen_supplier_pn: r.chosen_supplier_pn ?? null,
      chosen_unit_price_cad: r.chosen_unit_price_cad ?? null,
      chosen_effective_qty: r.chosen_effective_qty ?? null,
      chose_at: nowIso,
      chosen_by: auth.user.id,
    };
    if (status) base.order_status = status;
    if (body.external_order_id !== undefined) {
      base.order_external_id = body.external_order_id;
    }
    if (status === "ordered") base.ordered_at = nowIso;
    return base;
  });

  const { data, error } = await supabase
    .from("procurement_line_selections")
    .upsert(upsertRows, { onConflict: "procurement_id,mpn" })
    .select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const updated = data?.length ?? 0;
  return NextResponse.json({
    updated,
    failed: rows.length - updated,
  });
}
