# RS PCB Assembly — Web App Build Prompt

**Version:** 1.0
**Date:** April 7, 2026
**Author:** Anas Patel, CEO — RS Electronique Inc.
**Purpose:** Hand this to any AI or developer building the RS ERP web application. Read it completely before writing a single line of code.

---

## PART 1: WHO WE ARE AND WHY THIS EXISTS

RS Electronique Inc. (brand: RS PCB Assembly) is a contract electronics manufacturer in Montreal. We take customer PCB designs, procure all the components, assemble the boards on our SMT line, inspect them, and ship finished product. We handle everything from 1-board prototypes to production runs of hundreds.

There are 3 people who run this company day-to-day:

- **Anas Patel (CEO)** — Sales, customer relationships, quoting approvals, strategic decisions. Based in Montreal.
- **Piyush Tayal (Manager, Technical Operations)** — Procurement, order processing, production coordination. Based in India. He is the one who physically operates the current system 8+ hours a day.
- **Hammad Ahmed (Production)** — Runs the SMT machines, assembles boards, receives material, ships product. He is on the shop floor.

Right now, our entire business runs on 11 interconnected Excel workbooks with VBA macros. A single quote involves opening 3-4 of these files, clicking ~15 macro buttons in exact sequence, and praying that OneDrive doesn't corrupt a file mid-save. It works. It has gotten us this far. But it cannot scale, it cannot be accessed by multiple people simultaneously, and it breaks in ways that cost us real money.

**This web app is not a rewrite. It is a liberation.** But it must preserve every piece of business logic that the Excel system encodes — because that logic was built from years of mistakes, edge cases, and hard-won operational knowledge.

---

## PART 2: WHAT AI ALWAYS GETS WRONG

Before you design anything, internalize these truths. Every AI that has attempted to build this system has failed on these points:

### 2.1 — The Merge-Split Pattern Is the Core Business Logic

We do not process boards independently from start to finish. The workflow is:

1. **START SEPARATE** — Each board (GMP) has its own sheet in the DM File with its own BOM data.
2. **MERGE into MasterSheet** — Multiple boards are combined so we can assign M-codes once, run API pricing calls once, and calculate procurement once. This is not a convenience. It saves thousands of dollars in API calls, person-hours, and component pricing (bulk ordering).
3. **SPLIT BACK** — After pricing is done on the MasterSheet, data is sent back to individual GMP sheets for per-board quoting, per-board TIME files, per-board print copies.

This merge-split happens TWICE in the lifecycle:

- **First merge-split: Quoting** — Merge to price components across all boards, split to generate individual quotes.
- **Second merge-split: Procurement** — After PO received, merge again via Proc Batch Code to order all material together, then split for individual production tracking.

If your data model treats each board as an independent entity from start to finish, you have missed the entire point of this system.

### 2.2 — The DM File Is a Workbench, Not a Database

The DM Common File is where Piyush WORKS. He sees the data, validates it with his eyes, catches errors because the numbers are right in front of him. A web app that hides data behind API calls and shows a "Processing..." spinner removes the human quality control layer that prevents us from sending a customer a quote with wrong pricing.

**Requirement:** Every step that currently shows Piyush data on screen must continue to show him data on screen. No black boxes. No "trust the algorithm." He needs to see the M-codes before they're sent back. He needs to see the pricing before it goes into the quote. He needs to see the extras calculation before the final order quantity is set.

### 2.3 — The Button Sequence Is a Dependency Chain with Human Checkpoints

The 11 MasterSheet buttons are not "steps to automate away." Each exists because:
- The NEXT button needs the OUTPUT of the previous one
- A HUMAN needs to VERIFY before proceeding

