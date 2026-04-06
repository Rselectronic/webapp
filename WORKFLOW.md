# RS PCB Assembly — Complete Workflow Guide

> **For:** Anas (CEO), Piyush (Operations Manager), Hammad (Shop Floor)
> **System:** Web App at [localhost:3000](http://localhost:3000) or your Vercel deployment URL

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Quotation Process](#2-quotation-process-bom--quote--pdf)
3. [Order Entry](#3-order-entry-quote-accepted--job)
4. [Procurement](#4-procurement-job--supplier-pos)
5. [Production](#5-production-assembly--tracking)
6. [Shipping](#6-shipping-packing--compliance)
7. [Invoicing](#7-invoicing--payment)
8. [Quality Control (NCR)](#8-quality-control-ncr)
9. [Inventory (BG Stock)](#9-inventory-bg-feeder-stock)
10. [AI Assistant](#10-ai-assistant)
11. [Settings](#11-settings--configuration)
12. [User Roles](#12-user-roles--permissions)

---

## 1. Quick Start

### Login
- Go to `/login`
- Enter your email and password
- Three accounts exist:
  - `apatel@rspcbassembly.com` — CEO (full access)
  - `piyush@rspcbassembly.com` — Operations Manager (no financials)
  - `hammad@rspcbassembly.com` — Shop Floor (production only)

### Dashboard (`/`)
After login, the dashboard shows:
- **8 KPI cards**: Active Customers, Open Quotes, Active Jobs, Outstanding Invoices, Quotes This Month, Jobs in Production, Avg Quote Value, Overdue Invoices
- **Recent Activity feed**: latest quotes, jobs, invoices created

### Navigation
The sidebar has 13 sections:
| Page | URL | What It Does |
|------|-----|-------------|
| Dashboard | `/` | KPIs and activity feed |
| Customers | `/customers` | Customer list, detail pages |
| BOMs | `/bom` | Uploaded BOMs, parsing status |
| Quotes | `/quotes` | Quote list, create new quotes |
| Jobs | `/jobs` | Job tracking (Kanban + Table view) |
| Procurement | `/procurement` | Supplier POs, receiving |
| Production | `/production` | Shop floor event tracking |
| Invoices | `/invoices` | Invoice list, aging report |
| Quality | `/quality` | NCR (Non-Conformance Reports) |
| Inventory | `/inventory` | BG feeder stock dashboard |
| Reports | `/reports` | Revenue and activity reports |
| Settings | `/settings` | Pricing, M-Code rules, BOM configs |

---

## 2. Quotation Process (BOM → Quote → PDF)

This is the most common workflow. A customer sends you a BOM, you price it, and send a quote.

### Step 1: Upload the BOM

1. Go to **`/bom/upload`**
2. Select the **Customer** from the dropdown (e.g., TLAN — Lanka)
3. Enter the **GMP name** (board part number, e.g., "TL265-5040-000-T")
4. **Drag and drop** or click to upload the customer's BOM file (`.xlsx` or `.csv`)
5. Click **Upload & Parse**

The system will:
- Auto-detect column headers (Qty, Designator, MPN, Manufacturer, Description)
- Parse all component lines
- Filter out fiducials, DNI components, section headers
- Merge duplicate MPNs and sum quantities

### Step 2: Review & Classify M-Codes

1. After upload, you're redirected to **`/bom/[id]`**
2. You'll see stats: Components, Classified, Need Review, Merged Lines
3. Click the **"AI Classify (N unclassified)"** button
   - This sends all unclassified components to the AI classifier
   - It assigns M-Codes: CP, IP, TH, CPEXP, 0402, 0201, MANSMT, MEC, Accs, CABLE, DEV
   - Results appear inline with confidence percentages
4. For any remaining unclassified components, click **"Assign"** next to each one to manually set the M-Code
5. The M-Code determines assembly cost:
   - **CP** = Standard SMT pick-and-place (~59% of components)
   - **IP** = Large SMT, tray/tube feeders (~15%)
   - **TH** = Through-hole, manual insertion (~12%)
   - **0402/0201** = Tiny passives, specialized feeders
   - **MANSMT** = Hand-soldered
   - **MEC** = Mechanical (standoffs, heatsinks)

### Step 3: Create the Quote

1. Go to **`/quotes/new`**
2. Select the **Customer**
3. Select the **Parsed BOM** from the dropdown
4. Enter **4 quantity tiers** (e.g., 50, 100, 250, 500)
5. Enter:
   - **PCB Unit Price** ($) — from your PCB fabricator quote
   - **NRE Charge** ($) — stencil + setup + programming (default $350)
   - **Shipping** ($) — flat rate (default $200)
6. Click **"Calculate Pricing"**
7. Review the pricing table showing per-tier breakdown:
   - Component Cost (sum of all parts × markup)
   - PCB Cost
   - Assembly Cost (based on M-Code placements × rate)
   - NRE
   - Shipping
   - **Total** and **Per Unit** price
8. Click **"Save Quote"** — generates quote number (e.g., QT-2604-001)

### Step 4: Review & Send

1. Go to **`/quotes/[id]`** (the quote detail page)
2. Review all details
3. Use the status buttons: **Draft → Review → Sent**
4. Click **"Generate PDF"** to create a professional quote document
5. Download the PDF and email it to the customer

---

## 3. Order Entry (Quote Accepted → Job)

When a customer accepts a quote and sends a Purchase Order:

### Step 1: Accept the Quote

1. Go to **`/quotes/[id]`**
2. Click **"Accept"** — this marks the quote as accepted

### Step 2: Create the Job

1. Click **"Create Job"** on the quote detail page
2. The system auto-generates:
   - **Job number**: `JB-YYMM-CUST-NNN` (e.g., JB-2604-CVNS-001)
   - Links to the quote, customer, GMP, and BOM

### Step 3: Verify PO Pricing

1. Go to **`/jobs/[id]`** (the job detail page)
2. Scroll to **"PO Pricing Validation"** section
3. Enter the **PO Price** from the customer's purchase order
4. The system compares it to the quote price:
   - **Match** (green) = PO price matches quote (within 1%)
   - **Mismatch** (red) = PO price differs — investigate before proceeding
   - **Pending** = PO price not entered yet

### Step 4: Generate Proc Batch Code

The system auto-generates a Proc Batch Code when procurement starts:
- Format: `YYMMDD CUST-XYNNN`
- Example: `260406 CVNS-BT001`
- X = B (Batch) or S (Single board)
- Y = T (Turnkey), A (Assembly), C (Consignment), P (PCB Only)

---

## 4. Procurement (Job → Supplier POs)

### Step 1: Create Procurement

1. On the job detail page, click **"Start Procurement"**
2. The system creates a PROC record with:
   - All BOM component lines
   - Quantities = (qty per board × board qty) + overage per M-Code
   - Auto-generated Proc Batch Code

### Step 2: Review & Order

1. Go to **`/procurement/[id]`**
2. Review component lines: MPN, quantity needed, supplier, price
3. Generate **Supplier POs** grouped by distributor (DigiKey, Mouser, LCSC)
4. Download PO PDFs and send to suppliers

### Step 3: Receive Materials

1. As materials arrive, mark lines as **"Received"**
2. Track partial deliveries
3. When all materials received, update job status to **"parts_received"**

---

## 5. Production (Assembly → Tracking)

### Step 1: Generate Production Documents

On the job detail page, scroll to **"Production Documents"** and download:

| Document | What It Is | Who Uses It |
|----------|-----------|-------------|
| **Job Card** | Job summary: customer, GMP, quantity, assembly type | Production manager |
| **Production Traveller** | Step-by-step checklist with sign-off lines | Follows the boards through each step |
| **Print Copy BOM** | Full component list for the assembly floor | Operators |
| **Reception File** | Incoming material checklist with expected quantities | Receiving team |

### Step 2: Log Production Events

1. Go to **`/production/log`**
2. Select the job
3. Click event buttons in order as work progresses:

```
Materials Received → Setup Started → SMT Top Start → SMT Top End →
SMT Bottom Start → SMT Bottom End → Reflow Start → Reflow End →
AOI Start → AOI Passed/Failed → Through-Hole Start → Through-Hole End →
Touchup → Washing → Packing → Ready to Ship
```

The CEO can see all events in real-time on the **`/production`** dashboard.

### Step 3: Generate Serial Numbers

1. On the job detail page, find the **Serial Numbers** section
2. Click **"Generate Serials"**
3. System creates one serial per board: `JB-2604-CVNS-001-001` through `JB-2604-CVNS-001-100`

---

## 6. Shipping (Packing → Compliance)

### Step 1: Generate Shipping Documents

On the job detail page, scroll to the **Shipping** section:

1. Enter **Ship Date**, **Courier Name**, **Tracking Number**
2. Click **"Save"**
3. Click **"Packing Slip"** — generates PDF with:
   - Ship-to address
   - Item list with GMP name and quantity
   - Proc Batch Code
   - Signature lines
4. Click **"Compliance Certificates"** — generates 2-page PDF:
   - **Page 1**: Lead-Free / RoHS Compliance Certificate (EU Directive 2011/65/EU)
   - **Page 2**: IPC Quality Compliance Certificate (IPC-A-610, IPC J-STD-001)

### Step 2: Ship & Update Status

1. Print packing slip and compliance certs, include with shipment
2. Update job status: **Shipping → Delivered**

---

## 7. Invoicing & Payment

### Step 1: Create Invoice

**Option A: Single Job Invoice**
1. Go to **`/invoices`**
2. Click **"Create Invoice"**
3. Select customer
4. Check the job(s) to invoice
5. Click **"Create Invoice"**

**Option B: Multi-PO Consolidation**
- Select **multiple jobs** from the same customer
- One invoice covers all selected jobs
- Each job appears as a line item

### Step 2: Review & Send

1. Go to **`/invoices/[id]`**
2. Review line items, taxes (GST 5% + QST 9.975%), totals
3. Click **"Generate PDF"** — creates professional invoice
4. Email to customer
5. Update status: **Draft → Sent**

### Step 3: Track Payment

1. When payment received, click **"Mark Paid"**
2. Enter payment date and method
3. Status updates to **Paid**

### Aging Report

The invoices page shows an aging report:
- **Current**: not yet due
- **30+ Days**: past due over 30 days
- **60+ Days**: past due over 60 days

---

## 8. Quality Control (NCR)

When a customer reports a quality issue:

### Step 1: Create NCR

1. Go to the affected **job detail page**
2. Click **"Report NCR"** in the header
3. Fill in:
   - **Category**: Soldering Defect, Component, PCB, Assembly, Cosmetic, Other
   - **Subcategory**: Cold Joint, Bridge, Wrong Part, Missing Part, etc.
   - **Severity**: Minor / Major / Critical
   - **Description**: Detailed description of the issue

### Step 2: Investigate & Resolve

1. Go to **`/quality`** to see all NCRs
2. Click on an NCR to see its detail page
3. Move through status workflow:
   - **Open** → **Investigating** → **Corrective Action** → **Closed**
4. Fill in the CAAF form:
   - **Root Cause**: Why did this happen?
   - **Corrective Action**: How to fix this specific issue
   - **Preventive Action**: How to prevent recurrence

---

## 9. Inventory (BG Feeder Stock)

BG (Background) parts are common passives permanently loaded on SMT feeders.

### View Stock

1. Go to **`/inventory`**
2. Dashboard shows: Total Items, Healthy, Low Stock, Out of Stock
3. Table shows all BG parts with:
   - MPN, Description, M-Code, Feeder Slot
   - Current Qty vs. Min Qty
   - Status: **OK** (green) / **Low** (yellow) / **Out** (red)

### Stock Updates

- **Auto-subtract**: When a PROC is generated, BG parts are subtracted
- **Auto-add**: When BG parts are purchased in procurement, stock is added
- **Manual adjust**: Use the API to add/subtract stock

---

## 10. AI Assistant

The floating chat button (bottom-right corner) opens the **RS Assistant**.

### What It Can Do

**Query Data:**
- "Show me all customers"
- "Business overview"
- "List all jobs in production"
- "Show invoices for TLAN"
- "Check BG stock levels"

**Take Actions:**
- "Classify all unclassified components for job JB-2604-CVNS-001"
- "Update job JB-2604-CVNS-001 status to production"
- "Generate serial numbers for job JB-2604-CVNS-001"
- "Log a materials_received event for JB-2604-CVNS-001"
- "Create procurement for job JB-2604-CVNS-001"

**Get Guidance:**
- "How do I create a quote?"
- "How do I report a quality issue?"
- "How do I handle procurement?"
- "Walk me through the shipping process"

### Available Tools (20 total)

| Tool | Type | Description |
|------|------|-------------|
| listCustomers | Query | All active customers |
| getCustomer | Query | Customer detail + history |
| businessOverview | Query | KPI snapshot |
| listQuotes | Query | Quote list by status |
| listJobs | Query | Job list by status |
| listInvoices | Query | Invoice list with aging |
| listNCRs | Query | NCR reports by status |
| getBGStock | Query | Feeder stock levels |
| getJobDetail | Query | Full job + BOM + procurement + events |
| getBomLines | Query | BOM components with M-Code status |
| getJobSerials | Query | Serial numbers for a job |
| searchAll | Query | Cross-table search |
| classifyComponent | Action | Classify one component via AI |
| classifyBomBatch | Action | Auto-classify all unclassified in a BOM |
| classifyBomLine | Action | Manually assign M-Code |
| updateJobStatus | Action | Move job through workflow |
| createProcurement | Action | Create PROC for a job |
| generateSerials | Action | Generate per-board serial numbers |
| logProductionEvent | Action | Log shop floor events |
| getWorkflowGuide | Guide | Step-by-step process instructions |

---

## 11. Settings & Configuration

### Pricing Settings (`/settings/pricing`)
- Component markup (default 20%)
- PCB markup (default 30%)
- SMT cost per placement ($0.35)
- TH cost per placement ($0.75)
- Default NRE ($350)
- Labour rate, SMT rate

### M-Code Rules (`/settings/m-codes`)
- View all 47 PAR classification rules
- Rules run in priority order across 3 layers:
  1. **Database lookup** (known components)
  2. **Rule engine** (47 PAR rules matching mounting type, package, size)
  3. **API lookup** (DigiKey/Mouser for unknown parts)

### Customer BOM Configs (`/settings/customers`)
- Per-customer column mappings
- Header row settings
- Encoding (UTF-8, UTF-16)
- Special filters (DNI, mount filter columns)

### Audit Log (`/settings/audit`)
- Chronological log of all data changes
- CEO only

---

## 12. User Roles & Permissions

| Feature | CEO | Operations Manager | Shop Floor |
|---------|-----|-------------------|------------|
| Dashboard | Full | Full | Limited |
| Customers | Full CRUD | Read + Create | No access |
| BOMs | Full | Full | No access |
| Quotes | Full | Read | No access |
| Jobs | Full | Full | Read (production/inspection only) |
| Procurement | Full | Full | No access |
| Production | Full | Full | Log events only |
| Invoices | Full | No access | No access |
| Quality (NCR) | Full | Read + Create | No access |
| Inventory | Full | Full | Read only |
| Settings | Full | No access | No access |

---

## Quick Reference: Complete Lifecycle

```
Customer sends BOM
       ↓
[1] Upload BOM (/bom/upload)
       ↓
[2] AI Classify M-Codes (/bom/[id])
       ↓
[3] Create Quote (/quotes/new) → 4 qty tiers → pricing
       ↓
[4] Generate PDF → Email to customer
       ↓
[5] Customer accepts → Create Job (/jobs)
       ↓
[6] Verify PO pricing → Start Procurement
       ↓
[7] Generate Supplier POs → Order components
       ↓
[8] Receive materials → Generate production docs
       ↓
[9] Production: SMT → Reflow → AOI → Through-hole → Touchup → Wash
       ↓
[10] Generate serial numbers → Pack
       ↓
[11] Shipping docs (packing slip + compliance certs)
       ↓
[12] Create Invoice → Email → Track payment
       ↓
[13] Payment received → Archive
```

---

## Company Info

```
R.S. ÉLECTRONIQUE INC.
5580 Vanden Abeele
Saint-Laurent, QC H4S 1P9
Canada

Phone: +1 (438) 833-8477
Email: info@rspcbassembly.com
Web: www.rspcbassembly.com

GST/TPS: 840134829 (5%)
QST/TVQ: 1214617001 (9.975%)
```
