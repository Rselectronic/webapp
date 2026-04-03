# Sprint 2: BOM Upload + Parsing + M-Code Classification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload a BOM file, parse it using the 9 CP IP rules, classify components with M-Codes via the 3-layer pipeline (database + rules + manual review), and display parsed results with a human review queue.

**Architecture:** BOM parsing runs as a Next.js API route in TypeScript (the 9 CP IP rules are well-defined and don't depend on Python-specific libraries). The M-Code classification pipeline runs Layers 1 (database lookup) and 2 (47 PAR rules) in TypeScript; Layer 3 (DigiKey/Mouser API) is deferred to Sprint 3. File uploads go to Supabase Storage. The UI provides drag-drop upload, parsed BOM preview table, and inline M-Code review/override.

**Tech Stack:** Next.js 16 API routes, Supabase Storage + DB, xlsx (SheetJS) for Excel parsing, TypeScript M-Code rule engine

**Depends on:** Sprint 1 complete (auth, customers, dashboard layout, 18 DB tables created)

---

## File Structure

```
lib/
├── bom/
│   ├── parser.ts                   ← 9 CP IP BOM parsing rules (TypeScript)
│   ├── column-mapper.ts            ← Customer BOM config → column mapping
│   └── types.ts                    ← BOM parsing types (RawRow, ParsedLine, ParseLog)
├── mcode/
│   ├── classifier.ts               ← 3-layer M-Code classification pipeline
│   ├── rules.ts                    ← 47 PAR rule definitions + rule engine
│   └── types.ts                    ← M-Code types
app/
├── (dashboard)/
│   └── bom/
│       ├── upload/page.tsx          ← Upload page (drag-drop, select customer + GMP)
│       └── [id]/page.tsx            ← Parsed BOM review + M-Code assignment
├── api/
│   └── bom/
│       ├── parse/route.ts           ← POST: parse uploaded BOM file
│       └── [id]/
│           └── classify/route.ts    ← POST: run M-Code classification on parsed BOM
components/
├── bom/
│   ├── upload-form.tsx              ← Drag-drop file upload + customer/GMP selectors
│   ├── bom-table.tsx                ← Parsed BOM lines table with M-Code column
│   └── mcode-select.tsx             ← Inline M-Code assignment dropdown
supabase/
└── migrations/
    ├── 003_seed_m_code_rules.sql    ← 47 PAR rules
    └── 004_seed_overage_table.sql   ← Overage tiers per M-Code
```

---

### Task 1: Enable BOMs Sidebar Link + Install xlsx

**Files:**
- Modify: `components/sidebar.tsx`
- None created

- [ ] **Step 1: Enable the BOMs link in sidebar**

In `components/sidebar.tsx`, change the BOMs navigation item from `enabled: false` to `enabled: true`:

```typescript
// Change this line:
{ name: "BOMs", href: "/bom", icon: FileSpreadsheet, enabled: false },
// To:
{ name: "BOMs", href: "/bom", icon: FileSpreadsheet, enabled: true },
```

- [ ] **Step 2: Install xlsx (SheetJS) for Excel file parsing**

```bash
npm install xlsx
```

- [ ] **Step 3: Install additional shadcn components needed for Sprint 2**

```bash
npx shadcn@latest add select textarea toast progress command popover
```

These are needed for: customer/GMP dropdowns (select, command, popover), BOM notes (textarea), upload progress (progress), notifications (toast), M-Code selector (popover + command).

- [ ] **Step 4: Commit**

```bash
git add components/sidebar.tsx package.json package-lock.json components/ui/
git commit -m "feat: enable BOMs sidebar link, install xlsx and shadcn components"
```

---

### Task 2: BOM Parsing Types

**Files:**
- Create: `lib/bom/types.ts`

- [ ] **Step 1: Create BOM types**

Create `lib/bom/types.ts`:

```typescript
/** A raw row extracted from an Excel/CSV file before normalization */
export interface RawRow {
  [key: string]: string | number | null | undefined;
}

/** Column mapping derived from customer's bom_config */
export interface ColumnMapping {
  qty: string | number;
  designator: string | number;
  cpc?: string | number;
  description?: string | number;
  mpn: string | number;
  manufacturer?: string | number;
}

/** A BOM line after parsing and normalization (before M-Code classification) */
export interface ParsedLine {
  line_number: number;
  quantity: number;
  reference_designator: string;
  cpc: string;
  description: string;
  mpn: string;
  manufacturer: string;
  is_pcb: boolean;
  is_dni: boolean;
}

/** Log entry tracking what happened to each raw row */
export interface ParseLogEntry {
  raw_row_index: number;
  action: "INCLUDED" | "PCB" | "FIDUCIAL" | "DNI" | "MERGED" | "SECTION_HEADER" | "NOT_MOUNTED" | "EMPTY";
  merged_into?: number; // line_number of the target if MERGED
  detail?: string;
}

/** Result of parsing a BOM file */
export interface ParseResult {
  lines: ParsedLine[];
  log: ParseLogEntry[];
  pcb_row: ParsedLine | null;
  stats: {
    total_raw_rows: number;
    included: number;
    fiducials_skipped: number;
    dni_skipped: number;
    merged: number;
    section_headers_skipped: number;
  };
}

/** Customer BOM configuration (stored in customers.bom_config JSONB) */
export interface BomConfig {
  header_row?: number | null;
  columns_fixed?: string[];
  columns?: Record<string, string> | "auto_detect";
  encoding?: string;
  format?: string;
  separator?: string;
  section_filter?: boolean;
  mount_filter_col?: string;
  mount_exclude_values?: string[];
  cpc_fallback?: string;
  notes?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/bom/types.ts
git commit -m "feat: add BOM parsing type definitions"
```

---

### Task 3: Column Mapper

**Files:**
- Create: `lib/bom/column-mapper.ts`

- [ ] **Step 1: Create the column mapper**

Create `lib/bom/column-mapper.ts`:

```typescript
import type { BomConfig, ColumnMapping, RawRow } from "./types";

/**
 * Auto-detection keywords for BOM column names.
 * Each field maps to an array of known column header variations.
 */
const AUTO_DETECT_KEYWORDS: Record<keyof ColumnMapping, string[]> = {
  qty: [
    "qty", "quantity", "qté", "quantity for 1 board",
    "quantity / board", "requested quantity 1",
  ],
  designator: [
    "designator", "designation", "ref des", "ref. des.",
    "reference designator", "refdes", "r des.",
    "position sur circuit", "reference", "part reference", "index",
  ],
  mpn: [
    "mpn", "manufacturer part number", "manufacturer_pn", "mfr#",
    "manufacturer part", "part number", "mfg p/n",
  ],
  manufacturer: [
    "manufacturer", "mfg name", "manufacturier",
    "mfr name", "manufacturer name", "manufacturer 1",
  ],
  description: [
    "description", "desc", "part description", "value", "name",
  ],
  cpc: [
    "cpc", "erp_pn", "isc p/n", "legend p/n", "fiso#",
  ],
};

/**
 * Given a BOM config and the actual header row from the file,
 * return a mapping from our standard field names to column indices or names.
 */
export function resolveColumnMapping(
  config: BomConfig,
  headers: string[]
): ColumnMapping {
  // Case 1: Fixed column order (no headers in file, e.g. Lanka)
  if (config.columns_fixed) {
    const mapping: Partial<ColumnMapping> = {};
    config.columns_fixed.forEach((field, index) => {
      if (field in AUTO_DETECT_KEYWORDS || field === "cpc" || field === "description") {
        (mapping as Record<string, number>)[field] = index;
      }
    });
    return mapping as ColumnMapping;
  }

  // Case 2: Explicit column name mapping
  if (config.columns && config.columns !== "auto_detect") {
    const mapping: Partial<ColumnMapping> = {};
    const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());

    for (const [field, headerName] of Object.entries(config.columns)) {
      const idx = normalizedHeaders.indexOf(headerName.toLowerCase().trim());
      if (idx !== -1) {
        (mapping as Record<string, number>)[field] = idx;
      }
    }
    return mapping as ColumnMapping;
  }

  // Case 3: Auto-detect from headers
  return autoDetectColumns(headers);
}

/**
 * Auto-detect column mapping by matching headers against known keywords.
 */
export function autoDetectColumns(headers: string[]): ColumnMapping {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());
  const mapping: Partial<ColumnMapping> = {};

  for (const [field, keywords] of Object.entries(AUTO_DETECT_KEYWORDS)) {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (keywords.includes(normalizedHeaders[i])) {
        (mapping as Record<string, number>)[field] = i;
        break;
      }
    }
  }

  // qty and mpn are required
  if (mapping.qty === undefined || mapping.mpn === undefined) {
    throw new Error(
      `Could not auto-detect required columns. Found: ${JSON.stringify(mapping)}. Headers: ${JSON.stringify(headers)}`
    );
  }

  return mapping as ColumnMapping;
}

/**
 * Extract a field value from a raw row using the column mapping.
 */
export function getField(
  row: RawRow,
  mapping: ColumnMapping,
  field: keyof ColumnMapping,
  headers: string[]
): string {
  const colRef = mapping[field];
  if (colRef === undefined) return "";

  let value: string | number | null | undefined;

  if (typeof colRef === "number") {
    // Column index — get by position
    const keys = Object.keys(row);
    value = row[keys[colRef]];
  } else {
    // Column name
    value = row[colRef];
  }

  return value != null ? String(value).trim() : "";
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/bom/column-mapper.ts
git commit -m "feat: add BOM column mapper with auto-detect and customer config support"
```

---

### Task 4: BOM Parser (9 CP IP Rules)

**Files:**
- Create: `lib/bom/parser.ts`

- [ ] **Step 1: Create the BOM parser**

Create `lib/bom/parser.ts`:

```typescript
import type {
  RawRow,
  ColumnMapping,
  ParsedLine,
  ParseLogEntry,
  ParseResult,
  BomConfig,
} from "./types";
import { getField } from "./column-mapper";

/**
 * Natural sort comparator for reference designators.
 * "C1, C2, C10" sorts correctly (not "C1, C10, C2").
 */
function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Parse raw BOM rows into standardized ParsedLines using the 9 CP IP rules.
 *
 * Rules implemented:
 * 1. Fiducial Exclusion — skip FID rows
 * 2. PCB at Top — pin PCB row first
 * 3. DNI Exclusion — skip DNI/DNP/DNL rows
 * 4. No Title Row — output starts with data
 * 5. Log Sheet — track each row's fate
 * 6. Designator-Only PCB Detection — never match PCB by description
 * 7. MPN Merge — combine same-MPN rows
 * 8. Auto-PCB from Gerber — (deferred, requires file system access)
 * 9. Sort — by qty DESC, then first designator ASC; PCB pinned at top
 *
 * Additional filters: section headers, CPC fallback, N.M. filter
 */
export function parseBom(
  rows: RawRow[],
  mapping: ColumnMapping,
  headers: string[],
  config: BomConfig
): ParseResult {
  const log: ParseLogEntry[] = [];
  const included: ParsedLine[] = [];
  let pcbRow: ParsedLine | null = null;
  let lineCounter = 1;

  const stats = {
    total_raw_rows: rows.length,
    included: 0,
    fiducials_skipped: 0,
    dni_skipped: 0,
    merged: 0,
    section_headers_skipped: 0,
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const designator = getField(row, mapping, "designator", headers);
    const qtyStr = getField(row, mapping, "qty", headers);
    const mpn = getField(row, mapping, "mpn", headers);
    const description = getField(row, mapping, "description", headers);
    const manufacturer = getField(row, mapping, "manufacturer", headers);
    let cpc = getField(row, mapping, "cpc", headers);
    const qty = parseInt(qtyStr, 10) || 0;

    // Skip empty rows
    if (!designator && !mpn && !description && qty === 0) {
      log.push({ raw_row_index: i, action: "EMPTY" });
      continue;
    }

    // Section Header Filter: designator has spaces but no digits
    if (
      config.section_filter &&
      designator &&
      designator.includes(" ") &&
      !/\d/.test(designator)
    ) {
      log.push({ raw_row_index: i, action: "SECTION_HEADER", detail: designator });
      stats.section_headers_skipped++;
      continue;
    }

    // N.M. Filter: mount column exclusion
    if (config.mount_filter_col && config.mount_exclude_values) {
      const mountVal = String(row[config.mount_filter_col] ?? "").trim().toUpperCase();
      if (config.mount_exclude_values.some((v) => mountVal === v.toUpperCase())) {
        log.push({ raw_row_index: i, action: "NOT_MOUNTED", detail: mountVal });
        continue;
      }
    }

    // Rule 1: Fiducial Exclusion
    if (/^FID\d+$/i.test(designator)) {
      log.push({ raw_row_index: i, action: "FIDUCIAL" });
      stats.fiducials_skipped++;
      continue;
    }

    // Rule 2 & 6: PCB Detection (designator ONLY, never description)
    if (/^PCB[A-Z0-9\-]*$/i.test(designator)) {
      pcbRow = {
        line_number: 0, // will be set to 0 = pinned at top
        quantity: qty || 1,
        reference_designator: designator,
        cpc: cpc || mpn,
        description: description || "Printed Circuit Board",
        mpn: mpn,
        manufacturer: manufacturer,
        is_pcb: true,
        is_dni: false,
      };
      log.push({ raw_row_index: i, action: "PCB" });
      continue;
    }

    // Rule 3: DNI Exclusion
    const dniPatterns = /\b(DNI|DNP|DNL|DO NOT INSTALL|DO NOT PLACE|DO NOT POPULATE)\b/i;
    if (
      (qty === 0 && !mpn) ||
      dniPatterns.test(description) ||
      dniPatterns.test(designator)
    ) {
      log.push({ raw_row_index: i, action: "DNI" });
      stats.dni_skipped++;
      continue;
    }

    // CPC Fallback: no CPC column or blank → use MPN
    if (!cpc) {
      cpc = mpn;
    }

    included.push({
      line_number: lineCounter++,
      quantity: qty,
      reference_designator: designator,
      cpc,
      description,
      mpn,
      manufacturer,
      is_pcb: false,
      is_dni: false,
    });
    log.push({ raw_row_index: i, action: "INCLUDED" });
    stats.included++;
  }

  // Rule 7: MPN Merge — combine rows with same MPN
  const merged = mergeSameMpn(included, log, stats);

  // Rule 9: Sort — qty DESC, then first designator ASC. PCB pinned at top.
  merged.sort((a, b) => {
    if (b.quantity !== a.quantity) return b.quantity - a.quantity;
    return naturalSort(a.reference_designator, b.reference_designator);
  });

  // Re-number after sort
  merged.forEach((line, idx) => {
    line.line_number = idx + 1;
  });

  return {
    lines: merged,
    log,
    pcb_row: pcbRow,
    stats,
  };
}

/**
 * Rule 7: MPN Merge — same MPN → combine rows, sum quantities, merge designators.
 */
function mergeSameMpn(
  lines: ParsedLine[],
  log: ParseLogEntry[],
  stats: { merged: number }
): ParsedLine[] {
  const mpnMap = new Map<string, ParsedLine>();
  const result: ParsedLine[] = [];

  for (const line of lines) {
    if (!line.mpn) {
      result.push(line);
      continue;
    }

    const key = line.mpn.toUpperCase();
    const existing = mpnMap.get(key);

    if (existing) {
      existing.quantity += line.quantity;
      // Merge designators with natural sort
      const allDesignators = [
        ...existing.reference_designator.split(/,\s*/),
        ...line.reference_designator.split(/,\s*/),
      ]
        .filter(Boolean)
        .sort(naturalSort);
      existing.reference_designator = allDesignators.join(", ");

      stats.merged++;
      // Log the merge — find the original raw row index for this line
      log.push({
        raw_row_index: -1, // merged lines don't have a single raw row
        action: "MERGED",
        merged_into: existing.line_number,
        detail: `MPN ${line.mpn}`,
      });
    } else {
      mpnMap.set(key, line);
      result.push(line);
    }
  }

  return result;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/bom/parser.ts
git commit -m "feat: add BOM parser implementing 9 CP IP rules"
```

---

### Task 5: M-Code Types and Rule Definitions

**Files:**
- Create: `lib/mcode/types.ts`, `lib/mcode/rules.ts`

- [ ] **Step 1: Create M-Code types**

Create `lib/mcode/types.ts`:

```typescript
/** The 11 M-Code categories */
export type MCode =
  | "0201"
  | "0402"
  | "CP"
  | "CPEXP"
  | "IP"
  | "TH"
  | "MANSMT"
  | "MEC"
  | "Accs"
  | "CABLE"
  | "DEV B";

/** Result of classifying a single component */
export interface ClassificationResult {
  m_code: MCode | null;
  confidence: number; // 0.00 - 1.00
  source: "database" | "rules" | "api" | "manual" | null;
  rule_id?: string; // e.g. "PAR-01" if matched by rules
}

/** Input for classification */
export interface ClassificationInput {
  mpn: string;
  description: string;
  cpc: string;
  manufacturer: string;
  // Enriched fields (from API or database)
  mounting_type?: string;
  package_case?: string;
  category?: string;
  length_mm?: number;
  width_mm?: number;
}

/** A PAR rule definition */
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
```

- [ ] **Step 2: Create rule definitions (core PAR rules)**

Create `lib/mcode/rules.ts`:

```typescript
import type { ParRule, ClassificationInput, MCode } from "./types";

/**
 * Core PAR rules for M-Code classification.
 * These are the most impactful rules extracted from the spec.
 * Full 47 rules are in the database (m_code_rules table) and can override these.
 */
export const CORE_PAR_RULES: ParRule[] = [
  // Layer 2: Rule-based classification
  {
    rule_id: "PAR-01",
    priority: 1,
    layer: 2,
    field_1: "mounting_type",
    operator_1: "equals",
    value_1: "Through Hole",
    assigned_m_code: "TH",
    description: "Through-hole components → TH",
  },
  {
    rule_id: "PAR-02",
    priority: 2,
    layer: 2,
    field_1: "mounting_type",
    operator_1: "contains",
    value_1: "Surface Mount, Through Hole",
    assigned_m_code: "MANSMT",
    description: "Mixed mount type → Manual SMT",
  },
  {
    rule_id: "PAR-03",
    priority: 3,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "\\b(connector|header|socket|pin header|terminal)\\b",
    field_2: "mounting_type",
    operator_2: "equals",
    value_2: "Through Hole",
    assigned_m_code: "TH",
    description: "Through-hole connectors → TH",
  },
  {
    rule_id: "PAR-04",
    priority: 4,
    layer: 2,
    field_1: "package_case",
    operator_1: "regex",
    value_1: "^0201$",
    assigned_m_code: "0201",
    description: "0201 package → 0201",
  },
  {
    rule_id: "PAR-05",
    priority: 5,
    layer: 2,
    field_1: "package_case",
    operator_1: "regex",
    value_1: "^0402$",
    assigned_m_code: "0402",
    description: "0402 package → 0402",
  },
  {
    rule_id: "PAR-06",
    priority: 6,
    layer: 2,
    field_1: "package_case",
    operator_1: "regex",
    value_1: "^0603$|^0805$|^1206$|^1210$|^1812$|^2010$|^2512$",
    assigned_m_code: "CP",
    description: "Standard SMT passive packages → CP",
  },
  {
    rule_id: "PAR-07",
    priority: 7,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "\\b(resistor|capacitor|inductor|ferrite|diode|led)\\b",
    field_2: "mounting_type",
    operator_2: "equals",
    value_2: "Surface Mount",
    assigned_m_code: "CP",
    description: "SMT passives → CP",
  },
  {
    rule_id: "PAR-08",
    priority: 8,
    layer: 2,
    field_1: "package_case",
    operator_1: "regex",
    value_1: "\\b(SOIC|SSOP|TSSOP|MSOP|QFN|DFN|SOT)\\b",
    assigned_m_code: "IP",
    description: "IC packages (SOIC, QFN, etc.) → IP",
  },
  {
    rule_id: "PAR-09",
    priority: 9,
    layer: 2,
    field_1: "package_case",
    operator_1: "regex",
    value_1: "\\b(QFP|LQFP|TQFP|BGA|CSP|LGA)\\b",
    assigned_m_code: "IP",
    description: "Large IC packages → IP",
  },
  {
    rule_id: "PAR-10",
    priority: 10,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "\\b(standoff|spacer|heatsink|bracket|screw|nut|washer)\\b",
    assigned_m_code: "MEC",
    description: "Mechanical hardware → MEC",
  },
  {
    rule_id: "PAR-11",
    priority: 11,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "\\b(cable|wire|harness|cord)\\b",
    assigned_m_code: "CABLE",
    description: "Cables and wiring → CABLE",
  },
  {
    rule_id: "PAR-12",
    priority: 12,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "\\b(clip|spacer|grommet|bumper|foot|pad)\\b",
    assigned_m_code: "Accs",
    description: "Accessories → Accs",
  },
  {
    rule_id: "PAR-13",
    priority: 13,
    layer: 2,
    field_1: "description",
    operator_1: "regex",
    value_1: "\\b(arduino|raspberry|eval board|dev board|development board|module)\\b",
    assigned_m_code: "DEV B",
    description: "Development/eval boards → DEV B",
  },
  // Size-based rules (when dimensions are available from API/database)
  {
    rule_id: "PAR-20",
    priority: 20,
    layer: 2,
    field_1: "length_mm",
    operator_1: "regex",
    value_1: "0.4-0.99",
    field_2: "width_mm",
    operator_2: "regex",
    value_2: "0.2-0.48",
    assigned_m_code: "0201",
    description: "Size-based: 0201 range",
  },
  {
    rule_id: "PAR-21",
    priority: 21,
    layer: 2,
    field_1: "length_mm",
    operator_1: "regex",
    value_1: "1.0-1.49",
    field_2: "width_mm",
    operator_2: "regex",
    value_2: "0.49-0.79",
    assigned_m_code: "0402",
    description: "Size-based: 0402 range",
  },
  {
    rule_id: "PAR-22",
    priority: 22,
    layer: 2,
    field_1: "length_mm",
    operator_1: "regex",
    value_1: "1.5-3.79",
    field_2: "width_mm",
    operator_2: "regex",
    value_2: "0.8-3.59",
    assigned_m_code: "CP",
    description: "Size-based: CP range",
  },
  {
    rule_id: "PAR-23",
    priority: 23,
    layer: 2,
    field_1: "length_mm",
    operator_1: "regex",
    value_1: "3.8-4.29",
    field_2: "width_mm",
    operator_2: "regex",
    value_2: "3.6-3.99",
    assigned_m_code: "CPEXP",
    description: "Size-based: CPEXP range",
  },
  {
    rule_id: "PAR-24",
    priority: 24,
    layer: 2,
    field_1: "length_mm",
    operator_1: "regex",
    value_1: "4.3-25.0",
    field_2: "width_mm",
    operator_2: "regex",
    value_2: "4.0-25.0",
    assigned_m_code: "IP",
    description: "Size-based: IP range",
  },
];

/**
 * Check if a single PAR rule matches the given input.
 */
export function matchesRule(rule: ParRule, input: ClassificationInput): boolean {
  if (!matchesCondition(rule.field_1, rule.operator_1, rule.value_1, input)) {
    return false;
  }
  if (rule.field_2 && rule.operator_2 && rule.value_2) {
    if (!matchesCondition(rule.field_2, rule.operator_2, rule.value_2, input)) {
      return false;
    }
  }
  return true;
}

function matchesCondition(
  field: string,
  operator: string,
  value: string,
  input: ClassificationInput
): boolean {
  const fieldValue = getInputField(field, input);

  // Size-based range checks (for PAR-20 through PAR-24)
  if ((field === "length_mm" || field === "width_mm") && value.includes("-")) {
    const numValue = typeof fieldValue === "string" ? parseFloat(fieldValue) : (fieldValue as number);
    if (isNaN(numValue) || numValue === 0) return false;
    const [min, max] = value.split("-").map(Number);
    return numValue >= min && numValue <= max;
  }

  const strValue = String(fieldValue ?? "");
  if (!strValue) return false;

  switch (operator) {
    case "equals":
      return strValue.toLowerCase() === value.toLowerCase();
    case "contains":
      return strValue.toLowerCase().includes(value.toLowerCase());
    case "regex":
      try {
        return new RegExp(value, "i").test(strValue);
      } catch {
        return false;
      }
    case "in":
      return value
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .includes(strValue.toLowerCase());
    default:
      return false;
  }
}

function getInputField(field: string, input: ClassificationInput): string | number {
  switch (field) {
    case "mpn": return input.mpn;
    case "description": return input.description;
    case "cpc": return input.cpc;
    case "manufacturer": return input.manufacturer;
    case "mounting_type": return input.mounting_type ?? "";
    case "package_case": return input.package_case ?? "";
    case "category": return input.category ?? "";
    case "length_mm": return input.length_mm ?? 0;
    case "width_mm": return input.width_mm ?? 0;
    default: return "";
  }
}

/**
 * Run all rules against an input, returning the first match (by priority).
 */
export function classifyByRules(
  input: ClassificationInput,
  rules?: ParRule[]
): { m_code: MCode; rule_id: string } | null {
  const activeRules = (rules ?? CORE_PAR_RULES)
    .filter((r) => r.layer === 2)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of activeRules) {
    if (matchesRule(rule, input)) {
      return { m_code: rule.assigned_m_code, rule_id: rule.rule_id };
    }
  }

  return null;
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/mcode/
git commit -m "feat: add M-Code types and rule engine with core PAR rules"
```

---

### Task 6: M-Code Classifier (3-Layer Pipeline)

**Files:**
- Create: `lib/mcode/classifier.ts`

- [ ] **Step 1: Create the classifier**

Create `lib/mcode/classifier.ts`:

```typescript
import type { ClassificationInput, ClassificationResult } from "./types";
import { classifyByRules } from "./rules";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 3-Layer M-Code classification pipeline.
 *
 * Layer 1: Database lookup by MPN (fastest, ~70% hit rate for repeats)
 * Layer 2: Rule engine (47 PAR rules, ~25% of remaining)
 * Layer 3: API lookup (deferred to Sprint 3 — DigiKey/Mouser)
 *
 * Returns null m_code if unclassified → goes to human review queue.
 */
export async function classifyComponent(
  input: ClassificationInput,
  supabase: SupabaseClient
): Promise<ClassificationResult> {
  // Layer 1: Database lookup
  if (input.mpn) {
    const dbResult = await lookupInDatabase(input.mpn, supabase);
    if (dbResult) return dbResult;
  }

  // Layer 2: Rule engine
  const ruleResult = classifyByRules(input);
  if (ruleResult) {
    return {
      m_code: ruleResult.m_code,
      confidence: 0.85,
      source: "rules",
      rule_id: ruleResult.rule_id,
    };
  }

  // Layer 3: API lookup — deferred to Sprint 3
  // For now, unclassified components go to human review

  return {
    m_code: null,
    confidence: 0,
    source: null,
  };
}

/**
 * Layer 1: Look up MPN in the components table.
 */
async function lookupInDatabase(
  mpn: string,
  supabase: SupabaseClient
): Promise<ClassificationResult | null> {
  const { data } = await supabase
    .from("components")
    .select("m_code, m_code_source")
    .eq("mpn", mpn)
    .not("m_code", "is", null)
    .limit(1)
    .single();

  if (data?.m_code) {
    return {
      m_code: data.m_code,
      confidence: 0.95,
      source: "database",
    };
  }

  return null;
}

/**
 * Classify all lines in a parsed BOM.
 * Returns results in the same order as input lines.
 */
export async function classifyBomLines(
  lines: { mpn: string; description: string; cpc: string; manufacturer: string }[],
  supabase: SupabaseClient
): Promise<ClassificationResult[]> {
  const results: ClassificationResult[] = [];

  for (const line of lines) {
    const result = await classifyComponent(
      {
        mpn: line.mpn,
        description: line.description,
        cpc: line.cpc,
        manufacturer: line.manufacturer,
      },
      supabase
    );
    results.push(result);
  }

  return results;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/mcode/classifier.ts
git commit -m "feat: add 3-layer M-Code classifier (database + rules, API deferred)"
```

---

### Task 7: BOM Parse API Route

**Files:**
- Create: `app/api/bom/parse/route.ts`

- [ ] **Step 1: Create the parse API route**

Create `app/api/bom/parse/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBom } from "@/lib/bom/parser";
import { resolveColumnMapping } from "@/lib/bom/column-mapper";
import { classifyBomLines } from "@/lib/mcode/classifier";
import type { BomConfig, RawRow } from "@/lib/bom/types";
import * as XLSX from "xlsx";

export async function POST(request: Request) {
  const supabase = await createClient();

  // Verify authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const customerId = formData.get("customer_id") as string;
  const gmpId = formData.get("gmp_id") as string;

  if (!file || !customerId || !gmpId) {
    return NextResponse.json(
      { error: "Missing required fields: file, customer_id, gmp_id" },
      { status: 400 }
    );
  }

  // Get customer BOM config
  const { data: customer } = await supabase
    .from("customers")
    .select("code, bom_config")
    .eq("id", customerId)
    .single();

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const bomConfig = (customer.bom_config as BomConfig) ?? { columns: "auto_detect" };

  try {
    // Read file
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Determine header row
    const headerRowIndex = bomConfig.header_row ?? 0;

    // Convert to array of arrays
    const allRows: (string | number | null)[][] = XLSX.utils.sheet_to_json(
      sheet,
      { header: 1, raw: false }
    );

    if (allRows.length <= headerRowIndex) {
      return NextResponse.json({ error: "File has too few rows" }, { status: 400 });
    }

    // Extract headers and data rows
    let headers: string[];
    let dataStartIndex: number;

    if (bomConfig.columns_fixed) {
      // No header row — use fixed column names
      headers = bomConfig.columns_fixed;
      dataStartIndex = 0;
    } else if (bomConfig.header_row === null || bomConfig.header_row === undefined) {
      // Auto-detect: first row is headers
      headers = allRows[0].map((h) => String(h ?? ""));
      dataStartIndex = 1;
    } else {
      headers = allRows[headerRowIndex].map((h) => String(h ?? ""));
      dataStartIndex = headerRowIndex + 1;
    }

    // Convert to RawRow objects
    const rawRows: RawRow[] = allRows.slice(dataStartIndex).map((row) => {
      const obj: RawRow = {};
      headers.forEach((header, idx) => {
        obj[header] = row[idx] ?? null;
      });
      return obj;
    });

    // Resolve column mapping
    const mapping = resolveColumnMapping(bomConfig, headers);

    // Parse BOM using 9 CP IP rules
    const parseResult = parseBom(rawRows, mapping, headers, bomConfig);

    // Upload file to Supabase Storage
    const filePath = `${customer.code}/${gmpId}/${file.name}`;
    await supabase.storage.from("boms").upload(filePath, buffer, {
      contentType: file.type,
      upsert: true,
    });

    // Compute file hash (simple, using file size + name)
    const fileHash = `${file.size}-${file.name}`;

    // Create BOM record
    const { data: bom, error: bomError } = await supabase
      .from("boms")
      .insert({
        gmp_id: gmpId,
        customer_id: customerId,
        file_name: file.name,
        file_path: filePath,
        file_hash: fileHash,
        status: "parsing",
        created_by: user.id,
      })
      .select()
      .single();

    if (bomError || !bom) {
      return NextResponse.json(
        { error: "Failed to create BOM record", details: bomError?.message },
        { status: 500 }
      );
    }

    // Run M-Code classification on parsed lines
    const classificationResults = await classifyBomLines(
      parseResult.lines.map((l) => ({
        mpn: l.mpn,
        description: l.description,
        cpc: l.cpc,
        manufacturer: l.manufacturer,
      })),
      supabase
    );

    // Insert parsed lines into bom_lines table
    const bomLines = parseResult.lines.map((line, idx) => ({
      bom_id: bom.id,
      line_number: line.line_number,
      quantity: line.quantity,
      reference_designator: line.reference_designator,
      cpc: line.cpc,
      description: line.description,
      mpn: line.mpn,
      manufacturer: line.manufacturer,
      is_pcb: line.is_pcb,
      is_dni: line.is_dni,
      m_code: classificationResults[idx]?.m_code ?? null,
      m_code_confidence: classificationResults[idx]?.confidence ?? null,
      m_code_source: classificationResults[idx]?.source ?? null,
    }));

    // Insert PCB row if found
    if (parseResult.pcb_row) {
      bomLines.unshift({
        bom_id: bom.id,
        line_number: 0,
        quantity: parseResult.pcb_row.quantity,
        reference_designator: parseResult.pcb_row.reference_designator,
        cpc: parseResult.pcb_row.cpc,
        description: parseResult.pcb_row.description,
        mpn: parseResult.pcb_row.mpn,
        manufacturer: parseResult.pcb_row.manufacturer,
        is_pcb: true,
        is_dni: false,
        m_code: null,
        m_code_confidence: null,
        m_code_source: null,
      });
    }

    const { error: linesError } = await supabase.from("bom_lines").insert(bomLines);

    if (linesError) {
      return NextResponse.json(
        { error: "Failed to insert BOM lines", details: linesError.message },
        { status: 500 }
      );
    }

    // Update BOM status to parsed
    await supabase
      .from("boms")
      .update({
        status: "parsed",
        parse_result: {
          stats: parseResult.stats,
          log_summary: {
            included: parseResult.stats.included,
            fiducials: parseResult.stats.fiducials_skipped,
            dni: parseResult.stats.dni_skipped,
            merged: parseResult.stats.merged,
            section_headers: parseResult.stats.section_headers_skipped,
          },
          classification_summary: {
            total: classificationResults.length,
            classified: classificationResults.filter((r) => r.m_code !== null).length,
            unclassified: classificationResults.filter((r) => r.m_code === null).length,
          },
        },
        component_count: parseResult.lines.length,
      })
      .eq("id", bom.id);

    return NextResponse.json({
      bom_id: bom.id,
      file_name: file.name,
      stats: parseResult.stats,
      component_count: parseResult.lines.length,
      classified: classificationResults.filter((r) => r.m_code !== null).length,
      unclassified: classificationResults.filter((r) => r.m_code === null).length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Parse failed", details: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/bom/parse/route.ts
git commit -m "feat: add BOM parse API route with file upload, parsing, and classification"
```

---

### Task 8: M-Code Classify API Route

**Files:**
- Create: `app/api/bom/[id]/classify/route.ts`

- [ ] **Step 1: Create the classify API route**

Create `app/api/bom/[id]/classify/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyBomLines } from "@/lib/mcode/classifier";

/**
 * POST /api/bom/[id]/classify
 * Re-run M-Code classification on all lines of a parsed BOM.
 * Used after manual edits or when rules/database are updated.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bomId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get BOM lines
  const { data: lines, error } = await supabase
    .from("bom_lines")
    .select("id, mpn, description, cpc, manufacturer, m_code_source")
    .eq("bom_id", bomId)
    .order("line_number", { ascending: true });

  if (error || !lines) {
    return NextResponse.json({ error: "BOM not found" }, { status: 404 });
  }

  // Only reclassify lines that weren't manually set
  const toClassify = lines.filter((l) => l.m_code_source !== "manual");

  const results = await classifyBomLines(
    toClassify.map((l) => ({
      mpn: l.mpn ?? "",
      description: l.description ?? "",
      cpc: l.cpc ?? "",
      manufacturer: l.manufacturer ?? "",
    })),
    supabase
  );

  // Update each line
  let classified = 0;
  let unclassified = 0;

  for (let i = 0; i < toClassify.length; i++) {
    const result = results[i];
    await supabase
      .from("bom_lines")
      .update({
        m_code: result.m_code,
        m_code_confidence: result.confidence,
        m_code_source: result.source,
      })
      .eq("id", toClassify[i].id);

    if (result.m_code) classified++;
    else unclassified++;
  }

  // Count manually classified
  const manual = lines.length - toClassify.length;

  return NextResponse.json({
    total: lines.length,
    classified: classified + manual,
    unclassified,
    manual_kept: manual,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/api/bom/[id]/classify/route.ts"
git commit -m "feat: add BOM reclassify API route"
```

---

### Task 9: BOM Upload UI Components

**Files:**
- Create: `components/bom/upload-form.tsx`, `components/bom/mcode-select.tsx`

- [ ] **Step 1: Create the upload form component**

Create `components/bom/upload-form.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";

interface Customer {
  id: string;
  code: string;
  company_name: string;
}

interface Gmp {
  id: string;
  gmp_number: string;
  board_name: string | null;
}

interface UploadFormProps {
  customers: Customer[];
}

export function UploadForm({ customers }: UploadFormProps) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [gmps, setGmps] = useState<Gmp[]>([]);
  const [gmpId, setGmpId] = useState("");
  const [newGmpNumber, setNewGmpNumber] = useState("");
  const [isNewGmp, setIsNewGmp] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Fetch GMPs when customer changes
  const handleCustomerChange = useCallback(
    async (id: string) => {
      setCustomerId(id);
      setGmpId("");
      setIsNewGmp(false);

      const res = await fetch(`/api/gmps?customer_id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setGmps(data.gmps ?? []);
      }
    },
    []
  );

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  }, []);

  const handleUpload = async () => {
    if (!file || !customerId) return;

    setUploading(true);
    setError(null);

    try {
      let resolvedGmpId = gmpId;

      // Create new GMP if needed
      if (isNewGmp && newGmpNumber) {
        const gmpRes = await fetch("/api/gmps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_id: customerId,
            gmp_number: newGmpNumber,
          }),
        });
        if (!gmpRes.ok) {
          const err = await gmpRes.json();
          throw new Error(err.error || "Failed to create GMP");
        }
        const gmpData = await gmpRes.json();
        resolvedGmpId = gmpData.id;
      }

      if (!resolvedGmpId) {
        throw new Error("Please select or create a GMP");
      }

      // Upload and parse BOM
      const formData = new FormData();
      formData.append("file", file);
      formData.append("customer_id", customerId);
      formData.append("gmp_id", resolvedGmpId);

      const res = await fetch("/api/bom/parse", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }

      const result = await res.json();
      router.push(`/bom/${result.bom_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Customer Selection */}
      <div className="space-y-2">
        <Label>Customer</Label>
        <Select value={customerId} onValueChange={handleCustomerChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select a customer..." />
          </SelectTrigger>
          <SelectContent>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code} — {c.company_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* GMP Selection */}
      {customerId && (
        <div className="space-y-2">
          <Label>GMP (Board/Product)</Label>
          {gmps.length > 0 && !isNewGmp ? (
            <div className="flex gap-2">
              <Select value={gmpId} onValueChange={setGmpId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select existing GMP..." />
                </SelectTrigger>
                <SelectContent>
                  {gmps.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.gmp_number}
                      {g.board_name ? ` — ${g.board_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsNewGmp(true)}
              >
                New GMP
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="Enter GMP number (e.g. TL265-5040-000-T)"
                value={newGmpNumber}
                onChange={(e) => setNewGmpNumber(e.target.value)}
                className="flex-1"
              />
              {gmps.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsNewGmp(false)}
                >
                  Existing
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* File Upload (Drag & Drop) */}
      {customerId && (gmpId || (isNewGmp && newGmpNumber)) && (
        <div
          className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            dragOver
              ? "border-blue-400 bg-blue-50"
              : file
                ? "border-green-400 bg-green-50"
                : "border-gray-300 hover:border-gray-400"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <FileSpreadsheet className="h-10 w-10 text-green-500" />
              <p className="font-medium">{file.name}</p>
              <p className="text-sm text-gray-500">
                {(file.size / 1024).toFixed(1)} KB
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFile(null)}
              >
                Remove
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-10 w-10 text-gray-400" />
              <p className="font-medium">
                Drag & drop a BOM file here
              </p>
              <p className="text-sm text-gray-500">
                Supports .xlsx, .xls, .csv
              </p>
              <label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <Button variant="outline" size="sm" asChild>
                  <span>Browse files</span>
                </Button>
              </label>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Upload Button */}
      {file && (
        <Button
          onClick={handleUpload}
          disabled={uploading}
          className="w-full"
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading & Parsing...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload & Parse BOM
            </>
          )}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the M-Code select component**

