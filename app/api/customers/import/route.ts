import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
interface AddressEntry {
  label?: string;
  is_default?: boolean;
  street?: string;
  // `line1` is a legacy alias from an earlier wizard build â€” coerced to
  // `street` in normalizeAddresses() so saved data matches the customer-edit
  // form's expected shape.
  line1?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
}

interface ContactEntry {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  is_primary?: boolean;
}

interface InRow {
  code?: string;
  company_name?: string;
  folder_name?: string;
  // New array shape (preferred)
  contacts?: ContactEntry[];
  billing_addresses?: AddressEntry[];
  shipping_addresses?: AddressEntry[];
  // Legacy single-field shapes (back-compat â€” wrapped into arrays)
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  billing_address?: Record<string, string>;
  shipping_address?: Record<string, string>;
  payment_terms?: string;
  notes?: string;
}

interface CleanRow {
  code: string;
  company_name: string;
  folder_name: string | null;
  contacts: ContactEntry[];
  billing_addresses: AddressEntry[];
  shipping_addresses: AddressEntry[];
  payment_terms: string;
  notes: string | null;
  is_active: true;
  created_by?: string | null;
}

const t = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const nz = (s: string): string | null => (s.length > 0 ? s : null);

// Normalize address arrays; fall back to legacy single object if no array provided.
function normalizeAddresses(
  arr: AddressEntry[] | undefined,
  legacy: Record<string, string> | undefined,
): AddressEntry[] {
  if (Array.isArray(arr)) {
    const cleaned = arr.filter((e) => e && typeof e === "object");
    const anyDefault = cleaned.some((e) => e.is_default === true);
    return cleaned.map((e, i) => {
      // Coerce legacy `line1` â†’ `street` so the customer edit form (which
      // reads `street`) shows the value. Strip the legacy key from the saved
      // payload to keep one source of truth.
      const street = e.street && e.street.length > 0 ? e.street : e.line1;
      const { line1: _line1, ...rest } = e;
      void _line1;
      return {
        ...rest,
        ...(street ? { street } : {}),
        label: e.label && e.label.length > 0 ? e.label : "Primary",
        is_default: anyDefault ? !!e.is_default : i === 0,
      };
    });
  }
  if (legacy && typeof legacy === "object" && Object.keys(legacy).length > 0) {
    const { line1, ...rest } = legacy as Record<string, string>;
    const street = (rest as { street?: string }).street ?? line1;
    return [{
      label: "Primary",
      is_default: true,
      ...rest,
      ...(street ? { street } : {}),
    }];
  }
  return [];
}

// Normalize contact arrays; fall back to legacy contact_name/email/phone if no array.
// First entry gets is_primary=true if none flagged. Drops fully-empty entries.
function normalizeContacts(
  arr: ContactEntry[] | undefined,
  legacyName: string | undefined,
  legacyEmail: string | undefined,
  legacyPhone: string | undefined,
): ContactEntry[] {
  if (Array.isArray(arr)) {
    const cleaned = arr
      .filter((e) => e && typeof e === "object")
      .filter((e) => t(e.name) || t(e.email) || t(e.phone));
    const anyPrimary = cleaned.some((e) => e.is_primary === true);
    return cleaned.map((e, i) => ({
      ...e,
      is_primary: anyPrimary ? !!e.is_primary : i === 0,
    }));
  }
  const n = t(legacyName);
  const em = t(legacyEmail);
  const p = t(legacyPhone);
  if (!n && !em && !p) return [];
  const c: ContactEntry = { is_primary: true };
  if (n) c.name = n;
  if (em) c.email = em;
  if (p) c.phone = p;
  return [c];
}

export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { rows: InRow[]; mode: "insert" | "upsert" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mode = body.mode === "upsert" ? "upsert" : "insert";
  const inRows = Array.isArray(body.rows) ? body.rows : [];

  const errors: { index: number; message: string }[] = [];
  const clean: CleanRow[] = [];
  let preSkipped = 0;

  inRows.forEach((r, i) => {
    const code = t(r.code).toUpperCase();
    const company = t(r.company_name);
    if (!code || !company) {
      preSkipped++;
      errors.push({ index: i, message: "Missing required code or company_name" });
      return;
    }
    clean.push({
      code,
      company_name: company,
      folder_name: nz(t(r.folder_name)),
      contacts: normalizeContacts(r.contacts, r.contact_name, r.contact_email, r.contact_phone),
      billing_addresses: normalizeAddresses(r.billing_addresses, r.billing_address),
      shipping_addresses: normalizeAddresses(r.shipping_addresses, r.shipping_address),
      payment_terms: t(r.payment_terms) || "Net 30",
      notes: nz(t(r.notes)),
      is_active: true,
      created_by: user.id ?? null,
    });
  });

  // Dedupe within payload (defensive â€” wizard already aggregates by code).
  const seen = new Set<string>();
  const deduped: CleanRow[] = [];
  for (const row of clean) {
    if (seen.has(row.code)) {
      preSkipped++;
      errors.push({ index: -1, message: `Duplicate code in payload: ${row.code}` });
      continue;
    }
    seen.add(row.code);
    deduped.push(row);
  }

  if (deduped.length === 0) {
    return NextResponse.json({ inserted: 0, updated: 0, skipped: preSkipped, errors });
  }

  const codes = deduped.map((r) => r.code);
  const { data: existingRows, error: existErr } = await supabase
    .from("customers")
    .select("code")
    .in("code", codes);
  if (existErr) {
    return NextResponse.json({ error: existErr.message }, { status: 500 });
  }
  const existingSet = new Set((existingRows ?? []).map((r) => r.code));

  let inserted = 0;
  let updated = 0;
  let skipped = preSkipped;

  if (mode === "insert") {
    const toInsert = deduped.filter((r) => !existingSet.has(r.code));
    skipped += deduped.length - toInsert.length;
    if (toInsert.length > 0) {
      const { data, error } = await supabase
        .from("customers")
        .insert(toInsert)
        .select("code");
      if (error) {
        return NextResponse.json({ error: error.message, errors }, { status: 500 });
      }
      inserted = data?.length ?? 0;
      const insertedSet = new Set((data ?? []).map((r) => r.code));
      for (const r of toInsert) {
        if (!insertedSet.has(r.code)) {
          skipped++;
          errors.push({ index: -1, message: `Insert failed silently for ${r.code}` });
        }
      }
    }
  } else {
    const { error } = await supabase
      .from("customers")
      .upsert(deduped, { onConflict: "code" });
    if (error) {
      return NextResponse.json({ error: error.message, errors }, { status: 500 });
    }
    for (const r of deduped) {
      if (existingSet.has(r.code)) updated++;
      else inserted++;
    }
  }

  return NextResponse.json({ inserted, updated, skipped, errors });
}
