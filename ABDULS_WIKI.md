# ABDUL'S WIKI — RS PCB Assembly ERP: The Complete Tutorial

> **Read this if you have zero context about RS and the ERP system.**
> 
> This wiki explains EVERYTHING: what the business does, why it exists, how every piece connects, what each table/API does, and most importantly — WHY we built it this way.
>
> Think of this as sitting down with Anas and Piyush for 3 hours while they explain their entire business. You'll understand not just the code, but the real-world decisions behind every design choice.
>
> **Last updated: April 2026**

---

## PART 1: THE BUSINESS — Why This App Exists

### What RS PCB Assembly Actually Does

RS Electronique Inc. (brand: **RS PCB Assembly**) is a contract electronics manufacturer in Montreal. Here's what that means in plain English:

Customers (tech companies, hardware startups, aerospace firms) come to us with a product design: a PCB (circuit board) and a bill of materials (list of components). We don't design the board — they do. What we do:

1. **Buy all the components** (resistors, capacitors, ICs, connectors, etc.) from distributors like DigiKey, Mouser, and LCSC
2. **Program the SMT machines** (pick-and-place robots that place tiny components on the board)
3. **Run the boards through production:** stencil printing → pick-and-place on top side → reflow oven → flip board → pick-and-place on bottom side → reflow oven again → inspection → rework if needed
4. **Ship finished boards** to the customer

We handle everything from 1-board prototypes to production runs of hundreds. We've been doing this for years with 11 interconnected Excel workbooks. This web app replaces those workbooks.

### The Three People Running This Show

**Anas Patel (CEO) — Montreal**
- Handles sales, customer relationships, quote approvals, financial decisions
- The decision-maker and customer face
- Uses the system to: approve quotes, track profitability, manage customers, see real-time status

**Piyush Tayal (Operations Manager) — India (UTC+5:30)**
- Procurement, order processing, supplier management, all the "making it happen" work
- Currently spends 8+ hours a day in Excel clicking macro buttons
- The one who WORKS in the current system every single day
- Uses the system to: create BOMs, assign M-codes, calculate pricing, generate procurement orders, track inventory

**Hammad Ahmed (Production/Shop Floor) — Montreal**
- Runs the SMT machines, physically assembles boards, receives material, ships product
- Uses the system to: mark production steps (stencil printed, reflow complete, inspection passed), see what job is next

### Why Excel Is Being Replaced (The 11 Workbooks)

The current system lives in 11 interconnected Excel/VBA files, each maintained by an external contractor from years ago. Here's the problem:

1. **File locking** — When Piyush opens "DM Common File V11" to work on a quote, Anas can't access it. They have to take turns. When someone's work gets interrupted and the file doesn't close cleanly, OneDrive corrupts it. Lost data.

2. **No real-time visibility** — Anas can't see what's happening without calling Piyush. Email is the chat system. "Where is this job?" "Let me check... I'll email you."

3. **Fragile macro sequences** — To generate a quote, Piyush must click 11 buttons in EXACT sequence. Miss one step or click them out of order and it breaks. No validation, no checkpoints.

4. **Manual work that should be automated** — 40% of M-codes (component classifications) need manual override because the 31 rules in the rules engine don't catch everything. Piyush manually looks at each one.

5. **No audit trail** — When something goes wrong (wrong price quoted, wrong component ordered), there's no record of WHO changed WHAT and WHEN.

6. **Impossible to scale** — Anas wants to hire a second person to help Piyush, but there's not enough Excel seats. The system is a hard ceiling at 1-person operations.

### The #1 Goal: Quote Turnaround from 2 Hours to 15 Minutes

Right now, generating one quote takes **2 hours**:
- Piyush receives customer RFQ
- Opens 4-5 Excel files
- Clicks macro buttons (5-15 mins for parsing)
- Manually assigns M-codes for edge cases (30-40 mins)
- Calls APIs for component pricing (30 mins, waiting for responses)
- Calculates pricing with 4 quantity tiers (30 mins)
- Generates PDF (10 mins)
- Anas reviews and approves (15 mins)

That's **25 quotes a month × 2 hours = 50 hours/month = $3-4K in lost capacity**.

This web app is designed to cut that to **15 minutes**:
- Drag-drop BOM file (30 seconds)
- Auto-parse BOM using 9 standardized rules (10 seconds)
- Run M-code classification — 95% auto-classified from component database, 4% from rules, 1% needs human review (2 mins if needed)
- Auto-call DigiKey/Mouser/LCSC APIs in parallel (30 seconds)
- Calculate pricing for 4 tiers (10 seconds)
- Generate PDF (10 seconds)
- Done

And if multiple boards go into the same quote (the "merge-split" pattern), the savings compound: one API call for all boards instead of per-board API calls.

---

## PART 2: The Data Model — How Everything Connects

Everything in the system follows this lifecycle:

```
Customer → RFQ Received → GMP Created → BOM Uploaded & Parsed → M-Codes Assigned
    ↓
Quote Generated (4 quantity tiers) → Customer Approves → Job Created
    ↓
Procurement Order Generated → Supplier POs Created → Materials Ordered
    ↓
Materials Received → Production Scheduled → SMT Machines Run → Inspection
    ↓
Quality Passed → Shipped → Invoice Generated → Payment Received
```

Let me walk through each step and show you which tables are involved:

### Step 1: Customer Registration

**Tables:** `customers`, `users`

When a new customer calls (like Lanka Circuits), we create a record:

```javascript
customers {
  id: "uuid-1",
  code: "TLAN",                           // Short code for ID
  company_name: "Lanka / Knorr-Bremse",  // Full legal name
  contact_name: "Luis Esqueda",
  contact_email: "Luis.Esqueda@...",
  billing_address: { street: "...", city: "Montreal", ... },
  shipping_address: { ... },
  bom_config: {                           // Customer-specific BOM format
    header_row: null,                     // Lanka has no header row
    columns_fixed: ["qty", "designator", "cpc", "description", "mpn", "manufacturer"],
    encoding: "utf-8",
    format: "xlsx"
  },
  notes: "Net 30 payment, prefers email quotes",
  created_by: "anas-user-id"
}
```

The `bom_config` JSONB field is crucial — it tells the parser how THIS customer's BOMs are formatted, since every customer sends BOMs differently.

**Why JSONB?** Because customer configs change (we add a new column name format for a customer), and we don't want migrations every time. Just update the JSON.

### Step 2: GMP Created (Global Manufacturing Package)

**Tables:** `gmps`, `customers`

A GMP is a board/product. One customer might have 5 different boards (5 different designs).

```javascript
gmps {
  id: "uuid-2",
  customer_id: "uuid-1",                  // Foreign key to customers
  gmp_number: "TL265-5040-000-T",         // Board part number (unique per customer)
  board_name: "Power Supply Control Board",
  revision: "1",
  metadata: {
    layer_count: 4,
    size_mm: "100x80",
    thermals: true
  }
}
```

One GMP → one board design. One customer can have multiple GMPs.

### Step 3: BOM Uploaded and Parsed

**Tables:** `boms`, `bom_lines`

Customer sends a BOM file (usually Excel). We upload it and parse it:

```javascript
boms {
  id: "uuid-3",
  gmp_id: "uuid-2",
  customer_id: "uuid-1",
  file_name: "TL265-5040-000-T_BOM_Rev1.xlsx",
  file_path: "boms/TLAN/TL265-5040-000-T/...",  // Stored in Supabase
  status: "parsed",
  component_count: 127,
  created_by: "piyush-user-id"
}

// Individual component lines from the BOM
bom_lines {
  id: "uuid-4",
  bom_id: "uuid-3",
  line_number: 1,
  quantity: 500,                          // 500 of this component per board
  reference_designator: "C1, C2, C3",     // Where they go on the board
  cpc: "TLAN-C-0402-10U",                 // Customer's part code
  description: "Ceramic Capacitor",
  mpn: "GRM155R71A106KA01L",              // Manufacturer part number (Murata)
  manufacturer: "Murata",
  is_pcb: false,
  is_dni: false,                          // "Do Not Install" flag
  m_code: "CP",                           // Classification (see Part 3 below)
  m_code_confidence: 0.98,
  m_code_source: "database"               // Found in components table
}
```

