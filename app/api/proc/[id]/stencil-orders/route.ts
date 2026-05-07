import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";

// GET/POST /api/proc/[id]/stencil-orders
// List + create stencil_orders for a procurement (migration 065).

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const auth = await requireRole(supabase);
  if ("error" in auth) return auth.error;

  const { data, error } = await supabase
    .from("stencil_orders")
    .select("*")
    .eq("procurement_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data ?? [] });
}

interface PostBody {
  supplier: string;
  external_order_id?: string | null;
  stencil_type?: string | null;
  covered_gmp_ids?: string[] | null;
  quantity?: number | null;
  unit_price?: number | null;
  total_price?: number | null;
  currency?: string | null;
  ordered_date?: string | null;
  expected_arrival?: string | null;
  received_date?: string | null;
  status?: string | null;
  notes?: string | null;
  invoice_file_path?: string | null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const auth = await requireRole(supabase);
  if ("error" in auth) return auth.error;

  const body = (await req.json()) as PostBody;
  if (!body?.supplier) {
    return NextResponse.json({ error: "supplier required" }, { status: 400 });
  }
  const covered = body.covered_gmp_ids ?? [];
  const is_merged = covered.length > 1;

  const { data, error } = await supabase
    .from("stencil_orders")
    .insert({
      procurement_id: id,
      supplier: body.supplier,
      external_order_id: body.external_order_id ?? null,
      stencil_type: body.stencil_type ?? null,
      is_merged,
      covered_gmp_ids: covered,
      quantity: body.quantity ?? null,
      unit_price: body.unit_price ?? null,
      total_price: body.total_price ?? null,
      currency: body.currency ?? "CAD",
      ordered_date: body.ordered_date ?? null,
      expected_arrival: body.expected_arrival ?? null,
      received_date: body.received_date ?? null,
      status: body.status ?? "ordered",
      notes: body.notes ?? null,
      invoice_file_path: body.invoice_file_path ?? null,
      created_by: auth.user.id,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order: data });
}
