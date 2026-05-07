import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateApiKey, hashApiKey, type ApiKeyRole } from "@/lib/api-keys";
const ALLOWED_ROLES: ApiKeyRole[] = ["admin", "production"];

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      supabase,
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role)) {
    return {
      supabase,
      user: null,
      error: NextResponse.json({ error: "Admin role required" }, { status: 403 }),
    };
  }

  return { supabase, user, error: null };
}

export async function POST(req: NextRequest) {
  const { supabase, user, error } = await requireAdmin();
  if (error || !user) return error!;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name: rawName, role: rawRole } = (body ?? {}) as {
    name?: unknown;
    role?: unknown;
  };

  if (typeof rawName !== "string" || rawName.trim().length === 0) {
    return NextResponse.json(
      { error: "`name` must be a non-empty string" },
      { status: 400 }
    );
  }
  const name = rawName.trim();

  let role: ApiKeyRole = "admin";
  if (rawRole !== undefined) {
    if (
      typeof rawRole !== "string" ||
      !ALLOWED_ROLES.includes(rawRole as ApiKeyRole)
    ) {
      return NextResponse.json(
        {
          error: `\`role\` must be one of: ${ALLOWED_ROLES.join(", ")}`,
        },
        { status: 400 }
      );
    }
    role = rawRole as ApiKeyRole;
  }

  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);

  const { data: inserted, error: insertError } = await supabase
    .from("api_keys")
    .insert({
      name,
      key_hash: keyHash,
      role,
      created_by: user.id,
    })
    .select("id, name, role, created_at")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: "Failed to create API key", details: insertError?.message },
      { status: 500 }
    );
  }

  // IMPORTANT: the raw key is returned ONCE here and never again. Only the
  // SHA-256 hash is stored server-side, so there is no recovery path â€” the
  // caller must copy the key now.
  return NextResponse.json(
    {
      id: inserted.id,
      name: inserted.name,
      role: inserted.role,
      key: rawKey,
      created_at: inserted.created_at,
    },
    { status: 201 }
  );
}

export async function GET() {
  const { supabase, user, error } = await requireAdmin();
  if (error || !user) return error!;

  const { data, error: selectError } = await supabase
    .from("api_keys")
    .select("id, name, role, created_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false });

  if (selectError) {
    return NextResponse.json(
      { error: "Failed to list API keys", details: selectError.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
