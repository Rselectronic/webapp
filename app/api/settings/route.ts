import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { PricingSettings } from "@/lib/pricing/types";
export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = new URL(req.url).searchParams.get("key") ?? "pricing";
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .single();
  if (error || !data)
    return NextResponse.json({ error: "Settings not found" }, { status: 404 });
  return NextResponse.json(data.value);
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role))
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });

  const key = new URL(req.url).searchParams.get("key") ?? "pricing";
  const body = await req.json();

  // For array-type settings (e.g. payment_terms), replace the value directly.
  // For object-type settings (e.g. pricing), merge with existing values.
  let value: unknown;
  if (Array.isArray(body)) {
    value = body;
  } else {
    const updates = body as Partial<PricingSettings>;
    const { data: existing } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .single();
    value = { ...((existing?.value as object) ?? {}), ...updates };
  }

  const { error } = await supabase.from("app_settings").upsert({
    key,
    value,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(value);
}
