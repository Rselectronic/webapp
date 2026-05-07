import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";

// GET/POST /api/proc/[id]/pcb-orders
// List + create pcb_orders for a procurement (migration 065).

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
    .from("pcb_orders")
    .select("*, gmps(gmp_number, board_name)")
    .eq("procurement_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data ?? [] });
}

interface PostBody {
  gmp_id?: string | null;
  supplier: string;
  external_order_id?: string | null;
  quantity: number;
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
  if (!body?.quantity || body.quantity <= 0) {
    return NextResponse.json({ error: "quantity must be > 0" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("pcb_orders")
    .insert({
      procurement_id: id,
      gmp_id: body.gmp_id ?? null,
      supplier: body.supplier,
      external_order_id: body.external_order_id ?? null,
      quantity: body.quantity,
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
