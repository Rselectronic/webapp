import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * PATCH /api/bom/[id] — update editable BOM-level fields.
 *
 * The set is intentionally narrow: bom_name, revision, gerber_name, and
 * gerber_revision. These are the user-facing labels that operators forget
 * to fill on upload and want to fix without re-parsing the whole file.
 *
 * Anything that affects parsing (column_mapping, header_row, file content
 * itself) is NOT editable here — those require a re-upload so the parser
 * regenerates bom_lines from a consistent input.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    bom_name?: string | null;
    revision?: string | null;
    gerber_name?: string | null;
    gerber_revision?: string | null;
    bom_section?: string | null;
  };

  // The boms table has no updated_at column (only created_at), so don't
  // include it in the patch — Supabase rejects unknown columns.
  const updates: Record<string, unknown> = {};

  // Each field: trim whitespace; an explicitly empty trimmed value clears
  // the column to NULL. `undefined` (key absent from the body) leaves the
  // column untouched.
  if (body.bom_name !== undefined) {
    const v = typeof body.bom_name === "string" ? body.bom_name.trim() : "";
    updates.bom_name = v.length > 0 ? v : null;
  }
  if (body.revision !== undefined) {
    const v = typeof body.revision === "string" ? body.revision.trim() : "";
    updates.revision = v.length > 0 ? v : null;
  }
  if (body.gerber_name !== undefined) {
    const v = typeof body.gerber_name === "string" ? body.gerber_name.trim() : "";
    updates.gerber_name = v.length > 0 ? v : null;
  }
  if (body.gerber_revision !== undefined) {
    const v =
      typeof body.gerber_revision === "string" ? body.gerber_revision.trim() : "";
    updates.gerber_revision = v.length > 0 ? v : null;
  }
  // Section retag: only the four whitelisted values are allowed. We mirror
  // the change onto bom_lines below so the per-row tag tracks the BOM's
  // label. Cross-BOM auto-merge on retag isn't handled here — re-upload is
  // the supported path when the operator wants the lines moved into a
  // partner BOM.
  const allowedSections = new Set(["full", "smt", "th", "other"]);
  let nextSection: string | null = null;
  if (body.bom_section !== undefined) {
    const v =
      typeof body.bom_section === "string"
        ? body.bom_section.trim().toLowerCase()
        : "";
    if (!allowedSections.has(v)) {
      return NextResponse.json(
        { error: `bom_section must be one of: ${Array.from(allowedSections).join(", ")}` },
        { status: 400 }
      );
    }
    nextSection = v;
    updates.bom_section = v;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No fields supplied to update" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("boms")
    .update(updates)
    .eq("id", id)
    .select(
      "id, bom_name, file_name, revision, gerber_name, gerber_revision, bom_section, source_files"
    )
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // After a section retag, decide whether to sync per-line tags. For
  // single-file BOMs every line should match the BOM-level label, so we
  // retag. For multi-file BOMs (source_files has more than one entry) the
  // per-line tag records which uploaded file each line came from — that
  // traceability is worth more than the cosmetic label, so leave it alone.
  if (nextSection) {
    const sourceFiles = Array.isArray(
      (data as { source_files?: unknown[] }).source_files
    )
      ? ((data as { source_files: unknown[] }).source_files as unknown[])
      : [];
    const isMultiFile = sourceFiles.length > 1;
    if (!isMultiFile) {
      await supabase
        .from("bom_lines")
        .update({ bom_section: nextSection })
        .eq("bom_id", id)
        .neq("bom_section", nextSection);
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bomId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (!isAdminRole(profile?.role)) {
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
        error: `Cannot delete â€” ${parts.join(" and ")} reference this BOM. Delete them first.`,
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
