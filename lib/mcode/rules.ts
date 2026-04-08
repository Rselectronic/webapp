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

  // --- Layer 2: Connector-specific classification (from VBA Admin rules) ---
  {
    rule_id: "PAR-25",
    priority: 34,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)\\bpin\\b.*\\bcrimp\\b",
    assigned_m_code: "CABLE",
    description: "Pin + Crimp in description → CABLE (crimped pin contacts)",
  },
  {
    rule_id: "PAR-26",
    priority: 35,
    layer: 2,
    field_1: "category",
    operator_1: "equals",
    value_1: "Connectors, Interconnects",
    field_2: "description",
    operator_2: "contains",
    value_2: "Surface Mount",
    assigned_m_code: "MANSMT",
    description: "SMT connectors (category=Connectors + Surface Mount) → MANSMT",
  },
  {
    rule_id: "PAR-27",
    priority: 36,
    layer: 2,
    field_1: "category",
    operator_1: "equals",
    value_1: "Connectors, Interconnects",
    field_2: "mounting_type",
    operator_2: "equals",
    value_2: "Surface Mount",
    assigned_m_code: "MANSMT",
    description: "SMT connectors (category=Connectors + mounting=Surface Mount) → MANSMT",
  },
  {
    rule_id: "PAR-28",
    priority: 37,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)connector\\s+header.*position",
    field_2: "mounting_type",
    operator_2: "equals",
    value_2: "Surface Mount",
    assigned_m_code: "MANSMT",
    description: "Connector header with SMT mounting → MANSMT",
  },
  {
    rule_id: "PAR-29",
    priority: 38,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)end\\s+launch\\s+solder",
    assigned_m_code: "TH",
    description: "End Launch Solder connectors → TH",
  },
  {
    rule_id: "PAR-30",
    priority: 39,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)(terminal\\s+block|screw\\s+terminal)",
    assigned_m_code: "TH",
    description: "Terminal blocks and screw terminals → TH",
  },

  // --- Layer 2: Component-type specific rules ---
  {
    rule_id: "PAR-31",
    priority: 40,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)(crystal|xtal|oscillator)",
    field_2: "mounting_type",
    operator_2: "equals",
    value_2: "Through Hole",
    assigned_m_code: "TH",
    description: "Through-hole crystals/oscillators → TH",
  },
  {
    rule_id: "PAR-32",
    priority: 41,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)(crystal|xtal|oscillator)",
    field_2: "mounting_type",
    operator_2: "contains",
    value_2: "Surface Mount",
    assigned_m_code: "IP",
    description: "SMT crystals/oscillators → IP",
  },
  {
    rule_id: "PAR-33",
    priority: 42,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)(transformer|inductor.*through.*hole)",
    assigned_m_code: "TH",
    description: "Transformers and TH inductors → TH",
  },
  {
    rule_id: "PAR-34",
    priority: 43,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)\\brelay\\b",
    assigned_m_code: "TH",
    description: "Relays → TH",
  },
  {
    rule_id: "PAR-35",
    priority: 44,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)(electrolytic|aluminum\\s+cap)",
    assigned_m_code: "TH",
    description: "Electrolytic / aluminum capacitors → TH",
  },
  {
    rule_id: "PAR-36",
    priority: 45,
    layer: 2,
    field_1: "category",
    operator_1: "contains",
    value_1: "Film Capacitors",
    field_2: "mounting_type",
    operator_2: "regex",
    value_2: "(?i)(chassis|stud|holder|bracket|through hole)",
    assigned_m_code: "TH",
    description: "Film capacitors with chassis/stud/TH mounting → TH",
  },
  {
    rule_id: "PAR-37",
    priority: 46,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)\\bfuse\\b",
    field_2: "mounting_type",
    operator_2: "equals",
    value_2: "Through Hole",
    assigned_m_code: "TH",
    description: "Through-hole fuses → TH",
  },
  {
    rule_id: "PAR-38",
    priority: 47,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)\\bfuse\\b",
    field_2: "mounting_type",
    operator_2: "contains",
    value_2: "Surface Mount",
    assigned_m_code: "CP",
    description: "SMT fuses → CP",
  },
  {
    rule_id: "PAR-39",
    priority: 48,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)\\bled\\b",
    field_2: "mounting_type",
    operator_2: "equals",
    value_2: "Through Hole",
    assigned_m_code: "TH",
    description: "Through-hole LEDs → TH",
  },
  {
    rule_id: "PAR-40",
    priority: 49,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)\\bled\\b",
    field_2: "mounting_type",
    operator_2: "contains",
    value_2: "Surface Mount",
    assigned_m_code: "CP",
    description: "SMT LEDs → CP",
  },
  {
    rule_id: "PAR-41",
    priority: 14,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)(test\\s*point|\\bTP\\d)",
    assigned_m_code: "MEC",
    description: "Test points → MEC",
  },
  {
    rule_id: "PAR-42",
    priority: 15,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)(mounting\\s+hardware|pcb\\s+mount|board\\s+mount|clip|retainer)",
    assigned_m_code: "MEC",
    description: "Mounting hardware / clips / retainers → MEC",
  },
  {
    rule_id: "PAR-43",
    priority: 16,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)(rf\\s+module|bluetooth|wifi|wi-fi|zigbee|lora|wireless)",
    assigned_m_code: "MANSMT",
    description: "RF/wireless modules → MANSMT (odd-form SMT)",
  },
  {
    rule_id: "PAR-44",
    priority: 22,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)(eeprom|flash|sram|dram|nor|nand|fram|memory)",
    field_2: "mounting_type",
    operator_2: "contains",
    value_2: "Surface Mount",
    assigned_m_code: "IP",
    description: "SMT memory ICs → IP",
  },
  {
    rule_id: "PAR-45",
    priority: 23,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)(toroid|choke|common\\s+mode)",
    assigned_m_code: "MANSMT",
    description: "Toroids / common mode chokes → MANSMT (odd-form)",
  },
  {
    rule_id: "PAR-46",
    priority: 24,
    layer: 2,
    field_1: "package_case",
    operator_1: "regex",
    value_1: "(?i)(TO-220|TO-247|TO-252|TO-263|D2PAK|DPAK)",
    assigned_m_code: "IP",
    description: "Power packages (TO-220, D2PAK, etc.) → IP",
  },
  {
    rule_id: "PAR-47",
    priority: 25,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "(?i)(potentiometer|trimmer|trimpot|variable\\s+resistor)",
    assigned_m_code: "TH",
    description: "Potentiometers / trimmers → TH",
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
    value_1: "1.5-3.79",
    field_2: "width_mm",
    operator_2: "regex",
    value_2: "0.8-3.59",
    assigned_m_code: "CP",
    description: "Size range CP (L 1.5-3.79 x W 0.8-3.59)",
  },
  {
    rule_id: "PAR-48",
    priority: 53,
    layer: 3,
    field_1: "length_mm",
    operator_1: "regex",
    value_1: "3.8-4.29",
    field_2: "width_mm",
    operator_2: "regex",
    value_2: "3.6-3.99",
    assigned_m_code: "CPEXP",
    description: "Size range CPEXP (L 3.8-4.29 x W 3.6-3.99)",
  },
  {
    rule_id: "PAR-23",
    priority: 54,
    layer: 3,
    field_1: "length_mm",
    operator_1: "regex",
    value_1: "4.3-25.0",
    field_2: "width_mm",
    operator_2: "regex",
    value_2: "4.0-25.0",
    assigned_m_code: "IP",
    description: "Size range IP (L 4.3-25 x W 4.0-25)",
  },
  {
    rule_id: "PAR-24",
    priority: 55,
    layer: 3,
    field_1: "length_mm",
    operator_1: "regex",
    value_1: "25.01-9999.99",
    field_2: "width_mm",
    operator_2: "regex",
    value_2: "25.01-9999.99",
    assigned_m_code: "MEC",
    description: "Very large parts are likely mechanical (L/W > 25 mm)",
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
      // Strip Python-style (?i) flag and use JS "i" flag instead
      let pattern = value;
      let flags = "i"; // always case-insensitive for M-Code matching
      if (pattern.startsWith("(?i)")) {
        pattern = pattern.slice(4);
      }
      const re = new RegExp(pattern, flags);
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
        rule_id: `${rule.description} (${rule.rule_id})`,
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
