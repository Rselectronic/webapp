import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getJobInvoiceTotals } from "@/lib/invoices/totals";
import { todayMontreal } from "@/lib/utils/format";

const INVOICE_DETAIL_EMBED =
  "*, customers(code, company_name, contact_name, payment_terms), jobs(job_number, gmp_id, gmps(gmp_number, board_name)), invoice_lines(*, jobs(id, job_number, quantity, gmps(gmp_number, board_name)))";

// ---------------------------------------------------------------------------
// GET /api/invoices/[id] — Fetch a single invoice with joins (incl. lines)
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

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(INVOICE_DETAIL_EMBED)
    .eq("id", id)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // Compute days_outstanding
  let days_outstanding: number | null = null;
  if (
    invoice.issued_date &&
    invoice.status !== "paid" &&
    invoice.status !== "cancelled"
  ) {
    const issued = new Date(invoice.issued_date).getTime();
    days_outstanding = Math.floor(
      (Date.now() - issued) / (1000 * 60 * 60 * 24)
    );
  }

  return NextResponse.json({ ...invoice, days_outstanding });
}

// ---------------------------------------------------------------------------
// PATCH /api/invoices/[id] — Update invoice status / payment info
// ---------------------------------------------------------------------------
//
// INTENTIONAL — marking an invoice paid does NOT cascade to the linked jobs'
// status. The job lifecycle ends at 'invoiced' (the job left the floor and
// was billed). Whether the customer has actually paid is a financial sub-
// state on the invoice, not part of the production-side job lifecycle.
// Don't add a cascade here without explicit product approval — the kanban
// + reports treat 'invoiced' as a terminal state.
//
// For full line replacement / re-billing, use PATCH /api/invoices (no [id])
// which carries the heavier validation + per-job re-evaluation logic.
// ---------------------------------------------------------------------------
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

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json(
      { error: "Forbidden — only admins can modify invoices." },
      { status: 403 }
    );
  }

  const body = (await req.json()) as {
    status?: string;
    paid_date?: string;
    payment_method?: string;
    notes?: string;
  };

  const updates: Record<string, unknown> = {};

  if (body.status !== undefined) {
    updates.status = body.status;
    // Auto-set paid_date when marking as paid (if not explicitly provided)
    if (body.status === "paid" && !body.paid_date) {
      updates.paid_date = todayMontreal();
    }
  }
  if (body.paid_date !== undefined) updates.paid_date = body.paid_date;
  if (body.payment_method !== undefined) updates.payment_method = body.payment_method;
  if (body.notes !== undefined) updates.notes = body.notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  updates.updated_at = new Date().toISOString();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !invoice) {
    return NextResponse.json(
      { error: "Failed to update invoice", details: error?.message },
      { status: 500 }
    );
  }

  // If status flipped to 'cancelled', the linked jobs are no longer fully
  // invoiced. Re-evaluate every job on this invoice and roll
  // 'invoiced' → 'delivered' for any that drop below threshold. Also
  // re-derive jobs.nre_invoiced from the remaining live NRE lines — if
  // this invoice's NRE line was the only one, the job becomes eligible
  // for NRE billing on the next invoice.
  if (body.status === "cancelled") {
    const { data: lines } = await supabase
      .from("invoice_lines")
      .select("job_id")
      .eq("invoice_id", id);
    const jobIds = Array.from(new Set((lines ?? []).map((l) => l.job_id)));
    const admin = createAdminClient();
    for (const jobId of jobIds) {
      const totals = await getJobInvoiceTotals(supabase, jobId);
      if (totals.invoiced >= totals.jobQuantity && totals.jobQuantity > 0) continue;
      const { data: job } = await supabase
        .from("jobs")
        .select("status")
        .eq("id", jobId)
        .maybeSingle();
      if (job?.status !== "invoiced") continue;
      await admin
        .from("jobs")
        .update({ status: "delivered", updated_at: new Date().toISOString() })
        .eq("id", jobId);
      await admin.from("job_status_log").insert({
        job_id: jobId,
        field: "status",
        old_status: "invoiced",
        new_status: "delivered",
        changed_by: user.id,
        notes: `Invoice ${invoice.invoice_number} cancelled`,
      });
    }
    // Re-derive nre_invoiced for every job that was on this invoice.
    if (jobIds.length > 0) {
      await reevaluateJobsNreInvoiced(admin, jobIds);
    }
  }

  return NextResponse.json(invoice);
}

