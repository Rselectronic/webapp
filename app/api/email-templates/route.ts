import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/email-templates — List all email templates
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const category = req.nextUrl.searchParams.get("category");

  let query = supabase
    .from("email_templates")
    .select("*")
    .order("category")
    .order("name");

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// ---------------------------------------------------------------------------
// POST /api/email-templates — Create a new template
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, subject, body: templateBody, category } = body;

  if (!name || !subject || !templateBody || !category) {
    return NextResponse.json(
      { error: "name, subject, body, and category are required" },
      { status: 400 }
    );
  }

  const validCategories = ["quote", "invoice", "shipping", "procurement", "general"];
  if (!validCategories.includes(category)) {
    return NextResponse.json(
      { error: `category must be one of: ${validCategories.join(", ")}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("email_templates")
    .insert({ name, subject, body: templateBody, category, is_active: true })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `Template name "${name}" already exists` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// ---------------------------------------------------------------------------
// PUT /api/email-templates — Update an existing template (pass id in body)
// ---------------------------------------------------------------------------
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, name, subject, body: templateBody, category, is_active } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (subject !== undefined) updates.subject = subject;
  if (templateBody !== undefined) updates.body = templateBody;
  if (category !== undefined) updates.category = category;
  if (is_active !== undefined) updates.is_active = is_active;

  const { data, error } = await supabase
    .from("email_templates")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// ---------------------------------------------------------------------------
// DELETE /api/email-templates — Delete a template (pass id in body)
// ---------------------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase.from("email_templates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
