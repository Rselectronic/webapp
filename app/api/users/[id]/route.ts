import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  isAdminRole,
  isProductionRole,
  ALL_DB_ROLES,
  type DbRole,
} from "@/lib/auth/roles";

async function requireAdminCaller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      caller: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const { data: profile } = await supabase
    .from("users")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active || !isAdminRole(profile?.role)) {
    return {
      caller: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return {
    caller: { id: user.id, role: profile.role as string },
    error: null as null,
  };
}

// PATCH /api/users/[id] — admin only.
// Body: { role?, is_active?, full_name? }
// Refuses self-demotion and self-deactivation.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { caller, error } = await requireAdminCaller();
  if (error || !caller) return error!;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: target, error: targetErr } = await admin
    .from("users")
    .select("id, role, is_active")
    .eq("id", id)
    .maybeSingle();

  if (targetErr || !target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const patch: { role?: DbRole; is_active?: boolean; full_name?: string; updated_at?: string } = {};

  if (typeof body.full_name === "string") {
    const fn = body.full_name.trim();
    if (!fn) {
      return NextResponse.json({ error: "Full name cannot be blank" }, { status: 400 });
    }
    patch.full_name = fn;
  }

  if (typeof body.role === "string") {
    if (!ALL_DB_ROLES.includes(body.role as DbRole)) {
      return NextResponse.json(
        { error: `Role must be one of: ${ALL_DB_ROLES.join(", ")}` },
        { status: 400 }
      );
    }
    // Self-demotion guard: if caller is editing themselves, role can't drop
    // out of admin-equivalent.
    if (caller.id === id && !isAdminRole(body.role as string)) {
      return NextResponse.json(
        { error: "You cannot change your own role to a non-admin role." },
        { status: 400 }
      );
    }
    patch.role = body.role as DbRole;
  }

  if (typeof body.is_active === "boolean") {
    if (caller.id === id && body.is_active === false) {
      return NextResponse.json(
        { error: "You cannot deactivate your own account." },
        { status: 400 }
      );
    }
    patch.is_active = body.is_active;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  patch.updated_at = new Date().toISOString();

  const { data: updated, error: updateErr } = await admin
    .from("users")
    .update(patch)
    .eq("id", id)
    .select("id, email, full_name, role, is_active, created_at, last_seen_at")
    .single();

  if (updateErr || !updated) {
    return NextResponse.json(
      { error: updateErr?.message ?? "Failed to update user" },
      { status: 500 }
    );
  }

  // If we just deactivated this user, also kill their auth sessions.
  // Supabase doesn't have a clean per-user "force sign-out" admin API, but
  // signOut with scope:'global' on the user's JWT works. The real defense is
  // the middleware check — every request re-reads is_active from public.users
  // and bounces inactive users to /login.
  if (patch.is_active === false) {
    try {
      // Attempt to revoke refresh tokens via admin update (no-op on metadata,
      // but if a future Supabase release adds a real "ban" API we can switch).
      await admin.auth.admin.updateUserById(id, {
        user_metadata: { _deactivated_at: new Date().toISOString() },
      });
    } catch {
      // Non-fatal — middleware deactivation check is the source of truth.
    }
  }

  // audit_log entry is created automatically by the audit_users trigger.
  return NextResponse.json(updated);
}

// DELETE /api/users/[id] — explicitly NOT supported. Use PATCH with
// { is_active: false } to deactivate. Hard deletion is unsafe given audit
// trail expectations and FK cascades to audit_log, jobs.created_by, etc.
export async function DELETE() {
  return NextResponse.json(
    {
      error:
        "Hard deletion is not supported. Deactivate the user instead (PATCH with is_active=false).",
    },
    { status: 405 }
  );
}
