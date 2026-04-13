import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/procurement-batches — List procurement batches
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  const admin = createAdminClient();
  let query = admin
    .from("procurement_batches")
    .select("*, procurement_batch_items(id, procurement_id, board_letter, procurements(proc_code, jobs(job_number, customers(code, company_name))))")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ batches: data });
}

/**
 * POST /api/procurement-batches — Create a new procurement batch
 *
 * Body: {
 *   batch_name: string,
 *   procurement_ids: string[],
 *   proc_batch_code?: string   // Optional manual override
 * }
 *
 * Equivalent to: Selecting rows in Job Queue → "Generate Proc Batch Code"
 * Groups multiple procurements for batch ordering.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { batch_name, procurement_ids, proc_batch_code } = body;

  if (!batch_name || !procurement_ids?.length) {
    return NextResponse.json(
      { error: "Required: batch_name, procurement_ids (at least 1)" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Validate procurements exist and are in a valid state for batching
  const { data: procs, error: procError } = await admin
    .from("procurements")
    .select("id, proc_code, job_id, status, total_lines, procurement_batch_id, jobs(job_number, customer_id, quantity, customers(code, company_name))")
    .in("id", procurement_ids);

  if (procError) return NextResponse.json({ error: procError.message }, { status: 500 });
  if (!procs || procs.length !== procurement_ids.length) {
    return NextResponse.json(
      { error: `Expected ${procurement_ids.length} procurements, found ${procs?.length ?? 0}.` },
      { status: 400 }
    );
  }

  // Check none are already in a batch
  const alreadyBatched = procs.filter((p) => p.procurement_batch_id);
  if (alreadyBatched.length > 0) {
    return NextResponse.json(
      { error: `${alreadyBatched.length} procurement(s) already belong to a batch.` },
      { status: 400 }
    );
  }

  // Create the batch
  const { data: batch, error: batchError } = await admin
    .from("procurement_batches")
    .insert({
      batch_name,
      proc_batch_code: proc_batch_code || null,
      status: "created",
      total_procurements: procurement_ids.length,
      created_by: user.id,
    })
    .select()
    .single();

  if (batchError || !batch) {
    return NextResponse.json({ error: "Failed to create batch", details: batchError?.message }, { status: 500 });
  }

  // Add procurements to the batch with board letters (A, B, C, ...)
  const batchItems = procs.map((proc, idx) => ({
    batch_id: batch.id,
    procurement_id: proc.id,
    job_id: proc.job_id,
    board_letter: String.fromCharCode(65 + idx), // A, B, C, ...
  }));

  const { error: itemsError } = await admin.from("procurement_batch_items").insert(batchItems);
  if (itemsError) {
    return NextResponse.json({ error: "Failed to add procurements to batch", details: itemsError.message }, { status: 500 });
  }

  // Mark procurements as belonging to this batch (single batch query)
  const procIds = procs.map((p: { id: string }) => p.id);
  await admin
    .from("procurements")
    .update({ procurement_batch_id: batch.id })
    .in("id", procIds);

  // Log
  await admin.from("procurement_batch_log").insert({
    batch_id: batch.id,
    action: "created",
    new_status: "created",
    details: {
      procurement_count: procurement_ids.length,
      board_letters: batchItems.map((b) => b.board_letter),
      procurements: procs.map((p) => ({
        proc_code: p.proc_code,
        job: (p.jobs as unknown as { job_number: string })?.job_number,
      })),
    },
    performed_by: user.id,
  });

  return NextResponse.json({
    batch_id: batch.id,
    batch_name: batch.batch_name,
    status: batch.status,
    procurement_count: procurement_ids.length,
    board_letters: batchItems.map((b) => b.board_letter),
  });
}
