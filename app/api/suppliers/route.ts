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

// GET /api/suppliers
//   ?approved=true          â†’ only approved suppliers
//   ?category=distributor   â†’ filter by category
// Read access: admin (enforced by RLS).
export async function GET(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const approved = sp.get("approved");
  const category = sp.get("category");
  const onlineOnly = sp.get("online_only");

  let query = supabase
    .from("suppliers")
    .select(
      `id, code, legal_name, category, default_currency, payment_terms,
       billing_address, is_approved, online_only, notes, created_at, updated_at`
    )
    .order("code");

  if (approved === "true") query = query.eq("is_approved", true);
  if (approved === "false") query = query.eq("is_approved", false);
  if (category) query = query.eq("category", category);
  if (onlineOnly === "true") query = query.eq("online_only", true);
  if (onlineOnly === "false") query = query.eq("online_only", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach contact_count for each supplier (small N â€” one extra query is fine).
  const ids = (data ?? []).map((s) => s.id);
  let contactCounts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: contacts } = await supabase
      .from("supplier_contacts")
      .select("supplier_id")
      .in("supplier_id", ids);
    contactCounts = (contacts ?? []).reduce((acc, row) => {
      acc.set(row.supplier_id, (acc.get(row.supplier_id) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
  }

  const enriched = (data ?? []).map((s) => ({
    ...s,
    contact_count: contactCounts.get(s.id) ?? 0,
  }));

  return NextResponse.json(enriched);
}

// POST /api/suppliers â€” create (admin only). Suppliers start with is_approved=false.
export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Only an admin can create suppliers." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const code = String(body.code ?? "").toUpperCase().trim();
  const legal_name = String(body.legal_name ?? "").trim();
  const category = body.category as SupplierCategory | null | undefined;
  const default_currency = (body.default_currency as SupplierCurrency | undefined) ?? "CAD";
  // payment_terms is now TEXT[] (migration 078). Accept either an array
  // (preferred) or a single string for backward-compat with anything still
  // sending the old shape.
  let payment_terms: string[] | null = null;
  if (Array.isArray(body.payment_terms)) {
    payment_terms = (body.payment_terms as unknown[])
      .map((v) => String(v ?? "").trim())
      .filter((s) => s.length > 0);
    if (payment_terms.length === 0) payment_terms = null;
  } else if (body.payment_terms != null && body.payment_terms !== "") {
    const s = String(body.payment_terms).trim();
    payment_terms = s ? [s] : null;
  }
  const billing_address = body.billing_address ?? {};
  const online_only = !!body.online_only;
  const notes = body.notes ? String(body.notes) : null;

  if (!SUPPLIER_CODE_REGEX.test(code)) {
    return NextResponse.json(
      { error: "Code must be 2-15 uppercase letters/digits (A-Z, 0-9)." },
      { status: 400 }
    );
  }
  if (!legal_name) {
    return NextResponse.json({ error: "legal_name is required" }, { status: 400 });
  }
  if (category && !SUPPLIER_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (!SUPPLIER_CURRENCIES.includes(default_currency)) {
    return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
  }

  // Check duplicate code first for a friendlier error.
  const { data: existing } = await supabase
    .from("suppliers")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `Supplier code "${code}" already exists` }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      code,
      legal_name,
      category: category ?? null,
      default_currency,
      payment_terms,
      billing_address,
      online_only,
      notes,
      is_approved: false,
      created_by: user.id,
    })
    .select("id, code, legal_name, is_approved")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
