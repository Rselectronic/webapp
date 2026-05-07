import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getJobShipmentTotals } from "@/lib/shipments/totals";

// ---------------------------------------------------------------------------
// Shipments API — multi-job (1..N jobs per shipment) after migration 099.
//
// Shape:
//   shipments         : one physical shipment (carrier, tracking, customer)
//   shipment_lines    : one row per job carried, with its quantity
//
// Validation:
//   - shipment.customer_id must match jobs.customer_id on every line
//   - per-job over-shipment guard: SUM(shipment_lines.quantity) <= job.quantity
//   - per-job release guard: shipped quantity must not exceed
//     jobs.ready_to_ship_qty (production must release before shipping)
//
// Auto-status:
//   - per job, fully-shipped (ship_date set + sum >= quantity) → delivered
//   - reversible: drop below threshold → revert delivered → shipping
// ---------------------------------------------------------------------------

const VALID_CARRIERS = [
  "FedEx",
  "Purolator",
  "UPS",
  "Canada Post",
  "Customer Pickup",
  "Other",
] as const;

type LineInput = { id?: string; job_id: string; quantity: number };

// ---------------------------------------------------------------------------
// GET /api/shipments — List shipments with optional filters
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const carrier = url.searchParams.get("carrier");
  const jobId = url.searchParams.get("job_id");

  // Filtering by job_id needs a two-step query: shipment_lines → shipment ids.
  // PostgREST's inner-embed filter is awkward and easy to get wrong, so go
  // explicit.
  let allowedShipmentIds: string[] | null = null;
  if (jobId) {
    const { data: lines, error: linesErr } = await supabase
      .from("shipment_lines")
      .select("shipment_id")
      .eq("job_id", jobId);
    if (linesErr) {
      return NextResponse.json({ error: linesErr.message }, { status: 500 });
    }
    allowedShipmentIds = Array.from(new Set((lines ?? []).map((l) => l.shipment_id)));
    if (allowedShipmentIds.length === 0) {
      return NextResponse.json([]);
    }
  }

  let query = supabase
    .from("shipments")
    .select(
      "*, customers(code, company_name), shipment_lines(id, job_id, quantity, jobs(id, job_number, quantity, gmps(gmp_number, board_name)))"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);
  if (carrier) query = query.eq("carrier", carrier);
  if (allowedShipmentIds) query = query.in("id", allowedShipmentIds);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// ---------------------------------------------------------------------------
