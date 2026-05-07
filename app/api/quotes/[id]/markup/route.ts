import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
// PATCH /api/quotes/[id]/markup
// Body: {
//   component_markup_pct?: number | null,
//   pcb_markup_pct?: number | null,
//   assembly_markup_pct?: number | null
// }
// null clears the override (reverts to global setting).
//
// Does NOT trigger recalculation â€” caller should hit /calculate afterwards if
// they want the new markup reflected in the saved pricing.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as {
    component_markup_pct?: number | null;
    pcb_markup_pct?: number | null;
    assembly_markup_pct?: number | null;
  };

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

  const update: Record<string, number | null> = {};
  if ("component_markup_pct" in body) {
    const v = body.component_markup_pct;
    update.component_markup_pct_override =
      v === null || v === undefined ? null : Number(v);
  }
  if ("pcb_markup_pct" in body) {
    const v = body.pcb_markup_pct;
    update.pcb_markup_pct_override =
      v === null || v === undefined ? null : Number(v);
  }
  if ("assembly_markup_pct" in body) {
    const v = body.assembly_markup_pct;
    update.assembly_markup_pct_override =
      v === null || v === undefined ? null : Number(v);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No markup fields provided" }, { status: 400 });
  }

  const { error } = await supabase.from("quotes").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, update });
}
