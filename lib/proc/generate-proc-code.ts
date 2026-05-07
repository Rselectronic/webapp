import type { SupabaseClient } from "@supabase/supabase-js";

export type ProcurementMode =
  | "turnkey"
  | "consignment"
  | "assembly_only";

export interface ProcCodeInput {
  supabase: SupabaseClient;
  customer_code: string;
  customer_id: string;
  procurement_mode: ProcurementMode;
  member_count: number;
  date?: Date;
}

export interface ProcCodeResult {
  proc_code: string;
  proc_date: string;
  sequence_num: number;
  is_batch: boolean;
  mode_letter: "T" | "C" | "A";
  size_letter: "S" | "B";
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function pad3(n: number): string {
  if (n < 10) return `00${n}`;
  if (n < 100) return `0${n}`;
  return String(n);
}

function modeLetter(mode: ProcurementMode): "T" | "C" | "A" {
  if (mode === "turnkey") return "T";
  if (mode === "assembly_only") return "A";
  // Covers canonical "consignment" and any legacy consign_* values still in flight.
  if (mode.startsWith("consign")) return "C";
  // Fallback — should be unreachable given the type.
  throw new Error(`Unknown procurement_mode: ${mode}`);
}

export async function generateProcCode(
  input: ProcCodeInput,
): Promise<ProcCodeResult> {
  const d = input.date ?? new Date();

  const yy = pad2(d.getFullYear() % 100);
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const yymmdd = `${yy}${mm}${dd}`;

  const isoDate = `${d.getFullYear()}-${mm}-${dd}`;

  const mLetter = modeLetter(input.procurement_mode);
  const sLetter: "S" | "B" = input.member_count > 1 ? "B" : "S";
  const isBatch = input.member_count > 1;

  // Sequence is per CUSTOMER, monotonically increasing across all dates
  // and all type letters (TB/TS/CB/CS/AB/AS). 260424 TLAN-TS001 → 260424
  // TLAN-TB002 → 260427 TLAN-TS003 etc. The previous implementation
  // scoped by (proc_date, customer_id) which reset the counter every
  // day. Drop proc_date from the filter.
  const { data, error } = await input.supabase
    .from("procurements")
    .select("sequence_num")
    .eq("customer_id", input.customer_id)
    .order("sequence_num", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to query last sequence_num: ${error.message}`);
  }

  const last =
    data && data.length > 0 && typeof data[0].sequence_num === "number"
      ? data[0].sequence_num
      : 0;
  const sequence_num = last + 1;

  const proc_code = `${yymmdd} ${input.customer_code}-${mLetter}${sLetter}${pad3(sequence_num)}`;

  return {
    proc_code,
    proc_date: isoDate,
    sequence_num,
    is_batch: isBatch,
    mode_letter: mLetter,
    size_letter: sLetter,
  };
}