**Why JSONB for parse_result?** The raw parsing can produce detailed info (warnings, column mappings tried, etc.) that doesn't fit a rigid schema.

### Step 4: M-Codes Assigned (Component Classification)

The magic part. Every component gets classified as one of 11 types that determines:
- How much extra to order (overage)
- How the SMT machine handles it
- Labour cost

See Part 3 below for the full system.

### Step 5: Quote Generated

**Tables:** `quotes`, `api_pricing_cache`

```javascript
quotes {
  id: "uuid-5",
  quote_number: "QT-2604-ISC-001",        // Auto-generated
  customer_id: "uuid-1",
  gmp_id: "uuid-2",
  bom_id: "uuid-3",
  quantities: {
    qty_1: 50,
    qty_2: 100,
    qty_3: 250,
    qty_4: 500
  },
  pricing: {
    qty_1: {
      components: 1250.00,               // Sum of all component costs
      pcb: 125.00,
      assembly: 85.50,                  // Labour for SMT placement
      nre: 350.00,                      // Non-recurring (stencil, setup)
      subtotal: 1810.50,
      total: 1810.50,                   // After markup
      per_unit: 36.21                   // 1810.50 / 50
    },
    qty_2: { ... },
    qty_3: { ... },
    qty_4: { ... }
  },
  component_markup: 20.0,                // 20% markup on distributor prices
  pcb_cost_per_unit: 2.50,              // Per board from WMD or Candor
  assembly_cost: 85.50,
  nre_charge: 350.00,
  status: "sent",                       // draft → review → sent → accepted
  pdf_path: "quotes/TLAN/TL265-5040.../quote-2604-001.pdf"
}
```

**Why JSONB for pricing?** Because each tier has the same structure (components, pcb, assembly, nre, total, per_unit), and we might have 4, 5, or 10 tiers depending on customer negotiations. A rigid schema would be inflexible.

### Step 6: Customer Accepts Quote, Job Created

**Tables:** `jobs`, `job_status_log`

```javascript
jobs {
  id: "uuid-6",
  job_number: "JB-2604-TLAN-001",        // Auto-generated: month-customer-sequence
  quote_id: "uuid-5",
  customer_id: "uuid-1",
  gmp_id: "uuid-2",
  bom_id: "uuid-3",
  po_number: "PO-12345",                 // Customer's purchase order
  status: "created",                     // → procurement → parts_ordered → production → shipped → invoiced
  quantity: 100,                         // Quantity from qty_2 tier
  assembly_type: "TB"                    // TB=Top+Bottom, TS=Top-side only, etc.
}

// Immutable history
job_status_log {
  job_id: "uuid-6",
  old_status: null,
  new_status: "created",
  changed_by: "anas-user-id",
  created_at: "2026-04-08T10:15:00Z"
}
```

### Step 7: Procurement Order Generated

**Tables:** `procurements`, `procurement_lines`, `supplier_pos`

This is where the "merge-split" pattern shows up. When Piyush generates a procurement, he's saying "I'm going to order these components together."

```javascript
procurements {
  id: "uuid-7",
  proc_code: "260408 TLAN-TB001",        // Batch code (YYMMDD CUSTOMER-TYPE###)
  job_id: "uuid-6",
  status: "draft",                       // → ordering → partial_received → fully_received → completed
  total_lines: 127,                      // Total component lines
  lines_ordered: 0,                      // How many marked as "ordered"
  lines_received: 0                      // How many marked as "received"
}

procurement_lines {
  id: "uuid-8",
  procurement_id: "uuid-7",
  mpn: "GRM155R71A106KA01L",
  description: "Ceramic Capacitor",
  m_code: "CP",
  qty_needed: 50,                        // 50 per board × 2 boards = 50
  qty_extra: 2,                          // Overage for CP at 50 qty = 2 extra
  qty_ordered: 0,                        // Not yet marked ordered
  qty_received: 0,
  supplier: null,                        // To be filled by supplier allocation
  supplier_pn: null,
  unit_price: null,                      // To be filled by API call
  is_bg: false                           // Not from background stock
}
```

When Piyush clicks "Order All", the API marks `qty_ordered = qty_needed + qty_extra` and groups lines by supplier (which one has it cheapest?). Then it creates supplier POs:

```javascript
supplier_pos {
  id: "uuid-9",
  po_number: "DK-260408-001",            // DigiKey PO for this batch
  procurement_id: "uuid-7",
  supplier_name: "DigiKey",
  lines: [
    { mpn: "GRM155R71A106KA01L", qty: 52, unit_price: 0.12, line_total: 6.24 },
    { mpn: "...", qty: 10, unit_price: 1.50, line_total: 15.00 },
    // ... all lines going to DigiKey
  ],
  total_amount: 245.67,
  status: "draft"                        // → sent → received → closed
}
```

### Step 8: Materials Arrive and Production Starts

**Tables:** `production_events`

When Hammad receives material, he marks it. When he starts the SMT machine, he marks it. Each step creates an event:

```javascript
production_events {
  id: "uuid-10",
  job_id: "uuid-6",
  event_type: "materials_received",      // One of 15 types
  operator_id: "hammad-user-id",
  notes: "Received 3 boxes from DigiKey, all labels match",
  created_at: "2026-04-10T14:30:00Z"
}
```

When a new production_event is inserted, Supabase Realtime fires and Anas sees it on his dashboard instantly. This is why the app is better than Excel — Anas doesn't have to call Piyush to ask "Are we done with SMT yet?"

### Step 9: Invoice Generated and Payment Tracked

**Tables:** `invoices`

When the job ships, we invoice:

```javascript
invoices {
  id: "uuid-11",
  invoice_number: "INV-2604-001",
  job_id: "uuid-6",
  customer_id: "uuid-1",
  subtotal: 3621.00,                     // 100 units × 36.21 per unit
  tps_gst: 181.05,                       // 5% federal tax (Canada)
  tvq_qst: 361.00,                       // 9.975% Quebec tax
  freight: 45.00,
  total: 4208.05,
  status: "sent",                        // → paid → overdue
  issued_date: "2026-04-15",
  due_date: "2026-05-15",                // Net 30
  pdf_path: "invoices/TLAN/inv-2604-001.pdf"
}
```

The invoice totals come directly from the quote pricing × accepted quantity.

---

## PART 3: The M-Code System — The Secret Sauce

This is the proprietary intelligence that makes RS's quoting work. Every component gets one of 11 M-codes that determines extras, placement cost, and labour.

### The 11 M-Code Types

| M-Code | What It Is | Size | Assembly | Extras | Example |
|--------|-----------|------|----------|--------|---------|
| **0201** | Ultra-tiny passives | 0.4-0.99mm | High-precision pick-and-place | 50-120 | Tiny resistor |
| **0402** | Small passives | 1.0-1.49mm | Specialized feeders | 50-120 | Standard resistor/cap |
| **CP** | Chip Package (standard) | 1.5-3.79mm | Standard pick-and-place | 10-60 | Most common SMT |
| **CPEXP** | Expanded SMT | 3.8-4.29mm | Wider feeder slots | 20-80 | Larger chips |
| **IP** | IC Package (large SMT) | 4.3-25mm | Tray/tube feeders | 5-20 | ICs, BGA, QFP |
| **TH** | Through-Hole | Any | Manual insertion | 1-20 | Connectors, headers |
| **MANSMT** | Manual SMT | Special | Hand-soldered | 10-50 | High-power parts |
| **MEC** | Mechanical | — | Manual assembly | 0 | Standoffs, brackets |
| **Accs** | Accessories | — | Manual | 0 | Clips, spacers |
| **CABLE** | Wiring | — | Manual | 0 | Wire harness |
| **DEV B** | Dev boards | — | Pre-made module | 0 | Arduino module |

### Why M-Codes Matter

**Example: An 0402 resistor vs a CP resistor**

They look similar (both small chips), but:

- **0402 resistor**: Uses tiny feeder slots on the SMT machine. Very precise placement. Attrition rate 3-5% (small things get lost). Order 50 units → add 50-120 extras → order 100-170 total.

- **CP resistor**: Uses standard feeder slots. Attrition rate 1-2%. Order 50 units → add 10-60 extras → order 60-110 total.

