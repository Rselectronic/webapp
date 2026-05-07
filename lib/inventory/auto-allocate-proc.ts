// ----------------------------------------------------------------------------
// lib/inventory/auto-allocate-proc.ts
//
// Best-effort hook to auto-reserve BG / Safety stock against a freshly created
// PROC. Called from every PROC-creation entry point (modern proc-batch flow
// and the legacy single-job procurement flow). Failures are swallowed and
// logged so they never block PROC creation — operators expect the PROC to
// always be created; allocations are an optional convenience layer that can
// be re-run from the PROC page if it goes sideways.
//
// The actual allocation work happens in /api/proc/[id]/allocations/auto
// (sibling agent owns it). This helper only computes the merged-cpc list and
// POSTs it.
//
// CPC is the business identity at RS: every BOM line carries a CPC (the
// parser falls back to MPN when the customer didn't supply one), and the
// inventory_parts table is keyed on CPC. We aggregate the merged-BOM totals
// per CPC and let the allocator API resolve to inventory rows by CPC.
// ----------------------------------------------------------------------------
import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

interface MergedCpcEntry {
  cpc: string;
  qty_needed: number;
}

/**
 * Compute the merged CPC list for a PROC the same way the PROC detail page
 * does at render time, then POST to the auto-allocate endpoint. Best-effort:
 * any failure is logged and silently swallowed.
 */
export async function autoAllocateProcInventory(
  supabase: SupabaseClient,
  procId: string,
): Promise<void> {
  try {
    const merged = await computeMergedCpcs(supabase, procId);
    if (merged.length === 0) return;

    // Reach back into the same Next.js host for the auto-allocate API.
    // We reuse the request's cookie + protocol so RLS continues to apply.
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "http";
    if (!host) {
      console.warn("[auto-allocate-proc] no host header — skipping", { procId });
      return;
    }

    // Forward auth: cookie OR Authorization header (whichever the caller used).
    const cookie = h.get("cookie") ?? "";
    const auth = h.get("authorization") ?? "";

    const res = await fetch(`${proto}://${host}/api/proc/${procId}/allocations/auto`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...(auth ? { authorization: auth } : {}),
      },
      body: JSON.stringify({ lines: merged }),
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn("[auto-allocate-proc] non-OK response", {
        procId,
        status: res.status,
        detail: detail.slice(0, 200),
      });
    }
  } catch (err) {
    console.warn("[auto-allocate-proc] failed", { procId, err });
  }
}

/**
 * Build the merged-CPC list for a PROC: sum bom_lines.quantity * jobs.quantity
 * across every member job, keyed by CPC, with overage extras added per M-Code.
 *
 * Lines without a CPC are skipped — without CPC there's no business identity
 * to match against the inventory pool. (The BOM parser falls back to MPN for
 * CPC when the customer didn't supply one, so this is rare.)
 *
 * Exported because the auto-allocate API route uses this helper directly when
 * the operator clicks "Re-run allocation" without a precomputed list.
 */
export async function computeMergedCpcs(
  supabase: SupabaseClient,
  procId: string,
): Promise<MergedCpcEntry[]> {
  // 1. Member jobs (qty + bom_id)
  const { data: members } = await supabase
    .from("jobs")
    .select("id, quantity, bom_id, customer_id")
    .eq("procurement_id", procId);

  const jobs = (members ?? []) as Array<{
    id: string;
    quantity: number | null;
    bom_id: string | null;
    customer_id: string | null;
  }>;
  if (jobs.length === 0) return [];

  const bomIds = Array.from(
    new Set(jobs.map((j) => j.bom_id).filter((b): b is string => !!b)),
  );
  if (bomIds.length === 0) return [];

  // 2. BOM lines for those BOMs
  const { data: bomLinesRaw } = await supabase
    .from("bom_lines")
    .select("bom_id, quantity, cpc, m_code")
    .in("bom_id", bomIds);
  const bomLines = (bomLinesRaw ?? []) as Array<{
    bom_id: string;
    quantity: number | null;
    cpc: string | null;
    m_code: string | null;
  }>;

  // 3. Overage table (m_code -> sorted tiers)
  const { data: overageRaw } = await supabase
    .from("overage_table")
    .select("m_code, qty_threshold, extras");
  const overageByMcode = new Map<
    string,
    Array<{ qty_threshold: number; extras: number }>
  >();
  for (const t of (overageRaw ?? []) as Array<{
    m_code: string;
    qty_threshold: number;
    extras: number;
  }>) {
    const arr = overageByMcode.get(t.m_code) ?? [];
    arr.push({ qty_threshold: t.qty_threshold, extras: t.extras });
    overageByMcode.set(t.m_code, arr);
  }
  for (const [, arr] of overageByMcode) arr.sort((a, b) => a.qty_threshold - b.qty_threshold);
  const extrasFor = (mcode: string | null, qty: number): number => {
    if (!mcode) return 0;
    const tiers = overageByMcode.get(mcode);
    if (!tiers || tiers.length === 0) return 0;
    let extras = 0;
    for (const t of tiers) if (qty >= t.qty_threshold) extras = t.extras;
    return extras;
  };

  // 4. Roll up. Key = uppercased CPC. Lines without CPC are skipped — there's
  //    no business identity to allocate against.
  const bomIdToJobQty = new Map<string, number>();
  for (const j of jobs) {
    if (j.bom_id) bomIdToJobQty.set(j.bom_id, j.quantity ?? 0);
  }

  type Acc = { qty: number; m_code: string | null };
  const merged = new Map<string, Acc>();
  for (const line of bomLines) {
    const jobQty = bomIdToJobQty.get(line.bom_id) ?? 0;
    if (jobQty === 0) continue;
    const cpc = (line.cpc ?? "").trim();
    if (!cpc) continue;
    const key = cpc.toUpperCase();
    const add = (line.quantity ?? 0) * jobQty;
    const existing = merged.get(key);
    if (existing) {
      existing.qty += add;
      if (!existing.m_code) existing.m_code = line.m_code;
    } else {
      merged.set(key, { qty: add, m_code: line.m_code });
    }
  }

  return Array.from(merged.entries())
    .map(([cpc, { qty, m_code }]) => ({
      cpc,
      qty_needed: qty + extrasFor(m_code, qty),
    }))
    .filter((r) => r.qty_needed > 0);
}
