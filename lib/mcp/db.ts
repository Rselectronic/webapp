import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin Supabase client for MCP tools.
 *
 * Uses the service_role key and therefore bypasses RLS. Role-based access
 * control is enforced at the MCP server layer (see lib/mcp/auth.ts and
 * lib/mcp/server.ts) before a tool is ever invoked.
 */
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

let _client: SupabaseClient | null = null;

export function getMcpSupabase(): SupabaseClient {
  if (!_client) {
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        "MCP server is missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars"
      );
    }
    _client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _client;
}

/** Convenience re-export used by the tool files. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getMcpSupabase();
    // @ts-expect-error — dynamic proxy forward
    const value = client[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
