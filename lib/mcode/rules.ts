import type { ClassificationInput, ClassificationResult, MCode, ParRule } from "./types";

// ---------------------------------------------------------------------------
// Core PAR Rules (PAR-01 through PAR-13: keyword/package, PAR-20 through PAR-24: size)
// ---------------------------------------------------------------------------

export const CORE_PAR_RULES: ParRule[] = [
  // --- Layer 1: Mounting-type rules ---
  {
    rule_id: "PAR-01",
    priority: 1,
    layer: 1,
    field_1: "mounting_type",
    operator_1: "equals",
    value_1: "Through Hole",
    assigned_m_code: "TH",
    description: "Through-hole mounting type maps directly to TH",
  },
  {
    rule_id: "PAR-02",
    priority: 2,
    layer: 1,
    field_1: "mounting_type",
    operator_1: "contains",
    value_1: "Surface Mount, Through Hole",
    assigned_m_code: "MANSMT",
    description: "Mixed mounting (SMT + TH) maps to MANSMT",
  },
  {
    rule_id: "PAR-03",
    priority: 3,
    layer: 1,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)(connector|header|socket)",
    field_2: "mounting_type",
    operator_2: "equals",
    value_2: "Through Hole",
    assigned_m_code: "TH",
    description: "Connectors / headers / sockets with TH mounting → TH",
  },

  // --- Layer 2: Package-case rules ---
  {
    rule_id: "PAR-04",
    priority: 10,
    layer: 2,
    field_1: "package_case",
    operator_1: "regex",
    value_1: "^0201$",
    assigned_m_code: "0201",
    description: "Package 0201 maps to M-Code 0201",
  },
  {
    rule_id: "PAR-05",
    priority: 11,
    layer: 2,
    field_1: "package_case",
    operator_1: "regex",
    value_1: "^0402$",
    assigned_m_code: "0402",
    description: "Package 0402 maps to M-Code 0402",
  },
  {
    rule_id: "PAR-06",
    priority: 12,
    layer: 2,
    field_1: "package_case",
    operator_1: "regex",
    value_1: "^(0603|0805|1206|1210|1812|2010|2512)$",
    assigned_m_code: "CP",
    description: "Standard SMT passive sizes map to CP",
  },
  {
    rule_id: "PAR-07",
    priority: 13,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)(resistor|capacitor|inductor|ferrite|diode|led)",
    field_2: "mounting_type",
    operator_2: "contains",
    value_2: "Surface Mount",
    assigned_m_code: "CP",
    description: "Passive components with SMT mounting → CP",
  },
  {
    rule_id: "PAR-08",
    priority: 20,
    layer: 2,
    field_1: "package_case",
    operator_1: "regex",
    value_1: "(?i)(SOIC|SSOP|TSSOP|SOT|QFN|DFN|MSOP|WSON|SON)",
    assigned_m_code: "IP",
    description: "Small IC packages (SOIC, QFN, etc.) map to IP",
  },
  {
    rule_id: "PAR-09",
    priority: 21,
    layer: 2,
    field_1: "package_case",
    operator_1: "regex",
    value_1: "(?i)(QFP|TQFP|LQFP|BGA|CSP|LGA|PLCC|PGA)",
    assigned_m_code: "IP",
    description: "Large IC packages (QFP, BGA, etc.) map to IP",
  },

  // --- Layer 2: Description-based keyword rules ---
  {
    rule_id: "PAR-10",
    priority: 30,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)(mechanical|standoff|spacer|screw|nut|washer|bracket|heatsink|heat sink|enclosure)",
    assigned_m_code: "MEC",
    description: "Mechanical parts → MEC",
  },
  {
    rule_id: "PAR-11",
    priority: 31,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)(cable|wire|harness|cord|coaxial|ribbon)",
    assigned_m_code: "CABLE",
    description: "Cables and wires → CABLE",
  },
  {
    rule_id: "PAR-12",
    priority: 32,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)(accessor|label|sticker|tape|adhesive|tool|kit)",
    assigned_m_code: "Accs",
    description: "Accessories → Accs",
  },
  {
    rule_id: "PAR-13",
    priority: 33,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)(development board|dev board|eval board|evaluation board|demo board|starter kit)",
    assigned_m_code: "DEV B",
    description: "Development / evaluation boards → DEV B",
  },

  // --- Layer 3: Size-based classification (length_mm x width_mm) ---
  {
    rule_id: "PAR-20",
    priority: 50,
    layer: 3,
    field_1: "length_mm",
    operator_1: "regex",
    value_1: "0.4-0.99",
    field_2: "width_mm",
    operator_2: "regex",
    value_2: "0.2-0.59",
    assigned_m_code: "0201",
    description: "Size range ~0201 (L 0.4-0.99 x W 0.2-0.59)",
  },
  {
    rule_id: "PAR-21",
    priority: 51,
    layer: 3,
    field_1: "length_mm",
    operator_1: "regex",
    value_1: "1.0-1.09",
    field_2: "width_mm",
    operator_2: "regex",
    value_2: "0.5-0.59",
    assigned_m_code: "0402",
    description: "Size range ~0402 (L 1.0-1.09 x W 0.5-0.59)",
  },
  {
    rule_id: "PAR-22",
    priority: 52,
    layer: 3,
    field_1: "length_mm",
    operator_1: "regex",
    value_1: "1.5-9.99",
    field_2: "width_mm",
    operator_2: "regex",
    value_2: "0.5-9.99",
    assigned_m_code: "CP",
    description: "Size range covering standard passives (L 1.5-9.99 x W 0.5-9.99)",
  },
  {
    rule_id: "PAR-23",
    priority: 53,
    layer: 3,
    field_1: "length_mm",
    operator_1: "regex",
    value_1: "10.0-99.99",
    field_2: "width_mm",
    operator_2: "regex",
    value_2: "10.0-99.99",
    assigned_m_code: "IP",
    description: "Size range for larger IC packages (L 10-99 x W 10-99)",
  },
  {
    rule_id: "PAR-24",
    priority: 54,
    layer: 3,
    field_1: "length_mm",
    operator_1: "regex",
    value_1: "100.0-9999.99",
    field_2: "width_mm",
    operator_2: "regex",
    value_2: "100.0-9999.99",
    assigned_m_code: "MEC",
    description: "Very large parts are likely mechanical (L/W >= 100 mm)",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Retrieve the value of a named field from the classification input.
 */
function getInputField(field: string, input: ClassificationInput): string | number | undefined {
  const map: Record<string, unknown> = {
    mpn: input.mpn,
    description: input.description,
    cpc: input.cpc,
    manufacturer: input.manufacturer,
    mounting_type: input.mounting_type,
    package_case: input.package_case,
    category: input.category,
    length_mm: input.length_mm,
    width_mm: input.width_mm,
  };
  return map[field] as string | number | undefined;
}

/**
 * Check whether a single condition matches.
 *
 * For operator "regex", if `value` looks like a numeric range (e.g. "0.4-0.99")
 * we perform a numeric range comparison instead of regex matching.
 */
function matchesCondition(
  field: string,
  operator: "equals" | "contains" | "regex" | "in",
  value: string,
  input: ClassificationInput,
): boolean {
  const fieldValue = getInputField(field, input);
  if (fieldValue === undefined || fieldValue === null) return false;

  // Detect numeric range values for the "regex" operator (e.g. "0.4-0.99")
  if (operator === "regex" && /^\d+(\.\d+)?-\d+(\.\d+)?$/.test(value)) {
    const num = typeof fieldValue === "number" ? fieldValue : parseFloat(String(fieldValue));
    if (isNaN(num)) return false;
    const [minStr, maxStr] = value.split("-");
    const min = parseFloat(minStr);
    const max = parseFloat(maxStr);
    return num >= min && num <= max;
  }

  const strValue = String(fieldValue);

  switch (operator) {
    case "equals":
      return strValue === value;
    case "contains":
      return strValue.includes(value);
    case "regex": {
      const re = new RegExp(value);
      return re.test(strValue);
    }
    case "in":
      return value.split(",").map((v) => v.trim()).includes(strValue);
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a single PAR rule matches the given input.
 */
export function matchesRule(rule: ParRule, input: ClassificationInput): boolean {
  // First condition must match
  if (!matchesCondition(rule.field_1, rule.operator_1, rule.value_1, input)) {
    return false;
  }

  // If a second condition exists, it must also match
  if (rule.field_2 && rule.operator_2 && rule.value_2 !== undefined) {
    if (!matchesCondition(rule.field_2, rule.operator_2, rule.value_2, input)) {
      return false;
    }
  }

  return true;
}

/**
 * Classify an input by running through rules sorted by priority.
 * Returns the first matching rule's result.
 */
export function classifyByRules(
  input: ClassificationInput,
  rules: ParRule[] = CORE_PAR_RULES,
): ClassificationResult {
  // Sort by priority ascending (lowest number = highest priority)
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    if (matchesRule(rule, input)) {
      return {
        m_code: rule.assigned_m_code,
        confidence: 0.85,
        source: "rules",
        rule_id: rule.rule_id,
      };
    }
  }

  // No rule matched
  return {
    m_code: null,
    confidence: 0,
    source: null,
  };
}
