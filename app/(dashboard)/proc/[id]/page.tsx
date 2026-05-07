import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MergedBomTable, type StockAllocationBadge } from "@/components/proc/merged-bom-table";
import { PcbOrdersCard } from "@/components/proc/pcb-orders-card";
import { StencilOrdersCard } from "@/components/proc/stencil-orders-card";
import { ProcTabs } from "@/components/proc/proc-tabs";
import { PurchaseOrdersList } from "@/components/proc/purchase-orders-list";
import { SupplierQuotesPanel } from "@/components/proc/supplier-quotes-panel";
import {
  StockAllocationsPanel,
  type StockAllocationRow,
} from "@/components/proc/stock-allocations-panel";
import { formatDate } from "@/lib/utils/format";
import { getRate } from "@/lib/pricing/fx";
import { autoAllocateProcInventory } from "@/lib/inventory/auto-allocate-proc";
import type { InventoryAllocationStatus, InventoryPool } from "@/lib/inventory/types";

// PROC Batch detail — shows batch metadata, member jobs, and merged BOM.

interface Proc {
  id: string;
  proc_code: string;
  status: string;
  procurement_mode: string | null;
  is_batch: boolean | null;
  member_count: number | null;
  proc_date: string | null;
  notes: string | null;
  customers: { id: string; code: string; company_name: string } | null;
}

interface MemberJob {
  id: string;
  job_number: string;
  quantity: number;
  po_number: string | null;
  po_date: string | null;
  bom_id: string | null;
  frozen_unit_price: number | null;
  frozen_subtotal: number | null;
  gmps: { id: string; gmp_number: string; board_name: string | null } | null;
  boms: {
    file_name: string;
    revision: string | null;
    component_count: number | null;
  } | null;
  source_quote: { quote_number: string } | null;
}

interface BomLine {
  id: string;
  bom_id: string;
  quantity: number;
  mpn: string | null;
  cpc: string | null;
  description: string | null;
  manufacturer: string | null;
  m_code: string | null;
  reference_designator: string | null;
}

interface BomLinePricingRow {
  bom_line_id: string;
  tier_qty: number;
  supplier: string;
  supplier_part_number: string | null;
  selected_unit_price_cad: number | null;
}

interface CacheRow {
  source: string;
  search_key: string;
  stock_qty: number | null;
  unit_price: number | null;
  fetched_at: string;
}

interface OverageTier {
  m_code: string;
  qty_threshold: number;
  extras: number;
}

const MODE_LABEL: Record<string, string> = {
  turnkey: "Turnkey (T)",
  consignment: "Consignment (C)",
  // Legacy values — collapsed to the same label.
  consign_parts_supplied: "Consignment (C)",
  consign_pcb_supplied: "Consignment (C)",
  assembly_only: "Assembly Only (A)",
};

