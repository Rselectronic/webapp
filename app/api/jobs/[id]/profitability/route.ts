import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getJobProfitability } from "@/lib/pricing/profitability";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only CEO can view profitability
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profitability = await getJobProfitability(supabase, id);

  if (!profitability) {
    return NextResponse.json(
      { error: "Job not found or has no associated quote" },
      { status: 404 }
    );
  }

  return NextResponse.json(profitability);
}
