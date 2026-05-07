import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/server";
import {
  generateProcCode,
  type ProcurementMode,
} from "@/lib/proc/generate-proc-code";
import { autoAllocateProcInventory } from "@/lib/inventory/auto-allocate-proc";
type PostBody = {
  job_ids: string[];
  notes?: string;
};

type JobRow = {
  id: string;
  job_number: string;
  customer_id: string;
  procurement_id: string | null;
  source_quote_id: string | null;
};

export async function GET(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const customer_id = url.searchParams.get("customer_id");
  const status = url.searchParams.get("status");

  let q = supabase
    .from("procurements")
    .select(
      "id, proc_code, procurement_mode, is_batch, member_count, sequence_num, proc_date, status, notes, created_at, customer_id, customers(code, company_name)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (customer_id) q = q.eq("customer_id", customer_id);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ procurements: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as PostBody;
  if (!Array.isArray(body.job_ids) || body.job_ids.length === 0) {
    return NextResponse.json(
      { error: "job_ids required (non-empty array)" },
      { status: 400 }
    );
  }

  const { data: jobsRaw, error: jobsErr } = await supabase
    .from("jobs")
    .select("id, job_number, customer_id, procurement_id, source_quote_id")
    .in("id", body.job_ids);

  if (jobsErr)
    return NextResponse.json({ error: jobsErr.message }, { status: 500 });

  const jobs = (jobsRaw ?? []) as JobRow[];
  if (jobs.length !== body.job_ids.length) {
    const found = new Set(jobs.map((j) => j.id));
    const missing = body.job_ids.filter((id) => !found.has(id));
    return NextResponse.json(
      { error: "Some jobs not found", missing },
      { status: 400 }
    );
  }

  const alreadyAssigned = jobs.filter((j) => j.procurement_id !== null);
  if (alreadyAssigned.length) {
    return NextResponse.json(
      {
        error: "Some jobs already belong to a PROC Batch",
        already_assigned: alreadyAssigned.map((j) => ({
          id: j.id,
          job_number: j.job_number,
          procurement_id: j.procurement_id,
        })),
      },
      { status: 400 }
    );
  }

  const customerIds = new Set(jobs.map((j) => j.customer_id));
  if (customerIds.size > 1) {
    return NextResponse.json(
      { error: "All jobs must share the same customer" },
      { status: 400 }
    );
  }
  const customer_id = jobs[0].customer_id;

  // Derive procurement_mode from source quote(s)
  const quoteIds = Array.from(
    new Set(jobs.map((j) => j.source_quote_id).filter((v): v is string => !!v))
  );
  if (quoteIds.length === 0) {
    return NextResponse.json(
      { error: "Jobs have no source quote â€” cannot determine procurement_mode" },
      { status: 400 }
    );
  }

  const { data: quotesRaw, error: qErr } = await supabase
    .from("quotes")
    .select("id, procurement_mode")
    .in("id", quoteIds);

  if (qErr)
    return NextResponse.json({ error: qErr.message }, { status: 500 });

  const modes = new Set(
    (quotesRaw ?? [])
      .map((q) => q.procurement_mode as string | null)
      .filter((v): v is string => !!v)
  );
  if (modes.size === 0) {
    return NextResponse.json(
      { error: "Source quotes have no procurement_mode set" },
      { status: 400 }
    );
  }
  if (modes.size > 1) {
    return NextResponse.json(
      { error: "Mixed modes not allowed", modes: Array.from(modes) },
      { status: 400 }
    );
  }
  const procurement_mode = Array.from(modes)[0] as ProcurementMode;

  const { data: cust, error: cErr } = await supabase
    .from("customers")
    .select("code")
    .eq("id", customer_id)
    .single();
  if (cErr || !cust)
    return NextResponse.json(
      { error: cErr?.message ?? "Customer not found" },
      { status: 500 }
    );

  const member_count = jobs.length;

  async function tryInsert() {
    const code = await generateProcCode({
      supabase,
      customer_code: cust!.code,
      customer_id,
      procurement_mode,
      member_count,
    });
    const { data, error } = await supabase
      .from("procurements")
      .insert({
        proc_code: code.proc_code,
        customer_id,
        procurement_mode,
        is_batch: code.is_batch,
        member_count,
        sequence_num: code.sequence_num,
        proc_date: code.proc_date,
        status: "draft",
        job_id: null,
        notes: body.notes ?? null,
        created_by: user!.id,
      })
      .select("id, proc_code, is_batch, member_count")
      .single();
    return { data, error };
  }

  let { data: proc, error: insErr } = await tryInsert();
  if (insErr && /duplicate key|unique/i.test(insErr.message)) {
    ({ data: proc, error: insErr } = await tryInsert());
  }
  if (insErr || !proc)
    return NextResponse.json(
      { error: insErr?.message ?? "Failed to create procurement" },
      { status: 500 }
    );

  // Assign these jobs to the new PROC and auto-move their status to
  // 'procurement' â€” the workflow expects that creating a PROC == components
  // are now being sourced. Only flip status when it's still 'created'; later
  // statuses (parts_ordered, production, etc.) stay put.
  //
  // Use admin client: jobs RLS may not allow the operator's user-scoped client
  // to update every job they batched (e.g. cross-customer batches, weird role
  // states). A silent no-op would leave jobs unlinked from the PROC. We're
  // already inside an admin gate, so the elevation is fine.
  const admin = createAdminClient();
  const { error: updErr } = await admin
    .from("jobs")
    .update({ procurement_id: proc.id, status: "procurement" })
    .in("id", body.job_ids)
    .eq("status", "created");

  // Second update for any selected jobs that were already past 'created' â€”
  // they still need procurement_id set, but their status is preserved.
  const { error: updErr2 } = await admin
    .from("jobs")
    .update({ procurement_id: proc.id })
    .in("id", body.job_ids)
    .neq("status", "created");
  if (updErr2)
    return NextResponse.json({ error: updErr2.message }, { status: 500 });

  if (updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Best-effort: reserve any BG / Safety stock that matches this PROC's BOM.
  // Failures are swallowed inside the helper â€” a flaky inventory step must
  // never block PROC creation.
  await autoAllocateProcInventory(supabase, proc.id);

  return NextResponse.json({
    id: proc.id,
    proc_code: proc.proc_code,
    member_count: proc.member_count,
    is_batch: proc.is_batch,
  });
}
