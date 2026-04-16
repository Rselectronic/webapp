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
  const { data: blockingQuotes } = await admin
    .from("quotes")
    .select("id, quote_number")
    .eq("bom_id", bomId)
    .limit(5);

  // Check if any jobs reference this BOM
  const { data: blockingJobs } = await admin
    .from("jobs")
    .select("id, job_number")
    .eq("bom_id", bomId)
    .limit(5);

  const hasQuotes = (blockingQuotes?.length ?? 0) > 0;
  const hasJobs = (blockingJobs?.length ?? 0) > 0;

  if (hasQuotes || hasJobs) {
    const parts: string[] = [];
    if (hasQuotes) parts.push(`${blockingQuotes!.length} quote(s)`);
    if (hasJobs) parts.push(`${blockingJobs!.length} job(s)`);
    return NextResponse.json(
      {
        error: `Cannot delete — ${parts.join(" and ")} reference this BOM. Delete them first.`,
        blocking: {
          quotes: blockingQuotes ?? [],
          jobs: blockingJobs ?? [],
        },
      },
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
