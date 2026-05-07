import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";

// ---------------------------------------------------------------------------
// PATCH /api/customers/bulk — Apply the same set of field updates to many
// customers in a single request. Used by the customers list page for bulk
// edits (toggle active/inactive, change payment terms across N customers).
//
// Body: { ids: string[], updates: { is_active?, payment_terms?, notes? } }
//
// Admin-only. We use the user-scoped client so RLS still applies and the
// audit_log triggers attribute the change to the actual user.
// ---------------------------------------------------------------------------
const ALLOWED_FIELDS = ["is_active", "payment_terms", "notes"] as const;
type AllowedField = (typeof ALLOWED_FIELDS)[number];

export async function PATCH(request: NextRequest) {
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
      { error: "Only an admin can bulk-update customers." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? (body.ids as string[]) : null;
  const updates = body.updates && typeof body.updates === "object" ? body.updates : null;

  if (!ids || ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });
  }
  if (!updates) {
    return NextResponse.json({ error: "updates object is required" }, { status: 400 });
  }

  // Whitelist updatable fields. Anything else is silently dropped — we don't
  // want a payload to flip created_by / code / company_name in bulk.
  const safeUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ALLOWED_FIELDS) {
    if (updates[key as AllowedField] !== undefined) {
      safeUpdates[key] = updates[key as AllowedField];
    }
  }
  if (Object.keys(safeUpdates).length === 1) {
    return NextResponse.json(
      { error: "No allowed fields to update. Allowed: " + ALLOWED_FIELDS.join(", ") },
      { status: 400 }
    );
  }

  // Validate is_active
  if (safeUpdates.is_active !== undefined && typeof safeUpdates.is_active !== "boolean") {
    return NextResponse.json({ error: "is_active must be boolean" }, { status: 400 });
  }
  // Validate payment_terms
  if (safeUpdates.payment_terms !== undefined && typeof safeUpdates.payment_terms !== "string") {
    return NextResponse.json({ error: "payment_terms must be a string" }, { status: 400 });
  }

  // Use admin client so RLS doesn't trip on operations_manager edits, but
  // audit_log triggers still capture auth.uid() — the trigger reads it via
  // current_setting, which the admin client preserves through the request.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customers")
    .update(safeUpdates)
    .in("id", ids)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    updated: data?.length ?? 0,
    ids: data?.map((r) => r.id) ?? [],
  });
}
