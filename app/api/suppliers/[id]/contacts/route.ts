import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import { EMAIL_REGEX } from "@/lib/suppliers/types";
// GET /api/suppliers/[id]/contacts â€” list contacts for a supplier.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("supplier_contacts")
    .select("id, supplier_id, name, email, phone, title, is_primary, notes, created_at, updated_at")
    .eq("supplier_id", id)
    .order("is_primary", { ascending: false })
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/suppliers/[id]/contacts â€” create a new contact (admin only).
// If is_primary=true, demote any existing primary first (transactionally).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Only an admin can add contacts." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const email = body.email ? String(body.email).trim() : null;
  if (email && !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }
  const phone = body.phone ? String(body.phone) : null;
  const title = body.title ? String(body.title) : null;
  const notes = body.notes ? String(body.notes) : null;
  const wantsPrimary = !!body.is_primary;

  // If setting primary, demote existing primary first.
  if (wantsPrimary) {
    const { error: demoteErr } = await supabase
      .from("supplier_contacts")
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq("supplier_id", id)
      .eq("is_primary", true);
    if (demoteErr) {
      return NextResponse.json({ error: demoteErr.message }, { status: 500 });
    }
  }

  // Determine whether this should be primary by default (no other contacts â†’ auto-primary).
  let finalPrimary = wantsPrimary;
  if (!wantsPrimary) {
    const { data: existing } = await supabase
      .from("supplier_contacts")
      .select("id")
      .eq("supplier_id", id)
      .limit(1);
    if (!existing || existing.length === 0) finalPrimary = true;
  }

  const { data, error } = await supabase
    .from("supplier_contacts")
    .insert({
      supplier_id: id,
      name,
      email,
      phone,
      title,
      notes,
      is_primary: finalPrimary,
    })
    .select("id, supplier_id, name, email, phone, title, is_primary, notes, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
