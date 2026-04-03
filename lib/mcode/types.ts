export type MCode =
  | "0201" | "0402" | "CP" | "CPEXP" | "IP" | "TH"
  | "MANSMT" | "MEC" | "Accs" | "CABLE" | "DEV B";

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
  length_mm?: number;
  width_mm?: number;
}

export interface ParRule {
  rule_id: string;
  priority: number;
  layer: 1 | 2 | 3;
  field_1: string;
  operator_1: "equals" | "contains" | "regex" | "in";
  value_1: string;
  field_2?: string;
  operator_2?: "equals" | "contains" | "regex" | "in";
  value_2?: string;
  assigned_m_code: MCode;
  description: string;
}
