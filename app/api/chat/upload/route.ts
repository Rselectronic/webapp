import { createClient, createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
];

const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".pdf", ".png", ".jpg", ".jpeg", ".txt"];

/** POST /api/chat/upload — upload a file for chat attachment */
export async function POST(req: Request) {
  const userSupabase = await createClient();
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: `File type not allowed. Accepted: ${ALLOWED_EXTENSIONS.join(", ")}` },
      { status: 400 }
    );
  }

  // Use admin client for storage (bypasses RLS on storage)
  const adminSupabase = createAdminClient();

  // Generate unique path
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${user.id}/${timestamp}_${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await adminSupabase.storage
    .from("chat-attachments")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    console.error("Chat file upload error:", uploadError);
    return NextResponse.json({ error: "Upload failed: " + uploadError.message }, { status: 500 });
  }

  // Parse BOM files (xlsx/csv) and return summary for AI context
  let parsedPreview: string | null = null;
  if (ext === ".csv" || ext === ".xlsx" || ext === ".xls") {
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 1 });

      // Build a text preview of up to 30 rows
      const previewRows = rows.slice(0, 30);
      const lines = previewRows.map((row) => {
        if (Array.isArray(row)) return row.join("\t");
        return String(row);
      });

      parsedPreview = [
        `[Uploaded file: ${file.name}]`,
        `Sheets: ${workbook.SheetNames.join(", ")}`,
        `Total rows: ${rows.length}`,
        `Preview (first ${Math.min(30, rows.length)} rows):`,
        ...lines,
      ].join("\n");
    } catch (e) {
      console.error("BOM parse preview error:", e);
      parsedPreview = `[Uploaded file: ${file.name} — could not parse preview]`;
    }
  }

  return NextResponse.json({
    file_name: file.name,
    file_path: storagePath,
    file_type: file.type || ext,
    file_size: file.size,
    parsed_preview: parsedPreview,
  });
}