Create `components/bom/mcode-select.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";

const M_CODES = [
  { value: "0201", label: "0201 — Ultra-tiny passives" },
  { value: "0402", label: "0402 — Small passives" },
  { value: "CP", label: "CP — Chip Package (standard SMT)" },
  { value: "CPEXP", label: "CPEXP — Expanded SMT" },
  { value: "IP", label: "IP — IC Package (large SMT)" },
  { value: "TH", label: "TH — Through-Hole" },
  { value: "MANSMT", label: "MANSMT — Manual SMT" },
  { value: "MEC", label: "MEC — Mechanical" },
  { value: "Accs", label: "Accs — Accessories" },
  { value: "CABLE", label: "CABLE — Wiring/Cables" },
  { value: "DEV B", label: "DEV B — Development boards" },
] as const;

interface McodeSelectProps {
  value: string | null;
  confidence?: number | null;
  source?: string | null;
  onSelect: (mcode: string) => void;
}

export function McodeSelect({
  value,
  confidence,
  source,
  onSelect,
}: McodeSelectProps) {
  const [open, setOpen] = useState(false);

  const selectedLabel = M_CODES.find((m) => m.value === value)?.value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "justify-between min-w-[100px] text-xs font-mono",
            !value && "text-orange-600 border-orange-300 bg-orange-50",
            value && source === "manual" && "border-blue-300 bg-blue-50",
            value && source === "database" && "border-green-300 bg-green-50",
            value && source === "rules" && "border-gray-300"
          )}
        >
          {selectedLabel ?? "Assign"}
          <ChevronsUpDown className="ml-1 h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-1" align="start">
        <div className="space-y-0.5">
          {M_CODES.map((mcode) => (
            <button
              key={mcode.value}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-gray-100",
                value === mcode.value && "bg-gray-100"
              )}
              onClick={() => {
                onSelect(mcode.value);
                setOpen(false);
              }}
            >
              <Check
                className={cn(
                  "h-3 w-3",
                  value === mcode.value ? "opacity-100" : "opacity-0"
                )}
              />
              <span className="font-mono font-medium">{mcode.value}</span>
              <span className="text-gray-500">
                {mcode.label.split("—")[1]?.trim()}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/bom/
git commit -m "feat: add BOM upload form and M-Code select components"
```

