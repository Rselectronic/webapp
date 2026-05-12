import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
// PATCH /api/stencils-library/[id] â€” update a stencil (name / position / comments / gmps).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const updates: Record<string, unknown> = {};
  if ("stencil_name" in body) {
    const name = String(body.stencil_name ?? "").trim();
    if (!name) return NextResponse.json({ error: "stencil_name cannot be empty" }, { status: 400 });
    // Reject if another active row uses the same name.
    const { data: clash } = await supabase
      .from("stencils_library")
      .select("id")
      .eq("stencil_name", name)
      .is("discarded_at", null)
      .neq("id", id)
      .maybeSingle();
    if (clash) return NextResponse.json({ error: `Stencil "${name}" already exists` }, { status: 400 });
    updates.stencil_name = name;
  }
  if ("comments" in body) updates.comments = body.comments ? String(body.comments) : null;
  if ("position_no" in body) {
    updates.position_no =
      body.position_no == null || body.position_no === "" ? null : Number(body.position_no);
  }
  updates.updated_at = new Date().toISOString();

  if (Object.keys(updates).length > 1) {
    const { error } = await supabase.from("stencils_library").update(updates).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Replace the GMP junction rows if the caller provided a gmps array.
  if (Array.isArray(body.gmps)) {
    const gmpList: string[] = body.gmps.map((g: unknown) => String(g).trim()).filter(Boolean);
    const seen = new Set<string>();
    const gmps: string[] = [];
    for (const g of gmpList) {
      const key = g.toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        gmps.push(g);
      }
    }
    const { error: delErr } = await supabase
      .from("stencils_library_gmps")
      .delete()
      .eq("stencil_id", id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    if (gmps.length > 0) {
      const { error: insErr } = await supabase
        .from("stencils_library_gmps")
        .insert(gmps.map((g) => ({ stencil_id: id, gmp_number: g })));
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/stencils-library/[id] â€” soft-delete (discard) the stencil.
// Production users can discard (they're the ones throwing the stencil out);
// restore stays admin-only so a wrongly-discarded stencil isn't silently
// reinstated.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role) && user.role !== "production")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const discarded_reason = body.discarded_reason
    ? String(body.discarded_reason).trim()
    : "";
  if (!discarded_reason)
    return NextResponse.json(
      { error: "discarded_reason is required" },
      { status: 400 }
    );

  const { error } = await supabase
    .from("stencils_library")
    .update({
      discarded_at: new Date().toISOString(),
      discarded_reason,
      discarded_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
