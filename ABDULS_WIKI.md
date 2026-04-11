# Abdul's Wiki — RS PCB Assembly ERP Architecture

> Complete reference for how every piece of code works.
> Last updated: April 11, 2026

---

## 1. DATABASE SCHEMA (27 tables)

### Core Business Tables

| Table | Purpose | Key Columns | Foreign Keys |
|-------|---------|-------------|--------------|
| **users** | Extends Supabase auth with roles | email, full_name, role (ceo/operations_manager/shop_floor) | auth.users(id) |
| **customers** | Company profiles + BOM config | code (unique), company_name, bom_config (JSONB), contacts (JSONB), billing_addresses, shipping_addresses | created_by → users |
| **gmps** | Board/product definitions | gmp_number (unique per customer), board_name, revision | customer_id → customers |
| **boms** | Uploaded BOM files | file_name, file_path, status (uploaded/parsing/parsed/error), parse_result (JSONB), component_count | gmp_id → gmps, customer_id → customers |
| **bom_lines** | Parsed component rows | line_number, quantity, reference_designator, cpc, description, mpn, manufacturer, is_pcb, is_dni, m_code, m_code_confidence, m_code_source, m_code_reasoning | bom_id → boms |
| **components** | Master component library (4,026 MPNs) | mpn (unique with manufacturer), m_code, m_code_source, description, package_case, mounting_type, digikey_pn, mouser_pn, lcsc_pn | None |
| **mcode_keyword_lookup** | 230 keyword→M-code mappings | keyword, assigned_m_code, match_field (cpc/description/package_case/any), match_type (exact/contains/word_boundary), priority | None |
| **m_code_rules** | 48 PAR classification rules | rule_id, priority, layer, field_1, operator_1, value_1, field_2, operator_2, value_2, assigned_m_code | None |
| **overage_table** | Extra components per M-code per qty tier | m_code, qty_threshold, extras | None |
| **api_pricing_cache** | DigiKey/Mouser/LCSC cached prices (7-day TTL) | source, mpn, search_key, response (JSONB), unit_price, stock_qty, expires_at | None |
| **app_settings** | Pricing defaults, rates, currency | key, value (JSONB) | None |

### Quote Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| **quotes** | Pricing quotes | quote_number (unique), customer_id, gmp_id, bom_id, status (draft/review/sent/accepted/rejected/expired), quantities (JSONB), pricing (JSONB with tiers[]), component_markup, pcb_cost_per_unit, nre_charge |
| **quote_batches** | Merge-split batch quoting | batch_name, customer_id, status (created→merged→mcodes_assigned→extras_calculated→priced→sent_back), qty_1-4, markup rates |
| **quote_batch_boms** | Which BOMs in a batch | batch_id, bom_id, gmp_id, board_letter (A/B/C) |
| **quote_batch_lines** | Merged/deduplicated components | batch_id, mpn, bom_qty, board_refs, m_code, m_code_override, m_code_final, extras, order_qty_1-4, unit_price_1-4, extended_price_1-4, supplier |
| **quote_batch_log** | Immutable audit trail | batch_id, action, old_status, new_status, details (JSONB) |

### Order & Production Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| **jobs** | Production orders | job_number (unique), quote_id, customer_id, gmp_id, bom_id, po_number, status (created→procurement→parts_ordered→production→shipping→delivered→invoiced), quantity, assembly_type (TB/TS/CS/CB/AS) |
| **job_status_log** | Immutable job status history | job_id, old_status, new_status, changed_by, notes |
| **procurements** | Supplier ordering coordination | proc_code (unique), job_id, status (draft→ordering→partial_received→fully_received→completed), total_lines, lines_ordered, lines_received |
| **procurement_lines** | Individual component orders | procurement_id, mpn, qty_needed, qty_extra (overage), qty_ordered, qty_received, supplier, unit_price, order_status (pending/ordered/received/backordered), is_bg |
| **supplier_pos** | Purchase orders to suppliers | po_number (unique), procurement_id, supplier_name, lines (JSONB), total_amount, status (draft→sent→received→closed) |
| **production_events** | Shop floor event log | job_id, event_type (smt_top_start/reflow_end/aoi_passed/etc), operator_id, notes |
| **invoices** | Financial documents (CEO only) | invoice_number, job_id, customer_id, subtotal, tps_gst (5%), tvq_qst (9.975%), freight, total, status (draft/sent/paid/overdue) |
| **shipments** | Carrier tracking | job_id, carrier, tracking_number, status |
| **serial_numbers** | Per-board serial tracking | job_id, serial_number |

