import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const url = new URL(req.url);

  const search = url.searchParams.get("search")?.trim() ?? "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  // Build query for items
  let query = supabase
    .from("components")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.ilike("mpn", `%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get total count (unfiltered) — use count query, not fetching all rows
  const { count: totalCount } = await supabase
    .from("components")
    .select("id", { count: "exact", head: true });

  // Fetch M-code breakdown using RPC or paginated fetch
  // Supabase returns max 1000 by default, so use a grouped count approach
  const mCodeCounts: Record<string, number> = {};
  let fetchOffset = 0;
  const fetchLimit = 1000;
  while (true) {
    const { data: batch } = await supabase
      .from("components")
      .select("m_code")
      .range(fetchOffset, fetchOffset + fetchLimit - 1);
    if (!batch || batch.length === 0) break;
    for (const c of batch) {
      const code = c.m_code ?? "Unassigned";
      mCodeCounts[code] = (mCodeCounts[code] ?? 0) + 1;
    }
    if (batch.length < fetchLimit) break;
    fetchOffset += fetchLimit;
  }

  return NextResponse.json({
    items: data ?? [],
    total: count ?? 0,
    page,
    limit,
    stats: {
      total: totalCount ?? 0,
      by_m_code: mCodeCounts,
    },
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    mpn: string;
    manufacturer?: string;
    description?: string;
    category?: string;
    package_case?: string;
    mounting_type?: string;
    m_code?: string;
    m_code_source?: string;
  };

  if (!body.mpn?.trim()) {
    return NextResponse.json({ error: "mpn is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("components")
    .insert({
      mpn: body.mpn.trim(),
      manufacturer: body.manufacturer?.trim() || null,
      description: body.description?.trim() || null,
      category: body.category?.trim() || null,
      package_case: body.package_case?.trim() || null,
      mounting_type: body.mounting_type?.trim() || null,
      m_code: body.m_code?.trim() || null,
      m_code_source: body.m_code_source ?? "manual",
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `Component with MPN "${body.mpn}" already exists for this manufacturer` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
