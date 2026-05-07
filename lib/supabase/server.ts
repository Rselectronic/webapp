import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { cache } from "react";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}

/** Admin client using service_role key — bypasses RLS. Use only in API routes. */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Get the current user's role for the active request. Returns the value the
 * middleware already fetched (forwarded via `x-user-role`) when available, so
 * Server Components don't re-hit Supabase. Falls back to a Supabase lookup
 * when the header is missing (e.g., requests not handled by the proxy).
 *
 * Wrapped in React `cache()` — within a single request multiple callers
 * dedupe to one Supabase round-trip.
 */
export const getCurrentUserRole = cache(async (): Promise<string | null> => {
  const headerRole = (await headers()).get("x-user-role");
  if (headerRole) return headerRole;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.role ?? null;
});