### Quality & Inventory Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| **ncr_reports** | Non-conformance reports | ncr_number, job_id, category, severity (minor/major/critical), status (open→investigating→corrective_action→closed), root_cause, corrective_action |
| **bg_stock** | Background feeder inventory | mpn, current_qty, min_qty, feeder_slot |
| **bg_stock_log** | Inventory audit trail | bg_stock_id, change_type (addition/subtraction/adjustment), quantity_change, quantity_after |
| **audit_log** | All data change tracking | user_id, table_name, record_id, action (insert/update/delete), old_values, new_values |

### Chat Tables

| Table | Purpose |
|-------|---------|
| **chat_conversations** | AI chat sessions per user |
| **chat_messages** | Messages in conversations (user/assistant/system) |
| **chat_attachments** | Uploaded files in chat |
| **email_templates** | Reusable email templates |

---

## 2. API ROUTES (58 endpoints)

### BOM Management
| Method | Path | What It Does |
|--------|------|-------------|
| POST | `/api/bom/parse` | Upload + parse raw BOM file (9 CP IP rules) |
| POST | `/api/bom/[id]/classify` | Run M-code classification (rules or AI batch) |
| GET | `/api/bom/[id]/export` | Download BOM as Excel with M-codes |
| GET | `/api/boms` | List BOMs (filter by customer) |

### Quotes
| Method | Path | What It Does |
|--------|------|-------------|
| GET/POST | `/api/quotes` | List quotes; create from BOM |
| GET/PATCH | `/api/quotes/[id]` | Get/update quote |
| GET | `/api/quotes/[id]/pdf` | Generate quote PDF (pdf-lib) |
| POST | `/api/quotes/preview` | Calculate pricing without saving (calls DigiKey/Mouser/LCSC) |

### Quote Batches (Merge-Split)
| Method | Path | What It Does |
|--------|------|-------------|
| GET/POST | `/api/quote-batches` | List/create batches |
| POST | `/api/quote-batches/[id]/merge` | Deduplicate components across BOMs |
| POST | `/api/quote-batches/[id]/assign-mcodes` | Classify merged components |
| PATCH | `/api/quote-batches/[id]/lines/[lineId]` | Manual M-code override (saves to components DB) |
| POST | `/api/quote-batches/[id]/calculate-extras` | Apply overage per M-code |
| POST | `/api/quote-batches/[id]/run-pricing` | Query 3 supplier APIs in parallel |
| POST | `/api/quote-batches/[id]/send-back` | Split pricing back to individual quotes |

### Jobs & Procurement
| Method | Path | What It Does |
|--------|------|-------------|
| GET/POST | `/api/jobs` | List/create jobs from accepted quotes |
| GET/PATCH | `/api/jobs/[id]` | Get/update job status |
| GET | `/api/jobs/[id]/production-docs` | Generate job card/traveller/print BOM/reception PDF |
| GET | `/api/jobs/[id]/shipping-docs` | Generate packing slip/compliance cert PDF |
| GET/POST | `/api/procurements` | List/create procurement from job |
| GET/PATCH | `/api/procurements/[id]` | Get/update procurement (4 actions: order_line, order_all, receive_line, update_status) |
| GET/POST | `/api/supplier-pos` | List/create supplier POs |
| GET | `/api/supplier-pos/[id]/pdf` | Generate supplier PO PDF |

### Pricing, Components, Inventory
| Method | Path | What It Does |
|--------|------|-------------|
| GET | `/api/pricing/[mpn]` | Look up price from DigiKey+Mouser+LCSC (cached 7 days) |
| GET/POST | `/api/components` | List/add components to master library |
| PATCH/DELETE | `/api/components/[id]` | Edit/delete component M-code |
| GET/POST | `/api/bg-stock` | List/add BG feeder stock |
| POST | `/api/bg-stock/[id]/adjust` | Adjust stock quantity |

### Other
| Method | Path | What It Does |
|--------|------|-------------|
| GET/POST | `/api/invoices` | List/create invoices |
| GET | `/api/invoices/[id]/pdf` | Generate invoice PDF |
| GET/POST | `/api/production` | List/log production events |
| GET/POST | `/api/ncr` | List/create NCR reports |
| GET/POST | `/api/customers` | List/create customers |
| PATCH | `/api/customers/[id]` | Update customer (CEO only) |
| GET/PATCH | `/api/settings` | Get/update app settings |
| GET | `/api/search` | Global search across all entities |
| GET | `/api/export` | Export data as CSV |
| POST | `/api/chat` | AI chatbot (Claude with 22 tools) |

