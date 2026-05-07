import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";
import { cancelSupplier, cancelAll } from "@/lib/pricing/cancel-registry";

interface CancelBody {
  request_id: string;
  /** Omit to cancel ALL suppliers for this request. */
  supplier?: string;
}

export async function POST(req: Request) {
  let body: CancelBody;
  try {
    body = (await req.json()) as CancelBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.request_id || typeof body.request_id !== "string") {
    return NextResponse.json({ error: "request_id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  if (body.supplier) {
    const ok = cancelSupplier(body.request_id, body.supplier);
    return NextResponse.json({ cancelled: ok, scope: "supplier", supplier: body.supplier });
  }
  const ok = cancelAll(body.request_id);
  return NextResponse.json({ cancelled: ok, scope: "all" });
}
