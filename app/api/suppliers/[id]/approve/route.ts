import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
// POST /api/suppliers/[id]/approve â€” admin only. Flips is_approved to true.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Only an admin can approve suppliers." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("suppliers")
    .update({ is_approved: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, code, is_approved")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  return NextResponse.json(data);
}
