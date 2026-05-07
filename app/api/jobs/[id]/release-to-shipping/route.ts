/**
 * /api/jobs/[id]/release-to-shipping
 *
 * Operator-driven partial-build release flow. Production releases boards
 * from the floor to the shipping area in batches by incrementing
 * jobs.ready_to_ship_qty. When the released total reaches jobs.quantity,
 * the job auto-advances to status='shipping'. Decrementing back below
 * the quantity reverts shipping → (prior status from job_status_log,
 * else 'inspection').
 *
 * POST  — body: { release_qty: number }   increment by release_qty
 * PATCH — body: { ready_to_ship_qty: number }   absolute set (correction/undo)
 *
 * Auth: any signed-in user (admin or production). RLS enforces row access.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/server";

// Extra guard — server-side cap so we don't accept absurd values from a
// broken client. Real validation is the CHECK constraint + per-job math.
const MAX_INT = 1_000_000;

type Job = {
  id: string;
  status: string;
  quantity: number;
  ready_to_ship_qty: number;
};

async function loadJob(
  supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"],
  jobId: string
): Promise<Job | null> {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, status, quantity, ready_to_ship_qty")
    .eq("id", jobId)
    .maybeSingle();
  if (error) {
    console.error("[release-to-shipping] loadJob failed", {
      job_id: jobId,
      err: error.message,
    });
  }
  if (error || !data) return null;
  return data as Job;
}

/**
 * Sum of shipment_lines.quantity for this job across non-cancelled shipments.
 * Used to cap how low PATCH can drive ready_to_ship_qty (can't go below
 * what's already physically shipped).
 */
async function sumAlreadyShipped(
  supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"],
  jobId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("shipment_lines")
    .select("quantity, shipments!inner(status)")
    .eq("job_id", jobId);
  if (error) {
    console.error("[release-to-shipping] sumAlreadyShipped failed", {
      job_id: jobId,
      err: error.message,
    });
  }
  if (error || !data) return 0;
  return data.reduce((acc: number, r: { quantity: number | null; shipments: { status?: string | null } | { status?: string | null }[] | null }) => {
    const ship = Array.isArray(r.shipments) ? r.shipments[0] : r.shipments;
    if (ship?.status === "cancelled") return acc;
    const q = Number(r.quantity ?? 0);
    return acc + (Number.isFinite(q) ? q : 0);
  }, 0);
}

/**
 * Apply the auto-status rules after ready_to_ship_qty changes.
 *
 * Forward: production/inspection → shipping when ready == quantity.
 * Backward: shipping → (prior status, else inspection) when ready < quantity
 *           AND the job hasn't reached delivered/invoiced/archived yet.
 *
 * Writes a job_status_log entry on every transition.
 */
async function applyAutoStatus(
  supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"],
  job: Job,
  newReady: number,
  userId: string | null,
  reason: string
): Promise<{ status: string; transitioned: boolean }> {
  let { status } = job;
  let transitioned = false;
  // All WRITES on jobs / job_status_log use the admin client. The
  // user-scoped client lacks an UPDATE policy on jobs for production
  // users, so a user-scoped update silently no-ops and the auto-advance
  // appears to fail. Reads stay on the user-scoped client.
  const admin = createAdminClient();

  // Forward: ready == quantity from a production-side state.
  if (
    newReady >= job.quantity &&
    (status === "production" || status === "inspection")
  ) {
    const { error } = await admin
      .from("jobs")
      .update({ status: "shipping", updated_at: new Date().toISOString() })
      .eq("id", job.id);
    if (!error) {
      await admin.from("job_status_log").insert({
        job_id: job.id,
        field: "status",
        old_status: status,
        new_status: "shipping",
        changed_by: userId,
        notes: reason,
      });
      status = "shipping";
      transitioned = true;
    }
  }

  // Backward: pull out of shipping when ready drops below quantity. Only do
  // this if the job hasn't already moved beyond shipping (delivered etc) —
  // delivered's revert is handled by the shipments code path, not here.
  if (newReady < job.quantity && status === "shipping") {
    // Look up the prior status from job_status_log; fall back to inspection.
    // Production-role users have NO SELECT policy on job_status_log, so a
    // user-scoped read returns empty and the revert always lands on
    // 'inspection' even when the job was actually in 'production'. Read
    // through the admin client so the revert is faithful for both roles.
    const { data: priorRows } = await admin
      .from("job_status_log")
      .select("old_status, field")
      .eq("job_id", job.id)
      .eq("field", "status")
      .eq("new_status", "shipping")
      .order("created_at", { ascending: false })
      .limit(1);

    const prior = priorRows?.[0]?.old_status ?? "inspection";
    const target = prior === "production" || prior === "inspection" ? prior : "inspection";

    const { error } = await admin
      .from("jobs")
      .update({ status: target, updated_at: new Date().toISOString() })
      .eq("id", job.id);
    if (!error) {
      await admin.from("job_status_log").insert({
        job_id: job.id,
        field: "status",
        old_status: status,
        new_status: target,
        changed_by: userId,
        notes: reason,
      });
      status = target;
      transitioned = true;
    }
  }

  return { status, transitioned };
}

