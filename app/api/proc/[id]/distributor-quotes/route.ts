import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/server";
import { buildDistributorQuotes } from "@/lib/proc/build-distributor-quotes";

// GET /api/proc/[id]/distributor-quotes
// Thin wrapper â€” the heavy lifting lives in lib/proc/build-distributor-quotes.ts
// so the PROC detail page can also call it server-side for SSR first paint.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await buildDistributorQuotes(supabase, id);
  return NextResponse.json(result);
}
