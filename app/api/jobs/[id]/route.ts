import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isAdminRole, isProductionRole } from "@/lib/auth/roles";

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
      `id, job_number, status, quantity, po_number, po_file_path,
       scheduled_start, scheduled_completion, actual_start, actual_completion,
       notes, metadata, created_at, updated_at, created_by,
       customers(id, code, company_name, contact_name, contact_email),
       gmps(id, gmp_number, board_name, revision, board_side),
       boms(id, file_name, revision, status, component_count),
       quotes!jobs_quote_id_fkey(id, quote_number, status, quantities, pricing)`
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

// Fields production users are allowed to mutate. The kanban + scheduler
// flows touch only these â€” anything else is admin-only (PO numbers,
// pricing, metadata snapshots, etc.). Keeping the production allow-list
// narrow contains the blast radius if production credentials leak.
const PRODUCTION_WRITABLE_FIELDS = new Set([
  "status",
  "notes",
  "scheduled_start",
  "scheduled_completion",
  "programming_status",
]);

const VALID_PROGRAMMING_STATUSES = ["not_ready", "ready", "not_required"] as const;
type ProgrammingStatusValue = (typeof VALID_PROGRAMMING_STATUSES)[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  // The DB writes use the admin client. Production-role users have no
  // UPDATE policy on `jobs`, so a user-scoped update silently no-ops
  // (0 rows affected â†’ .single() returns null â†’ API surfaces 500 â†’
  // kanban reverts on refresh). Gating the role at the app layer and
  // writing via service role makes the write authoritative.
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Role gate: admins can mutate everything; production users can only
  // touch the kanban / scheduler fields.
  const { data: profile } = await admin
    .from("users")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_active) {
    return NextResponse.json({ error: "Account disabled" }, { status: 403 });
  }
  const callerIsAdmin = isAdminRole(profile?.role);
  const callerIsProduction = isProductionRole(profile?.role);
  if (!callerIsAdmin && !callerIsProduction) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    status?: string;
    notes?: string;
    po_number?: string;
    scheduled_start?: string;
    scheduled_completion?: string;
    metadata?: Record<string, unknown>;
    po_unit_price?: number | null;
    nre_charge_cad?: number | null;
    nre_included_on_po?: boolean;
    programming_status?: string;
    /** Customer-promised due date. Admin-only (it's the customer-facing
     *  commitment, not a production-internal target). */
    due_date?: string | null;
  };

  // For production callers, refuse the request if the body tries to set
  // any field outside the allow-list. Quietly ignoring would let UI bugs
  // silently fail to persist; an explicit 403 surfaces the issue.
  if (!callerIsAdmin) {
    const offenders = Object.keys(body).filter(
      (k) => body[k as keyof typeof body] !== undefined && !PRODUCTION_WRITABLE_FIELDS.has(k)
    );
    if (offenders.length > 0) {
      return NextResponse.json(
        {
          error: `Production role cannot set: ${offenders.join(", ")}. Allowed fields: ${[...PRODUCTION_WRITABLE_FIELDS].join(", ")}.`,
        },
        { status: 403 }
      );
    }
  }

  // Look up current job (use admin client so RLS doesn't hide the row).
  // Programming_status comes along for the ride so we can log a row in
  // job_status_log when it changes â€” same table as lifecycle changes,
  // discriminated by the `field` column added in migration 092.
  const { data: existing, error: fetchError } = await admin
    .from("jobs")
    .select("id, status, programming_status, quantity, ready_to_ship_qty")
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
    // Cascade-only statuses: 'invoiced' and 'archived' must NEVER be set
    // by a manual status PATCH (kanban drag, JobActions dropdown, etc.).
    // 'invoiced' is only set as a side-effect of /api/invoices POST when
    // SUM(invoice_lines.quantity) >= jobs.quantity. 'archived' is a
    // future-reserved terminal state. Allowing manual transitions here
    // produces phantom-invoiced jobs (status='invoiced' but no
    // invoice_lines), which corrupts the lockdown UI and the Pending
    // Invoice list.
    if (body.status === "invoiced" || body.status === "archived") {
      return NextResponse.json(
        {
          error: `Status '${body.status}' is set automatically by the system (invoice creation / archival flows). It cannot be set manually.`,
        },
        { status: 400 }
      );
    }
    update.status = body.status;
    // Invariant: status='shipping' implies all production complete â†’
    // ready_to_ship_qty must equal quantity. A manual kanban drag to
    // "Ready to Ship" doesn't otherwise touch ready_to_ship_qty, so the
    // job would land on the kanban but be invisible on the Pending
    // Shipment list (available_to_ship = 0). Bump it here so the two
    // surfaces stay consistent.
    if (
      body.status === "shipping" &&
      typeof existing.quantity === "number" &&
      (existing.ready_to_ship_qty ?? 0) < existing.quantity
    ) {
      update.ready_to_ship_qty = existing.quantity;
    }
  }
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.po_number !== undefined) update.po_number = body.po_number;
  if (body.scheduled_start !== undefined) update.scheduled_start = body.scheduled_start;
  if (body.scheduled_completion !== undefined)
    update.scheduled_completion = body.scheduled_completion;
  if (body.metadata !== undefined) update.metadata = body.metadata;
  if (body.programming_status !== undefined) {
    if (
      !VALID_PROGRAMMING_STATUSES.includes(body.programming_status as ProgrammingStatusValue)
    ) {
      return NextResponse.json(
        {
          error: `Invalid programming_status. Must be one of: ${VALID_PROGRAMMING_STATUSES.join(", ")}`,
        },
        { status: 400 }
      );
    }
    update.programming_status = body.programming_status;
  }
  if (body.po_unit_price !== undefined) update.po_unit_price = body.po_unit_price;
  if (body.nre_charge_cad !== undefined) update.nre_charge_cad = body.nre_charge_cad;
  if (body.nre_included_on_po !== undefined) update.nre_included_on_po = body.nre_included_on_po;
  if (body.due_date !== undefined) {
    // Accept null (clear the date) or YYYY-MM-DD; reject anything else.
    if (body.due_date === null) {
      update.due_date = null;
    } else if (
      typeof body.due_date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(body.due_date)
    ) {
      update.due_date = body.due_date;
    } else {
      return NextResponse.json(
        { error: "due_date must be YYYY-MM-DD or null" },
        { status: 400 }
      );
    }
  }

  const { data: updated, error: updateError } = await admin
    .from("jobs")
    .update(update)
    .eq("id", id)
    .select("id, job_number, status, updated_at")
    .single();

  if (updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Log status change if status was updated. Migration 092 added a
  // `field` discriminator to job_status_log so we can also log
  // programming_status transitions in the same table.
  if (body.status && body.status !== existing.status) {
    await admin.from("job_status_log").insert({
      job_id: id,
      field: "status",
      old_status: existing.status,
      new_status: body.status,
      changed_by: user.id,
      notes: body.notes ?? null,
    });
  }
  if (
    body.programming_status &&
    body.programming_status !== existing.programming_status
  ) {
    await admin.from("job_status_log").insert({
      job_id: id,
      field: "programming_status",
      old_status: existing.programming_status,
      new_status: body.programming_status,
      changed_by: user.id,
      notes: null,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Permission denied â€” only CEO can delete jobs" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Check if job exists
  const { data: job } = await admin.from("jobs").select("id, job_number").eq("id", jobId).single();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Block delete if invoices or procurements reference this job
  const [invoicesRes, procsRes] = await Promise.all([
    admin
      .from("invoices")
      .select("id, invoice_number")
      .eq("job_id", jobId)
      .limit(5),
    admin
      .from("procurements")
      .select("id, proc_code")
      .eq("job_id", jobId)
      .limit(5),
  ]);

  const blockingInvoices = invoicesRes.data ?? [];
  const blockingProcs = procsRes.data ?? [];

  if (blockingInvoices.length > 0 || blockingProcs.length > 0) {
    const parts: string[] = [];
    if (blockingInvoices.length > 0) parts.push(`${blockingInvoices.length} invoice(s)`);
    if (blockingProcs.length > 0) parts.push(`${blockingProcs.length} procurement(s)`);

    return NextResponse.json(
      {
        error: `Cannot delete â€” ${parts.join(" and ")} reference this job. Delete them first.`,
        blocking: {
          invoices: blockingInvoices,
          procurements: blockingProcs,
        },
      },
      { status: 409 }
    );
  }

  // Delete dependent records first (CASCADE would handle these, but be explicit)
  await admin.from("job_status_log").delete().eq("job_id", jobId);
  await admin.from("production_events").delete().eq("job_id", jobId);
  await admin.from("serial_numbers").delete().eq("job_id", jobId);

  // Delete the job record
  const { error } = await admin.from("jobs").delete().eq("id", jobId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, deleted: jobId });
}
