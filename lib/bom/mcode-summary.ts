// Per-BOM M-Code summary stats — the same shape RS used to read off the
// old DM file's summary line:
//
//   #Lines: 137, #Ttl prts: 863, Cpfd: 103, IP Fd: 23, TH: 14, 158
//
// Definitions (per the operator's spec):
//   lines       — non-zero qty BOM lines (excludes PCB row + DNI rows)
//   total_parts — SUM(qty) across SMT placements: CP, CPEXP, 0201, 0402, IP, MANSMT
//   cp_feeders  — COUNT of distinct lines whose m_code is in {CP, 0402, 0201, CPEXP}
//   ip_feeders  — COUNT of distinct lines whose m_code is IP
//   th_parts    — SUM(qty) across TH lines (parts per board)
//   th_pins     — SUM(qty * pin_count) across TH lines (pins per board)
//
// All counts are per-board. Tier qty / overage is applied later by the
// pricing engine; this summary describes the BOM itself.

export interface BomLineForSummary {
  quantity: number | null;
  m_code: string | null;
  is_pcb: boolean | null;
  is_dni: boolean | null;
  pin_count?: number | null;
}

export interface McodeSummary {
  lines: number;
  total_parts: number;
  cp_feeders: number;
  ip_feeders: number;
  th_parts: number;
  th_pins: number;
}

const SMT_PLACEMENT_CODES = new Set(["CP", "CPEXP", "0201", "0402", "IP", "MANSMT"]);
const CP_FEEDER_CODES = new Set(["CP", "0402", "0201", "CPEXP"]);

export function calcMcodeSummary(lines: readonly BomLineForSummary[]): McodeSummary {
  let lineCount = 0;
  let totalParts = 0;
  let cpFeeders = 0;
  let ipFeeders = 0;
  let thParts = 0;
  let thPins = 0;

  for (const l of lines) {
    if (l.is_pcb) continue;
    if (l.is_dni) continue;
    const qty = Number(l.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    lineCount += 1;

    const code = l.m_code ?? "";
    if (SMT_PLACEMENT_CODES.has(code)) {
      totalParts += qty;
    }
    if (CP_FEEDER_CODES.has(code)) {
      cpFeeders += 1;
    }
    if (code === "IP") {
      ipFeeders += 1;
    }
    if (code === "TH") {
      thParts += qty;
      const pins = Number(l.pin_count ?? 0);
      if (Number.isFinite(pins) && pins > 0) {
        thPins += qty * pins;
      }
    }
  }

  return {
    lines: lineCount,
    total_parts: totalParts,
    cp_feeders: cpFeeders,
    ip_feeders: ipFeeders,
    th_parts: thParts,
    th_pins: thPins,
  };
}

/** One-liner the operator recognises from the old DM file. */
export function formatMcodeSummary(s: McodeSummary): string {
  return `#Lines: ${s.lines}, #Ttl prts: ${s.total_parts}, Cpfd: ${s.cp_feeders}, IP Fd: ${s.ip_feeders}, TH: ${s.th_parts}, ${s.th_pins}`;
}