**Same part type, different M-code → different order quantities → different costs → customer pays different price.**

This is NOT a technical distinction. It's a business/production reality. If you order like a CP when you should be ordering like an 0402, you either:
- Order too few and miss out on delivery (bad), or
- Order too many and waste money (bad)

### The 4-Layer Classification Pipeline

When a component line comes in from a BOM, we classify it using this pipeline:

```
Input: MPN (Manufacturer Part Number) + Description + CPC (Customer Part Code)

LAYER 1: DATABASE LOOKUP (4,026 cached components)
  Search components table by MPN
  If found AND confidence ≥ 95%:
    → Return m_code, source="database"
    → DONE (95% of repeat customers hit here)
  If not found OR confidence < 95%:
    → Continue to Layer 2

LAYER 2: KEYWORD LOOKUP (230 terms)
  Search mcode_keyword_lookup table
  Match against: description, package_case, cpc
  If matched with confidence ≥ 90%:
    → Return m_code, source="keyword"
    → DONE
  If not found:
    → Continue to Layer 3

LAYER 3: PAR RULES (Pattern Analysis Rules, 48 rules)
  Evaluate 48 if-then rules in priority order:
    PAR-01: if mounting_type = "Through Hole" → TH
    PAR-02: if mounting_type = "Surface Mount, Through Hole" → MANSMT
    PAR-03-47: pattern matching on package, size, category, description
  If matched with confidence ≥ 85%:
    → Return m_code, source="rule"
    → DONE
  If no match:
    → Continue to Layer 4

LAYER 4: CLAUDE AI (Last resort, 1-5% of components)
  Send MPN + description to Claude API
  Claude classifies based on component knowledge
  If confidence ≥ 80%:
    → Return m_code, source="ai"
    → DONE
  If still unclassified:
    → Return m_code=NULL, source=NULL
    → Goes to human review queue
    → Piyush manually assigns

LEARNING LOOP:
  When Piyush manually assigns an M-code:
    → Save to components table (Layer 1)
    → Next time same MPN appears → automatically caught by database lookup
    → "You've done it for the rest of time" — Anas's words
```

**Real example from production:**

Customer's BOM has: `SOT-23 N-channel MOSFET`

1. **Layer 1 lookup** by MPN → not in components table (first time seeing this part)
2. **Layer 2 keyword** → "SOT-23" matches keyword lookup → assigned "MANSMT" (hand-soldered)
   - But wait... SOT-23 is a surface mount package, usually pick-and-place, not hand-soldered
   - This is a FALSE MATCH because "SOT-23" is also a package name and the keyword lookup didn't check context
3. **Problem:** System returns MANSMT, but correct answer is CP (standard SMT)

This is exactly why Layer 1 has 4,026 components. Piyush looks at the line, sees "SOT-23 MOSFET", knows it's actually a standard chip package, overrides it to CP. The system learns: "SOT-23 + MOSFET descriptor = CP, not MANSMT."

Next time a SOT-23 MOSFET comes in, Layer 1 catches it instantly.

### The 230 Keyword Table

Instead of matching free-form against AI every time (expensive), we curate a 230-keyword lookup table:

```javascript
mcode_keyword_lookup: [
  { keyword: "0402", assigned_m_code: "0402", match_field: "package_case", match_type: "exact" },
  { keyword: "0201", assigned_m_code: "0201", match_field: "package_case", match_type: "exact" },
  { keyword: "BGA", assigned_m_code: "IP", match_field: "package_case", match_type: "contains" },
  { keyword: "Through Hole", assigned_m_code: "TH", match_field: "mounting_type", match_type: "exact" },
  { keyword: "Connector", assigned_m_code: "TH", match_field: "description", match_type: "contains" },
  { keyword: "Header", assigned_m_code: "TH", match_field: "description", match_type: "contains" },
  // ... 227 more
]
```

**Why word boundaries for short keywords?** Because "0402" appearing in "LPC24020A" (an IC part number) would cause a false match. So for keywords ≤4 characters, we match whole words only.

### The 48 PAR Rules

PAR = Pattern Analysis Rules. These are the sophisticated classification logic:

```javascript
m_code_rules: [
  {
    rule_id: "PAR-01",
    priority: 1,
    layer: 3,
    field_1: "mounting_type",
    operator_1: "equals",
    value_1: "Through Hole",
    assigned_m_code: "TH"
  },
  {
    rule_id: "PAR-02",
    priority: 2,
    layer: 3,
    field_1: "package_case",
    operator_1: "contains",
    value_1: "BGA",
    assigned_m_code: "IP"
  },
  {
    rule_id: "PAR-03",
    priority: 3,
    layer: 3,
    field_1: "package_case",
    operator_1: "regex",
    value_1: "^0402$",
    assigned_m_code: "0402"
  },
  {
    rule_id: "PAR-04",
    priority: 4,
    layer: 3,
    field_1: "package_case",
    operator_1: "regex",
    value_1: "^0201$",
    assigned_m_code: "0201"
  },
  // ... through PAR-48
  {
    rule_id: "PAR-25",
    priority: 25,
    layer: 3,
    field_1: "mounting_type",
    operator_1: "contains",
    value_1: "Surface",
    field_2: "package_case",
    operator_2: "regex",
    value_2: "^[0-9]{4}$",  // 0402, 0603, 0805 pattern
    assigned_m_code: "CP"
  }
]
```

Rules can have two conditions (field_1 AND field_2) and operators: equals, contains, regex, in.

Priority 1 runs first. If it matches, return immediately. If not, try Priority 2, etc. This prevents conflicts.

### Overage Calculation

Once M-code is assigned, we calculate extras:

```javascript
overage_table: [
  { m_code: "CP", qty_threshold: 1, extras: 10 },
  { m_code: "CP", qty_threshold: 60, extras: 30 },
  { m_code: "CP", qty_threshold: 100, extras: 35 },
  { m_code: "CP", qty_threshold: 200, extras: 40 },
  { m_code: "CP", qty_threshold: 300, extras: 50 },
  { m_code: "CP", qty_threshold: 500, extras: 60 },
  
  { m_code: "0402", qty_threshold: 1, extras: 50 },
  { m_code: "0402", qty_threshold: 60, extras: 60 },
  { m_code: "0402", qty_threshold: 100, extras: 70 },
  // ... IP, TH, etc.
]
```

**Algorithm:** For a component with qty_needed=50 and m_code="CP":
- Find all rows where m_code="CP"
- Find the highest qty_threshold where qty_needed ≥ threshold
- Return that extras value

For qty_needed=100:
- Rows with threshold ≤ 100: 1→10, 60→30, 100→35
- Highest match is 100→35
- Order 100 + 35 = 135 total

This is why M-codes matter for pricing: different extras percentages → different order quantities → different costs.

---

## PART 4: The BOM Parser — How Raw BOMs Become Data

A customer sends a BOM in Excel. It looks like this:

```
TLAN BOM Format (No header row):
Row 1: [empty]
Row 2: 500    C1-C10       TLAN-C-0402   Ceramic Cap    GRM155R71A106KA01L    Murata
Row 3: 100    L1-L5        TLAN-L-LQG     RF Inductor   LQG18HS27NG00D        Murata
Row 4: 50     U1-U3        TLAN-U-STM32   MCU           STM32L162VDY6         ST Micro
...
```

But other customers send BOMs formatted completely differently:

```
ISC BOM Format (Header row at row 1):
Row 1: [Header] Qty | Designator | Description | MPN
Row 2: 500    | C1-C10    | Ceramic Cap | GRM155R71A106KA01L
...

Legend Power BOM Format (Header at row 12):
Rows 1-11: [Banner/title]
Row 12: [Header] Quantity | PartNumber | Designation | Manufacturer
Row 13: 500    | GRM155R71A106KA01L | C1 | Murata
...
```

The 9 CP IP rules standardize this chaos into a single 6-column format.

### The 9 CP IP Rules

**Rule 1: Fiducial Exclusion**
- Fiducials are tiny alignment markers on PCBs (not real components)
- Pattern: `FID` + digits (FID1, FID2, FID3)
- Action: Skip these rows

