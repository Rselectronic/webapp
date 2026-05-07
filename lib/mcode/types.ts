export type MCode =
  | "0201" | "0402" | "CP" | "CPEXP" | "IP" | "TH"
  | "MANSMT" | "MEC" | "Accs" | "CABLE" | "DEV B"
  // RS-specific extras preserved from the legacy DM Common File. These
  // aren't produced by the rules engine but show up in BOM data, in the AI
  // classifier output (notably APCB), and in the pricing engine. Listed
  // here so string comparisons (`m_code === "APCB"` etc.) typecheck.
  | "APCB" | "PCB" | "EA" | "AEA" | "FUSE" | "LABEL" | "WIRE" | "PRESSFIT";

export interface ClassificationResult {
  m_code: MCode | null;
  confidence: number;
  source: "database" | "rules" | "api" | "manual" | null;
  rule_id?: string;
}

export interface ClassificationInput {
  mpn: string;
  description: string;
  cpc: string;
  manufacturer: string;
  mounting_type?: string;
  package_case?: string;
  category?: string;
  sub_category?: string;
  features?: string;
  attachment_method?: string;
  length_mm?: number;
  width_mm?: number;
}

export interface ParRule {
  rule_id: string;
  priority: number;
  layer: 1 | 2 | 3;
  field_1: string;
  operator_1: "equals" | "contains" | "regex" | "in" | "not_contains";
  value_1: string;
  field_2?: string;
  operator_2?: "equals" | "contains" | "regex" | "in" | "not_contains";
  value_2?: string;
  assigned_m_code: MCode;
  description: string;
}
