import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_STATUSES = [
  "draft",
  "review",
  "sent",
  "accepted",
  "rejected",
  "expired",
] as const;

type QuoteStatus = (typeof VALID_STATUSES)[number];

// ---------------------------------------------------------------------------
// GET /api/quotes/[id] — Fetch a single quote with joins
// ---------------------------------------------------------------------------
export async function GET(
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

  const { data, error } = await supabase
    .from("quotes")
    .select(
      "*, customers(code, company_name, contact_name, contact_email), gmps(gmp_number, board_name), boms(file_name, revision)"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Quote not found", details: error?.message },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

// ---------------------------------------------------------------------------
// PATCH /api/quotes/[id] — Update quote status and/or notes
// ---------------------------------------------------------------------------

interface PatchBody {
  status?: QuoteStatus;
  notes?: string;
}

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

  const body = (await req.json()) as PatchBody;

  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json(
      {
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // Build update object
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.status) {
    updates.status = body.status;

    if (body.status === "sent") {
      updates.issued_at = new Date().toISOString();
      // Set expiry based on validity_days
      const { data: existing } = await supabase
        .from("quotes")
        .select("validity_days")
        .eq("id", id)
        .single();
      if (existing?.validity_days) {
        const expires = new Date();
        expires.setDate(expires.getDate() + existing.validity_days);
        updates.expires_at = expires.toISOString();
      }
    }

    if (body.status === "accepted") {
      updates.accepted_at = new Date().toISOString();
    }
  }

  if (body.notes !== undefined) {
    updates.notes = body.notes;
  }

  const { data, error } = await supabase
    .from("quotes")
    .update(updates)
    .eq("id", id)
    .select("id, quote_number, status, issued_at, accepted_at, expires_at, notes")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to update quote", details: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