// Helper: re-evaluate a single job's shipping/delivered status.
//
// Fully-shipped condition:
//   - SUM(shipment_lines.quantity) for non-cancelled shipments >= jobs.quantity
//   - AND at least one of those shipments has ship_date set
//
// Forward: shipping → delivered when fully shipped.
// Reverse: delivered → shipping when no longer fully shipped (e.g. a line
//          was deleted or its qty reduced).
// ---------------------------------------------------------------------------
async function reevaluateJobStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  userId: string,
  reasonNote: string
): Promise<void> {
  try {
    // The status read uses whichever client was passed in (user-scoped is
    // fine — production has SELECT on jobs). The WRITES go through admin
    // because production-role users have NO UPDATE policy on `jobs`, so a
    // user-scoped update silently no-ops and the job gets stuck in
    // 'shipping' even after it's fully shipped. Server-internal cascade
    // logic should not be gated by the caller's RLS.
    const admin = createAdminClient();

    const { data: job, error: jobReadErr } = await supabase
      .from("jobs")
      .select("status, quantity")
      .eq("id", jobId)
      .maybeSingle();
    if (jobReadErr) {
      console.warn("[shipments] reevaluate job read failed", jobReadErr.message);
    }
    if (!job) return;

    const totals = await getJobShipmentTotals(supabase, jobId);

    // Is at least one shipment carrying this job actually out the door?
    const { data: shippedLines, error: shippedLinesErr } = await supabase
      .from("shipment_lines")
      .select("shipments!inner(ship_date, status)")
      .eq("job_id", jobId);
    if (shippedLinesErr) {
      console.warn("[shipments] shipped lines read failed", shippedLinesErr.message);
    }

    const hasShippedRow = (shippedLines ?? []).some((row: { shipments: { ship_date?: string | null; status?: string | null } | { ship_date?: string | null; status?: string | null }[] | null }) => {
      const ship = Array.isArray(row.shipments) ? row.shipments[0] : row.shipments;
      return ship && ship.status !== "cancelled" && ship.ship_date;
    });

    const fullyShipped =
      totals.jobQuantity > 0 &&
      totals.shipped >= totals.jobQuantity &&
      hasShippedRow;

    if (fullyShipped && job.status === "shipping") {
      const { error: jobUpdateErr } = await admin
        .from("jobs")
        .update({
          status: "delivered",
          actual_completion: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      if (jobUpdateErr) {
        console.warn("[shipments] job advance to delivered failed", jobUpdateErr.message);
        return;
      }
      await admin.from("job_status_log").insert({
        job_id: jobId,
        field: "status",
        old_status: "shipping",
        new_status: "delivered",
        changed_by: userId,
        notes: reasonNote,
      });
      return;
    }

    if (!fullyShipped && job.status === "delivered") {
      const { error: jobUpdateErr } = await admin
        .from("jobs")
        .update({
          status: "shipping",
          actual_completion: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      if (jobUpdateErr) {
        console.warn("[shipments] job revert to shipping failed", jobUpdateErr.message);
        return;
      }
      await admin.from("job_status_log").insert({
        job_id: jobId,
        field: "status",
        old_status: "delivered",
        new_status: "shipping",
        changed_by: userId,
        notes: reasonNote,
      });
    }
  } catch (e) {
    console.warn("[shipments] reevaluateJobStatus threw", e);
  }
}

// ---------------------------------------------------------------------------
// Helper: validate lines payload + cross-checks against jobs.
//   - non-empty array of {job_id, quantity}
//   - quantities positive integers
//   - all jobs belong to the supplied customer_id
//   - new total per job ≤ jobs.quantity (over-shipment guard)
//   - new total per job ≤ jobs.ready_to_ship_qty (release guard)
//
// `excludeShipmentId` is used when validating a PATCH — exclude lines from
// the shipment we're rewriting (caller will replace them anyway).
// ---------------------------------------------------------------------------
async function validateLines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerId: string,
  lines: LineInput[],
  excludeShipmentId: string | null = null
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { ok: false, status: 400, error: "lines must be a non-empty array" };
  }
  for (const l of lines) {
    if (!l.job_id) {
      return { ok: false, status: 400, error: "Every line requires job_id" };
    }
    const q = Number(l.quantity);
    if (!Number.isFinite(q) || !Number.isInteger(q) || q <= 0) {
      return {
        ok: false,
        status: 400,
        error: `Line quantity for job ${l.job_id} must be a positive integer`,
      };
    }
  }

  const jobIds = Array.from(new Set(lines.map((l) => l.job_id)));
  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select("id, customer_id, quantity, ready_to_ship_qty, job_number")
    .in("id", jobIds);
  if (jobsErr) return { ok: false, status: 500, error: jobsErr.message };

  const jobMap = new Map(jobs!.map((j) => [j.id, j]));
  for (const id of jobIds) {
    if (!jobMap.has(id)) {
      return { ok: false, status: 400, error: `Job ${id} not found` };
    }
    const j = jobMap.get(id)!;
    if (j.customer_id !== customerId) {
      return {
        ok: false,
        status: 400,
        error: `Job ${j.job_number} (${id}) does not belong to customer ${customerId}`,
      };
    }
  }

  // Aggregate proposed quantity per job.
  const proposedByJob = new Map<string, number>();
  for (const l of lines) {
    proposedByJob.set(l.job_id, (proposedByJob.get(l.job_id) ?? 0) + Number(l.quantity));
  }

  // For each job, fetch existing shipment_lines (excluding the shipment we're
  // about to rewrite if PATCH). Sum + proposed must fit within both quantity
  // and ready_to_ship_qty.
  for (const [jobId, proposed] of proposedByJob.entries()) {
    let existingQuery = supabase
      .from("shipment_lines")
      .select("quantity, shipment_id, shipments!inner(status)")
      .eq("job_id", jobId);
    if (excludeShipmentId) {
      existingQuery = existingQuery.neq("shipment_id", excludeShipmentId);
    }
    const { data: existing, error: existErr } = await existingQuery;
    if (existErr) return { ok: false, status: 500, error: existErr.message };

    const existingTotal = (existing ?? []).reduce((acc: number, r: { quantity: number | null; shipments: { status?: string | null } | { status?: string | null }[] | null }) => {
      const ship = Array.isArray(r.shipments) ? r.shipments[0] : r.shipments;
      if (ship?.status === "cancelled") return acc;
      const q = Number(r.quantity ?? 0);
      return acc + (Number.isFinite(q) ? q : 0);
    }, 0);

    const job = jobMap.get(jobId)!;
    const total = existingTotal + proposed;

    if (total > job.quantity) {
      const over = total - job.quantity;
      return {
        ok: false,
        status: 400,
        error: `Job ${job.job_number}: shipment qty ${proposed} would exceed job quantity by ${over}. Job total ${job.quantity}, already shipped ${existingTotal}.`,
      };
    }
    if (total > job.ready_to_ship_qty) {
      const short = total - job.ready_to_ship_qty;
      return {
        ok: false,
        status: 400,
        error: `Job ${job.job_number}: only ${job.ready_to_ship_qty} board(s) released to shipping; need ${short} more before this can ship.`,
      };
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// POST /api/shipments — Create a shipment with N lines
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    customer_id,
    carrier,
    tracking_number,
    ship_date,
    estimated_delivery,
    shipping_cost,
    notes,
    picked_up_by,
    lines,
  } = body as {
    customer_id?: string;
    carrier?: string;
    tracking_number?: string | null;
    ship_date?: string | null;
    estimated_delivery?: string | null;
    shipping_cost?: number;
    notes?: string | null;
    picked_up_by?: string | null;
    lines?: LineInput[];
  };

  if (!customer_id || !carrier) {
    return NextResponse.json(
      { error: "customer_id and carrier are required" },
      { status: 400 }
    );
  }
  if (!VALID_CARRIERS.includes(carrier as (typeof VALID_CARRIERS)[number])) {
    return NextResponse.json(
      { error: `carrier must be one of: ${VALID_CARRIERS.join(", ")}` },
      { status: 400 }
    );
  }

  const validation = await validateLines(supabase, customer_id, lines ?? []);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const isPickup = carrier === "Customer Pickup";

  // Shipment status flow:
  //   - Pickup with ship_date → delivered (no in-transit stage).
  //   - Courier with ship_date → shipped.
  //   - No ship_date → pending.
  const status = isPickup && ship_date
    ? "delivered"
    : ship_date
      ? "shipped"
      : "pending";

  const { data: shipment, error: shipErr } = await supabase
    .from("shipments")
    .insert({
      customer_id,
      carrier,
      tracking_number: isPickup ? null : (tracking_number || null),
      ship_date: ship_date || null,
      estimated_delivery: isPickup ? null : (estimated_delivery || null),
      shipping_cost: isPickup ? 0 : (shipping_cost || 0),
      picked_up_by: isPickup ? (picked_up_by || null) : null,
      status,
      notes: notes || null,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (shipErr || !shipment) {
    return NextResponse.json({ error: shipErr?.message ?? "Insert failed" }, { status: 500 });
  }

  // Insert lines. If any fail, roll back the shipment row (best-effort —
  // Supabase JS doesn't expose real transactions to clients).
  const lineRows = lines!.map((l) => ({
    shipment_id: shipment.id,
    job_id: l.job_id,
    quantity: Number(l.quantity),
  }));
  const { error: linesErr } = await supabase.from("shipment_lines").insert(lineRows);
  if (linesErr) {
    await supabase.from("shipments").delete().eq("id", shipment.id);
    return NextResponse.json(
      { error: `Failed to insert shipment lines: ${linesErr.message}` },
      { status: 500 }
    );
  }

  // Re-evaluate every affected job. Each one may individually become
  // delivered if ship_date is set and its cumulative total reached qty.
  if (ship_date) {
    const uniqueJobs = Array.from(new Set(lines!.map((l) => l.job_id)));
    for (const jobId of uniqueJobs) {
      await reevaluateJobStatus(
        supabase,
        jobId,
        user.id,
        `Shipment created (${carrier})`
      );
    }
  }

  // Re-fetch with relations so the client gets the same shape as GET.
  const { data: full, error: fullErr } = await supabase
    .from("shipments")
    .select(
      "*, customers(code, company_name), shipment_lines(id, job_id, quantity, jobs(id, job_number, quantity, gmps(gmp_number, board_name)))"
    )
    .eq("id", shipment.id)
    .single();
  if (fullErr) {
    console.warn("[shipments] post-insert refetch failed", fullErr.message);
  }

  return NextResponse.json(full ?? shipment, { status: 201 });
}

// ---------------------------------------------------------------------------
// PATCH /api/shipments — Update a shipment (and optionally replace its lines)
// ---------------------------------------------------------------------------
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { id, lines, ...updates } = body as {
    id?: string;
    lines?: LineInput[];
  } & Record<string, unknown>;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { data: existing, error: existingErr } = await supabase
    .from("shipments")
    .select("id, customer_id, ship_date, status, carrier")
    .eq("id", id)
    .maybeSingle();
  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  // Capture which jobs are touched: the union of (jobs from current lines)
  // and (jobs from incoming lines, if any). Every one of those needs status
  // re-evaluation after the write.
  const { data: priorLines, error: priorLinesErr } = await supabase
    .from("shipment_lines")
    .select("job_id")
    .eq("shipment_id", id);
  if (priorLinesErr) {
    console.warn("[shipments] prior lines read failed", priorLinesErr.message);
  }
  const priorJobIds = new Set((priorLines ?? []).map((l) => l.job_id));

  // Validate carrier change if present.
  if (updates.carrier !== undefined) {
    if (!VALID_CARRIERS.includes(updates.carrier as (typeof VALID_CARRIERS)[number])) {
      return NextResponse.json(
        { error: `carrier must be one of: ${VALID_CARRIERS.join(", ")}` },
        { status: 400 }
      );
    }
  }

  // If lines provided, validate against the (possibly updated) customer_id.
  const effectiveCustomerId = (updates.customer_id as string | undefined) ?? existing.customer_id;
  let lineReplacement: LineInput[] | null = null;
  if (Array.isArray(lines)) {
    const validation = await validateLines(supabase, effectiveCustomerId, lines, id);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }
    lineReplacement = lines;
  }

  updates.updated_at = new Date().toISOString();

  const { error: updErr } = await supabase
    .from("shipments")
    .update(updates)
    .eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Replace lines if requested. Full delete-then-insert; best-effort
  // rollback on insert failure.
  if (lineReplacement) {
    const { error: delErr } = await supabase
      .from("shipment_lines")
      .delete()
      .eq("shipment_id", id);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
    const newRows = lineReplacement.map((l) => ({
      shipment_id: id,
      job_id: l.job_id,
      quantity: Number(l.quantity),
    }));
    if (newRows.length > 0) {
      const { error: insErr } = await supabase.from("shipment_lines").insert(newRows);
      if (insErr) {
        return NextResponse.json(
          { error: `Failed to replace shipment lines: ${insErr.message}` },
          { status: 500 }
        );
      }
    }
  }

  // Re-evaluate every job that was affected (prior or new).
  const newJobIds = new Set((lineReplacement ?? []).map((l) => l.job_id));
  const allJobIds = new Set<string>([...priorJobIds, ...newJobIds]);
  for (const jobId of allJobIds) {
    await reevaluateJobStatus(supabase, jobId, user.id, `Shipment ${id.slice(0, 8)} updated`);
  }

  const { data: full, error: fullErr } = await supabase
    .from("shipments")
    .select(
      "*, customers(code, company_name), shipment_lines(id, job_id, quantity, jobs(id, job_number, quantity, gmps(gmp_number, board_name)))"
    )
    .eq("id", id)
    .single();
  if (fullErr) {
    console.warn("[shipments] post-update refetch failed", fullErr.message);
  }

  return NextResponse.json(full);
}
