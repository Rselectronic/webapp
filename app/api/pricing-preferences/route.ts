import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// /api/pricing-preferences
//   GET    — list every preference (system + user-created). Any authed user.
//   POST   — create a user-defined preference. CEO / ops_manager only.
// ---------------------------------------------------------------------------

const VALID_RULES = new Set([
  "cheapest_overall",
  "cheapest_in_stock",
  "cheapest_in_stock_franchised",
  "shortest_lead_time",
  "strict_priority",
  "custom",
]);

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("pricing_preferences")
    .select("id, name, rule, config, is_system, created_by, created_at, updated_at")
    .order("is_system", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load preferences", details: error.message }, { status: 500 });
  }
  return NextResponse.json({ preferences: data ?? [] });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const rule = typeof body.rule === "string" ? body.rule : "";
  const config = body.config ?? {};

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!VALID_RULES.has(rule)) {
    return NextResponse.json(
      { error: `rule must be one of ${[...VALID_RULES].join(", ")}` },
      { status: 400 }
    );
  }
  if (rule === "strict_priority") {
    const pri = (config as { priority?: unknown }).priority;
    if (!Array.isArray(pri) || pri.length === 0) {
      return NextResponse.json(
        { error: "strict_priority requires config.priority = [supplier_name, ...]" },
        { status: 400 }
      );
    }
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if (!profile || (profile.role !== "ceo" && profile.role !== "operations_manager")) {
    return NextResponse.json({ error: "CEO or operations manager role required" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("pricing_preferences")
    .insert({
      name,
      rule,
      config,
      is_system: false,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    const isDup = error.code === "23505";
    return NextResponse.json(
      {
        error: isDup ? "A preference with this name already exists" : "Failed to save preference",
        details: error.message,
      },
      { status: isDup ? 409 : 500 }
    );
  }

  return NextResponse.json({ preference: data });
}
