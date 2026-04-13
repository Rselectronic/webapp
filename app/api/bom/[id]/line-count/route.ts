import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { calculateProgrammingCost, isDoubleSidedAssembly } from "@/lib/pricing/programming-cost";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bomId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Count non-PCB, non-DNI lines
  const { count } = await admin
    .from("bom_lines")
    .select("id", { count: "exact", head: true })
    .eq("bom_id", bomId)
    .eq("is_pcb", false)
    .eq("is_dni", false);

  const lineCount = count ?? 0;

  // Check if the board is double-sided (TB) by looking at related jobs
  const { data: bom } = await admin
    .from("boms")
    .select("gmp_id")
    .eq("id", bomId)
    .single();

  let isDouble = true; // Default to double-sided (TB is most common)
  if (bom?.gmp_id) {
    const { data: jobs } = await admin
      .from("jobs")
      .select("assembly_type")
      .eq("gmp_id", bom.gmp_id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (jobs?.[0]?.assembly_type) {
      isDouble = isDoubleSidedAssembly(jobs[0].assembly_type);
    }
  }

  const programmingCost = calculateProgrammingCost(lineCount, isDouble);

  return NextResponse.json({
    bom_id: bomId,
    line_count: lineCount,
    is_double_sided: isDouble,
    programming_cost: programmingCost,
  });
}