---

## 3. PAGES (35 routes)

| URL | What User Sees |
|-----|---------------|
| `/` | Dashboard — KPI cards, active workflows, recent activity |
| `/bom` | BOM list (file, customer, GMP, status, component count) |
| `/bom/upload` | Upload form — select customer, GMP, drag-drop file |
| `/bom/[id]` | Parsed BOM detail — component table with M-codes, reasoning, confidence, export button |
| `/quotes` | Quote list with status badges, filter by status |
| `/quotes/new` | Create quote — select BOM, set 4 qty tiers, calculate pricing |
| `/quotes/[id]` | Quote detail — pricing breakdown, missing-price list, PDF download |
| `/quotes/batches` | Quote batch list |
| `/quotes/batches/new` | Create batch — select customer + BOMs |
| `/quotes/batches/[id]` | Batch workflow — 6-step merge-split pipeline |
| `/jobs` | Job list with kanban/table view |
| `/jobs/[id]` | Job detail — BOM, quote, procurement, production events, profitability |
| `/procurement` | Procurement list with status |
| `/procurement/[id]` | Procurement detail — line items, order/receive buttons, supplier POs |
| `/procurement/stencils` | Fabrication order tracking |
| `/production` | Production dashboard |
| `/production/log` | Shop floor event logger |
| `/shipping` | Shipment tracker |
| `/invoices` | Invoice list with aging |
| `/invoices/[id]` | Invoice detail with tax calc |
| `/invoices/payments` | Payment tracking |
| `/quality` | NCR report list |
| `/quality/[id]` | NCR detail — root cause, corrective action |
| `/inventory` | BG feeder stock dashboard |
| `/customers` | Customer list |
| `/customers/[id]` | Customer detail — contacts, addresses, boards/GMPs, BOM config, order history, edit form |
| `/reports` | Analytics dashboard |
| `/settings` | Settings hub |
| `/settings/pricing` | Markup rates, labour rates, NRE defaults |
| `/settings/m-codes` | M-code rules editor |
| `/settings/components` | Component database (4,026 MPNs) |
| `/settings/customers` | Customer BOM config editor |
| `/settings/email-templates` | Email template CRUD |
| `/settings/audit` | Audit log viewer |
| `/login` | Login page |

---

## 4. KEY LIBRARIES

### lib/mcode/ — M-Code Classification Pipeline

**classifier.ts** — Main 4-layer pipeline:
1. DB lookup → `components` table by MPN (95% confidence)
2. Keyword lookup → `mcode_keyword_lookup` table, 230 terms (90% confidence)
3. PAR rules → `CORE_PAR_RULES` array, 48 rules sorted by priority (85% confidence)
4. Claude AI → calls Anthropic API with MPN+description (80%+ confidence)

**rules.ts** — 48 PAR rules checking: mounting_type, package_case, description, category, dimensions. Rules use operators: equals, contains, regex, in.

**ai-classifier.ts** — Claude API call for unclassified components. Returns m_code + reasoning + confidence.

### lib/pricing/ — Pricing Engine

**engine.ts** — `calculateQuote(input)`:
```
Component Cost = Σ(unit_price × order_qty × (1 + markup%))
PCB Cost = pcb_unit_price × board_qty × (1 + pcb_markup%)
Assembly Cost = (SMT_placements × $0.35 + TH_placements × $0.75 + MANSMT × mansmt_rate) × board_qty
Total = Components + PCB + Assembly + NRE + Shipping
Per Unit = Total / board_qty
```

