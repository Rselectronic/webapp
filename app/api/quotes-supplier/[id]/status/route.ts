import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
// ============================================================================
// /api/quotes-supplier/[id]/status â€” change quote status (non-accept).
// Allowed transitions:
//   draft â†’ requested
//   requested â†’ received
//   received â†’ rejected
//   any non-accepted â†’ expired
//   any non-accepted â†’ rejected
// "accepted" is handled by /accept which also generates the PO.
// ============================================================================

const VALID_NEXT = new Set(["requested", "received", "rejected", "expired"]);

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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const next = String(body.status ?? "");
  if (!VALID_NEXT.has(next)) {
    return NextResponse.json(
      { error: `Status must be one of: ${Array.from(VALID_NEXT).join(", ")}` },
      { status: 400 }
    );
  }

  const { data: q } = await supabase
    .from("supplier_quotes")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (!q) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  if (q.status === "accepted") {
    return NextResponse.json(
      { error: "Quote is already accepted; status cannot be changed." },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();
  const updates: Record<string, unknown> = {
    status: next,
    updated_at: nowIso,
  };
  if (next === "requested" && !q.status) updates.requested_at = nowIso;
  if (next === "requested") updates.requested_at = nowIso;
  if (next === "received") updates.received_at = nowIso;

  const { error } = await supabase.from("supplier_quotes").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, status: next });
}
