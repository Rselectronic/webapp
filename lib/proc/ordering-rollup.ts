// Shared PROC merged-BOM rollup used by order-export endpoints.
// Duplicates (intentionally) a simplified subset of the logic in
// app/(dashboard)/proc/[id]/page.tsx so ordering endpoints don't need to
// couple to a React page component.
//
// Phase 3 refactor: aggregation key is CPC (the business identity at RS),
// not MPN. The "winning MPN" for a CPC group is the MPN with the most
// aggregated qty across contributing bom_lines (or the
// customer_parts.mpn_to_use override when set), and that's what supplier
// orders / quote lookups use.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  rankDistributors,
  type DistributorQuote,
  type PriceBreak,
} from "@/lib/proc/rank-distributors";
import { getRate } from "@/lib/pricing/fx";

export interface ProcOrderingSelection {
  cpc: string | null;
  mpn: string;
  chosen_supplier: string;
  chosen_supplier_pn: string | null;
  chosen_unit_price_cad: number | null;
  chosen_effective_qty: number | null;
  manual_unit_price_cad: number | null;
  manual_price_note: string | null;
}

export interface ProcOrderingRow {
  // CPC is the row identity. The displayed MPN for the supplier-facing PO is
  // the winning MPN within this CPC group.
  cpc: string;
  cpc_display: string | null;
  winning_mpn: string | null;
  description: string | null;
  manufacturer: string | null;
  m_code: string | null;
  total_qty: number;
  extras: number;
  total_with_extras: number;
  is_customer_supplied: boolean;
  customer_ref: string;
  selection: ProcOrderingSelection | null;
}

