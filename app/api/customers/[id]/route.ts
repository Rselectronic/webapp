import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import { TAX_REGIONS, type TaxRegion } from "@/lib/tax/regions";
// ---------------------------------------------------------------------------
// GET /api/customers/[id] â€” Fetch full customer detail
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("customers")
    .select(
      `id, code, company_name, contact_name, contact_email, contact_phone,
       contacts, billing_addresses, shipping_addresses,
       payment_terms, bom_config, notes, is_active, created_at, updated_at,
       default_currency, tax_region, folder_name`
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}

// ---------------------------------------------------------------------------
// DELETE /api/customers/[id] â€” Deactivate (soft delete) or hard-delete a customer
//   ?force=true  â†’ hard delete (CEO only, blocked if references exist)
//   default      â†’ soft delete (set is_active = false)
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
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json(
      { error: "Only an admin can delete customers." },
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

  // Check referential integrity â€” quotes, jobs, BOMs
  const [quotesRes, jobsRes, bomsRes] = await Promise.all([
    admin
      .from("quotes")
      .select("id, quote_number")
      .eq("customer_id", id)
      .limit(5),
    admin
      .from("jobs")
      .select("id, job_number")
      .eq("customer_id", id)
      .limit(5),
    admin
      .from("boms")
      .select("id, file_name")
      .eq("customer_id", id)
      .limit(5),
  ]);

  const blockingQuotes = quotesRes.data ?? [];
  const blockingJobs = jobsRes.data ?? [];
  const blockingBoms = bomsRes.data ?? [];
  const hasReferences = blockingQuotes.length > 0 || blockingJobs.length > 0 || blockingBoms.length > 0;

  // Hard delete path
  if (force) {
    if (hasReferences) {
      const parts: string[] = [];
      if (blockingQuotes.length > 0) parts.push(`${blockingQuotes.length} quote(s)`);
      if (blockingJobs.length > 0) parts.push(`${blockingJobs.length} job(s)`);
      if (blockingBoms.length > 0) parts.push(`${blockingBoms.length} BOM(s)`);

      return NextResponse.json(
        {
          error: `Cannot hard-delete â€” customer has ${parts.join(", ")}. Remove those first or use soft delete.`,
          blocking: {
            quotes: blockingQuotes,
            jobs: blockingJobs,
            boms: blockingBoms,
          },
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

  // Soft delete â€” set is_active = false
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
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const {
    bom_config, contacts, billing_addresses, shipping_addresses,
    company_name, payment_terms, notes, is_active,
    default_currency, tax_region, folder_name,
  } = body;

  // Build update payload â€” only include fields that were sent
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
  if (default_currency !== undefined) {
    updates.default_currency = default_currency === "USD" ? "USD" : "CAD";
  }
  if (tax_region !== undefined) {
    updates.tax_region = TAX_REGIONS.includes(tax_region as TaxRegion)
      ? tax_region
      : "QC";
  }
  if (folder_name !== undefined) {
    const v = typeof folder_name === "string" ? folder_name.trim() : "";
    updates.folder_name = v.length > 0 ? v : null;
  }

  const { error } = await supabase
    .from("customers")
    .update(updates)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
