import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid line id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json(
      { error: "Admin role required" },
      { status: 403 }
    );
  }

  const updates: Record<string, unknown> = {};

  if ("pin_count" in body) {
    const raw = body.pin_count;
    if (raw === null) {
      updates.pin_count = null;
    } else if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 9999) {
      updates.pin_count = raw;
    } else {
      return NextResponse.json(
        { error: "pin_count must be an integer 0-9999 or null" },
        { status: 400 }
      );
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No updatable fields provided" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("bom_lines")
    .update(updates)
    .eq("id", id)
    .select("id, pin_count, cpc, bom_id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to update BOM line", details: error.message },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "BOM line not found" },
      { status: 404 }
    );
  }

  // Learning loop â€” when the operator sets a pin count on a TH line, mirror
  // it onto customer_parts.through_hole_pins so the next BOM from the same
  // customer that ships this CPC gets the pin count pre-filled. Best-effort;
  // nothing downstream depends on the write succeeding.
  if ("pin_count" in updates && data.cpc) {
    const { data: bomRow } = await supabase
      .from("boms")
      .select("customer_id")
      .eq("id", data.bom_id)
      .maybeSingle();
    if (bomRow?.customer_id) {
      await supabase
        .from("customer_parts")
        .upsert(
          {
            customer_id: bomRow.customer_id,
            cpc: data.cpc,
            through_hole_pins: updates.pin_count as number | null,
          },
          { onConflict: "customer_id,cpc" }
        );
    }
  }

  return NextResponse.json({ ok: true, ...data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid line id" }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json(
      { error: "Admin role required" },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("bom_lines")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to delete BOM line", details: error.message },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "BOM line not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, id: data.id });
}
