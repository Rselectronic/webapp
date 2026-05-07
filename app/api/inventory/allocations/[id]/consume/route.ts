import { isAdminRole } from "@/lib/auth/roles";
// ----------------------------------------------------------------------------
// app/api/inventory/allocations/[id]/consume/route.ts
//
// POST /api/inventory/allocations/[id]/consume
//   Body: { job_id?, notes? }
//
// Manually consume a reserved allocation. Flips status to 'consumed' AND
// writes the matching consume_proc movement (handled inside
// consumeAllocation). The production-event hook calls the same helper
// internally â€” this route exists so the operator can manually mark an
// allocation consumed if production_events doesn't fire (e.g. operator
// forgot to log the SMT start step on the shop floor).
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import { consumeAllocation } from "@/lib/inventory/allocator";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Body is optional â€” empty/missing JSON is fine for a bare consume.
  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const job_id =
    body.job_id != null && body.job_id !== "" ? String(body.job_id) : null;
  const notes =
    body.notes != null && body.notes !== "" ? String(body.notes).trim() || null : null;

  try {
    const result = await consumeAllocation(supabase, id, {
      job_id,
      notes,
      user_id: user.id,
    });
    return NextResponse.json({
      success: true,
      allocation: result.allocation,
      movement: result.movement,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to consume allocation";
    const isUserError = /not found|not reserved/i.test(msg);
    if (!isUserError) console.error("POST consume allocation failed:", e);
    return NextResponse.json({ error: msg }, { status: isUserError ? 400 : 500 });
  }
}
