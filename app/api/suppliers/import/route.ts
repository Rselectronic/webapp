import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import {
  SUPPLIER_CATEGORIES,
  SUPPLIER_CURRENCIES,
  SUPPLIER_CODE_REGEX,
  type SupplierCategory,
  type SupplierCurrency,
} from "@/lib/suppliers/types";

// =============================================================================
// POST /api/suppliers/import â€” bulk import suppliers (admin only).
//
// Each row creates one supplier. If the row carries contact_name/email/phone/
// title, a single primary contact is created alongside it. Multi-contact
// imports go via the supplier detail page after import.
//
// Suppliers start with is_approved=false UNLESS the row explicitly says
// is_approved=true â€” in line with the rule that all imports require an
// explicit approval flag (matches the manual create flow).
//
// Responds with a per-row status array so the client can show "5 created,
// 2 skipped (duplicates), 1 invalid".
// =============================================================================

interface ImportRow {
  code?: unknown;
  legal_name?: unknown;
  category?: unknown;
  default_currency?: unknown;
  payment_terms?: unknown;
  // Address fields â€” flat for CSV friendliness.
  address_line1?: unknown;
  address_line2?: unknown;
  city?: unknown;
  state_province?: unknown;
  postal_code?: unknown;
  country?: unknown;
  // Boolean-ish flags. We accept "true"/"false"/"yes"/"no"/1/0/true/false.
  is_approved?: unknown;
  online_only?: unknown;
  notes?: unknown;
  // Optional primary contact.
  contact_name?: unknown;
  contact_email?: unknown;
  contact_phone?: unknown;
  contact_title?: unknown;
}

interface RowResult {
  row: number; // 1-based row index for user-facing reporting
  code: string;
  status: "created" | "updated" | "skipped" | "error";
  message?: string;
  supplier_id?: string;
}

// "import" â†’ insert-only, skip rows whose code already exists.
// "upsert" â†’ insert new codes, update existing ones in place. Existing
// supplier_contacts are preserved untouched; an incoming contact row only
// adds a new contact if no contact with the same name already exists.
type ImportMode = "import" | "upsert";

function parseBool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "yes", "y", "1"].includes(s)) return true;
    if (["false", "no", "n", "0", ""].includes(s)) return false;
  }
  return fallback;
}

function asStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json(
      { error: "Only an admin can import suppliers." },
      { status: 403 }
    );
  }

  let body: { rows?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? (body.rows as ImportRow[]) : null;
  if (!rows || rows.length === 0) {
    return NextResponse.json(
      { error: "Body must include a non-empty `rows` array" },
      { status: 400 }
    );
  }
  if (rows.length > 500) {
    return NextResponse.json(
      { error: "Imports are capped at 500 rows per request" },
      { status: 400 }
    );
  }

  const mode: ImportMode =
    body.mode === "upsert" ? "upsert" : "import";

  // Pre-fetch every existing supplier (id + code) so we can detect
  // duplicates and look up ids for the upsert path without per-row
  // roundtrips. We also de-dupe within the incoming batch.
  const { data: existing } = await supabase
    .from("suppliers")
    .select("id, code");
  const existingByCode = new Map<string, string>(); // CODE -> id
  for (const r of existing ?? []) {
    if (r.code) existingByCode.set(String(r.code).toUpperCase(), r.id);
  }
  const seenInBatch = new Set<string>();

  const results: RowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1;
    const codeRaw = asStr(r.code).toUpperCase();
    const legalName = asStr(r.legal_name);

    // Validation
    if (!codeRaw) {
      results.push({ row: rowNum, code: "", status: "error", message: "Missing code" });
      continue;
    }
    if (!SUPPLIER_CODE_REGEX.test(codeRaw)) {
      results.push({
        row: rowNum,
        code: codeRaw,
        status: "error",
        message: "Code must be 2-15 uppercase letters/digits (A-Z, 0-9)",
      });
      continue;
    }
    if (!legalName) {
      results.push({
        row: rowNum,
        code: codeRaw,
        status: "error",
        message: "Missing legal_name",
      });
      continue;
    }
    if (seenInBatch.has(codeRaw)) {
      results.push({
        row: rowNum,
        code: codeRaw,
        status: "skipped",
        message: "Duplicate code earlier in this import",
      });
      continue;
    }
    seenInBatch.add(codeRaw);

    const existingId = existingByCode.get(codeRaw);
    // Insert-only mode: if the code already exists in the DB, skip the row.
    // Upsert mode: fall through and update.
    if (existingId && mode === "import") {
      results.push({
        row: rowNum,
        code: codeRaw,
        status: "skipped",
        message: "Code already exists in the system",
      });
      continue;
    }

    // Optional fields with validation.
    const categoryRaw = asStr(r.category).toLowerCase();
    let category: SupplierCategory | null = null;
    if (categoryRaw) {
      if (!SUPPLIER_CATEGORIES.includes(categoryRaw as SupplierCategory)) {
        results.push({
          row: rowNum,
          code: codeRaw,
          status: "error",
          message: `Invalid category "${categoryRaw}". Allowed: ${SUPPLIER_CATEGORIES.join(", ")}`,
        });
        continue;
      }
      category = categoryRaw as SupplierCategory;
    }

    const currencyRaw = asStr(r.default_currency).toUpperCase() || "CAD";
    if (!SUPPLIER_CURRENCIES.includes(currencyRaw as SupplierCurrency)) {
      results.push({
        row: rowNum,
        code: codeRaw,
        status: "error",
        message: `Invalid default_currency "${currencyRaw}". Allowed: ${SUPPLIER_CURRENCIES.join(", ")}`,
      });
      continue;
    }
    const default_currency = currencyRaw as SupplierCurrency;

    // Build the address JSONB â€” drop empty keys so the JSONB doesn't carry
    // a forest of "" values that just clutter the UI.
    const addr: Record<string, string> = {};
    const setIf = (k: string, v: string) => {
      if (v) addr[k] = v;
    };
    setIf("line1", asStr(r.address_line1));
    setIf("line2", asStr(r.address_line2));
    setIf("city", asStr(r.city));
    setIf("state_province", asStr(r.state_province));
    setIf("postal_code", asStr(r.postal_code));
    setIf("country", asStr(r.country));

    // payment_terms is TEXT[] (multi-value). Operators paste a comma- or
    // pipe-separated string in the CSV cell ("Credit Card, Net 30") and
    // we split into an array. Empty cell â†’ NULL.
    const paymentTermsArr = (() => {
      const raw = asStr(r.payment_terms);
      if (!raw) return null;
      const parts = raw
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return parts.length > 0 ? parts : null;
    })();

    const corePayload = {
      legal_name: legalName,
      category,
      default_currency,
      payment_terms: paymentTermsArr,
      billing_address: addr,
      is_approved: parseBool(r.is_approved, false),
      online_only: parseBool(r.online_only, false),
      notes: asStr(r.notes) || null,
    };

    let supplierId: string | null = null;
    let actionTaken: "created" | "updated" = "created";

    if (!existingId) {
      // ---- INSERT (new code) ----
      const { data: inserted, error: insErr } = await supabase
        .from("suppliers")
        .insert({ ...corePayload, code: codeRaw, created_by: user.id })
        .select("id, code")
        .single();
      if (insErr || !inserted) {
        results.push({
          row: rowNum,
          code: codeRaw,
          status: "error",
          message: insErr?.message ?? "Insert failed",
        });
        continue;
      }
      supplierId = inserted.id;
      existingByCode.set(codeRaw, inserted.id);
    } else {
      // ---- UPDATE (existing code, upsert mode) ----
      // We matched on code, so don't change it. Bump updated_at so the
      // listings re-sort. is_approved / online_only ARE overwritten with
      // the CSV's value (parseBool defaults to false): upsert is meant to
      // bring the row into alignment with the CSV.
      const { error: updErr } = await supabase
        .from("suppliers")
        .update({ ...corePayload, updated_at: new Date().toISOString() })
        .eq("id", existingId);
      if (updErr) {
        results.push({
          row: rowNum,
          code: codeRaw,
          status: "error",
          message: updErr.message,
        });
        continue;
      }
      supplierId = existingId;
      actionTaken = "updated";
    }

    // ---- Optional contact ----
    // Same rule for both modes: if contact_name is given, insert a new
    // contact unless one with the same name already exists. We never
    // overwrite or delete existing contacts via import â€” operators
    // curate them in the supplier detail page.
    const contactName = asStr(r.contact_name);
    let contactWarning: string | null = null;
    if (contactName && supplierId) {
      const { data: existingContacts } = await supabase
        .from("supplier_contacts")
        .select("id, name, is_primary")
        .eq("supplier_id", supplierId);
      const dupName = (existingContacts ?? []).find(
        (c) => (c.name ?? "").toLowerCase() === contactName.toLowerCase()
      );
      if (dupName) {
        contactWarning = `Contact "${contactName}" already exists, skipped`;
      } else {
        const hasPrimary = (existingContacts ?? []).some((c) => c.is_primary);
        const { error: contactErr } = await supabase
          .from("supplier_contacts")
          .insert({
            supplier_id: supplierId,
            name: contactName,
            email: asStr(r.contact_email) || null,
            phone: asStr(r.contact_phone) || null,
            title: asStr(r.contact_title) || null,
            // Mark primary only if the supplier has no primary yet.
            is_primary: !hasPrimary,
          });
        if (contactErr) {
          contactWarning = `contact insert failed: ${contactErr.message}`;
        }
      }
    }

    results.push({
      row: rowNum,
      code: codeRaw,
      status: actionTaken,
      supplier_id: supplierId ?? undefined,
      message: contactWarning ?? undefined,
    });
  }

  const createdCount = results.filter((r) => r.status === "created").length;
  const updatedCount = results.filter((r) => r.status === "updated").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  return NextResponse.json({
    mode,
    summary: {
      total: rows.length,
      created: createdCount,
      updated: updatedCount,
      skipped: skippedCount,
      errors: errorCount,
    },
    results,
  });
}
