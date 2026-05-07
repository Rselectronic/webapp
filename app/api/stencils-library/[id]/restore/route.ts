import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
// POST /api/stencils-library/[id]/restore â€” un-discard a stencil.
// Rejects with 409 if an active row already uses the same stencil_name.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const { data: row, error: rowErr } = await supabase
    .from("stencils_library")
    .select("id, stencil_name, discarded_at")
    .eq("id", id)
    .maybeSingle();
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!row.discarded_at) {
    return NextResponse.json({ error: "Stencil is not discarded" }, { status: 400 });
  }

  const { data: clash } = await supabase
    .from("stencils_library")
    .select("id")
    .eq("stencil_name", row.stencil_name)
    .is("discarded_at", null)
    .neq("id", id)
    .maybeSingle();
  if (clash) {
    return NextResponse.json(
      {
        error: `Cannot restore: an active stencil named "${row.stencil_name}" already exists. Discard or rename it first.`,
      },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from("stencils_library")
    .update({
      discarded_at: null,
      discarded_reason: null,
      discarded_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