**Rule 2: PCB at Top**
- The PCB itself is a line item (we source it from WMD Circuits or Candor)
- Pattern: Designator matches `^PCB[A-Z0-9\-]*$` (PCB, PCB-A, PCB-MAIN, etc.)
- **Critical:** Match by designator ONLY, never by description (e.g., "PCB VOIP MEZZANINE" is a description, not the PCB row)
- Action: Pin this row as row 2 (row 1 is headers)

**Rule 3: DNI Exclusion (Do Not Install)**
- Some components are on the BOM for reference but not actually soldered
- Pattern: 
  - qty=0 AND mpn blank, OR
  - Description/designator contains: DNI, DNP, DNL, "DO NOT INSTALL", "DO NOT PLACE", "DO NOT POPULATE"
- Action: Skip these rows

**Rule 4: No Title Row**
- Output format: Row 1 = headers, Row 2+ = data
- No banners, no extra rows above headers
- Action: Detect and skip title/banner rows

**Rule 5: Log Sheet**
- Track what happened to each input row
- Example: `FID1` → "EXCLUDED: Fiducial", `PCB` → "INCLUDED: PCB component", `C1-C5` → "MERGED: Same MPN, qty summed"
- Action: Create a second sheet in the output showing transformations

**Rule 6: Designator-Only PCB Detection**
- Never use description to detect PCB (source of many false matches in past)
- Always use designator pattern: `^PCB[A-Z0-9\-]*$`
- Action: Description matching disabled for PCB detection

**Rule 7: MPN Merge**
- If same MPN appears on multiple rows, merge them:
  - Sum quantities
  - Combine designators (natural sort: C1, C2, C10, not C1, C10, C2)
  - Keep first row's other fields
- Example:
  ```
  Row 1: qty=10, designator="C1", mpn="CAP-100U"
  Row 2: qty=15, designator="C2", mpn="CAP-100U"
  → Merged: qty=25, designator="C1, C2", mpn="CAP-100U"
  ```
- Action: Deduplicate by MPN

**Rule 8: Auto-PCB from Gerber**
- If no PCB row in BOM, search for Gerber files (same dir, parent dir, sibling dirs)
- Extract PCB name from folder/file name
- Example: File named `TL265-5040_Gerber.zip` → Auto-create PCB row with name "TL265-5040"
- Action: No missing PCBs

**Rule 9: Sort**
- Sort by: Quantity (descending), then first designator (ascending, natural sort)
- PCB always pinned at top (after headers)
- Action: Consistent output order

### Additional Filters

**Section Header Filter**
- Some BOMs have section headers like "M CODES SUMMARY" or "COMPONENT TOTAL"
- Pattern: Designator contains spaces but no digits (e.g., "M CODES SUMMARY")
- Action: Skip these rows

**CPC Fallback**
- If no CPC (Customer Part Code) column or value is blank:
- Use MPN as CPC
- Action: CPC column always populated

**Not Mounted Filter**
- Some customers (Exonetik) have a "Mounted" column with values like "N.M." or "NOT MOUNTED"
- Action: Skip these rows if mount_filter_col is configured

### Column Auto-Detection

The parser scans headers (or guesses which row is headers) and maps columns:

```javascript
// Customer sends: "Qty" | "Part Number" | "Component" | "Reference"
// Parser recognizes:
//   "Qty" → qty
//   "Part Number" → mpn
//   "Component" → description
//   "Reference" → designator
```

It tries three strategies:
1. **Exact match:** Column name = known keyword
2. **Contains match:** Known keyword appears in column name
3. **Guess:** Most likely based on position and content type

If the customer's BOM config specifies forced columns, it uses those instead of guessing.

---

## PART 5: The Pricing Engine — How Quotes Get Numbers

The quote formula is simple but multi-layered:

```
Per-Tier Quote = (Component Cost) + (PCB Cost) + (Assembly Cost) + (NRE) + (Shipping)

Where:

Component Cost = Σ [ unit_price × order_qty × (1 + component_markup%) ]
  order_qty = (qty_per_board × board_qty) + overage

PCB Cost = pcb_unit_price × board_qty × (1 + pcb_markup%)

Assembly Cost = (SMT_placements × $0.35) + (TH_placements × $0.75) + (MANSMT × special_rate) × board_qty
  SMT_placements = Σ qty for all components with m_code IN (CP, CPEXP, 0402, 0201, IP)
  TH_placements = Σ qty for all components with m_code = TH
  MANSMT placements = Σ qty for all components with m_code = MANSMT

NRE = stencil_cost + programming_cost + setup_cost  (first-time boards only)

Shipping = flat_rate OR actual_carrier_quote

Per-Unit Price = Total / board_qty
```

**Example calculation (qty tier 2: 100 boards):**

BOM has:
- 50 × CP resistors @ $0.05 each
- 30 × 0402 capacitors @ $0.02 each
- 5 × IP microcontroller @ $2.00 each
- 2 × TH connectors @ $1.50 each
- 1 × PCB @ $2.50 each

Step 1: Apply overage
```
50 CP @ qty_threshold=60 → +35 = 85 total
30 × 0402 @ qty_threshold=30 → +60 = 90 total
5 IP @ qty_threshold=5 → +5 = 10 total
2 TH @ qty_threshold=2 → +2 = 4 total
1 PCB → no overage = 1 total
```

Step 2: Get component prices (DigiKey/Mouser/LCSC cached)
```
CP resistor: $0.05 cached
0402 cap: $0.02 cached
IC: $2.00 cached
TH connector: $1.50 cached
PCB: $2.50 cached (from WMD quote)
```

Step 3: Calculate component cost
```
(85 × $0.05) + (90 × $0.02) + (10 × $2.00) + (4 × $1.50) = $4.25 + $1.80 + $20.00 + $6.00 = $32.05 per board

Component subtotal for 100 boards = $32.05 × 100 = $3,205
Apply 20% component markup = $3,205 × 1.20 = $3,846
```

Step 4: Calculate PCB cost
```
PCB per board = $2.50 × 100 boards = $250
Apply 30% PCB markup = $250 × 1.30 = $325
```

Step 5: Calculate assembly cost
```
SMT placements = 50 + 30 = 80 per board
TH placements = 2 per board
MANSMT placements = 0

Assembly per board = (80 × $0.35) + (2 × $0.75) + (0 × rate) = $28 + $1.50 = $29.50
Assembly total = $29.50 × 100 = $2,950
```

Step 6: Add NRE (first time only)
```
Stencil (WMD) = $150
Setup/programming = $200
NRE Total = $350 (only on first board qty, not on subsequent tiers)
```

Step 7: Add shipping
```
Shipping = $200 (flat rate) or actual quote from carrier
```

Step 8: Calculate total and per-unit
```
Subtotal = $3,846 + $325 + $2,950 + $350 + $200 = $7,671
Total = $7,671 (no additional tax at quote stage)
Per-Unit = $7,671 / 100 = $76.71
```

### Why 4 Quantity Tiers?

RS quotes 4 tiers because customer decision-making works this way:

Customer sees:
```
Qty 50:  $80 per board
Qty 100: $60 per board (33% cheaper)
Qty 250: $45 per board (44% cheaper)
Qty 500: $38 per board (52% cheaper)
```

Customer decides: "If I order 250, I save $35 per board. That's $8,750 for 250 units. I'll take that deal."

The 4 tiers are:
1. **QTY_1** — Small prototype (50-100 units)
2. **QTY_2** — Medium production (100-250 units)
3. **QTY_3** — Full production (250-500 units)
4. **QTY_4** — High-volume (500+ units)

Each tier has:
- Different component supplier pricing (DigiKey has volume breaks)
- Different assembly rates (high-volume runs cheaper per unit)
- Different NRE amortization (NRE only on tier 1, split across all tiers)

### The Merge-Split Pattern for Pricing

When multiple boards go into one quote batch:

**Before merge-split (per-board):**
```
Board A:
  - 87 unique components
  - API calls: 87 calls to DigiKey, 87 to Mouser, 87 to LCSC
  - Time: 90 seconds

Board B:
  - 93 unique components
  - API calls: 93 + 93 + 93
  - Time: 95 seconds

Total: 180 component API calls, 3 minutes
```

