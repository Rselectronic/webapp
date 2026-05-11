# ABDUL'S WIKI — RS PCB Assembly ERP: The Complete Tutorial

> **Read this if you have zero context about RS and the ERP system.**
> 
> This wiki explains EVERYTHING: what the business does, why it exists, how every piece connects, what each table/API does, and most importantly — WHY we built it this way.
>
> Think of this as sitting down with Anas and Piyush for 3 hours while they explain their entire business. You'll understand not just the code, but the real-world decisions behind every design choice.
>
> **Last updated: April 2026**

---

## ⚠️ Pre-Launch Cleanup Items

Before switching off the Excel workflow for good, sweep the open items below.
Each is a conscious split-decision that needs one approach picked and the
other deleted — not an actual bug.

### Global Part Search — streaming vs. batched fetch (added 2026-04-24)

`/api/parts/search` currently uses an NDJSON stream: the server fires all 12
distributor calls in parallel (`Promise.all`) and writes one
`{type:"supplier", result}` event per distributor as each resolves. Earlier
it used `Promise.allSettled` + a single JSON response.

Both approaches do the same amount of work and make the same API calls. The
streamed path just lets faster distributors (LCSC, Mouser) render before
slower ones (DigiKey, Arrow) instead of waiting for the whole batch.

**Decision to make at launch:**
- Keep streaming → better perceived responsiveness but more moving parts
  (server `ReadableStream`, client NDJSON reader loop, `"loading"`
  placeholder supplier status, `InFlightSupplierFooter` component,
  incremental state merge in `handleSubmit`).
- Revert to batched → simpler code path. Swap the stream for
  `Promise.allSettled` + `NextResponse.json`. Delete the `"loading"` status
  variant, the footer component, the stream reader, and the
  placeholder-seeding in `init` handler.

Anas + Piyush to field-test during the pilot phase and pick the one that
actually feels better in daily use. Remove the other.

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
  // Physical layout lives on `gmps.board_side` ('single' | 'double').
  // Billing model lives on `procurement_mode` ('turnkey' | 'consignment' |
  // 'assembly_only') on quotes + procurements. The legacy `assembly_type`
  // column was dropped in migration 091.
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

### Header Row + Last Row Controls (April 2026)

The upload page now shows **Header Row** and **Last Row to Process** inputs in the column mapper:

- **Header Row** — 1-indexed, auto-detected but user-overridable. Some BOMs have banner/title rows before the actual headers (e.g. Legend Power has headers at row 12, Signel at row 7). The user can adjust this if auto-detection picks the wrong row.
- **Last Row to Process** — 1-indexed, defaults to total rows. Lets the user exclude summary/total/notes rows at the bottom of the BOM.

When the header row changes, the column mapping dropdowns re-auto-detect from the new headers and the preview table updates. Both values are sent to the server as `header_row` and `last_row` in formData, where they take priority over bom_config and auto-detection.

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



## PART 14: EVERY PAGE, EVERY BUTTON — What Each Thing Does

This is your screen-by-screen walkthrough of the entire app. Every button, every table column, every card, every form field. If you see it on screen, it is described here. Think of this as Anas sitting next to you pointing at the screen saying \"that button does THIS.\"

---

### Dashboard (/)

The first thing you see after login. It has two tabs at the top: **Overview** and **Workflows**.

#### Overview Tab

**Primary KPI Cards (top row, 4 cards):**

| Card | What the number is | Where it comes from |
|---|---|---|
| **Active Customers** | Count of customers with `is_active = true` | `customers` table, filtered on `is_active` |
| **Open Quotes** | Count of quotes in draft, review, or sent status | `quotes` table, filtered on `status IN ('draft', 'review', 'sent')` |
| **Active Jobs** | Count of jobs NOT in delivered/invoiced/archived | `jobs` table, excluding terminal statuses |
| **Outstanding Invoices** | Dollar total of all sent + overdue invoices | `invoices` table, sum of `total` where `status IN ('sent', 'overdue')` |

**Secondary KPI Cards (second row, 3 cards):**

| Card | What it shows | Source |
|---|---|---|
| **Quotes This Month** | How many quotes were created this calendar month | `quotes` where `created_at >= start of month` |
| **Jobs in Production** | Jobs with `status = 'production'` | `jobs` table |
| **Overdue Invoices** | Count of invoices past their due date | `invoices` where `status = 'overdue'` |

