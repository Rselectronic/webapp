import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { calculateProgrammingCost, isDoubleSidedBoard } from "@/lib/pricing/programming-cost";

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

  // Check if the board is double-sided by reading gmps.board_side directly.
  // GMP is the canonical source of physical layout (single vs double sided).
  const { data: bom } = await admin
    .from("boms")
    .select("gmp_id, gmps(board_side)")
    .eq("id", bomId)
    .single();

  const boardSide =
    (bom?.gmps as unknown as { board_side?: string | null } | null)?.board_side ?? null;
  const isDouble = isDoubleSidedBoard(boardSide); // unknown → defaults to double

  const programmingCost = calculateProgrammingCost(lineCount, isDouble);

  return NextResponse.json({
    bom_id: bomId,
    line_count: lineCount,
    is_double_sided: isDouble,
    programming_cost: programmingCost,
  });
}
