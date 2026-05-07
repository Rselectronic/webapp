import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import {
  SUPPLIER_CURRENCIES,
  type SupplierCurrency,
} from "@/lib/suppliers/types";

// ============================================================================
// /api/quotes-supplier/[id] â€” GET / PATCH / DELETE for a single supplier quote.
// ============================================================================

interface IncomingLine {
  procurement_line_id: string;
  qty: number;
  unit_price: number;
  notes?: string | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// GET â€” full quote with lines + supplier + contact + procurement.
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

  const { data: quote, error } = await supabase
    .from("supplier_quotes")
    .select(
      `id, procurement_id, supplier_id, supplier_contact_id, currency, status,
       subtotal, shipping, tax, total, valid_until, notes,
       requested_at, received_at, accepted_at, accepted_by, resulting_po_id,
       created_at, updated_at, created_by,
       suppliers(id, code, legal_name, online_only, default_currency, billing_address),
       supplier_contacts(id, name, email, phone),
       procurements(id, proc_code)`
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  const { data: lines } = await supabase
    .from("supplier_quote_lines")
    .select(
      `id, procurement_line_id, qty, unit_price, line_total, notes, created_at,
       procurement_lines(id, mpn, description, m_code, qty_needed, qty_extra, unit_price)`
    )
    .eq("supplier_quote_id", id);

  return NextResponse.json({ quote, lines: lines ?? [] });
}

// PATCH â€” edit lines/supplier/currency/totals while NOT yet accepted.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: existing, error: loadErr } = await supabase
    .from("supplier_quotes")
    .select("id, procurement_id, status, currency, shipping, tax")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  if (existing.status === "accepted") {
    return NextResponse.json(
      { error: "Cannot edit a quote that has been accepted." },
      { status: 409 }
    );
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.supplier_id !== undefined) {
    const sid = String(body.supplier_id);
    const { data: sup } = await supabase
      .from("suppliers")
      .select("id, is_approved, online_only")
      .eq("id", sid)
      .maybeSingle();
    if (!sup) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    if (!sup.is_approved) {
      return NextResponse.json({ error: "Supplier is not approved" }, { status: 400 });
    }
    if (sup.online_only) {
      return NextResponse.json(
        { error: "Online-only suppliers cannot be used in the quote flow." },
        { status: 400 }
      );
    }
    updates.supplier_id = sid;
    // Supplier change clears stale contact ref.
    if (body.supplier_contact_id === undefined) updates.supplier_contact_id = null;
  }
  if (body.supplier_contact_id !== undefined) {
    updates.supplier_contact_id = body.supplier_contact_id || null;
  }
  if (body.currency !== undefined) {
    const cur = body.currency as SupplierCurrency;
    if (!SUPPLIER_CURRENCIES.includes(cur)) {
      return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
    }
    updates.currency = cur;
  }
  if (body.valid_until !== undefined) updates.valid_until = body.valid_until || null;
  if (body.notes !== undefined) updates.notes = body.notes || null;

  let shippingNum: number | undefined;
  let taxNum: number | undefined;
  if (body.shipping !== undefined) {
    shippingNum = round2(Number(body.shipping) || 0);
    updates.shipping = shippingNum;
  }
  if (body.tax !== undefined) {
    taxNum = round2(Number(body.tax) || 0);
    updates.tax = taxNum;
  }

  // If lines are being replaced, do that first then recompute totals.
  let newSubtotal: number | null = null;
  if (Array.isArray(body.lines)) {
    const incoming = body.lines as IncomingLine[];
    if (incoming.length === 0) {
      return NextResponse.json({ error: "At least one line required" }, { status: 400 });
    }
    // Validate that every line still belongs to the quote's PROC.
    const lineIds = incoming.map((l) => l.procurement_line_id);
    const { data: procLines } = await supabase
      .from("procurement_lines")
      .select("id, procurement_id")
      .in("id", lineIds);
    for (const pl of procLines ?? []) {
      if (pl.procurement_id !== existing.procurement_id) {
        return NextResponse.json(
          { error: "All lines must belong to this quote's PROC" },
          { status: 400 }
        );
      }
    }
    if ((procLines ?? []).length !== lineIds.length) {
      return NextResponse.json(
        { error: "One or more procurement_line_ids are invalid" },
        { status: 400 }
      );
    }

    const computed = incoming.map((l) => {
      const qty = Math.max(1, Math.floor(Number(l.qty)));
      const unit = Number(l.unit_price);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error("qty must be a positive integer");
      }
      if (!Number.isFinite(unit) || unit < 0) {
        throw new Error("unit_price must be >= 0");
      }
      return {
        supplier_quote_id: id,
        procurement_line_id: l.procurement_line_id,
        qty,
        unit_price: unit,
        line_total: round2(qty * unit),
        notes: l.notes ?? null,
      };
    });
    newSubtotal = round2(computed.reduce((s, l) => s + l.line_total, 0));

    // Replace all lines (delete + insert).
    const { error: delErr } = await supabase
      .from("supplier_quote_lines")
      .delete()
      .eq("supplier_quote_id", id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    const { error: insErr } = await supabase
      .from("supplier_quote_lines")
      .insert(computed);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // If totals need recomputing (shipping/tax changed OR lines replaced), do it.
  const wantsTotalsRecompute =
    newSubtotal !== null ||
    body.shipping !== undefined ||
    body.tax !== undefined;
  if (wantsTotalsRecompute) {
    let subtotal = newSubtotal;
    if (subtotal === null) {
      const { data: lineRows } = await supabase
        .from("supplier_quote_lines")
        .select("line_total")
        .eq("supplier_quote_id", id);
      subtotal = round2(
        (lineRows ?? []).reduce((s, r) => s + Number(r.line_total ?? 0), 0)
      );
    }
    const ship = shippingNum ?? Number(existing.shipping ?? 0);
    const tx = taxNum ?? Number(existing.tax ?? 0);
    updates.subtotal = subtotal;
    updates.total = round2(subtotal + ship + tx);
  }

  const { error: updErr } = await supabase
    .from("supplier_quotes")
    .update(updates)
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// DELETE â€” only if not accepted.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: q } = await supabase
    .from("supplier_quotes")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (!q) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  if (q.status === "accepted") {
    return NextResponse.json(
      { error: "Cannot delete an accepted quote â€” delete the resulting PO first." },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("supplier_quotes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