SMT_MCODES: CP, CPEXP, 0402, 0201, IP
TH_MCODES: TH
MANSMT_MCODES: MANSMT
Non-placement: MEC, Accs, CABLE, DEV B (don't count for assembly cost)

**overage.ts** — `getOrderQty()`: looks up extras from overage_table by M-code and quantity tier.

**digikey.ts / mouser.ts / lcsc.ts** — Supplier API clients. OAuth2 for DigiKey, API key for Mouser, signed requests for LCSC. All return: mpn, unit_price, currency, in_stock, supplier_pn.

### lib/bom/ — BOM Parser

**parser.ts** — `parseBom()` applies 9 CP IP rules:
1. Fiducial exclusion (skip FID rows)
2. PCB at top (pin PCB row, designator-only detection)
3. DNI exclusion (qty=0+blank MPN, or DNI/DNP keywords)
4. No title row
5. Log sheet (every row's fate tracked)
6. Designator-only PCB detection
7. MPN merge (same MPN → combine qty, merge designators)
8. Auto-PCB from filename
9. Sort (qty DESC, designator ASC, PCB pinned top)

**column-mapper.ts** — `resolveColumnMapping()`: auto-detects columns from headers using exact match → contains match → fallback guessing. Handles 30+ column name variants. Supports customer BOM configs with fixed columns, forced columns, header row offsets.

### lib/pdf/ — PDF Generation

**helpers.ts** — Shared pdf-lib utilities for headers, footers, tables. All 9 PDF types use pdf-lib (pure JS, no native deps).

---

## 5. KEY FLOWS

### BOM Upload → Parse → Classify
```
Upload file → /api/bom/parse
  → Detect format (Excel/CSV) + encoding
  → Resolve column mapping (customer.bom_config)
  → Apply 9 CP IP rules
  → Save bom_lines to DB
  → Status: parsed

Click Classify → /api/bom/[id]/classify
  → Layer 1: DB lookup (4,026 components)
  → Layer 1b: Keyword lookup (230 terms)
  → Layer 2: PAR rules (48 rules)
  → Layer 3: Claude AI (if still unclassified)
  → Update bom_lines with m_code + reasoning

Manual override → saves to components table (learning loop)
```

### Quote Creation (Single)
```
/quotes/new → Select BOM + quantities
  → POST /api/quotes/preview
    → Fetch bom_lines with M-codes
    → Check pricing cache → call DigiKey/Mouser/LCSC for uncached
    → Description fallback if MPN search fails
    → Apply overages per M-code
    → Calculate 4 tiers: components + PCB + assembly + NRE + shipping
    → Return pricing breakdown + missing-price list
  → Save as draft quote
  → Generate PDF → download
```

### Quote Batch (Merge-Split)
```
Create batch → select multiple BOMs
  → Merge: deduplicate by MPN across all boards
  → Assign M-codes: classify merged list
  → Human checkpoint: override wrong M-codes
  → Calculate extras: overage per M-code
  → Human checkpoint: verify quantities
  → Run pricing: DigiKey/Mouser/LCSC in parallel
  → Human checkpoint: verify prices
  → Send back: split to individual board quotes
```

### Job → Procurement → Receive
```
Accept quote → create job (JB-YYMM-CUST-NNN)
  → Create procurement from job
    → Pull BOM lines + calculate overage
    → Auto-allocate best-price suppliers from cache
    → Auto-deduct BG stock
  → Mark lines as ordered (single or bulk)
  → Create supplier POs (grouped by supplier)
  → Receive materials (update qty_received per line)
  → Procurement auto-completes when all received
```

---

## 6. ENVIRONMENT

### Required Env Vars
```
NEXT_PUBLIC_SUPABASE_URL=https://dypkautohnduuttaujzp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
ANTHROPIC_API_KEY=<Claude API key>
DIGIKEY_CLIENT_ID=<DigiKey OAuth2 client>
DIGIKEY_CLIENT_SECRET=<DigiKey secret>
MOUSER_API_KEY=<Mouser API key>
LCSC_API_KEY=<LCSC key>
LCSC_API_SECRET=<LCSC secret>
```

### Deployment
- **Vercel**: auto-deploy from GitHub main branch
- **Live URL**: https://webapp-fawn-seven.vercel.app
- **Supabase**: project `dypkautohnduuttaujzp` (PostgreSQL 17)

### Auth Roles
| Role | Access |
|------|--------|
| CEO (anas@rspcbassembly.com) | Everything |
| Operations Manager (piyush@rspcbassembly.com) | All except invoices/financials |
| Shop Floor (hammad@rspcbassembly.com) | Production events + active jobs only |

---

## 7. DATA STATS

- **4,026** components in master database
- **230** keyword lookups
- **48** M-code classification rules
- **50** overage tiers
- **11** customers configured
- **27** database tables
- **58** API routes
- **35** pages
- **~30K** lines of TypeScript

---

*This wiki documents the codebase as of April 11, 2026. Read HANDOFF.md for session-by-session change history.*
