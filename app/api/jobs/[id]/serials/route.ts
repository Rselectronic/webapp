import { isAdminRole } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("serial_numbers")
    .select("id, serial_number, board_number, status, notes, created_at")
    .eq("job_id", id)
    .order("board_number", { ascending: true });

  if (error) {
    console.error("[/api/jobs/[id]/serials] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ serials: data ?? [] });
}

export async function POST(
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

  // Admin-only: serials are a commercial / shipping artefact (the SHIPDOC
  // certificate of compliance shows them). Production users have only a
  // SELECT policy on serial_numbers, so a user-scoped insert silently no-ops
  // anyway â€” gate explicitly here for a clean 403 rather than a confusing
  // partial success.
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Fetch the job to get job_number and quantity (admin client so RLS doesn't
  // interfere â€” we already authorized the caller above).
  const { data: job, error: jobError } = await admin
    .from("jobs")
    .select("id, job_number, quantity")
    .eq("id", id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Check if serials already exist for this job
  const { count } = await admin
    .from("serial_numbers")
    .select("id", { count: "exact", head: true })
    .eq("job_id", id);

  if (count && count > 0) {
    return NextResponse.json(
      { error: "Serial numbers already generated for this job" },
      { status: 409 }
    );
  }

  // Allow optional override of quantity from request body
  let quantity = job.quantity;
  try {
    const body = await req.json();
    if (body.quantity && typeof body.quantity === "number" && body.quantity > 0) {
      quantity = body.quantity;
    }
  } catch {
    // No body or invalid JSON â€” use job quantity
  }

  // Generate serial numbers: {job_number}-{board_number padded to 3 digits}
  const serials = Array.from({ length: quantity }, (_, i) => ({
    job_id: id,
    serial_number: `${job.job_number}-${String(i + 1).padStart(3, "0")}`,
    board_number: i + 1,
    status: "produced" as const,
  }));

  const { data: inserted, error: insertError } = await admin
    .from("serial_numbers")
    .insert(serials)
    .select("id, serial_number, board_number, status, created_at");

  if (insertError) {
    console.error("[/api/jobs/[id]/serials] POST insert error:", insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(
    { serials: inserted, count: inserted?.length ?? 0 },
    { status: 201 }
  );
}
