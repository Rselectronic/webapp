import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export interface AuthUser {
  userId: string;
  role: string;
  name: string;
}

/**
 * Validate a Supabase JWT token and return the user profile.
 */
export async function validateToken(token: string): Promise<AuthUser> {
  const client = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);

  if (error || !user) {
    throw new Error("Unauthorized: invalid token");
  }

  const { data: profile } = await client
    .from("users")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (!profile) {
    throw new Error("Unauthorized: user profile not found");
  }

  return {
    userId: user.id,
    role: profile.role,
    name: profile.full_name,
  };
}

/**
 * Check that the user's role is in the allowed list.
 * Throws if not authorized.
 */
export function requireRole(userRole: string, allowed: string[]): void {
  if (!allowed.includes(userRole)) {
    throw new Error(
      `Forbidden: role '${userRole}' is not authorized. Required: ${allowed.join(", ")}`
    );
  }
}
