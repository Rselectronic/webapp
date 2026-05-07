import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
// Shape of a stencil row returned to clients (active OR discarded).
interface StencilRow {
  id: string;
  position_no: number | null;
  stencil_name: string;
  comments: string | null;
  discarded_at: string | null;
  discarded_reason: string | null;
  discarded_by: string | null;
  created_at: string;
  updated_at: string;
  gmps: string[];
}

// GET /api/stencils-library â€” list stencils (active by default).
export async function GET(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Library is readable by both admins and production users (RLS allows the
  // same â€” production needs to know which stencil is on file when staging).
  if (!isAdminRole(user.role) && user.role !== "production")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const includeDiscarded = new URL(req.url).searchParams.get("include_discarded") === "1";

  const { data: rows, error } = await supabase
    .from("stencils_library")
    .select("id, position_no, stencil_name, comments, discarded_at, discarded_reason, discarded_by, created_at, updated_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (rows ?? []).map((r) => r.id);
  const gmpsByStencil = new Map<string, string[]>();
  if (ids.length > 0) {
    const { data: gmpRows } = await supabase
      .from("stencils_library_gmps")
      .select("stencil_id, gmp_number")
      .in("stencil_id", ids);
    for (const r of (gmpRows ?? []) as { stencil_id: string; gmp_number: string }[]) {
      const arr = gmpsByStencil.get(r.stencil_id) ?? [];
      arr.push(r.gmp_number);
      gmpsByStencil.set(r.stencil_id, arr);
    }
  }

  const enriched: StencilRow[] = (rows ?? []).map((r) => ({
    ...(r as Omit<StencilRow, "gmps">),
    gmps: gmpsByStencil.get(r.id) ?? [],
  }));

  // Active first (by position_no asc, nulls last), then discarded (newest first)
  const active = enriched
    .filter((s) => !s.discarded_at)
    .sort((a, b) => {
      if (a.position_no == null && b.position_no == null) return 0;
      if (a.position_no == null) return 1;
      if (b.position_no == null) return -1;
      return a.position_no - b.position_no;
    });
  const discarded = enriched
    .filter((s) => !!s.discarded_at)
    .sort((a, b) => (b.discarded_at ?? "").localeCompare(a.discarded_at ?? ""));

  const stencils = includeDiscarded ? [...active, ...discarded] : active;
  return NextResponse.json({ stencils, active_count: active.length, discarded_count: discarded.length });
}

// POST /api/stencils-library â€” create a new stencil. Production users can
// add stencils too (they're the ones putting them on the shelves); only
// rename / position-shuffle (PATCH) stays admin-only.
export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role) && user.role !== "production")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const stencil_name: string = (body.stencil_name ?? "").toString().trim();
  const comments: string | null = body.comments ? String(body.comments) : null;
  const requestedPos: number | null =
    body.position_no != null && body.position_no !== "" ? Number(body.position_no) : null;
  const rawGmps: unknown = body.gmps ?? [];

  if (!stencil_name) {
    return NextResponse.json({ error: "stencil_name is required" }, { status: 400 });
  }

  // Reject if an active row already uses this name.
  const { data: existing } = await supabase
    .from("stencils_library")
    .select("id")
    .eq("stencil_name", stencil_name)
    .is("discarded_at", null)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: `Stencil "${stencil_name}" already exists` },
      { status: 400 }
    );
  }

  // Resolve position number.
  let position_no = requestedPos;
  if (position_no == null) {
    const { data: used } = await supabase
      .from("stencils_library")
      .select("position_no")
      .is("discarded_at", null)
      .not("position_no", "is", null);
    const taken = new Set((used ?? []).map((r: { position_no: number | null }) => r.position_no));
    let next = 1;
    while (taken.has(next)) next++;
    position_no = next;
  }

  // Dedupe GMP tokens case-insensitively but store original casing.
  const gmpList: string[] = Array.isArray(rawGmps)
    ? rawGmps.map((g) => String(g).trim()).filter(Boolean)
    : [];
  const seen = new Set<string>();
  const gmps: string[] = [];
  for (const g of gmpList) {
    const key = g.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      gmps.push(g);
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from("stencils_library")
    .insert({ stencil_name, comments, position_no })
    .select("id")
    .single();
  if (insErr || !inserted) {
    return NextResponse.json({ error: insErr?.message ?? "Insert failed" }, { status: 500 });
  }

  if (gmps.length > 0) {
    const { error: gErr } = await supabase
      .from("stencils_library_gmps")
      .insert(gmps.map((g) => ({ stencil_id: inserted.id, gmp_number: g })));
    if (gErr) {
      return NextResponse.json({ error: gErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ id: inserted.id, position_no });
}
