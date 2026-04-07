import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const {
    bom_config, contacts, billing_addresses, shipping_addresses,
    company_name, payment_terms, notes, is_active,
  } = body;

  // Build update payload — only include fields that were sent
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (bom_config !== undefined) updates.bom_config = bom_config;
  if (contacts !== undefined) {
    updates.contacts = contacts;
    // Keep legacy columns in sync with primary contact
    const primary = contacts.find((c: Record<string, unknown>) => c.is_primary) ?? contacts[0];
    if (primary) {
      updates.contact_name = primary.name || null;
      updates.contact_email = primary.email || null;
      updates.contact_phone = primary.phone || null;
    }
  }
  if (billing_addresses !== undefined) updates.billing_addresses = billing_addresses;
  if (shipping_addresses !== undefined) updates.shipping_addresses = shipping_addresses;
  if (company_name !== undefined) updates.company_name = company_name;
  if (payment_terms !== undefined) updates.payment_terms = payment_terms;
  if (notes !== undefined) updates.notes = notes;
  if (is_active !== undefined) updates.is_active = is_active;

  const { error } = await supabase
    .from("customers")
    .update(updates)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
