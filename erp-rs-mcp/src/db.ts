import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
  );
}

/**
 * Admin Supabase client — bypasses RLS.
 * Used by MCP tools for server-side data access.
 */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