// ───────────────────────────────────────────────────────────────────────────
// POST — increment ready_to_ship_qty by release_qty.
// ───────────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: jobId } = await params;
  const body = await req.json().catch(() => ({}));
  const releaseQty = Number(body.release_qty);

  if (
    !Number.isFinite(releaseQty) ||
    !Number.isInteger(releaseQty) ||
    releaseQty <= 0 ||
    releaseQty > MAX_INT
  ) {
    return NextResponse.json(
      { error: "release_qty must be a positive integer" },
      { status: 400 }
    );
  }

  const job = await loadJob(supabase, jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const newReady = job.ready_to_ship_qty + releaseQty;
  if (newReady > job.quantity) {
    return NextResponse.json(
      {
        error: `Cannot release ${releaseQty}: would exceed job quantity. Currently released ${job.ready_to_ship_qty}/${job.quantity}; remaining capacity ${job.quantity - job.ready_to_ship_qty}.`,
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error: updErr } = await admin
    .from("jobs")
    .update({
      ready_to_ship_qty: newReady,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const result = await applyAutoStatus(
    supabase,
    job,
    newReady,
    user.id,
    `Released ${releaseQty} board(s) to shipping (total ${newReady}/${job.quantity})`
  );

  return NextResponse.json({
    job_id: jobId,
    ready_to_ship_qty: newReady,
    quantity: job.quantity,
    status: result.status,
    status_changed: result.transitioned,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// PATCH — set ready_to_ship_qty to an absolute value (correction / undo).
// ───────────────────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, supabase } = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: jobId } = await params;
  const body = await req.json().catch(() => ({}));
  const value = Number(body.ready_to_ship_qty);

  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_INT
  ) {
    return NextResponse.json(
      { error: "ready_to_ship_qty must be a non-negative integer" },
      { status: 400 }
    );
  }

  const job = await loadJob(supabase, jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (value > job.quantity) {
    return NextResponse.json(
      {
        error: `ready_to_ship_qty (${value}) cannot exceed job quantity (${job.quantity}).`,
      },
      { status: 400 }
    );
  }

  // Can't drop below already-shipped: a shipment line of qty N has already
  // pulled boards out of the building, so they're definitionally "released".
  const alreadyShipped = await sumAlreadyShipped(supabase, jobId);
  if (value < alreadyShipped) {
    return NextResponse.json(
      {
        error: `ready_to_ship_qty (${value}) cannot be less than already-shipped quantity (${alreadyShipped}). Cancel or reduce shipment lines first.`,
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error: updErr } = await admin
    .from("jobs")
    .update({
      ready_to_ship_qty: value,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const delta = value - job.ready_to_ship_qty;
  const reason =
    delta >= 0
      ? `Set ready-to-ship to ${value}/${job.quantity} (+${delta})`
      : `Set ready-to-ship to ${value}/${job.quantity} (${delta})`;

  const result = await applyAutoStatus(
    supabase,
    job,
    value,
    user.id,
    reason
  );

  return NextResponse.json({
    job_id: jobId,
    ready_to_ship_qty: value,
    quantity: job.quantity,
    status: result.status,
    status_changed: result.transitioned,
  });
}
