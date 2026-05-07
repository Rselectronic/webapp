import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; altId: string }> }
) {
  const { id, altId } = await params;

  if (!UUID_RE.test(id) || !UUID_RE.test(altId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json(
      { error: "Admin role required" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from("bom_line_alternates")
    .select("id, bom_line_id, source")
    .eq("id", altId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json(
      { error: "Failed to load alternate", details: fetchErr.message },
      { status: 500 }
    );
  }

  if (!existing || existing.bom_line_id !== id) {
    return NextResponse.json({ error: "Alternate not found" }, { status: 404 });
  }

  if (existing.source !== "operator") {
    return NextResponse.json(
      { error: "Only operator-added alternates can be deleted" },
      { status: 403 }
    );
  }

  const { error: delErr } = await admin
    .from("bom_line_alternates")
    .delete()
    .eq("id", altId);

  if (delErr) {
    return NextResponse.json(
      { error: "Failed to delete alternate", details: delErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: altId });
}
