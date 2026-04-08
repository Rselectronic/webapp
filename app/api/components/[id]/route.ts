import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    mpn?: string;
    manufacturer?: string;
    description?: string;
    category?: string;
    package_case?: string;
    mounting_type?: string;
    m_code?: string;
    m_code_source?: string;
  };

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.mpn !== undefined) update.mpn = body.mpn.trim();
  if (body.manufacturer !== undefined) update.manufacturer = body.manufacturer?.trim() || null;
  if (body.description !== undefined) update.description = body.description?.trim() || null;
  if (body.category !== undefined) update.category = body.category?.trim() || null;
  if (body.package_case !== undefined) update.package_case = body.package_case?.trim() || null;
  if (body.mounting_type !== undefined) update.mounting_type = body.mounting_type?.trim() || null;
  if (body.m_code !== undefined) update.m_code = body.m_code?.trim() || null;
  if (body.m_code_source !== undefined) update.m_code_source = body.m_code_source;

  const { data, error } = await supabase
    .from("components")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check role — only CEO can delete components
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden — CEO only" }, { status: 403 });
  }

  const { error } = await supabase
    .from("components")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
