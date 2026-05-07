import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
// Lazy-imported below so a missing/failing inventory module never breaks
// production logging — see consumeProcAllocationsForJob.

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

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, status")
    .eq("id", body.job_id)
    .single();

  if (jobErr) {
    // Surface RLS / FK / dropped-column failures — otherwise empty from a
    // policy-denied read looks identical to "no such job" and we'd 404 on
    // perfectly valid IDs.
    console.error("[production] job lookup failed", {
      job_id: body.job_id,
      err: jobErr.message,
    });
  }
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

  // Inventory consumption hook: when this is the first production event for
  // any job in the parent PROC, flip every reserved BG / Safety allocation
  // to 'consumed' (and the allocator's helper writes the matching negative
  // ledger movement). Wrapped in try/catch — never block the production
  // event response.
  //
  // We pass an ADMIN client to the cascade because production-role users
  // have no policy on `inventory_allocations` / `inventory_movements`
  // (those are admin-only at the RLS layer). Routing the user-scoped
  // client through `consumeAllocation` would silently no-op the UPDATE
  // and never write the movement ledger row — allocations would remain
  // 'reserved' forever for production-logged jobs.
  consumeProcAllocationsForJob(body.job_id, user.id).catch((err) => {
    console.warn("[production-event] inventory consume hook failed", {
      job_id: body.job_id,
      err,
    });
  });

  return NextResponse.json(event);
}

/**
 * If this was the FIRST production_event for any job in the linked PROC,
 * consume every reserved allocation against that PROC. Best-effort.
 *
 * Always uses the admin client. Production-role users have no RLS policy
 * on `inventory_allocations` / `inventory_movements`, so a user-scoped
 * cascade would silently fail (UPDATE returns 0 rows, INSERT is denied).
 */
async function consumeProcAllocationsForJob(
  jobId: string,
  userId: string,
): Promise<void> {
  const admin = createAdminClient();

  // 1. Find this job's PROC.
  const { data: job } = await admin
    .from("jobs")
    .select("procurement_id")
    .eq("id", jobId)
    .single();
  const procId = job?.procurement_id ?? null;
  if (!procId) return;

  // 2. Count production_events across every job in that PROC. We just
  //    inserted one, so count==1 means this PROC has truly never been built
  //    on before. Two queries: list all jobs in the PROC, then count
  //    events filtered by job_id IN (...). Cheaper than a join for typical
  //    batch sizes.
  const { data: procJobs } = await admin
    .from("jobs")
    .select("id")
    .eq("procurement_id", procId);
  const procJobIds = (procJobs ?? []).map((j) => j.id as string);
  if (procJobIds.length === 0) return;

  const { count: eventCount } = await admin
    .from("production_events")
    .select("id", { count: "exact", head: true })
    .in("job_id", procJobIds);

  if ((eventCount ?? 0) !== 1) return; // Not the first event — nothing to do.

  // 3. Pull every reserved allocation for this PROC.
  const { data: allocs } = await admin
    .from("inventory_allocations")
    .select("id")
    .eq("procurement_id", procId)
    .eq("status", "reserved");
  if (!allocs || allocs.length === 0) return;

  // 4. Consume each via the sibling agent's allocator helper. Lazy-import
  //    to avoid hard-coupling the module graph if the helper hasn't
  //    landed yet.
  type ConsumeFn = (
    sb: ReturnType<typeof createAdminClient>,
    allocationId: string,
    ctx: { job_id: string; user_id: string },
  ) => Promise<unknown>;

  let consumeAllocation: ConsumeFn | null = null;
  try {
    const mod = (await import("@/lib/inventory/allocator")) as unknown as {
      consumeAllocation?: ConsumeFn;
    };
    consumeAllocation = mod.consumeAllocation ?? null;
  } catch {
    // Module not present yet — skip silently. Allocations stay reserved
    // until the next production event; the helper will consume them then.
    return;
  }
  const fn = consumeAllocation;
  if (!fn) return;

  for (const a of allocs as Array<{ id: string }>) {
    try {
      await fn(admin, a.id, { job_id: jobId, user_id: userId });
    } catch (err) {
      console.warn("[production-event] consumeAllocation failed", {
        allocation_id: a.id,
        err,
      });
    }
  }
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
