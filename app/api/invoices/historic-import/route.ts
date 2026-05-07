/**
 * /api/invoices/historic-import
 *
 * Bulk-imports historic (pre-web-app) invoices for revenue-reporting
 * continuity. Supports CAD + USD: each row carries its own currency and
 * — for USD — the FX rate that was in effect at the invoice's issue
 * date, so the Reports → Revenue dashboard can roll USD legacy invoices
 * up to CAD-equivalent without a guess.
 *
 * Two modes:
 *   POST                          → commit the import
 *   POST ?dry_run=1               → parse + validate, return preview rows
 *                                   without writing
 *
 * Body: multipart/form-data with `file` (CSV), OR JSON {csv:"..."}.
 *
 * Required CSV columns (case-insensitive, snake_case):
 *   customer_code     unique customer.code lookup
 *   invoice_number    string, must be unique across the table
 *   issued_date       YYYY-MM-DD
 *   total             numeric, CAD
 *
 * Optional CSV columns:
 *   subtotal, gst, qst, hst, freight, discount   (numeric; default 0)
 *   currency          CAD | USD          (default CAD)
 *   fx_rate_to_cad    numeric            (default 1; REQUIRED when
 *                       currency=USD so the rate that was in effect at
 *                       issue date is captured. Look up BoC noon rates
 *                       at https://www.bankofcanada.ca/rates/exchange/.)
 *   tax_region        QC | CA_OTHER | HST_ON | HST_15 | INTERNATIONAL
 *                       (default QC — historic RS invoices were Quebec)
 *   due_date          YYYY-MM-DD (default = issued_date + 30 days)
 *   paid_date         YYYY-MM-DD (default = issued_date when status omitted)
 *   status            paid | sent | overdue | draft | cancelled
 *                       (default paid — historic invoices are settled)
 *   legacy_reference  free text — source pointer
 *   notes             free text
 *
 * NOTE on amounts: every numeric column (subtotal, gst, qst, hst, freight,
 * discount, total) is interpreted IN THE ROW'S CURRENCY. Don't pre-convert
 * USD rows to CAD — store the original USD numbers and supply the
 * fx_rate_to_cad. The Revenue dashboard converts at display time.
 *
 * Response: { inserted, dry_run, rows, errors }.
 *   - rows: parsed objects (preview); only present in dry_run mode.
 *   - errors: per-row issues that prevented import. The whole CSV is
 *     rejected if any row fails (atomic) so the file matches the books
 *     after import.
 *
 * Admin-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRole } from "@/lib/auth/roles";
import { getAuthUser } from "@/lib/auth/api-auth";
import { TAX_REGIONS, type TaxRegion } from "@/lib/tax/regions";
import { addDaysMontreal } from "@/lib/utils/format";

// Pin to the Node runtime — large CSVs (10 MB+, thousands of rows) need
// real Node memory + time. Edge would crash on a file this size.
export const runtime = "nodejs";
// Importing 10k+ rows + DB lookups can take 10-20 seconds. Default Vercel
// timeout is 10s; bump to 60 so commits don't get cut mid-batch.
export const maxDuration = 60;

// Local CSV parser — same shape as /bulk-update endpoints.
function parseCSV(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        cur.push(field);
        field = "";
      } else if (ch === "\r") {
        // ignore
      } else if (ch === "\n") {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const VALID_STATUSES = new Set([
  "draft",
  "sent",
  "overdue",
  "paid",
  "cancelled",
]);

interface PreviewRow {
  customer_code: string;
  invoice_number: string;
  issued_date: string;
  due_date: string | null;
  paid_date: string | null;
  status: string;
  tax_region: TaxRegion;
  currency: "CAD" | "USD";
  fx_rate_to_cad: number;
  subtotal: number;
  gst: number;
  qst: number;
  hst: number;
  freight: number;
  discount: number;
  total: number;
  legacy_reference: string | null;
  notes: string | null;
}

export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json(
      { error: "Forbidden — only admins can import historic invoices." },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const dryRun =
    url.searchParams.get("dry_run") === "1" ||
    url.searchParams.get("dry_run") === "true";

  // ── Read CSV from form upload OR JSON body ──
  let csvText = "";
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing 'file' field in form data" },
        { status: 400 }
      );
    }
    csvText = await file.text();
  } else {
    const body = (await req.json().catch(() => ({}))) as { csv?: string };
    if (typeof body.csv !== "string") {
      return NextResponse.json(
        { error: "Send multipart form (file=...) or JSON {csv:'...'}" },
        { status: 400 }
      );
    }
    csvText = body.csv;
  }

  const rows = parseCSV(csvText);
  if (rows.length < 2) {
    return NextResponse.json(
      { error: "CSV is empty or has no data rows" },
      { status: 400 }
    );
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  // Required columns.
  const required = ["customer_code", "invoice_number", "issued_date", "total"];
  const missing = required.filter((c) => idx(c) === -1);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Missing required column(s): ${missing.join(", ")}. ` +
          `Required: ${required.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  const F = {
    customer_code: idx("customer_code"),
    invoice_number: idx("invoice_number"),
    issued_date: idx("issued_date"),
    due_date: idx("due_date"),
    paid_date: idx("paid_date"),
    status: idx("status"),
    tax_region: idx("tax_region"),
    currency: idx("currency"),
    fx_rate_to_cad: idx("fx_rate_to_cad"),
    subtotal: idx("subtotal"),
    gst: idx("gst"),
    qst: idx("qst"),
    hst: idx("hst"),
    freight: idx("freight"),
    discount: idx("discount"),
    total: idx("total"),
    legacy_reference: idx("legacy_reference"),
    notes: idx("notes"),
  };

  // Pre-fetch all customer codes referenced in the file. One query, then
  // map the lookup so we don't N+1 the DB.
  const codeSet = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const code = (rows[i][F.customer_code] ?? "").trim().toUpperCase();
    if (code) codeSet.add(code);
  }
  const { data: custRows } = await supabase
    .from("customers")
    .select("id, code")
    .in("code", Array.from(codeSet));
  const customerByCode = new Map(
    (custRows ?? []).map((c) => [c.code as string, c.id as string])
  );

  // Pre-fetch existing invoice_numbers we'd collide with — bulk insert
  // fails the whole batch otherwise.
  // Chunked so a 10k-row file doesn't blow the URL length on Supabase's
  // REST .in(...) clause (Postgres's IN list cap + URL size limits both
  // bite around 5-10k items).
  const seenNumbers = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const n = (rows[i][F.invoice_number] ?? "").trim();
    if (n) seenNumbers.add(n);
  }
  const existingNumberSet = new Set<string>();
  const numbers = Array.from(seenNumbers);
  const LOOKUP_CHUNK = 500;
  for (let i = 0; i < numbers.length; i += LOOKUP_CHUNK) {
    const chunk = numbers.slice(i, i + LOOKUP_CHUNK);
    const { data: existingNums, error: lookupErr } = await supabase
      .from("invoices")
      .select("invoice_number")
      .in("invoice_number", chunk);
    if (lookupErr) {
      return NextResponse.json(
        {
          error: `Pre-flight duplicate check failed: ${lookupErr.message}`,
        },
        { status: 500 }
      );
    }
    for (const r of existingNums ?? []) {
      existingNumberSet.add(r.invoice_number as string);
    }
  }

  const errors: { row: number; message: string }[] = [];
  const cleaned: PreviewRow[] = [];
  const seenInPayload = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (j: number) => (j >= 0 ? (row[j] ?? "").trim() : "");
    const lineNum = i + 1;

    const code = get(F.customer_code).toUpperCase();
    const invoiceNumber = get(F.invoice_number);
    const issuedDate = get(F.issued_date);
    const totalStr = get(F.total);

    if (!code || !invoiceNumber || !issuedDate || !totalStr) {
      errors.push({
        row: lineNum,
        message:
          "missing required field (customer_code, invoice_number, issued_date, total)",
      });
      continue;
    }
    if (!DATE_RE.test(issuedDate)) {
      errors.push({
        row: lineNum,
        message: `issued_date must be YYYY-MM-DD (got '${issuedDate}')`,
      });
      continue;
    }

    const customerId = customerByCode.get(code);
    if (!customerId) {
      errors.push({
        row: lineNum,
        message: `customer_code '${code}' not found in customers table`,
      });
      continue;
    }

    if (existingNumberSet.has(invoiceNumber)) {
      errors.push({
        row: lineNum,
        message: `invoice_number '${invoiceNumber}' already exists in invoices table`,
      });
      continue;
    }
    if (seenInPayload.has(invoiceNumber)) {
      errors.push({
        row: lineNum,
        message: `duplicate invoice_number '${invoiceNumber}' within this CSV`,
      });
      continue;
    }
    seenInPayload.add(invoiceNumber);

    // Number parsing — empty string → 0.
    const num = (s: string): number => {
      if (s === "") return 0;
      const n = Number(s.replace(/[$,\s]/g, ""));
      return Number.isFinite(n) ? n : NaN;
    };
    const subtotal = num(get(F.subtotal));
    const gst = num(get(F.gst));
    const qst = num(get(F.qst));
    const hst = num(get(F.hst));
    const freight = num(get(F.freight));
    const discount = num(get(F.discount));
    const total = num(totalStr);
    if (
      [subtotal, gst, qst, hst, freight, discount, total].some(
        (n) => Number.isNaN(n)
      )
    ) {
      errors.push({
        row: lineNum,
        message: "one or more numeric columns aren't a valid number",
      });
      continue;
    }
    // Allow total = 0 — legacy data routinely has zero-amount rows
    // (cancellation markers, adjustment placeholders, voided invoices
    // kept for the audit trail). Only negative totals are rejected,
    // since a real credit / refund should be tracked separately rather
    // than imported as a "negative invoice".
    if (total < 0) {
      errors.push({
        row: lineNum,
        message: `total cannot be negative (got ${total}). Refunds / credits should be tracked separately.`,
      });
      continue;
    }

    const dueDateRaw = get(F.due_date);
    const dueDate =
      dueDateRaw && DATE_RE.test(dueDateRaw)
        ? dueDateRaw
        : (() => {
            // Default: issued + 30 days. Computed locally so the import
            // doesn't depend on the customer's payment_terms.
            const [y, m, d] = issuedDate.split("-").map(Number);
            const dt = new Date(Date.UTC(y, m - 1, d));
            dt.setUTCDate(dt.getUTCDate() + 30);
            return dt.toISOString().slice(0, 10);
          })();
    void addDaysMontreal; // imported for parity with creation paths; unused here

    const paidDateRaw = get(F.paid_date);
    const paidDate =
      paidDateRaw && DATE_RE.test(paidDateRaw) ? paidDateRaw : null;

    const statusRaw = get(F.status).toLowerCase() || "paid";
    if (!VALID_STATUSES.has(statusRaw)) {
      errors.push({
        row: lineNum,
        message: `invalid status '${statusRaw}' (must be one of: ${Array.from(
          VALID_STATUSES
        ).join(", ")})`,
      });
      continue;
    }

    const taxRegionRaw = get(F.tax_region).toUpperCase() || "QC";
    if (!TAX_REGIONS.includes(taxRegionRaw as TaxRegion)) {
      errors.push({
        row: lineNum,
        message: `invalid tax_region '${taxRegionRaw}' (must be one of: ${TAX_REGIONS.join(
          ", "
        )})`,
      });
      continue;
    }

    // Currency + FX rate. Default CAD with rate=1; USD requires an
    // explicit rate so the Revenue dashboard can roll the row up to
    // CAD-equivalent without guessing.
    const currencyRaw = get(F.currency).toUpperCase() || "CAD";
    if (currencyRaw !== "CAD" && currencyRaw !== "USD") {
      errors.push({
        row: lineNum,
        message: `invalid currency '${currencyRaw}' (must be CAD or USD)`,
      });
      continue;
    }
    const fxRaw = get(F.fx_rate_to_cad);
    let fxRate = currencyRaw === "CAD" ? 1 : Number(fxRaw);
    if (currencyRaw === "USD") {
      if (!fxRaw || !Number.isFinite(fxRate) || fxRate <= 0) {
        errors.push({
          row: lineNum,
          message:
            "USD rows require a positive fx_rate_to_cad (Bank of Canada rate at issued_date). " +
            "Look up historical rates at https://www.bankofcanada.ca/rates/exchange/.",
        });
        continue;
      }
    } else {
      // CAD row: ignore any supplied rate and lock to 1 so storage stays
      // consistent ("CAD invoice → rate 1" is the invariant).
      fxRate = 1;
    }

    cleaned.push({
      customer_code: code,
      invoice_number: invoiceNumber,
      issued_date: issuedDate,
      due_date: dueDate,
      paid_date: paidDate || (statusRaw === "paid" ? issuedDate : null),
      status: statusRaw,
      tax_region: taxRegionRaw as TaxRegion,
      currency: currencyRaw as "CAD" | "USD",
      fx_rate_to_cad: fxRate,
      subtotal,
      gst,
      qst,
      hst,
      freight,
      discount,
      total,
      legacy_reference: get(F.legacy_reference) || null,
      notes: get(F.notes) || null,
    });
  }

  // Atomic policy: any error → reject the whole import.
  if (errors.length > 0) {
    return NextResponse.json(
      {
        error: `Import rejected — ${errors.length} row(s) failed validation. Fix the file and retry.`,
        errors,
        rows: dryRun ? cleaned : undefined,
      },
      { status: 400 }
    );
  }

  if (dryRun) {
    // Per-currency totals + a single CAD-equivalent so the operator sees
    // what their books will look like before they commit. CAD-equivalent
    // = sum(total × fx_rate_to_cad), so USD rows are converted using the
    // rate they supplied for that row.
    const totalsByCurrency: Record<string, number> = { CAD: 0, USD: 0 };
    let cadEquivalent = 0;
    for (const r of cleaned) {
      totalsByCurrency[r.currency] =
        (totalsByCurrency[r.currency] ?? 0) + r.total;
      cadEquivalent += r.total * r.fx_rate_to_cad;
    }
    return NextResponse.json({
      dry_run: true,
      rows: cleaned,
      total_rows: cleaned.length,
      total_invoiced_cad:
        Math.round(totalsByCurrency.CAD * 100) / 100,
      total_invoiced_usd:
        Math.round(totalsByCurrency.USD * 100) / 100,
      total_cad_equivalent: Math.round(cadEquivalent * 100) / 100,
      rows_cad: cleaned.filter((r) => r.currency === "CAD").length,
      rows_usd: cleaned.filter((r) => r.currency === "USD").length,
    });
  }

  // ── Commit ──
  const insertPayload = cleaned.map((r) => ({
    invoice_number: r.invoice_number,
    customer_id: customerByCode.get(r.customer_code),
    job_id: null,
    subtotal: r.subtotal,
    discount: r.discount,
    tps_gst: r.gst,
    tvq_qst: r.qst,
    hst: r.hst,
    freight: r.freight,
    total: r.total,
    status: r.status,
    issued_date: r.issued_date,
    due_date: r.due_date,
    paid_date: r.paid_date,
    notes: r.notes,
    currency: r.currency,
    fx_rate_to_cad: r.fx_rate_to_cad,
    tax_region: r.tax_region,
    is_historic: true,
    legacy_reference: r.legacy_reference,
  }));

  // Chunked insert. Supabase's POST body has a practical limit and very
  // large array inserts can also trigger statement-timeout server-side.
  // 500 rows per batch is comfortably under both ceilings.
  const INSERT_CHUNK = 500;
  const insertedNumbers: string[] = [];
  for (let i = 0; i < insertPayload.length; i += INSERT_CHUNK) {
    const chunk = insertPayload.slice(i, i + INSERT_CHUNK);
    const { data: inserted, error: insErr } = await supabase
      .from("invoices")
      .insert(chunk)
      .select("invoice_number");
    if (insErr) {
      return NextResponse.json(
        {
          error:
            `Insert failed at row ${i + 1} of ${insertPayload.length}: ` +
            (insErr.message ?? "unknown error") +
            (insertedNumbers.length > 0
              ? `. NOTE: ${insertedNumbers.length} earlier rows were already committed and remain in the database. Re-run the import with the remaining rows in a fresh CSV.`
              : ""),
        },
        { status: 500 }
      );
    }
    for (const r of inserted ?? []) {
      insertedNumbers.push(r.invoice_number as string);
    }
  }

  return NextResponse.json({
    dry_run: false,
    inserted: insertedNumbers.length,
    invoice_numbers: insertedNumbers,
  });
}
