import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
async function requireAdminCaller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      caller: null,
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
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { caller: { id: user.id }, error: null as null };
}

// POST /api/users/[id]/reset-password â€” admin only.
// Uses generateLink so we always have a working recovery link to surface in
// the UI, regardless of whether SMTP is configured for this Supabase project.
// If SMTP is configured, Supabase will also email the link to the user.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { caller, error } = await requireAdminCaller();
  if (error || !caller) return error!;

  const admin = createAdminClient();

  const { data: target, error: targetErr } = await admin
    .from("users")
    .select("id, email")
    .eq("id", id)
    .maybeSingle();

  if (targetErr || !target?.email) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Without an explicit redirectTo, Supabase uses the project's Site URL
  // (typically /login), which strips the recovery tokens and dumps the user
  // on the login page. Point recoveries at our /reset-password handler so
  // it can accept the access_token / refresh_token pair Supabase appends.
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    req.headers.get("origin") ??
    new URL(req.url).origin;

  const { data, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: target.email,
    options: {
      redirectTo: `${origin}/reset-password`,
    },
  });

  if (linkErr) {
    return NextResponse.json(
      {
        error:
          "Failed to generate recovery link. Verify Supabase Auth is configured correctly.",
        details: linkErr.message,
      },
      { status: 500 }
    );
  }

  // Show the admin the action_link so they can hand it to the user even when
  // SMTP isn't configured. action_link is the single-use recovery URL.
  const actionLink =
    (data?.properties as { action_link?: string } | undefined)?.action_link ??
    null;

  return NextResponse.json({
    email: target.email,
    action_link: actionLink,
  });
}
