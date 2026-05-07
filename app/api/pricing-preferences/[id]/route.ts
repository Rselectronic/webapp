import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/pricing-preferences/[id]
 * Removes a user-defined preference. System presets (is_system=true) are
 * immutable and the request will 403 even for admins.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  // Block deletion of system presets.
  const { data: existing } = await supabase
    .from("pricing_preferences")
    .select("is_system")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Preference not found" }, { status: 404 });
  }
  if (existing.is_system) {
    return NextResponse.json(
      { error: "System preferences cannot be deleted" },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from("pricing_preferences")
    .delete()
    .eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "Failed to delete preference", details: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
