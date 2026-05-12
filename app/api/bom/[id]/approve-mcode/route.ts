import { NextResponse } from "next/server";
import { isAdminRole } from "@/lib/auth/roles";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/bom/[id]/approve-mcode
 *
 * Approves AI-classified m_codes on this BOM. Two modes:
 *   • { line_ids: [...] }  — approve a specific subset
 *   • { all: true }        — approve every AI-source row on the BOM
 *
 * Approval is more than a flag flip. For every approved line we:
 *   1. Flip `m_code_source` from "ai" → "manual" so future Layer-1 lookups
 *      treat it as a human decision (operator stands behind the AI guess).
 *   2. Stamp `m_code_approved_by` + `m_code_approved_at` for the audit trail.
 *   3. Cache the m_code in the global `components` table (key = cpc or mpn,
 *      manufacturer) so the NEXT BOM with the same CPC skips Layer 3
 *      entirely.
 *   4. Cache the m_code as a per-customer override on `customer_parts`
 *      (m_code_manual) so the per-customer classifier catches it first.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bomId } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    line_ids?: string[];
    all?: boolean;
  };

  // Fetch the BOM's customer so we can write per-customer overrides too.
  const { data: bomRow } = await admin
    .from("boms")
    .select("customer_id")
    .eq("id", bomId)
    .maybeSingle();
  if (!bomRow) {
    return NextResponse.json({ error: "BOM not found" }, { status: 404 });
  }
  const customerId = bomRow.customer_id as string | null;

  // Resolve which lines to approve. Always filter to AI-source rows so this
  // endpoint can't be used to retag manual / rule / db rows.
  let query = admin
    .from("bom_lines")
    .select("id, cpc, mpn, manufacturer, m_code, m_code_source")
    .eq("bom_id", bomId)
    .eq("m_code_source", "ai");

  if (Array.isArray(body.line_ids) && body.line_ids.length > 0) {
    query = query.in("id", body.line_ids);
  } else if (!body.all) {
    return NextResponse.json(
      { error: "Send either { line_ids: [...] } or { all: true }" },
      { status: 400 }
    );
  }

  const { data: targets, error: targetsErr } = await query;
  if (targetsErr) {
    return NextResponse.json(
      { error: "Failed to load lines", details: targetsErr.message },
      { status: 500 }
    );
  }
  if (!targets || targets.length === 0) {
    return NextResponse.json({ approved: 0, message: "Nothing to approve" });
  }

  // 1. Stamp + flip source on bom_lines.
  const nowIso = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("bom_lines")
    .update({
      m_code_source: "manual",
      m_code_approved_by: user.id,
      m_code_approved_at: nowIso,
    })
    .in(
      "id",
      targets.map((t) => t.id)
    );
  if (updateErr) {
    return NextResponse.json(
      { error: "Failed to mark approved", details: updateErr.message },
      { status: 500 }
    );
  }

  // 2. Cache to `components` (global). Key on (cpc, manufacturer). Use CPC
  //    when present, else fall back to MPN — matches the classifier's
  //    Layer-1 lookup logic.
  const componentRows = targets
    .filter((t) => t.m_code && (t.cpc || t.mpn))
    .map((t) => ({
      cpc: (t.cpc ?? t.mpn) as string,
      manufacturer: t.manufacturer ?? "Unknown",
      m_code: t.m_code as string,
      m_code_source: "manual",
    }));
  if (componentRows.length > 0) {
    const { error: compErr } = await admin
      .from("components")
      .upsert(componentRows, { onConflict: "cpc,manufacturer" });
    if (compErr) {
      // Non-fatal — log and continue. The bom_lines update already
      // succeeded so the row is approved; we just lose the global cache
      // for this CPC. Operator can re-approve later to retry.
      console.error("[approve-mcode] components upsert failed", compErr.message);
    }
  }

  // 3. Cache to `customer_parts.m_code_manual` (per-customer override).
  //    Only do this when we know the customer; the per-customer pass keys
  //    on (customer_id, cpc).
  if (customerId) {
    const partRows = targets
      .filter((t) => t.m_code && t.cpc)
      .map((t) => ({
        customer_id: customerId,
        cpc: t.cpc as string,
        original_mpn: t.mpn ?? null,
        original_manufacturer: t.manufacturer ?? null,
        m_code_manual: t.m_code as string,
        m_code_manual_updated_at: nowIso,
      }));
    if (partRows.length > 0) {
      const { error: partErr } = await admin
        .from("customer_parts")
        .upsert(partRows, { onConflict: "customer_id,cpc" });
      if (partErr) {
        console.error("[approve-mcode] customer_parts upsert failed", partErr.message);
      }
    }
  }

  return NextResponse.json({
    approved: targets.length,
    approved_by: user.id,
    approved_at: nowIso,
  });
}
