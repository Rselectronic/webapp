/**
 * One-off importer for the shop's physical stencil library.
 *
 * Reads sheet 1 of the xlsx:
 *   col A = position_no (shelf slot, integer)
 *   col B = stencil_name (e.g. "1118475_REV0")
 *   col C = GMPs covered (one or more, separated by `;` or `,`)
 *
 * Idempotent — re-runnable. Upserts by stencil_name (case-insensitive match
 * treats "FOO_REV0" and "foo_rev0" as the same sheet). Replaces the junction
 * rows for each stencil (delete old, insert new) so removing a GMP from the
 * spreadsheet actually removes it.
 *
 * Usage:
 *   npx tsx scripts/import-stencils-library.ts <path-to-xlsx>
 *
 * Env (loaded from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";

// Load .env.local manually — tsx doesn't do it for us.
function loadDotenv(path: string) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf-8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotenv(resolve(process.cwd(), ".env.local"));
loadDotenv(resolve(process.cwd(), ".env"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in .env.local."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

function parseGmpTokens(raw: string): string[] {
  // Split on `;` and `,`, trim, dedupe case-insensitively (keep first casing).
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of raw.split(/[;,]/)) {
    const t = tok.trim();
    if (!t) continue;
    const k = t.toUpperCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx scripts/import-stencils-library.ts <path-to-xlsx>");
    process.exit(1);
  }
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`[import] reading ${filePath}`);
  // Use read + readFileSync instead of readFile — the latter isn't
  // exported when xlsx is loaded via ESM interop under ts-node.
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // header:1 -> array-of-arrays; defval:"" -> blank cells become "".
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

  // Detect header row heuristically: if row 0 cell B looks like a title ("stencil"
  // in the text), skip it. Otherwise assume data starts at row 0.
  let startRow = 0;
  const first = rows[0] ?? [];
  const firstB = String(first[1] ?? "").toLowerCase();
  if (firstB.includes("stencil") || firstB.includes("name")) {
    startRow = 1;
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  // Pre-load existing stencils by upper-cased name for case-insensitive match.
  const { data: existing, error: exErr } = await supabase
    .from("stencils_library")
    .select("id, stencil_name");
  if (exErr) {
    console.error("[import] failed to load existing stencils:", exErr);
    process.exit(1);
  }
  const existingByUpper = new Map<string, { id: string; stencil_name: string }>();
  for (const row of existing ?? []) {
    existingByUpper.set(row.stencil_name.toUpperCase(), row);
  }

  for (let i = startRow; i < rows.length; i++) {
    const r = rows[i];
    const posRaw = r[0];
    const nameRaw = String(r[1] ?? "").trim();
    const gmpsRaw = String(r[2] ?? "").trim();
    const commentsRaw = String(r[3] ?? "").trim();
    const comments = commentsRaw.length > 0 ? commentsRaw : null;

    if (!nameRaw) {
      skipped++;
      continue;
    }

    const position_no =
      posRaw === "" || posRaw == null
        ? null
        : Number.isFinite(Number(posRaw))
        ? Number.parseInt(String(posRaw), 10)
        : null;

    const gmps = parseGmpTokens(gmpsRaw);
    const key = nameRaw.toUpperCase();
    const existingRow = existingByUpper.get(key);

    let stencilId: string;
    if (existingRow) {
      // Update in place (keep the original casing of stencil_name to avoid
      // churning the unique index unnecessarily).
      const { error } = await supabase
        .from("stencils_library")
        .update({ position_no, comments, updated_at: new Date().toISOString() })
        .eq("id", existingRow.id);
      if (error) {
        console.error(`[import] update failed for ${nameRaw}:`, error);
        skipped++;
        continue;
      }
      stencilId = existingRow.id;
      updated++;
    } else {
      const { data: ins, error } = await supabase
        .from("stencils_library")
        .insert({ stencil_name: nameRaw, position_no, comments })
        .select("id")
        .single();
      if (error || !ins) {
        console.error(`[import] insert failed for ${nameRaw}:`, error);
        skipped++;
        continue;
      }
      stencilId = ins.id;
      existingByUpper.set(key, { id: stencilId, stencil_name: nameRaw });
      inserted++;
    }

    // Replace junction rows.
    const { error: delErr } = await supabase
      .from("stencils_library_gmps")
      .delete()
      .eq("stencil_id", stencilId);
    if (delErr) {
      console.error(`[import] delete junction failed for ${nameRaw}:`, delErr);
      continue;
    }
    if (gmps.length > 0) {
      const junctionRows = gmps.map((g) => ({ stencil_id: stencilId, gmp_number: g }));
      const { error: insErr } = await supabase
        .from("stencils_library_gmps")
        .insert(junctionRows);
      if (insErr) {
        console.error(`[import] insert junction failed for ${nameRaw}:`, insErr);
      }
    }
  }

  console.log(`[import] inserted ${inserted}, updated ${updated}, skipped ${skipped} rows`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