**With merge-split (merged):**
```
Batch (A + B):
  - 120 unique components (some overlap)
  - API calls: 120 to DigiKey, 120 to Mouser, 120 to LCSC (all in parallel)
  - Time: 30 seconds

→ 60 fewer API calls
→ 90% faster
→ Single API bill for bulk pricing (cheaper per component)
```

---

## PART 6: The Procurement System — How Materials Get Ordered

Once a quote is accepted and a job created, Piyush generates a procurement order.

### Proc Batch Code Format

Format: `YYMMDD CUSTOMER-TYPE###`

Example: `260408 TLAN-TB001`

Breaking it down:
- `260408` — Date (April 8, 2026)
- `TLAN` — Customer code (Lanka Circuits)
- `T` — Assembly type:
  - T = Turnkey (RS sources everything)
  - A = Assembly Only (customer provides components)
  - C = Consignment (customer provides PCB)
  - P = PCB Only
  - D = Components Only
  - M = PCB + Components
- `B` — Batch indicator:
  - B = Multiple boards (batched)
  - S = Single board
- `001` — Auto-incremented sequence number per customer

**Why human-readable?** Because this code is printed on a physical folder label on the shop floor. Hammad sees "260408 TLAN-TB001" on a box and knows:
- This is from Lanka
- It's a Turnkey batch with boards on both sides
- It's the 1st batch of the day from Lanka
- It arrived on April 8, 2026

### Procurement Line Population

When a procurement is created, lines are auto-populated from the BOM:

```javascript
bom_lines (from accepted job):
  [ { mpn: "CAP-100U", qty_needed: 50, m_code: "CP" },
    { mpn: "INDUCTOR-22U", qty_needed: 30, m_code: "IP" },
    ... ]

Procurement generation:
  1. Fetch BOM for this job
  2. For each line:
     a. Get m_code → look up overage table
     b. qty_extra = overage[m_code][qty_needed]
     c. Create procurement_line:
        { mpn, qty_needed, qty_extra, supplier: null, order_status: "pending" }
```

### Supplier Allocation

Piyush marks lines as "ordered". The system groups them by supplier (cheapest source):

```javascript
// For each unordered line in procurement:
//   1. Query api_pricing_cache for mpn
//   2. Find cheapest supplier
//   3. Set supplier field
//   4. Create supplier_po grouping lines by supplier

Example:
  Line 1: CAP-100U, qty=85, cheapest=DigiKey, price=0.05
  Line 2: RESISTOR-1K, qty=120, cheapest=Mouser, price=0.03
  Line 3: IC-STM32, qty=10, cheapest=DigiKey, price=2.00

Creates:
  supplier_po (DigiKey): [Line 1, Line 3]
  supplier_po (Mouser): [Line 2]
```

### Ordering → Receiving → Completion

**Step 1: Order**
- Click "Order All" in procurement detail
- For each pending line:
  - qty_ordered = qty_needed + qty_extra
  - order_status = "ordered"
- System groups by supplier and creates supplier_pos

**Step 2: Receiving**
- Materials arrive from suppliers
- Hammad (or Piyush) clicks "Receive" next to each line
- qty_received = updated
- order_status = "received"

**Step 3: Auto-Completion**
- When lines_received >= total_lines:
  - Procurement status = "fully_received"
  - Procurement status = "completed"

### BG Stock Deduction Timing (Critical Business Logic)

BG Stock = "Background Goods" — RS's own inventory of feeder parts from previous jobs.

**When is BG stock deducted?**

NOT when the job is created. NOT when the quote is accepted.

**WHEN THE PROCUREMENT IS GENERATED.**

Why? Because between job creation and procurement generation, another higher-priority job might need those same parts. We don't commit inventory until we're actually ordering.

```javascript
// Procurement generation flow:
for each line in procurement {
  if parts available in bg_stock:
    deduct from bg_stock
    mark line as is_bg=true
  else:
    order from supplier
}
```

---

## PART 7: The API Layer — How Frontend Talks to Backend

### Auth Pattern: Every Route Checks Auth

Every API route starts with:

```typescript
import { createServerClient } from "@supabase/ssr";

export async function GET(req: Request) {
  const supabase = createServerClient(...);
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  // User is authenticated. Check role:
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  
  if (profile.role === "shop_floor") {
    // Shop floor can't see invoice data
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  
  // Proceed with logic...
}
```

### Admin Client for Cross-Table Operations

Some operations need to bypass Row Level Security (RLS). The admin client uses the service role key:

```typescript
// Regular client (respects RLS)
const client = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Admin client (bypasses RLS, for system operations)
const admin = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // ← Has full access
);

// Example: Job creation crosses tables (jobs, quotes, boms, customers)
// Use admin to insert into jobs table without RLS filtering
await admin
  .from("jobs")
  .insert({ job_number, quote_id, customer_id, ... });
```

### PDF Generation (api/quotes/[id]/pdf)

PDFs are generated using `pdf-lib` (pure JavaScript, no native dependencies):

```typescript
import { PDFDocument } from "pdf-lib";

export async function GET(req: Request, { params }) {
  const quote = await getQuote(params.id);
  
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);  // 8.5" x 11"
  
  // Add header, customer info, pricing table, etc.
  page.drawText("RS PCB Assembly", { x: 50, y: 750 });
  page.drawText(`Quote ${quote.quote_number}`, { x: 50, y: 720 });
  // ... more drawing
  
  const pdfBytes = await pdfDoc.save();
  
  // Store in Supabase Storage
  await supabase.storage
    .from("quotes")
    .upload(`${quote.customer_id}/${quote.gmp_id}/${quote.quote_number}.pdf`, pdfBytes);
  
  return Response.json({ pdf_path: "quotes/.../quote.pdf" });
}
```

**Why pdf-lib instead of React PDF?** Because React PDF requires native dependencies that fail on Vercel serverless. pdf-lib is pure JavaScript and works everywhere.

### AI Chatbot (api/chat)

The chatbot has 22 tools integrated into Claude's function-calling system:

```typescript
export async function POST(req: Request) {
  const { message, conversation_id } = await req.json();
  
  const tools = [
    // Customer tools
    { name: "list_customers", description: "List all customers", ... },
    { name: "get_customer", description: "Get customer detail", ... },
    
    // Quote tools
    { name: "list_quotes", description: "List quotes", ... },
    { name: "create_quote", description: "Create quote from BOM", ... },
    
    // Job tools
    { name: "list_jobs", description: "List jobs with status", ... },
    { name: "update_job_status", description: "Move job to next status", ... },
    
    // Procurement tools
    { name: "get_procurement", description: "Get PROC detail", ... },
    { name: "create_supplier_po", description: "Create PO for supplier", ... },
    
    // ... 14 more
  ];
  
  // Call Claude with tools
  const response = await anthropic.messages.create({
    model: "claude-opus-4-1",
    max_tokens: 2048,
    tools: tools,
    messages: [
      { role: "user", content: message }
    ]
  });
  
  // Handle tool calls
  if (response.content[0].type === "tool_use") {
    const toolName = response.content[0].name;
    const toolInput = response.content[0].input;
    
    const result = await executeTool(toolName, toolInput);
    
    // Return result to Claude, Claude responds with answer
  }
  
  return Response.json({ answer: response.content[0].text });
}
```

---

## PART 8: The Frontend — How Pages Render

### Next.js App Router: Server Components vs Client Components

**Server Component (default):**
```typescript
// app/(dashboard)/quotes/page.tsx
import { getQuotes } from "@/lib/supabase/server";

export default async function QuotesPage() {
  const quotes = await getQuotes();  // Runs on server, no JavaScript sent to browser
  
  return (
    <div>
      {quotes.map(q => (
        <div key={q.id}>{q.quote_number}</div>
      ))}
    </div>
  );
}
```

Server components:
- Have access to database directly (no API call overhead)
- Can't use hooks (useState, useEffect)
- Great for data-heavy pages (list view, detail view)

