import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isAdminRole, isAssignableRole } from "@/lib/auth/roles";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireAdminCaller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      caller: null,
      supabase,
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
      supabase,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return {
    caller: { id: user.id, role: profile.role as string },
    supabase,
    error: null as null,
  };
}

// GET /api/users — admin only.
// Lists all users (active + inactive) joined with auth.users.last_sign_in_at.
export async function GET() {
  const { caller, error } = await requireAdminCaller();
  if (error || !caller) return error!;

  const admin = createAdminClient();

  // public.users — primary list source.
  const { data: rows, error: rowsErr } = await admin
    .from("users")
    .select("id, email, full_name, role, is_active, created_at, last_seen_at")
    .order("created_at", { ascending: true });

  if (rowsErr) {
    return NextResponse.json(
      { error: "Failed to load users", details: rowsErr.message },
      { status: 500 }
    );
  }

  // Pull last_sign_in_at from auth.users via the admin API. listUsers paginates;
  // we only have a handful of users, so the first page (default 50) is enough.
  let lastSignIn = new Map<string, string | null>();
  try {
    const { data: authList } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    for (const u of authList?.users ?? []) {
      lastSignIn.set(u.id, u.last_sign_in_at ?? null);
    }
  } catch {
    // Non-fatal — last_sign_in_at just shows null.
    lastSignIn = new Map();
  }

  const users = (rows ?? []).map((r) => ({
    ...r,
    last_sign_in_at: lastSignIn.get(r.id) ?? null,
  }));

  return NextResponse.json({ users });
}

// POST /api/users — admin only. Creates an auth user + a public.users row.
export async function POST(req: NextRequest) {
  const { caller, error } = await requireAdminCaller();
  if (error || !caller) return error!;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const full_name = String(body.full_name ?? "").trim();
  const role = String(body.role ?? "").trim();
  const password = String(body.password ?? "");

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (!full_name) {
    return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  }
  if (!isAssignableRole(role)) {
    return NextResponse.json(
      { error: "Role must be 'admin' or 'production'" },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 1. Create the auth user.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (createErr || !created?.user) {
    return NextResponse.json(
      {
        error: createErr?.message ?? "Failed to create auth user",
      },
      { status: 400 }
    );
  }

  // 2. Insert matching public.users row.
  const { data: profile, error: insertErr } = await admin
    .from("users")
    .insert({
      id: created.user.id,
      email,
      full_name,
      role,
      is_active: true,
    })
    .select("id, email, full_name, role, is_active, created_at, last_seen_at")
    .single();

  if (insertErr || !profile) {
    // Roll back the auth user so we don't leave a half-provisioned account.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to create user profile" },
      { status: 500 }
    );
  }

  // audit_log entry is created automatically by the audit_users trigger on
  // public.users (see migration 024). No explicit insert needed.

  return NextResponse.json(
    { ...profile, last_sign_in_at: null },
    { status: 201 }
  );
}