---

### Task 10: BOM Table Component

**Files:**
- Create: `components/bom/bom-table.tsx`

- [ ] **Step 1: Create the BOM table component**

Create `components/bom/bom-table.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { McodeSelect } from "./mcode-select";
import { createClient } from "@/lib/supabase/client";

interface BomLine {
  id: string;
  line_number: number;
  quantity: number;
  reference_designator: string | null;
  cpc: string | null;
  description: string | null;
  mpn: string | null;
  manufacturer: string | null;
  is_pcb: boolean;
  m_code: string | null;
  m_code_confidence: number | null;
  m_code_source: string | null;
}

interface BomTableProps {
  lines: BomLine[];
  bomId: string;
}

export function BomTable({ lines: initialLines, bomId }: BomTableProps) {
  const [lines, setLines] = useState(initialLines);
  const router = useRouter();
  const supabase = createClient();

  const classified = lines.filter((l) => l.m_code && !l.is_pcb).length;
  const total = lines.filter((l) => !l.is_pcb).length;
  const unclassified = total - classified;

  async function handleMcodeChange(lineId: string, mcode: string) {
    // Update in database
    await supabase
      .from("bom_lines")
      .update({
        m_code: mcode,
        m_code_confidence: 1.0,
        m_code_source: "manual",
      })
      .eq("id", lineId);

    // Also upsert into components table for future auto-classification
    const line = lines.find((l) => l.id === lineId);
    if (line?.mpn) {
      await supabase.from("components").upsert(
        {
          mpn: line.mpn,
          manufacturer: line.manufacturer ?? undefined,
          description: line.description ?? undefined,
          m_code: mcode,
          m_code_source: "manual",
        },
        { onConflict: "mpn,manufacturer" }
      );
    }

    // Update local state
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, m_code: mcode, m_code_confidence: 1.0, m_code_source: "manual" }
          : l
      )
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4">
        <Badge variant="secondary">{total} components</Badge>
        <Badge variant="default">{classified} classified</Badge>
        {unclassified > 0 && (
          <Badge variant="destructive">{unclassified} need review</Badge>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead className="w-16">Qty</TableHead>
              <TableHead>Designator</TableHead>
              <TableHead>CPC</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>MPN</TableHead>
              <TableHead>Manufacturer</TableHead>
              <TableHead className="w-32">M-Code</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow
                key={line.id}
                className={
                  line.is_pcb
                    ? "bg-blue-50"
                    : !line.m_code
                      ? "bg-orange-50"
                      : ""
                }
              >
                <TableCell className="text-xs text-gray-400">
                  {line.is_pcb ? "PCB" : line.line_number}
                </TableCell>
                <TableCell className="font-mono">{line.quantity}</TableCell>
                <TableCell className="text-xs max-w-[120px] truncate">
                  {line.reference_designator}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {line.cpc}
                </TableCell>
                <TableCell className="text-xs max-w-[200px] truncate">
                  {line.description}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {line.mpn}
                </TableCell>
                <TableCell className="text-xs">
                  {line.manufacturer}
                </TableCell>
                <TableCell>
                  {line.is_pcb ? (
                    <Badge variant="secondary">PCB</Badge>
                  ) : (
                    <McodeSelect
                      value={line.m_code}
                      confidence={line.m_code_confidence}
                      source={line.m_code_source}
                      onSelect={(mcode) => handleMcodeChange(line.id, mcode)}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/bom/bom-table.tsx
git commit -m "feat: add BOM table component with inline M-Code assignment"
```