The sequence:
1. Get Unique MPN
2. Update X Quantity
3. Get Qty and Board
4. Update MCode (assigns M-codes based on 43 classification rules)
5. Add Manual MCode (human override for edge cases the rules can't catch)
6. Get Final Qty (calculates extras based on M-code — different component types get different fallout rates)
7. Load Saved Procurement Data
8. Save Data to Procurement
9. Get Stock & Price (DigiKey/Mouser API — runs on ORDER quantity, not BOM quantity)
10. Send Data to BOM (pushes M-codes and pricing back to individual sheets)
11. Generate Proc File

You can batch some of these. You can speed them up. But you CANNOT remove the checkpoints between steps 4-5 (human M-code override), between 6-9 (verify quantities before spending API calls), or between 9-10 (verify pricing before committing).

### 2.4 — The Proc Batch Code Is a Physical-World Grouping

When Piyush selects 3 rows in Job Queue and generates a proc batch code, he is saying: "I am going to physically order these components together. They will arrive in the same boxes. Hammad will receive them together on the shop floor."

The batch code format encodes real information that a human reads on a physical folder label:
```
YYMMDD CUSTOMER-TYPE###
Example: 260407 ISC-TB001

Date:     260407 (April 7, 2026)
Customer: ISC
Type:     T = Turnkey, A = Assy Only, C = Consignment, P = PCB Only, D = Components Only, M = PCB & Components
Batch:    B = Batch (multiple boards), S = Single board
Sequence: 001 (auto-incremented per customer)
```

This is NOT a database auto-increment ID. It is a human-readable physical label that encodes procurement decisions.

### 2.5 — "Send" Buttons Are Trust Transfers, Not API Calls

Each "Send" action in the current system represents a human committing that data is correct and ready for the next stage:

| Button | What It Really Means |
|--------|---------------------|
| Send All Data to BOMs | "I have verified the BOM data. Push quantities to individual sheets." |
| Send Data to MasterSheet | "M-codes are assigned, extras calculated. Push to pricing engine." |
| Send to Job Queue | "Anas approved this quote. Customer said yes. This is now a real order." |
| Send to Production Schedule | "Material is being ordered. Hammad needs to know this is coming." |
| Generate Reception File | "Everything has been purchased. Here's what to expect at the dock." |

A web app that auto-syncs everything in real-time removes the concept of commitment. Each stage transition MUST require an explicit human action.

### 2.6 — The API Runs Twice on Purpose

- **First API run (Quoting):** Gets pricing on BOM quantities so we can generate a quote for the customer.
- **Second API run (Procurement):** Gets pricing on ORDER quantities (BOM qty + extras based on M-code classification) so we can actually purchase.

These are different numbers. A through-hole part gets different extras than an 0402 chip resistor because the fallout rates are different. The M-code determines the extras percentage. The extras determine the order quantity. The order quantity determines the price.

If you "optimize" this into one API call, you will either quote wrong prices or buy wrong quantities. Both cost us money.

### 2.7 — The Reception File Is a Handoff Document

When the reception file is generated, it creates FOUR outputs simultaneously:
1. **Reception File** — Physical checklist Hammad uses at the receiving dock
2. **Xcomp File** — Cross-reference for component verification
3. **Stock File** — Updates to background stock tracking
4. **CX Supplies File** — Customer-supplied parts tracking

It also automatically updates the Production Schedule status from "Not Ready" to "Ready" for that proc batch code. This is how the production floor knows material has been ordered and when to expect it.

### 2.8 — 4 Quantities, Not 5 — And They're Sales Tools

The system quotes 4 quantity tiers (QTY #1 through QTY #4). Each tier gets its own:
- Component pricing (API-sourced, different unit costs at different volumes)
- Labour rates
- NRE charges (stencil, setup, programming)
- Total per-board cost

This is not a "pricing table." It is negotiation ammunition. When a customer sees that ordering 200 boards costs $45/board but ordering 50 costs $78/board, they order 200. The web app must present these tiers the way a salesperson would — making the volume break obvious and compelling.

### 2.9 — BG Stock Deduction Timing Is a Business Decision

Background stock (parts already in our inventory from previous jobs) is NOT deducted when a customer places an order. It is deducted when the Proc File is generated — because that is when we COMMIT to using those parts for this specific job.

Between order placement and proc generation, another higher-priority job might need those same parts. The timing of stock deduction is a deliberate business choice, not a technical implementation detail.

### 2.10 — "Refresh Qty" Is the Heartbeat

The Production Schedule's "Refresh Qty" button is not a dashboard refresh. It cross-references every line in Production Schedule against Job Queue to determine:
- Is this order still active? (Status = "6. In Production" → show PO qty)
- Has it shipped? (Status = "4. Order Shipped" → show backorder qty)
- Is it fully complete? (Backorder qty = 0 → shows zero, line is done)

This is how the production floor knows what is still outstanding. It must run fast, and it must be accurate.

---

## PART 3: THE COMPLETE WORKFLOW — STEP BY STEP

This is the entire lifecycle of an order at RS PCB Assembly. The web app must support every step.

### Phase 1: RFQ Receipt & Setup

```
TRIGGER: Customer sends RFQ (email with BOM, Gerber files, assembly drawing)

1. Go to Job Queue → Admin sheet
2. Fill in customer details, GMP name, all required fields
3. Create production folder from template (name MUST match Admin sheet exactly)
4. Generate CP IP BOM from customer's raw BOM (9 rules — see Section 4)
5. Import CP IP BOM into DM File (creates or updates the GMP's individual sheet)
6. Register in DataInputSheets (S.No, Customer, GMP, BOM name, PCB name)
```

### Phase 2: Quoting (The First Merge-Split)

```
7.  Activate board — Set Active Qty = 1, fill QTY #1 through QTY #4
8.  Press "Send All Data to BOMs" — pushes quantities from DataInputSheets to each GMP sheet
    (Shows frmTaskEntry form first — user enters project name)
9.  MERGE: All active GMP sheets feed into MasterSheet
10. In MasterSheet, run the 11-button sequence:
    a. Get Unique MPN — deduplicates across all boards
    b. Update X Quantity — calculates cross-board quantities
    c. Get Qty and Board — maps components to boards
    d. Update MCode — applies 43 M-code classification rules
    e. [CHECKPOINT] Add Manual MCode — human reviews and overrides where needed
    f. Get Final Qty — calculates extras per M-code (different fallout rates)
    g. Load Saved Procurement Data — pulls any cached pricing
    h. Save Data to Procurement — stages procurement data
    i. Get Stock & Price — DigiKey/Mouser API on ORDER quantities (with extras)
    j. [CHECKPOINT] Human reviews pricing before proceeding
    k. Send Data to BOM — pushes M-codes + pricing back to individual GMP sheets
11. SPLIT: Each GMP sheet now has its own pricing data
12. Get Individual Pricing per GMP
13. Calculate — compute extended prices and NRE for all 4 quantity tiers
14. Generate Time File — creates time tracking file, auto-creates Quotation folder
15. Set labour/SMT rates for all 4 quantities
16. Send Data to Individual Sheets — final pricing review
17. Reset Template → Fill Template → Print Template — generates PDF quotation
18. Anas reviews and approves
19. Send quotation to customer on original email thread
```

### Phase 3: Order Received & Procurement Setup (The Second Merge-Split)

```
TRIGGER: Customer sends PO (Purchase Order)

20. In DM File, press "Send to Job Queue"
    - Transfers board data to Job Queue
    - Creates print copy (not final — just working version)
    - Also opens NCR Log in background
21. In Job Queue:
    a. Enter PO number, delivery dates, all customer-provided details
    b. Fill "Serial Number Required" field (mandatory — system won't proceed without it)
    c. Select the rows (boards) to be procured together
    d. Press "Generate Proc Batch Code"
       - System reads order type (Turnkey/Assy Only/Consignment/PCB Only/Components Only/PCB & Components)
       - System checks single vs batch (1 row vs multiple rows)
       - Generates code: YYMMDD CUSTOMER-TYPE### (e.g., 260407 ISC-TB001)
       - Assigns board letters (A, B, C...) to each selected row
    e. Press "Send to Production Schedule"
       - Creates entries in Production Schedule for each board
       - Sets ReceptionFileStatus = "Not Ready"
       - Sets ProgrammingStatus = "Not Ready"
       - Copies stencil name, solder type, M-code summary, board letters
       - Updates Job Queue status to "6. In Production"
```

### Phase 4: Procurement

```
22. In DM File, press "Generate Proc File"
    - Requires proc batch code input
    - FIRST: Subtracts BG stock (commits inventory to this job)
    - Checks proc folder exists (will NOT create it — must exist already)
    - Creates PROC [batch code].xlsm from template
23. Piyush works through the Proc File:
    - Runs APIs for final order-quantity pricing
    - Generates POs to suppliers (DigiKey, Mouser, WMD for PCBs, Stentech for stencils)
    - Tracks each supplier order
24. When all purchasing is complete, press "Generate Reception File"
    - Creates Reception File (physical checklist for receiving dock)
    - Auto-creates Xcomp file, Stock file, CX Supplies file
    - Updates Production Schedule: ReceptionFileStatus → "Ready"
    - Writes package summary (e.g., "CP=3, IP=6, DP=2") to Production Schedule
    - Modifies BOM print copies with customer references and supplier info
```

### Phase 5: Production & Shipping

```
25. Material arrives — Hammad checks against Reception File
26. Hammad programs SMT machines (CM602, Fuji CP6)
27. Production: stencil print → pick and place → reflow → inspection (AOI)
28. Quality check, rework if needed
29. Packing and shipping (UPS/FedEx/GLS/DHL depending on destination)
30. In Production Schedule, press "Refresh Qty"
    - Cross-references Job Queue for current status
    - "6. In Production" → shows PO quantity
    - "4. Order Shipped" → shows backorder quantity
    - Fully shipped (backorder = 0) → shows zero → line is done
31. Invoice generated, sent to customer
```

---

## PART 4: CP IP BOM — THE 9 RULES

Every customer BOM must be standardized into a 6-column CP IP BOM before entering the system. These rules are non-negotiable:

1. **Fiducial Exclusion** — Remove rows where designator matches FID + digits
2. **PCB at Top** — PCB row (designator matches ^PCB[A-Z0-9\-]*$) is always row 1. Detected by DESIGNATOR ONLY — never match on description text
3. **DNI Exclusion** — Remove "Do Not Install" rows (qty=0 with blank MPN, or description/designator contains DNI/DNP/DNL/"DO NOT INSTALL"/"DO NOT PLACE"/"DO NOT POPULATE")
4. **No Title Row** — Row 1 = headers, Row 2 = data. No banner/title above headers
5. **Log Sheet** — Every CP IP BOM has a second "Log" sheet tracking what happened to each row
6. **Designator-Only PCB Detection** — PCB detection uses designator pattern only. Descriptions like "PCB VOIP MEZZANINE" on regular components caused false matches in the past
7. **MPN Merge** — Same MPN across multiple rows → merge: sum quantities, combine designators (natural-sorted), keep first row's other fields
8. **Auto-PCB from Gerber** — If no PCB row in BOM, search for Gerber files (same dir → parent → grandparent → sibling dirs). Extract PCB name from folder/file name
9. **Sort** — Quantity descending, then first designator ascending (natural sort: C1 < C2 < C10). PCB always pinned at top

Additional filters:
- **Section Header Filter** — Designators with spaces but no digits (e.g., "M CODES SUMMARY") are section headers, not components
- **CPC Fallback** — When no CPC column exists or value is blank, use MPN as CPC
- **Not Mounted Filter** — If "Mounted" column exists (Exonetik), exclude rows with "N.M." / "NOT MOUNTED" / "NOT PLACE"

Output format: Quantity | Reference Designator | CPC | Description | MPN | Manufacturer

---

## PART 5: CUSTOMER CONFIGURATIONS

Each customer has different BOM formats. The system must handle 31+ configurations. Key examples:

| Customer | Quirk |
|----------|-------|
| Lanka | No header row. Fixed column order. "M CODES SUMMARY" section headers. Own top-level folder structure |
| ISC (2100-0185-3) | No quantity column — must count designators |
| ISC (2100-0142-3/4-P) | Non-standard column order — must force column mapping |
| Infinition | Nested folder structure. Gerbers in sibling PANEL folder. Excel files break openpyxl — need raw XML parsing |
| Legend Power (ASY-0116) | Header at row 12 |
| Resonetics | Header at row 13 |
| Mircom | Header at row 2 |
| Signel | French-language BOM. Header at row 7. Columns: Qte, Position sur circuit, # Manufacturier |
| RTINGS | CSV files, UTF-16 encoded, tab-separated |
| Exonetik | Has "Mounted" column — must filter N.M. rows |

The web app must support adding new customer configurations without code changes.

---

## PART 6: M-CODE CLASSIFICATION

43 rules classify components into M-codes. The M-code determines:
- **Extras percentage** — How many extra parts to order beyond BOM quantity (through-hole parts have higher fallout than SMT chips)
- **Placement category** — How the SMT machine handles it
- **Pricing tier** — Affects labour calculation

M-codes are assigned automatically by rules, but MUST have a human override step. The rules cannot cover every edge case. Piyush knows when a "0805 resistor" that the rules classify as standard SMT is actually a high-power part that needs hand soldering.

---

## PART 7: KEY FILES AND THEIR ROLES

| File | Role | Users |
|------|------|-------|
| DM Common File V11 | Master pricing engine. DataInputSheets registry. Per-GMP sheets. MasterSheet with 11-button sequence. API integrations | Piyush |
| Job Queue V8 | Order tracking. PO management. Proc batch code generation. Ships to Production Schedule. Invoice generation | Piyush, Anas |
| Production Schedule V3 | Weekly production planning. Shows what's coming, what's ready, what's shipping. Refresh Qty heartbeat | Hammad, Anas |
| PROC Template V25 | Per-batch procurement. API pricing on order quantities. PO generation. Reception file creation. Label printing | Piyush |
| TIME V11 | Labour costing. SMT rates per quantity tier. PDF quotation generation (Reset → Fill → Print) | Piyush |
| SHIPDOC V8 | Packing slips and certificates of compliance | Piyush |
| RS Invoice Template V3 | Invoice generation with PDF export | Piyush, Anas |
| BG Stock History | Background feeder stock tracking | Piyush |
| PROC Verification V3 | Part validation and QC verification | Piyush |
| PROC LOG | Centralized procurement tracking across all jobs | Piyush |
| PO Template V2 | Purchase order generation to suppliers | Piyush |

---

## PART 8: NON-NEGOTIABLE REQUIREMENTS

1. **Every stage transition requires explicit human action.** No auto-advancing. No "we'll just sync it in the background."

2. **Every data transformation must be visible.** When M-codes are assigned, the user sees them. When extras are calculated, the user sees the numbers. When API pricing comes back, the user sees the results before they're committed.

3. **The merge-split pattern must be a first-class concept** in the data model, not an afterthought. "Quote Batch" and "Proc Batch" are real entities that group boards temporarily for shared operations, then release them.

4. **Proc batch codes are human-readable, format-encoded identifiers** — not UUIDs. The format YYMMDD CUSTOMER-TYPE### must be preserved because humans read these on physical folder labels.

5. **The 4 quantity tiers flow through the entire system** — from DataInputSheets activation through TIME file through final PDF quotation. They are not just a pricing table at the end.

6. **API calls are expensive and intentional.** DigiKey and Mouser APIs have rate limits and cost implications. The system must never make speculative API calls. Every call must be triggered by a human who has verified the input data.

7. **BG stock deduction happens at proc file generation, not at order placement.** This is a deliberate business decision about when inventory is committed.

8. **The reception file generation triggers 4 outputs and a status update.** This is a critical workflow moment — don't break it into 5 separate actions.

9. **Customer BOM configurations must be extensible without code changes.** We add 3-5 new customers per year. Each has different column names, header row positions, encoding, and folder structures.

10. **The web app must work for Piyush in India and Anas in Montreal simultaneously** — this is the #1 reason we're leaving Excel. Real-time collaboration without file locking or OneDrive corruption.

---

## PART 9: WHAT SUCCESS LOOKS LIKE

The web app is successful when:

- Piyush can process a quote in 30 minutes instead of 3 hours
- Anas can check order status from his phone without calling Piyush
- Hammad can see his production queue without asking anyone
- A new customer's BOM format can be configured in the UI, not in code
- Two people can work on different quotes simultaneously without file conflicts
- No data is ever lost to a corrupt Excel file or OneDrive sync failure
- The system is honest about what it has automated and where it still needs human judgment

The web app is a FAILURE when:
- It hides complexity that the user needs to see
- It "optimizes" away human checkpoints that exist for quality control
- It treats the merge-split workflow as two independent single-board workflows
- It makes API calls without human authorization
- It presents data in a way that makes sense to a developer but not to Piyush

---

## PART 10: TECHNOLOGY CONTEXT

**Current stack being built:**
- Supabase (PostgreSQL + Auth + Edge Functions)
- Next.js front-end
- MCP server with 20 tools across 9 domains
- DigiKey + Mouser API integrations
- M-code classification engine (43 rules in TypeScript)
- BOM parser implementing all 9 CP IP rules

**Source VBA code is available** in the `All vba codes/` folder organized by workbook. Every macro described in this document has a corresponding `.bas` file. When in doubt about business logic, read the VBA — it is the source of truth.

---

*This document was written by understanding the business first and the technology second. Any developer who reads this should be able to feel what it's like to sit in front of 7 Excel files, clicking 15 buttons in sequence, waiting for APIs, and managing a production floor — before they write their first line of code.*
