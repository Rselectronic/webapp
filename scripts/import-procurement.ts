/**
 * Import RS's Excel "Procurement" sheet (~11k rows) and "Manual M-Code"
 * sheet into the web app's customer_parts and manual_m_code_overrides
 * tables.
 *
 * Idempotent — re-runnable. Uses UPSERT on the natural keys so refining
 * the CSVs and re-importing won't produce duplicates or fight with
 * whatever the web-app BOM parser has written in between runs.
 *
 * Usage:
 *   npx tsx scripts/import-procurement.ts \
 *     --procurement path/to/procurement.csv \
 *     --mcodes path/to/manual_mcodes.csv
 *
 * CSV column expectations (case-insensitive header match; leave missing
 * columns empty — the importer skips them):
 *
 *   Procurement CSV
 *     customer_code           REQUIRED  maps to customers.code (e.g. "TLAN")
 *     cpc                     REQUIRED
 *     original_mpn
 *     original_manufacturer
 *     mpn_to_use
 *     manufacturer_to_use
 *     digikey_pn
 *     mouser_pn
 *     lcsc_pn
 *     through_hole_pins
 *     notes
 *     proc_used               comma-separated proc batch codes
 *
 *   Manual M-Code CSV
 *     cpc                     REQUIRED
 *     m_code                  REQUIRED
 *     notes
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service role needed
 *   to bypass RLS during bulk import).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { resolve } from "node:path";

// Manually load .env.local so the script works when run directly via tsx
// (Next.js loads it for app code, but tsx doesn't).
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
    // Strip surrounding single or double quotes.
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

const { values } = parseArgs({
  options: {
    procurement: { type: "string" },
    mcodes: { type: "string" },
  },
});

// ---------------------------------------------------------------------------
// Tiny CSV parser (handles quoted fields, embedded commas, embedded quotes).
// Intentionally small — using a 3rd-party lib here creates friction for
// one-off imports.
// ---------------------------------------------------------------------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function headerIndex(headers: string[], name: string): number {
  const target = name.toLowerCase().trim();
  return headers.findIndex((h) => h.toLowerCase().trim() === target);
}

function cell(row: string[], idx: number): string | null {
  if (idx < 0 || idx >= row.length) return null;
  const v = row[idx].trim();
  return v.length > 0 ? v : null;
}

// ---------------------------------------------------------------------------
// Procurement import
// ---------------------------------------------------------------------------
async function importProcurement(path: string) {
  console.log(`[procurement] reading ${path}`);
  const text = readFileSync(path, "utf-8");
  const rows = parseCsv(text);
  if (rows.length === 0) {
    console.error("[procurement] empty file");
    return;
  }
  const headers = rows[0];
  const idx = {
    customer_code: headerIndex(headers, "customer_code"),
    cpc: headerIndex(headers, "cpc"),
    original_mpn: headerIndex(headers, "original_mpn"),
    original_manufacturer: headerIndex(headers, "original_manufacturer"),
    mpn_to_use: headerIndex(headers, "mpn_to_use"),
    manufacturer_to_use: headerIndex(headers, "manufacturer_to_use"),
    digikey_pn: headerIndex(headers, "digikey_pn"),
    mouser_pn: headerIndex(headers, "mouser_pn"),
    lcsc_pn: headerIndex(headers, "lcsc_pn"),
    through_hole_pins: headerIndex(headers, "through_hole_pins"),
    notes: headerIndex(headers, "notes"),
    proc_used: headerIndex(headers, "proc_used"),
  };
  if (idx.customer_code < 0 || idx.cpc < 0) {
    console.error("[procurement] required columns customer_code and cpc not found");
    return;
  }

  // Map customer codes → ids once.
  const { data: customers, error: custErr } = await supabase
    .from("customers")
    .select("id, code");
  if (custErr || !customers) {
    console.error("[procurement] failed to load customers:", custErr);
    return;
  }
  const customerIdByCode = new Map<string, string>();
  for (const c of customers) customerIdByCode.set(c.code.toUpperCase(), c.id);

  const unknownCustomers = new Set<string>();
  const batch: Array<Record<string, unknown>> = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const code = cell(r, idx.customer_code)?.toUpperCase();
    const cpc = cell(r, idx.cpc);
    if (!code || !cpc) continue;
    const customerId = customerIdByCode.get(code);
    if (!customerId) {
      unknownCustomers.add(code);
      continue;
    }
    const procUsedRaw = cell(r, idx.proc_used);
    const procUsed = procUsedRaw
      ? procUsedRaw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
      : [];
    const thPinsRaw = cell(r, idx.through_hole_pins);
    const thPins = thPinsRaw ? Number.parseInt(thPinsRaw, 10) : null;

    batch.push({
      customer_id: customerId,
      cpc,
      original_mpn: cell(r, idx.original_mpn),
      original_manufacturer: cell(r, idx.original_manufacturer),
      mpn_to_use: cell(r, idx.mpn_to_use),
      manufacturer_to_use: cell(r, idx.manufacturer_to_use),
      digikey_pn: cell(r, idx.digikey_pn),
      mouser_pn: cell(r, idx.mouser_pn),
      lcsc_pn: cell(r, idx.lcsc_pn),
      through_hole_pins: Number.isFinite(thPins ?? NaN) ? thPins : null,
      notes: cell(r, idx.notes),
      used_in_procs: procUsed,
    });
  }

  console.log(
    `[procurement] parsed ${batch.length} rows (skipped ${rows.length - 1 - batch.length})`
  );
  if (unknownCustomers.size > 0) {
    console.warn(
      `[procurement] ${unknownCustomers.size} rows had unknown customer codes: ${[...unknownCustomers].slice(0, 10).join(", ")}${
        unknownCustomers.size > 10 ? "…" : ""
      }`
    );
  }

  // Dedupe by (customer_id, cpc). Postgres ON CONFLICT DO UPDATE can't touch
  // the same target row twice in one statement. Last occurrence wins, which
  // matches how a human would re-import rev-by-rev: the most recent entry
  // reflects current truth.
  const deduped = new Map<string, Record<string, unknown>>();
  for (const row of batch) {
    const key = `${row.customer_id}|${String(row.cpc).toLowerCase()}`;
    deduped.set(key, row);
  }
  const collapsed = [...deduped.values()];
  const collisions = batch.length - collapsed.length;
  if (collisions > 0) {
    console.log(
      `[procurement] collapsed ${collisions} duplicate (customer_id, cpc) pairs — keeping last occurrence`
    );
  }

  // Chunked upsert (Supabase API caps body size).
  const CHUNK = 500;
  let done = 0;
  for (let i = 0; i < collapsed.length; i += CHUNK) {
    const slice = collapsed.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("customer_parts")
      .upsert(slice, { onConflict: "customer_id,cpc" });
    if (error) {
      console.error(`[procurement] upsert error on chunk ${i}-${i + slice.length}:`, error);
      return;
    }
    done += slice.length;
    process.stdout.write(`\r[procurement] upserted ${done}/${collapsed.length}`);
  }
  process.stdout.write("\n");
  console.log(`[procurement] done — ${done} rows`);
}

// ---------------------------------------------------------------------------
// Manual M-Code import
// ---------------------------------------------------------------------------
async function importMcodes(path: string) {
  console.log(`[mcodes] reading ${path}`);
  const text = readFileSync(path, "utf-8");
  const rows = parseCsv(text);
  if (rows.length === 0) {
    console.error("[mcodes] empty file");
    return;
  }
  const headers = rows[0];
  const idx = {
    cpc: headerIndex(headers, "cpc"),
    m_code: headerIndex(headers, "m_code"),
  };
  if (idx.cpc < 0 || idx.m_code < 0) {
    console.error("[mcodes] required columns cpc and m_code not found");
    return;
  }

  // Parse CSV into cpc -> m_code map.
  const mcodeByCpc = new Map<string, string>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const cpc = cell(r, idx.cpc);
    const m = cell(r, idx.m_code);
    if (!cpc || !m) continue;
    mcodeByCpc.set(cpc, m);
  }
  console.log(`[mcodes] parsed ${mcodeByCpc.size} CPCs`);

  // Fan out each (cpc, m_code) to every matching customer_parts row
  // (CPC can appear under multiple customers). This writes m_code_manual
  // only when the row doesn't already have one — preserving any per-
  // customer correction the operator has made since the initial import.
  const cpcs = [...mcodeByCpc.keys()];
  const CHUNK = 500;
  let updated = 0;
  let orphans = 0;
  const nowIso = new Date().toISOString();

  for (let i = 0; i < cpcs.length; i += CHUNK) {
    const slice = cpcs.slice(i, i + CHUNK);
    const { data: existing, error: selErr } = await supabase
      .from("customer_parts")
      .select("id, cpc, m_code_manual")
      .in("cpc", slice);
    if (selErr) {
      console.error(`[mcodes] select error:`, selErr);
      return;
    }
    const existingByCpc = new Map<string, Array<{ id: string; m_code_manual: string | null }>>();
    for (const row of existing ?? []) {
      const arr = existingByCpc.get(row.cpc) ?? [];
      arr.push({ id: row.id, m_code_manual: row.m_code_manual });
      existingByCpc.set(row.cpc, arr);
    }

    const patches: Array<{ id: string; m_code_manual: string; m_code_manual_updated_at: string }> = [];
    for (const cpc of slice) {
      const rowsForCpc = existingByCpc.get(cpc);
      if (!rowsForCpc || rowsForCpc.length === 0) {
        orphans++;
        continue;
      }
      const m = mcodeByCpc.get(cpc)!;
      for (const row of rowsForCpc) {
        if (row.m_code_manual) continue; // don't clobber per-customer corrections
        patches.push({ id: row.id, m_code_manual: m, m_code_manual_updated_at: nowIso });
      }
    }

    // Apply patches one-by-one (no bulk update by ID in PostgREST without a
    // stored proc — and this import is one-shot so the naive path is fine).
    for (const p of patches) {
      const { error } = await supabase
        .from("customer_parts")
        .update({
          m_code_manual: p.m_code_manual,
          m_code_manual_updated_at: p.m_code_manual_updated_at,
        })
        .eq("id", p.id);
      if (!error) updated++;
    }
    process.stdout.write(`\r[mcodes] back-filled ${updated} customer_parts rows`);
  }
  process.stdout.write("\n");
  console.log(`[mcodes] done — ${updated} rows updated; ${orphans} CPCs had no matching customer_parts row (skipped)`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  if (values.procurement) await importProcurement(values.procurement);
  if (values.mcodes) await importMcodes(values.mcodes);
  if (!values.procurement && !values.mcodes) {
    console.error(
      "Nothing to do. Pass --procurement <path> and/or --mcodes <path>."
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
