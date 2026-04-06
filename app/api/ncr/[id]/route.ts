import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/ncr/[id] — Fetch a single NCR with joins
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

  const { data: ncr, error } = await supabase
    .from("ncr_reports")
    .select(
      "*, customers(code, company_name, contact_name), jobs(job_number, gmp_id, gmps(gmp_number, board_name))"
    )
    .eq("id", id)
    .single();

  if (error || !ncr) {
    return NextResponse.json({ error: "NCR not found" }, { status: 404 });
  }

  return NextResponse.json(ncr);
}

// ---------------------------------------------------------------------------
// PATCH /api/ncr/[id] — Update NCR (status, root cause, actions)
// ---------------------------------------------------------------------------
const VALID_STATUSES = [
  "open",
  "investigating",
  "corrective_action",
  "closed",
] as const;

type NCRStatus = (typeof VALID_STATUSES)[number];

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
    status?: string;
    root_cause?: string;
    corrective_action?: string;
    preventive_action?: string;
    severity?: string;
    description?: string;
  };

  const updates: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status as NCRStatus)) {
      return NextResponse.json(
        {
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
        },
        { status: 400 }
      );
    }
    updates.status = body.status;

    // Auto-set closed_at when closing
    if (body.status === "closed") {
      updates.closed_at = new Date().toISOString();
    }
  }

  if (body.root_cause !== undefined) updates.root_cause = body.root_cause;
  if (body.corrective_action !== undefined)
    updates.corrective_action = body.corrective_action;
  if (body.preventive_action !== undefined)
    updates.preventive_action = body.preventive_action;
  if (body.severity !== undefined) updates.severity = body.severity;
  if (body.description !== undefined) updates.description = body.description;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  updates.updated_at = new Date().toISOString();

  const { data: ncr, error } = await supabase
    .from("ncr_reports")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !ncr) {
    return NextResponse.json(
      { error: "Failed to update NCR", details: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json(ncr);
}
