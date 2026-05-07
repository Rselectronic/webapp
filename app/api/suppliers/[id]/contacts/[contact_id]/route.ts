import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import { EMAIL_REGEX } from "@/lib/suppliers/types";
// PATCH /api/suppliers/[id]/contacts/[contact_id] â€” edit a contact.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contact_id: string }> }
) {
  const { id, contact_id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Only an admin can edit contacts." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    updates.name = name;
  }
  if (body.email !== undefined) {
    const email = body.email ? String(body.email).trim() : null;
    if (email && !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }
    updates.email = email;
  }
  if (body.phone !== undefined) updates.phone = body.phone ? String(body.phone) : null;
  if (body.title !== undefined) updates.title = body.title ? String(body.title) : null;
  if (body.notes !== undefined) updates.notes = body.notes ? String(body.notes) : null;
  // is_primary changes go through /promote â€” disallow here to avoid violating the partial unique index.
  if (body.is_primary !== undefined) {
    return NextResponse.json(
      { error: "Use POST /promote to change the primary contact." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("supplier_contacts")
    .update(updates)
    .eq("id", contact_id)
    .eq("supplier_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/suppliers/[id]/contacts/[contact_id] â€” remove a contact.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contact_id: string }> }
) {
  const { id, contact_id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Only an admin can delete contacts." }, { status: 403 });
  }

  const { error } = await supabase
    .from("supplier_contacts")
    .delete()
    .eq("id", contact_id)
    .eq("supplier_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