export interface ProcOrderingContext {
  proc: { id: string; proc_code: string; customer_id: string | null } | null;
  rows: ProcOrderingRow[];
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

interface MemberJob {
  id: string;
  quantity: number;
  bom_id: string | null;
  source_quote_id: string | null;
  gmps: { id: string; gmp_number: string | null; board_name: string | null } | null;
}

interface OverageTier {
  m_code: string;
  qty_threshold: number;
  extras: number;
}

export async function buildProcOrderingRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  procurementId: string
): Promise<ProcOrderingContext> {
  const { data: procRow } = await supabase
    .from("procurements")
    .select("id, proc_code, customer_id")
    .eq("id", procurementId)
    .maybeSingle();
  if (!procRow) return { proc: null, rows: [] };
  const proc = procRow as { id: string; proc_code: string; customer_id: string | null };

  const { data: membersData } = await supabase
    .from("jobs")
    .select(
      "id, quantity, bom_id, source_quote_id, gmps(id, gmp_number, board_name)"
    )
    .eq("procurement_id", procurementId)
    .order("job_number", { ascending: true });
  const members = ((membersData ?? []) as unknown) as MemberJob[];

  const bomIds = Array.from(
    new Set(members.map((m) => m.bom_id).filter((b): b is string => !!b))
  );

  let bomLines: BomLine[] = [];
  if (bomIds.length > 0) {
    const { data } = await supabase
      .from("bom_lines")
      .select(
        "id, bom_id, quantity, mpn, cpc, description, manufacturer, m_code, reference_designator"
      )
      .in("bom_id", bomIds);
    bomLines = ((data ?? []) as unknown) as BomLine[];
  }

  // Customer-part mpn_to_use override
  const cpcToMpn = new Map<string, string>();
  if (proc.customer_id) {
    const { data: cpData } = await supabase
      .from("customer_parts")
      .select("cpc, mpn_to_use")
      .eq("customer_id", proc.customer_id)
      .not("cpc", "is", null)
      .not("mpn_to_use", "is", null);
    for (const r of (cpData ?? []) as { cpc: string | null; mpn_to_use: string | null }[]) {
      if (r.cpc && r.mpn_to_use) cpcToMpn.set(r.cpc.toUpperCase(), r.mpn_to_use);
    }
  }

  // Customer-supplied bom_line ids
  const csIds = new Set<string>();
  const quoteIds = Array.from(
    new Set(members.map((m) => m.source_quote_id).filter((q): q is string => !!q))
  );
  if (quoteIds.length > 0) {
    const { data: csData } = await supabase
      .from("quote_customer_supplied")
      .select("bom_line_id")
      .in("quote_id", quoteIds);
    for (const r of (csData ?? []) as { bom_line_id: string | null }[]) {
      if (r.bom_line_id) csIds.add(r.bom_line_id);
    }
  }

  // Overage
  const { data: overageData } = await supabase
    .from("overage_table")
    .select("m_code, qty_threshold, extras");
  const overageByMcode = new Map<string, OverageTier[]>();
  for (const t of (overageData ?? []) as OverageTier[]) {
    const arr = overageByMcode.get(t.m_code) ?? [];
    arr.push(t);
    overageByMcode.set(t.m_code, arr);
  }
  for (const [, arr] of overageByMcode) arr.sort((a, b) => a.qty_threshold - b.qty_threshold);
  const extrasFor = (mc: string | null, qty: number): number => {
    if (!mc) return 0;
    const tiers = overageByMcode.get(mc);
    if (!tiers) return 0;
    let e = 0;
    for (const t of tiers) if (qty >= t.qty_threshold) e = t.extras;
    return e;
  };

  // Board letters per GMP (in member order)
  const letterByGmpId = new Map<string, string>();
  {
    let i = 0;
    for (const m of members) {
      const gid = m.gmps?.id;
      if (!gid || letterByGmpId.has(gid)) continue;
      letterByGmpId.set(gid, String.fromCharCode(65 + i));
      i += 1;
    }
  }
  const letterByGmpLabel = new Map<string, string>();
  for (const m of members) {
    const label = m.gmps?.gmp_number ?? m.gmps?.board_name ?? "—";
    const gid = m.gmps?.id;
    if (gid && letterByGmpId.has(gid)) {
      letterByGmpLabel.set(label, letterByGmpId.get(gid)!);
    }
  }

  const bomIdToMember = new Map<string, MemberJob>();
  for (const m of members) if (m.bom_id) bomIdToMember.set(m.bom_id, m);

  interface Merged {
    // Uppercased CPC = aggregation key.
    cpc: string;
    cpc_display: string | null;
    // Per-MPN qty within this CPC group; winner picked after the merge loop.
    qty_by_mpn: Map<string, number>;
    winning_mpn: string | null;
    description: string | null;
    manufacturer: string | null;
    m_code: string | null;
    total_qty: number;
    gmp_labels: Set<string>;
    designators: Set<string>;
    contributing_lines: number;
    cs_lines: number;
  }
  const merged = new Map<string, Merged>();
  for (const line of bomLines) {
    const member = bomIdToMember.get(line.bom_id);
    if (!member) continue;
    // Aggregate on CPC (uppercased); fall back to MPN when CPC is blank.
    const cpcDisplay = (line.cpc ?? "").trim();
    const mpnTrim = (line.mpn ?? "").trim();
    const keyRaw = cpcDisplay || mpnTrim;
    if (!keyRaw) continue;
    const key = keyRaw.toUpperCase();
    const gmpLabel = member.gmps?.gmp_number ?? member.gmps?.board_name ?? "—";
    const add = (line.quantity ?? 0) * (member.quantity ?? 0);
    const isCS = csIds.has(line.id);
    const existing = merged.get(key);
    if (existing) {
      existing.total_qty += add;
      existing.gmp_labels.add(gmpLabel);
      if (!existing.cpc_display && cpcDisplay) existing.cpc_display = cpcDisplay;
      existing.description ||= line.description ?? null;
      existing.manufacturer ||= line.manufacturer ?? null;
      existing.m_code ||= line.m_code ?? null;
      existing.contributing_lines += 1;
      if (isCS) existing.cs_lines += 1;
      if (mpnTrim) {
        existing.qty_by_mpn.set(
          mpnTrim,
          (existing.qty_by_mpn.get(mpnTrim) ?? 0) + add
        );
      }
      const d = (line.reference_designator ?? "").trim();
      if (d) {
        for (const tok of d.split(/[,;\s]+/)) {
          const t = tok.trim();
          if (t) existing.designators.add(t);
        }
      }
    } else {
      const rec: Merged = {
        cpc: key,
        cpc_display: cpcDisplay || null,
        qty_by_mpn: new Map(mpnTrim ? [[mpnTrim, add]] : []),
        winning_mpn: null,
        description: line.description,
        manufacturer: line.manufacturer,
        m_code: line.m_code,
        total_qty: add,
        gmp_labels: new Set([gmpLabel]),
        designators: new Set<string>(),
        contributing_lines: 1,
        cs_lines: isCS ? 1 : 0,
      };
      const d = (line.reference_designator ?? "").trim();
      if (d) {
        for (const tok of d.split(/[,;\s]+/)) {
          const t = tok.trim();
          if (t) rec.designators.add(t);
        }
      }
      merged.set(key, rec);
    }
  }
  // Resolve winning MPN per CPC: customer_parts.mpn_to_use override wins;
  // otherwise highest-qty contributor.
  for (const r of merged.values()) {
    const override = cpcToMpn.get(r.cpc);
    if (override) {
      r.winning_mpn = override;
    } else {
      const sorted = Array.from(r.qty_by_mpn.entries()).sort((a, b) => b[1] - a[1]);
      r.winning_mpn = sorted[0]?.[0] ?? null;
    }
  }

  // Selections (include manual override fields from migration 067). The
  // selections table now carries cpc (migration 081); for legacy rows that
  // still only have mpn, we map the row to the CPC group whose winning MPN
  // matches.
  const { data: selData } = await supabase
    .from("procurement_line_selections")
    .select(
      "cpc, mpn, chosen_supplier, chosen_supplier_pn, chosen_unit_price_cad, chosen_effective_qty, manual_unit_price_cad, manual_price_note"
    )
    .eq("procurement_id", procurementId);
  const selByCpc = new Map<string, ProcOrderingSelection>();
  // Reverse lookup for legacy (cpc-null) rows.
  const cpcByWinningMpn = new Map<string, string>();
  for (const r of merged.values()) {
    if (r.winning_mpn) cpcByWinningMpn.set(r.winning_mpn.toUpperCase(), r.cpc);
  }
  for (const s of (selData ?? []) as ProcOrderingSelection[]) {
    const cpcKey = s.cpc
      ? s.cpc.toUpperCase()
      : cpcByWinningMpn.get((s.mpn ?? "").toUpperCase()) ?? null;
    if (!cpcKey) continue;
    selByCpc.set(cpcKey, s);
  }

  // ---------------------------------------------------------------------
  // Synthetic auto-winners for MPNs the operator hasn't bulk-applied yet.
  //
  // /api/proc/[id]/distributor-quotes ranks cached quotes and picks a
  // winner per MPN. That winner is only persisted into
  // procurement_line_selections when the operator clicks a radio or runs
  // bulk-apply. Operators want to generate the supplier PDF / Excel BEFORE
  // that step, so here we replicate the same ranking and inject a
  // synthetic selection for every MPN that lacks an explicit one. If no
  // winner exists (no cached quotes / no CAD price), the row is left
  // without a selection and will be excluded downstream just as before.
  // ---------------------------------------------------------------------
  {
    // Collect alternates for every bom_line in the merged set so the
    // ranker can consider them — mirrors the distributor-quotes route.
    const bomLineIds = bomLines.map((l) => l.id);
    const altsByLineId = new Map<
      string,
      { mpn: string }[]
    >();
    if (bomLineIds.length > 0) {
      const { data: altRows } = await supabase
        .from("bom_line_alternates")
        .select("bom_line_id, mpn")
        .in("bom_line_id", bomLineIds);
      for (const a of (altRows ?? []) as {
        bom_line_id: string;
        mpn: string | null;
      }[]) {
        if (!a.mpn) continue;
        const arr = altsByLineId.get(a.bom_line_id) ?? [];
        arr.push({ mpn: a.mpn });
        altsByLineId.set(a.bom_line_id, arr);
      }
    }

    // For each CPC, gather alt MPNs (winner + every contributing MPN +
    // explicit alternates from bom_line_alternates) used when searching the
    // pricing cache. Pricing cache stays MPN-keyed.
    const altMpnsByCpc = new Map<string, Map<string, string>>(); // cpc -> (upper -> original)
    for (const line of bomLines) {
      const member = bomIdToMember.get(line.bom_id);
      if (!member) continue;
      const cpcDisplay = (line.cpc ?? "").trim();
      const mpnTrim = (line.mpn ?? "").trim();
      const keyRaw = cpcDisplay || mpnTrim;
      if (!keyRaw) continue;
      const cpc = keyRaw.toUpperCase();
      const r = merged.get(cpc);
      const winnerUpper = r?.winning_mpn ? r.winning_mpn.toUpperCase() : null;
      let map = altMpnsByCpc.get(cpc);
      // Include the line's own MPN as an alternate when it's different from
      // the winning MPN.
      if (mpnTrim && winnerUpper && mpnTrim.toUpperCase() !== winnerUpper) {
        if (!map) {
          map = new Map();
          altMpnsByCpc.set(cpc, map);
        }
        const up = mpnTrim.toUpperCase();
        if (!map.has(up)) map.set(up, mpnTrim);
      }
      const alts = altsByLineId.get(line.id) ?? [];
      if (alts.length === 0) continue;
      if (!map) {
        map = new Map();
        altMpnsByCpc.set(cpc, map);
      }
      for (const a of alts) {
        const t = a.mpn.trim();
        if (!t) continue;
        const up = t.toUpperCase();
        if (winnerUpper && up === winnerUpper) continue;
        if (!map.has(up)) map.set(up, t);
      }
    }

    // CPCs that need a synthetic winner: not in selByCpc, not fully CS,
    // and have a positive total_qty.
    const cpcsNeedingSynth: string[] = [];
    for (const r of merged.values()) {
      if (selByCpc.has(r.cpc)) continue;
      if (r.total_qty <= 0) continue;
      // Skip if ANY contributing line is CS (matches distributor-quotes
      // route "is_customer_supplied = any"). Those parts aren't ordered.
      if (r.cs_lines > 0) continue;
      // APCB rows have no distributor quotes — leave to PCB ordering flow.
      if (r.m_code === "APCB") continue;
      // Need a winning MPN to query pricing cache against.
      if (!r.winning_mpn) continue;
      cpcsNeedingSynth.push(r.cpc);
    }

    if (cpcsNeedingSynth.length > 0) {
      // Build search-key set (winner MPN + alternates per CPC).
      const searchKeys = new Set<string>();
      for (const cpc of cpcsNeedingSynth) {
        const r = merged.get(cpc);
        if (r?.winning_mpn) searchKeys.add(r.winning_mpn.toUpperCase());
        const alts = altMpnsByCpc.get(cpc);
        if (alts) for (const up of alts.keys()) searchKeys.add(up);
      }

      interface CacheRow {
        source: string;
        search_key: string;
        unit_price: number | null;
        stock_qty: number | null;
        currency: string | null;
        manufacturer: string | null;
        supplier_part_number: string | null;
        price_breaks: unknown;
        lead_time_days: number | null;
        moq: number | null;
        order_multiple: number | null;
        fetched_at: string;
      }
      const { data: cacheRows } = await supabase
        .from("api_pricing_cache")
        .select(
          "source, search_key, unit_price, stock_qty, currency, manufacturer, supplier_part_number, price_breaks, lead_time_days, moq, order_multiple, fetched_at"
        )
        .in("search_key", Array.from(searchKeys));
      const cacheByKey = new Map<string, CacheRow[]>();
      for (const row of (cacheRows ?? []) as CacheRow[]) {
        const k = row.search_key.toUpperCase();
        const arr = cacheByKey.get(k) ?? [];
        arr.push(row);
        cacheByKey.set(k, arr);
      }

      // FX cache (USD/EUR/... -> CAD)
      const fxCache = new Map<string, number | null>();
      const getFxRate = async (cur: string): Promise<number | null> => {
        if (!cur || cur === "CAD") return 1.0;
        if (fxCache.has(cur)) return fxCache.get(cur)!;
        const rate = await getRate(cur, "CAD");
        const r = rate ? rate.rate : null;
        fxCache.set(cur, r);
        return r;
      };

      interface RawBreak {
        min_qty?: number;
        quantity?: number;
        unit_price?: number;
        currency?: string;
      }
      const rowToQuote = async (row: CacheRow): Promise<DistributorQuote | null> => {
        if (
          row.unit_price == null &&
          (!row.price_breaks ||
            (Array.isArray(row.price_breaks) && row.price_breaks.length === 0))
        ) {
          return null;
        }
        const cur = row.currency ?? "USD";
        const fxRate = await getFxRate(cur);
        const rawBreaks: RawBreak[] = Array.isArray(row.price_breaks)
          ? (row.price_breaks as RawBreak[])
          : [];
        const price_breaks: PriceBreak[] = rawBreaks
          .map((b) => {
            const min_qty = b.min_qty ?? b.quantity ?? 0;
            const unit_price = b.unit_price ?? 0;
            const currency = b.currency ?? cur;
            const unit_price_cad = fxRate != null ? unit_price * fxRate : null;
            return { min_qty, unit_price, unit_price_cad, currency };
          })
          .filter((b) => b.min_qty > 0 && b.unit_price > 0)
          .sort((a, b) => a.min_qty - b.min_qty);
        const unit_price_cad_fallback =
          row.unit_price != null && fxRate != null ? row.unit_price * fxRate : null;
        return {
          source: row.source,
          supplier_pn: row.supplier_part_number,
          manufacturer: row.manufacturer,
          stock_qty: row.stock_qty,
          moq: row.moq,
          order_multiple: row.order_multiple,
          lead_time_days: row.lead_time_days,
          price_breaks,
          unit_price_cad_fallback,
          currency: cur,
          fetched_at: row.fetched_at,
        };
      };

      for (const cpc of cpcsNeedingSynth) {
        const r = merged.get(cpc);
        if (!r || !r.winning_mpn) continue;
        const qty_needed = r.total_qty + extrasFor(r.m_code, r.total_qty);
        if (qty_needed <= 0) continue;

        const keys: string[] = [r.winning_mpn.toUpperCase()];
        const alts = altMpnsByCpc.get(cpc);
        if (alts) for (const up of alts.keys()) keys.push(up);

        const quotes: DistributorQuote[] = [];
        for (const k of keys) {
          const rawRows = cacheByKey.get(k) ?? [];
          for (const row of rawRows) {
            const q = await rowToQuote(row);
            if (q) quotes.push(q);
          }
        }
        if (quotes.length === 0) continue;

        const { winner } = rankDistributors({ qty_needed, quotes });
        if (!winner || winner.effective_unit_price_cad == null) continue;

        selByCpc.set(cpc, {
          cpc,
          mpn: r.winning_mpn,
          chosen_supplier: winner.source,
          chosen_supplier_pn: winner.supplier_pn,
          chosen_unit_price_cad: winner.effective_unit_price_cad,
          chosen_effective_qty: winner.effective_qty,
          manual_unit_price_cad: null,
          manual_price_note: null,
        });
      }
    }
  }

  const rows: ProcOrderingRow[] = [];
  for (const r of merged.values()) {
    const extras = extrasFor(r.m_code, r.total_qty);
    const is_cs = r.contributing_lines > 0 && r.cs_lines === r.contributing_lines;

    const boardLetters = Array.from(r.gmp_labels)
      .map((g) => letterByGmpLabel.get(g) ?? "")
      .filter((s) => s.length > 0)
      .sort()
      .join("");
    const desigList = Array.from(r.designators);
    const singleDesig = desigList.length === 1 ? desigList[0] : "";
    const cpcOut = r.cpc_display ?? r.cpc;
    const parts: string[] = [];
    if (boardLetters) parts.push(boardLetters);
    if (singleDesig) parts.push(singleDesig);
    if (r.m_code) parts.push(r.m_code);
    if (cpcOut) parts.push(cpcOut);
    const customer_ref = parts.join(" ");

    rows.push({
      cpc: cpcOut,
      cpc_display: r.cpc_display,
      winning_mpn: r.winning_mpn,
      description: r.description,
      manufacturer: r.manufacturer,
      m_code: r.m_code,
      total_qty: r.total_qty,
      extras,
      total_with_extras: r.total_qty + extras,
      is_customer_supplied: is_cs,
      customer_ref,
      selection: selByCpc.get(r.cpc) ?? null,
    });
  }

  return { proc, rows };
}
