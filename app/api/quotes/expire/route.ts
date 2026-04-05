import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("status", "sent")
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expired: data?.length ?? 0 });
}
