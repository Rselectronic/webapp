import { getMcpSupabase } from "./db";
import { isApiKeyFormat, validateApiKey } from "@/lib/api-keys";

export type McpRole = "ceo" | "operations_manager" | "shop_floor";

export interface McpAuthUser {
  userId: string;
  role: McpRole;
  name: string;
  email: string;
}

/**
 * Validate a Bearer token from the Authorization header. Accepts EITHER:
 *   1. A permanent RS API key (prefix `rs_live_`) → validated against
 *      public.api_keys via validateApiKey().
 *   2. A Supabase JWT → validated against Supabase Auth + public.users.
 *
 * Throws on invalid/missing token or missing user profile.
 */
export async function validateMcpRequest(
  request: Request
): Promise<McpAuthUser> {
  const authHeader =
    request.headers.get("authorization") ??
    request.headers.get("Authorization");

  if (!authHeader) {
    throw new Error("Unauthorized: missing Authorization header");
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new Error("Unauthorized: Authorization header must be Bearer <token>");
  }
  const token = match[1].trim();

  // ---- Path 1: permanent API key ----------------------------------------
  if (isApiKeyFormat(token)) {
    const validated = await validateApiKey(token);
    if (!validated) {
      throw new Error("Unauthorized: invalid or revoked API key");
    }
    return {
      // Prefix with `api-key:` so downstream audit logs can tell API-key
      // callers apart from real Supabase users.
      userId: `api-key:${validated.id}`,
      role: validated.role,
      name: validated.name,
      email: "",
    };
  }

  // ---- Path 2: Supabase JWT (existing behavior) -------------------------
  const supabase = getMcpSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error(`Unauthorized: invalid token (${error?.message ?? "no user"})`);
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("role, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Unauthorized: profile lookup failed (${profileError.message})`);
  }
  if (!profile) {
    throw new Error("Unauthorized: user profile not found in public.users");
  }

  if (
    profile.role !== "ceo" &&
    profile.role !== "operations_manager" &&
    profile.role !== "shop_floor"
  ) {
    throw new Error(`Unauthorized: unknown role '${profile.role}'`);
  }

  return {
    userId: user.id,
    role: profile.role,
    name: profile.full_name ?? user.email ?? "Unknown",
    email: profile.email ?? user.email ?? "",
  };
}

/**
 * Tool groups exposed by role.
 *
 *   - ceo                 → all tools
 *   - operations_manager  → all except profitability + aging (financials)
 *   - shop_floor          → read-only on jobs/production + production event logging
 *
 * Controlled centrally so we have one source of truth.
 */
export function allowedToolsForRole(role: McpRole): Set<string> {
  const ALL = new Set([
    // overview
    "rs_business_overview",
    // customers
    "rs_list_customers",
    "rs_get_customer",
    // boms
    "rs_get_bom",
    "rs_search_components",
    "rs_classify_component",
    // quotes
    "rs_list_quotes",
    "rs_get_quote",
    // jobs
    "rs_list_jobs",
    "rs_get_job",
    "rs_update_job_status",
    // procurement
    "rs_get_procurement",
    "rs_list_backorders",
    // production
    "rs_get_production_status",
    "rs_log_production_event",
    // invoices / financials
    "rs_list_invoices",
    "rs_get_aging_report",
    "rs_get_profitability",
    // inventory
    "rs_get_bg_stock",
    // search
    "rs_search",
  ]);

  if (role === "ceo") {
    return ALL;
  }

  if (role === "operations_manager") {
    // Ops manager sees everything operational except financial reports.
    const ops = new Set(ALL);
    ops.delete("rs_get_aging_report");
    ops.delete("rs_get_profitability");
    return ops;
  }

  // shop_floor — read-only on jobs + production event logging
  return new Set([
    "rs_business_overview",
    "rs_list_jobs",
    "rs_get_job",
    "rs_get_production_status",
    "rs_log_production_event",
    "rs_search",
  ]);
}
