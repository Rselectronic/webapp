import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
// PATCH /api/quotes/[id]/lead-times
// Body: { lead_times: Record<string, string> }  (keys: tier_1, tier_2, â€¦)
// Display-only field â€” no pricing recalculation required.
export async function PATCH(
  req: Request,
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

  const body = (await req.json().catch(() => ({}))) as {
    lead_times?: Record<string, string>;
  };
  const lt = body.lead_times ?? {};
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(lt)) {
    if (typeof v === "string" && v.trim()) clean[k] = v.trim();
  }

  const { error } = await supabase
    .from("quotes")
    .update({ lead_times: clean })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, lead_times: clean });
}
