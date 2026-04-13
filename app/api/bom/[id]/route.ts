import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bomId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "ceo" && profile?.role !== "operations_manager") {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Check if BOM exists
  const { data: bom } = await admin.from("boms").select("id, file_path").eq("id", bomId).single();
  if (!bom) return NextResponse.json({ error: "BOM not found" }, { status: 404 });

  // Check if any quotes reference this BOM
  const { count: quoteCount } = await admin
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .eq("bom_id", bomId);

  if ((quoteCount ?? 0) > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${quoteCount} quote(s) reference this BOM. Delete the quotes first.` },
      { status: 409 }
    );
  }

  // Check if any jobs reference this BOM
  const { count: jobCount } = await admin
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("bom_id", bomId);

  if ((jobCount ?? 0) > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${jobCount} job(s) reference this BOM. Delete the jobs first.` },
      { status: 409 }
    );
  }

  // Delete bom_lines first (CASCADE should handle this, but be explicit)
  await admin.from("bom_lines").delete().eq("bom_id", bomId);

  // Delete the BOM file from storage if path exists
  if (bom.file_path) {
    await admin.storage.from("boms").remove([bom.file_path]).catch(() => {});
  }

  // Delete the BOM record
  const { error } = await admin.from("boms").delete().eq("id", bomId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, deleted: bomId });
}
