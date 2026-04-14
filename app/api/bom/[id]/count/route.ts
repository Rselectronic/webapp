import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * Lightweight count endpoint for BOM classification progress polling.
 * Returns live classified / unclassified counts so the AI classify button
 * can show a progress bar while it runs.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bomId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Pull all classifiable lines in one query — fast enough even for 1000+ line BOMs
  const { data: lines } = await admin
    .from("bom_lines")
    .select("m_code, is_pcb, is_dni")
    .eq("bom_id", bomId);

  if (!lines) return NextResponse.json({ error: "BOM not found" }, { status: 404 });

  const classifiable = lines.filter((l) => !l.is_pcb && !l.is_dni);
  const classified = classifiable.filter((l) => !!l.m_code).length;
  const unclassified = classifiable.filter((l) => !l.m_code).length;

  return NextResponse.json({
    total: lines.length,
    classifiable: classifiable.length,
    classified,
    unclassified,
    pcb: lines.filter((l) => l.is_pcb).length,
    dni: lines.filter((l) => l.is_dni).length,
  });
}
