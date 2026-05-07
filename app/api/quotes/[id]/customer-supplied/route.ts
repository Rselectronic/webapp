import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
// ---------------------------------------------------------------------------
// /api/quotes/[id]/customer-supplied
//   POST   â€” add a BOM line to this quote's customer-supplied list.
//   DELETE â€” remove a BOM line from the list (query param ?bom_line_id=...).
//   GET    â€” list current customer-supplied lines for the quote.
//
// Writes to the `quote_customer_supplied` table. Same BOM part can be
// customer-supplied on one quote and RS-procured on the next â€” this table
// captures the per-quote decision.
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function authz(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), user: null };
  }
  const { data: profile } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if (!profile || !isAdminRole(profile.role)) {
    return {
      error: NextResponse.json(
        { error: "Admin role required" },
        { status: 403 }
      ),
      user: null,
    };
  }
  return { error: null, user };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: quoteId } = await params;
  if (!UUID_RE.test(quoteId)) {
    return NextResponse.json({ error: "Invalid quote id" }, { status: 400 });
  }
  const supabase = await createClient();
  const { error: authErr } = await authz(supabase);
  if (authErr) return authErr;

  const { data, error } = await supabase
    .from("quote_customer_supplied")
    .select("bom_line_id, notes, added_at, added_by")
    .eq("quote_id", quoteId);
  if (error) {
    return NextResponse.json({ error: "Failed to load", details: error.message }, { status: 500 });
  }
  return NextResponse.json({ customer_supplied: data ?? [] });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: quoteId } = await params;
  if (!UUID_RE.test(quoteId)) {
    return NextResponse.json({ error: "Invalid quote id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const bomLineId = typeof body.bom_line_id === "string" ? body.bom_line_id : "";
  if (!UUID_RE.test(bomLineId)) {
    return NextResponse.json({ error: "bom_line_id required" }, { status: 400 });
  }
  const notes = typeof body.notes === "string" ? body.notes : null;

  const supabase = await createClient();
  const { error: authErr, user } = await authz(supabase);
  if (authErr) return authErr;

  const { data, error } = await supabase
    .from("quote_customer_supplied")
    .upsert(
      {
        quote_id: quoteId,
        bom_line_id: bomLineId,
        notes,
        added_by: user!.id,
        added_at: new Date().toISOString(),
      },
      { onConflict: "quote_id,bom_line_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to mark customer-supplied", details: error.message },
      { status: 500 }
    );
  }

  // When a line is customer-supplied, any pinned supplier selections for it
  // are meaningless â€” RS doesn't buy it from anyone. Clear them so the quote
  // engine doesn't accidentally charge for it.
  await supabase
    .from("bom_line_pricing")
    .delete()
    .eq("bom_line_id", bomLineId);

  return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: quoteId } = await params;
  if (!UUID_RE.test(quoteId)) {
    return NextResponse.json({ error: "Invalid quote id" }, { status: 400 });
  }
  const url = new URL(req.url);
  const bomLineId = url.searchParams.get("bom_line_id") ?? "";
  if (!UUID_RE.test(bomLineId)) {
    return NextResponse.json({ error: "bom_line_id query param required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error: authErr } = await authz(supabase);
  if (authErr) return authErr;

  const { error } = await supabase
    .from("quote_customer_supplied")
    .delete()
    .eq("quote_id", quoteId)
    .eq("bom_line_id", bomLineId);
  if (error) {
    return NextResponse.json(
      { error: "Failed to unmark", details: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
