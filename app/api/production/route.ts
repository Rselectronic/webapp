import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_EVENT_TYPES = [
  "materials_received",
  "setup_started",
  "smt_top_start",
  "smt_top_end",
  "smt_bottom_start",
  "smt_bottom_end",
  "reflow_start",
  "reflow_end",
  "aoi_start",
  "aoi_passed",
  "aoi_failed",
  "through_hole_start",
  "through_hole_end",
  "touchup",
  "washing",
  "packing",
  "ready_to_ship",
] as const;

type EventType = (typeof VALID_EVENT_TYPES)[number];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    job_id?: string;
    event_type?: string;
    notes?: string;
  };

  if (!body.job_id || !body.event_type) {
    return NextResponse.json(
      { error: "job_id and event_type are required" },
      { status: 400 }
    );
  }

  if (!VALID_EVENT_TYPES.includes(body.event_type as EventType)) {
    return NextResponse.json(
      { error: `Invalid event_type: ${body.event_type}` },
      { status: 400 }
    );
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, status")
    .eq("id", body.job_id)
    .single();

  if (!job)
    return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const { data: event, error } = await supabase
    .from("production_events")
    .insert({
      job_id: body.job_id,
      event_type: body.event_type,
      operator_id: user.id,
      notes: body.notes ?? null,
    })
    .select("id, job_id, event_type, notes, created_at")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(event);
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const jobId = url.searchParams.get("job_id");

  let query = supabase
    .from("production_events")
    .select(
      "id, job_id, event_type, notes, created_at, jobs(job_number, customers(code))"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (jobId) {
    query = query.eq("job_id", jobId);
  }

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ events: data ?? [] });
}
