/**
 * api-auth.ts — Shared authentication helper for API routes
 * ----------------------------------------------------------
 * Accepts EITHER:
 *   a) Authorization: Bearer rs_live_<key>  ← Telegram bot, MCP clients
 *   b) Supabase session cookie              ← Web app (logged-in users)
 *
 * Usage in any API route:
 *
 *   import { getAuthUser } from "@/lib/auth/api-auth";
 *
 *   export async function GET(req: NextRequest) {
 *     const { user, supabase } = await getAuthUser(req);
 *     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *     // use supabase for DB queries as normal
 *   }
 *
 * The returned `user` shape:
 *   { id: string | null, role: string, isApiKey: boolean }
 *
 * - `id` is null for API key auth (no Supabase user UUID available).
 *   Routes that write `created_by: user.id` will store null, which is fine
 *   since the column is nullable.
 * - `role` is always populated from either the API key record or the users table.
 */

import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateApiKey, isApiKeyFormat } from "@/lib/api-keys";

export interface AuthUser {
  /** Supabase user UUID — null for API-key-authenticated requests */
  id: string | null;
  /** "ceo" | "operations_manager" | "shop_floor" */
  role: string;
  /** true if authenticated via rs_live_* key, false if via Supabase session */
  isApiKey: boolean;
}

export interface AuthResult {
  user: AuthUser | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
}

/**
 * Authenticate an incoming API request.
 * Returns { user, supabase } — user is null if auth fails.
 */
export async function getAuthUser(req: NextRequest): Promise<AuthResult> {
  const supabase = await createClient();

  // ── 1. Try Bearer API key ──────────────────────────────────────────────────
  const authHeader =
    req.headers.get("Authorization") ?? req.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();

    if (isApiKeyFormat(token)) {
      const keyData = await validateApiKey(token);
      if (keyData) {
        return {
          user: { id: null, role: keyData.role, isApiKey: true },
          supabase,
        };
      }
      // Key has rs_live_ prefix but failed validation (revoked / wrong)
      return { user: null, supabase };
    }
  }

  // ── 2. Fall back to Supabase session cookie ────────────────────────────────
  const {
    data: { user: sbUser },
  } = await supabase.auth.getUser();

  if (!sbUser) return { user: null, supabase };

  // Fetch role from users table (cached by Supabase's RLS context)
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", sbUser.id)
    .maybeSingle();

  return {
    user: {
      id: sbUser.id,
      role: profile?.role ?? "shop_floor",
      isApiKey: false,
    },
    supabase,
  };
}
