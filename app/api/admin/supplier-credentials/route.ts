import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listCredentialStatus } from "@/lib/supplier-credentials";
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
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
      user: null,
      error: NextResponse.json({ error: "Admin role required" }, { status: 403 }),
    };
  }

  return { user, error: null };
}

export async function GET() {
  const { user, error } = await requireAdmin();
  if (error || !user) return error!;

  try {
    const statuses = await listCredentialStatus();
    return NextResponse.json(statuses);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to list supplier credentials", details: message },
      { status: 500 }
    );
  }
}
