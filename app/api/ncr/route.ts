import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/ncr — List NCRs with optional filters
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const customerId = url.searchParams.get("customer_id");
  const jobId = url.searchParams.get("job_id");

  let query = supabase
    .from("ncr_reports")
    .select(
      "*, customers(code, company_name), jobs(job_number)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq("status", status);
  }
  if (customerId) {
    query = query.eq("customer_id", customerId);
  }
  if (jobId) {
    query = query.eq("job_id", jobId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// ---------------------------------------------------------------------------
// POST /api/ncr — Create an NCR
// ---------------------------------------------------------------------------

interface CreateNCRBody {
  job_id?: string;
  customer_id: string;
  category: string;
  subcategory?: string;
  description: string;
  severity?: string;
}

async function generateNCRNumber(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `NCR-${yy}${mm}`;

  const { count } = await supabase
    .from("ncr_reports")
    .select("id", { count: "exact", head: true })
    .like("ncr_number", `${prefix}%`);

  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `${prefix}-${seq}`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as CreateNCRBody;
  const { job_id, customer_id, category, subcategory, description, severity } =
    body;

  if (!customer_id || !category || !description) {
    return NextResponse.json(
      { error: "Missing required fields: customer_id, category, description" },
      { status: 400 }
    );
  }

  const ncrNumber = await generateNCRNumber(supabase);

  const { data: ncr, error } = await supabase
    .from("ncr_reports")
    .insert({
      ncr_number: ncrNumber,
      job_id: job_id ?? null,
      customer_id,
      category,
      subcategory: subcategory ?? null,
      description,
      severity: severity ?? "minor",
      status: "open",
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error || !ncr) {
    return NextResponse.json(
      { error: "Failed to create NCR", details: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json(ncr, { status: 201 });
}
