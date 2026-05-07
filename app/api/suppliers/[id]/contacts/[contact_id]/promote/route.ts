import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
// POST /api/suppliers/[id]/contacts/[contact_id]/promote
// Atomically demote any current primary, then promote this contact.
// (admin only.)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contact_id: string }> }
) {
  const { id, contact_id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Only an admin can change the primary contact." }, { status: 403 });
  }

  // Verify the contact belongs to this supplier.
  const { data: target, error: loadErr } = await supabase
    .from("supplier_contacts")
    .select("id, supplier_id, is_primary")
    .eq("id", contact_id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!target || target.supplier_id !== id) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  if (target.is_primary) {
    // Already primary â€” nothing to do.
    return NextResponse.json({ success: true, already_primary: true });
  }

  // Demote current primary FIRST so we don't violate the partial unique index.
  const now = new Date().toISOString();
  const { error: demoteErr } = await supabase
    .from("supplier_contacts")
    .update({ is_primary: false, updated_at: now })
    .eq("supplier_id", id)
    .eq("is_primary", true);
  if (demoteErr) return NextResponse.json({ error: demoteErr.message }, { status: 500 });

  const { error: promoteErr } = await supabase
    .from("supplier_contacts")
    .update({ is_primary: true, updated_at: now })
    .eq("id", contact_id);
  if (promoteErr) return NextResponse.json({ error: promoteErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
