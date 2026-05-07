import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readFile } from "fs/promises";
import path from "path";
/** Whitelist of allowed source files â€” prevents path traversal. */
const ALLOWED_FILES: Record<string, { contentType: string }> = {
  "_SOURCE_DM_Common_File_V11_2026-04-15.xlsm": {
    contentType:
      "application/vnd.ms-excel.sheet.macroEnabled.12",
  },
  "_SOURCE_TIME_V11_2026-04-15.xlsm": {
    contentType:
      "application/vnd.ms-excel.sheet.macroEnabled.12",
  },
  "_SOURCE_admin_file_2026-04-15.xlsx": {
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  "programming_fees.csv": {
    contentType: "text/csv",
  },
  "overage_tables.csv": {
    contentType: "text/csv",
  },
  "vba_extracted_settings.md": {
    contentType: "text/markdown",
  },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  // --- Auth: admin only ---
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
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  // --- Validate filename against whitelist ---
  const meta = ALLOWED_FILES[filename];
  if (!meta) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // --- Read and serve the file ---
  const filePath = path.join(
    process.cwd(),
    "supabase",
    "seed-data",
    "dm-file",
    filename,
  );

  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": meta.contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "File not found on disk" },
      { status: 404 },
    );
  }
}