**Client Component:**
```typescript
// app/(dashboard)/quotes/new/page.tsx
"use client";  // ← Makes this a client component

import { useState } from "react";
import { createQuote } from "@/app/api/quotes/route";

export default function NewQuotePage() {
  const [quantities, setQuantities] = useState({ qty_1: 50, qty_2: 100, qty_3: 250, qty_4: 500 });
  const [loading, setLoading] = useState(false);
  
  async function handleSubmit() {
    setLoading(true);
    const result = await createQuote({ bom_id, quantities });
    setLoading(false);
  }
  
  return (
    <form onSubmit={handleSubmit}>
      <input onChange={e => setQuantities({...quantities, qty_1: e.target.value})} />
      <button disabled={loading}>{loading ? "Creating..." : "Create Quote"}</button>
    </form>
  );
}
```

Client components:
- Must use "use client" directive
- Have access to hooks and interactivity
- Required for forms, buttons, real-time updates

### Sidebar Navigation

Sidebar is rendered once per session (shared across all pages):

```typescript
// app/(dashboard)/layout.tsx
import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({ children }) {
  const user = await getUser();
  
  return (
    <div className="flex">
      <Sidebar user={user} />  {/* Rendered once, persists across page changes */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

Sidebar shows menu items based on role:
- **CEO (Anas)**: All items (Dashboard, Customers, BOMs, Quotes, Jobs, Procurement, Production, Invoices, Settings, Reports)
- **Operations Manager (Piyush)**: All except Invoices
- **Shop Floor (Hammad)**: Only Production, Jobs (active only)

### shadcn/ui Components

All UI components come from shadcn:

```typescript
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function QuoteTable({ quotes }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Quote Number</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {quotes.map(q => (
          <TableRow key={q.id}>
            <TableCell>{q.quote_number}</TableCell>
            <TableCell>
              <Badge variant={q.status === "sent" ? "success" : "default"}>
                {q.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

### Dark Mode Implementation

Dark mode is global context:

```typescript
// lib/dark-mode-context.ts
"use client";

import { createContext, useState } from "react";

export const DarkModeContext = createContext();

export function DarkModeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);
  
  return (
    <DarkModeContext.Provider value={{ isDark, setIsDark }}>
      <div className={isDark ? "dark" : "light"}>
        {children}
      </div>
    </DarkModeContext.Provider>
  );
}
```

Tailwind detects `.dark` class on root and applies dark styles.

---

## PART 9: Deployment & Config

### Vercel Deployment

The web app is auto-deployed from GitHub:

1. Push to `main` branch
2. Vercel detects change
3. Runs `npm run build`
4. Runs `npm run test` (if configured)
5. Deploys to edge servers
6. Live at https://webapp-fawn-seven.vercel.app

### Supabase Setup

Project: `dypkautohnduuttaujzp` (PostgreSQL 17, us-west-2)

**Tables:** 27 tables covering customers, GMPs, BOMs, quotes, jobs, procurement, production, invoices, quality, inventory, chat

**Storage Buckets:** boms, gerbers, quotes, jobs, invoices, procurement

**Auth:** Email/password with 3 users:
- anas@rspcbassembly.com → ceo
- piyush@rspcbassembly.com → operations_manager
- hammad@rspcbassembly.com → shop_floor

**Realtime:** Enabled for production_events table (shop floor → CEO visibility)

### Required Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://dypkautohnduuttaujzp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from dashboard>
SUPABASE_SERVICE_ROLE_KEY=<from dashboard>

# Component Pricing APIs
DIGIKEY_CLIENT_ID=<from developer.digikey.com>
DIGIKEY_CLIENT_SECRET=<secret>
MOUSER_API_KEY=<from mouser.com/api-hub>
LCSC_API_KEY=<from lcsc.com>

# Claude AI (for M-code classification fallback)
ANTHROPIC_API_KEY=<from console.anthropic.com>

# Vercel (optional, auto-detected)
VERCEL_ENV=production
```

---

## PART 10: What's Not Built Yet

These features are in the spec but not yet implemented. They're post-MVP or require design input from Anas:

1. **Labour Costing (TIME file)** — Currently hardcoded rates. Need to build the full TIME file equivalent with per-job time tracking.

2. **Production Scheduling** — Show weekly/monthly production calendar with capacity planning. Currently just a status log.

3. **Procurement Merge-Split Cycle 2** — Second cycle where multiple procurements can be merged and split again for multi-batch ordering.

4. **Email Integration** — Auto-send quotes, invoices, POs. Currently manual copy-paste.

5. **QC Verification** — Integration with PROC Verification file for part validation.

6. **Customer Portal** — Customers log in to see their own quotes, jobs, invoices.

7. **Payment Gateway Integration** — Stripe/PayPal for online payment.

8. **Barcode Scanning** — For production floor material tracking.

9. **Mobile Responsiveness** — UI works on phones/tablets (currently desktop-optimized).

10. **Analytics Dashboard** — Revenue, margin, capacity utilization, customer profitability trends.

---

## PART 11: Architecture Decisions & Why We Made Them

### 1. Why Supabase, Not a Custom Backend?

**The traditional way:** Build a backend in Node.js/Python with Express/FastAPI, manage a separate database, authentication, storage. Months of infrastructure work.

**The Supabase way:** PostgreSQL + Auth + Storage + Realtime all provisioned instantly. We focus on business logic, not DevOps.

**Cost:** Supabase free tier covers us for 100+ jobs/month. Anas only pays when we scale past free tier.

### 2. Why Next.js App Router?

**File-based routing:** `/quotes` → `app/quotes/page.tsx`, `/jobs/[id]` → `app/jobs/[id]/page.tsx`. Intuitive and self-documenting.

**Server components:** Can fetch directly from database without API overhead. Quotes page loads instantly because it queries Supabase on the server.

**API routes:** `/api/bom/parse`, `/api/quotes` live in same folder structure. Easy to find.

**Vercel deployment:** Next.js and Vercel are made by same company. One-click deploy, environment variables pre-configured, Edge Functions available.

### 3. Why JSONB for Flexible Data?

**quotes.pricing** is JSONB because:
- Each tier (qty_1, qty_2, qty_3, qty_4) has the same structure
- A customer might negotiate 3 tiers, another might want 5 tiers
- Schema flexibility without migrations

**customers.bom_config** is JSONB because:
- Lanka's config is different from RTINGS's config is different from Legend Power's
- We add new customers monthly with new formats
- Storing these as separate columns would require a column per customer

**supplier_pos.lines** is JSONB because:
- Supplier PO lines have variable fields
- Some suppliers give us availability, others don't
- Easier to store full API response as JSONB than parse and normalize

**Key principle:** Use relational tables for stable structure, JSONB for variable structure.

### 4. Why 4 Layers for M-Code Classification?

This is an interesting one. We could just use Claude AI for everything:

```typescript
// Option 1: AI only (bad)
m_code = await claude.classify(mpn, description);
```

But that's slow (1-2 sec per component) and expensive ($0.001 per component).

Instead, we're strategic:
- **Layer 1 (DB):** 4,026 cached components → instant, free
- **Layer 2 (Keywords):** 230 patterns → 10ms, free
- **Layer 3 (Rules):** 48 PAR rules → 50ms, free
- **Layer 4 (AI):** Only for the 1-5% that don't match → slow but rare

For a typical BOM with 120 components:
- 110 components caught by Layer 1/2/3 (free, instant)
- 10 components needing Layer 4 (AI) → 10 sec total, $0.01 cost

Vs. naive AI-only: 120 sec total, $0.12 cost, 12x slower.

### 5. Why BG Stock Deduction Happens at Procurement, Not at Job Creation

This is a business decision hidden in technical design.

If we deducted BG stock when the job is created:
- Job 1 created: order 50 capacitors → deduct 50 from BG stock
- Job 2 comes in (higher priority): needs same capacitor
- Job 2 gets none because Job 1 already reserved them
- Job 2 has to wait or find alternative part

But jobs can get deprioritized (customer changes timeline, production floor schedule shifts). Locking inventory too early causes waste.

**Solution:** Deduct BG stock only when procurement is generated (we're ACTUALLY going to use them).

Between job creation and procurement generation (might be hours or days), inventory is free to be used elsewhere.

### 6. Why PDF-lib Instead of React PDF

React PDF (`@react-pdf/renderer`) is beautiful but requires native dependencies. On Vercel serverless:
- Build works locally
- Build fails on Vercel (missing native libs)
- Developers pull hair out

pdf-lib is pure JavaScript. Works everywhere. Slightly more verbose to write PDFs, but:
- Works on Vercel
- Works offline
- No build-time surprises

### 7. Why "Merge-Split" Is First-Class

Some AI assistants tried to build this by just creating independent quotes:

```typescript
// Bad: Independent quotes
Quote 1 from BOM 1 (50 units)
Quote 2 from BOM 2 (75 units)
```

But that misses the entire business logic. RS saves money by:
1. **Merging:** "Let me buy components for both boards together" → 1 API call, bulk pricing
2. **Splitting:** "But I need separate quotes to send to customers" → two PDF files

This is not a user interface feature. It's core business logic.

That's why we have explicit tables:
- `quote_batches` — The merge
- `quote_batch_boms` — Which BOMs in the merge
- `quote_batch_lines` — Deduplicated components
- `quote_batch_log` — Immutable history

Same pattern will be used for procurement batches (second cycle).

### 8. Why Piyush's Eyes See Everything

From BUILD_PROMPT.md:

> Every step that currently shows Piyush data on screen must continue to show him data on screen. No black boxes.

This is a hard requirement. When the web app runs "assign M-codes" or "calculate extras" or "call API for pricing", Piyush must be able to SEE the data before it's committed.

Not a spinner. Not a "Processing..." message. Data on screen. He validates with his eyes, his years of experience. Only then does he click "Proceed."

This is why every API step returns data for preview before it's saved:

```typescript
// Assign M-codes, show Piyush the list with reasoning
POST /api/quote-batches/[id]/assign-mcodes
  → Returns: [{ mpn, assigned_m_code, source, reasoning, confidence }]
  → Piyush sees table
  → Piyush can click to override
  → Then clicks "Save"
```

Not: "Processing M-codes... Done" with data already saved.

---

## PART 12: Key Formulas & Reference Tables

### Overage Table (Simplified)

| M-Code | 1-59 units | 60-99 | 100-199 | 200-299 | 300-499 | 500+ |
|--------|-----------|-------|---------|---------|---------|------|
| 0201   | 50        | 60    | 70      | 80      | 100     | 120  |
| 0402   | 50        | 60    | 70      | 80      | 100     | 120  |
| CP     | 10        | 30    | 35      | 40      | 50      | 60   |
| CPEXP  | 20        | 40    | 50      | 60      | 80      | 100  |
| IP     | 5         | 5     | 10      | 15      | 20      | 20   |
| TH     | 1         | 1     | 2       | 5       | 5       | 20   |
| MANSMT | 10        | 20    | 30      | 40      | 50      | 60   |

### Assembly Cost Formula

```
Assembly Cost = 
  (# SMT Placements × $0.35) +
  (# TH Placements × $0.75) +
  (# MANSMT Placements × $special_rate)

Where:
  SMT Placements = Σ qty for all components with m_code IN (CP, CPEXP, 0402, 0201, IP)
  TH Placements = Σ qty for all components with m_code = TH
  MANSMT Placements = Σ qty for all components with m_code = MANSMT

Example (100 boards):
  BOM has: 50 CP + 30 0402 + 2 TH per board
  SMT placements per board = 50 + 30 = 80
  TH placements per board = 2
  
  Cost per board = (80 × $0.35) + (2 × $0.75) = $28 + $1.50 = $29.50
  Cost for 100 boards = $29.50 × 100 = $2,950
```

### Proc Batch Code Decoding

**Example:** `260408 TLAN-TB001`

| Part | Value | Meaning |
|------|-------|---------|
| Date | 260408 | April 8, 2026 |
| Customer | TLAN | Lanka Circuits |
| Assembly | T | Turnkey (we source everything) |
| Batch | B | Multiple boards batched |
| Sequence | 001 | 1st batch from Lanka today |

**Assembly Type Codes:**
- T = Turnkey (RS sources components + PCB)
- A = Assembly Only (customer provides components)
- C = Consignment (customer provides PCB)
- P = PCB Only
- D = Components Only
- M = PCB + Components (customer sources PCB separately)

---

## PART 13: Data Flow Walkthrough — A Complete Job

Let me walk you through one real job from start to finish:

### Monday, April 8, 2026 — 10:15 AM

**Input:** Email from Lanka Circuits
```
Hi Anas,

We need 100 units of our TL265-5040 board. 
Attached: BOM in our standard format.

Thanks,
Luis
```

**What happens in the system:**

### Step 1: Setup (Anas, 10 mins)

Anas logs in to the web app:
1. `/customers` → clicks "Lanka"
2. In Lanka's detail page → `/gmp-number/TL265-5040` → clicks "Add Board"
3. Fills: GMP Number = TL265-5040, Board Name = "Power Supply Control", Revision = "1"
4. Saves → GMP created in database

Anas uploads BOM:
1. Clicks "Upload BOM" on the GMP
2. Drags BOM file from email → Vercel file upload
3. System detects customer = Lanka → uses Lanka's `bom_config`
4. Status: "uploaded" → background job parses file
5. 30 seconds later: status = "parsed", 127 components detected

### Step 2: Classification (Piyush, 5 mins)

Piyush logs in:
1. `/bom/[id]` → sees parsed BOM table
2. Clicks "Classify" button
3. System runs 4-layer classification:
   - Layer 1: 95 components caught by database (4,026 components table)
   - Layer 2: 20 components caught by keyword lookup (230 keywords)
   - Layer 3: 10 components caught by PAR rules
   - Layer 4: 2 components need Claude AI (10 sec wait)
4. System returns M-codes with reasoning:
   ```
   GRM155R71A106KA01L (Murata capacitor) → CP
   Source: Database match (95% confidence)
   Reasoning: "Previous Lanka BOM, same component, confirmed CP"
   ```

Piyush reviews table, sees all M-codes:
1. Scans for yellow/red confidence scores (there are none)
2. Clicks "Approve" → M-codes saved to bom_lines

### Step 3: Quote Generation (Piyush, 8 mins)

Piyush:
1. Goes to `/quotes/new`
2. Selects BOM: Lanka TL265-5040
3. Enters 4 quantity tiers:
   - QTY_1: 50 units
   - QTY_2: 100 units
   - QTY_3: 250 units
   - QTY_4: 500 units
4. Clicks "Calculate Pricing"

System:
1. Fetches bom_lines with M-codes
2. Calculates overage for each tier:
   - QTY_1 (50): CP gets +10 = 60, 0402 gets +50 = 100, etc.
   - QTY_2 (100): CP gets +35 = 135, 0402 gets +70 = 170, etc.
3. Calls DigiKey/Mouser/LCSC APIs in parallel (50 unique components)
   - Cache hits: 40 components (cached from previous Lanka quotes)
   - Cache misses: 10 components (fetched fresh)
   - Time: 30 seconds
4. Calculates 4 tiers:
   ```
   QTY_1 (50 boards):
     Components: (60×$0.05) + (100×$0.02) + ... = $45.00 per board
     Component subtotal: $2,250 × 1.20 markup = $2,700
     PCB: 50 × $2.50 × 1.30 = $325
     Assembly: (90 placements × $0.35) + (2 TH × $0.75) × 50 = $1,707.50
     NRE (first time): $350
     Subtotal: $2,700 + $325 + $1,707.50 + $350 = $5,082.50
     Per-unit: $5,082.50 / 50 = $101.65
   
   QTY_2 (100 boards):
     [Similar calculation...]
     Per-unit: $76.21
   
   QTY_3 (250 boards):
     Per-unit: $54.75
   
   QTY_4 (500 boards):
     Per-unit: $42.30
   ```
5. Returns pricing + missing components list (if any)

Piyush sees:
```
Quote Preview for Lanka TL265-5040
QTY_1 (50):   $101.65/unit = $5,082.50 total
QTY_2 (100):  $76.21/unit = $7,621.00 total
QTY_3 (250):  $54.75/unit = $13,687.50 total
QTY_4 (500):  $42.30/unit = $21,150.00 total

All components priced ✓
Ready to send to customer.
```

Piyush clicks "Create Quote" → Quote saved as draft

### Step 4: Review & Approval (Anas, 5 mins)

Anas logs in:
1. `/quotes` → sees new draft quote for Lanka
2. Clicks quote → sees PDF preview
3. Reviews numbers (mentally checking: PCB cost $2.50, looks right; SMT rates $0.35, correct; component prices reasonable)
4. Decides: these numbers are good to present to customer
5. Clicks "Send to Customer" → quote status = "sent", email drafted
6. Anas edits email body and clicks "Send"

### Step 5: Customer Accepts (Ceylon Inc, later Monday)

Luis Esqueda opens email, sees quote, reviews numbers.

Sees:
```
100 units @ $76.21 each = $7,621.00

They're willing to pay. Forwards PO to Anas:
PO-12345, 100 units, delivery 2026-04-30
```

### Step 6: Job Creation (Anas, 2 mins)

Anas:
1. Received PO email
2. Goes to quote page → clicks "Accept Quote"
3. Selects quantity tier: QTY_2 (100 units)
4. Fills: PO Number = "PO-12345", Delivery Date = "2026-04-30"
5. Clicks "Create Job"

System:
1. Creates job record:
   ```
   job_number: JB-2604-TLAN-001 (auto-generated)
   quote_id: (links to quote)
   customer_id, gmp_id, bom_id: all linked
   status: "created"
   quantity: 100
   po_number: "PO-12345"
   ```
2. Inserts first job_status_log: created → created
3. Returns job detail page

### Step 7: Procurement Generation (Piyush, 10 mins)

Piyush:
1. Goes to job detail page
2. Sees job status = "created"
3. Clicks "Create Procurement"

System:
1. Generates proc_code: `260408 TLAN-TB001` (April 8, Turnkey, Batch, 001)
2. Populates procurement_lines from bom_lines + overage:
   ```
   Component 1: GRM155R71A106KA01L, qty_needed=100, m_code=CP, overage=35
   Component 2: ... qty_needed=80, m_code=0402, overage=70
   ... all 127 components
   ```
3. **Deducts BG stock:**
   ```
   For each component:
     If qty available in bg_stock >= qty_needed:
       Deduct from bg_stock
       Mark line as is_bg=true
     Else:
       Will order from supplier
   ```
   Example: GRM155R71A106KA01L has 150 in stock → deduct 100, mark is_bg=true
4. Allocation (auto-group by cheapest supplier):
   ```
   Lines 1-40: supplier="DigiKey" (cheapest for 40 components)
   Lines 41-80: supplier="Mouser" (cheapest for 40 components)
   Lines 81-127: supplier="LCSC" (cheapest for 47 components)
   ```
5. Creates procurement record with status="draft"

Piyush sees procurement detail page:
- Proc code: 260408 TLAN-TB001
- 127 lines, all pending
- "Order All" button ready

### Step 8: Ordering (Piyush, 15 mins)

Piyush:
1. Reviews procurement lines (verifies quantities make sense)
2. Clicks "Order All"

System:
1. For each pending line:
   ```
   qty_ordered = qty_needed + qty_extra
   order_status = "ordered"
   
   Example line:
     Before: qty_needed=100, qty_extra=35, qty_ordered=0, order_status="pending"
     After: qty_ordered=135, order_status="ordered"
   ```
2. Groups lines by supplier
3. Creates supplier_pos:
   ```
   PO 1 (DigiKey):
     - 40 component lines
     - total_amount: $1,245.67
     - status: "draft"
   
   PO 2 (Mouser):
     - 40 component lines
     - total_amount: $892.34
     - status: "draft"
   
   PO 3 (LCSC):
     - 47 component lines
     - total_amount: $156.78
     - status: "draft"
   ```
4. Updates procurement status: "draft" → "ordering"

Piyush:
1. Sees 3 supplier POs created
2. Clicks each one, reviews, sends to suppliers (via email or supplier portal)
3. Updates status to "sent" for each PO

### Step 9: Materials Arrive (Hammad, April 9-12)

Boxes arrive from DigiKey (April 9), Mouser (April 10), LCSC (April 11).

Hammad:
1. Logs in to production page
2. For each shipment received, clicks "Receive Materials"
   ```
   Procurement: 260408 TLAN-TB001
   Supplier: DigiKey
   Lines received: [mark 40 lines as received]
   ```
3. System updates:
   ```
   Line-by-line: order_status="received", qty_received=135
   Procurement: lines_received += 40
   ```
4. After all 3 suppliers received:
   ```
   lines_received == total_lines
   Procurement status: "fully_received" → "completed"
   ```

### Step 10: Production (Hammad, April 13-14)

Hammad starts production:
1. Loads PCB into stencil machine
2. Logs event: "stencil_print_start" → creates production_event
3. Prints stencil
4. Logs event: "stencil_print_end"
5. Programs SMT machine (CM602 for top side)
6. Logs event: "smt_top_start"
7. Runs pick-and-place, reflow
8. Logs event: "smt_top_end"
9. Flips board
10. Logs event: "smt_bottom_start"
11. Runs bottom SMT
12. Logs event: "smt_bottom_end"
13. Reflow oven
14. AOI (Automated Optical Inspection)
15. Logs event: "aoi_passed" (all boards passed)

**Realtime visibility:** Every time Hammad logs an event, Anas sees it on his production dashboard instantly (Supabase Realtime subscription).

### Step 11: Shipping (April 15)

Hammad:
1. Packs 100 boards
2. Prints label: "PO-12345, Lanka, TL265-5040, Qty 100"
3. Ships via UPS (tracking: 1Z123456789)
4. Logs event: "ready_to_ship"

Piyush (or Anas):
1. Goes to job detail
2. Fills shipping info: Carrier="UPS", Tracking="1Z123456789"
3. Clicks "Mark Shipped" → job status = "shipping"

### Step 12: Invoice (Anas, April 15)

Anas:
1. Job status = "shipping"
2. Clicks "Generate Invoice"

System:
1. Creates invoice from quote pricing:
   ```
   invoice_number: INV-2604-001 (auto-gen)
   job_id: (link)
   customer_id: (link)
   subtotal: 100 units × $76.21 = $7,621.00
   tps_gst (5%): $381.05
   tvq_qst (9.975%): $761.68
   freight: $200 (flat rate or quote)
   total: $8,963.73
   
   status: "draft"
   issued_date: today
   due_date: today + 30 days
   ```
2. Generates PDF (invoicing format)
3. Stores PDF in Supabase Storage

Anas:
1. Reviews invoice
2. Clicks "Send to Customer"
3. Email drafted with PDF attached
4. Anas clicks "Send" → invoice status = "sent"

### Step 13: Payment (April 30)

Luis pays the invoice via bank transfer.

Anas:
1. Receives payment confirmation
2. Goes to invoice page
3. Clicks "Mark Paid"
4. Fills: Payment Date = today, Method = "Bank Transfer"
5. Invoice status = "paid"
6. System auto-updates job status = "invoiced"

**Job complete.**

---

## Summary: The Complete Picture

That's one job from start to finish. Every step is tracked in the database, visible in real-time on dashboards, and archived in audit logs.

**What would have taken Piyush 2 hours in Excel:**
- Parse BOM manually → 30 mins
- Assign M-codes manually → 40 mins
- Call APIs → 30 mins
- Calculate pricing → 20 mins

**Now takes 8 minutes total** (with pauses for human review, but parallelized).

And multiply that by 25 quotes/month = **42 hours saved/month = $3-4K capacity unlocked.**

That's the win. That's why this system matters.

---

## Final Notes for Abdul

**When something confuses you:**

1. **Check HANDOFF.md** — Session-by-session what's been built
2. **Check CLAUDE.md** — Full spec of all 27 tables, all 58 APIs
3. **Check BUILD_PROMPT.md** — Why we built it this way, not what
4. **Check the actual code** — Read `lib/pricing/engine.ts` to see pricing formula in code, `lib/mcode/classifier.ts` to see classification pipeline, etc.

**When you're building a feature:**

- Ask: "Does Piyush need to see the data?"
- Ask: "What happens if this fails partway through?"
- Ask: "Is this a human checkpoint or automatic?"

**The north star:** Quote turnaround from 2 hours to 15 minutes. Everything else is supporting that.

Welcome to RS PCB Assembly's ERP system. You've got this.

---

*This wiki will be updated as features are built and more context is needed. It represents the system as of April 2026.*