const MERGED_ROW_LIMIT = 200;

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Number(n).toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function ProcBatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Load the procurement + its members. Note the FK-hint on quotes because
  // jobs has two FKs to quotes (quote_id + source_quote_id).
  const [procResult, membersResult] = await Promise.all([
    supabase
      .from("procurements")
      .select(
        "id, proc_code, status, procurement_mode, is_batch, member_count, proc_date, notes, customers(id, code, company_name)"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("jobs")
      .select(
        "id, job_number, quantity, po_number, po_date, bom_id, frozen_unit_price, frozen_subtotal, gmps(id, gmp_number, board_name), boms(file_name, revision, component_count), source_quote:quotes!jobs_source_quote_id_fkey(quote_number)"
      )
      .eq("procurement_id", id)
      .order("po_date", { ascending: true, nullsFirst: false })
      .order("job_number", { ascending: true }),
  ]);

  // Load pcb_orders for this procurement — needed to synthesize APCB row state.
  const { data: pcbOrdersData } = await supabase
    .from("pcb_orders")
    .select("id, gmp_id, supplier, external_order_id, unit_price, currency, ordered_date, received_date, status, created_at")
    .eq("procurement_id", id)
    .order("created_at", { ascending: false });
  type PcbOrderRow = {
    id: string;
    gmp_id: string | null;
    supplier: string | null;
    external_order_id: string | null;
    unit_price: number | null;
    currency: string | null;
    ordered_date: string | null;
    received_date: string | null;
    status: string | null;
    created_at: string;
  };
  // First-write-wins: newest row per gmp_id (data ordered desc).
  const pcbOrderByGmpId = new Map<string, PcbOrderRow>();
  for (const row of (pcbOrdersData ?? []) as PcbOrderRow[]) {
    if (row.gmp_id && !pcbOrderByGmpId.has(row.gmp_id)) {
      pcbOrderByGmpId.set(row.gmp_id, row);
    }
  }
  // Collect non-CAD currencies to batch FX lookup.
  const fxCache = new Map<string, number | null>();
  for (const row of pcbOrderByGmpId.values()) {
    const cur = row.currency ?? "CAD";
    if (cur !== "CAD" && !fxCache.has(cur)) {
      const r = await getRate(cur, "CAD");
      fxCache.set(cur, r?.rate ?? null);
    }
  }

  if (procResult.error || !procResult.data) {
    notFound();
  }

  const proc = procResult.data as unknown as Proc;
  const members = (membersResult.data ?? []) as unknown as MemberJob[];

  // Auto-trigger inventory allocation if this PROC has never been allocated.
  // Some legacy PROCs predate the inventory feature, and the modern create
  // hook is best-effort (e.g. inventory API was offline). This makes the page
  // self-healing: first visit after the inventory API exists creates the
  // allocations. Helper is best-effort and never throws.
  {
    const { count: allocCount } = await supabase
      .from("inventory_allocations")
      .select("id", { count: "exact", head: true })
      .eq("procurement_id", proc.id);
    if (allocCount === 0) {
      await autoAllocateProcInventory(supabase, proc.id);
    }
  }

  // Pull every (non-released) allocation for this PROC, joined with its
  // inventory_part so we can render the allocations panel + stock badge.
  type AllocationJoinRow = {
    id: string;
    inventory_part_id: string;
    qty_allocated: number;
    status: InventoryAllocationStatus;
    notes: string | null;
    created_at: string;
    consumed_at: string | null;
    released_at: string | null;
    inventory_parts: {
      // After migration 080: cpc is UNIQUE NOT NULL, mpn is nullable.
      cpc: string;
      mpn: string | null;
      description: string | null;
      pool: InventoryPool;
    } | null;
  };
  const { data: allocRaw } = await supabase
    .from("inventory_allocations")
    .select(
      "id, inventory_part_id, qty_allocated, status, notes, created_at, consumed_at, released_at, inventory_parts(cpc, mpn, description, pool)"
    )
    .eq("procurement_id", proc.id)
    .neq("status", "released")
    .order("created_at", { ascending: false });
  const allocRows: StockAllocationRow[] = ((allocRaw ?? []) as unknown as AllocationJoinRow[])
    .filter((a) => !!a.inventory_parts)
    .map((a) => ({
      id: a.id,
      inventory_part_id: a.inventory_part_id,
      qty_allocated: a.qty_allocated,
      status: a.status,
      notes: a.notes,
      created_at: a.created_at,
      consumed_at: a.consumed_at,
      released_at: a.released_at,
      pool: a.inventory_parts!.pool,
      cpc: a.inventory_parts!.cpc,
      mpn: a.inventory_parts!.mpn,
      description: a.inventory_parts!.description,
    }));
  // Allocation lookup keyed by uppercased CPC — used for the "Stock" badge
  // column in the merged BOM. CPC is the business identity at RS; both
  // inventory_parts and bom_lines are keyed on it. Only the active reservation
  // (or consumed) record per CPC matters; if multiple exist we keep the first
  // (newest first due to the ORDER BY above). Allocations whose joined
  // inventory_parts row has no CPC are dropped — they pre-date migration 080
  // and shouldn't render a badge.
  const allocationsByCpc: Record<string, StockAllocationBadge> = {};
  for (const r of allocRows) {
    if (!r.cpc) continue;
    const key = r.cpc.toUpperCase();
    if (!allocationsByCpc[key]) {
      allocationsByCpc[key] = {
        pool: r.pool,
        qty: r.qty_allocated,
        status: r.status,
      };
    }
  }

  // Operator-overridden buy quantities, keyed by uppercased CPC. Pulled from
  // procurement_line_selections.manual_buy_qty so the merged-BOM table can
  // render the operator's override (or the computed default when null).
  const { data: buyQtyRows } = await supabase
    .from("procurement_line_selections")
    .select("cpc, mpn, manual_buy_qty")
    .eq("procurement_id", proc.id)
    .not("manual_buy_qty", "is", null);
  const buyQtyOverridesByCpc: Record<string, number | null> = {};
  for (const r of (buyQtyRows ?? []) as Array<{
    cpc: string | null;
    mpn: string | null;
    manual_buy_qty: number | null;
  }>) {
    // Prefer cpc; fall back to mpn for legacy rows that didn't get backfilled.
    const key = (r.cpc ?? r.mpn ?? "").trim().toUpperCase();
    if (!key) continue;
    buyQtyOverridesByCpc[key] = r.manual_buy_qty;
  }

  // Note: the SupplierQuotesPanel feeds off the merged BOM (computed
  // further down from each member job's bom_lines), not from
  // procurement_lines. procurement_lines is only populated lazily by other
  // ordering actions (PCB orders, distributor PO PDF), so a fresh PROC has
  // an empty procurement_lines table even though its merged BOM has rows.
  // The panel receives the merged rows directly; the quote-create API
  // materialises procurement_lines as needed when the operator saves.

  // Preload quote_id per member so we can fetch pinned supplier selections.
  const memberQuoteIds = Array.from(
    new Set(
      members
        .map((m) => (m as MemberJob & { source_quote_id?: string }).source_quote_id)
        .filter((q): q is string => !!q)
    )
  );

  // Load bom_lines for all members' boms (skip NULLs).
  const bomIds = Array.from(
    new Set(members.map((m) => m.bom_id).filter((b): b is string => !!b))
  );

  let bomLines: BomLine[] = [];
  if (bomIds.length > 0) {
    const { data } = await supabase
      .from("bom_lines")
      .select("id, bom_id, quantity, mpn, cpc, description, manufacturer, m_code, reference_designator")
      .in("bom_id", bomIds);
    bomLines = (data ?? []) as unknown as BomLine[];
  }

  // Build CPC -> mpn_to_use map for this customer (effective MPN override).
  const cpcToMpnMap = new Map<string, string>();
  if (proc.customers?.id) {
    const { data: cpData } = await supabase
      .from("customer_parts")
      .select("cpc, mpn_to_use")
      .eq("customer_id", proc.customers.id)
      .not("cpc", "is", null)
      .not("mpn_to_use", "is", null);
    for (const row of (cpData ?? []) as { cpc: string | null; mpn_to_use: string | null }[]) {
      if (row.cpc && row.mpn_to_use) {
        cpcToMpnMap.set(row.cpc.toUpperCase(), row.mpn_to_use);
      }
    }
  }

  // Customer-supplied bom_line ids for this PROC's member source_quote_ids.
  const customerSuppliedLineIds = new Set<string>();
  if (memberQuoteIds.length > 0) {
    const { data: csData } = await supabase
      .from("quote_customer_supplied")
      .select("bom_line_id, quote_id")
      .in("quote_id", memberQuoteIds);
    for (const row of (csData ?? []) as { bom_line_id: string | null }[]) {
      if (row.bom_line_id) customerSuppliedLineIds.add(row.bom_line_id);
    }
  }

  // Pinned supplier selections per bom_line_id (from the quote).
  const bomLineIds = bomLines.map((l) => l.id);
  let pricingRows: BomLinePricingRow[] = [];
  if (bomLineIds.length > 0) {
    const { data } = await supabase
      .from("bom_line_pricing")
      .select("bom_line_id, tier_qty, supplier, supplier_part_number, selected_unit_price_cad")
      .in("bom_line_id", bomLineIds);
    pricingRows = (data ?? []) as BomLinePricingRow[];
  }
  // First selection per bom_line_id (tier-agnostic — if quote has multiple tiers
  // pinned, take one; Anas's workflow uses the same supplier across tiers).
  const pickedByLineId = new Map<string, BomLinePricingRow>();
  for (const r of pricingRows) {
    if (!pickedByLineId.has(r.bom_line_id)) pickedByLineId.set(r.bom_line_id, r);
  }

  // Overage table — drives extras per M-Code per order qty.
  const { data: overageData } = await supabase
    .from("overage_table")
    .select("m_code, qty_threshold, extras");
  const overageTiers = (overageData ?? []) as OverageTier[];
  const overageByMcode = new Map<string, OverageTier[]>();
  for (const t of overageTiers) {
    const arr = overageByMcode.get(t.m_code) ?? [];
    arr.push(t);
    overageByMcode.set(t.m_code, arr);
  }
  // Ensure sorted ascending by qty_threshold so we can walk tiers.
  for (const [, arr] of overageByMcode) {
    arr.sort((a, b) => a.qty_threshold - b.qty_threshold);
  }
  function extrasFor(mcode: string | null, qty: number): number {
    if (!mcode) return 0;
    const tiers = overageByMcode.get(mcode);
    if (!tiers || tiers.length === 0) return 0;
    let extras = 0;
    for (const t of tiers) {
      if (qty >= t.qty_threshold) extras = t.extras;
    }
    return extras;
  }

  // Roll up merged BOM: per unique MPN, sum (line.qty × member.qty), count
  // distinct members contributing.
  const bomIdToMember = new Map<string, MemberJob>();
  for (const m of members) {
    if (m.bom_id) bomIdToMember.set(m.bom_id, m);
  }

  // Board letters A, B, C... assigned per unique GMP in member order so we
  // can build a compact Customer Ref tag for each merged BOM row.
  const boardLetterByGmpId = new Map<string, string>();
  {
    let i = 0;
    for (const m of members) {
      const gid = m.gmps?.id;
      if (!gid) continue;
      if (boardLetterByGmpId.has(gid)) continue;
      boardLetterByGmpId.set(gid, String.fromCharCode(65 + i));
      i += 1;
    }
  }
  // Parallel map: gmp label (used as merge key) → letter.
  const boardLetterByGmpLabel = new Map<string, string>();
  for (const m of members) {
    const label = m.gmps?.gmp_number ?? m.gmps?.board_name ?? "—";
    const gid = m.gmps?.id;
    if (gid && boardLetterByGmpId.has(gid)) {
      boardLetterByGmpLabel.set(label, boardLetterByGmpId.get(gid)!);
    }
  }

  type MergedRow = {
    // CPC is the canonical aggregation key (uppercased). Falls back to MPN when
    // a bom_line has no CPC (parser convention: blank CPC ⇒ use MPN-as-CPC).
    cpc: string;
    // Display CPC preserved in original case for the UI.
    cpc_display: string | null;
    // Winning MPN for this CPC group: highest-aggregated-qty MPN across the
    // contributing bom_lines (or the customer_parts.mpn_to_use override when
    // set). Multiple MPNs under one CPC = supplier alternates / rotated parts;
    // only one is shown but `mpns_seen` keeps the rest for context.
    winning_mpn: string | null;
    mpns_seen: string[];
    // Per-MPN aggregated qty within this CPC group, used to pick winning_mpn
    // before customer_parts override is applied. (We materialise this as an
    // intermediate during the loop and read it after.)
    _qty_by_mpn: Map<string, number>;
    description: string | null;
    manufacturer: string | null;
    m_code: string | null;
    total_qty: number;
    gmp_names: Set<string>;
    qty_per_board_by_gmp: Map<string, number>;
    // Pinned supplier info (from quote)
    supplier: string | null;
    supplier_pn: string | null;
    unit_price: number | null;
    // Customer-supplied tracking: track total contributing lines & how many are CS.
    _contributing_lines: number;
    _cs_lines: number;
    // GMP IDs contributing to this merged row — drives APCB single-vs-multi logic.
    contributing_gmp_ids: Set<string>;
    // Designator list — every contributing line's reference_designator string,
    // grouped per-GMP so multi-board batches show which designators belong
    // to which board.
    designators_by_gmp: Map<string, string[]>;
  };
  const merged = new Map<string, MergedRow>();
  for (const line of bomLines) {
    const member = bomIdToMember.get(line.bom_id);
    if (!member) continue;
    // Aggregate on CPC (uppercased). When a line has no CPC, fall back to the
    // MPN to mirror the BOM-parser convention (blank CPC ⇒ MPN-as-CPC). After
    // Phase 1 every parsed BOM has a CPC, so the fallback is mostly defensive
    // for legacy rows.
    const cpcDisplay = (line.cpc ?? "").trim();
    const mpnTrim = (line.mpn ?? "").trim();
    const keyRaw = cpcDisplay || mpnTrim;
    if (!keyRaw) continue;
    const key = keyRaw.toUpperCase();
    const add = (line.quantity ?? 0) * (member.quantity ?? 0);
    const gmpLabel =
      member.gmps?.gmp_number ?? member.gmps?.board_name ?? "—";
    const existing = merged.get(key);
    const picked = pickedByLineId.get(line.id);
    const isCS = customerSuppliedLineIds.has(line.id);
    const desig = (line.reference_designator ?? "").trim();
    const memberGmpId = member.gmps?.id ?? null;
    if (existing) {
      existing.total_qty += add;
      existing.gmp_names.add(gmpLabel);
      if (memberGmpId) existing.contributing_gmp_ids.add(memberGmpId);
      existing.qty_per_board_by_gmp.set(
        gmpLabel,
        (existing.qty_per_board_by_gmp.get(gmpLabel) ?? 0) + (line.quantity ?? 0)
      );
      if (desig) {
        const arr = existing.designators_by_gmp.get(gmpLabel) ?? [];
        arr.push(desig);
        existing.designators_by_gmp.set(gmpLabel, arr);
      }
      // Always prefer the first non-null CPC display string we saw — keeps the
      // original casing instead of the uppercased aggregation key.
      if (!existing.cpc_display && cpcDisplay) existing.cpc_display = cpcDisplay;
      existing.description ||= line.description ?? null;
      existing.manufacturer ||= line.manufacturer ?? null;
      existing.m_code ||= line.m_code ?? null;
      existing._contributing_lines += 1;
      if (isCS) existing._cs_lines += 1;
      if (!existing.supplier && picked) {
        existing.supplier = picked.supplier;
        existing.supplier_pn = picked.supplier_part_number;
        existing.unit_price = picked.selected_unit_price_cad;
      }
      if (mpnTrim) {
        existing._qty_by_mpn.set(
          mpnTrim,
          (existing._qty_by_mpn.get(mpnTrim) ?? 0) + add
        );
      }
    } else {
      merged.set(key, {
        cpc: key,
        cpc_display: cpcDisplay || null,
        winning_mpn: null,
        mpns_seen: [],
        _qty_by_mpn: new Map(mpnTrim ? [[mpnTrim, add]] : []),
        description: line.description,
        manufacturer: line.manufacturer,
        m_code: line.m_code,
        total_qty: add,
        gmp_names: new Set([gmpLabel]),
        qty_per_board_by_gmp: new Map([[gmpLabel, line.quantity ?? 0]]),
        designators_by_gmp: new Map(desig ? [[gmpLabel, [desig]]] : []),
        supplier: picked?.supplier ?? null,
        supplier_pn: picked?.supplier_part_number ?? null,
        unit_price: picked?.selected_unit_price_cad ?? null,
        _contributing_lines: 1,
        _cs_lines: isCS ? 1 : 0,
        contributing_gmp_ids: new Set(memberGmpId ? [memberGmpId] : []),
      });
    }
  }
  // Resolve the winning MPN per CPC group. The customer_parts override
  // (`mpn_to_use`) decides "RS's chosen MPN" for that CPC when set; otherwise
  // pick the MPN with the highest aggregated qty across contributing
  // bom_lines. Remaining MPNs go into mpns_seen for context.
  for (const r of merged.values()) {
    const override = cpcToMpnMap.get(r.cpc);
    const sortedByQty = Array.from(r._qty_by_mpn.entries()).sort(
      (a, b) => b[1] - a[1]
    );
    const seen = sortedByQty.map(([m]) => m);
    if (override) {
      r.winning_mpn = override;
      r.mpns_seen = seen.filter((m) => m !== override);
    } else {
      r.winning_mpn = seen[0] ?? null;
      r.mpns_seen = seen.slice(1);
    }
  }
  // Fetch components.package_case for every CPC in the merged set. components
  // is CPC-keyed (the business identity at RS) — using mpn here was incorrect.
  const effectiveCpcsUpper = Array.from(merged.keys());
  const packageCaseByCpc = new Map<string, string | null>();
  if (effectiveCpcsUpper.length > 0) {
    const { data: compRows } = await supabase
      .from("components")
      .select("cpc, package_case")
      .in("cpc", effectiveCpcsUpper);
    for (const c of (compRows ?? []) as { cpc: string | null; package_case: string | null }[]) {
      if (c.cpc) packageCaseByCpc.set(c.cpc.toUpperCase(), c.package_case ?? null);
    }
  }

  const mergedRowsPre = Array.from(merged.values()).map((r) => {
    const extras = extrasFor(r.m_code, r.total_qty);
    // APCB override: pull procurement state from pcb_orders, not distributors.
    const is_apcb = r.m_code === "APCB";
    let apcb_supplier: string | null = r.supplier;
    let apcb_supplier_pn: string | null = r.supplier_pn;
    let apcb_unit_price: number | null = r.unit_price;
    let apcb_order_status: string | null = null;
    let apcb_order_external_id: string | null = null;
    const apcb_multiple_boards = is_apcb && r.contributing_gmp_ids.size > 1;
    if (is_apcb) {
      if (apcb_multiple_boards) {
        apcb_supplier = "Multiple boards — see PCB Orders tab";
        apcb_supplier_pn = "—";
        apcb_unit_price = null;
        apcb_order_status = null;
      } else {
        const onlyGmpId = Array.from(r.contributing_gmp_ids)[0];
        const pcb = onlyGmpId ? pcbOrderByGmpId.get(onlyGmpId) : undefined;
        if (pcb) {
          apcb_supplier = pcb.supplier ?? null;
          apcb_supplier_pn = "—";
          const cur = pcb.currency ?? "CAD";
          // FX convert if needed; if unavailable, leave raw number.
          if (pcb.unit_price != null && cur !== "CAD") {
            const rate = fxCache.get(cur);
            apcb_unit_price = rate != null ? pcb.unit_price * rate : pcb.unit_price;
          } else {
            apcb_unit_price = pcb.unit_price;
          }
          apcb_order_status = pcb.status ?? "not_ordered";
          apcb_order_external_id = pcb.external_order_id ?? null;
        } else {
          apcb_supplier = null;
          apcb_supplier_pn = null;
          apcb_unit_price = null;
          apcb_order_status = "not_ordered";
          apcb_order_external_id = null;
        }
      }
    }
    // Mark the merged row as Customer Supplied if ANY contributing bom_line
    // was flagged CS in its source quote. A single CS flag dominates because
    // the customer is providing that part for every board — we should never
    // re-buy it.
    const is_customer_supplied = r._cs_lines > 0;

    // Board letters in ABC order for every GMP that uses this part.
    const boardLetters = Array.from(r.gmp_names)
      .map((g) => boardLetterByGmpLabel.get(g) ?? "")
      .filter((s) => s.length > 0)
      .sort()
      .join("");

    // Designators: union across GMPs. Collapse all contributing designator
    // tokens into a single unique set.
    const allDesigTokens = new Set<string>();
    for (const arr of r.designators_by_gmp.values()) {
      for (const s of arr) {
        // Input may already be comma/space separated; split defensively.
        for (const tok of s.split(/[,;\s]+/)) {
          const t = tok.trim();
          if (t) allDesigTokens.add(t);
        }
      }
    }
    const uniqueDesig = Array.from(allDesigTokens);
    const designators_display = uniqueDesig.length > 0 ? uniqueDesig.join(", ") : "";
    const singleDesig = uniqueDesig.length === 1 ? uniqueDesig[0] : "";

    // Customer Ref = {boardLetters}{designator if single} {m_code} {cpc}
    // Skip pieces that are empty.
    const cpcOut = r.cpc_display ?? r.cpc;
    const customer_ref_parts: string[] = [];
    if (boardLetters) customer_ref_parts.push(boardLetters);
    if (singleDesig) customer_ref_parts.push(singleDesig);
    if (r.m_code) customer_ref_parts.push(r.m_code);
    if (cpcOut) customer_ref_parts.push(cpcOut);
    const customer_ref = customer_ref_parts.join(" ");

    return {
      ...r,
      // Public-facing CPC field; cpc internally is the uppercased aggregation
      // key, cpc_display preserves the original casing.
      cpc: cpcOut,
      // APCB rows overwrite pinned-quote supplier fields with PCB-order-derived values.
      supplier: is_apcb ? apcb_supplier : r.supplier,
      supplier_pn: is_apcb ? apcb_supplier_pn : r.supplier_pn,
      unit_price: is_apcb ? apcb_unit_price : r.unit_price,
      extras,
      total_with_extras: r.total_qty + extras,
      is_customer_supplied,
      designators_display,
      customer_ref,
      package_case: packageCaseByCpc.get(r.cpc) ?? null,
      is_apcb,
      apcb_order_status,
      apcb_order_external_id,
      apcb_multiple_boards,
    };
  });

  // Stock lookup from api_pricing_cache, keyed by (supplier, MPN upper). The
  // pricing cache is keyed on the actual MPN sent to the distributor API, so
  // we look up by the winning MPN per CPC group (not the CPC itself).
  const cacheKeys = new Set<string>();
  for (const r of mergedRowsPre) {
    if (r.supplier && r.winning_mpn) {
      cacheKeys.add(`${r.supplier}|${r.winning_mpn.toUpperCase()}`);
    }
  }
  const stockBySupplierMpn = new Map<string, number | null>();
  if (cacheKeys.size > 0) {
    const mpnList = Array.from(
      new Set(
        mergedRowsPre
          .map((r) => r.winning_mpn?.toUpperCase())
          .filter((s): s is string => !!s)
      )
    );
    const suppliers = Array.from(
      new Set(
        mergedRowsPre
          .map((r) => r.supplier)
          .filter((s): s is string => !!s)
      )
    );
    if (mpnList.length > 0 && suppliers.length > 0) {
      const { data: cached } = await supabase
        .from("api_pricing_cache")
        .select("source, search_key, stock_qty, unit_price, fetched_at")
        .in("source", suppliers)
        .in("search_key", mpnList);
      for (const row of (cached ?? []) as CacheRow[]) {
        const k = `${row.source}|${row.search_key.toUpperCase()}`;
        if (!stockBySupplierMpn.has(k)) {
          stockBySupplierMpn.set(k, row.stock_qty);
        }
      }
    }
  }

  const mergedRows = mergedRowsPre
    .filter((r) => r.total_qty > 0) // Skip 0-qty lines — nothing to buy.
    .map((r) => {
      const stockKey =
        r.supplier && r.winning_mpn
          ? `${r.supplier}|${r.winning_mpn.toUpperCase()}`
          : null;
      const stock = stockKey ? stockBySupplierMpn.get(stockKey) ?? null : null;
      const ext =
        r.unit_price != null ? r.unit_price * r.total_with_extras : null;
      return { ...r, stock, ext_price: ext };
    })
    .sort((a, b) => b.total_with_extras - a.total_with_extras);
  const mergedTruncated = mergedRows.length > MERGED_ROW_LIMIT;
  const mergedShown = mergedTruncated
    ? mergedRows.slice(0, MERGED_ROW_LIMIT)
    : mergedRows;


  // Totals
  const totalSubtotal = members.reduce(
    (sum, m) => sum + Number(m.frozen_subtotal ?? 0),
    0
  );

  const missingBomMembers = members.filter((m) => !m.bom_id);

  // Deduplicated member GMPs for PCB/Stencil order cards.
  const memberGmpsMap = new Map<
    string,
    { id: string; gmp_number: string; board_name: string | null }
  >();
  for (const m of members) {
    const g = m.gmps;
    if (!g) continue;
    const id = g.id ?? `${g.gmp_number}`;
    if (!memberGmpsMap.has(id)) {
      memberGmpsMap.set(id, {
        id,
        gmp_number: g.gmp_number,
        board_name: g.board_name,
      });
    }
  }
  const memberGmps = Array.from(memberGmpsMap.values());

  const modeLabel = proc.procurement_mode
    ? (MODE_LABEL[proc.procurement_mode] ?? proc.procurement_mode)
    : "—";
  const batchLabel =
    proc.is_batch || (proc.member_count ?? 0) > 1
      ? `Batch of ${proc.member_count ?? members.length}`
      : "Single";

  return (
    <div className="space-y-6">
      <Link href="/proc">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to PROC Batches
        </Button>
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-2xl font-bold text-gray-900">
              {proc.proc_code}
            </h2>
            <Badge variant="outline" className="capitalize">
              {proc.status.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="mt-1 text-gray-500">
            {proc.customers
              ? `${proc.customers.code} — ${proc.customers.company_name}`
              : "Unknown customer"}
          </p>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Mode</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{modeLabel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Batch Type</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{batchLabel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">PROC Date</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {proc.proc_date ? formatDate(proc.proc_date) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">
              Frozen Subtotal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{fmtCurrency(totalSubtotal)}</p>
            <p className="text-xs text-gray-500">
              Sum across {members.length} member
              {members.length === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Batch Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Batch Members</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-gray-500">
              No member jobs linked to this PROC Batch.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>PO Number</TableHead>
                  <TableHead>PO Date</TableHead>
                  <TableHead>GMP</TableHead>
                  <TableHead>Board</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Source Quote</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m, idx) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">{idx + 1}</TableCell>
                    <TableCell className="text-sm">
                      <Link
                        href={`/jobs/${m.id}`}
                        className="font-mono text-blue-600 hover:underline"
                      >
                        {m.po_number ?? m.job_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {m.po_date ? formatDate(m.po_date) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {m.gmps?.gmp_number ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {m.gmps?.board_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {m.quantity}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {m.source_quote?.quote_number ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtCurrency(m.frozen_unit_price)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtCurrency(m.frozen_subtotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ProcTabs>
        {{
          components: (
            <div className="space-y-6">
      {/* Merged BOM */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Merged BOM
            {mergedRows.length > 0 && (
              <span className="ml-2 font-normal text-gray-500">
                ({mergedRows.length} unique CPC
                {mergedRows.length === 1 ? "" : "s"})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {missingBomMembers.length > 0 && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                {missingBomMembers.length} member job
                {missingBomMembers.length === 1 ? "" : "s"} missing a BOM
                {" — "}
                merged BOM may be incomplete:{" "}
                {missingBomMembers
                  .map((m) => m.job_number)
                  .slice(0, 5)
                  .join(", ")}
                {missingBomMembers.length > 5 ? "…" : ""}
              </span>
            </div>
          )}
          {mergedShown.length === 0 ? (
            <p className="text-sm text-gray-500">
              No BOM lines available for this PROC Batch.
            </p>
          ) : (
            <>
              <MergedBomTable
                procId={proc.id}
                allocationsByCpc={allocationsByCpc}
                buyQtyOverridesByCpc={buyQtyOverridesByCpc}
                rows={mergedShown.map((row) => {
                  const gmpList = Array.from(row.gmp_names);
                  return {
                    // Row identity is now CPC. MPN is purely display.
                    cpc: row.cpc,
                    mpn: row.winning_mpn,
                    mpns_seen: row.mpns_seen,
                    is_customer_supplied: row.is_customer_supplied,
                    description: row.description,
                    manufacturer: row.manufacturer,
                    m_code: row.m_code,
                    total_qty: row.total_qty,
                    extras: row.extras,
                    total_with_extras: row.total_with_extras,
                    gmp_names_joined: gmpList.join(" + "),
                    qty_per_board_joined: String(
                      gmpList.reduce(
                        (s, g) => s + (row.qty_per_board_by_gmp.get(g) ?? 0),
                        0
                      )
                    ),
                    supplier: row.supplier,
                    supplier_pn: row.supplier_pn,
                    stock: row.stock,
                    unit_price: row.unit_price,
                    ext_price: row.ext_price,
                    place_to_buy: row.supplier,
                    designators: row.designators_display,
                    customer_ref: row.customer_ref,
                    package_case: row.package_case,
                    is_apcb: row.is_apcb,
                    apcb_order_status: row.apcb_order_status,
                    apcb_order_external_id: row.apcb_order_external_id,
                    apcb_multiple_boards: row.apcb_multiple_boards,
                  };
                })}
              />
              {mergedTruncated && (
                <p className="mt-3 text-xs text-gray-500">
                  Showing first {MERGED_ROW_LIMIT} of {mergedRows.length} rows.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <StockAllocationsPanel procId={proc.id} initialRows={allocRows} />

      <SupplierQuotesPanel
        procId={proc.id}
        procLines={mergedRows.map((r) => ({
          // CPC is the stable identifier across reloads — procurement_lines
          // gets materialised on quote save, so no row id exists yet.
          // mpn is the winning MPN within this CPC group (may equal CPC when
          // the BOM had no CPC and the parser used MPN-as-CPC).
          cpc: r.cpc,
          mpn: r.winning_mpn ?? r.cpc,
          description: r.description,
          manufacturer: r.manufacturer,
          m_code: r.m_code,
          qty_needed: r.total_qty,
          qty_extra: r.extras,
          unit_price: r.unit_price, // CAD-cached price for sanity check
        }))}
      />

      <PurchaseOrdersList procId={proc.id} />
            </div>
          ),
          pcb: <PcbOrdersCard procId={proc.id} memberGmps={memberGmps} />,
          stencil: <StencilOrdersCard procId={proc.id} memberGmps={memberGmps} />,
        }}
      </ProcTabs>

      {proc.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-gray-500">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-gray-700">
              {proc.notes}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