**Recent Activity (bottom section):** A feed of the last 10 events across the system. It pulls the 5 most recent quotes, 5 most recent jobs, and 5 most recent invoices, merges them, and sorts by date. Each row shows:
- An icon (blue calculator = quote, purple briefcase = job, green document = invoice)
- The entity number (e.g. \"Quote QT-2604-001\")
- Customer code
- A colored status badge (gray=draft, yellow=review, blue=sent, green=accepted/paid, red=rejected/overdue, purple=production, orange=procurement)
- How long ago it happened (e.g. \"3h ago\", \"2d ago\")

#### Workflows Tab

Shows the last 5 active jobs (not archived) with a visual pipeline view. Each workflow row shows the customer code and GMP number, with connected dots representing the lifecycle stages: BOM uploaded, classified, quoted, job created, procurement, production, shipping, invoiced. Completed stages are filled, the current stage is highlighted, and future stages are grayed out. Clicking any completed stage dot navigates to that entity's page.

---

### BOMs (/bom)

The list of all uploaded Bill of Materials files.

**Header area:**
- Subtitle shows counts: \"X BOMs, Y parsed, Z pending\"
- **Upload BOM** button (top right) -- navigates to `/bom/upload`

**Table columns:**

| Column | What it shows |
|---|---|
| **File** | The uploaded filename (clickable -- links to `/bom/[id]` detail page) |
| **Customer** | Customer code + company name |
| **GMP** | The GMP number and board name (if set) |
| **Rev** | Revision number |
| **Components** | How many parsed component lines are in this BOM |
| **Status** | Badge showing: `parsed` (green), `error` (red), `uploaded`/`parsing` (gray) |
| **Uploaded** | Date and time the BOM was uploaded |

Clicking a BOM row's filename takes you to the BOM detail page.

If no BOMs exist, you see an empty state with a big \"Upload your first BOM\" button.

---

### BOM Upload (/bom/upload)

A single-column form to upload a new BOM file.

**Form fields:**

1. **Customer** -- Dropdown of all active customers. When you pick one, the app fetches that customer's existing GMP/board entries.
2. **GMP / Board** -- Either pick an existing GMP from the dropdown, or toggle to \"New GMP\" and type a new GMP number. If the GMP already exists, it creates a new revision under it.
3. **File** -- Drag-and-drop zone or click to browse. Accepts `.xlsx`, `.csv`, `.xls` files.
4. **BOM Name** -- Editable text field that defaults to the uploaded filename. Appears after a file is selected. Lets the user give the BOM a cleaner display name (e.g. "Lanka TL265 Rev 3" instead of "TL265-5001_BOM_2026-04-17_v3_FINAL.xlsx"). Stored in the `boms` table.
5. **Gerber Name** -- Optional text field for associating a Gerber file name with the BOM (e.g. "TL265-5001-000-T_Gerber"). Stored in the `boms` table.
6. **Gerber Revision** -- Optional text field for the Gerber revision (e.g. "V3", "Rev A"). Stored in the `boms` table.

These three fields (4-6) appear in a grouped card below the file drop zone after a file is selected. They are sent to the server as `bom_name`, `gerber_name`, and `gerber_revision` in formData.

**Upload BOM** button -- Sends the file to `/api/bom/parse`. The server:
- Creates the GMP if it is new
- Uploads the file to Supabase Storage
- Parses the BOM using the customer's `bom_config` (column mappings, header row, encoding)
- Applies the 9 CP/IP parsing rules (fiducial exclusion, PCB detection, DNI exclusion, MPN merge, etc.)
- Saves parsed lines to `bom_lines` table
- Redirects you to the BOM detail page

---

### BOM Detail (/bom/[id])

This is where you review a parsed BOM and classify components. It is one of the most important pages in the app.

**Navigation bar:**
- **All BOMs** button -- back to the BOM list
- **Upload New** button -- go to upload page

**Workflow Banner:** A horizontal strip showing the lifecycle pipeline with icons: Upload, Classify, Quote, Job, Procurement, Production, Shipping, Invoice. Each stage is a circle:
- Green filled circle with checkmark = completed (clickable, navigates to that entity)
- Blue highlighted circle = current page/step
- Gray circle = not yet reached
- If a quote already exists for this BOM, you will see a \"Next Step\" button suggesting creating a quote

**Header:** Shows the GMP number (large), board name, customer code, company name, filename, and revision. On the right: **Export BOM** button + status badge.

**Stats Cards (4 across):**

| Card | What it shows |
|---|---|
| **Components** | Total number of parsed component lines (`bom.component_count`) |
| **Classified** | How many lines have an M-Code assigned (from `parse_result.classification_summary.classified`) |
| **Need Review** | How many lines have NO M-Code (from `parse_result.classification_summary.unclassified`) -- shown in orange |
| **Merged Lines** | How many duplicate MPN rows got merged during parsing (from `parse_result.stats.merged`) |

**M-Code Distribution Chart:** A bar chart showing the breakdown of M-Codes across all non-PCB, non-DNI components. Each bar represents one M-Code (CP, IP, TH, 0402, etc.) with its count. Only appears after classification. Unclassified components show as a separate bar.

**Classify Button (two-step flow):**

This is the AI classification section. It only appears when there are unclassified components.

- **Step 1: \"Classify (X unclassified)\"** -- Runs rule-based classification. This hits `/api/bom/[id]/classify` with the 3-layer pipeline: database lookup first, then the 47 PAR rules. After it runs, you see a summary: \"Classified 42 of 55 using rules. 13 remaining.\"
- **Step 2: \"AI Classify remaining (X)\"** -- Only appears after rules run AND there are still unclassified components. This calls the API with `mode: \"ai-batch\"`, which sends the unclassified MPNs to DigiKey/Mouser for specs, then re-runs rules with enriched data. After it runs, you see: \"AI classified 10 of 13 -- 3 still need manual review.\"
- After AI classification, you can expand a \"Show AI classification details\" section that lists every component it tried, the assigned M-Code, and the confidence percentage.

**Export BOM Button:** Downloads the parsed BOM as an `.xlsx` file named \"CP IP BOM [GMP Number].xlsx\". This is the standardized 6-column format that Piyush uses -- the web app's equivalent of what cp_ip_v3.py used to produce.

**Component Table Columns:**

| Column | What it shows |
|---|---|
| **#** | Line number (or \"PCB\" for the PCB row) |
| **Qty** | Quantity per board |
| **Designator** | Reference designators (e.g. \"C1, C2, C10\") -- truncated with tooltip |
| **CPC** | Customer Part Code |
| **Description** | Component description -- truncated with tooltip |
| **MPN** | Manufacturer Part Number |
| **Manufacturer** | Manufacturer name |
| **M-Code** | The assigned M-Code -- this is a DROPDOWN you can click to change. Selecting a new value is an instant manual override that also saves to the components table (learning loop) |
| **Reasoning** | Shows HOW the M-Code was assigned, with two parts: |
| | - A colored label: **DB** (purple) = database lookup, **Rule** (cyan) = PAR rule matched, **AI** (orange) = API-enriched classification, **Manual** (green) = human override, **--** (gray) = unclassified |
| | - Short text explanation (e.g. \"R-12: package 0402\", \"KEYWORD: Through Hole\", \"Manual override\") |
| **Confidence** | A visual progress bar + percentage. Colors: green (90%+), yellow (70-89%), red (below 70%). Manual overrides always show 100%. |

**Row highlighting:**
- PCB row: blue background
- Unclassified components: orange tint background
- Normal classified: white background

**M-Code Dropdown:** When you click any M-Code cell, a dropdown appears with all 11 M-Code options (0201, 0402, CP, CPEXP, IP, TH, MANSMT, MEC, Accs, CABLE, DEV B). Selecting one immediately:
1. Updates `bom_lines` with `m_code_source = \"manual\"` and `m_code_confidence = 1.0`
2. Upserts into the `components` table so future BOMs with the same MPN auto-classify via Layer 1

**Revision History:** If multiple BOMs have been uploaded for the same GMP, a card at the bottom shows all revisions with filename, revision number, date, and status. The current one is labeled \"(current)\" in blue.

---

### Quotes (/quotes)

The list of all quotes.

**Header buttons:**
- **Batches** button -- navigates to `/quotes/batches` (the batch quoting workflow)
- **Export CSV** button -- downloads all quotes as CSV via `/api/export?table=quotes`
- **New Quote** button -- navigates to `/quotes/new`

**Status Filter Tabs:** A row of buttons: All, Draft, Review, Sent, Accepted, Rejected, Expired. Clicking one filters the table by that status via URL query param.

**Table columns:**

| Column | What it shows |
|---|---|
| **Quote #** | Quote number like \"QT-2604-001\" -- clickable, links to detail page |
| **Customer** | Customer code + company name |
| **GMP** | GMP number |
| **Quantities** | The quantity tiers, slash-separated (e.g. \"50 / 100 / 250 / 500\") |
| **Per Unit** | Per-unit price from the first tier (formatted as CAD currency) |
| **Status** | Colored badge: gray=draft, yellow=review, blue=sent, green=accepted, red=rejected, gray-outline=expired |
| **Created** | Date/time the quote was created |

---

### New Quote (/quotes/new)

A form to create a new quote from a parsed BOM.

**Form fields:**

1. **Customer** -- Dropdown of all active customers. When you pick one, the app fetches parsed BOMs for that customer.
2. **BOM** -- Dropdown showing parsed BOMs for the selected customer. Shows filename, GMP number, and revision.

**Board Details** (appears after BOM is selected):

A 4-column card with fields that affect assembly pricing and are stored on the quote:

| Field | Options | Default | What it controls |
|---|---|---|---|
| **Assembly Type** | TB (Double-sided Top+Bottom), TS (Single-sided Top only), CS (Consignment), AS (Assembly only) | TB | Determines which sides get SMT passes. TB = two passes, TS = one pass. CS and AS are special billing modes. |
| **Boards per Panel** | Number (min 1) | 1 | If the PCB fab delivers panelized boards (e.g. 4 boards per panel), this divides the total PCB cost appropriately. |
| **IPC Class** | 1 (General), 2 (Dedicated Service), 3 (High Reliability) | 2 | Higher class = stricter inspection/rework requirements = higher assembly cost. |
| **Solder Type** | Lead-Free (RoHS), Leaded | Lead-Free | Affects reflow profile and paste type. |

3. **Quantity Tiers** -- Starts with 4 inputs pre-filled (50, 100, 250, 500). Each tier row has:
   - A number input for the board quantity
   - A PCB Unit Price input (per bare PCB from the fabricator quote, e.g. from WMD or Candor)
   - A Lead Time text input (defaults to "4-6 weeks", "3-5 weeks", etc.)
   - An **X** button to remove that tier (cannot remove if only 1 left)
   - An **Add Tier** button (+ icon) below to add more tiers

**Markup Overrides** (inline below the tier table, right-aligned):

| Field | Default | What it does |
|---|---|---|
| **Component Markup (%)** | Empty (uses global default from Settings, currently 25%) | Overrides the global component markup for this specific quote. Leave empty to use the default. |
| **PCB Markup (%)** | Empty (uses global default from Settings, currently 25%) | Overrides the global PCB markup for this specific quote. Leave empty to use the default. |
| **Shipping ($)** | 200 | Flat shipping estimate. |

These overrides let Anas adjust margins per-quote without changing the global defaults. The placeholder text shows "default 25" as a hint. When empty, the pricing engine reads the global default from `app_settings`.

4. **NRE Charges** (separate card, quote-level):
   - **NRE Programming ($)** -- Auto-calculated from BOM line count when a BOM is selected. Can be overridden.
   - **NRE Stencil ($)** -- Defaults to $400.
   - **NRE PCB Fab ($)** -- Defaults to $0.
   NRE is charged once per quote regardless of quantity tier. The per-unit NRE contribution shrinks as quantity grows.

**Calculate Pricing** button -- Sends the BOM ID, quantities, PCB prices, NRE, shipping, board details, and any markup overrides to `/api/quotes/preview`. The pricing engine:
- Looks up each component's price from the `api_pricing_cache` (DigiKey/Mouser/LCSC)
- Calculates order quantities with M-Code-based overage
- Applies component markup (from override or global default)
- Applies PCB markup (from override or global default)
- Calculates assembly cost (placement count x rate per M-Code type)
- Adds PCB cost, NRE, and shipping
- Returns a per-tier breakdown

After calculating, a **Pricing Breakdown** table appears showing the results (see Pricing Table below).

**Save Quote as Draft** button -- Creates the quote in the database with status \"draft\" and redirects to the quote detail page.

---

### Quote Detail (/quotes/[id])

Full detail view of a single quote.

**Workflow Banner:** Same pipeline strip as the BOM page, but now \"Quote\" is highlighted. If a job has been created from this quote, the pipeline extends further.

**Header:** Quote number (monospace, large) + status badge. Below: customer code, company name, GMP number, board name.

**Action buttons (top right):**
- **Status transition button** -- Changes depending on current status:
  - Draft: \"Submit for Review\" (moves to review)
  - Review: \"Mark as Sent\" (moves to sent)
  - Sent: \"Mark as Accepted\" (moves to accepted)
  - Accepted: \"Create Job\" (creates a job from this quote and navigates to the job)
- **Download PDF** button -- Opens `/api/quotes/[id]/pdf` in a new tab, which generates a professional PDF quote matching RS's format

**Info Cards (6 cards, 2 rows of 3):**

| Card | What it shows |
|---|---|
| **BOM File** | The linked BOM filename and revision |
| **Quantities** | The quantity tiers slash-separated, plus how many tiers |
| **Expires** | Expiry date and validity period (e.g. \"May 15, 2026 -- 30 day validity\") |
| **NRE Charge** | NRE amount in CAD |
| **PCB Unit Price** | Per-unit PCB cost |
| **Component Markup** | The markup percentage applied to component costs (e.g. \"20%\") |

**Pricing Breakdown Table:** A table with one column per quantity tier. Rows show:
- **Components** -- total component cost (after markup). **Expandable:** click the chevron to reveal sub-rows showing cost before markup, markup percentage, and markup amount (in green).
- **PCB** -- total PCB cost (after markup). **Expandable:** same chevron pattern, shows cost before markup, markup percentage, and markup amount.
- Assembly cost (labelled "Assembly (Time-Based)" or "Assembly (Placements)" depending on model used)
- NRE charge
- Shipping
- **Total** (bold row)
- **Per Unit** (bold row)

The expandable markup sub-rows only appear when the pricing engine returns markup data (i.e. for quotes created after Session 14). Older quotes without `component_cost_before_markup` in the tier data will just show the flat rows without chevrons.

Below the table, per-unit price cards show each tier's per-unit price in a grid. If any tier has components with missing prices, a count appears in orange under the per-unit card.

If components are missing prices (no cached API price), a collapsible \"Missing price components\" section lists each MPN, description, and qty per board.

**Warnings:** If the pricing engine detected issues (e.g. \"X components had no price data -- using $0\"), they appear as yellow warning text.

**Customer Contact Card:** Shows the customer's contact name and email (clickable mailto link).

**Notes:** If any notes were added to the quote, they display here.

**Timestamps:** Bottom bar with created, updated, issued, and accepted dates.

---

### Quote Batches (/quotes/batches)

The batch quoting system -- processes multiple BOMs at once with cross-BOM component deduplication.

**Header:** \"Quote Batches\" title + **New Batch** button.

**Table columns:**

| Column | What it shows |
|---|---|
| **Batch Name** | Clickable name, links to batch detail |
| **Customer** | Customer code + company name |
| **BOMs** | Count of BOMs in this batch |
| **Qty Tiers** | The quantity tiers, slash-separated |
| **Status** | Colored badge: Created, Merged, M-Codes Assigned, Extras Calculated, Priced, Quotes Generated, Archived |
| **Created** | Date/time |

**New Batch (/quotes/batches/new):** Form to create a batch. Pick a customer, select parsed BOMs, name the batch.

**Batch Detail (/quotes/batches/[id]):** A step-by-step workflow component (`BatchWorkflow`) that walks through: merge lines across BOMs, assign M-codes, calculate extras/overage, run pricing, then generate individual quotes. Each step has action buttons.

---

### Jobs (/jobs)

**View toggle buttons (top right):**
- **Kanban** -- Shows jobs as cards in swim lanes by status (created, procurement, parts_ordered, parts_received, production, inspection, shipping, delivered, invoiced). Each card shows job number, customer code, GMP, quantity.
- **Table** -- Standard table view
- **Export CSV** button -- downloads jobs as CSV

**Table columns (in table view):**

| Column | What it shows |
|---|---|
| **Job #** | Job number like \"JB-2604-TLAN-001\" -- clickable, links to detail page |
| **Customer** | Customer code + company name |
| **GMP** | GMP number |
| **Qty** | Board quantity for this job |
| **Assembly** | Assembly type: TB (top+bottom), TS (top-side), CS (consignment), CB (customer board), AS (assembly-only) |
| **Status** | Colored badge showing current status |
| **Created** | Date |

Empty state says \"Jobs are created when a quote is accepted.\"

---

### Job Detail (/jobs/[id])

The central hub for a job's lifecycle.

**Workflow Banner:** Shows the full pipeline with the current stage highlighted (changes based on job status -- procurement, production, or shipping).

**Header:** Job number (monospace, large) + status badge. Customer info + GMP below.

**Action Buttons (top right):**
- **NCR** button -- Opens a dialog to create a Non-Conformance Report (quality issue) for this job
- **Job Actions** dropdown -- A single button that changes label based on status:
  - Created: \"Start Procurement\"
  - Procurement: \"Mark Parts Ordered\"
  - Parts Ordered: \"Mark Parts Received\"
  - Parts Received: \"Start Production\"
  - Production: \"Move to Inspection\"
  - Inspection: \"Ready to Ship\"
  - Shipping: \"Mark Delivered\"
  - Delivered: \"Mark Invoiced\"
- **Create Procurement** button -- Only visible when the job is in an eligible status (procurement through invoiced). Navigates to `/procurement/new?job_id=[id]`

**Info Cards (5 across):**

| Card | What it shows |
|---|---|
| **Quantity** | Board quantity |
| **Assembly Type** | TB/TS/CS/CB/AS code |
| **Quote** | Link to the source quote (clickable) |
| **Scheduled Start** | Date or \"Not set\" |
| **Scheduled Completion** | Date or \"Not set\" |

**PO Pricing Section:** Validates the customer's PO price against the quoted price. Shows whether the PO amount matches what was quoted for the ordered quantity tier.

**Shipping Section:** Appears when the job is in shipping/delivered/inspection/invoiced status. Contains:
- **Ship Date** input field
- **Courier Name** input field
- **Tracking ID** input field
- **Save Shipping Info** button -- Saves these fields to `jobs.metadata`
- **Packing Slip** button -- Generates and opens a packing slip PDF
- **Compliance Certificate** button -- Generates and opens a certificate of compliance PDF

**Status Timeline (left card):** A vertical timeline showing every status change the job has gone through, with timestamps and optional notes. Shows old status -> new status transitions.

**Production Events (right card):** A vertical timeline showing production floor events: \"Materials Received\", \"SMT Top Start\", \"Reflow End\", etc. Each shows the event type, timestamp, and who logged it.

**Production Documents (bottom card):** Four buttons to download production PDFs:
- **Job Card** (blue icon) -- A one-page summary card for the production floor: job number, customer, GMP, quantity, component count, assembly type
- **Production Traveller** (green icon) -- A multi-step checklist that travels with the boards through production, with checkboxes for each step
- **Print Copy BOM** (purple icon) -- The BOM formatted for the production floor, with M-Codes and quantities, designed to be printed and taped to the work area
- **Reception File** (orange icon) -- A checklist for receiving materials: each component line with qty needed, qty received columns for Hammad to fill in by hand

---

### Procurement (/procurement)

**Header:** \"Procurement\" title + **PCB & Stencil Orders** button (links to `/procurement/stencils`).

**Status Filter Tabs:** All, Draft, Ordering, Partial, Received, Completed.

**Table columns:**

| Column | What it shows |
|---|---|
| **Proc Code** | Like \"260403 TLAN-TB085\" (legacy format) -- clickable, links to detail page |
| **Job #** | Linked job number |
| **Customer** | Customer code + company name |
| **Lines** | \"X/Y received\" showing received count vs total lines |
| **Status** | Colored badge: Draft (gray), Ordering (blue), Partial (yellow), Received (green), Completed (emerald) |
| **Created** | Date/time |

---

### Procurement Detail (/procurement/[id])

**Workflow Banner:** Full pipeline with Procurement highlighted.

**Header:** Proc code (monospace, large) + status badge. Customer + GMP info. Link to the parent job.

**Action Buttons (top right):**
- **Mark All as Ordered** -- Sets every pending line to \"ordered\" status in one click. Only enabled when there are pending lines.
- **Create Supplier PO** -- Opens a dialog to generate a supplier purchase order. Groups lines by supplier, lets you select which lines to include.

**Summary Cards (4 across):**

| Card | What it shows |
|---|---|
| **Total Lines** | Total component lines in this procurement |
| **Ordered** | How many lines have been ordered (blue) |
| **Received** | How many lines have been fully received (green) |
| **Pending** | How many lines are still pending (gray) |

**Line Items Table:**

| Column | What it shows |
|---|---|
| **MPN** | Manufacturer Part Number (monospace) |
| **Description** | Truncated component description |
| **M-Code** | Badge showing the M-Code (e.g. \"CP\", \"IP\") |
| **Qty Needed** | How many the BOM requires (qty_per_board x board_qty) |
| **Extras** | Overage amount with \"+\" prefix (e.g. \"+30\") -- calculated by M-Code |
| **Order Qty** | Total order quantity (needed + extras), bold |
| **Received** | \"X/Y\" showing received count out of order qty |
| **Supplier** | Which supplier (DigiKey, Mouser, LCSC, etc.) |
| **Status** | Colored badge: Pending (gray), Ordered (blue), Received (green), Backordered (red) |
| **Action** | Context-sensitive button: |
| | - If Pending: **Order** button -- marks line as ordered |
| | - If Ordered and not fully received: **Receive** button -- marks line as received |

Rows that are fully received get a green-tinted background.

**Supplier POs Section:** Below the lines table, if any supplier POs have been generated, they show in a separate table with: PO Number, Supplier, Lines count, Total amount, Status, Created date, and a **PDF** button to download the PO PDF.

---

### PCB & Stencil Orders (/procurement/stencils)

Tracks orders placed with PCB fabricators (WMD, Candor, PCBWay) and stencil suppliers (Stentech).

**Header:** Back arrow to Procurement + **New Order** button + **Export CSV** button.

**KPI Cards:** PCB Orders count, Stencil Orders count, Pending count, Total Cost.

**Filters:** Two rows of filter buttons:
- Type: All Types, PCB, Stencil
- Status: All, Ordered, In Production, Shipped, Received

**Table columns:** Type (badge: PCB or Stencil), Job #, Customer, Supplier, Ref #, Qty, Total Cost, Ordered date, Expected date, Status (badge), Actions (status update dropdown).

---

### Create Procurement (/procurement/new)

A confirmation page for creating procurement from a job. Shows job details and explains what will happen:
- Component lines generated from BOM with M-code-based overage
- Best-price suppliers auto-assigned from cached pricing
- BG stock auto-deducted
- Job status advances to \"procurement\"

**Create Procurement** button -- Creates the procurement, generates all lines, and redirects to the procurement detail page. Shows a success message with proc code and line count.

---

### Customers (/customers)

**Header buttons:**
- **New Customer** button -- Opens a dialog to add a new customer (code, company name, contact info)
- **Export CSV** button -- Downloads all customers as CSV

**Search bar:** Instant client-side search — filters as you type across code, company name, contact, and email. No button, no page reload. Shows "X of Y" count while filtering.

**Status filter:** Active / Inactive / All toggle buttons — client-side, instant. No page reload. All customers fetched once from the server, filtered in the browser.

**Table columns:**

| Column | What it shows |
|---|---|
| **Code** | Short code like \"TLAN\", \"LABO\" -- clickable, links to detail page |
| **Company Name** | Full company name |
| **Contact** | Primary contact name |
| **Email** | Contact email |
| **Payment Terms** | e.g. \"Net 30\" |
| **Status** | Badge: Active (green) or Inactive (gray) |

---

### Customer Detail (/customers/[id])

Detailed view of a single customer with all their data.

**Edit Customer button:** A toggle at the top that switches the page between view mode and edit mode. In edit mode, the `CustomerEditToggle` component renders editable forms with tabs:

**Contacts Section:** Cards showing each contact person with:
- Name, role, email (clickable mailto), phone (formatted)
- \"Primary\" green badge for the primary contact
- In edit mode: Add/remove contacts, edit all fields

**Addresses Section (two columns):**
- **Billing Addresses** -- Each address shows label, street, city/province/postal, country. \"Default\" badge for default address.
- **Shipping Addresses** -- Same format.
- In edit mode: Add/remove addresses, toggle default.

**BOM Configuration:** Displays the `bom_config` JSONB as pretty-printed JSON. Shows the parsing rules for this customer:
- `header_row`: Which row has column headers (null = no header, auto-detect)
- `columns` or `columns_fixed`: Column name mappings (e.g. `{\"qty\": \"Quantity\", \"mpn\": \"Manufacturer Part Number\"}`)
- `format`: File format (xlsx, csv, xlsx_raw_xml)
- `encoding`: Character encoding (utf-8, utf-16)
- `separator`: For CSV files (tab, comma)
- `section_filter`: Whether to filter out section header rows
- `mount_filter_col`: Column for \"Not Mounted\" filtering
- `cpc_fallback`: Which field to use when CPC is blank

If no config is set, it says \"No BOM configuration set. Auto-detection will be used.\"

**Boards / GMPs Section:** Lists all board designs for this customer. Each GMP shows:
- GMP number (monospace, blue), board name, revision, active/inactive badge
- **Upload BOM** button per GMP -- navigates to `/bom/upload` pre-filled with this customer and GMP
- BOM files under each GMP, showing filename, revision, status badge (parsed/error), component count
- Clicking any BOM file navigates to its detail page
- **Add Board** button at the top to upload a BOM for a new board

**Notes:** Free-text notes about the customer.

**Order History:** Three tables showing the customer's recent activity:
- **Recent Quotes** -- Quote number (linked), GMP, status badge, date
- **Recent Jobs** -- Job number (linked), status badge, quantity, date
- **Recent Invoices** -- Invoice number (linked), status badge, total amount, date

---

### Invoices (/invoices)

**Header buttons:**
- **Create Invoice** button -- Opens a dialog to create an invoice. Pick a customer, then select one of their completed jobs. The invoice auto-populates pricing from the quote.
- **Payment History** button -- Navigates to `/invoices/payments`
- **Export CSV** button -- Downloads invoices as CSV

**Aging KPI Cards (4 across):**

| Card | What it shows | Color |
|---|---|---|
| **Total Outstanding** | Sum of all unpaid invoice totals | Default |
| **Current** | Amount that is not yet past due | Green |
| **30+ Days** | Amount past due by more than 30 days | Yellow |
| **60+ Days** | Amount past due by more than 60 days | Red |

**Status Filter Tabs:** All, Draft, Sent, Paid, Overdue.

**Table columns:**

| Column | What it shows |
|---|---|
| **Invoice #** | Like \"INV-2604-001\" -- clickable |
| **Customer** | Customer code + company name |
| **Job #** | Linked job number |
| **Total** | Invoice total in CAD |
| **Status** | Colored badge: draft (gray), sent (blue), paid (green), overdue (red) |
| **Issued** | Issue date |
| **Due** | Due date |
| **Days Outstanding** | Number of days since issue (red if overdue, green \"Paid\" if paid) |

Overdue invoice rows have a red-tinted background.

---

### Invoice Detail (/invoices/[id])

**Workflow Banner:** Full pipeline with Invoice highlighted.

**Header:** Invoice number + status badge. Customer and GMP info.

**Action Buttons:**
- **Mark as Sent** (if draft) -- Moves invoice to sent status
- **Record Payment** (if sent or overdue) -- Expands a payment form with date picker and payment method dropdown
- **Download PDF** -- Opens invoice PDF in new tab (RS letterhead, with GST/QST tax lines)

**Info Cards (4 across):** Job (linked), Issued Date, Due Date (red if overdue), Payment Terms.

**Pricing Breakdown:** A list of line items:
- Subtotal
- Discount (if any, shown in green with minus sign)
- TPS/GST (5%)
- TVQ/QST (9.975%)
- Freight (if any)
- **Total Due** (bold, large)

**Payments Section:** Shows all recorded payments for this invoice:
- Each payment shows amount (green), date, method badge (Cheque/Wire Transfer/EFT/Credit Card), reference number
- Running total: \"X of Y paid -- Z outstanding\"
- If the invoice is not fully paid, a **Record Payment** form appears with: amount, date picker, method dropdown (cheque/wire/EFT/credit_card), reference number, notes, and a Submit button

---

### Payment History (/invoices/payments)

A standalone page showing all payment records across all invoices.

**KPI Cards:** Total Received (all time), This Month, and the top 2 payment methods by amount.

**Table columns:** Invoice # (linked), Customer, Amount (green), Date, Method (badge), Reference #, Notes.

---

### Shipping (/shipping)

**Header:** **Create Shipment** button + **Export CSV** button.

**KPI Cards:** Pending, In Transit, Delivered, Total Shipping Cost.

**Filters:** Two rows:
- Status: All, Pending, Shipped, In Transit, Delivered
- Carrier: All, FedEx, Purolator, UPS, Canada Post, Other

**Table columns:** Job # (linked), Customer, Carrier (badge), Tracking #, Ship Date, Est. Delivery, Cost, Status (badge), Actions (status update dropdown).

---

### Production (/production)

Shows all jobs currently in production or inspection status.

**Header:** **Log Event** button -- navigates to `/production/log`.

**Table columns:** Job # (linked), Customer, GMP, Qty, Status (badge), Latest Event (blue badge showing the most recent production event type), Time (how long ago).

---

### Production Event Logger (/production/log)

This is Hammad's page. Designed for the shop floor -- simple and fast.

**Form:**
1. **Select Job** -- Dropdown of jobs in production/inspection status. Shows job number + customer code.
2. **Event Type Buttons** -- Grouped by production phase:
   - **Setup:** Materials Received, Setup Started
   - **SMT Top:** SMT Top Start, SMT Top End
   - **SMT Bottom:** SMT Bottom Start, SMT Bottom End
   - **Reflow:** Reflow Start, Reflow End
   - **AOI:** AOI Start, AOI Passed, AOI Failed
   - **Through Hole:** TH Start, TH End
   - **Final:** Touchup, Washing, Packing, Ready to Ship
3. **Notes** -- Optional text area for any comments.

Clicking an event button immediately logs it. A success message flashes. Recent events appear below in a feed showing job number, event type, timestamp, and who logged it.

---

### Quality / NCR (/quality)

Non-Conformance Report tracking for quality issues.

**KPI Cards:** Open (red), Investigating (yellow), Corrective Action (blue), Closed (green).

**Status Filter Tabs:** All, Open, Investigating, Corrective Action, Closed.

**Table columns:** NCR # (linked), Customer, Job #, Category (e.g. \"Solder defect / Cold joint\"), Severity (badge), Status (badge), Created date, Closed date.

---

### NCR Detail (/quality/[id])

**Header:** NCR number + status badge + severity badge. Customer and GMP info.

**Action Buttons:** `NCRActions` component -- advances status through the lifecycle (Open -> Investigating -> Corrective Action -> Closed).

**Info Cards:** Category/subcategory, linked Job (clickable), Created date, Closed date.

**Description Card:** The full description of the quality issue.

**CAAF Form (Corrective Action and Assessment Form):** Three text fields that can be edited:
- **Root Cause** -- What caused the defect
- **Corrective Action** -- What was done to fix it
- **Preventive Action** -- What will prevent it from happening again

---

### Inventory (/inventory)

BG (Background) feeder stock -- the common passives that sit on the SMT machine feeders permanently.

**KPI Cards:** Total Items, Healthy (green), Low Stock (yellow), Out of Stock (red).

**Table columns:** MPN, Description, M-Code (badge), Feeder (slot number), Qty (current quantity), Min (minimum threshold), Status (badge: OK/Low/Out).

Row highlighting: Out-of-stock rows have red background, low-stock rows have yellow background.

---

### Reports (/reports)

CEO-only page with business analytics. Redirects non-CEO users to the dashboard.

**Revenue Summary Cards (3 across):** Total Invoiced (Paid), Outstanding, Active Jobs.

**Jobs by Status:** A horizontal bar chart showing job counts per status. Each status gets a bar proportional to the maximum count.

**Top Customers:** Table showing the top 5 customers ranked by total paid invoice amount.

**Monthly Activity:** Table comparing this month vs last month for Quotes Created, Jobs Created, Invoices Created.

**Job Profitability:** Compares quoted totals vs actual costs for completed jobs.
- **Summary KPIs:** Total Quoted, Total Actual Cost, Total Margin (green if positive, red if negative), Avg Margin %
- **Per-job table:** Job #, Customer, Quoted Total, Actual Cost, Margin ($), Margin (%). Green/red colors indicate positive/negative margins.

---

### Settings (/settings)

A hub page with 6 cards linking to sub-pages:

| Card | Where it goes | Description |
|---|---|---|
| **Pricing Settings** | `/settings/pricing` | Markup rates, assembly costs, labour rates |
| **Customer BOM Configs** | `/settings/customers` | Per-customer BOM parsing settings |
| **M-Code Rules** | `/settings/m-codes` | The 47 PAR classification rules |
| **Component Database** | `/settings/components` | Master component library |
| **Email Templates** | `/settings/email-templates` | Reusable email templates |
| **Audit Log** | `/settings/audit` | System-wide change log |

---

### Pricing Settings (/settings/pricing)

CEO-only. A form with all the pricing variables that the quoting engine uses. Each field has a label, number input, and unit suffix.

| Field | What it controls | Default | Unit |
|---|---|---|---|
| **Component markup** | Markup applied to distributor component prices | 20 | % |
| **PCB markup** | Markup on bare PCB cost | 30 | % |
| **SMT cost / placement** | Cost per SMT pick-and-place operation | 0.35 | CAD |
| **TH cost / placement** | Cost per through-hole insertion | 0.75 | CAD |
| **Manual SMT cost / placement** | Cost per hand-soldered SMT component | -- | CAD |
| **Default NRE** | Default non-recurring engineering charge | 350 | CAD |
| **Default shipping** | Default flat shipping rate | 200 | CAD |
| **Quote validity** | How many days a quote is valid for | 30 | days |
| **Labour rate** | Hourly labour rate | -- | CAD/hr |

**Save Settings** button -- Saves to the `app_settings` table. Shows green \"Settings saved.\" confirmation.

---

### M-Code Rules (/settings/m-codes)

CEO-only. A read-only table showing all 47 PAR classification rules.

**Table columns:**

| Column | What it shows |
|---|---|
| **Rule ID** | Like \"PAR-01\", \"PAR-02\" through \"PAR-47\" |
| **Priority** | Execution order (1 = runs first) |
| **Layer** | Which classification layer: 1 (database), 2 (rules), 3 (API) |
| **Condition 1** | First matching condition (e.g. `mounting_type equals \"Through Hole\"`) |
| **Condition 2** | Optional second condition (e.g. `package contains \"QFP\"`) |
| **M-Code** | The M-Code assigned if this rule matches (blue badge) |
| **Description** | Human-readable explanation of what the rule does |
| **Active** | \"Yes\" (green) or \"No\" (red) |

---

### Component Database (/settings/components)

The master component library. Every MPN that has ever been classified gets stored here. This is Layer 1 of the classification pipeline -- the fastest lookup.

**Header:** **Add Component** button -- opens a dialog with fields for MPN (required), Manufacturer, Description, M-Code (dropdown), Source (dropdown: manual/database/rules/api).

**Stats Cards:** Total Components (overall count), then the top 3 M-Codes by count with percentages. Any remaining M-Codes show as small badges below.

**Search:** Text input to search by MPN. Type and press Enter or click Search. Clear button resets search.

**Table columns:**

| Column | What it shows |
|---|---|
| **MPN** | Manufacturer Part Number (monospace) |
| **M-Code** | Badge showing M-Code. **Clickable** -- clicking opens inline edit with a dropdown selector, confirm (checkmark) and cancel (X) buttons. Saving sets `m_code_source = \"manual\"` |
| **Source** | How the M-Code was assigned: manual, database, rules, or api |
| **Updated** | Last update date |
| **Actions** | Trash icon to delete the component (with confirmation dialog) |

**Pagination:** Bottom bar shows \"Showing X-Y of Z\". Controls:
- **Rows** dropdown: 50, 100, or 200 per page
- **Prev/Next** buttons with page number display

---

### Customer BOM Configs (/settings/customers)

CEO-only. Lists every customer with their BOM parsing configuration.

Each customer appears as a collapsible card showing customer code + company name. The `BomConfigEditor` component lets you:
- View the current BOM config as JSON
- Edit the JSON directly
- Save changes

The JSON fields control how the BOM parser handles that customer's files (see the BOM Configuration section in the Customer Detail page for what each field means).

---

### Email Templates (/settings/email-templates)

Manage reusable email templates for different purposes.

**Header:** Back to Settings button + **New Template** button.

**List View Table:**

| Column | What it shows |
|---|---|
| **Name** | Template name (clickable -- opens edit view) |
| **Subject** | Email subject line (truncated) |
| **Category** | Badge: Quote, Invoice, Shipping, Procurement, General |
| **Status** | Active (green) or Inactive (gray) |

**Create/Edit View:** A form (via `TemplateEditor` component) with fields for: Name, Subject, Category (dropdown), Body (text editor with variable placeholders), Active toggle.

---

### Audit Log (/settings/audit)

CEO-only. Shows the last 100 changes made across the system.

**Table columns:**

| Column | What it shows |
|---|---|
| **Time** | Timestamp of the change |
| **User** | Who made the change (full name), or \"System\" for automated changes |
| **Table** | Which database table was changed (monospace, e.g. \"quotes\", \"bom_lines\") |
| **Action** | Badge: insert (green), update (blue), delete (red) |
| **Record ID** | The UUID of the affected row (monospace, truncated) |
| **Changes** | Preview of what changed. For inserts: first 3 field values. For updates: \"field: old -> new\" for up to 3 changed fields. For deletes: first 3 field values of the deleted row. |

---

### Login (/login)

Email + password form. Three users are configured:
- `anas@rspcbassembly.com` (CEO -- full access)
- `piyush@rspcbassembly.com` (Operations Manager -- all except financials)
- `hammad@rspcbassembly.com` (Shop Floor -- production events + active jobs only)

---

### Sidebar Navigation

The sidebar (defined in the dashboard layout) has links to every module. Not all links are visible to all roles:

**All roles see:** Dashboard, BOMs, Quotes, Jobs, Procurement, Production, Shipping, Inventory

**CEO and Operations Manager see:** Customers, Quality

**CEO only sees:** Invoices, Reports, Settings"}],


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

---

## Part 15 — Every Calculation in the App

This section documents every formula, rate, and calculation used across the entire system.

---

### 15.1 Quote Pricing — The Main Formula

When you create a quote for X boards, here's exactly what happens:

```
Total Per Tier = Component Cost + PCB Cost + Assembly Cost + NRE + Setup + Programming
Per Unit = Total / board_qty
```

**Component Cost:**
```
For EACH component on the BOM:
  order_qty = (qty_per_board × board_qty) + overage_extras
  line_cost = unit_price × order_qty × (1 + markup%)

Total Component Cost = SUM of all line_costs
```
- `unit_price` comes from DigiKey/Mouser/LCSC (cheapest wins, cached 7 days)
- Default markup: **20%** (configurable in Settings → Pricing)

**PCB Cost:**
```
PCB Cost = pcb_unit_price × board_qty × (1 + pcb_markup%)
```
- PCB unit price entered manually (from WMD/Candor quote)

**Assembly / Placement Cost:**
```
SMT cost    = (total SMT placements) × $0.035/placement × board_qty
TH cost     = (total TH placements) × $0.75/placement × board_qty
MANSMT cost = (total MANSMT placements) × $1.25/placement × board_qty

Assembly Cost = SMT + TH + MANSMT
```
- **SMT placements** = sum of qty_per_board for all CP, IP, CPEXP, 0402, 0201 components
- **TH placements** = sum of qty_per_board for all TH components
- **MANSMT placements** = sum of qty_per_board for all MANSMT components
- MEC, Accs, CABLE, DEV B = **no placement cost** (component cost only)

**Labour (Setup + Programming):**
```
Setup Cost = setup_time_hours × $130/hr
Programming Cost = programming_time_hours × $130/hr
```

**NRE (Non-Recurring Engineering):**
```
NRE = Programming + Stencil + Setup + PCB Fab + Misc
Default total: $350 (first-time boards only)
```
Each of the 5 items is configurable in Settings → Pricing.

---

### 15.2 Overage — How Extras Are Calculated

**Source of truth:** DM Common File V11 **ExtraOrder** sheet — extracted and saved as `supabase/seed-data/dm-file/overage_tables.csv`. The app's `overage_table` in Supabase has **621 tiers across 11 M-codes**, every value matching the DM file exactly.

The system finds the **last tier where board_qty >= threshold**. Not cumulative — last match wins.

**Low-range tiers (the ones you'll see most in quotes):**

| M-Code | 1 | 60 | 100 | 200 | 300 | 500 | 800 | 1000 |
|--------|---|----|----|----|----|----|----|------|
| **CP** | 20 | 30 | 35 | 40 | 50 | 60 | 80 | 100 |
| **0402** | 50 | 60 | 70 | 80 | 100 | 120 | 160 | 200 |
| **0201** | 50 | 60 | 70 | 80 | 100 | 120 | 160 | 200 |

| M-Code | 1 | 10 | 20 | 50 | 100 | 250 | 500 | 1000 |
|--------|---|----|----|----|-----|-----|-----|------|
| **IP** | 1 | 1 | 2 | 5 | **10** | 20 | 25 | 30 |
| **TH** | 1 | 1 | 2 | 5 | **5** | 20 | 25 | 30 |
| **MANSMT** | 1 | 1 | 2 | 5 | 10 | 20 | 25 | 30 |

**Note the IP vs TH difference at qty=100**: IP gets 10 extras, TH gets 5. Everything else is identical between those two codes.

| M-Code | 1 | 10 | 25 | 50 | 100 | 200 | 500 | 1000 |
|--------|---|----|----|----|-----|-----|-----|------|
| **CPEXP** | 2 | 3 | 5 | 6 | 10 | 15 | 45 | 95 |

**High-range rules (automatic scaling above 1000):**
- **CP**: 10% of part count (1000→100, 10000→1000, 100000→10000)
- **0402, 0201**: 20% of part count — tiny parts have the most attrition
- **IP, TH, MANSMT**: +5 per 1000 parts beyond the 1000 threshold (20000 → 125 extras)
- **CPEXP**: fine-grained 50-qty steps, roughly linear
- **MEC, Accs, CABLE, DEV B**: minimal overage (not in DM file, safe defaults)

**Example:** Ordering 100 boards, CP component with qty 5/board:
- 100 boards × 5/board = 500 base units
- Overage at 100-board threshold = 35 extras (from table)
- Order qty = 500 + 35 = **535 units**

**Another example:** Ordering 5000 boards, 0402 component with qty 10/board:
- 5000 × 10 = 50,000 base units
- Overage at 50,000 threshold = 10,000 extras (20% rule)
- Order qty = 60,000 units

**Code:** `lib/pricing/overage.ts` — `getOverage(mCode, boardQty, tiers)` and `getOrderQty(qtyPerBoard, boardQty, mCode, tiers)`. The tiers come from the `overage_table` in Supabase, not hardcoded.

---

### 15.3 Supplier Pricing — Best Price Selection

```
1. Check cache (api_pricing_cache, 7-day TTL)
2. If miss → query DigiKey + Mouser + LCSC in parallel
3. Pick CHEAPEST across all 3 suppliers
4. If MPN search fails → retry with description keywords ("0603 10K resistor")
5. Cache result for 7 days
```

**Code:** `app/api/quotes/preview/route.ts` and `app/api/quote-batches/[id]/run-pricing/route.ts`

---

### 15.4 Batch Workflow — Cross-BOM Deduplication

When quoting multiple boards together (DM batch):
```
1. MERGE: Same MPN across boards → combine (sum BOM qty, track board refs "A:4, B:2")
2. CLASSIFY: Assign M-codes to merged lines
3. EXTRAS: Calculate overage at COMBINED qty (saves money vs individual)
4. PRICE: Query suppliers for each unique MPN once
5. SEND BACK: Split pricing proportionally back to individual quotes
```

Each board's component cost = `extended_price × (board_qty / total_bom_qty)`

**Code:** `app/api/quote-batches/[id]/` — merge, assign-mcodes, calculate-extras, run-pricing, send-back routes

---

### 15.5 Invoice Calculation — Taxes

```
Subtotal = quote total for the accepted tier
GST/TPS = subtotal × 5%
QST/TVQ = subtotal × 9.975%
Total = subtotal + GST + QST + freight - discount
Due date = issued date + 30 days (Net 30)
```

Multi-job consolidation: one invoice for multiple jobs from same customer.

**Code:** `app/api/invoices/route.ts`

---

### 15.6 Profitability — Quoted vs Actual

```
Quoted Total = matching tier subtotal from quote
Actual Cost = SUM(procurement_lines.unit_price × qty_ordered)
Gross Margin = Quoted - Actual
Margin % = (Margin / Quoted) × 100
```

**Code:** `lib/pricing/profitability.ts`

---

### 15.7 Labour Cost API

Returns M-code stats matching VBA TIME File:
```
Stats:
  - total_unique_lines (non-PCB, non-DNI)
  - cp_feeder_count (unique CP lines)
  - ip_feeder_count (unique IP lines)
  - total_smt_placements (CP+IP+CPEXP+0402+0201 × qty)
  - th_placement_sum (TH × qty)
  - mansmt_count (MANSMT lines)

Costs:
  SMT placement cost = smt_placements × $0.035 × board_qty
  TH placement cost = th_placements × $0.75 × board_qty
  MANSMT placement cost = mansmt_placements × $1.25 × board_qty
  Setup cost = hours × $130/hr
  Programming cost = hours × $130/hr
  NRE = 5 granular items summed
  Grand Total = labour + NRE
```

**Code:** `app/api/labour/route.ts`

---

### 15.8 All Default Rates

| Setting | Default | Where |
|---------|---------|-------|
| Component markup | 20% | Settings → Pricing |
| SMT rate | $0.035/placement | Settings → Pricing |
| TH rate | $0.75/placement | Settings → Pricing |
| MANSMT rate | $1.25/placement | Settings → Pricing |
| Labour rate | $130/hour | Settings → Pricing (VBA: C15-C18) |
| SMT machine rate | $165/hour | Settings → Pricing (VBA: D15-D18) |
| Default NRE | $350 total | Settings → Pricing |
| Quote validity | 30 days | Settings → Pricing |
| GST/TPS | 5% | Hardcoded (federal) |
| QST/TVQ | 9.975% | Hardcoded (Quebec) |
| Invoice terms | Net 30 | Per customer |
| Pricing cache TTL | 7 days | Hardcoded |
| Currency | CAD | Hardcoded |

### 15.9 Known Discrepancy

The batch send-back route (`app/api/quote-batches/[id]/send-back/route.ts`) hardcodes SMT at **$0.35/placement** instead of reading the settings value of **$0.035/placement**. That's a 10x difference. The main pricing engine uses the correct value from settings.

---

## Part 16 — Supplier APIs: DigiKey, Mouser, LCSC, Arrow, Avnet, TI, and More

Every quote and every procurement gets real-time pricing from multiple suppliers in parallel. Here's how each one is wired up.

### 16.0 Supplier Integration Status (verified April 15, 2026)

| Supplier | Status | Endpoint | Auth | Test Route | Notes |
|----------|--------|----------|------|-----------|-------|
| **DigiKey** | ✅ Live | Dynamic (env var) | OAuth 2.0 | `testDigiKey()` | Primary (returns dimensions) |
| **Mouser** | ✅ Live | api.mouser.com | API key in query | `testMouser()` | Pricing-only, no dimensions |
| **LCSC** | ⚠️ Blocked | ips.lcsc.com | SHA1 signature | `testLcsc()` | Vendor side (key activation pending) |
| **Arrow** | ✅ Live | api.arrow.com | Basic auth | `testArrow()` | Added April 15 |
| **Avnet** | ✅ Live | onestop.avnet.com | OAuth Entra ID | `testAvnet()` | Scope requires `/.default` suffix |
| **Future** | ✅ Live | futureapi.com | API key | `testFuture()` | Uses `/inventory/lookups` endpoint |
| **e-Sonic** | ✅ Live | api.esonic.com | API key | `testEsonic()` | Real endpoint implemented April 15 |
| **Newark** | ✅ Live | secure.newark.com | API key | `testNewark()` | Param names: `manufacturerPartNumber` |
| **Samtec** | ✅ Live | api.samtec.com | Bearer token | `testSamtec()` | v2 API endpoint, no v1 |
| **TTI** | ✅ Live | api.tti.com | API key | `testTti()` | Endpoint: `/service/api/v1/search/keyword` |
| **TI** | ✅ Live | transact.ti.com | OAuth + Bearer | `testTi()` | v2 API: `/store/products/[PN]?currency=CAD` |

### 16.1 DigiKey (primary)

**Client:** `lib/pricing/digikey.ts`
**API Version:** v4 (keyword search)
**Base URLs:**
- Token: `https://api.digikey.com/v1/oauth2/token`
- Search: `https://api.digikey.com/products/v4/search/keyword`

**Auth:** OAuth 2.0 client_credentials flow
- Env vars: `DIGIKEY_CLIENT_ID`, `DIGIKEY_CLIENT_SECRET`
- Access token cached in memory, 1-minute buffer before refresh
- `Authorization: Bearer <token>` + `X-DIGIKEY-Client-Id: <id>` headers
- Locale headers: `X-DIGIKEY-Locale-Site: CA`, `Locale-Language: en`, `Locale-Currency: CAD`

**Rate limit:** 1,000 requests/day (free tier)

**Request:**
```json
{
  "Keywords": "ERJ-2GE0R00X",
  "Limit": 1,
  "Offset": 0,
  "FilterOptionsRequest": {},
  "SortOptions": { "Field": "None", "SortOrder": "Ascending" }
}
```

**Response fields extracted** (v4 uses different names than v3 — easy to get wrong):
- `ManufacturerProductNumber` → mpn (NOT `ManufacturerPartNumber` — that's v3)
- `Description.ProductDescription` → description
- `UnitPrice` → unit_price (CAD)
- `QuantityAvailable` → stock_qty
- `ProductVariations[0].DigiKeyProductNumber` → supplier_pn (moved out of top level in v4)
- `Parameters[]` — each param has `ParameterText` + `ValueText` (not `Parameter`/`Value`):
  - "Mounting Type" → `mounting_type` (Surface Mount / Through Hole). If missing, **inferred from category name** — DigiKey doesn't populate this param for chip resistors/caps, so we check if Category contains "Surface Mount" or "Through Hole"
  - "Package / Case" → `package_case` (0402, 0603, SOIC-8, etc.). Falls back to "Supplier Device Package"
  - "Size / Dimension" → `length_mm`, `width_mm`. Format: `0.039" L x 0.020" W (1.00mm x 0.50mm)`. Parenthetical mm preferred; falls back to plain `1.0mm x 0.5mm` if no parenthetical
  - "Height - Seated (Max)" → `height_mm`. Also parses parenthetical mm format
- `Category.ChildCategories[0].Name` → category (most specific, e.g. "Chip Resistor - Surface Mount"). Falls back to top-level `Category.Name`

**Why DigiKey is primary:** It's the only supplier that returns component dimensions in its keyword search response. Those dimensions feed the size-based PAR rules (PAR-20 through PAR-24) in the M-code classifier. Every time we price a component via DigiKey, we enrich the `components` table with these fields so future M-code classification gets smarter.

### 16.2 Mouser

**Client:** `lib/pricing/mouser.ts`
**API Version:** v1
**Base URL:** `https://api.mouser.com/api/v1/search/keyword`

**Auth:** API key in query string
- Env var: `MOUSER_API_KEY`
- URL: `${base}?apiKey=${key}`
- No OAuth, no signature

**Rate limit:** 30 requests/minute, 1,000 requests/day

**Request:**
```json
{
  "SearchByKeywordRequest": {
    "keyword": "ERJ-2GE0R00X",
    "records": 1,
    "startingRecord": 0,
    "searchOptions": "",
    "searchWithYourSignUpLanguage": ""
  }
}
```

**Response fields extracted:**
- `SearchResults.Parts[0].ManufacturerPartNumber` → mpn
- `.Description` → description
- `.MouserPartNumber` → supplier_pn
- `.Availability` — string like "1,234 In Stock" — regex-parsed to extract stock_qty
- `.PriceBreaks[0].Price` — string with currency prefix, stripped and parsed to float
- `.PriceBreaks[0].Currency` → currency (usually CAD or USD)

**What Mouser does NOT return:** dimensions, mounting_type, package_case in the keyword search. Only basic pricing.

### 16.3 LCSC

**Client:** `lib/pricing/lcsc.ts`
**API Version:** REST (undated)
**Base URL:** `https://ips.lcsc.com/rest/wmsc2agent/search/product`

**Auth:** Custom SHA1 signature
- Env vars: `LCSC_API_KEY`, `LCSC_API_SECRET`
- Request is GET with query params: `keyword`, `key`, `nonce`, `timestamp`, `sign`
- Signature: `SHA1(key={key}&nonce={nonce}&secret={secret}&timestamp={timestamp})`
- Nonce is 16-char random string, regenerated per request
- Timestamp is milliseconds

**Rate limit:** Depends on partner agreement (LCSC API is still in development for RS)

**Response fields extracted:**
- `result.tipProductDetailUrlVO[0].productModel` → mpn
- `.productDescEn` → description
- `.productCode` → supplier_pn
- `.stockNumber` → stock_qty
- `.productPriceList[0].productPrice` OR `.usdPrice` → unit_price
- `.productPriceList[0].currencySymbol` → currency

### 16.4 How prices flow through the app

```
User clicks "Calculate Pricing" on a quote
  ↓
POST /api/quotes/preview with bom_id + tiers
  ↓
For each unique MPN in the BOM:
  ↓
  Check api_pricing_cache table for existing row (7-day TTL)
  ↓ (miss)
  Promise.allSettled([
    searchPartPrice(mpn),      // DigiKey
    searchMouserPrice(mpn),    // Mouser
    searchLCSCPrice(mpn)       // LCSC
  ])
  ↓
  Pick cheapest price across all 3 suppliers
  ↓
  If all 3 fail → retry with description keywords
  ↓
  Cache full response in api_pricing_cache (source, mpn, response JSONB)
  ↓
  Enrich components table (mounting_type, package_case, dimensions from DigiKey)
  ↓
Apply component_markup (default 20%)
  ↓
Calculate per-tier totals (components + PCB + assembly + NRE)
  ↓
Return pricing result to UI
```

### 16.5 Caching strategy

Table: `api_pricing_cache`

```sql
CREATE TABLE api_pricing_cache (
  id UUID PRIMARY KEY,
  source TEXT CHECK (source IN ('digikey', 'mouser', 'lcsc')),
  mpn TEXT NOT NULL,
  search_key TEXT NOT NULL,   -- what we sent (MPN or description)
  response JSONB NOT NULL,    -- full API response preserved
  unit_price DECIMAL(10,4),
  stock_qty INT,
  currency TEXT DEFAULT 'CAD',
  fetched_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  UNIQUE(source, search_key)
);
```

- 7-day TTL per entry
- `UNIQUE(source, search_key)` prevents duplicates — upserts on conflict
- Full API response stored in JSONB column so we can extract more fields later without re-calling the API
- `expires_at` is checked before every fetch — only calls the live API if cached row is expired or missing

### 16.6 How M-code classification uses the APIs

1. User uploads a BOM
2. Parser runs — extracts MPNs, descriptions, designators
3. M-code classifier runs through its 4 layers for each component
4. Layer 1: Check `components` table — if MPN exists with an M-code, use that (instant)
5. Layer 1b: Keyword lookup — match description/package against 240+ keywords
6. Layer 2: PAR rules — match against package_case, mounting_type, dimensions (the last two require enriched data from DigiKey)
7. Layer 3: Claude AI fallback — only for the stragglers
8. **When pricing runs later, DigiKey enrichment populates dimensions → future classifications of the same MPN hit the size rules instantly via Layer 2**

So the more BOMs you price, the richer the components table gets, the more accurate classification becomes. It's a learning loop where every price lookup makes the next classification smarter.

### 16.7 Failure modes and fallbacks

**If DigiKey auth fails:** Token request throws. searchPartPrice returns null. Pricing continues with Mouser + LCSC only. Logged but not user-visible.

**If Mouser API key missing:** Client returns null immediately. No error.

**If LCSC signature is wrong:** Request returns 401 or 403. Client returns null. No error.

**If all 3 suppliers fail for an MPN:** The line shows `$0` in the quote preview, and the route retries with description-based keyword search (first 5 words of description). If that also fails, the MPN is flagged as "missing price" in the preview response, and the UI shows a collapsible list of unpriced components.

**Rate limit exceeded:** The response is cached HTTP 429 — treated as a failure, falls back to other suppliers.

**Timeout:** All supplier API calls have a 15-second timeout (`AbortSignal.timeout(15_000)`) to prevent hanging. DigiKey OAuth token requests have a 10-second timeout. If a supplier is unresponsive, the call fails gracefully and pricing continues with cached/available data from other suppliers.

### 16.8 API routes that call suppliers

| Route | When it fires | What it does with the result |
|-------|--------------|------------------------------|
| `GET /api/pricing/[mpn]` | Manual single-MPN lookup (UI) | Returns best price, enriches components table |
| `POST /api/quotes/preview` | User clicks "Calculate Pricing" | Returns per-tier totals, warns on missing prices |
| `POST /api/quote-batches/[id]/run-pricing` | Batch workflow Step 9 | Updates `quote_batch_lines` with prices at ORDER quantities |
| `POST /api/procurement-batches/[id]/allocate-suppliers` | Procurement batch Step 4 | Picks cheapest supplier per line, updates `procurement_batch_lines` |
| AI chat tool `getPricing` | AI agent looking up a price | Returns data to the AI for response |

### 16.9 Additional Suppliers (Arrow, Avnet, Future, e-Sonic, Newark, Samtec, TI, TTI)

These 8 suppliers were integrated starting April 15, 2026. All have passing test functions in `lib/supplier-tests.ts`. Not all are production-integrated yet — most are in evaluation or testing phase.

#### Arrow Electronics

**Client:** `lib/pricing/arrow.ts` (placeholder, not production)
**Base URL:** `https://api.arrow.com/oauth/token` (auth), search TBD
**Auth:** OAuth 2.0 client_credentials
- Env vars: `ARROW_CLIENT_ID`, `ARROW_CLIENT_SECRET`
- Special: uses Basic auth with `Authorization: Basic <base64(client_id:client_secret)>`
- Unlike DigiKey, Arrow requires the credentials in the Authorization header, not the request body

**Status:** Test passes, full API integration not yet built.

#### Avnet

**Client:** `lib/pricing/avnet.ts` (placeholder)
**Base URL:** `https://onestop.avnet.com/api/v2/products/solr-search` (v1 is deprecated)
**Auth:** OAuth 2.0 Entra ID (Azure)
- Env vars: `AVNET_CLIENT_ID`, `AVNET_CLIENT_SECRET`, `AVNET_TENANT_ID`
- Token endpoint: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
- **Critical:** Scope must be `https://graph.microsoft.com/.default` — the `/.default` suffix is mandatory for Entra compatibility

**Status:** Test passes, API integration placeholder.

#### Future Electronics

**Client:** `lib/pricing/future.ts` (placeholder)
**Base URL:** `https://www.futureapi.com/inventory/lookups` (NOT `/products`)
**Auth:** API key in header
- Env var: `FUTURE_API_KEY`
- Header: `Authorization: Bearer ${key}`
- Common mistake: using `/products` endpoint which returns 404. Correct endpoint is `/inventory/lookups`.

**Status:** Test passes.

#### e-Sonic

**Client:** `lib/pricing/esonic.ts` (placeholder)
**Base URL:** `https://api.esonic.com/api/inventory/price-availability`
**Auth:** API key in header
- Env var: `ESONIC_API_KEY`
- Header: `X-API-Key: ${key}`
- Previously: endpoint was masked/stubbed. Now pointing to real endpoint.

**Status:** Test passes, returning live data.

#### Newark

**Client:** `lib/pricing/newark.ts` (placeholder)
**Base URL:** `https://secure.newark.com/api/v1/products`
**Auth:** API key + special query params
- Env var: `NEWARK_API_KEY`
- Query params: `manufacturerPartNumber={mpn}&pageNumber=1&pageSize=10&key=${key}`
- Common mistake: using generic `query` param. Correct param is `manufacturerPartNumber`. Also requires explicit pagination params.

**Status:** Test passes.

#### Samtec

**Client:** `lib/pricing/samtec.ts` (placeholder)
**Base URL (v2):** `https://api.samtec.com/catalog/v2/...`
**Auth:** Bearer token in Authorization header
- Env vars: `SAMTEC_CLIENT_ID`, `SAMTEC_CLIENT_SECRET`
- Token endpoint: `https://api.samtec.com/oauth/token` (or check current docs)
- Header: `Authorization: Bearer ${token}`, `client-app-name: RS-PCB-Assembly` (or similar)
- **Important:** v1 API is deprecated. v2 is current.

**Status:** Test passes with v2 endpoint.

#### TI (Texas Instruments)

**Client:** `lib/pricing/ti.ts` (placeholder)
**Base URL:** `https://transact.ti.com/v2/store/products/{PN}` (NOT v1)
**Auth:** OAuth 2.0 client_credentials
- Env vars: `TI_CLIENT_ID`, `TI_CLIENT_SECRET`
- Token endpoint: `https://transact.ti.com/v1/oauth/accesstoken`
- Request params: `grant_type=client_credentials` (form-urlencoded)
- Product endpoint params: `?currency=CAD&exclude-evms=true` (filter to actual components, not evaluation modules)
- **Critical:** v1 product API returns 401 "Invalid API call as no apiproduct match found". Upgrade to v2 to fix.

**Default test MPN:** `AFE7799IABJ` (updated April 15, was `LM358N`)

**Status:** Test passes with v2 API.

#### TTI

**Client:** `lib/pricing/tti.ts` (placeholder)
**Base URL:** `https://api.tti.com/service/api/v1/search/keyword` (NOT `https://api.ttiinc.com`)
**Auth:** API key in header
- Env var: `TTI_API_KEY`
- Header: `apiKey: ${key}`, `Cache-Control: no-cache`
- Common mistake: using `api.ttiinc.com` (wrong subdomain). Correct domain is `api.tti.com`.

**Status:** Test passes.

---

## Part 17 — Manual Pricing for Missing Components

Added April 14, 2026. Solves the problem where DigiKey/Mouser/LCSC all return nothing for an MPN and the quote total silently uses $0, producing wrong totals.

### 17.1 The problem

Some MPNs aren't in any distributor catalog:
- Custom Lanka parts (KB Rail Canada proprietary numbers)
- Obsolete components
- Japanese/Chinese manufacturer parts with no Western distribution
- Cable assemblies, mechanical hardware, custom cut lengths

When this happens the old flow was: `pricing.missing_price_components` JSONB lists them, the UI shows a collapsible warning ("5 components with no price — using $0. Review before sending.") and you're stuck. The CEO had to mentally add the missing cost or delete the quote and restart.

### 17.2 The solution

A "Manual Pricing" editor on the quote detail page, shown only when the quote is `draft` or `review` AND has missing-price components. You type prices → click Save & Recalculate → the quote totals update in place.

Key design decision: **manual prices are stored in `api_pricing_cache`, not scoped to the quote.** This means the same MPN manually priced in one quote is automatically picked up for the next quote that uses it. Tradeoff accepted — saves re-entry, and if DigiKey later returns a price the helper picks the cheapest across all sources.

### 17.3 How it works end-to-end

```
User opens quote detail page (status=draft)
  ↓
Page reads pricing.missing_price_components from the JSONB
  ↓
If list is non-empty → ManualPriceEditor renders
  ↓
User types unit prices into editable table
  ↓
Click "Save & Recalculate"
  ↓
For each row with a price entered:
  POST /api/pricing/manual { mpn, unit_price, currency }
    → upsert api_pricing_cache row:
        source = 'manual'
        search_key = mpn.toUpperCase()
        unit_price = entered value
        expires_at = now + 365 days
        response = { manual: true, entered_by: user.id, entered_at: now }
  ↓
POST /api/quotes/[id]/recalculate
  ↓
Server validates status IN ('draft', 'review')
  ↓
Calls recomputeQuotePricing(supabase, bom_id, resolvedTiers, shipping_flat):
  1. Fetch BOM lines (non-PCB, non-DNI)
  2. Fetch api_pricing_cache rows for every MPN — case-insensitive lookup
     (handles legacy rows that were stored raw-case + new manual rows uppercased)
  3. Build priceMap — for each MPN, picks the lowest price across all sources
  4. Fetch overage table + pricing settings
  5. Call calculateQuote(...) → returns { tiers, warnings, missing_price_components }
  ↓
Server updates quote row:
  pricing (full JSONB)
  pcb_cost_per_unit
  assembly_cost
  nre_charge
  updated_at
  ↓
Client router.refresh() → page re-renders with new totals
```

### 17.4 The files

| File | Purpose |
|------|---------|
| `supabase/migrations/028_pricing_cache_manual_source.sql` | Extends `api_pricing_cache.source` CHECK constraint to include `'manual'` |
| `lib/pricing/recompute.ts` | Shared helper `recomputeQuotePricing(supabase, bom_id, resolvedTiers, shipping_flat)` — extracted from the create-quote route so both create and recalculate share the same logic |
| `app/api/pricing/manual/route.ts` | POST endpoint — auth-gated, upserts one manual price into the cache |
| `app/api/quotes/[id]/recalculate/route.ts` | POST endpoint — auth-gated, re-runs pricing engine and updates the quote |
| `components/quotes/manual-price-editor.tsx` | `"use client"` Card with editable table, batch save + recalc, success/error banners |
| `app/(dashboard)/quotes/[id]/page.tsx` | Renders `<ManualPriceEditor>` below the Pricing Breakdown card when conditions match |

### 17.5 The shared helper (`lib/pricing/recompute.ts`)

Before Session 9's continuation, `app/api/quotes/route.ts` POST handler contained ~80 lines of inline BOM fetch → price map build → overage fetch → settings fetch → engine call logic. That was duplicated when we built `recalculate`. The helper now owns all of it:

```ts
export async function recomputeQuotePricing(
  supabase: SupabaseClient,
  bom_id: string,
  resolvedTiers: TierInput[],
  shipping_flat: number
): Promise<{ pricing: CalculatedPricing, settings: PricingSettings }>
```

Both `POST /api/quotes` (create) and `POST /api/quotes/[id]/recalculate` call this. Any future pricing tweak happens in one place.

**Side-effect win:** the helper does a case-insensitive cache lookup (queries both raw and uppercased `search_key`, then merges into a `Map` keyed lowercase). Historical cache rows were inconsistently cased — some DigiKey writes stored `search_key` raw, some uppercased it, manual writes always uppercase it. The old inline code silently missed half of them. Now everything resolves.

### 17.6 Why 365-day TTL on manual entries

Cache entries normally expire in 7 days (to re-fetch fresh distributor prices). But manual prices:
- Were entered by a human — they're authoritative, not a distributor snapshot
- Won't come back on their own — if you re-fetch, the APIs still return nothing
- Should persist so the next quote using the same MPN picks them up

365 days means they effectively last for a year before the CEO has to re-enter. If someone wants a shorter horizon, adjust in `app/api/pricing/manual/route.ts`.

### 17.7 Status gate — only draft/review

The recalculate endpoint 400s on any quote that's `sent`, `accepted`, `rejected`, or `expired`. A sent quote has been emailed to a customer — changing totals after the fact is a business-integrity violation. If you need to fix a sent quote, the correct flow is: revoke, clone to a new draft, manually price, send again.

### 17.8 What happens if DigiKey later returns a price

The helper picks the **lowest** price across all sources for each MPN. So if you manually priced `CUSTOM-PART-X` at $5.00 last month, and this month DigiKey starts stocking it at $3.20, the next recalculate picks DigiKey's $3.20. The manual entry is still in the cache (not deleted), just outvoted. If DigiKey's price goes back up, manual wins again.

This is the "manual is a floor price" model — you never pay more than the manual entry, and you benefit from any distributor win.

---

## Part 18 — Clean-Slate Reset (Dev / Testing)

When you need to clear all transactional data (BOMs, quotes, jobs, procurements, invoices) without touching seed/config tables, run this single transaction via Supabase MCP or psql. This is the canonical reset script — do NOT improvise, FK order matters.

### 18.1 What gets wiped

Transactional / operational data — everything that depends on a specific customer engagement:

- **BOM data:** `boms`, `bom_lines`
- **Quote data:** `quotes`, `quote_batches`, `quote_batch_boms`, `quote_batch_lines`, `quote_batch_log`
- **Job data:** `jobs`, `job_status_log`
- **Procurement data:** `procurements`, `procurement_lines`, `supplier_pos`, `procurement_batches`, `procurement_batch_items`, `procurement_batch_lines`, `procurement_batch_log`
- **Production data:** `production_events`, `shipments`, `fabrication_orders`, `ncr_reports`, `serial_numbers`
- **Financial data:** `invoices`, `payments`

### 18.2 What gets kept

Seed data, config, reference data, and the classification learning loop:

- `customers` — 11 seeded customers (Lanka, LABO, CSA, etc.)
- `gmps` — customer board definitions (**optional** — wipe these too if the old test GMPs are polluting the global search autocomplete; they'll be re-created on the next BOM upload)
- `components` — the classification learning loop (every manual M-code decision is cached here)
- `api_pricing_cache` — distributor prices + manual entries (see Part 17)
- `m_code_rules` — 43 real PAR rules from DM Common File V11
- `overage_table` — 621 real DM ExtraOrder tiers
- `mcode_keyword_lookup` — 211 real MachineCodes keywords
- `app_settings` — pricing settings, markups, labour rates
- `users` — the 3 seeded users (ceo, operations_manager, shop_floor)
- `email_templates` — quote/PO/invoice email bodies
- `audit_log` — untouched (but it GROWS during the wipe as DELETE triggers fire — that's intentional, it's the compliance trail of the reset itself)

### 18.3 What is NOT wiped automatically

**Supabase Storage buckets** — PDFs and uploaded files in `boms/`, `quotes/`, `jobs/`, `invoices/`, `procurement/` are left alone. After a DB wipe these become orphaned (no row references them). You can:

1. Leave them — harmless, just eats storage quota.
2. Write a reconciliation script that lists bucket contents and deletes any file whose filename isn't referenced in a DB row.
3. Delete everything in the bucket via the Supabase dashboard — nuclear, but fine for a dev reset.

### 18.4 The reset SQL

Run as a single transaction. Order matters because FKs are not all set to `ON DELETE CASCADE` — some are, some aren't, and the safe move is to delete children first.

```sql
BEGIN;

-- Leaves (deepest FK dependencies)
DELETE FROM public.payments;
DELETE FROM public.shipments;
DELETE FROM public.fabrication_orders;
DELETE FROM public.ncr_reports;
DELETE FROM public.serial_numbers;
DELETE FROM public.production_events;
DELETE FROM public.supplier_pos;
DELETE FROM public.procurement_lines;
DELETE FROM public.procurement_batch_lines;
DELETE FROM public.procurement_batch_items;
DELETE FROM public.procurement_batch_log;
DELETE FROM public.job_status_log;
DELETE FROM public.bom_lines;
DELETE FROM public.quote_batch_lines;
DELETE FROM public.quote_batch_boms;
DELETE FROM public.quote_batch_log;

-- Mid level (depend on parents, have children above)
DELETE FROM public.invoices;
DELETE FROM public.procurements;
DELETE FROM public.procurement_batches;
DELETE FROM public.quote_batches;

-- Parents (the three things Anas cares about)
DELETE FROM public.jobs;
DELETE FROM public.quotes;
DELETE FROM public.boms;

-- Optional: also clear GMPs if test board names are polluting search
-- (only safe AFTER boms/jobs/quotes are gone, since they FK to gmps)
-- DELETE FROM public.gmps;

COMMIT;
```

### 18.5 Why not TRUNCATE?

`TRUNCATE ... CASCADE` is faster but:

1. It doesn't fire DELETE triggers, so the `audit_log` never records the reset. Breaks compliance.
2. It resets sequences — if you want to keep the existing `quote_number` / `job_number` / `proc_code` counter continuity, `TRUNCATE` blows it away.
3. One accidental table name in the CASCADE chain (e.g., typing `TRUNCATE customers CASCADE`) is catastrophic — it'd wipe every child of every listed table.

`DELETE FROM` is slower but respects triggers, RLS, and is much harder to accidentally extend.

### 18.6 Verifying the reset

After the transaction commits, run:

```sql
SELECT
  (SELECT count(*) FROM boms)              AS boms,
  (SELECT count(*) FROM quotes)            AS quotes,
  (SELECT count(*) FROM jobs)              AS jobs,
  (SELECT count(*) FROM customers)         AS customers_kept,
  (SELECT count(*) FROM components)        AS components_kept,
  (SELECT count(*) FROM api_pricing_cache) AS pricing_kept;
```

Expect zeros for the first three, non-zero for the last three.

### 18.7 When to use this

- Before a demo — clean slate removes stale test data.
- Before running end-to-end validation against a real Lanka/Cevians BOM — you want the quote/job numbers to start from 001 and nothing from a prior test to confuse the flow.
- After a schema migration that added columns — wiping and re-uploading is sometimes cleaner than backfilling.
- **Never** in production once RS is live — this is for pre-launch dev resets only. Add a guard or rename the script if you need to block it in prod.

---

## Part 19 — BOM → Quote Handoff (Prefill Flow)

Added April 14, 2026. Solves the friction where parsing a BOM and then starting a quote meant re-picking the customer + BOM from dropdowns — duplicate work that was especially annoying when the user had just clicked through the BOM parser 30 seconds earlier.

### 19.1 The flow end-to-end

```
User uploads BOM at /bom/upload
  ↓
/api/bom/parse runs, creates boms row + bom_lines rows
  ↓
Upload form router.push('/bom/${bom_id}')
  ↓
User lands on /bom/[id] detail page
  ↓
Page header shows primary "Create Quote" button (Calculator icon)
  (only when bom.status === 'parsed' && no linked quote exists)
  ↓
Click → navigate to /quotes/new?bom_id=${id}
  ↓
Server component reads searchParams.bom_id
  ↓
Parallel fetch:
  - customers list (as always)
  - boms row { id, customer_id, status } (only if bom_id is present)
  ↓
If bom.status === 'parsed':
  pass initialCustomerId + initialBomId as props to <NewQuoteForm>
  ↓
NewQuoteForm renders with customer preselected (no click needed)
  ↓
useEffect fires once on mount (guarded by useRef):
  - GET /api/boms?customer_id=${initialCustomerId}
  - setBoms(list)
  - if initialBomId matches: handleBomChange(initialBomId)
    - this sets bomId state
    - and auto-loads programming cost from /api/bom/${id}/line-count
  ↓
Tier inputs (50/100/150/200) are visible and editable immediately
  ↓
User clicks "Calculate Pricing" → "Save Quote as Draft"
```

### 19.2 Why the prefill is gated on `status === 'parsed'`

A BOM row exists from the moment the file upload completes, but the parsed content lands a few seconds later. If the user somehow lands on `/quotes/new?bom_id=xxx` while the BOM is still `uploading` or `parsing` (or worse, `error`), prefilling it would either show empty BOM lines or fail silently. Gating on `status === 'parsed'` means the prefill either works completely or falls back to the blank form — never a partial, confusing state.

### 19.3 The "Create Quote" / "View Quote" button logic

```tsx
{bom.status === "parsed" && !linkedQuote && (
  <Link href={`/quotes/new?bom_id=${id}`}>
    <Button size="sm">Create Quote</Button>
  </Link>
)}
{linkedQuote && (
  <Link href={`/quotes/${linkedQuote.id}`}>
    <Button size="sm" variant="secondary">View Quote</Button>
  </Link>
)}
```

- Parsed BOM + no quote → primary-colored "Create Quote" button
- Parsed BOM + quote exists → secondary "View Quote" button (jumps to the existing quote)
- Uploading/parsing/errored BOM → neither button shown

The `linkedQuote` is fetched server-side in parallel with revisions:

```ts
const [{ data: revisions }, { data: linkedQuote }] = await Promise.all([
  supabase.from("boms").select(...).eq("gmp_id", bom.gmp_id)...,
  supabase.from("quotes").select("id, status").eq("bom_id", id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle(),
]);
```

### 19.4 Why the prefill uses useEffect instead of initial state

The BOMs list for the customer isn't known at render time — it's fetched from `/api/boms?customer_id=...` after the customer is picked. So `initialBomId` can't just be passed to `useState` because the form's BOM `<Select>` won't have the option until the list arrives.

The `useEffect` (guarded by a `useRef` so it can't double-fire) mirrors what a user clicking through would do:

1. Pick customer → triggers BOM list fetch
2. Pick BOM → triggers programming cost auto-load

Both happen automatically when both `initialCustomerId` and `initialBomId` are provided.

### 19.5 Workflow banner vs. header button — why both?

The workflow banner at the top of the BOM detail page already has a "Next: Quote" CTA that also links to `/quotes/new?bom_id=${id}`. We kept it AND added the primary header button because:

- The workflow banner is a subtle outline button easy to miss.
- The header button sits next to Export/Delete where users already look for actions on the current BOM.
- The header button is primary-colored so it's the most obvious next step visually.
- When a quote exists, the header button flips to "View Quote" — something the workflow banner doesn't do (it shows the next step, not the current one).

Redundancy is intentional — a few pixels of duplicated UI is cheap insurance against "I didn't see the button."

### 19.6 Files touched

| File | What changed |
|------|--------------|
| `app/(dashboard)/quotes/new/page.tsx` | Accepts `searchParams.bom_id`, fetches BOM in parallel with customers, gates prefill on `status === 'parsed'` |
| `components/quotes/new-quote-form.tsx` | New `initialCustomerId` / `initialBomId` props, `useEffect` prefill guarded by `useRef` |
| `app/(dashboard)/bom/[id]/page.tsx` | New "Create Quote" / "View Quote" button in header actions |

---

## Part 20 — Permanent API Keys (`rs_live_...`)

Added April 14, 2026. Solves the "MCP auth expires every hour" problem that was breaking every AI agent connected to the RS ERP.

### 20.1 The problem

The MCP server at `/api/mcp` originally accepted only Supabase JWTs. Supabase access tokens expire after 1 hour, so every AI tool that sits in a config file — Claude Desktop, Claude Code's `.mcp.json`, n8n workflows, Make scenarios, custom agents — broke hourly. Manual token refresh is a non-starter for anything that runs unattended.

### 20.2 The solution

Permanent API keys modeled on Stripe / GitHub patterns:

- **Format:** `rs_live_<32 url-safe base64 chars>` (192 bits of entropy)
- **Storage:** only the SHA-256 hash is persisted — the raw key is shown ONCE on creation
- **Revocation:** soft-delete via `revoked_at` timestamp. Rows are never hard-deleted (audit trail)
- **Roles:** ceo / operations_manager / shop_floor — same enum as `public.users.role`
- **Auth path:** `lib/mcp/auth.ts` detects the `rs_live_` prefix and branches to API-key validation instead of JWT

### 20.3 The schema

```sql
CREATE TABLE public.api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,           -- "Claude Desktop - Anas"
  key_hash        TEXT NOT NULL UNIQUE,    -- SHA-256 hex
  role            TEXT NOT NULL DEFAULT 'ceo'
                    CHECK (role IN ('ceo','operations_manager','shop_floor')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES public.users(id),
  last_used_at    TIMESTAMPTZ,             -- fire-and-forget telemetry
  revoked_at      TIMESTAMPTZ              -- soft-delete
);

CREATE INDEX idx_api_keys_key_hash_active
  ON public.api_keys(key_hash)
  WHERE revoked_at IS NULL;
```

The partial index is the critical performance piece — it only includes active keys, so validation lookups are fast even after hundreds of keys accumulate over time.

RLS is enabled with 3 ceo-only policies: SELECT, INSERT, UPDATE. No DELETE policy — revocation happens via UPDATE `revoked_at = NOW()`.

### 20.4 The flow

**Creation (admin flow, via CEO JWT):**

```
POST /api/admin/api-keys
Authorization: Bearer <supabase-jwt>
Body: { name: "Claude Desktop - Anas", role: "ceo" }
  ↓
Validate JWT + role === 'ceo' (403 otherwise)
  ↓
generateApiKey() → "rs_live_<32 chars>"
hashApiKey(raw) → sha256 hex
  ↓
INSERT INTO api_keys (name, key_hash, role, created_by)
  ↓
Return { id, name, role, key: rawKey, created_at }
  (201 — raw key is ONLY returned at creation, never again)
```

**Validation (MCP auth flow, on every request):**

```
POST /api/mcp
Authorization: Bearer rs_live_<key>
  ↓
validateMcpRequest(request)
  ↓
Parse Bearer token → raw string
  ↓
isApiKeyFormat(token)?
  ├─ yes → validateApiKey(token):
  │         - hashApiKey(token)
  │         - SELECT id, name, role, revoked_at FROM api_keys WHERE key_hash = $1
  │         - if !row || revoked_at !== null → return null
  │         - fire-and-forget UPDATE last_used_at (don't await)
  │         - return { id, name, role }
  │       → McpAuthUser { userId: "api-key:<id>", role, name, email: "" }
  │
  └─ no → supabase.auth.getUser(token) [existing JWT path, unchanged]
         → McpAuthUser { userId: user.id, role, name, email }
  ↓
buildMcpServerForRole(role) [existing flow]
  ↓
Return MCP tools scoped to role
```

Note the `userId` prefix `api-key:<uuid>`. This is intentional — downstream logging and audit tools can distinguish "a human user called this tool" from "an AI agent authenticated via API key called this tool." Never prefix real user ids this way.

**Revocation:**

```
DELETE /api/admin/api-keys/:id
Authorization: Bearer <supabase-jwt>
  ↓
Validate JWT + ceo role (403 otherwise)
  ↓
Validate :id is a UUID (400 otherwise)
  ↓
UPDATE api_keys SET revoked_at = NOW()
  WHERE id = $1 AND revoked_at IS NULL
  RETURNING id, revoked_at
  ↓
- If no row → 404 "Key not found or already revoked"
- Else → { ok: true, id, revoked_at }
```

Once revoked, the partial index stops including the row, and `validateApiKey()` short-circuits to null on the `revoked_at !== null` check. The row stays in the table forever as an audit record.

### 20.5 Why SHA-256 (not bcrypt)

API keys are high-entropy (192 bits) random strings. bcrypt's work factor exists to slow down brute-force attacks on low-entropy passwords — pointless when the attacker would need to try ~6×10⁵⁷ keys to guess one. SHA-256 is fast, deterministic, and sufficient for this threat model. The only attack it defends against is: "somebody gets a DB dump — can they use the stored hashes?" Answer: no, SHA-256 is preimage-resistant.

If the threat model ever includes offline dictionary attacks against low-entropy keys, migrate to bcrypt/argon2 and require all clients to re-issue.

### 20.6 The helper library (`lib/api-keys.ts`)

Five exports:

| Function | Purpose |
|----------|---------|
| `API_KEY_PREFIX` | Constant `"rs_live_"` so every branch uses the same string |
| `generateApiKey()` | `randomBytes(24).toString("base64url")` → prefix + 32 chars |
| `hashApiKey(raw)` | `createHash("sha256").update(raw).digest("hex")` |
| `isApiKeyFormat(token)` | `token.startsWith(API_KEY_PREFIX)` — used by MCP auth dispatch |
| `validateApiKey(raw)` | Admin-client lookup, returns `ValidatedApiKey | null`, fires non-blocking `last_used_at` update |

The `validateApiKey` fire-and-forget update is written as `.then(() => {}, () => {})` so unhandled-promise warnings don't bubble up. The auth path never awaits it — hot-path latency stays bounded by the single SELECT.

### 20.7 Why the user-scoped client for admin routes vs admin client for validation

**Admin routes** (create/list/revoke) use `createClient()` — the user-scoped client. This is intentional: the RLS policies we wrote on `api_keys` enforce "only ceo can SELECT/INSERT/UPDATE." Running through the user-scoped client means RLS + explicit role checks in app code work together — defense in depth. If the role check in app code is ever accidentally removed, RLS still blocks non-CEO writes.

**Validation** (in `lib/api-keys.ts:validateApiKey`) uses `createAdminClient()` — the service-role client. The caller of `validateApiKey` is unauthenticated at the Supabase level (they're presenting a raw API key, not a JWT), so there's no `auth.uid()` for RLS to evaluate. The key possession itself is the credential. Admin client bypasses RLS so the lookup succeeds. This is safe because the lookup is keyed on `key_hash` — an attacker who doesn't know the raw key can't forge a valid hash.

### 20.8 Files touched

| File | What |
|------|------|
| `supabase/migrations/029_api_keys.sql` | New table + partial index + 3 RLS policies |
| `lib/api-keys.ts` | Crypto + validation helpers |
| `app/api/admin/api-keys/route.ts` | POST create (returns raw key once), GET list |
| `app/api/admin/api-keys/[id]/route.ts` | DELETE soft-revoke |
| `lib/mcp/auth.ts` | Dispatch on `isApiKeyFormat()` before JWT validation |

`app/api/mcp/route.ts` is NOT modified — `validateMcpRequest` is still the single entry point and now handles both auth types internally.

### 20.9 Client setup

Three configs are supported:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "rs-pcb-assembly": {
      "url": "https://webapp-fawn-seven.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer rs_live_..." }
    }
  }
}
```

**Claude Code** (project `.mcp.json` or global config):
```json
{
  "mcpServers": {
    "rs-pcb-assembly": {
      "type": "http",
      "url": "https://webapp-fawn-seven.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer rs_live_..." }
    }
  }
}
```

**n8n / Make / custom agents** (env vars):
```
RS_MCP_TOKEN=rs_live_...
RS_MCP_URL=https://webapp-fawn-seven.vercel.app/api/mcp
```

The token never expires — only manual revocation via `DELETE /api/admin/api-keys/:id` kills it.

### 20.10 Management UI (`/settings/api-keys`)

All key operations live in the webapp — no CLI. CEO-only page (same gating pattern as `/settings/audit`: redirect to `/login` if no user, redirect to `/` if role is not ceo).

**Layout:**
- Header with back link to `/settings`
- Amber warning callout: "Raw keys are shown ONCE at creation. If you lose a key, revoke it and generate a new one."
- Count strip: "X active · Y revoked"
- "New API Key" primary button
- Table: Name | Role (colored badge) | Created | Last Used (relative time) | Status | Actions

**Create flow:**
1. Click "New API Key" → Dialog opens in form mode
2. Enter name (required, e.g., "Claude Desktop - Anas") + select role (ceo / ops / shop)
3. Submit → `POST /api/admin/api-keys` → on 201, dialog flips to reveal mode
4. Reveal mode shows the raw key in a monospace green-on-black code block with copy-to-clipboard + "Done" button
5. Closing the dialog splices the new key into local list state (instant UI update, no page refresh)

**Revoke flow:**
1. Click "Revoke" on an active row → `window.confirm(...)` asking to confirm
2. On confirm → `DELETE /api/admin/api-keys/:id`
3. Local state update: `revoked_at` timestamp applied to the row → row greys out in place (`opacity-60` + `line-through` on the name)
4. Active count decreases, revoked count increases

**Error handling:** sonner toast (already wired in `app/layout.tsx`) + a dismissable red banner above the table. Both show. Toast is transient, banner persists until the user clicks × — useful for reading error details after the toast disappears.

**Relative time:** inlined inside the client component — `< 1m` → "just now", `< 1h` → `Nm ago`, `< 24h` → `Nh ago`, else `Nd ago`. No new util file needed.

**Files:**
| File | Purpose |
|------|---------|
| `app/(dashboard)/settings/api-keys/page.tsx` | Server component, CEO gate, initial list fetch |
| `components/settings/api-keys-manager.tsx` | Client component — table + dialog + revoke |
| `app/(dashboard)/settings/page.tsx` | Added `Key` icon tile linking to the new page |

---

## Part 21 — Encrypted distributor credentials store + `/settings/api-config`

Added April 14–15, 2026. Lets the CEO/Ops manager rotate distributor API credentials (DigiKey, Mouser, LCSC, etc.) from inside the webapp instead of editing Vercel env vars. Includes a per-distributor "Test Connection" feature that hits the live API with an MPN and shows the raw JSON response.

### 21.1 The schema (migration 031)

```sql
CREATE TABLE public.supplier_credentials (
  supplier              TEXT PRIMARY KEY,
  ciphertext            TEXT NOT NULL,    -- AES-256-GCM, JSON-encoded {iv, tag, ciphertext}
  preferred_currency    TEXT,
  preview               JSONB,            -- masked field-by-field for UI
  configured            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_by            UUID REFERENCES users(id)
);
```

CEO + ops_manager RLS, 4 policies (select/insert/update/delete).

### 21.2 Encryption

- **Algorithm:** AES-256-GCM via Node's built-in `crypto` module
- **Master key:** `SUPPLIER_CREDENTIALS_KEY` env var, base64-encoded 32 bytes. NEVER stored in DB or repo.
- **Per-row:** random 12-byte IV, GCM auth tag, ciphertext — all base64'd into a single JSON string stored in `ciphertext TEXT`
- **Raw key never goes back to the browser:** the `preview` JSONB column stores a masked version (`first4 + bullets + last4`) for display

If `SUPPLIER_CREDENTIALS_KEY` is missing at runtime, the helper functions throw a clear error and the page renders a red error card instead of the manager. **Adding the env var to Vercel does NOT auto-redeploy** — must trigger a fresh build.

### 21.3 Built-in vs custom suppliers (migration 032)

The 12 built-in distributors live in code:

```ts
// lib/supplier-credentials.ts
export type BuiltInSupplierName =
  | "digikey" | "mouser" | "lcsc" | "future" | "avnet"
  | "arrow" | "tti" | "esonic" | "newark" | "samtec" | "ti" | "tme";

export const SUPPLIER_METADATA: Record<BuiltInSupplierName, SupplierMetadata> = { ... };
```

Each entry has: display name, field schema (`{key, label, type, required, options?}`), supported currencies, default currency, docs URL, optional notes.

**Custom suppliers** (added at runtime via the UI) live in `custom_suppliers` table with the same shape. The `getSupplierMetadata(name)` helper checks the built-in constant first, falls back to the DB. `SupplierName` is `string` to allow either source.

```sql
CREATE TABLE public.custom_suppliers (
  name                  TEXT PRIMARY KEY CHECK (name ~ '^[a-z][a-z0-9_-]*$'),
  display_name          TEXT NOT NULL,
  fields                JSONB NOT NULL,
  supported_currencies  TEXT[] NOT NULL,
  default_currency      TEXT NOT NULL,
  docs_url              TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  created_by            UUID REFERENCES users(id)
);
```

Custom suppliers cannot collide with built-in names (validated client AND server side). They get a purple "Custom" badge in the UI and a red "Delete distributor" button.

### 21.4 The pricing-client integration

`lib/pricing/digikey.ts`, `mouser.ts`, `lcsc.ts` were updated to read credentials via:

```ts
async function getDigikeyCredentials(): Promise<DigikeyCreds | null> {
  try {
    const fromDb = await getCredential<DigikeyCreds>("digikey");
    if (fromDb?.client_id && fromDb?.client_secret) return fromDb;
  } catch {}
  // Fall back to env vars (existing Vercel deploy keeps working)
  const client_id = process.env.DIGIKEY_CLIENT_ID;
  const client_secret = process.env.DIGIKEY_CLIENT_SECRET;
  if (!client_id || !client_secret) return null;
  return { client_id, client_secret, environment: "Production" };
}
```

DB wins over env. 60-second module-level cache so we don't hammer the DB on every API call. Currency for outbound API requests now sourced from `getPreferredCurrency(supplier)` instead of hardcoded "CAD".

This means **existing Vercel env vars keep working** — the DB takes over silently the moment the CEO inserts a credential through the UI.

### 21.5 The UI (`api-config-manager.tsx`)

Compact row-based layout matching the CEO's reference screenshot. One row per supplier, sorted alphabetically.

**Collapsed row:**
```
DigiKey                 [CAD ▼]   ● API Set   [Test]   ⌄
```

**Expanded row** (click anywhere on collapsed row to toggle):
- Notes + docs link
- One input per credential field (password fields show "Current: kJuY…sQc4" + placeholder "Leave blank to keep current value")
- "Test the API with a part number" card (input + Test Connection button)
- Save / Test Connection / (Delete distributor for custom only) button row

**Add Distributor flow:**
- "+ Add Distributor" button in panel header → Dialog
- Form: name (lowercase regex), display_name, currency, supported currencies (chip selector), credential fields (dynamic add/remove rows)
- Live validation, reserved-name check, submit disabled until valid
- On submit → row inserted into local list and auto-expanded for credential entry

### 21.6 Test Connection — what each distributor does

| Distributor | Probe | Status |
|---|---|---|
| DigiKey | OAuth → search MPN | full test |
| Mouser | POST search MPN | full test |
| LCSC | SHA1-signed GET search | runs but vendor-blocked |
| TTI | GET search w/ API key | full test |
| Newark | element14 catalog API | full test |
| Samtec | JWT bearer probe | full test |
| TI | OAuth → product probe | full test |
| TME | HMAC-SHA1 signed POST | full test |
| Avnet | OAuth token only (search shape uncertain) | token-only |
| Arrow | OAuth token only | token-only |
| Future | Search probe with auth header | assumption-based |
| e-Sonic | Honest "not testable" — no public docs | N/A |
| Custom | "Custom distributor — no built-in test connection" | N/A |

### 21.7 MPN-driven test + JSON viewer

The Test Connection feature was upgraded after the first round so the CEO can verify with real part numbers and see the raw API response.

**`TestResult` shape:**
```ts
interface TestResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
  raw_response?: unknown;       // decoded JSON body from probe call
  status_code?: number;          // HTTP status
  request_url?: string;          // URL with secrets redacted
}
```

**Per-call MPN:** `testSupplierConnection(supplier, credentials, mpn?)` accepts an optional MPN override. Falls back to per-distributor default (ERJ-2GE0R00X for most, IPL1-110-01-S-D for Samtec, LM358N for TI).

**Secret redaction:** `redactUrl(url, secretParams)` helper strips known secret params before capturing the URL for display. Mouser apiKey, LCSC key/signature/nonce/timestamp, Newark callInfo.apiKey, TTI apiKey. Avnet/Arrow access_tokens replaced with `"<redacted>"` in the captured response body.

**UI viewer:**
- "Test the API with a part number" card inside the expanded panel (input + Test Connection button + Enter-key trigger)
- Result lands → row auto-expands if collapsed
- One-line summary banner (✓ green / ✗ red)
- `Status: 200 • https://api.digikey.com/...` metadata strip below
- Collapsible `<details>` JSON viewer — terminal-styled `<pre>` block (`bg-gray-900 text-green-300`, max-h-96, scrollable)
- Manual × dismiss only — no auto-clear, so the CEO can actually read the JSON

### 21.8 Files

| File | What |
|------|------|
| `supabase/migrations/031_supplier_credentials.sql` | Encrypted credentials table |
| `supabase/migrations/032_custom_suppliers.sql` | Custom distributor metadata table |
| `lib/supplier-credentials.ts` | Crypto + helpers + 12 built-in metadata |
| `lib/supplier-tests.ts` | 12 distributor test functions + MPN-driven probe + JSON capture |
| `app/api/admin/supplier-credentials/route.ts` | GET list |
| `app/api/admin/supplier-credentials/[supplier]/route.ts` | PUT/DELETE/PATCH |
| `app/api/admin/supplier-credentials/[supplier]/test/route.ts` | POST `{mpn?}` test |
| `app/api/admin/supplier-credentials/custom/route.ts` | POST add custom |
| `app/api/admin/supplier-credentials/custom/[name]/route.ts` | DELETE custom |
| `app/(dashboard)/settings/api-config/page.tsx` | CEO-gated server page |
| `components/settings/api-config-manager.tsx` | The whole interactive UI |
| `app/(dashboard)/settings/page.tsx` | "API Configuration" tile |

All routes share the same cache and enrichment logic — no duplication.

---

## PART 22 — Custom Quantities, CPC Cleanup, Auto-PCB (Entry 44, April 15 2026)

### 22.1 The Reality of Customer Purchase Orders

When we send a quote to a customer, we quote 4 price tiers: 50 / 100 / 250 / 500 units. The customer sees per-unit prices that get cheaper at higher quantities — that's how we win business, volume discounts.

But customers don't always buy in those exact tier sizes. A Lanka engineer looks at our quote, sees that 50 pcs is $637/unit and 100 pcs is $624/unit, and then cuts a PO for **75 pcs**. Now what?

**The business rule (from Anas, 2026-04-15):** the customer pays the unit price of the **next lower tier**. Ordering 75 uses the 50-unit price ($637/unit). Ordering 120 uses the 100-unit price ($624/unit). Ordering 49 falls below the smallest tier, so it still uses the 50-unit price (we don't extrapolate down — it would be loss-making).

Why not average between tiers? Because our costing isn't linear — setup costs, NRE, and overage attrition are step functions, not continuous. Using the next-lower-tier's price is a conservative rule that protects margin.

### 22.2 How the Create Job Dialog Handles This

[components/quotes/quote-actions.tsx](components/quotes/quote-actions.tsx) — after a quote is marked `accepted`, clicking "Create Job" opens a dialog. The dialog shows:
1. **Tier picker** — 4 cards (one per quoted tier). Click to select the canonical tier price.
2. **Custom quantity input** — "Or enter custom order quantity" text field. Typing a number clears the tier picker. It computes live:
   - Finds the highest quoted tier whose `board_qty ≤ customQty` (or falls back to the smallest tier).
   - Displays: "Pricing from the 50-unit tier ($637/unit) → $47,781 for 75 units".
3. **Create Job button** — submits `POST /api/jobs` with the effective quantity. The API is unchanged — it always took `quantity` directly; we're just sending a non-tier value now.

The job's `quantity` column is authoritative. The per-unit price is **not** stored on the job (it can always be re-derived by looking up the quote's tiers and applying the "next lower tier" rule). When the invoice is generated later, it reads the job quantity, re-resolves the tier, and computes the line total.

### 22.3 Lanka CPC Deduplication

Lanka's BOM files follow `columns_fixed: ["qty", "designator", "cpc", "description", "mpn", "manufacturer"]`. Fine on paper — position 2 is CPC. But in the actual files Piyush sends us, position 2 contains **the same MPN string as position 4**. Lanka doesn't have a real internal part code system; they use the manufacturer part number as their own CPC.

The parser correctly preserves whatever the file contains, so CPC and MPN display as identical. Piyush complained that it was noise — he couldn't tell at a glance whether a row had a real CPC or not.

**Fix:** [lib/bom/parser.ts:161-175](lib/bom/parser.ts#L161-L175). After extracting `cpc` and `mpn` from the row, if `cpc.trim() === mpn.trim()`, store `null` for CPC. The table now shows `—` in the CPC column for Lanka rows, and real CPCs (from Legend, Signel, GoLabo, etc. which have internal part numbering) still render correctly.

This is a **display-layer dedup**, not a data transformation — the original file is untouched in Supabase Storage. Any future consumer (M-code classifier, API pricing) reads the same `cpc` field; it's just `null` instead of `"same as MPN"`.

### 22.4 Auto-PCB Resurrection

Rule 8 in the 9 CP IP BOM rules is **Auto-PCB from Gerber**: if the customer's BOM has no PCB row, fabricate one. On 2026-04-14 Anas told me to disable this because "the GMP itself represents the board". On 2026-04-15 he reversed that: operators want a PCB row visible in the BOM table always, because:

- The quote engine needs a PCB line to attach the board fab cost to.
- Procurement generates a purchase order against the PCB line when ordering from the fab house (WMD, Candor, PCBWay).
- Having the PCB show as "missing" in the table was confusing shop floor.

**Re-enabled fallback chain** [lib/bom/parser.ts:186-220](lib/bom/parser.ts#L186-L220):
1. **GMP number** — if the user uploaded the BOM against GMP `TL265-5040-000-T`, synthesize `PCB1 | TL265-5040-000-T | Lanka Test Board`. This is the preferred path — the GMP is authoritative.
2. **Filename extraction** — strip `BOM_`, `CP_IP_`, file extension, `RevX`, date suffixes. `BOM_TL265-5040-000-T_RevB.xlsx` → `TL265-5040-000-T`.
3. **Both fail** — log `AUTO-PCB-FAIL` and continue without a PCB row. The BOM still parses, but procurement will need to add the PCB manually.

The synthesized row has `is_pcb: true` so it pins to the top of the sorted output (Rule 9), and downstream classification skips it (PCB rows don't get M-codes).

### 22.5 The Filter Bar Everyone Missed

Commit fdb29ae (Apr 14) built a full filter + search panel for the BOM detail view: search input, M-code multi-select chips, "show only unclassified" toggle. Piyush's feedback came from an older cached deploy so he asked for it again.

Rather than re-implement, I made the existing panel **visually unmissable**: blue-tinted border, "FILTER & SEARCH" heading with a search icon, expanded search placeholder to mention every searchable field. [components/bom/bom-table.tsx:222-250](components/bom/bom-table.tsx#L222-L250).

**Lesson:** next time a user reports "feature X is missing" and the code clearly has feature X, check the deploy date first before writing new code. It's been a recurring pattern — Piyush lives on a different schedule (he's 9.5h ahead in India) so when he looks at the Vercel preview URL between deploys, he sometimes sees stale state.

### 22.6 Component Database Edit Button

[app/(dashboard)/settings/components/page.tsx](app/(dashboard)/settings/components/page.tsx) already had inline edit: clicking the M-code badge opens a dropdown. But the badge looked like a read-only label, so Anas kept not realizing it was editable.

Added an explicit `Pencil` icon button next to the `Trash2` delete button in the Actions column. Clicking it calls `startEdit(comp)` — same code path as clicking the badge. Actions column widened 16 → 24 to fit both icons.

### 22.7 The DM Pricing Parameters Gap

`lib/pricing/engine.ts` has defaults for everything: component markup 20%, PCB markup 30%, SMT $0.35/placement, TH $0.75/placement, labour $130/hr, setup time, programming time, NRE components. These are **placeholder values from CLAUDE.md**, not the real numbers from DM Common File V11.

Until Anas exports the Size Table, MachineCodes, and Admin sheets from DM V11, **quotes generated by the web app will NOT match quotes generated by the Excel DM**. This is a data-import task, not a code task. It's been flagged in every session since Sprint 3 started. The webapp will produce internally-consistent quotes but they'll be wrong by whatever delta exists between our placeholders and the real DM numbers.

**Action item owned by Anas:** open DM Common File V11, export Size Table / MachineCodes / Admin tabs to CSV, send to Abdul. Abdul seeds them into `pricing_rules` + `m_code_rules` + `overage_table`. Until then, every quote needs a human review before being sent.

*Part 22 last updated: April 15, 2026, Session 11*

---

## PART 23 — Ingesting the DM V11 Admin File (April 15, 2026)

### 23.1 What Anas Sent

One xlsx file: `admin file.xlsx`, 20 KB, three sheets. This is the authoritative export of the classification rules from DM Common File V11. Before today we had been working off an extract Abdul made on April 14 from the VBA source code (`mod_OthF_Digikey_Parameters.bas`). That extract was *almost* right but missed a handful of entries that only exist in the workbook's worksheet data, not the VBA code.

The three sheets:
1. **Admin** — 47 PAR (Parameter) rules. These are conditional M-code assignments keyed on mounting type, sub-category, description keywords, etc. Each rule has up to two conditions (field + operator + value) and produces one M-code. Example: `PAR-01: mounting_type equals "Through Hole" → TH`.
2. **Size Table** — 5 rows mapping length × width ranges (mm) to size-tier M-codes: 0201, 0402, CP, CPEXP, IP. Used by the size-rank algorithm in `vba-algorithm.ts`.
3. **MachineCodes** — 238 rows mapping package keywords ("SOIC-8", "DPAK", "TO-92", etc.) to M-codes. This is the big lookup table that the classifier's Layer 1b uses to short-circuit obvious classifications without hitting the AI layer.

### 23.2 What Was Already Right

Migration 026 (April 14) and `lib/mcode/vba-algorithm.ts` had been built from the VBA-source extract. Diffing the new file against what we already had:
- **Size Table** — 100% match. No update needed.
- **47 PAR rules** — 46 of 47 already present. The one missing: **PAR-02A**.
- **MachineCodes** — 233 of 238 already present. Five new ones.

So today's ingest was small — a refresh delta rather than a from-scratch seed.

### 23.3 The Five New MachineCodes

| Keyword | M-code | Why it matters |
|---|---|---|
| `8-MSOP` | CPEXP | MSOP-8 variant naming — different distributors use different dash positions |
| `1806` | CP | Smaller capacitor package, bumps to CP |
| `DO-214BA` | CP | SMD diode package variant |
| `806` | CP | Metric-format 0806 (resistor/cap) |
| `16-TSSOP` | IP | TSSOP-16 with the dash — distributor naming inconsistency |

Four of these (`8-MSOP`, `16-TSSOP`, `1806`, `806`) are **naming variants** of packages we already had (MSOP8, TSSOP16, 1806, 0806). They exist because DigiKey and Mouser format their `Package/Case` field inconsistently — sometimes with dashes, sometimes without, sometimes with size prefixes. Every variant we miss is an extra AI call we could have avoided.

`DO-214BA` is new data — not a variant, just a package we hadn't seen before.

### 23.4 PAR-02A — The New Rule

```
PAR-02A: mounting_type equals "Panel Mount, Through Hole, Right Angle" → TH
```

Very specific string match. Covers right-angle panel-mounted through-hole connectors — things like side-exit PCB headers that mount through the board but pointing sideways off the panel. The old code would have fallen through to the generic "Panel Mount" rule (PAR-47) which also gives TH, so the final classification was right — but now it happens via a specific-rule hit with higher confidence instead of a generic fallthrough.

Added to `vba-algorithm.ts` as an explicit `if (mounting === "Panel Mount, Through Hole, Right Angle")` short-circuit at the top of `applyVbaAlgorithm` so it fires without a DB round trip.

### 23.5 How This Got Applied

Migration 033 — additive, idempotent, `ON CONFLICT DO NOTHING` on both inserts. Applied to the live Supabase DB via `apply_migration`. Confirmed afterwards:
- `mcode_keyword_lookup`: 211 → 216 active rows (+5 as expected)
- `m_code_rules`: 43 → 44 active rows (+1 PAR-02A)

Seed CSVs in `supabase/seed-data/dm-file/` were rewritten byte-for-byte from the xlsx source so they stay in sync. The xlsx source itself is archived at `supabase/seed-data/dm-file/_SOURCE_admin_file_2026-04-15.xlsx` with a prefix that makes it clear it's raw source data, not a seed.

### 23.6 The DB Drift Problem

When I queried the live DB before applying migration 033, it had **211 keywords and 43 PAR rules**, not the 218 / 47 that migration 026 was supposed to insert on April 14. Either:
- Migration 026 partially failed silently during apply
- Some rows got deactivated (`is_active = false`) after insert
- Migration 026 was edited and some rows quietly removed

Didn't investigate. Migration 033 is additive and doesn't care about the pre-existing state, so today's ingest isn't blocked. But **someone needs to re-seed the full 218 / 47 from the current CSVs** to guarantee the live DB matches the source of truth before Sprint 3 pricing verification. Flagged as a Sprint 3 cleanup task owned by Abdul.

### 23.7 What This File Did NOT Give Us

`admin file.xlsx` is the **classification** data export. It does NOT contain:
- Component markup percentages (currently placeholder 20%)
- PCB markup (placeholder 30%)
- Labour rates ($130/hr placeholder)
- SMT / TH / MANSMT per-placement costs ($0.35, $0.75, ? placeholder)
- NRE breakdowns (stencil, setup, programming, misc)
- Setup time + programming time defaults

Those live in different tabs of the main DM Common File V11 workbook — probably in "Admin", "Rates", "Settings", or similar. Anas still needs to export those separately. Until he does, **every quote the web app produces will drift from DM Excel output** by whatever delta exists between CLAUDE.md placeholders and the real rates.

The DM-pricing-params-pending memory entry stays OPEN.

*Part 23 last updated: April 15, 2026, Session 11 (DM Admin ingest)*

---

## PART 24 — Reading Pricing Out of the VBA Code (April 15, 2026)

### 24.1 Why We Did This

The DM pricing parameters (markup, labour, SMT rate, NRE breakdowns) have been flagged as BLOCKED in every session since Sprint 3 started. Anas kept saying "I'll export the sheet later" and never did. Today he flipped the ask: **"seed it from the VBA code alone"**. OK. Let's see what the VBA code actually has.

VBA workbooks in `All vba codes/` contain the full macro source for every DM/TIME/PROC/Job Queue/Invoice template. The most interesting one for pricing is `DM Common File - Reel Pricing V11/Calculation_V1.bas` (the active BOM calculation routine) and `Generate_TIME_File_V4.bas` (the macro that used to populate the TIME workbook's Settings sheet with default values before every quote run).

### 24.2 What The VBA Actually Contains

**`Calculation_V1.bas` — active code, runs on every quote:**

```vba
shipping = 200           ' line 121
markup = 0.3             ' line 122 — this is PCB markup
```

So shipping flat is $200 and PCB markup is 30%. These are literal hardcoded constants in the actively-executing calculation routine. High confidence.

**`Generate_TIME_File_V4.bas` — commented-out legacy initialization code:**

```vba
''        Dim m As Integer
''        For m = 1 To 4
''            Set_Labour_Rate_Rng.Offset(m, 0).value = 130     ' line 858
''            Set_SMT_Rate_Rng.Offset(m, 0).value = 165        ' line 860
''        Next m
''        'TimeWS.Range("F15:F18") = 0.3        ' standard PCB Markup       line 862
''        'TimeWS.Range("H15:H18") = 0.3        ' standard components markup line 863
```

These are **commented-out** with `''` (double apostrophe, the VBA idiom for legacy-but-keep-for-reference). They represent the default values that the TIME file's Settings sheet used to be populated with at quote-creation time. At some point someone switched this off so the Settings sheet could be edited by hand without being reset on every run.

So these aren't "live" defaults in the sense that they're applied today — they're the BASELINE numbers that RS started with:
- Labour rate: **$130/hr**
- SMT rate: **$165/hr**
- PCB markup: **30%** (matches Calculation_V1.bas — internally consistent ✓)
- Component markup: **30%**

The current DM workbook's Settings sheet could have different values now if Anas has been tweaking them manually. But without opening the xlsx in Excel, the VBA code is our only source of truth, and these are the values it tells us to seed.

### 24.3 Mapping VBA → app_settings

Before this session, `app_settings.pricing` in the live DB had these values:

| Field | Value | Source |
|---|---|---|
| component_markup_pct | 20 | Migration 006 placeholder from CLAUDE.md |
| labour_rate_per_hour | 75 | Migration 006 placeholder |
| smt_rate_per_hour | 165 | ✓ already matched VBA (from some prior edit) |
| pcb_markup_pct | 30 | ✓ already matched |
| default_shipping | 200 | ✓ already matched |

Two values were stale. Today's update fixed them: **component_markup 20 → 30, labour_rate 75 → 130**. Also added `_vba_sourced: true` and `_vba_sourced_at: '2026-04-15'` as JSONB audit flags so future sessions know the provenance.

### 24.4 What's Still Not From VBA

These live in `app_settings.pricing` but are NOT in the VBA source. They were placeholder guesses from CLAUDE.md and we can't seed them from VBA alone:

- `smt_cost_per_placement`, `th_cost_per_placement`, `mansmt_cost_per_placement` — per-placement cost model. The real DM formula is `time × hourly rate`, not `placements × flat cost`. The web app's engine.ts uses the simplified per-placement approach as an approximation. To match DM exactly, we'd need the `smt_hours` calculation formula from the Settings worksheet.
- `setup_time_hours`, `programming_time_hours` — per-BOM lookup. `Calculation_V1.bas:185-195` shows the "Programming" worksheet has a table that maps BOM line count + single/double-side → programming fee. That data is in worksheet cells (rows 2..N of the Programming sheet), not in VBA. Without the xlsx open, we can't extract it.
- `nre_programming / nre_stencil / nre_pcb_fab / nre_misc` — NREs are entered PER-BOM by Piyush in the DataInputSheets sheet. Never hardcoded. There's no "default" — each board gets its own figures.

### 24.5 The DB Drift Fix

Separate task in this same session: migration 033 (earlier today) noted that the live DB had 211 keywords / 43 PAR rules, not the 218 / 47 that migration 026 was supposed to insert on April 14. Several rows went missing somehow. Migration 034 fixes this by `TRUNCATE + INSERT` — full reseed from the current CSVs (which themselves were rewritten from `admin file.xlsx` in entry 45).

Post-reseed state (verified via `SELECT COUNT(*)`):
- 48 PAR rules (47 from DM + PAR-02A from entry 45)
- 224 unique keywords (Piyush's April 14 extract had 218; today's source-of-truth has 224)

No more drift. If the app_settings-style silent failure ever happens again (e.g. "why does the DB have N rows when migration X inserted M?"), the first check is always: **did any `BEFORE` / `AFTER` trigger on the target table silently reject inserts?** Which brings us to…

### 24.6 The Audit Trigger Bug (audit_trigger_func is partially broken)

Migration 024 applied an audit trigger to `app_settings` using the same `audit_trigger_func()` as every other audited table. But the function body uses `NEW.id` to populate `audit_log.record_id`:

```sql
IF TG_OP = 'INSERT' THEN
    _record_id := NEW.id;      -- ← breaks when table PK is not `id`
```

**`app_settings` has no `id` column.** Its primary key is `key TEXT`. So every UPDATE to the pricing row has been failing with `ERROR: 42703: record "new" has no field "id"` since migration 024 landed. We never noticed because nothing in the app's server-side code was actually trying to update pricing settings until today.

I hit this when trying to apply migration 034's UPDATE step. Fix was simple: DROP the broken trigger (migration 034a), then apply the reseed (034b), then add `COMMENT ON TABLE app_settings` documenting why auditing is disabled until the function is fixed.

I also ran this diagnostic query to find any OTHER audited tables lacking an `id` column:

```sql
SELECT t.event_object_table
FROM information_schema.triggers t
WHERE t.action_statement LIKE '%audit_trigger_func%'
GROUP BY t.event_object_table
HAVING NOT EXISTS (
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_name = t.event_object_table AND c.column_name = 'id'
);
```

Result: `app_settings` is the only one. Good — no other silent failures lurking.

**Sprint 3 cleanup:** rewrite `audit_trigger_func()` to detect the PK column dynamically from `pg_index` + `information_schema`, then re-enable `audit_app_settings`. Auditing rate changes is genuinely useful — Anas wants to know when someone bumps the labour rate — we just can't have it until the trigger function handles text PKs. Ticket it.

### 24.7 What Happens to Quotes Now

Every new quote generated after this session will use:
- Component markup 30% (was 20% — **quotes will be ~10 percentage points higher**)
- Labour rate $130/hr (was $75/hr — **labour cost calculations will be ~73% higher** than before for any quote that uses the labour_rate_per_hour setting)
- Everything else unchanged

**Heads up:** open quotes that were already generated with the old 20%/75% numbers are NOT recomputed by this change. Their `pricing` JSONB was written at quote-generation time. If we need them refreshed, that's a separate "recompute all open quotes" task — probably one line per quote in the jobs queue calling `recompute.ts`.

Also: any quoted batch that was captured with `component_markup_pct: 20` will continue using that value because it's stored on the batch row. New batches will pick up 30% via the updated `?? 30` fallback in `run-pricing/route.ts`.

### 24.8 What To Do If Anas Ever Sends the Real Settings Export

When/if the DM Settings sheet export arrives:

1. Diff the new values against the `_vba_sourced` ones in app_settings.pricing. If they're materially different, Anas has been tweaking rates and the VBA defaults are stale.
2. Update app_settings.pricing with the new values, and flip `_vba_sourced: false` + add `_real_sourced_at: '<date>'`.
3. Re-flag open quotes that need recomputation.
4. The programming fee lookup table goes into a new `programming_fees` table, and setup_time_hours becomes a derived value, not a stored default.

*Part 24 last updated: April 15, 2026, Session 11 (DB reseed + VBA pricing)*

---

## PART 25 — AI Agents in the Repo, What They Do, and How We See What They're Doing (April 15, 2026)

### 25.1 The Three Live AI Things

The webapp has **three** Claude/AI integration surfaces, each with a different job:

**1. M-code AI classifier** — [lib/mcode/ai-classifier.ts](lib/mcode/ai-classifier.ts)

The BOM classifier has a 4-layer pipeline:
- Layer 1a: database lookup (is this MPN already in `components` table?)
- Layer 1b: keyword lookup (does the package name match one of our 224 keywords?)
- Layer 2: PAR rules (description contains "HEATSINK" → MEC, etc.)
- Layer 3: **Claude** — last-resort fallback

Per Piyush's 2026-04-14 feedback, Claude does NOT pick the M-code itself. It only returns physical parameters (`mounting_type`, `length_mm`, `width_mm`, `package_case`, `category`, `sub_category`, `features`, `attachment_method`). Those parameters then feed the deterministic VBA algorithm in [vba-algorithm.ts](lib/mcode/vba-algorithm.ts). The VBA code decides the M-code using the same size-rank logic as the original `mod_OthF_Digikey_Parameters.bas` macro. This keeps Claude out of subjective judgment calls.

Model: `claude-haiku-4-5-20251001` (the cheap fast one). Average latency ~1.5s per component. Called in batches of 10 parallel calls for BOM-level classification.

**Critical insight from entry 47's audit:** after today's reseed, **only 9.5% of BOM lines actually fall through to Claude.** The keyword table catches 78% on its own. See `HANDOFF.md` entry 47 for the full layer-by-layer breakdown.

**2. BOM column AI mapper** — [lib/bom/ai-column-mapper.ts](lib/bom/ai-column-mapper.ts)

When a customer uploads a BOM with weird column headers (`"Qté"`, `"成本"`, `"P/N"`, `"Ref"`, `"Position sur circuit"`, etc.), the deterministic keyword-based column detector in `column-mapper.ts` runs first. If it can't identify the qty/designator/mpn columns, this AI fallback kicks in. Claude sees the headers + 5 sample rows and returns a JSON mapping.

Same model as classifier (Haiku 4.5). Only fires on upload, only when deterministic parsing fails — so typical usage is a few calls per week, not per BOM.

**3. In-app chat assistant** — [app/api/chat/route.ts](app/api/chat/route.ts) + [components/chat/ai-chat.tsx](components/chat/ai-chat.tsx)

This is the big one. 1229 lines of route handler with **38 tools** covering every major domain. The user clicks the chat icon, sees a sidebar, and talks to Claude like it's an employee:

- **Read tools:** listCustomers, getCustomer, businessOverview, listQuotes, listJobs, listInvoices, searchAll, listNCRs, getBGStock, getJobSerials, getJobDetail, getBomLines, getJobProfitability, getPricing, getProductionSchedule, getLabourCost, getAgingReport, listProcurements, getWorkflowGuide
- **Classify tools:** classifyComponent, classifyBomLine, classifyBomBatch, correctMCode
- **Action tools (mutating):** updateJobStatus, createProcurement, generateSerials, logProductionEvent, createQuote, updateQuoteStatus, createJobFromQuote, scheduleJob, createInvoice, markInvoicePaid, orderProcurementLines, receiveProcurementLine, createNCR, updateCustomer, generateDocument

"Create an invoice for job JB-2604-TLAN-003" → the chat agent looks up the job, pulls its pricing from the linked quote, generates the invoice PDF, marks the job as `invoiced`, and tells the user the URL. No clicking.

Uses Vercel AI SDK (`@ai-sdk/anthropic` + `streamText`) with `claude-sonnet-4-20250514` — more capable than Haiku, slower, handles complex tool orchestration. Page-context aware: detects which URL the user is on and injects a summary of that entity into the system prompt so Claude knows "the user is looking at quote QT-2604-013" without being told.

Conversations are persisted in `chat_conversations` + `chat_messages` tables. File uploads work too (images, PDFs attached to messages).

Role-gated: shop floor users get a stripped-down tool set (no writes).

### 25.2 The Fourth Thing: The MCP Server

The MCP (Model Context Protocol) server at [app/api/mcp/route.ts](app/api/mcp/route.ts) is different from the chat agent. It's not a chat at all — it's an **endpoint that any MCP-compatible AI can connect to and use as a business-context layer.**

When Anas wants Claude Desktop to know about RS, he adds this to his `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rs-pcb-assembly": {
      "url": "https://webapp-fawn-seven.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer <his-supabase-jwt>" }
    }
  }
}
```

From that moment on, every conversation he has with Claude Desktop has access to tools like `rs_list_jobs`, `rs_get_customer`, `rs_get_profitability` — same shape as the chat tools but exposed over MCP. No duplicate chat window, no separate UI. Claude Desktop just knows how to query RS.

This uses `WebStandardStreamableHTTPServerTransport` (stateless — a new McpServer instance is built per request by `buildMcpServerForRole()` in [lib/mcp/server.ts](lib/mcp/server.ts)). 20 tools grouped by domain: overview, customers, boms, quotes, jobs, procurement, production, invoices, inventory, search. Role-gated via `allowedToolsForRole()` in [lib/mcp/auth.ts](lib/mcp/auth.ts).

**Why this matters strategically:** the MCP server is what makes RS AI-native instead of AI-bolted-on. Any AI tool Anas adopts — today's Claude Desktop, tomorrow's whatever — plugs into the same business context automatically. No re-integration. No duplicate schemas. RS's operational knowledge becomes a structural advantage that compounds every time a new AI capability ships.

### 25.3 What Got Deleted Today

Entry 47's audit found two things that needed to go:

**`erp-rs-mcp/`** (67 MB standalone package) — this was the original stdio-transport MCP server from April 6. Anas's idea was "run it locally via `npx erp-rs-mcp --transport stdio` for developer CLIs". A week later the team built the same functionality inside the webapp as `/api/mcp` (streamable HTTP, safer for serverless). The standalone package was never updated. Diffing `erp-rs-mcp/src/tools/*.ts` against `lib/mcp/tools/*.ts` showed all 10 tool files had drifted — different implementations, different queries. Nothing in the webapp imported from it. Deleted.

**`app/api/mcp/classify/route.ts` + `app/api/mcp/overview/route.ts`** — two JSON-REST shim endpoints. The doc said they were "for backwards compatibility with the in-app Chat", but grepping every TypeScript file in the repo found zero callers. The chat route imports `classifyWithAI` directly from the library. These endpoints were leftovers from before the full MCP transport was wired up. Deleted.

**Lesson:** documentation drift is real. The doc claiming "keep this for chat compatibility" was written before the chat route existed, and nobody updated it when reality changed. Grepping beats trusting docs every time.

### 25.4 AI Telemetry — Why and What

Before today there was zero visibility into AI usage. Anas couldn't answer:
- "How much am I spending on Claude per month?"
- "Why are BOM uploads slow sometimes?"
- "Is the classifier actually using Claude less after the reseed, or am I just hoping?"
- "Are any of my AI calls failing in production?"

The fix is [lib/ai/telemetry.ts](lib/ai/telemetry.ts) + migration 035 (`ai_call_log` table). Every AI invocation writes one row. The schema captures purpose, model, token counts, latency, success/failure, and context (bom_id, mpn, conversation_id, user_id) where available.

**Insertion pattern:** fire-and-forget. The wrapper catches any telemetry error and logs it to the console — a Supabase outage on the log table should never break an actual AI call. This is important because the classifier runs during BOM uploads; a telemetry failure should not fail the upload.

**Instrumentation:** all three Live AI surfaces now call `recordAiCall()` on success and failure:
- `ai-classifier.ts` records token counts from `response.usage` (Anthropic SDK returns them on every call).
- `ai-column-mapper.ts` same pattern.
- `app/api/chat/route.ts` uses the Vercel AI SDK's `onFinish` callback, which fires after the full stream completes and hands you `usage.inputTokens` / `usage.outputTokens`. Also wired an `onError` callback for error capture.

**Reading it:** the RLS policy lets CEO + Operations Manager SELECT from the table. Regular users can't. The wrapper uses the admin client with the service role to insert, bypassing RLS entirely — so telemetry writes succeed regardless of who triggered the AI call.

**The follow-up you'll want:** a Settings → AI Usage page that renders daily/weekly/monthly charts of calls per purpose, token spend, latency distribution, error rate. It's just a SQL query plus a Recharts line chart. Maybe 2-3 hours of work. Deferred to when Anas actually asks "show me this month's AI bill".

### 25.5 The Deferred Refactor: Chat Tools ↔ MCP Tools

Nine of the chat agent's 38 tools duplicate logic that also exists in `lib/mcp/tools/*`. Two separate implementations of "list customers by filter", two separate "get job detail" queries, etc. When someone fixes a bug in one ("make the customer search case-insensitive"), the other drifts out of sync.

The right fix is to refactor the chat tools to import from `lib/mcp/tools/*` instead of re-implementing queries. It's a 30-60 minute task with side-by-side diffing to make sure the shapes match. Not urgent — the two currently agree on the important stuff — but worth doing before they drift meaningfully.

Saved to entry 47 as a known follow-up.

### 25.6 What's Still Missing

- **Keyword suffix variants** to catch the 15 word-boundary near-misses found in the classifier simulation (1206L, SOD323F, HTSSOP-16, STQFP100, etc.). Trivial data migration. Pushes auto-classification from 90.5% → 95%+.
- **AI Usage dashboard page** (`/settings/ai-usage`). SQL queries already work, just needs a frontend.
- **Keyword learning loop** — right now, when Claude classifies a component via Layer 3 AI, the result is saved to `components` table but the PACKAGE_CASE value isn't added to `mcode_keyword_lookup`. If Claude tells us `HTSSOP-16 → IP`, we should add `HTSSOP-16` as a keyword automatically so the next same-package part never needs Claude. Probably worth a small background worker that watches for new `components` rows and derives keyword candidates.
- **Vercel AI Gateway** migration — would give us provider failover and a unified observability dashboard, but entry 47's own telemetry solution covers most of the "I want to see usage" use case in our own DB. Deferred unless we want to try non-Anthropic models.

*Part 25 last updated: April 15, 2026, Session 11 (AI audit + telemetry)*

---

## PART 26 — Reading the Real Pricing Out of the DM and TIME Workbooks (April 15, 2026)

### 26.1 Why Entry 46 Was Wrong

In entry 46 I "seeded the pricing params from the VBA code alone" because Anas hadn't exported the DM Settings sheet. I grepped for hardcoded values in the `.bas` files, found `labour = 130`, `smt = 165`, `markup = 0.3`, and seeded those into `app_settings.pricing`. Good enough, right?

Wrong. The VBA code I grepped was **commented out** with `''` prefixes. It was LEGACY initialization code — values that the TIME Settings sheet used to be populated with at quote-creation time before someone turned off the auto-init and started hand-tuning. The live values in the actual TIME V11 workbook today could be anything.

Turns out they ARE different. The TIME V11 `final` sheet rows 15-18 show:

```
row 15 (Qty 1):  labour=130  SMT=165  PCB markup=0.25  Component markup=0.25
row 16 (Qty 2):  labour=130  SMT=165  PCB markup=0.25  Component markup=0.25
row 17 (Qty 3):  labour=130  SMT=165  PCB markup=0.25  Component markup=0.25
row 18 (Qty 4):  labour=130  SMT=165  PCB markup=0.25  Component markup=0.25
```

Labour and SMT rates match. Markups are **25%, not 30%**. Entry 46 was wrong by 5 percentage points on both markups.

### 26.2 What This Actually Means for Quotes

When a quote calculates `component_cost = sum(unit_price × qty × (1 + markup))`:
- Entry 46 (30% markup): each dollar of component cost → $1.30 billed
- Reality (25% markup): each dollar → $1.25 billed

On a $5000 component BOM, that's a $250 difference per tier. For a 4-tier quote that's potentially $1000 overcharged across all tiers if the customer buys at every tier (they don't, but you see the scale).

**The critical thing to remember:** if you look back at today's chat history, git log, or HANDOFF entry 46, you'll see the number 30 everywhere. That was based on stale VBA comments. The correct number is 25, as of 2026-04-15 migration 036. Don't go back and retroactively re-invoice anything using 30.

### 26.3 How I Got the Real Values

Anas told me "do what you gotta do bro im anas force your entrance into it idc" and "make like a duplicate or something and work with that". Translation: stop waiting for a clean export, read the xlsm files directly, but don't touch his live copies.

So I:
1. Found `DM Common File - Reel Pricing V11.xlsm` (9.2 MB) at `/Users/rselectronicpc/Downloads/RS Master/2. DM FILE/`
2. Found `TIME V11.xlsm` (561 KB) at `/Users/rselectronicpc/Downloads/RS Master/6. BACKEND/TIME FILE/`
3. Copied both into `supabase/seed-data/dm-file/` prefixed with `_SOURCE_` so they're clearly frozen provenance artifacts
4. Read them with `openpyxl.load_workbook(path, data_only=True, keep_vba=False)` — the `data_only=True` makes openpyxl resolve formulas to their cached values instead of formula strings, and `keep_vba=False` avoids any VBA-related side effects
5. Never touched the originals in Downloads again

This is now the documented pattern: whenever we need data from an Excel file, copy it into `supabase/seed-data/dm-file/_SOURCE_<NAME>_<DATE>.xlsm` first, then work off the copy. Gives us a version-controlled audit trail and zero risk to the live business files.

### 26.4 The Programming Fee Lookup Table

The DM workbook has a dedicated "Programming" sheet with a 28-row lookup table:

| BOM lines | Additional cost | Standard price | Double side price |
|---|---|---|---|
| 1    | $50 | $300  | $400  |
| 40   | $50 | $350  | $450  |
| 50   | $50 | $400  | $500  |
| 60   | $50 | $450  | $550  |
| 70   | $75 | $525  | $625  |
| ...  | ... | ...   | ...   |
| 300  | $75 | $2250 | $2350 |

Query pattern (implemented in `lib/pricing/programming-cost.ts` today, but needs updating to read from the DB):

```sql
SELECT * FROM programming_fees
WHERE bom_lines <= :component_count
ORDER BY bom_lines DESC
LIMIT 1;
```

Pick `standard_price` for single-side boards or `double_side_price` for double-side boards. That number is the NRE1 (programming fee) for the job.

The Programming sheet also has a small sidebar table with "Type of Board" setup fees — Standard = $250, Double Side = $350. Those are now in `app_settings.pricing.board_setup_fee_standard` / `.board_setup_fee_double_side`.

Migration 036 created the `programming_fees` table and seeded all 28 rows. Seed CSV is at `supabase/seed-data/dm-file/programming_fees.csv` for version control.

**Not yet wired in:** `lib/pricing/engine.ts` still computes programming cost as `settings.programming_time_hours × settings.labour_rate_per_hour`, which is the simplified flat model. The actual DM behavior is the lookup table. Switching engine.ts to query `programming_fees` is a ~30-60 min task, flagged as a follow-up.

### 26.5 The SMT Time Model (Discovered, Not Ported)

TIME V11's Settings sheet is spectacular. It's an 82-row map of named ranges to cell addresses. Examples:

- `Set_SMT_Placement_Rng` → cell `AD3` = "total number of smt placement per pcb"
- `Set_CP_Feeders_Rng` → `AD4` = "# of CP feeders"
- `Set_Total_Printer_Time_Rng` → `B16` = "Total Printer Setup Time"
- `Set_Total_Setup_Time_Rng` → `B26` = "Total Setup Time"
- `Set_CP_CPH_Rng` → `B44` = "SMT CPH" (Components Per Hour for CP machine)
- `Set_IP_CPH_Rng` → `B59` = "IP CPH"

The `final` sheet row 30-31 shows these CPH values:
```
Row 30: 'CP CPH'    4.5
Row 31: 'IP CPH'    2 seconds (datetime.timedelta in the raw read)
```

The business logic (based on how the cells reference each other) is:
```
smt_hours = (total_placements / cp_cph) + (ip_parts / ip_cph) + setup_time + programming_time
labour_cost = smt_hours × labour_rate + placement_time × smt_rate
```

**This is a fundamentally different cost model from what `lib/pricing/engine.ts` currently implements.** The engine uses `placements × flat_cost_per_placement` which is a zeroth-order approximation. The real DM formula is time-based: placement count divided by a "components per hour" rate, plus setup time dependent on feeder counts, times an hourly wage.

Porting this is a 4-6 hour task:
1. New config keys (`cp_cph`, `ip_cph`, `th_placement_time`, `setup_time_per_feeder`, `printer_load_time`, `stencil_load_time`, ~20 values)
2. Rewrite the SMT cost calculation in `engine.ts` to use the time formula
3. Compare output against DM Excel on 5-10 real quotes to regression-test
4. Decide what to do with quotes already issued using the simplified model

**Flagged for a dedicated session.** Not done today because Anas said don't break anything, and rewriting the pricing engine across 6+ call sites qualifies as "potentially breaking".

### 26.6 Entry-46 vs Entry-48 Reconciliation

If you grep HANDOFF.md for markup values, you'll see both `30` (entry 46) and `25` (entry 48). The WINNER is entry 48. The DB truth is now 25%. Entry 46's migration 034 set it to 30, then entry 48's migration 036 overwrote it with 25.

If you ever see `_vba_sourced: true` in `app_settings.pricing` WITHOUT `_xlsm_sourced: true`, that's a pre-entry-48 snapshot and its markup values are wrong. The `_xlsm_sourced: true` flag is how future sessions know the current row was seeded from the actual xlsm, not from VBA comments.

### 26.7 What's Still Missing

Even after entry 48, the web app quote engine is NOT a drop-in replacement for DM Excel. The remaining gaps:

- **SMT time model** — biggest gap. Web app uses per-placement flat cost, DM uses time-based. Large-count or unusual-feeder BOMs will drift materially. 4-6 hrs to port.
- **`programming_fees` integration** — migration 036 created the table but `engine.ts` doesn't query it yet. 30-60 min wire-up.
- **Setup time per feeder** — DM computes setup cost as `(cp_feeder_count × cp_load_time + ip_feeder_count × ip_load_time + 2 × printer_setup)`. Web app uses a flat `setup_time_hours × labour_rate`. Part of the SMT time model port.
- **Stencil + PCB fab NRE defaults** — still per-BOM manual entries in DM, no workbook default.

*Part 26 last updated: April 15, 2026, Session 11 (real pricing extraction + markup correction)*

---

## PART 27 — The CPC Saga, Column Mapper, and Overage Visibility (April 16, 2026)

### 27.1 Why CPC Was Never Working

The CPC column went through four rounds of "fixing" before landing correctly. Root cause: **all 11 customers had empty `bom_config: {}` in the live DB**. The seed migration never stuck. Parser was auto-detecting columns for every customer and never finding a CPC column because Lanka doesn't label theirs with a recognizable keyword.

**The fix (3 things at once):**
1. Seeded `bom_config` for all 11 customers — Lanka gets `columns_fixed` with CPC at position 2, others get `auto_detect` with `cpc_fallback: mpn`
2. Reverted the CPC=MPN dedup — show whatever the file has, only null out empty/N/A
3. Backfilled existing TLAN rows: `SET cpc = mpn WHERE cpc IS NULL`

**Lesson:** when a BOM column shows wrong data, check `bom_config` FIRST. If it's `{}`, the parser is guessing.

### 27.2 The Column Mapper

When you drop a file on the upload page, the client now reads it with SheetJS and shows a preview: all detected headers + 5 sample rows + 6 dropdown selectors (Qty, Designator, CPC, MPN, Manufacturer, Description) auto-filled from keyword detection. Mapped columns highlighted blue. User can override any mapping before uploading. The confirmed mapping is sent to the server and takes priority over bom_config and auto-detect.

Component: [components/bom/column-mapper.tsx](components/bom/column-mapper.tsx)

### 27.3 Invoice Payment Terms

`due_date` now reads `customers.payment_terms` ("Net 30", "Net 60", etc.) instead of hardcoded +30 days. Fixed in both the REST endpoint and the chat agent's `createInvoice` tool.

### 27.4 Overage in Quote Pricing Table

Pricing table now shows an indented sub-row under Components: `↳ Overage extras (340 parts) $850`. Shows how much of the component cost is overage attrition. Hidden when $0.

### 27.5 Sortable BOM Table + Multiple Quotes per BOM

BOM table columns (M-Code, CPC, Qty, MPN, Manufacturer) are clickable to sort asc/desc. BOM detail page allows creating multiple quotes from the same BOM — "New Quote" button shows alongside "View Quote".

---

## PART 28 — Quoting Engine Overhaul: Matching the Real DM/TIME V11 (April 16, 2026)

This session was triggered by Anas sharing the full 14-page RS Quotation Process SOP. We audited every phase (A–K single BOM, L–O batch) against the web app and found 6 gaps where the app diverged from how RS actually quotes in Excel. All 6 were fixed.

### 28.1 How Assembly Cost Actually Works (TIME V11)

The biggest misconception in the original codebase: assembly cost is NOT "placements × flat rate." The real Excel TIME V11 file calculates **time**, then multiplies by hourly rates.

**The real formula:**

```
For each M-code category, calculate placement TIME:
  CP/CPEXP placements ÷ 4,500 CPH = hours
  0402 placements     ÷ 3,500 CPH = hours
  0201 placements     ÷ 2,500 CPH = hours
  IP placements       ÷ 2,000 CPH = hours
  TH placements       ÷   150 CPH = hours  (manual insertion)
  MANSMT placements   ÷   100 CPH = hours  (hand soldering)

Add feeder setup time:
  (CP feeders × 2 min + IP feeders × 3 min + 2 printer setups × 15 min) ÷ 60

Total assembly hours = placement time + setup time

Labour cost  = total_hours × $130/hr  (applies to ALL assembly types)
Machine cost = SMT_hours × $165/hr    (only for pick-and-place machine time)
Assembly cost = Labour + Machine
```

**CPH** = Components Per Hour. Higher CPH = faster placement = lower cost. CP parts at 4,500 CPH are the fastest (standard high-speed pick-and-place). MANSMT at 100 CPH is the slowest (hand soldering). The numbers come from the "Settings" sheet in the TIME V11 workbook.

**Why this matters:** The old flat model charged $0.035/placement for SMT. A 500-placement board cost $17.50 in assembly. With the time model, 500 CP placements on 100 boards = 100×500/4500 = 11.1 hours of SMT time. Labour = 11.1×$130 = $1,444. Machine = 11.1×$165 = $1,833. Assembly = $3,277. The old model was underquoting by ~200x.

**Toggle:** Settings → Pricing → "Time-Based" vs "Legacy Per-Placement." All CPH rates and setup params are editable. Old quotes with legacy pricing display correctly.

### 28.2 Programming Fees: The Tiered Lookup

The DM Common File has a "Programming" sheet with a 28-row lookup table. Fee depends on how many BOM lines the board has, and whether it's single-sided (TS) or double-sided (TB).

| BOM Lines | Single-Sided | Double-Sided (TB) |
|-----------|-------------|-------------------|
| 1-39      | $300        | $400              |
| 40-49     | $350        | $450              |
| 50-59     | $350        | $450              |
| 60-69     | $475        | $575              |
| 70-79     | $525        | $625              |
| ...       | +$75/tier   | +$75/tier         |

The `programming_fees` table was seeded in migration 036 but never connected. Now `lib/pricing/engine.ts` imports `calculateProgrammingCost()` and uses the real tiered lookup. The flat `programmingTimeHours × labourRate` is fallback only.

**Double-counting guard:** The quote form auto-fills `nre_programming` from the BOM line count endpoint. If that's already set, the engine sets its own programming cost to $0 so the fee isn't counted twice.

### 28.3 The Multi-Page Quote PDF

**Before:** One page with a summary table. No customer addresses. No cost breakdown.

**After (matches SOP Phase K):**

**Page 1 — Summary:**
- RS header (company name, address, phone, email, website)
- BILL TO: customer company, contact name, billing address
- SHIP TO: shipping address
- QUOTE DETAILS: GMP number, board name, BOM file, validity period, payment terms
- Summary table: all quantity tiers side by side (Components, PCB, Assembly, NRE, Shipping, Total, Per Unit)
- Lead time row per tier
- Notes section
- Terms & conditions (7 standard items)

**Pages 2–N — Per-Tier Detailed Breakdown (one page per quantity tier):**
- Material Cost: component cost before markup → markup % → after markup → overage cost
- PCB Cost: unit price × quantity → markup
- Assembly Cost: SMT/TH/MANSMT placement counts and costs (or full time breakdown when time model active)
- NRE Breakdown: programming, stencil, PCB fab, setup, misc — each as a line item
- Shipping
- Bold total box with per-unit price
- Assembly statistics (feeder counts, placement totals)

**Address handling:** The app has two address systems — old singular `billing_address` JSONB and new plural `billing_addresses` JSONB array (migration 018). The PDF reads the plural array first (`extractDefaultAddress()` finds the default or takes index 0), falls back to the singular column. Handles both `street` and `line1` field names.

### 28.4 Lead Times

Customers need to know delivery timelines per quantity tier. This didn't exist anywhere in the app.

**Migration 037:** `quotes.lead_times JSONB DEFAULT '{}'` — stores `{"tier_1": "4-6 weeks", "tier_2": "3-5 weeks", ...}`

- Quote form: text input per tier with defaults ("4-6 weeks" for small qty, "3-4 weeks" for large)
- Quote detail page: Lead Times card with Clock icon
- PDF: lead time row in summary table + per-tier detail page header

### 28.5 Historical Procurement Lookup

**SOP Phase G1** says: "Click 'Load Saved Procurement Data' — checks 4,500+ historical records." Before hitting DigiKey/Mouser APIs (rate-limited, slow), check what RS previously paid.

**New file: `lib/pricing/historical.ts`**

The pricing flow is now 4 steps:
1. **API cache** (7-day TTL) — existing, unchanged
2. **Historical procurement** — queries `procurement_lines` for the last 5 times this MPN was ordered. Returns price, supplier, date, age in days
3. **Component supplier PNs** — checks `components` table for stored DigiKey/Mouser/LCSC part numbers. Uses these as search keys for APIs (better match than raw MPN keyword search)
4. **Live API calls** — DigiKey + Mouser + LCSC in parallel

If all 3 APIs fail but historical data exists, returns the historical price as fallback with `price_source: "historical"`. The response always includes historical reference data so the UI could show "DigiKey: $2.35 | Last ordered: $2.10 (3 months ago)."

Bulk versions (`lookupHistoricalPricesBulk`, `lookupComponentSupplierPNsBulk`) run a single query for batch pricing efficiency.

**Migration 038:** Adds `'procurement_history'` as a valid cache source + index on `procurement_lines(upper(mpn))`.

### 28.6 Stock-Aware Supplier Selection

**SOP Phase G2** says: DigiKey first → if zero stock, try Mouser → if both zero, keep DigiKey PN.

**Before:** All 3 suppliers queried in parallel (good), cheapest price picked (bad — ignores stock). DigiKey didn't even return stock quantity.

**After:**
1. `lib/pricing/digikey.ts` now extracts `QuantityAvailable` from the DigiKey V4 response
2. `selectBestSupplier()` separates suppliers into "has stock or unknown" vs "confirmed zero stock"
3. Picks cheapest **with stock** first. Only falls back to zero-stock if everything is out of stock (flagged as `out_of_stock`)
4. When no suppliers found at all, preserves the DigiKey part number in the response for manual lookup
5. Old cache entries without `stock_qty` are treated as "unknown" (not penalized)

Batch pricing now reports `in_stock_count`, `out_of_stock_count`, `historical_hits` so Piyush can see at a glance how many components need attention.

### 28.7 Things Caught During Code Review

After all 6 fixes were applied, we ran 3 parallel code review agents. They found 4 critical bugs:

1. **`lead_times` never saved to DB** — form sent it, `quotes/route.ts` didn't include it in INSERT. Silent data loss.
2. **PDF read old `billing_address`** instead of new `billing_addresses` array. Plus `street` vs `line1` field mismatch. Addresses would always render empty.
3. **Case-sensitive bulk lookup** — `lookupHistoricalPricesBulk` used `.in("mpn", mpns)` which is case-sensitive. If DB has "LM358" and input has "lm358", no match. Fixed by querying both original and uppercased MPNs.
4. **Non-null assertion `best!`** — could crash if `selectBestSupplier()` returned null. Added proper null guard.

**Lesson:** Always run a review agent after multi-agent parallel work. The agents that implement don't catch each other's integration bugs.

### 28.8 Settings Reference (New Fields)

All configurable in `/settings/pricing` (CEO only):

| Setting | Default | What It Controls |
|---------|---------|-----------------|
| `use_time_model` | `true` | Toggle between time-based and legacy assembly cost |
| `cp_cph` | 4,500 | CP/CPEXP components per hour |
| `small_cph` | 3,500 | 0402 components per hour |
| `ultra_small_cph` | 2,500 | 0201 components per hour |
| `ip_cph` | 2,000 | IP (large IC) components per hour |
| `th_cph` | 150 | Through-hole components per hour |
| `mansmt_cph` | 100 | Manual SMT components per hour |
| `cp_load_time_min` | 2 | Minutes to load one CP/CPEXP feeder |
| `ip_load_time_min` | 3 | Minutes to load one IP feeder |
| `printer_setup_min` | 15 | Solder paste printer setup per side (minutes) |

Existing settings unchanged: `labour_rate_per_hour` ($130), `smt_rate_per_hour` ($165), `component_markup_pct` (25%), `pcb_markup_pct` (30%).

*Part 28 written: April 16, 2026, Session 13*

---

## PART 29: END-TO-END TEST FINDINGS + 4 BUG FIXES (Session 13b)

Full Piyush-style walkthrough of the quoting pipeline using a test Cevians BOM (CVN-CTL-001, 15 components, CSV format).

### What the test covered

Upload CSV → Parse (auto-detect columns) → Classify (rules engine) → Manual assign 3 remainders → Create quote (4 tiers) → Calculate pricing → Review breakdown → Save draft → Generate PDF → Inspect PDF in browser.

### 4 bugs found and fixed

**Bug 1: Pricing results invisible after calculation (CRITICAL)**
- Symptom: Click "Calculate Pricing" → button spins → button resets → nothing visible changes
- Root cause: Results render inside `{preview && <Card>}` below the viewport. `<main>` is scrollable (`overflow-y: auto`) but page doesn't auto-scroll.
- Fix: `useRef` on the preview Card + `scrollIntoView({ behavior: 'smooth' })` 100ms after `setPreview()`. The timeout waits for React to commit the render.
- File: `components/quotes/new-quote-form.tsx`
- Lesson: Always scroll to dynamically rendered content if it might be below the fold.

**Bug 2: M-Code donut chart stale after manual assigns**
- Symptom: Manually assign STM32→IP via dropdown. Stats bar updates ("15 classified"). Donut chart still shows "Unclassified 3 (20%)".
- Root cause: Chart was in the server component (`bom/[id]/page.tsx`), rendered once from initial data. `BomTable` client component updates its own `lines` state on assign, but the server component doesn't re-render.
- Fix: Moved chart into `BomTable` as a `useMemo` derived from `lines`. Now recomputes on every M-code change.
- Files: `components/bom/bom-table.tsx`, `app/(dashboard)/bom/[id]/page.tsx`
- Lesson: Don't put reactive data visualizations in server components if the data changes client-side.

**Bug 3: "No parsed BOMs" flash on first navigation**
- Symptom: Click "Create Quote" from BOM page → quote form shows "No parsed BOMs found for this customer" → refresh → works fine.
- Root cause: URL has `?bom_id=xxx`. Prefill effect sets customer, triggers BOM fetch. But React renders the "no BOMs" message before the fetch returns.
- Fix: Added `prefilling` state (true when `initialBomId` present). Shows "Loading BOMs..." spinner instead of error message during prefill. Cleared in `finally` block.
- File: `components/quotes/new-quote-form.tsx`
- Lesson: Loading states must cover the initial prefill path, not just user-triggered fetches.

**Bug 4: NRE card shows $800 instead of $950**
- Symptom: Quote detail NRE card: Programming $400 + Stencil $400 + PCB Fab $0 = $800. But pricing table shows NRE $950.
- Root cause: Card only read 3 NRE fields from `tier_inputs`. Setup ($100) and misc ($50) live in `labour` breakdown, not `tier_inputs`.
- Fix: Now reads all 5 NRE components. Shows non-zero lines only.
- File: `app/(dashboard)/quotes/[id]/page.tsx`

### Test results summary

| Metric | Value |
|--------|-------|
| BOM | Cevians CVN-CTL-001, 15 components, CSV |
| Auto-classified | 12/15 (80%) from rules alone |
| Manual assigns | STM32F401→IP, USB4110→MANSMT, ABLS-16MHz→TH |
| Components priced | 15/15 ($0 missing) |
| Time model | Active (CPH-based) |
| PDF pages | 5 (1 summary + 4 tier details) |
| Per-unit prices | $204.72 / $184.92 / $170.59 / $164.13 |
| NRE | $950 (prog $400 + stencil $400 + setup $100 + misc $50) |
| Lead times | 4-6 / 4-6 / 3-5 / 3-4 weeks |

### Remaining known issues (not fixed, low priority)

- Column mapper preview doesn't show for CSV files (only XLSX) — not blocking, CSV auto-detect works fine
- GST/QST tax numbers not in PDF header (needed for invoices, optional for quotes)
- PCB unit price only shows tier 1 value ($18.50) on quote detail card, not all 4 tiers

*Part 29 written: April 16, 2026, Session 13b*

---

## PART 30: DELETE UX — BLOCKING LINKS + CANCEL INVOICE (Session 13c)

### The problem

When you try to delete something in the app (a BOM, a quote, a job, a customer, a procurement), and it has dependent records, you get an error like: *"Cannot delete — 2 quote(s) reference this BOM. Delete the quotes first."* But that's it — no link to those quotes, no way to navigate there. You have to manually go find them.

Separately: paid invoices say *"Cannot delete a paid invoice. Cancel it first if needed"* — but there was no cancel button.

### What was fixed

**1. Delete dialogs now show clickable links to blocking records**

Every entity's delete button component was updated. When a 409 comes back from the API, the dialog parses a `blocking` field containing the actual record IDs and identifiers (up to 5), and renders them as blue clickable links.

Example: trying to delete BOM CVN-CTL-001 that has 2 quotes:
- Before: "Cannot delete — 2 quote(s) reference this BOM. Delete the quotes first."
- After: "This BOM is referenced by:" → QT-2604-007 (clickable link) → QT-2604-008 (clickable link) → "Delete these first, then try again."

The API routes were also updated to return record identifiers instead of just counts.

**Entities covered:**
| Delete target | Shows links to |
|--------------|---------------|
| BOM | Blocking quotes + jobs |
| Quote | Blocking jobs |
| Job | Blocking invoices + procurements |
| Customer | Blocking quotes + jobs + BOMs |
| Procurement | Blocking supplier POs |

**2. Procurement delete button was missing from the page**

The `DeleteProcurementButton` component existed in `components/procurement/` but nobody imported it on `app/(dashboard)/procurement/[id]/page.tsx`. Added it next to the other action buttons.

**3. Cancel Invoice button added**

Added a red "Cancel Invoice" button to the `InvoiceActions` component. It:
- Shows on every invoice that isn't already cancelled
- For paid invoices: confirms with *"This invoice is marked as paid. Cancelling it will NOT reverse any recorded payment. Continue?"*
- Sends `PATCH /api/invoices/{id}` with `{ status: "cancelled" }`
- Once cancelled, the Delete Invoice button works (the delete handler only blocks `status === "paid"`)

### How to delete a paid invoice

1. Open the invoice detail page
2. Click **Cancel Invoice** (red outline button) → confirm the warning
3. Invoice status changes to "Cancelled"
4. Click **Delete Invoice** (red solid button) → confirm → deleted

### Files changed

API routes (5): `app/api/bom/[id]/route.ts`, `app/api/quotes/[id]/route.ts`, `app/api/jobs/[id]/route.ts`, `app/api/customers/[id]/route.ts`, `app/api/procurements/[id]/route.ts`

Delete buttons (5): `components/bom/delete-bom-button.tsx`, `components/quotes/delete-quote-button.tsx`, `components/jobs/delete-job-button.tsx`, `components/customers/delete-customer-button.tsx`, `components/procurement/delete-procurement-button.tsx`

Pages (1): `app/(dashboard)/procurement/[id]/page.tsx` — added delete button import

Invoice actions (1): `components/invoices/invoice-actions.tsx` — added cancel button

*Part 30 written: April 16, 2026, Session 13c*

*Part 27 last updated: April 16, 2026, Session 12*

---

## PART 31: SESSION 14 FEATURES — BOM Upload Fields, Board Details, Markup Overrides, Expandable Pricing (April 17, 2026)

Session 14 added several UX improvements across the BOM upload and quoting workflows. No database migrations were needed -- all new fields map to existing JSONB columns or existing table columns.

### 31.1 BOM Upload — Header Row + Last Row Controls

The column mapper on the upload page now has **Header Row** and **Last Row to Process** number inputs. See the section in Part 4 ("Header Row + Last Row Controls") for full details. Summary:

- **Header Row** (1-indexed) — auto-detected but user-overridable. Handles BOMs with banner/title rows before the actual headers.
- **Last Row to Process** (1-indexed) — defaults to total rows. Lets the user exclude summary/total/notes rows at the bottom.
- When header row changes, column mapping dropdowns re-auto-detect and the preview table updates.
- Both values are sent to the server as `header_row` and `last_row` in formData, where they override bom_config and auto-detection.

Files: `components/bom/column-mapper.tsx`, `components/bom/upload-form.tsx`, `app/api/bom/parse/route.ts`

### 31.2 BOM Upload — BOM Name + Gerber Fields

Three new fields appear in a grouped card below the file drop zone after a file is selected:

| Field | Default | Purpose |
|---|---|---|
| **BOM Name** | Uploaded filename | Editable display name for the BOM. Cleaner than raw filenames like "TL265-5001_BOM_2026-04-17_v3_FINAL.xlsx". |
| **Gerber Name** | Empty | Associates a Gerber file name with the BOM (e.g. "TL265-5001-000-T_Gerber"). Used on the Job Card production document. |
| **Gerber Revision** | Empty | Gerber revision string (e.g. "V3", "Rev A"). |

All three are sent as formData (`bom_name`, `gerber_name`, `gerber_revision`) and stored in the `boms` table. The BOM Name auto-populates when a file is dropped -- editing it is optional.

Files: `components/bom/upload-form.tsx`, `app/api/bom/parse/route.ts`

### 31.3 Quote Form — Board Details

A new "Board Details" card appears on the quote form (`/quotes/new`) after a BOM is selected, before the quantity tiers. Four fields in a 4-column grid:

| Field | Options | Default | Effect |
|---|---|---|---|
| **Board Side** (`gmps.board_side`) | `single` (Single-sided), `double` (Double-sided) | `double` | Controls how many SMT passes the assembly cost assumes. Stored on the GMP — every BOM revision and every quote under that GMP shares the same physical layout. |
| **Procurement Mode** (`quotes.procurement_mode`) | `turnkey`, `consignment`, `assembly_only` | `turnkey` | Billing model — what RS supplies vs what the customer supplies. Lives on the quote and on each procurement record. |
| **Boards per Panel** | Number >= 1 | 1 | Panelization factor for PCB cost division. |
| **IPC Class** | 1 (General), 2 (Dedicated Service), 3 (High Reliability) | 2 | Higher class = stricter inspection, higher assembly cost. |
| **Solder Type** | Lead-Free (RoHS), Leaded | Lead-Free | Affects reflow profile and solder paste type. |

The old single `assembly_type` column ('TB' | 'TS' | 'CS' | 'CB' | 'AS') was a confused mash-up of physical layout + billing model. Migration 091 split it: physical layout → `gmps.board_side`, billing model → `procurement_mode`. There is now exactly one place to look for each.

Files: `components/quotes/new-quote-form.tsx`, `app/api/quotes/preview/route.ts`, `app/api/quotes/route.ts`

### 31.4 Quote Form — Markup Overrides

Two new inputs appear inline below the tier table (right-aligned, next to the Shipping input):

| Field | Default | Behavior |
|---|---|---|
| **Component Markup (%)** | Empty (placeholder: "default 25") | When empty, pricing engine reads the global default from `app_settings`. When filled, overrides the global default for this specific quote only. |
| **PCB Markup (%)** | Empty (placeholder: "default 25") | Same behavior -- empty = global default, filled = per-quote override. |

This lets Anas adjust margins on a per-quote basis (e.g. give a loyal customer a lower markup, or add margin on a rush job) without touching the global settings that affect all future quotes.

The overrides are sent as optional `component_markup_pct` and `pcb_markup_pct` fields in the API request body. When omitted, the pricing engine reads defaults from `app_settings`.

Files: `components/quotes/new-quote-form.tsx`, `app/api/quotes/preview/route.ts`, `lib/pricing/engine.ts`

### 31.5 Pricing Table — Expandable Markup Breakdown

The pricing preview table (`PricingTable` component) now shows expandable rows for **Components** and **PCB**. Each has a chevron icon (triangle) that toggles two sub-rows:

1. **Cost before markup** — the raw cost before any percentage is applied (gray text)
2. **Markup (X%)** — the markup percentage and dollar amount added (green text, prefixed with "+")

Visual design: sub-rows have a light blue background tint (`bg-blue-50/30`) and are indented. The chevron rotates when expanded (right arrow = collapsed, down arrow = expanded).

This is backward-compatible: older quotes without `component_cost_before_markup` / `pcb_cost_before_markup` in the tier data just show flat rows without chevrons. The component checks `hasMarkupData` before rendering the expand toggle.

The pricing engine now returns these additional fields per tier:
- `component_cost_before_markup` — raw component cost
- `component_markup_pct` — the percentage used
- `component_markup_amount` — the dollar amount of markup
- `pcb_cost_before_markup` — raw PCB cost
- `pcb_markup_pct` — the percentage used
- `pcb_markup_amount` — the dollar amount of markup

Files: `components/quotes/pricing-table.tsx`, `lib/pricing/engine.ts`, `lib/pricing/types.ts`

### Summary of all files touched in Session 14

- `components/bom/upload-form.tsx` — BOM Name, Gerber Name, Gerber Revision fields
- `components/bom/column-mapper.tsx` — Header Row + Last Row inputs
- `app/api/bom/parse/route.ts` — accepts header_row, last_row, bom_name, gerber_name, gerber_revision
- `components/quotes/new-quote-form.tsx` — Board Details card, Markup Override inputs
- `components/quotes/pricing-table.tsx` — expandable markup sub-rows for Components and PCB
- `app/api/quotes/preview/route.ts` — accepts board details + markup overrides
- `app/api/quotes/route.ts` — stores board details + markup overrides on the quote
- `lib/pricing/engine.ts` — returns markup breakdown fields per tier
- `lib/pricing/types.ts` — added markup breakdown fields to PricingTier type

*Part 31 written: April 17, 2026, Session 14*

---

## Batch backfill — Parts 32–37 (written May 11, 2026)

> Parts 32–37 below mirror **HANDOFF.md Entries 59–64** and document the May 7, 2026 squash-merge (`c186f90`) that landed migrations 049–109 (60 migrations) and reshaped half the app. Written in tutorial style; the HANDOFF entries are the terse mirror reference.

---

## PART 32: AUTH MODEL SIMPLIFICATION — TWO-ROLE CANONICAL (May 7, 2026)

### 32.1 The problem in plain language

When the app started, it inherited a **three-tier role system**: `ceo`, `operations_manager`, and `shop_floor`. Over time, new features introduced two _different_ roles: `admin` and `production`. The app now had five role strings floating around the database — some in user profiles, some in API keys — with no single source of truth about what they meant.

Worse, the row-level security (RLS) policies that gate data access were hard-coded with the legacy strings. When someone with the `production` role tried to sign in, they couldn't even read their own user profile because the RLS policies only checked for `shop_floor`, not `production`. The middleware and login action would get a null result, think "well, no profile must mean this user doesn't exist," skip the deactivation check entirely, and let a disabled production user sign in anyway.

This silent failure happened because RLS gaps didn't raise an error — they just returned nothing. Production users were locked out by silent RLS, legacy strings were scattered everywhere, and deactivation became unreliable for production staff.

### 32.2 What we ended up with

Three migrations land a **canonical two-role model**: only `admin` and `production` exist in the database, period.

- **`admin`** — full access to everything: quoting, BOMs, jobs, user management, procurement, settings.
- **`production`** — scoped to the Production module only: kanban board, stencil library, shipping, job detail pages. Cannot see quotes, BOMs, customers, or settings.

Also new: password reset flow, user management UI at `/settings/users`, and helper functions in both SQL and TypeScript so role checks have one gate.

### 32.3 Migration 085: Role helpers and audit columns

Migration 085 is the **transition layer**. It widens `users.role` CHECK to accept _both_ legacy strings (`ceo`, `operations_manager`, `shop_floor`) _and_ the new canonical pair (`admin`, `production`) so existing RLS doesn't break during the migration. It adds two SQL helpers:

```sql
is_admin() — auth.uid() IN users WHERE role IN ('admin','ceo','operations_manager') AND is_active
is_production() — auth.uid() IN users WHERE role IN ('production','shop_floor') AND is_active
```

Both are marked `SECURITY DEFINER`, which means they run as the function owner and **bypass RLS entirely** — role checks must never fail silently due to policy gaps. Migration 085 also adds `last_seen_at` to track sign-ins.

### 32.4 Migration 087: The critical RLS fix

Before this fix, a production user with `role='production'` would query `SELECT role, is_active FROM users WHERE id = auth.uid()` (user-scoped client). The existing RLS policies only matched `shop_floor`, so the query returned **zero rows**. The login code then checked `if (profile && !profile.is_active)` — but `profile` was null, so the check never fired. **Deactivated production users could still sign in.**

Migration 087 adds a universal self-read policy:

```sql
CREATE POLICY users_self_read ON public.users
  FOR SELECT USING (id = auth.uid());
```

Now every authenticated user can read their own row, _regardless_ of role string. Combined with 085's helpers, the deactivation check now always runs and always works.

### 32.5 Migration 088: Drop legacy roles (492 lines)

Four steps:

**1.** Migrate data: `ceo`/`operations_manager` → `admin`, `shop_floor` → `production` (in both `users` and `api_keys`).

**2.** Rewrite ~110 RLS policies. Policies that said `WHERE role = 'ceo' OR role = 'operations_manager'` are collapsed into `WHERE is_admin()` — one function call.

**3.** Tighten the helpers — they now only recognize `admin` / `production`, rejecting legacy strings.

**4.** Tighten CHECK constraints: `users.role` and `api_keys.role` now `CHECK (role IN ('admin','production'))`. Inserting a legacy string will fail at the DB level.

### 32.6 How is_admin() and is_production() work — SECURITY DEFINER

The functions are marked `SECURITY DEFINER`:

```sql
CREATE FUNCTION public.is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.is_active = TRUE
      AND u.role IN ('admin'));
$$;
```

`SECURITY DEFINER` means the function runs as the function owner (the Supabase service role), not as the calling user. It reads the `users` table _without_ being blocked by RLS. This is the whole point — role checks must be authoritative and never silently fail.

In TypeScript, `lib/auth/roles.ts` mirrors:

```typescript
export function isAdminRole(role: string | null | undefined): boolean
export function isProductionRole(role: string | null | undefined): boolean
export function roleLabel(role: string | null | undefined): string
export function isAssignableRole(role: string): role is CanonicalRole
export const ALL_DB_ROLES: DbRole[] = ["admin", "production"];
```

All role checks now route through these helpers — no string literals scattered everywhere.

### 32.7 Walk through the deactivation bug: before and after

**Before 087:**

1. Piyush has `role='production'` — admin deactivates him.
2. Next morning, Piyush logs in. Login action queries `SELECT role, is_active FROM users WHERE id = auth.uid()` via the **user-scoped client**.
3. RLS only matches `shop_floor`, not `production` → query returns **zero rows** → `profile = null`.
4. `if (profile && !profile.is_active)` is false (because profile is null) → deactivation check skipped.
5. **Piyush is logged in. Bug.**

**After 087+088:**

1. Same setup.
2. Login action in `app/(auth)/login/actions.ts` now queries via the **admin client**: `const admin = createAdminClient(); admin.from("users")...` — bypasses RLS entirely.
3. `profile.is_active = false` → check fires → `await supabase.auth.signOut()` → return "This account has been deactivated."
4. **Piyush is signed out immediately. No bug.**

### 32.8 What a production user can and cannot see

`middleware.ts` enforces a route allow-list:

```typescript
const PRODUCTION_ALLOWED_PREFIXES = [
  "/production",   // kanban
  "/stencils",     // stencil library
  "/shipping",     // shipment tracking
  "/jobs/",        // job detail pages
  "/api/jobs", "/login", "/reset-password", "/api/auth"
];
```

Production users who try to visit `/quotes`, `/settings`, or `/customers` get bounced to `/production`. The page never loads.

`components/sidebar.tsx` conditionally renders nav — admins see all 16 menu items; production users see only Production / Shipping / Stencil Library.

`lib/mcp/auth.ts` (MCP — Claude Desktop's integration) does the same for AI tools: admins can call all 28 tools, production users can call 6 read-only tools (jobs, production events, overview, search).

### 32.9 How to add a new user — concrete UI flow

1. Admin navigates to `/settings/users` (Settings sidebar → Users card).
2. Click **+ Add User** (top right).
3. Dialog opens — Email (validated), Full Name, Role (dropdown: Admin / Production only).
4. Click **Create User** → frontend POSTs to `/api/users`.
5. Server creates a row in `auth.users` via `createAdminClient().auth.admin.createUser()`, generates a random 16-char temp password, inserts a row in `public.users` with role and `is_active=true`, returns the temp password.
6. Frontend displays the temp password. Admin copies it for the new user, OR clicks **Send Recovery Email** to trigger a password-reset link.
7. User signs in to `/login` and is redirected: production → `/production`, admin → `/`.

### 32.10 How password reset works — implicit-flow recovery link

Admin needs to force a password reset:

1. Click **Reset Password** on the user's row → POST `/api/users/{id}/reset-password`.
2. API calls `auth.admin.generateLink({ type: 'recovery' })` → returns a link with **implicit-flow tokens in the URL hash**: `https://app.com/reset-password#access_token=...&refresh_token=...&type=recovery`.

The `/reset-password` page (`app/(auth)/reset-password/page.tsx`):

1. On mount, looks for `#access_token=...&type=recovery` in the URL hash.
2. Parses tokens via `URLSearchParams`.
3. Calls `supabase.auth.setSession()` to bootstrap a recovery session.
4. Immediately strips tokens from URL via `window.history.replaceState()` so they don't leak into history or referrer headers.
5. Renders "Enter a new password" form.
6. On submit, calls `supabase.auth.updateUser({ password })` — works without old password because session type is recovery.
7. Redirects to `/login` to sign in with the new password.

### 32.11 Files changed

**Migrations:**
- `supabase/migrations/085_roles_helpers_and_user_audit.sql`
- `supabase/migrations/087_users_self_read_rls.sql`
- `supabase/migrations/088_drop_legacy_roles.sql`

**Auth lib:**
- `lib/auth/roles.ts` — canonical helpers
- `lib/auth/api-auth.ts` — `getAuthUser()` shared helper for Bearer auth (API key + JWT)

**Flows:**
- `app/(auth)/login/actions.ts` — admin client, deactivation check, role-based routing
- `app/(auth)/reset-password/page.tsx` — recovery flow

**Middleware:**
- `middleware.ts` — production allow-list, admin client for profile read

**User management:**
- `app/(dashboard)/settings/users/page.tsx`
- `components/users/{users-list-client, add-user-dialog, edit-user-dialog}.tsx`

**API:**
- `app/api/users/route.ts` — POST create, GET list
- `app/api/users/[id]/route.ts` — PATCH update
- `app/api/users/[id]/reset-password/route.ts` — POST generate recovery link

**Other:**
- `components/sidebar.tsx` — role-gated nav
- `lib/mcp/auth.ts` — MCP tool gating

*Part 32 written: May 11, 2026 — backfilled from May 7 squash-merge.*

---

## PART 33: THE PROCUREMENT OVERHAUL — `/proc/`, SUPPLIERS MASTER LIST, STENCILS LIBRARY (May 7, 2026)

### 33.1 The problem: 1:1 procurement ↔ job didn't reflect reality

When Piyush consolidates three jobs for TechCorp into a single PO to Wyle (to hit the freight-volume threshold and save $500), the old system had no way to represent it. The legacy database model was **1:1**: one `procurements` row per `jobs` row. To group jobs 12, 13, and 14 into a single supplier order, Piyush would:

1. Create three separate procurements (one per job).
2. Manually note in email or spreadsheet that they're a "batch order."
3. Later, when invoices arrived, manually track which lines belonged to which job.

Operators worked around it with email + side spreadsheets. The database was no longer the single source of truth. Visibility into "what did we order for TechCorp?" required reading emails.

### 33.2 The new batch model: one PROC, many jobs

**A PROC Batch is the new apex object.** Multiple jobs roll up into one PROC via `jobs.procurement_id` (many-to-one).

When Piyush clicks "Create PROC Batch" and selects jobs 12, 13, 14:

1. System creates **one `procurements` row** with `is_batch=true`, `member_count=3`, `customer_id=TechCorp`.
2. All three jobs get `procurement_id` set to this PROC.
3. System generates a **proc_code** (e.g., `T260507-001`):
   - `T260507` — date (May 7, 2026)
   - `001` — per-customer-per-day sequence
4. The page shows **one merged BOM** — all component lines from all three BOMs aggregated by CPC.
5. Operator confirms which supplier for each component → POs fan out.

See `lib/proc/generate-proc-code.ts` for code generation. Format is burned into the proc_code for human recognition.

**Why this matters:** One PO covers jobs 12–14, eliminating freight fragmentation. Finance sees "T260507-001 = $2,400" in one line item. The merged BOM shows "2,000 units of resistor XYZ needed" — not scattered across three records. When an invoice arrives, the operator links it once.

### 33.3 The `procurement_line_selections` table — per-line supplier choice

The merged BOM is just a view. To actually order, the system needs to know: for each unique MPN (or CPC) in the merged BOM, which supplier did we choose? That's `procurement_line_selections`.

**One row per `(procurement_id, mpn)`.** Columns:

| Column | Meaning |
|---|---|
| `mpn` | Manufacturer part number (or CPC fallback) — the row identity within the PROC |
| `chosen_supplier` | Distributor code: `digikey`, `mouser`, `lcsc`, `arrow`, `WMD`, etc. |
| `chosen_supplier_pn` | Supplier's part number (DigiKey's vs Mouser's for same MPN) |
| `chosen_unit_price_cad` | Locked price in CAD at effective order qty (after MOQ + multiples) |
| `chosen_effective_qty` | Actual qty we'll order (may be > needed due to MOQ) |
| `order_status` | `not_ordered → ordered → shipped → received` (Mig 066) |
| `manual_unit_price_cad` (Mig 067) | Operator override for sales-rep email quotes |
| `manual_buy_qty` (Mig 082) | Operator override for "qty to buy" (BG/safety topups) |

**The workflow:**

1. Operator creates PROC batch (jobs 12, 13, 14).
2. System merges BOMs by CPC.
3. System fetches quotes from distributors. `lib/proc/rank-distributors.ts` ranks: applies MOQ + order multiple rounding to compute `effective_qty`, picks the right price break, converts to CAD, sorts cheapest first.
4. `components/proc/merged-bom-table.tsx` shows a dropdown per line: current selection (default = lowest in-stock), alternatives, "Manual price" button.
5. Operator clicks supplier dropdowns / overrides where needed → clicks "Confirm Suppliers" → persisted.
6. POs fan out, grouped by supplier.

### 33.4 PCB and stencil orders — separate procurement cadence

Component procurement and PCB/stencil procurement are fundamentally different:

- **Components** → DigiKey, Mouser, TTI. 1–3 weeks. Standard break pricing.
- **PCBs** → WMD, Candor, PCBWay. 2–4 weeks. Custom per design (no standard breaks). USD.
- **Stencils** → Stentech, Candor. 1–2 weeks. Often merged (one sheet covers multiple board revs). CAD.

The new system has:

- `procurement_lines` (Mig 062) — component lines.
- `pcb_orders` (Mig 065) — one row per board design / order. Fields: `procurement_id`, `gmp_id`, `supplier`, `external_order_id`, `quantity`, `unit_price`, `total_price`, `currency` (default USD), `status ∈ {ordered, shipped, received, cancelled}`.
- `stencil_orders` (Mig 065) — one row per stencil order. Fields: `is_merged`, `covered_gmp_ids` (UUID array), `supplier`, `currency` (default CAD), lifecycle fields.

**Why separate?** Because when PROC components are 90% done, you might still be waiting on PCBs from WMD. You don't want to block the entire PROC. Each stream has its own status.

UI: `components/proc/pcb-orders-card.tsx`, `components/proc/stencil-orders-card.tsx`.

### 33.5 Suppliers master list — who are we buying from?

`suppliers` table — curated approved vendors. CEO adds them; `is_approved=true` enables them for new POs.

| Column | Meaning |
|---|---|
| `code` | Short uppercase ID (e.g., `DIGIKEY`, `WMD`). FK on `supplier_pos`. Unique. |
| `legal_name` | Full company name |
| `category` | `distributor`, `pcb_fab`, `stencil`, `mechanical`, `assembly`, `other` |
| `default_currency` | ISO (CAD, USD, EUR, CNY) |
| `payment_terms` (Mig 078) | Text array — `["Credit Card", "Net 30"]` |
| `billing_address` | JSONB |
| `is_approved` | Gating flag — only approved show in PO dropdowns |
| `online_only` (Mig 077) | TRUE for DigiKey/Mouser/LCSC — excluded from RFQ flow |

`supplier_contacts` — 1..N per supplier. Partial unique index enforces **exactly one primary contact** per supplier.

8 suppliers seeded approved: DigiKey, Mouser, LCSC, WMD, Candor, Stentech, PCBWay, Bisco. Each with primary contact.

UI: `app/(dashboard)/settings/suppliers/`, `components/suppliers/*`.

### 33.6 Supplier quotes / RFQ flow

For non-`online_only` suppliers (custom fabs, stencil vendors), the system supports RFQs.

`supplier_quotes` (Mig 077):

| Column | Meaning |
|---|---|
| `procurement_id` | Which PROC batch |
| `supplier_id`, `supplier_contact_id` | Who we're asking |
| `currency`, `status` | Lifecycle: `draft → requested → received → accepted/rejected/expired` |
| `subtotal/shipping/tax/total` | Denormalized (recomputed on write) |
| `valid_until` | Quote expiration |
| `resulting_po_id` | FK to the PO created when accepted (1:1) |

`supplier_quote_lines` — per-component entries; unique on `(supplier_quote_id, procurement_line_id)`.

**Workflow:**

1. Operator opens PROC batch for WMD (PCB fab).
2. Click "Request Quote from WMD" → row created `status='draft'`.
3. Dialog shows PROC's procurement_lines. Operator fills in qty + unit_price per line; system computes line totals.
4. Click "Send RFQ" → `status='requested'`, email sent to primary contact.
5. WMD replies (email) → operator pastes values, marks `status='received'`.
6. Click "Accept Quote" → system creates `supplier_pos` row (linked via `resulting_po_id`).

UI: `components/proc/supplier-quotes-panel.tsx`, `components/proc/create-supplier-quote-dialog.tsx`.

### 33.7 Stencils library — physical inventory

`stencils_library` (Mig 071):

| Column | Meaning |
|---|---|
| `position_no` | Shelf position from source Excel |
| `stencil_name` | Physical label (e.g., `1118475_REV0`). Unique among **active** stencils (Mig 072) |
| `comments` (Mig 072) | Operator notes |
| `discarded_at`, `discarded_reason`, `discarded_by` (Mig 072) | Soft-delete |

`stencils_library_gmps` — join table: one stencil sheet may cover multiple GMPs (merged stencils).

**Workflow:** Shop maintains Excel with `position_no`, `stencil_name`, `gmp_numbers`. Operator runs `scripts/import-stencils-library.ts` to load. Operators can view, soft-delete (with reason), add comments. **Mig 103** widened RLS: production users can now insert + soft-delete (admin-only operations are rename/restore).

UI: `app/(dashboard)/stencils/page.tsx`, `components/stencils/stencils-library-manager.tsx`.

### 33.8 Manual price override — sales-rep quotes

Real procurement isn't just API queries. A TTI sales rep calls: *"If you order 5,000 units today, $0.047 CAD each shipping included. Beats web price."* You can't automate that.

**Workflow:**

1. Operator in merged-BOM for a PROC line — default supplier is Mouser at $0.052.
2. Click "Override Price" / inline edit.
3. Dialog: `Price (CAD)`, `Note`. Enter $0.047 + "Quoted by David at TTI via phone 2026-05-07, min qty 5000".
4. System saves `manual_unit_price_cad=0.047`, `manual_price_note="…"`.
5. Merged BOM shows this line's effective price = $0.047 (overrides Mouser's $0.052).
6. PO finalization uses $0.047 × qty_needed.

Critical in real manufacturing — distributors have negotiated pricing, supply deals, sales reps. The system can't be a straitjacket.

### 33.9 Files removed

Old tree deleted entirely:

- `app/(dashboard)/procurement/` (8 pages)
- `components/procurement/*` (7 components: batch-workflow, create-po-button, delete-procurement-button, new-proc-batch-form, order-all-button, order-button, receive-button)
- `app/api/bg-stock/*` (3 routes — replaced by `/api/inventory/*`)
- `components/fabrication-orders/*`, `app/api/fabrication-orders/route.ts`
- `app/(dashboard)/bom/page.tsx` — old BOM list landing page

The new `/proc/` is built fresh with a clearer mental model: **jobs → PROC Batch → merged BOM → supplier selection → POs**.

*Part 33 written: May 11, 2026 — backfilled from May 7 squash-merge.*

---

## PART 34: INVENTORY SYSTEM — STOCK LEDGER + ALLOCATIONS (May 7, 2026)

### 34.1 Why the old `bg_stock` was thrown out

For years, RS tracked stock using a simple snapshot table called `bg_stock`. On any given day it would say "We have 1000 units of BG part 0603-10k-1% in the bin." That was all it said — just today's number. A week later it said 750 units. Did we sell 250? Build and consume 250? Receive a shipment? The ledger couldn't tell you. Excel could track that better.

When a PROC was created, there was no way to say "Reserve 250 units for PROC T260507-001 — don't let anyone else use them." No audit trail. If inventory went negative, nobody knew why.

The new system replaces `bg_stock` and `bg_stock_log` entirely with three tables + a view: a **master list** of parts, an **append-only ledger** of every movement, and **soft reservations** against PROCs. Combined, they answer every question:

- **"What do we physically have?"** — sum all ledger entries (delta column)
- **"How much is reserved?"** — sum all open allocations
- **"What's actually available?"** — physical minus reserved
- **"What happened on May 7 at 14:30?"** — one row in the ledger with before/after snapshots

Migration 081 drops the old tables; 079 creates the new ones; 080 and 083 refactor on CPC identity and serial tracking.

### 34.2 The three new tables in plain language

#### `inventory_parts` — master list

One row per part RS stocks:

| id | cpc | mpn | pool | serial_no | physical_qty | reserved_qty | available_qty |
|---|---|---|---|---|---|---|---|
| uuid-1 | 0603-10K-1% | YAGEO RC0603 | bg | 47 | 1000 | 250 | 750 |

- **`cpc`** — business identity. Unique, never null. The lookup key.
- **`mpn`** — what's currently in the bin (informational). Can be null (suppliers rotate).
- **`pool`** — `'bg'` (Background, in SMT feeders) or `'safety'` (shelf stock, emergencies).
- **`serial_no`** — physical feeder-slot number (stable slot ID, not part ID).

#### `inventory_movements` — append-only ledger

Every physical stock change → one row, forever. Never updated or deleted:

| created_at | kind | delta | qty_before | qty_after | proc_id | notes |
|---|---|---|---|---|---|---|
| 2026-05-01 09:00 | buy_external | +1000 | 0 | 1000 | null | PO 2602-8891 from Yageo |
| 2026-05-07 14:30 | buy_for_proc | +500 | 1000 | 1500 | uuid-proc-1 | Shortfall buy for T260507-001 |
| 2026-05-07 16:15 | consume_proc | −250 | 1500 | 1250 | uuid-proc-1 | T260507-001 production started |

- **`delta`** — signed integer, never zero.
- **`kind`** — `buy_for_proc`, `buy_external`, `consume_proc`, `manual_adjust`, `safety_topup`, `initial_stock`.
- **`qty_before`/`qty_after`** — snapshots so audit queries never re-sum.

Beauty: sum all deltas for a part → physical qty. Math always works. The display **is** the ledger sum.

#### `inventory_allocations` — soft holds

When a PROC is created, the system creates a *reservation* without touching the ledger. Why? Because PROCs sit in planning 2–3 weeks before production:

| id | inventory_part_id | procurement_id | qty_allocated | status |
|---|---|---|---|---|
| uuid-alloc-1 | uuid-1 | uuid-proc-1 | 250 | reserved |

- **`status`** — `reserved` (active hold), `consumed` (production started, ledger row written), `released` (hold cancelled).
- **Partial unique index** — only one *open* `reserved` row per `(part_id, proc_id)`. Historical `consumed`/`released` rows don't conflict.

When PROC's first production event fires:
1. Allocation flips `reserved → consumed`.
2. A `consume_proc` ledger row is written: `delta = -250`.

The allocation doesn't *create* the consumption — it marks it. The ledger is source of truth for physical stock. Allocations are a scheduling layer.

### 34.3 The `inventory_part_stock` view — the live dashboard

```sql
physical_qty = SUM(inventory_movements.delta)
reserved_qty = SUM(open allocations' qty_allocated)
available_qty = physical_qty − reserved_qty
```

For our 0603-10k-1%:
- physical_qty = 1250 (1000 + 500 − 250)
- reserved_qty = 250
- available_qty = 1000

UI never does this math — reads straight from the view. Fast, consistent, synchronized with the ledger.

### 34.4 The allocator helpers — `lib/inventory/allocator.ts`

Pure functions; caller supplies authenticated Supabase client (RLS applies).

**`recordMovement({ inventory_part_id, delta, kind, proc_id, ... })`**

Atomically inserts a ledger row with correct `qty_before`/`qty_after` snapshots. When delta > 0, automatically re-runs `reserveAllocation` for every open reservation against that part — so stock arrivals trickle into open holds without operator intervention. Wrapped in try/catch (non-fatal).

**`reserveAllocation({ inventory_part_id, procurement_id, qty_needed })`**

Caps at `min(qty_needed, available_qty)`. Returns `{ allocated_qty, shortfall, allocation }`.

- Fresh reservation → new row.
- Re-compute → updates existing row in place (partial unique index allows).
- Shortfall (e.g., need 2000 but only 250 available) → reserves 250, returns shortfall=1750. Operator sees badge; procurement agent creates buy_for_proc.

**`consumeAllocation(allocation_id, { job_id, notes })`**

Two-step atomic:
1. Flip allocation `reserved → consumed`.
2. Write ledger: `recordMovement(delta=-qty, kind='consume_proc')`.

Called when production event fires.

**`releaseAllocation(allocation_id, { notes })`**

Flip `reserved → released`. No ledger row. Quantity returns to `available_qty`. Operator's "Undo" button.

**`findInventoryByCpc(cpcs[])`**

Bulk lookup: pass CPCs, get `Map<CPC, InventoryPartStock>`. Normalizes (uppercase). Active parts only.

### 34.5 The auto-allocator hook — when a PROC is born

`lib/inventory/auto-allocate-proc.ts`:

1. `computeMergedCpcs(procId)` walks every member job, sums BOM lines by CPC, adds overage extras per M-code. Returns `[{ cpc, qty_needed }]`.
2. POST `/api/proc/[id]/allocations/auto` — calls `reserveAllocation` for each CPC.
3. Best-effort: failures logged but never block PROC creation. Operator can click "Re-run allocation" to retry.

### 34.6 Serial numbers + feeder slots

RS loads parts into SMT feeder slots. Each slot is stable — the same slot whether it holds 0603-10k today or BCM5102 tomorrow. `serial_no` identifies the *slot*.

When RS reassigns slots, `inventory_serial_history` (Mig 083) logs every assignment:

| serial_no | inventory_part_id | assigned_at | unassigned_at |
|---|---|---|---|
| 47 | uuid-1 (0603-10k) | 2026-04-01 | 2026-05-01 |
| 47 | uuid-bcm (BCM5102) | 2026-05-01 | null |

Querying `WHERE unassigned_at IS NULL` → every active slot mapping. Operators can trace "what was in slot 47 last quarter?"

App layer closes old assignment when `inventory_parts.serial_no` changes (no trigger yet — `/inventory/[id]` edit form must call the close logic).

### 34.7 CPC is the primary identity

Why CPC instead of MPN? **Suppliers rotate.**

A customer BOM says "We want CVN-RES-10K1%." That's the CPC — *customer's* canonical identifier. RS might buy from Yageo this month, Murata next month. MPN changes; CPC slot stays.

BOM parser fills CPC from customer's column (or MPN fallback). Every BOM line has a CPC. PROC merges by CPC. `inventory_parts.cpc` is unique + not null (Mig 080).

### 34.8 How to add inventory manually

1. **`/inventory`** → click **Add Part**.
2. Fill: CPC (required, unique), MPN (optional), Pool (`bg`/`safety`), Serial Number (optional), Min Threshold, Description.
3. **Create** → `is_active=true` by default.
4. Click the part → **Add Movement**:
   - Kind: `buy_external` / `buy_for_proc` / `initial_stock` / `manual_adjust` / `safety_topup`
   - Qty (signed integer)
   - Notes / optional PROC link
5. **Record** → ledger row written. Positive movement → open reservations auto-top-up.

`/inventory/[id]` shows full ledger + all allocations (open + historical) across every PROC.

### 34.9 Files changed

**Migrations:** 079 (creates 3 tables + view), 080 (re-keys on CPC), 081 (backfills + drops bg_stock), 083 (serial_no + history).

**Lib:** `lib/inventory/allocator.ts`, `lib/inventory/auto-allocate-proc.ts`, `lib/inventory/types.ts`.

**UI:** `app/(dashboard)/inventory/{page,[id]/page}.tsx`, `app/(dashboard)/settings/inventory/page.tsx`, `components/inventory/*`, `components/proc/stock-allocations-panel.tsx`.

**API:** `app/api/inventory/{route,[id]/route,[id]/movements,import}`, `app/api/inventory/allocations/[id]/{route,consume}`, `app/api/proc/[id]/allocations/{route,auto}`.

**RLS:** admin only. Production users see zero rows.

*Part 34 written: May 11, 2026 — backfilled from May 7 squash-merge.*

---

## PART 35: PAYMENTS, INVOICING, MULTI-CURRENCY, TAX REGIONS (May 7, 2026)

### 35.1 The problem

Four painful limitations blocked growth:

1. **Single payment per invoice.** Issue $10K → customer pays $5K now + $5K in 2 weeks → no way to record partial. Either "sent" (fully unpaid) or marked paid in bulk.
2. **No multi-currency.** USD customers got billed in CAD with handwritten FX note on the PDF. Rate wasn't locked at issue, so a 3-month-old USD balance shifted daily with the market.
3. **Tax hardcoded to QC.** Every invoice defaulted to GST 5% + QST 9.975%, even for Ontario (should be HST 13%) or US (no tax). Operators manually edited PDFs.
4. **No historical continuity.** Five years of Excel invoices predating the web app couldn't be imported. 5-year gap in tax filings and AR reports.

### 35.2 The new payment ledger — multiple payments per invoice

An invoice is now a charge that lives in a **payment ledger** (`payments` table). Multiple payments per invoice, each on a different date, in different amounts, using different methods.

Status is **derived** from the sum:

- `sent` when `SUM(payments) < invoice.total`
- `paid` when `SUM(payments) >= invoice.total`
- Reversible — delete a payment, balance dips below total, status flips back to `sent`.

**Concrete walkthrough:**

- May 1: Issue invoice $10,000 → `sent`
- May 15: Wire $5,000 → running $5,000. Stays `sent`.
- May 28: Cheque $5,000 → running $10,000. Auto-flips to `paid`.
- June 2: Cheque bounced; delete payment → running $5,000. Reverts to `sent`.

Logic in `lib/payments/totals.ts` `bumpInvoiceStatusFromPayments()`. Eliminates the manual "mark paid" step.

**Schema** (Mig 101):
- Renames: `payment_method → method`, `reference_number → reference`, `created_by → recorded_by`.
- CHECK `amount > 0` (positive inflows only).
- Methods: `cheque`, `wire`, `eft`, `credit_card`, `cash`, `other`.

**Backfill:** Every legacy `paid` invoice with `paid_date` got a synthetic payment row at full total, tagged "Backfilled by migration 101."

### 35.3 Invoice lines — one row per job

Legacy linked each invoice to a single job. Operators wanted **consolidated invoices** covering 4–12 jobs. The hack: stuff a note like "Consolidated invoice for jobs: JB-X, JB-Y" into `invoices.notes`. No way to query "what's the quantity for JB-X on this invoice?" Without that → no partial invoicing (invoice 50 of 100 boards now, rest later).

**`invoice_lines`** (Mig 100):

| Column | Meaning |
|---|---|
| `invoice_id`, `job_id` | FKs |
| `shipment_line_id` (optional) | Links to shipment_lines for traceability |
| `quantity`, `unit_price`, `line_total` | Standard line math |
| `is_nre` | TRUE = NRE charge ($800 stencil/programming), not board count |

Job is **fully invoiced** when `SUM(invoice_lines.quantity)` across non-cancelled ≥ `jobs.quantity`. Until then, job stays at `delivered`, prompting "Pending Invoice."

**Backfill:**
- Consolidated → regex parses job list from notes, weights subtotal proportionally by quantity, absorbs rounding into largest line.
- Single-job → one line at full quantity.

### 35.4 Multi-currency — CAD vs USD, with FX snapshots

`currency` ∈ `{CAD, USD}` on customers, quotes, invoices, payments. Cascades customer → quote → invoice.

`fx_rate_to_cad` — locked at issue/payment time, **immutable**. March 1 invoice at 1.3500 stays at 1.3500 forever, even if June rate is 1.3800. Audit trail clean.

**FX source: Bank of Canada Valet API** (`lib/fx/boc.ts`):

- `fetchUsdCadRate()` — latest rate. Cached **6h per process** to avoid hammering BoC.
- `fetchUsdCadRateOnDate(yyyymmdd)` — historical rates for backdated invoices. Searches 7 days back for weekends/holidays.
- Fallback: BoC unreachable → uses customer's most recent invoice rate, tagged `source='fallback'`.

CAD invoices: `fx_rate_to_cad = 1` always.

Revenue reports sum `total * fx_rate_to_cad` → CAD-equivalent across CAD and USD invoices.

### 35.5 Five Canadian tax regimes

`lib/tax/regions.ts`:

| Region | Rule | Coverage |
|---|---|---|
| **QC** | 5% GST + 9.975% QST | Quebec |
| **CA_OTHER** | 5% GST only | AB, BC, MB, SK, YT, NT, NU |
| **HST_ON** | 13% HST | Ontario |
| **HST_15** | 15% HST | NB, NL, NS, PE |
| **INTERNATIONAL** | No tax | US + ROW |

`deriveTaxRegion()` classifies by country + province; falls back to QC if unclear (over-collection beats under-collection — avoids CRA penalties).

**Storage:** HST regions populate `invoices.hst`; QC populates `tps_gst` + `tvq_qst`; CA_OTHER only `tps_gst`; INTERNATIONAL all zero. Reports break out federal vs harmonized for CRA filings.

### 35.6 Billing address snapshots

**Old problem:** Customer moves QC → ON. Tomorrow you fetch their current address and update an old invoice's tax — accidentally changing a 6-month-old PDF.

**Now:** Quotes and invoices each carry a `billing_address JSONB` snapshot at creation. Immutable. Moving the customer doesn't retroactively change old invoices' tax regions.

Mig 105 also backfills `country_code ∈ {CA, US, OTHER}` from free-text country names — fixes the "CANADA"/"CA"/"canada" variability that broke tax derivation.

**Walkthrough:**
- Feb 1: Customer at "123 Rue Quebec, QC, CA" → snapshot captured, `tax_region=QC`, 14.975% tax.
- April 15: Customer moves to "456 King St, ON, CA" → update `customers.billing_addresses`.
- May 10: View the Feb invoice → still QC, still 14.975%. Correct.

### 35.7 Historic invoice import

Five years of Excel invoices (2019–2023) needed importing.

**`is_historic`** BOOLEAN — excludes these from "pending" lists and AR aging (closed history), includes them in reports. Queries check `WHERE NOT is_historic` or `WHERE is_historic`.

**`legacy_reference`** TEXT — e.g., "DM File V11 r142" or "QB INV #4567".

**`invoices.job_id`** now nullable — historic invoices predate the jobs table.

**Auto-paid (Mig 108):** Every imported historic invoice auto-marked `status='paid'` with `paid_date = COALESCE(paid_date, issued_date)` and `payment_method='historic_import'`. Prevents stale invoices from inflating Total Outstanding.

**Wizard** (`components/settings/historic-import-wizard.tsx`):

1. Upload CSV → server parses and validates every row. Returns preview + errors. Zero inserted.
2. Click "Import" → same file, `dry_run=0`. Atomic transaction: insert all rows or fail entirely.

CSV schema: `customer_code, invoice_number, issued_date, currency, fx_rate_to_cad, subtotal, gst, qst, hst, freight, discount, total, tax_region, status, paid_date, legacy_reference, notes`.

**Example row:**
```
CVNS,INV-LEGACY-2023-022,2023-09-18,USD,1.3502,1500.00,0,0,0,0,0,1500.00,INTERNATIONAL,paid,2023-10-22,QB INV #4612,Notes
```

### 35.8 NRE billing split

**Old problem:** 100-board job with $800 NRE → system amortized across all 100 boards ($8/board). Invoice 50 boards first → collected only $400 NRE. Second partial invoice had different per-board math. Customers confused.

**Now:** NRE is a **separate line item on the first invoice**, qty=1, full $800.

- `invoice_lines.is_nre` BOOLEAN
- `jobs.nre_invoiced` BOOLEAN cache — TRUE iff any non-cancelled `invoice_line` with `is_nre=TRUE` exists. Prevents double-charging.
- `getJobInvoiceTotals()` in `lib/invoices/totals.ts` excludes NRE lines from board-count sums (so "remaining to invoice" doesn't confuse $800 of stencil cost with 800 boards).

### 35.9 Customer statement page

`/customers/[id]/statement`:

**Ledger** — chronological table interleaving invoices (charges) + payments (credits), running balance:

| Date | Description | Charge | Payment | Balance |
|---|---|---|---|---|
| May 1 | Invoice INV-2024-001 | $10,000.00 | | $10,000.00 |
| May 15 | Wire | | $5,000.00 | $5,000.00 |
| May 28 | Cheque | | $5,000.00 | $0.00 |

**Synthetic payments** — for historic imports (paid status, no real payment rows), ledger auto-inserts a synthetic entry tagged "Reconciled from invoice paid status."

**Period selector:** FY mode (Calendar / Tax Nov–Oct / Financial Oct–Sep), granularity (Month / Quarter / Semi / Annual). URL updates with `?from=X&to=Y`.

**AR aging buckets:** Current / Over 30 / Over 60 / Over 90 days. Partial payments reduce balances correctly.

**PDF export** — click Download → printable statement with ledger, aging, contact details.

### 35.10 Revenue reports

`lib/reports/revenue.ts`:

- Accrual basis (by `issued_date`, not payment date).
- FY modes (Calendar / Tax Nov–Oct / Financial Oct–Sep).
- Multi-currency views: CAD-only, USD-only, CAD-equivalent.
- Tax breakout: GST / QST / HST per bucket.
- Historic invoices included — closes the 5-year gap.

UI: `components/reports/revenue-section.tsx`, `revenue-controls.tsx`.

### 35.11 How to record a payment

**From an invoice:**
1. Open `/invoices/[id]` → scroll to Payments section.
2. Click **Record Payment**.
3. Fill: Amount, Method, Reference, Payment Date, Notes.
4. **Save** → payment appears in ledger; invoice status auto-updates.

**Bulk record** (Payments list page):
1. `/invoices` → Payments tab → **Bulk Record Payment**.
2. Select invoices from a table.
3. Fill one form for all (same amount, method, date).
4. **Record** → one payment row per invoice.

### 35.12 Files changed

**Migrations (9):** 100 (invoice_lines), 101 (payments ledger), 102 (audit triggers), 104 (currency + tax_regions), 105 (address snapshots), 106 (is_historic), 107 (is_nre), 108 (auto-mark paid), 109 (cache uniqueness — not strictly invoicing but landed in the same commit).

**Lib:**
- `lib/payments/totals.ts` — ledger logic
- `lib/invoices/totals.ts` — job invoice totals (NRE-aware)
- `lib/fx/boc.ts` — Bank of Canada FX
- `lib/tax/regions.ts` — 5-regime tax engine
- `lib/reports/revenue.ts` — FY-aware revenue

**UI:**
- `components/payments/{payments-list, record-payment-dialog, record-payment-form, bulk-payment-button, bulk-record-payment-dialog, customer-statement-table}.tsx`
- `components/settings/historic-import-wizard.tsx`
- `components/quotes/quote-currency-control.tsx`
- `components/reports/{revenue-section, revenue-controls}.tsx`

**Pages:**
- `app/(dashboard)/customers/[id]/statement/{page, loading}.tsx`
- `app/(dashboard)/settings/historic-import/page.tsx`

**API:**
- `/api/customers/[id]/statement` — ledger + aging
- `/api/payments` — CRUD
- `/api/historic-import` — dry-run + commit

*Part 35 written: May 11, 2026 — backfilled from May 7 squash-merge.*

---

## PART 36: BOM, GMP, AND PRICING EVOLUTION — CPC, CUSTOMER PARTS, LABOUR SETTINGS, MARKUP OVERRIDES (May 7, 2026)

### 36.1 The CPC rename — why "Customer Part Code" instead of "MPN"

When a customer sends a BOM, each line has a part number — but **two different numbering systems exist**.

**Manufacturer** calls their parts by an **MPN** (Manufacturer Part Number). Example: `TDK-0402X7R223K050BC`. That's what's stamped on the datasheet and what distributors' databases are keyed on.

**Customer** often uses their own **CPC** (Customer Part Code). Example: `R_100K_0402_1%`. Semantic, stable across revisions. Customer-facing.

Before May 2026, `components.mpn` was used as the Layer-1 classifier lookup key. **Wrong.** When a customer BOM has a CPC column, that's the stable key:

1. **CPC is stable** — three revisions of the same board keep the CPC; only MPN changes when they switch suppliers.
2. **Our overrides stick** — "CPC `R_100K_0402_1%` uses M-Code `CP` and preferred MPN `ERJ2RHF1003T2`" → next BOM revision hits the override immediately.

**Mig 049** renamed `components.mpn` → `components.cpc`. Breaking change for external readers. Parser now prioritizes CPC; falls back to MPN only when CPC column absent.

### 36.2 Alternate part numbers

Customers list multiple part numbers per line: primary + second source + cross-references. Before, parser picked first and ignored the rest.

**Mig 050** — `bom_line_alternates`: one row per `(bom_line, candidate_mpn)`. `rank` (0=primary, 1..N=alternates), `source` ∈ `{customer, rs_alt, operator}`. Dedupes by `(bom_line_id, mpn)`.

**Mig 051** — three columns on `components`: `mpn` (original BOM MPN, informational), `alt_mpn` (RS-verified substitute), `alt_mpn_reason` ("original EOL on DigiKey").

The pricing engine fetches quotes for each alternate, presented side-by-side. Operator picks best-stocked option without manual hunting. Parser detects alternates via keywords ("Alternate 1", "Second Source", "Alt MPN").

### 36.3 Customer parts unification

Two old Excel sheets:
1. "Procurement log" — per-customer part overrides, M-codes, preferred sources.
2. "Manual machine code" — flat global CPC → M-Code map.

**Mig 055** creates `customer_parts` — one row per `(customer, CPC)`:
- Original MPN/manufacturer + preferred (mpn_to_use, manufacturer_to_use)
- Known distributor PNs (digikey_pn, mouser_pn, lcsc_pn)
- Per-customer `m_code_manual` override
- TH pin count
- Historical proc batch codes

**Classification priority:**
1. `customer_parts.m_code_manual` (per-customer)
2. `manual_m_code_overrides.m_code` (legacy global — being phased out)
3. `components.m_code` (base)
4. Rule engine (PAR rules)
5. Claude AI fallback

**Mig 056** is idempotent: copies global overrides into matching customer_parts rows (only filling NULLs to preserve per-customer overrides), then **drops** `manual_m_code_overrides`. Orphan CPCs logged; re-learned on next BOM.

Unlocks **per-customer customization** — Cevians uses a generic 0603 10k where the designer's 1% is unavailable.

### 36.4 GMP board-side normalization

Old `quotes.assembly_type` mixed two orthogonal concepts:

- **Physical layout** — single-sided or double-sided?
- **Billing model** — turnkey or consignment?

Values like `'TB'`, `'TS'`, `'CS'`, `'CB'`, `'AS'` jumbled them together. The fix: split into two tables.

**Mig 074** adds four columns to `gmps`: `boards_per_panel`, `board_side ∈ {single, double}`, `ipc_class ∈ {1,2,3}`, `solder_type ∈ {leaded, lead-free}`. Backfills from most recent non-null BOM value per column. **These describe the physical product and never change.**

**Mig 075** — second backfill from quotes (for values entered via quote wizard, not BOM). Type conversion: `'TB' → 'double'`, `'TS' → 'single'`.

**Mig 089** tightens legacy `assembly_type` enum to physical values only (`TB`, `TS`). Billing values (`CS`, `CB`, `AS`) deprecated → migrated to `procurement_mode ∈ {turnkey, consignment, assembly_only}` on quotes.

**Mig 091** — **BREAKING** — drops `assembly_type` from `quotes` and `jobs` entirely. Code now reads `gmps.board_side`. **One place** to look for physical layout. Edits to GMP board details apply retroactively to all quotes and jobs.

### 36.5 TH pin count per line

TH parts have labour cost based on **pin count** — a 10-pin IC costs more than a 2-pin connector. But the *same part* can have different pin counts on different boards (8-pin socket accepts 8/14/16-pin DIP variants).

**Mig 057** — `bom_lines.pin_count` (nullable int). Classifier seeds from `customer_parts.through_hole_pins`. Operators can override on pricing-review page. Labour engine reads per-line.

### 36.6 Labour settings versioned

Old labour rates lived in `app_settings.pricing` JSON blob — edit destroyed history.

**Mig 059** — `labour_settings` table with **versioning**. Each row is a snapshot keyed by `effective_date`. Only one row `is_active=TRUE` at a time. Change a rate → insert new row → flip old to inactive. History preserved.

Fields:
- **Overhead**: `monthly_overhead`, `production_staff_count`, `hours_per_day`, `days_per_month`, `utilization_pct`.
- **Derived** (auto-computed): `available_hours_per_month = staff × h/day × days/mo × util%`; `burdened_rate_per_hour = monthly_overhead / available_hours_per_month`.
- **SMT line**: conveyor_mm_per_sec, oven_length_mm, reflow_passes_default.
- **Cycle times** (seconds): cp, 0402, 0201, ip, mansmt, th_base, th_per_pin.
- **Setup**: smt_line_setup_minutes, feeder_setup_minutes_each, first_article_minutes.
- **Per-board manual** (minutes): inspection, touchup, packing.

**Mig 060** — adds `cycle_depanel_seconds` (depanelisation; default 40s/board).

Pricing engine doesn't read `labour_settings` directly. **`lib/pricing/labour-overlay.ts`** (122 lines) reads the active row, converts seconds → CPH (3600/seconds), overlays onto existing `PricingSettings`. Engine works as before — no internal refactor.

UI: `components/settings/labour-settings-form.tsx` (admin-only). Per-quote breakdown: `components/quotes/labour-breakdown-panel.tsx`.

### 36.7 Per-quote markup overrides

Anas needs to give a loyal customer a discount or add margin on a rush. Three nullable columns on `quotes`:

- `component_markup_pct_override` (Mig 061)
- `pcb_markup_pct_override` (Mig 061)
- `assembly_markup_pct_override` (Mig 086 — also seeds global `assembly_markup_pct: 30`)

NULL = use global. UI: `components/quotes/markup-override-editor.tsx`. Pricing preview now has **expandable rows** showing cost-before-markup (gray) + markup amount (green). Chevron toggles. Backward-compat: old quotes without markup data show flat rows.

### 36.8 NRE schema cleanup

NRE was split across 5 buckets. **Mig 052** drops `nre_setup` and `nre_misc`. Only three remain:

- **nre_programming** — firmware/gcode development
- **nre_stencil** — solder paste stencil (per panelization variant)
- **nre_pcb_fab** — PCB tooling

Simpler model. Eliminates "is this setup or misc?" debates.

### 36.9 API pricing cache fixes

`api_pricing_cache` caches DigiKey/Mouser/LCSC/Future/Avnet/Arrow/etc. results.

**Mig 058** — drops CHECK constraint on `source` (was pinned to DigiKey/Mouser/LCSC only; silently rejected newer distributors). Any supplier can be added.

**Mig 109** — moves UNIQUE from `(source, search_key)` to `(source, search_key, supplier_part_number, warehouse_code)`. Newark returns multiple SKUs per MPN (different stock/lead-time variants). Old constraint collapsed all into one row — last write won, hid in-stock variants. Now all variants kept.

### 36.10 customers.folder_name

**Mig 073** — `folder_name` TEXT on customers. Convenience name for filing documents (e.g., "Cevians" for "Cevians LLC"). No unique constraint.

*Part 36 written: May 11, 2026 — backfilled from May 7 squash-merge.*

---

## PART 37: JOBS, PRODUCTION, SHIPMENTS — PARTIAL BUILDS, DUE DATES, RLS WIDENING (May 7, 2026)

### 37.1 Frozen PO pricing

When a customer PO arrives ("100 units from QT-2604-007 at Qty-50 tier"), we create a job and **freeze the price** so later quote edits don't change job costing.

**Mig 062** denormalizes onto `jobs`:
- `source_quote_id`
- `source_tier_qty` (e.g., 50)
- `frozen_unit_price` (internal cost per unit at that tier)
- `frozen_subtotal` (unit × quantity)
- `po_date`
- `price_match_reason ∈ {exact, closest-not-greater, manual-override, no-match}`

If Anas later edits the quote's Qty-50 tier (PCB cost dropped), the edit does NOT affect jobs already created. Profit margin stays locked.

### 37.2 PO unit price vs frozen unit price

Customer's PO states a price: "100 units at $47.50 each." `jobs.po_unit_price` (Mig 068) — operator-entered at ingest. **The price we bill the customer.**

Our internal `frozen_unit_price` is what we computed (component + PCB + assembly + labour + markup + NRE allocation). Usually different. The gap is our profit margin. Storing both keeps customer-facing pricing and internal costing separate.

### 37.3 NRE charge on the job

**Mig 069** — `nre_charge_cad` + `nre_included_on_po` BOOLEAN. Drives invoicing: when TRUE, NRE added to invoice line items. When FALSE, NRE deferred or paid separately.

### 37.4 Job due_date

Customer-facing delivery deadline (separate from `scheduled_completion` internal target).

**Mig 093** — `jobs.due_date` DATE, nullable, indexed. On job creation:

1. Find matching quote tier (whose board_qty fits job quantity).
2. Read `lead_times` JSONB from that tier.
3. `lib/jobs/due-date.ts`:
   - `parseLeadTimeDays("3 Weeks")` → 21 days
   - `computeDueDate({ leadTimes, tierIndex, baseDate })` → adds 21 days to PO date
4. Store as `due_date`.

Parser handles natural language: "3 Weeks", "5 business days", "21 days", bare numbers. Business days → calendar days at 5/7 ratio.

Admin can override for rush orders. Existing jobs (pre-Mig 093) have NULL — no reliable back-derive. UI shows "Not set" + one-click "Set."

### 37.5 Programming status three values

**Mig 090** — tightens `jobs.programming_status` to:
- `not_ready` (default) — firmware not yet prepared
- `ready` — program on hand and validated
- `not_required` — board has no programming step

**Auto-flip rule:** New job → check if prior job exists for same `bom_id`. If yes → start `ready` automatically (we've programmed this exact BOM before). Else → `not_ready`.

`lib/jobs/programming-status.ts` `deriveInitialProgrammingStatus()`. Backfill maps `not_needed → not_required`, `done → ready`, `pending/in_progress → not_ready`.

Saves an operator click for repeat boards (99% of jobs). Manual override available.

### 37.6 Job status log field discriminator

Old `job_status_log` only tracked lifecycle status changes. Programming status now changes independently. **Mig 092** adds:

```sql
field TEXT NOT NULL DEFAULT 'status'
  CHECK (field IN ('status', 'programming_status'))
```

Each log row records *which* field changed. When programming_status flips, row has `field='programming_status'`, `old_status='not_ready'`, `new_status='ready'`. Backfill stamps existing rows as `field='status'`.

### 37.7 Production RLS widening

Production users (Piyush, assembly floor) historically had read-only on shipments and couldn't see customer names on shipping packing slips.

**Mig 094** — replaces read-only shipments policy with FOR ALL. Production can create/update shipments, add tracking, mark delivered.

**Mig 095** — widens `jobs_production` SELECT from `'production'/'inspection'` only → every non-financial status (`created → parts_received → production → inspection → shipping → delivered`). `invoiced`/`archived` stay admin-only.

**Mig 096** — adds SELECT-only on `customers` and `gmps` for production. Shipping pages need customer name (labels) and board name (packing slip headers). Without this, RLS filtered nested objects → blank columns.

### 37.8 Customer pickup shipments

**Mig 097** — `shipments.picked_up_by` TEXT + expands `carrier` CHECK to include `'Customer Pickup'`. When carrier=Customer Pickup, no in-transit stage. Goes straight to `delivered` when customer walks out.

### 37.9 Partial builds — boards ready in batches

A 500-unit job doesn't get assembled all at once. Line assembles 100, releases to shipping for QC, assembles next 100 next day.

**Mig 098** — `shipments.quantity` (positive int). Each shipment states how many boards. Backfill: existing shipments `quantity = job.quantity`.

**Mig 099** — the big one:

**1. `jobs.ready_to_ship_qty`** — monotonic counter, 0 to `job.quantity`, CHECK constraint. When operator releases 100 boards, counter goes 0→100. Next release of 150 → 250. Counter never decreases unless admin corrects. When `== job.quantity`, status auto-advances to `'shipping'`.

**2. `shipment_lines` table** — breaks 1:1 jobs↔shipments. One physical shipment (one tracking, one carrier, one customer) can carry boards from multiple jobs:

```
SHP-20260507-001 (FedEx to Cevians)
  - 100 units from JB-001
  - 50 units from JB-003
  - 200 units from JB-005
```

Columns: `(shipment_id, job_id, quantity)`. RLS: CEO + production full access.

**3. `shipments.customer_id`** — denormalized FK; avoids join through `shipment_lines → jobs → customers`.

**UI:** `components/production/release-to-shipping-dialog.tsx`. Operator opens modal:
- Job quantity: 500
- Already released: 250
- Remaining: 250

Enter "100" (increment, default) or click pencil for absolute mode and enter "350". POST/PATCH updates `ready_to_ship_qty`. Parent kanban updates optimistically.

`lib/shipments/totals.ts` `getJobShipmentTotals()` queries shipment_lines, sums non-cancelled, returns `{ shipped, remaining, jobQuantity }`.

### 37.10 Multi-job shipments

Before Mig 099, every job had exactly one shipment (1:1). Now one physical shipment contains multiple jobs:

- `customer_id` — denormalized (one shipment goes to one customer, even if multiple jobs)
- `carrier` ∈ `{FedEx, UPS, DHL, Customer Pickup}`
- `tracking_number`
- `status ∈ {created, in_transit, delivered, cancelled}`

`shipment_lines (shipment_id, job_id, quantity)`. When operator packs the box, they might be consolidating pieces from three jobs. One shipment record, three lines.

### 37.11 Quote procurement_mode consignment

**Mig 084** mirrors Mig 070 onto `quotes`. Backfills `consign_parts_supplied`/`consign_pcb_supplied` → `consignment`. CHECK becomes `{turnkey, consignment, assembly_only}`. Quotes properly record billing model at creation.

### 37.12 The new UI pages and rewrites

**New pages:**
- `app/(dashboard)/gmp/[id]/page.tsx` — GMP detail with canonical `board_side`, board details (IPC class, solder type, panelization), recent BOMs, quotes, jobs.
- `app/(dashboard)/jobs/new/page.tsx` — creation form with due_date calc from lead times, source quote selection, PO fields, NRE charge checkbox.
- `app/(dashboard)/parts/page.tsx` — search/browse `customer_parts`; edit MPN overrides, pin counts, M-Code overrides per customer.
- `app/(dashboard)/customers/import/page.tsx` — bulk CSV import.
- `app/(dashboard)/settings/labour/page.tsx` — labour settings editor (admin only); active row + edit history.

**Rewritten:**
- `components/production/monthly-gantt.tsx` — calendar view; uses `ready_to_ship_qty + due_date` to surface late-delivery risk (when `scheduled_completion > due_date`, highlight red). Driven by `lib/production/next-event.ts`.
- `components/production/production-kanban.tsx` — cards show "20/100 ready to ship" (progress bar). Click → ReleaseToShippingDialog.

**New shipments directory:**
- `components/shipments/shipment-create.tsx` — create shipment, select carrier, enter tracking
- `components/shipments/shipment-lines.tsx` — edit jobs/quantities
- `components/shipments/shipment-detail.tsx` — view, mark delivered

**Updated:**
- `components/quotes/quotes-table.tsx` — new columns: board_side (from GMP), procurement_mode, markup overrides
- `components/quotes/lead-times-editor.tsx` — edit `lead_times` JSONB per tier

### 37.13 Audit triggers extended

**Mig 102** — extends `audit_trigger_func` coverage to procurements, supplier_pos, payments, invoices, jobs, etc. Tightens RLS by dropping policies now covered by triggers.

**Known issue:** `audit_trigger_func` still uses `NEW.id`, which breaks for text-PK tables (e.g., `suppliers`). See `feedback_audit_trigger_broken.md` in memory.

### 37.14 What's pending / risks

- **Audit triggers** — text-PK `NEW.id` issue affects some tables; known and under investigation.
- **Existing jobs** — pre-Mig 093 jobs have NULL `due_date`. No back-derive possible.
- **Programming status backfill** — auto-flip is best-effort; spot-check long-paused builds.
- **Production RLS** — production now sees customers + GMPs (Mig 096). SELECT-only, but worth a manual audit for sensitive fields.

*Part 37 written: May 11, 2026 — backfilled from May 7 squash-merge.*
