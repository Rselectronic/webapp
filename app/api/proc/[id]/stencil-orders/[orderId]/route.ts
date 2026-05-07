import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";

// PATCH/DELETE /api/proc/[id]/stencil-orders/[orderId]
// Update/delete a single stencil_order row (migration 065).

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

const ALLOWED_FIELDS = [
  "supplier",
  "external_order_id",
  "stencil_type",
  "covered_gmp_ids",
  "quantity",
  "unit_price",
  "total_price",
  "currency",
  "ordered_date",
  "expected_arrival",
  "received_date",
  "status",
  "notes",
  "invoice_file_path",
] as const;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  const { id, orderId } = await params;
  const supabase = await createClient();
  const auth = await requireRole(supabase);
  if ("error" in auth) return auth.error;

  const body = (await req.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ALLOWED_FIELDS) {
    if (k in body) patch[k] = body[k];
  }
  if ("covered_gmp_ids" in body) {
    const arr = (body.covered_gmp_ids as string[] | null | undefined) ?? [];
    patch.is_merged = arr.length > 1;
  }

  const { data, error } = await supabase
    .from("stencil_orders")
    .update(patch)
    .eq("id", orderId)
    .eq("procurement_id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  const { id, orderId } = await params;
  const supabase = await createClient();
  const auth = await requireRole(supabase);
  if ("error" in auth) return auth.error;

  const { error } = await supabase
    .from("stencil_orders")
    .delete()
    .eq("id", orderId)
    .eq("procurement_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