// ---------------------------------------------------------------------------
// DELETE /api/invoices/[id] — Delete an invoice (admin only, not if paid)
// ---------------------------------------------------------------------------
export async function DELETE(
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

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json(
      { error: "Permission denied — only an admin can delete invoices" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  const { data: invoice } = await admin
    .from("invoices")
    .select("id, status, pdf_path, invoice_number")
    .eq("id", id)
    .single();

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (invoice.status === "paid") {
    return NextResponse.json(
      { error: "Cannot delete a paid invoice. Cancel it first if needed." },
      { status: 409 }
    );
  }

  // Capture which jobs were on this invoice BEFORE the cascade nukes the
  // invoice_lines rows — we need to re-evaluate each one afterwards.
  const { data: priorLines } = await admin
    .from("invoice_lines")
    .select("job_id")
    .eq("invoice_id", id);
  const affectedJobIds = Array.from(new Set((priorLines ?? []).map((l) => l.job_id)));

  // Delete associated payments
  await admin.from("payments").delete().eq("invoice_id", id);

  // Delete the invoice PDF from storage if it exists
  if (invoice.pdf_path) {
    await admin.storage
      .from("invoices")
      .remove([invoice.pdf_path])
      .catch(() => {});
  }

  // Delete the invoice record. invoice_lines cascade-deletes via FK ON DELETE CASCADE.
  const { error } = await admin.from("invoices").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // After delete, re-evaluate each job that was on the invoice. If the job
  // is no longer fully covered, revert 'invoiced' → 'delivered'.
  for (const jobId of affectedJobIds) {
    const totals = await getJobInvoiceTotals(supabase, jobId);
    if (totals.jobQuantity > 0 && totals.invoiced >= totals.jobQuantity) continue;
    const { data: job } = await admin
      .from("jobs")
      .select("status")
      .eq("id", jobId)
      .maybeSingle();
    if (job?.status !== "invoiced") continue;
    await admin
      .from("jobs")
      .update({ status: "delivered", updated_at: new Date().toISOString() })
      .eq("id", jobId);
    await admin.from("job_status_log").insert({
      job_id: jobId,
      field: "status",
      old_status: "invoiced",
      new_status: "delivered",
      changed_by: user.id,
      notes: `Invoice ${invoice.invoice_number} deleted`,
    });
  }

  // Re-derive jobs.nre_invoiced from the remaining live NRE lines.
  // The cascade-deleted invoice_lines may have included the only live
  // is_nre row for some jobs — flip those flags back to FALSE so the
  // next invoice for that job re-bills NRE.
  if (affectedJobIds.length > 0) {
    await reevaluateJobsNreInvoiced(admin, affectedJobIds);
  }

  return NextResponse.json({ success: true, deleted: id });
}

// ---------------------------------------------------------------------------
// Re-derive jobs.nre_invoiced from current invoice_lines state.
// Called after invoice cancel/delete — the cached flag on jobs is only as
// fresh as the most recent state-changing action, and a cancelled or
// deleted invoice may have carried the only live NRE line for some of its
// jobs.
// ---------------------------------------------------------------------------
async function reevaluateJobsNreInvoiced(
  admin: ReturnType<typeof createAdminClient>,
  jobIds: string[]
): Promise<void> {
  if (jobIds.length === 0) return;

  const { data: liveNre } = await admin
    .from("invoice_lines")
    .select("job_id, invoices!inner(status)")
    .eq("is_nre", true)
    .in("job_id", jobIds);

  const stillBilled = new Set(
    ((liveNre ?? []) as Array<{
      job_id: string;
      invoices: { status?: string | null } | { status?: string | null }[] | null;
    }>)
      .filter((r) => {
        const inv = Array.isArray(r.invoices) ? r.invoices[0] : r.invoices;
        return inv?.status !== "cancelled";
      })
      .map((r) => r.job_id)
  );

  for (const jobId of jobIds) {
    await admin
      .from("jobs")
      .update({
        nre_invoiced: stillBilled.has(jobId),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}
