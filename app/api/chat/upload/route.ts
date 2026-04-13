import { createClient, createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".txt"];

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const SHEET_EXTS = new Set([".csv", ".xlsx", ".xls"]);

/**
 * POST /api/chat/upload — upload a file for chat attachment.
 *
 * Handles:
 *  - Images (.png, .jpg, .jpeg, .gif, .webp)  → returned as base64 for vision
 *  - PDFs (.pdf)                              → returned as base64 for Claude native PDF support
 *  - Spreadsheets (.csv, .xlsx, .xls)         → parsed to text preview (first ~40 rows)
 *  - Plain text (.txt)                        → contents injected as text preview
 *
 * Response shape:
 * {
 *   file_name, file_path, file_type, file_size,
 *   parsed_preview: string | null,        // text to inject into system prompt
 *   media: {                              // present for images/PDFs
 *     kind: "image" | "pdf",
 *     media_type: string,                 // e.g. "image/png", "application/pdf"
 *     data_base64: string,                // raw base64 (no data: prefix)
 *   } | null
 * }
 */
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

  const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: `File type not allowed. Accepted: ${ALLOWED_EXTENSIONS.join(", ")}` },
      { status: 400 }
    );
  }

  // Upload to storage for persistence (admin client bypasses storage RLS)
  const adminSupabase = createAdminClient();
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
    // Don't fail the whole request if storage upload fails — the AI can still
    // see the file contents in this turn. Log and continue.
    console.warn("[chat/upload] storage upload failed:", uploadError.message);
  }

  let parsedPreview: string | null = null;
  let media: { kind: "image" | "pdf"; media_type: string; data_base64: string } | null = null;

  try {
    // ---- IMAGES → return as base64 for vision input ----
    if (IMAGE_EXTS.has(ext)) {
      const mediaType =
        file.type && file.type.startsWith("image/")
          ? file.type
          : ext === ".png"
            ? "image/png"
            : ext === ".gif"
              ? "image/gif"
              : ext === ".webp"
                ? "image/webp"
                : "image/jpeg";
      media = {
        kind: "image",
        media_type: mediaType,
        data_base64: buffer.toString("base64"),
      };
      parsedPreview = `[Uploaded image: ${file.name} — attached as vision input; the AI can see it]`;
    }

    // ---- PDFs → return as base64 file part (Claude native PDF support) ----
    else if (ext === ".pdf") {
      media = {
        kind: "pdf",
        media_type: "application/pdf",
        data_base64: buffer.toString("base64"),
      };
      parsedPreview = `[Uploaded PDF: ${file.name} — attached as document; the AI can read it]`;
    }

    // ---- Spreadsheets / BOM files ----
    else if (SHEET_EXTS.has(ext)) {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

      const previewRows = rows.slice(0, 50);
      const lines = previewRows.map((row) => {
        if (Array.isArray(row)) {
          return row
            .map((cell) => (cell == null ? "" : String(cell)))
            .join("\t");
        }
        return String(row);
      });

      parsedPreview = [
        `[Uploaded file: ${file.name}]`,
        `Sheets: ${workbook.SheetNames.join(", ")}`,
        `Total rows: ${rows.length}`,
        `Preview (first ${Math.min(50, rows.length)} rows, tab-separated):`,
        ...lines,
      ].join("\n");
    }

    // ---- Plain text ----
    else if (ext === ".txt") {
      const text = buffer.toString("utf-8");
      const truncated = text.length > 8000 ? text.slice(0, 8000) + "\n...[truncated]" : text;
      parsedPreview = `[Uploaded file: ${file.name}]\n${truncated}`;
    }
  } catch (err) {
    console.warn("[chat/upload] parse failed:", err);
    parsedPreview = `[Uploaded file: ${file.name} — could not parse preview]`;
  }

  return NextResponse.json({
    file_name: file.name,
    file_path: storagePath,
    file_type: file.type || ext,
    file_size: file.size,
    parsed_preview: parsedPreview,
    media,
  });
}
