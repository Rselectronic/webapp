import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";

// GET /api/proc/[id]/purchase-orders â€” list supplier POs for this procurement.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("supplier_pos")
    .select("id, po_number, supplier_name, total_amount, currency, status, pdf_path, created_at, lines")
    .eq("procurement_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const orders = await Promise.all(
    rows.map(async (r) => {
      let pdf_url: string | null = null;
      if (r.pdf_path) {
        try {
          const { data: signed } = await supabase.storage
            .from("procurement")
            .createSignedUrl(r.pdf_path, 60 * 60 * 24);
          pdf_url = signed?.signedUrl ?? null;
        } catch {
          pdf_url = null;
        }
      }
      return { ...r, pdf_url };
    })
  );

  return NextResponse.json({ orders });
}
