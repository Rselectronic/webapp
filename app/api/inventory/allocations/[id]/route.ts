import { isAdminRole } from "@/lib/auth/roles";
// ----------------------------------------------------------------------------
// app/api/inventory/allocations/[id]/route.ts
//
// DELETE /api/inventory/allocations/[id]
//   Release a reserved inventory allocation. No physical-stock effect â€”
//   just frees up available_qty for other PROCs. Used by the "Undo" button
//   on the PROC stock allocations panel.
//
// Allowed: admin only.
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import { releaseAllocation } from "@/lib/inventory/allocator";
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const released = await releaseAllocation(supabase, id, { user_id: user.id });
    return NextResponse.json({ success: true, allocation: released });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to release allocation";
    // "not found" / "not reserved" are user errors â†’ 400; anything else 500.
    const isUserError = /not found|not reserved/i.test(msg);
    if (!isUserError) console.error("DELETE allocation failed:", e);
    return NextResponse.json({ error: msg }, { status: isUserError ? 400 : 500 });
  }
}
