import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_STATUSES = [
  "created",
  "procurement",
  "parts_ordered",
  "parts_received",
  "production",
  "inspection",
  "shipping",
  "delivered",
  "invoiced",
  "archived",
] as const;

type JobStatus = (typeof VALID_STATUSES)[number];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job, error } = await supabase
    .from("jobs")
    .select(
      `id, job_number, status, quantity, assembly_type, po_number, po_file_path,
       scheduled_start, scheduled_completion, actual_start, actual_completion,
       notes, metadata, created_at, updated_at, created_by,
       customers(id, code, company_name, contact_name, contact_email),
       gmps(id, gmp_number, board_name, revision),
       boms(id, file_name, revision, status, component_count),
       quotes(id, quote_number, status, quantities, pricing)`
    )
    .eq("id", id)
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  // Fetch status log
  const { data: statusLog } = await supabase
    .from("job_status_log")
    .select("id, old_status, new_status, notes, created_at, changed_by")
    .eq("job_id", id)
    .order("created_at", { ascending: true });

  // Fetch production events
  const { data: productionEvents } = await supabase
    .from("production_events")
    .select("id, event_type, operator_id, notes, created_at")
    .eq("job_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    ...job,
    status_log: statusLog ?? [],
    production_events: productionEvents ?? [],
  });
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
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    status?: string;
    notes?: string;
    po_number?: string;
    scheduled_start?: string;
    scheduled_completion?: string;
    metadata?: Record<string, unknown>;
  };

  // Look up current job
  const { data: existing, error: fetchError } = await supabase
    .from("jobs")
    .select("id, status")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Build update payload
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.status) {
    if (!VALID_STATUSES.includes(body.status as JobStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    update.status = body.status;
  }
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.po_number !== undefined) update.po_number = body.po_number;
  if (body.scheduled_start !== undefined) update.scheduled_start = body.scheduled_start;
  if (body.scheduled_completion !== undefined)
    update.scheduled_completion = body.scheduled_completion;
  if (body.metadata !== undefined) update.metadata = body.metadata;

  const { data: updated, error: updateError } = await supabase
    .from("jobs")
    .update(update)
    .eq("id", id)
    .select("id, job_number, status, updated_at")
    .single();

  if (updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Log status change if status was updated
  if (body.status && body.status !== existing.status) {
    await supabase.from("job_status_log").insert({
      job_id: id,
      old_status: existing.status,
      new_status: body.status,
      changed_by: user.id,
      notes: body.notes ?? null,
    });
  }

  return NextResponse.json(updated);
}
