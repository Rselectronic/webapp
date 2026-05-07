import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
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

  const rawMpn = body.mpn;
  if (typeof rawMpn !== "string" || rawMpn.trim().length === 0) {
    return NextResponse.json({ error: "mpn is required" }, { status: 400 });
  }
  const mpn = rawMpn.trim();

  const rawMfr = body.manufacturer;
  const manufacturer =
    typeof rawMfr === "string" && rawMfr.trim().length > 0 ? rawMfr.trim() : null;

  const rawNotes = body.notes;
  const notes =
    typeof rawNotes === "string" && rawNotes.trim().length > 0 ? rawNotes.trim() : null;

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

  const admin = createAdminClient();

  // Reject adding alternates to PCB rows â€” they're priced via the PCB fab
  // quote step, not through DigiKey/Mouser/etc., so distributor alternates
  // are meaningless here. Covers both the is_pcb flag and the APCB m_code.
  const { data: lineRow } = await admin
    .from("bom_lines")
    .select("is_pcb, m_code")
    .eq("id", id)
    .maybeSingle();
  if (!lineRow) {
    return NextResponse.json({ error: "BOM line not found" }, { status: 404 });
  }
  if (lineRow.is_pcb || lineRow.m_code === "APCB") {
    return NextResponse.json(
      { error: "PCB lines are priced separately, not via distributor APIs." },
      { status: 400 }
    );
  }

  // Compute next rank.
  const { data: maxRow, error: maxErr } = await admin
    .from("bom_line_alternates")
    .select("rank")
    .eq("bom_line_id", id)
    .order("rank", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxErr) {
    return NextResponse.json(
      { error: "Failed to compute rank", details: maxErr.message },
      { status: 500 }
    );
  }

  const nextRank = (maxRow?.rank ?? 0) + 1;

  const { data, error } = await admin
    .from("bom_line_alternates")
    .insert({
      bom_line_id: id,
      mpn,
      manufacturer,
      source: "operator",
      rank: nextRank,
      notes,
    })
    .select("id, bom_line_id, mpn, manufacturer, source, rank, notes")
    .single();

  if (error) {
    // Postgres unique_violation
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "MPN already on this line" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to insert alternate", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data, { status: 201 });
}
