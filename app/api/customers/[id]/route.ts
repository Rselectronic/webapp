import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// DELETE /api/customers/[id] — Deactivate (soft delete) or hard-delete a customer
//   ?force=true  → hard delete (CEO only, blocked if references exist)
//   default      → soft delete (set is_active = false)
// ---------------------------------------------------------------------------
export async function DELETE(
  req: NextRequest,
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
    return NextResponse.json(
      { error: "Only the CEO can delete customers." },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const force = req.nextUrl.searchParams.get("force") === "true";

  // Check the customer exists
  const { data: customer } = await admin
    .from("customers")
    .select("id, company_name")
    .eq("id", id)
    .single();
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // Check referential integrity — quotes, jobs, BOMs
  const [quotesRes, jobsRes, bomsRes] = await Promise.all([
    admin
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", id),
    admin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", id),
    admin
      .from("boms")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", id),
  ]);

  const quoteCount = quotesRes.count ?? 0;
  const jobCount = jobsRes.count ?? 0;
  const bomCount = bomsRes.count ?? 0;
  const hasReferences = quoteCount > 0 || jobCount > 0 || bomCount > 0;

  // Hard delete path
  if (force) {
    if (hasReferences) {
      return NextResponse.json(
        {
          error: `Cannot hard-delete — customer has ${quoteCount} quote(s), ${jobCount} job(s), and ${bomCount} BOM(s). Remove those first or use soft delete.`,
        },
        { status: 409 }
      );
    }

    // Delete GMPs first (they reference the customer)
    await admin.from("gmps").delete().eq("customer_id", id);

    const { error } = await admin.from("customers").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, deleted: id, mode: "hard" });
  }

  // Soft delete — set is_active = false
  const { error } = await admin
    .from("customers")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, deactivated: id, mode: "soft" });
}

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
