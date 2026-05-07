import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Insert a synthetic PCB line onto a BOM that has none. Mirrors the auto-
 * create path in /api/bom/parse but works regardless of gerber_name â€” this
 * is the manual escape hatch from the BOM detail page.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid BOM id" }, { status: 400 });
  }

  const supabase = await createClient();
  const admin = createAdminClient();

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

  let body: { mpn?: string; cpc?: string; description?: string } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data: bom, error: bomErr } = await admin
    .from("boms")
    .select("id, gerber_name, gerber_revision")
    .eq("id", id)
    .single();
  if (bomErr || !bom) {
    return NextResponse.json({ error: "BOM not found" }, { status: 404 });
  }

  // Refuse to create a second PCB line.
  const { data: existingPcb } = await admin
    .from("bom_lines")
    .select("id")
    .eq("bom_id", id)
    .eq("is_pcb", true)
    .limit(1);
  if (existingPcb && existingPcb.length > 0) {
    return NextResponse.json(
      { error: "PCB line already present" },
      { status: 400 }
    );
  }

  const mpn = (body.mpn ?? "").trim() || bom.gerber_name || null;
  const cpc = (body.cpc ?? "").trim() || bom.gerber_name || null;
  const description =
    (body.description ?? "").trim() ||
    (bom.gerber_name
      ? bom.gerber_revision
        ? `${bom.gerber_name} (PCB, Rev ${bom.gerber_revision})`
        : `${bom.gerber_name} (PCB)`
      : "PCB");

  // line_number = (min existing) - 1 so it sorts first. Default to 0 when the
  // BOM has no other lines yet.
  const { data: minRow } = await admin
    .from("bom_lines")
    .select("line_number")
    .eq("bom_id", id)
    .order("line_number", { ascending: true })
    .limit(1)
    .maybeSingle();
  const pcbLineNumber =
    minRow && typeof minRow.line_number === "number" ? minRow.line_number - 1 : 0;

  const { data: inserted, error: insErr } = await admin
    .from("bom_lines")
    .insert({
      bom_id: id,
      line_number: pcbLineNumber,
      quantity: 1,
      reference_designator: "PCB",
      cpc,
      description,
      mpn,
      manufacturer: null,
      is_pcb: true,
      is_dni: false,
      m_code: "APCB",
      m_code_source: "auto",
      m_code_confidence: 1.0,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    return NextResponse.json(
      { error: "Failed to insert PCB line", details: insErr?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ bom_line_id: inserted.id });
}