---

### Task 11: GMP API Route

**Files:**
- Create: `app/api/gmps/route.ts`

- [ ] **Step 1: Create GMP list + create API route**

Create `app/api/gmps/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/gmps?customer_id=xxx — List GMPs for a customer
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customer_id");

  if (!customerId) {
    return NextResponse.json({ error: "customer_id required" }, { status: 400 });
  }

  const { data: gmps, error } = await supabase
    .from("gmps")
    .select("id, gmp_number, board_name, revision, is_active")
    .eq("customer_id", customerId)
    .eq("is_active", true)
    .order("gmp_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ gmps });
}

/**
 * POST /api/gmps — Create a new GMP
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { customer_id, gmp_number, board_name } = body;

  if (!customer_id || !gmp_number) {
    return NextResponse.json(
      { error: "customer_id and gmp_number required" },
      { status: 400 }
    );
  }

  const { data: gmp, error } = await supabase
    .from("gmps")
    .insert({
      customer_id,
      gmp_number,
      board_name: board_name ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "GMP number already exists for this customer" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(gmp, { status: 201 });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/gmps/route.ts
git commit -m "feat: add GMP list and create API routes"
```

---

### Task 12: BOM Upload Page

**Files:**
- Create: `app/(dashboard)/bom/upload/page.tsx`

