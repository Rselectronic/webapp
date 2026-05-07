import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

// Production users are restricted to the Production module. Anything outside
// this allow-list redirects them to /production. Keep in sync with
// components/sidebar.tsx + mobile-nav.tsx.
//
// Note: `/jobs/` (with trailing slash) and `/api/jobs` are intentionally
// allowed so production users can open job detail pages from the kanban
// and PATCH job status (drag-and-drop). The listing page `/jobs` with no
// trailing slash is NOT allowed — production users navigate jobs only via
// the production kanban. Both the page and the API route enforce a
// production-specific allow-list of writable fields, so the broader path
// access is safe.
const PRODUCTION_ALLOWED_PREFIXES = [
  "/production",
  "/login",
  "/reset-password",
  "/api/auth",
  "/stencils", // production users manage the physical stencil library
  "/api/stencils-library",
  "/api/production", // future endpoint surface for production events
  "/jobs/", // job detail pages — kanban links here
  // /api/jobs (no trailing slash) admits both the index (`?status=…`
  // queries used by the shipment dialog) and item routes. POST on the
  // index is gated server-side to admin only.
  "/api/jobs",
  "/shipping", // production also handles shipping in this shop
  "/api/shipments", // create/list/update shipments
  "/_next",
];

function isProductionAllowedPath(pathname: string): boolean {
  // `/` (the home dashboard) is admin-only — production users get
  // bounced to /production. Removing the previous early-return so the
  // prefix list is the single source of truth.
  return PRODUCTION_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  // The MCP endpoint (/api/mcp) uses its own Bearer-token auth and must
  // NOT be redirected to /login when no session cookie is present —
  // MCP clients like Claude Desktop send JWTs in headers, not cookies.
  if (request.nextUrl.pathname.startsWith("/api/mcp")) {
    return NextResponse.next({ request });
  }

  // Mutable request-header bag forwarded to downstream Server Components
  // (read via `headers().get('x-user-role')` in layouts). Forwarding the
  // role this way lets the layout skip its own Supabase profile lookup —
  // saving two round-trips on every navigation.
  const forwardedHeaders = new Headers(request.headers);

  let supabaseResponse = NextResponse.next({
    request: { headers: forwardedHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: { headers: forwardedHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Service-role client used ONLY to read the caller's profile row. The
  // user-scoped client goes through RLS, and historically a few new role
  // values had no matching policy → the profile read silently returned
  // null and the deactivation check (`if (profile && !profile.is_active)`)
  // never fired. Using the admin client here makes the gate authoritative
  // regardless of which RLS policies happen to be installed.
  const adminSupabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // IMPORTANT: Use getUser(), not getSession()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Redirect unauthenticated users to login (except auth routes).
  // /reset-password is reached via Supabase's recovery callback BEFORE the
  // session cookie has been written (the access_token lives in the URL
  // hash and only becomes a session after the page loads). Bouncing it to
  // /login would strip the hash and break the flow.
  if (
    !user &&
    !path.startsWith("/login") &&
    !path.startsWith("/reset-password") &&
    !path.startsWith("/api/auth")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from login (with role-aware landing)
  if (user && path.startsWith("/login")) {
    const { data: profile } = await adminSupabase
      .from("users")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profile && !profile.is_active) {
      // Inactive — sign them out and bounce back with an error.
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "?error=account_disabled";
      return NextResponse.redirect(url);
    }

    const url = request.nextUrl.clone();
    url.pathname = profile?.role === "production" ? "/production" : "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Authenticated route — enforce active status + production scoping.
  if (user) {
    const { data: profile } = await adminSupabase
      .from("users")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profile && !profile.is_active) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "?error=account_disabled";
      return NextResponse.redirect(url);
    }

    const isProduction = profile?.role === "production";

    if (isProduction && !isProductionAllowedPath(path)) {
      const url = request.nextUrl.clone();
      url.pathname = "/production";
      url.search = "";
      return NextResponse.redirect(url);
    }

    // Forward the role to downstream Server Components so they don't have to
    // re-query Supabase. Read in layouts via `headers().get('x-user-role')`.
    if (profile?.role) {
      forwardedHeaders.set("x-user-role", profile.role);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
