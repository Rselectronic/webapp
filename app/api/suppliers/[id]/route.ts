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

// GET /api/suppliers/[id] â€” full supplier detail with contacts.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: supplier, error } = await supabase
    .from("suppliers")
    .select(
      `id, code, legal_name, category, default_currency, payment_terms,
       billing_address, is_approved, online_only, notes, created_at, updated_at`
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  const { data: contacts } = await supabase
    .from("supplier_contacts")
    .select("id, supplier_id, name, email, phone, title, is_primary, notes, created_at, updated_at")
    .eq("supplier_id", id)
    .order("is_primary", { ascending: false })
    .order("name");

  return NextResponse.json({ supplier, contacts: contacts ?? [] });
}

// PATCH /api/suppliers/[id] â€” admin only. Updates editable fields.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Only an admin can edit suppliers." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.code !== undefined) {
    const code = String(body.code).toUpperCase().trim();
    if (!SUPPLIER_CODE_REGEX.test(code)) {
      return NextResponse.json(
        { error: "Code must be 2-15 uppercase letters/digits (A-Z, 0-9)." },
        { status: 400 }
      );
    }
    updates.code = code;
  }
  if (body.legal_name !== undefined) {
    const legal = String(body.legal_name).trim();
    if (!legal) return NextResponse.json({ error: "legal_name cannot be empty" }, { status: 400 });
    updates.legal_name = legal;
  }
  if (body.category !== undefined) {
    const cat = body.category as SupplierCategory | null;
    if (cat !== null && !SUPPLIER_CATEGORIES.includes(cat)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    updates.category = cat;
  }
  if (body.default_currency !== undefined) {
    const cur = body.default_currency as SupplierCurrency;
    if (!SUPPLIER_CURRENCIES.includes(cur)) {
      return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
    }
    updates.default_currency = cur;
  }
  if (body.payment_terms !== undefined) {
    // Accept either an array (canonical) or a single string (legacy).
    if (Array.isArray(body.payment_terms)) {
      const arr = (body.payment_terms as unknown[])
        .map((v) => String(v ?? "").trim())
        .filter((s) => s.length > 0);
      updates.payment_terms = arr.length > 0 ? arr : null;
    } else if (body.payment_terms == null || body.payment_terms === "") {
      updates.payment_terms = null;
    } else {
      const s = String(body.payment_terms).trim();
      updates.payment_terms = s ? [s] : null;
    }
  }
  if (body.billing_address !== undefined) updates.billing_address = body.billing_address ?? {};
  if (body.notes !== undefined) updates.notes = body.notes || null;
  if (body.is_approved !== undefined) updates.is_approved = !!body.is_approved;
  if (body.online_only !== undefined) updates.online_only = !!body.online_only;

  const { error } = await supabase.from("suppliers").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// DELETE /api/suppliers/[id] â€” admin only. Blocks delete if referenced by supplier_pos.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Only an admin can delete suppliers." }, { status: 403 });
  }

  // Block delete if any supplier_pos OR supplier_quote references this supplier.
  const { data: refPos } = await supabase
    .from("supplier_pos")
    .select("id, po_number")
    .eq("supplier_id", id)
    .limit(5);
  if ((refPos ?? []).length > 0) {
    return NextResponse.json(
      {
        error:
          `Cannot delete â€” ${refPos!.length}+ purchase order(s) reference this supplier. ` +
          `Reassign or delete those POs first.`,
        blocking_pos: refPos,
      },
      { status: 409 }
    );
  }
  const { data: refQuotes } = await supabase
    .from("supplier_quotes")
    .select("id, status")
    .eq("supplier_id", id)
    .limit(5);
  if ((refQuotes ?? []).length > 0) {
    return NextResponse.json(
      {
        error:
          `Cannot delete â€” ${refQuotes!.length}+ supplier quote(s) reference this supplier. ` +
          `Reject or delete those quotes first.`,
        blocking_quotes: refQuotes,
      },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, deleted: id });
}