- [ ] **Step 1: Create the upload page**

Create `app/(dashboard)/bom/upload/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "@/components/bom/upload-form";

export default async function BomUploadPage() {
  const supabase = await createClient();

  const { data: customers } = await supabase
    .from("customers")
    .select("id, code, company_name")
    .eq("is_active", true)
    .order("code", { ascending: true });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Upload BOM</h2>
        <p className="text-gray-500">
          Upload a Bill of Materials file to parse and classify components.
        </p>
      </div>

      <UploadForm customers={customers ?? []} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(dashboard)/bom/upload/page.tsx"
git commit -m "feat: add BOM upload page"
```

---

### Task 13: BOM Detail / Review Page

**Files:**
- Create: `app/(dashboard)/bom/[id]/page.tsx`

- [ ] **Step 1: Create the BOM detail page**

Create `app/(dashboard)/bom/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { BomTable } from "@/components/bom/bom-table";
import { formatDateTime } from "@/lib/utils/format";

export default async function BomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Get BOM with customer and GMP info
  const { data: bom } = await supabase
    .from("boms")
    .select("*, customers(code, company_name), gmps(gmp_number, board_name)")
    .eq("id", id)
    .single();

  if (!bom) {
    notFound();
  }

  // Get BOM lines
  const { data: lines } = await supabase
    .from("bom_lines")
    .select("*")
    .eq("bom_id", id)
    .order("line_number", { ascending: true });

  const parseResult = bom.parse_result as Record<string, unknown> | null;
  const classificationSummary = (parseResult?.classification_summary ?? {}) as Record<string, number>;
  const statsSummary = (parseResult?.stats ?? {}) as Record<string, number>;

  // Get revision history for this GMP
  const { data: revisions } = await supabase
    .from("boms")
    .select("id, file_name, revision, status, created_at")
    .eq("gmp_id", bom.gmp_id)
    .order("created_at", { ascending: false });

  const customer = bom.customers as Record<string, string> | null;
  const gmp = bom.gmps as Record<string, string> | null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/bom/upload">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Upload New
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {bom.file_name}
          </h2>
          <div className="flex items-center gap-2 text-gray-500">
            <span>{customer?.code} — {customer?.company_name}</span>
            <span>·</span>
            <span className="font-mono">{gmp?.gmp_number}</span>
            <span>·</span>
            <span>Rev {bom.revision}</span>
          </div>
        </div>
        <Badge
          variant={
            bom.status === "parsed"
              ? "default"
              : bom.status === "error"
                ? "destructive"
                : "secondary"
          }
        >
          {bom.status}
        </Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Components</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{bom.component_count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Classified</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {classificationSummary.classified ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Need Review</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600">
              {classificationSummary.unclassified ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Merged Lines</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{statsSummary.merged ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* BOM Lines Table */}
      {lines && lines.length > 0 ? (
        <BomTable lines={lines} bomId={id} />
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            No parsed lines found. The BOM may still be processing.
          </CardContent>
        </Card>
      )}

      {/* Revision History */}
      {revisions && revisions.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Revision History</CardTitle>
            <CardDescription>
              Previous uploads for GMP {gmp?.gmp_number}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {revisions.map((rev) => (
                <div
                  key={rev.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {rev.id === id ? (
                        <span className="text-blue-600">{rev.file_name} (current)</span>
                      ) : (
                        <Link
                          href={`/bom/${rev.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {rev.file_name}
                        </Link>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      Rev {rev.revision} · {formatDateTime(rev.created_at)}
                    </p>
                  </div>
                  <Badge variant={rev.status === "parsed" ? "default" : "secondary"}>
                    {rev.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(dashboard)/bom/[id]/page.tsx"
git commit -m "feat: add BOM detail page with parsed lines, M-Code review, and revision history"
```

---

### Task 14: BOM List Page

**Files:**
- Create: `app/(dashboard)/bom/page.tsx`

- [ ] **Step 1: Create the BOM list page**

Create `app/(dashboard)/bom/page.tsx`:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus } from "lucide-react";
import { formatDateTime } from "@/lib/utils/format";

export default async function BomListPage() {
  const supabase = await createClient();

  const { data: boms } = await supabase
    .from("boms")
    .select("*, customers(code, company_name), gmps(gmp_number)")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">BOMs</h2>
          <p className="text-gray-500">
            Uploaded Bills of Materials
          </p>
        </div>
        <Link href="/bom/upload">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Upload BOM
          </Button>
        </Link>
      </div>

      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>GMP</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Rev</TableHead>
              <TableHead>Components</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Uploaded</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {boms && boms.length > 0 ? (
              boms.map((bom) => {
                const customer = bom.customers as Record<string, string> | null;
                const gmp = bom.gmps as Record<string, string> | null;
                return (
                  <TableRow key={bom.id}>
                    <TableCell className="font-mono text-sm">
                      {customer?.code}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {gmp?.gmp_number}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/bom/${bom.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {bom.file_name}
                      </Link>
                    </TableCell>
                    <TableCell>{bom.revision}</TableCell>
                    <TableCell>{bom.component_count}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          bom.status === "parsed"
                            ? "default"
                            : bom.status === "error"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {bom.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {formatDateTime(bom.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                  No BOMs uploaded yet.{" "}
                  <Link href="/bom/upload" className="text-blue-600 hover:underline">
                    Upload your first BOM
                  </Link>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(dashboard)/bom/page.tsx"
git commit -m "feat: add BOM list page with status and upload link"
```

---

### Task 15: Seed Data Migrations

**Files:**
- Create: `supabase/migrations/003_seed_m_code_rules.sql`, `supabase/migrations/004_seed_overage_table.sql`

- [ ] **Step 1: Create M-Code rules seed migration**

Create `supabase/migrations/003_seed_m_code_rules.sql`:

```sql
-- RS PCB Assembly ERP — Seed Data: M-Code Classification Rules
-- Migration 003: Core PAR rules

INSERT INTO public.m_code_rules (rule_id, priority, layer, field_1, operator_1, value_1, field_2, operator_2, value_2, assigned_m_code, description, is_active) VALUES
('PAR-01', 1, 2, 'mounting_type', 'equals', 'Through Hole', NULL, NULL, NULL, 'TH', 'Through-hole components → TH', true),
('PAR-02', 2, 2, 'mounting_type', 'contains', 'Surface Mount, Through Hole', NULL, NULL, NULL, 'MANSMT', 'Mixed mount type → Manual SMT', true),
('PAR-03', 3, 2, 'description', 'regex', '\b(connector|header|socket|pin header|terminal)\b', 'mounting_type', 'equals', 'Through Hole', 'TH', 'Through-hole connectors → TH', true),
('PAR-04', 4, 2, 'package_case', 'regex', '^0201$', NULL, NULL, NULL, '0201', '0201 package → 0201', true),
('PAR-05', 5, 2, 'package_case', 'regex', '^0402$', NULL, NULL, NULL, '0402', '0402 package → 0402', true),
('PAR-06', 6, 2, 'package_case', 'regex', '^0603$|^0805$|^1206$|^1210$|^1812$|^2010$|^2512$', NULL, NULL, NULL, 'CP', 'Standard SMT passive packages → CP', true),
('PAR-07', 7, 2, 'description', 'regex', '\b(resistor|capacitor|inductor|ferrite|diode|led)\b', 'mounting_type', 'equals', 'Surface Mount', 'CP', 'SMT passives → CP', true),
('PAR-08', 8, 2, 'package_case', 'regex', '\b(SOIC|SSOP|TSSOP|MSOP|QFN|DFN|SOT)\b', NULL, NULL, NULL, 'IP', 'IC packages (SOIC, QFN, etc.) → IP', true),
('PAR-09', 9, 2, 'package_case', 'regex', '\b(QFP|LQFP|TQFP|BGA|CSP|LGA)\b', NULL, NULL, NULL, 'IP', 'Large IC packages → IP', true),
('PAR-10', 10, 2, 'description', 'regex', '\b(standoff|spacer|heatsink|bracket|screw|nut|washer)\b', NULL, NULL, NULL, 'MEC', 'Mechanical hardware → MEC', true),
('PAR-11', 11, 2, 'description', 'regex', '\b(cable|wire|harness|cord)\b', NULL, NULL, NULL, 'CABLE', 'Cables and wiring → CABLE', true),
('PAR-12', 12, 2, 'description', 'regex', '\b(clip|spacer|grommet|bumper|foot|pad)\b', NULL, NULL, NULL, 'Accs', 'Accessories → Accs', true),
('PAR-13', 13, 2, 'description', 'regex', '\b(arduino|raspberry|eval board|dev board|development board|module)\b', NULL, NULL, NULL, 'DEV B', 'Development/eval boards → DEV B', true),
('PAR-20', 20, 2, 'length_mm', 'regex', '0.4-0.99', 'width_mm', 'regex', '0.2-0.48', '0201', 'Size-based: 0201 range', true),
('PAR-21', 21, 2, 'length_mm', 'regex', '1.0-1.49', 'width_mm', 'regex', '0.49-0.79', '0402', 'Size-based: 0402 range', true),
('PAR-22', 22, 2, 'length_mm', 'regex', '1.5-3.79', 'width_mm', 'regex', '0.8-3.59', 'CP', 'Size-based: CP range', true),
('PAR-23', 23, 2, 'length_mm', 'regex', '3.8-4.29', 'width_mm', 'regex', '3.6-3.99', 'CPEXP', 'Size-based: CPEXP range', true),
('PAR-24', 24, 2, 'length_mm', 'regex', '4.3-25.0', 'width_mm', 'regex', '4.0-25.0', 'IP', 'Size-based: IP range', true);
```

- [ ] **Step 2: Create overage table seed migration**

Create `supabase/migrations/004_seed_overage_table.sql`:

```sql
-- RS PCB Assembly ERP — Seed Data: Overage Table
-- Migration 004: Extra components per M-Code per quantity tier

INSERT INTO public.overage_table (m_code, qty_threshold, extras) VALUES
-- CP (Chip Package)
('CP', 1, 10), ('CP', 60, 30), ('CP', 100, 35), ('CP', 200, 40), ('CP', 300, 50), ('CP', 500, 60),
-- 0402 (Small passives)
('0402', 1, 50), ('0402', 60, 60), ('0402', 100, 70), ('0402', 200, 80), ('0402', 300, 100), ('0402', 500, 120),
-- 0201 (Ultra-tiny)
('0201', 1, 100), ('0201', 60, 120), ('0201', 100, 140), ('0201', 200, 160), ('0201', 300, 200), ('0201', 500, 250),
-- IP (IC Package)
('IP', 1, 5), ('IP', 10, 5), ('IP', 20, 10), ('IP', 50, 15), ('IP', 100, 20), ('IP', 250, 20),
-- CPEXP (Expanded SMT)
('CPEXP', 1, 10), ('CPEXP', 60, 30), ('CPEXP', 100, 35), ('CPEXP', 200, 40), ('CPEXP', 300, 50), ('CPEXP', 500, 60),
-- TH (Through-Hole)
('TH', 1, 1), ('TH', 10, 1), ('TH', 20, 2), ('TH', 50, 5), ('TH', 100, 5), ('TH', 250, 20),
-- MANSMT (Manual SMT)
('MANSMT', 1, 2), ('MANSMT', 10, 3), ('MANSMT', 50, 5), ('MANSMT', 100, 10),
-- MEC (Mechanical)
('MEC', 1, 0), ('MEC', 10, 1), ('MEC', 50, 2), ('MEC', 100, 5),
-- Accs (Accessories)
('Accs', 1, 0), ('Accs', 10, 1), ('Accs', 50, 2),
-- CABLE
('CABLE', 1, 0), ('CABLE', 10, 1),
-- DEV B
('DEV B', 1, 0), ('DEV B', 10, 1);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/003_seed_m_code_rules.sql supabase/migrations/004_seed_overage_table.sql
git commit -m "feat: add seed migrations for M-Code rules and overage table"
```

---

### Task 16: Supabase Storage Bucket Setup + Build Verification

**Files:**
- Modify: various (fix any build errors)

- [ ] **Step 1: Create a setup note for Supabase Storage**

The `boms` bucket must be created manually in the Supabase Dashboard (Storage → New Bucket → name: `boms`, private). This cannot be done via SQL migration.

- [ ] **Step 2: Run a clean build**

```bash
rm -rf .next && npm run build
```

Fix any TypeScript errors found. Common issues to watch for:
- Ensure `xlsx` types are available (install `@types/xlsx` if needed, or use `// @ts-ignore` for the import if SheetJS bundles its own types)
- Ensure all route handler param types match Next.js 16 conventions (`params: Promise<{ id: string }>`)

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: Sprint 2 build verification and cleanup"
```

---

## Acceptance Criteria

Once all tasks are complete and Supabase is configured:

1. **Navigate to BOMs** in sidebar → see BOM list page (empty initially)
2. **Click "Upload BOM"** → see upload form with customer dropdown
3. **Select customer** (e.g. TLAN) → GMP dropdown appears
4. **Create new GMP** (e.g. TL265-5040-000-T) → enter number
5. **Drag & drop a .xlsx BOM file** → file appears in drop zone
6. **Click "Upload & Parse BOM"** → file uploaded, parsed, redirected to detail page
7. **BOM detail page** → see parsed components table with M-Code column
8. **Classified components** show green/gray M-Code badges
9. **Unclassified components** highlighted orange with "Assign" button
10. **Click M-Code dropdown** → select M-Code → saved to database + components table
11. **Re-upload same GMP** → revision history shows both versions

## Post-Plan Notes

- **Layer 3 (API classification)** is deferred to Sprint 3 when DigiKey/Mouser integration comes
- **Supabase Storage** requires manual bucket creation in the dashboard
- **The 47 PAR rules** in the seed migration are the core rules. The full 47 from the original spec can be expanded later — the database-driven rule system supports adding rules without code changes
- **Rule 8 (Auto-PCB from Gerber)** is deferred — requires file system access to search for sibling Gerber folders, which doesn't apply in a web upload context
