# RS PCB Assembly — Full Project Report

> Generated: April 7, 2026 (updated)
> For: Context transfer to Claude Code sessions

---

## 1. PROJECT OVERVIEW

**App:** Custom ERP/Manufacturing Management Web App for RS PCB Assembly (R.S. Electronique Inc.)
**Purpose:** Replace 11 Excel/VBA macro workbooks with a modern web app
**Company:** $2.5M/year contract electronics manufacturer in Montreal, 5-6 people
**CEO:** Anas Patel (apatel@rspcbassembly.com)

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2.2 (App Router, TypeScript) |
| UI | React 19.2.4 + Tailwind CSS 4 + shadcn/ui |
| Database | PostgreSQL 17 via Supabase (project: dypkautohnduuttaujzp) |
| Auth | Supabase Auth (email/password, 3 roles) |
| Storage | Supabase Storage (S3-compatible) |
| AI | Claude Sonnet 4 via Anthropic SDK + Vercel AI SDK v6 |
| PDF | @react-pdf/renderer |
| BOM Parsing | xlsx library |
| Deployment | Vercel (target) |

### Stats
- **28,087 lines of TypeScript**
- **191 source files**
- **93 commits**
- **31 pages**, **48 API routes**, **81 components**
- **28 database tables**, **18 migrations**
- **25 AI chatbot tools**
- **20 MCP server tools**

---

## 2. ENVIRONMENT VARIABLES

```
NEXT_PUBLIC_SUPABASE_URL=https://dypkautohnduuttaujzp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
ANTHROPIC_API_KEY=<claude-api-key>
DIGIKEY_CLIENT_ID=<digikey-client-id>
DIGIKEY_CLIENT_SECRET=<digikey-client-secret>
MOUSER_API_KEY=<mouser-api-key>
LCSC_API_KEY=<lcsc-api-key>
LCSC_API_SECRET=<lcsc-api-secret>
```

---

## 3. DATABASE SCHEMA (28 Tables)

| Table | Purpose |
|-------|---------|
| users | Extends Supabase auth (3 roles: ceo, operations_manager, shop_floor) |
| customers | Customer master data (code, company_name, bom_config JSONB, multi-contact/address) |
| gmps | Global Manufacturing Packages (board definitions per customer) |
| boms | Uploaded BOM files (file path, parsing status) |
| bom_lines | Parsed component lines (MPN, manufacturer, M-Code) |
| components | Master component library (cached from APIs) |
| api_pricing_cache | Price cache from DigiKey/Mouser/LCSC (7-day TTL) |
| m_code_rules | 43 PAR classification rules (Layer 2 engine) |
| overage_table | Material overage per M-Code per quantity tier (absolute extras) |
| quotes | Quote records (N quantity tiers, pricing JSONB) |
| jobs | Production jobs (status lifecycle, assembly type) |
| job_status_log | Immutable audit trail for job status changes |
| procurements | Purchase orders (PROC batch code, line tracking) |
| procurement_lines | Individual PO line items (qty, price, supplier) |
| supplier_pos | Supplier purchase orders with PDFs |
| production_events | Shop floor activity log (17 event types) |
| invoices | Customer invoices (GST 5% + QST 9.975%) |
| audit_log | System-wide change tracking |
| app_settings | Configurable pricing rates (markup, labour, NRE) |
| ncr_reports | Non-Conformance Reports (quality issues) |
| serial_numbers | Per-board serial numbers linked to jobs |
| bg_stock | BG feeder stock levels (common passives) |
| bg_stock_log | Stock transaction history (additions/subtractions) |
| chat_conversations | Persistent AI chat sessions per user |
| chat_messages | Individual chat messages (user + assistant) |
| chat_attachments | File attachments uploaded to chat |
| email_templates | Configurable email templates (quote, invoice, shipping, procurement, general) |
| shipments | Shipment tracking (carrier, tracking number, status lifecycle) |
| fabrication_orders | PCB/stencil fabrication orders from suppliers |
| payments | Payment records linked to invoices (cheque, wire, EFT, credit card) |

---

## 4. API ROUTES (48 endpoints)

### Auth
- `POST /api/auth/callback` — Supabase OAuth callback

### BOM
- `POST /api/bom/parse` — Upload and parse BOM (Excel/CSV)
- `POST /api/bom/[id]/classify` — Classify M-Codes (rule-based or AI batch)
- `GET /api/boms` — List parsed BOMs

### Customers
- `GET /api/customers` — List customers
- `POST /api/customers` — Create customer
- `GET /api/customers/[id]` — Customer detail

### GMPs
- `GET /api/gmps` — List GMPs (filter by customer)

### Quotes
- `GET/POST /api/quotes` — List/create quotes (supports N quantity tiers)
- `POST /api/quotes/preview` — Calculate pricing preview
- `GET/PATCH /api/quotes/[id]` — Get/update quote
- `GET /api/quotes/[id]/pdf` — Generate quote PDF
- `POST /api/quotes/expire` — Auto-expire old quotes

### Jobs
- `GET/POST /api/jobs` — List/create jobs
- `GET/PATCH /api/jobs/[id]` — Get/update job
- `GET /api/jobs/[id]/production-docs` — Generate Job Card/Traveller/BOM/Reception PDFs
- `GET /api/jobs/[id]/shipping-docs` — Generate packing slip/compliance cert PDFs
- `GET/POST /api/jobs/[id]/serials` — Serial number management
- `GET /api/jobs/[id]/profitability` — Quoted vs actual cost analysis

### Procurement
- `GET/POST /api/procurements` — List/create procurement
- `GET/PATCH /api/procurements/[id]` — Get/update procurement
- `GET/POST /api/supplier-pos` — Supplier PO management
- `GET/PATCH /api/supplier-pos/[id]` — Get/update supplier PO
- `GET /api/supplier-pos/[id]/pdf` — Supplier PO PDF

### Invoices & Payments
- `GET/POST /api/invoices` — List/create (supports multi-PO consolidation)
- `GET/PATCH /api/invoices/[id]` — Get/update invoice
- `GET /api/invoices/[id]/pdf` — Generate invoice PDF
- `GET/POST /api/payments` — Payment records (linked to invoices)

### Production & Quality
- `POST /api/production` — Log production events
- `GET/POST /api/ncr` — NCR list/create
- `GET/PATCH /api/ncr/[id]` — NCR detail/update

### Shipping & Fabrication
- `GET/POST /api/shipments` — Shipment tracking (carrier, tracking, status)
- `GET/POST /api/fabrication-orders` — PCB/stencil fabrication orders

### Inventory & Pricing
- `GET/POST /api/bg-stock` — BG feeder stock
- `GET/PATCH /api/bg-stock/[id]` — Get/update stock item
- `POST /api/bg-stock/[id]/adjust` — Stock adjustment
- `GET /api/pricing/[mpn]` — 3-supplier pricing (DigiKey+Mouser+LCSC)

### AI Chat (persistent conversations + file upload)
- `POST /api/chat` — AI chatbot (25 tools, role-gated)
- `GET/POST /api/chat/conversations` — List/create conversations
- `GET/DELETE /api/chat/conversations/[id]` — Get/delete conversation
- `GET/POST /api/chat/conversations/[id]/messages` — Message history
- `POST /api/chat/upload` — File upload for chat attachments

### MCP & Search
- `POST /api/mcp` — MCP endpoint (Model Context Protocol)
- `POST /api/mcp/classify` — AI M-Code classification
- `GET /api/mcp/overview` — Classification stats
- `GET /api/search` — Universal search
- `GET /api/export` — CSV export

### Settings
- `GET/PATCH /api/settings` — App settings
- `GET/POST /api/email-templates` — Email template management

---

## 5. PAGES (31 routes)

| Page | URL | Purpose |
|------|-----|---------|
| Login | `/login` | Email/password auth |
| Dashboard | `/` | 8 KPIs + activity feed + Active Workflows tab |
| Customers | `/customers` | List + search + "New Customer" dialog |
| Customer Detail | `/customers/[id]` | Multi-contact, multi-address, order history |
| BOMs | `/bom` | BOM list |
| BOM Upload | `/bom/upload` | Upload Excel/CSV |
| BOM Detail | `/bom/[id]` | Component table + AI Classify button |
| Quotes | `/quotes` | List with status filters |
| New Quote | `/quotes/new` | BOM select, N tiers (no 4-tier limit), pricing calc |
| Quote Detail | `/quotes/[id]` | Pricing table, PDF, approval |
| Jobs | `/jobs` | Kanban (drag-and-drop) + Table views |
| Job Detail | `/jobs/[id]` | PO validation, shipping, production docs, NCR, serials |
| Procurement | `/procurement` | PO list with status tabs |
| Procurement Detail | `/procurement/[id]` | Line items, receiving |
| Stencils | `/procurement/stencils` | Stencil/fabrication order management |
| Production | `/production` | Real-time dashboard |
| Production Log | `/production/log` | Event logger (shop floor) |
| Invoices | `/invoices` | Aging report + multi-PO create |
| Invoice Detail | `/invoices/[id]` | PDF, payment tracking |
| Payments | `/invoices/payments` | Payment history + recording |
| Shipping | `/shipping` | Shipment tracking dashboard |
| Quality | `/quality` | NCR list with KPIs |
| NCR Detail | `/quality/[id]` | CAAF form, status workflow |
| Inventory | `/inventory` | BG feeder stock dashboard |
| Reports | `/reports` | Revenue + profitability table |
| Settings | `/settings` | Config hub |
| Pricing Settings | `/settings/pricing` | Markup rates |
| M-Code Rules | `/settings/m-codes` | 43 PAR rules |
| Customer BOM Config | `/settings/customers` | Per-customer column mapping |
| Email Templates | `/settings/email-templates` | Template editor (5 categories) |
| Audit Log | `/settings/audit` | Change history |

---

## 6. BUSINESS LOGIC ENGINES (15/15 complete)

| # | Engine | File(s) |
|---|--------|---------|
| 1 | Pricing Engine (N-tier calculation) | `lib/pricing/engine.ts` |
| 2 | M-Code Classifier (43 PAR rules + AI) | `lib/mcode/rules.ts`, `classifier.ts`, `ai-classifier.ts` |
| 3 | BOM Parser (9 rules from cp_ip_v3.py) | `lib/bom/parser.ts`, `column-mapper.ts` |
| 4 | Overage Calculator (absolute extras) | `lib/pricing/overage.ts` |
| 5 | DigiKey API (V4 OAuth) | `lib/pricing/digikey.ts` |
| 6 | Mouser API (keyword search) | `lib/pricing/mouser.ts` |
| 7 | LCSC API (SHA1-signed) | `lib/pricing/lcsc.ts` |
| 8 | Quote Number Generator (QT-YYMM-NNN) | `app/api/quotes/route.ts` |
| 9 | Job Number Generator (JB-YYMM-CUST-NNN) | `app/api/jobs/route.ts` |
| 10 | Invoice Number Generator (INV-YYMM-NNN) | `app/api/invoices/route.ts` |
| 11 | Proc Batch Code (YYMMDD CUST-XYNNN) | `app/api/procurements/route.ts` |
| 12 | Tax Calculator (GST 5% + QST 9.975%) | `app/api/invoices/route.ts` |
| 13 | Customer BOM Config (auto-detect columns) | `lib/bom/column-mapper.ts` |
| 14 | BG Stock Auto-Deduction | `app/api/procurements/route.ts` |
| 15 | Profitability Engine (margin tracking) | `lib/pricing/profitability.ts` |

---

## 7. PDF TEMPLATES (9 documents)

| PDF | Component | API Route |
|-----|-----------|-----------|
| Quote | `components/quotes/quote-pdf.tsx` | `/api/quotes/[id]/pdf` |
| Invoice | `components/invoices/invoice-pdf.tsx` | `/api/invoices/[id]/pdf` |
| Supplier PO | `components/procurement/supplier-po-pdf.tsx` | `/api/supplier-pos/[id]/pdf` |
| Packing Slip | `components/shipping/packing-slip-pdf.tsx` | `/api/jobs/[id]/shipping-docs?type=packing-slip` |
| Compliance Cert | `components/shipping/compliance-certificate-pdf.tsx` | `/api/jobs/[id]/shipping-docs?type=compliance` |
| Job Card | `components/production/job-card-pdf.tsx` | `/api/jobs/[id]/production-docs?type=job-card` |
| Production Traveller | `components/production/traveller-pdf.tsx` | `/api/jobs/[id]/production-docs?type=traveller` |
| Print BOM | `components/production/print-bom-pdf.tsx` | `/api/jobs/[id]/production-docs?type=print-bom` |
| Reception File | `components/production/reception-pdf.tsx` | `/api/jobs/[id]/production-docs?type=reception` |

---

## 8. AI CHATBOT (25 tools + persistent memory)

Conversations are persistent with file upload support. Chat history stored in `chat_conversations`, `chat_messages`, and `chat_attachments` tables.

### Query Tools (read-only)
listCustomers, getCustomer, businessOverview, listQuotes, listJobs, listInvoices, listNCRs, getBGStock, getJobDetail, getBomLines, getJobSerials, searchAll, getJobProfitability, getPricing, getWorkflowGuide

### Action Tools (CEO/Operations Manager only)
updateJobStatus, classifyBomLine, classifyBomBatch, createProcurement, generateSerials, correctMCode

### All Roles
logProductionEvent, classifyComponent

---

## 9. USER ROLES & RLS

| Role | Users | Access |
|------|-------|--------|
| ceo | Anas Patel | Full access to everything |
| operations_manager | Piyush Tayal | All except invoices/financials |
| shop_floor | Hammad Ahmed | Production jobs + event logging only |

RLS policies enforce this at the database level. The AI chatbot additionally gates write tools by role.

---

## 10. SECURITY MEASURES

- Supabase Auth with cookie-based sessions (@supabase/ssr)
- Row Level Security on all 28 tables
- Auth middleware on all routes (redirect unauthenticated)
- Chat API: explicit auth + role check before admin client
- PostgREST filter injection protection (input sanitization on .or() calls)
- No stack traces in error responses
- API keys in .env.local (gitignored)
- VBA source files gitignored (contain hardcoded keys)

---

## 11. GIT HISTORY (93 commits)

### Session: April 7, 2026 (latest)
```
9e083ae feat: multiple contacts and addresses per customer
4ebc9ba feat: remove 4-tier quantity restriction — quotes now support any number of tiers
46117b2 fix: BOM list — handle array/object join responses for customer and GMP data
34cf8ef feat: move Active Workflows to separate dashboard tab
05b0790 chore: renumber migrations 013-017 to resolve duplicate numbering
4de61a3 feat: UI polish — M-Code chart, quote PDF refinement, Kanban DnD, mobile responsive, loading states
93aec11 feat: close SOP gaps — email templates, shipping tracker, fabrication orders, payment monitor
71c31d6 feat: AI chat memory + file upload — persistent conversations with attachment support
ba56736 feat: guided workflow stepper — visual step-by-step navigation across BOM→Quote→Job→Ship→Invoice
41a52b8 feat: MCP server — expose RS ERP to any AI via Model Context Protocol
```

### Session: April 6, 2026
```
72810fb docs: full project report — complete inventory of every file, table, API, engine, and config
01805f0 chore: gitignore VBA source files (contain API keys)
d0837e4 security: fix 3 vulnerabilities — auth bypass, filter injection, stack trace leak
24cd9ee fix: migration 012 — use correct m_code_rules column names
ffff78c feat: AI chatbot + WORKFLOW.md updated with pricing, profitability, supplier tools
529c910 feat: close all VBA logic gaps — overage fix, 43 M-Code rules, BG deduction, profitability
fede6e1 feat: Mouser + LCSC API integration — 3-supplier pricing with best-price selection
b5c4e10 feat: New Customer dialog — add clients with billing/shipping addresses
62579b8 feat: collapsible sidebar + dark/light mode toggle
1f4ad08 docs: complete workflow guide — step-by-step for every process in the ERP
485229b feat: AI Classify button on BOM detail page — one-click M-Code classification
e64cd54 feat: AI chatbot upgraded to action agent — 22 tools
125c3b9 fix: remove "use client" from PDF components
c694f5c fix: quote form — BOM list and pricing preview data shape mismatches
f1fa438 feat: SOP workflow parity — shipping, NCR, production docs, PO validation, inventory, serial tracking
```

### Previous sessions
```
c29366c fix: AI SDK v6 compat
9f7ad4a feat: AI chatbot with Claude Sonnet + 10 tools
9728849 feat: Claude AI M-Code classifier
... (59 earlier commits building core features)
05e72d1 feat: scaffold Next.js 15 project
4b0bf79 Initial commit
```

---

## 12. COMPANY IDENTITY

```
R.S. ELECTRONIQUE INC.
5580 Vanden Abeele
Saint-Laurent, QC H4S 1P9
Canada

Phone: +1 (438) 833-8477
Email: info@rspcbassembly.com
Web: www.rspcbassembly.com

GST/TPS: 840134829 (5%)
QST/TVQ: 1214617001 (9.975%)
```

---

## 13. MCP SERVER (erp-rs-mcp/)

Standalone MCP (Model Context Protocol) server exposing 20 tools across 9 domains. Allows any AI (Claude Desktop, OpenClaw, etc.) to query and interact with the full RS ERP system.

### Tool Domains
| Domain | Tools | Purpose |
|--------|-------|---------|
| Overview | rs_business_overview | High-level business snapshot |
| Customers | rs_list_customers, rs_get_customer | Customer lookup + order history |
| BOMs | rs_get_bom, rs_search_components, rs_classify_component | BOM data + M-Code classification |
| Quotes | rs_list_quotes, rs_get_quote, rs_create_quote, rs_approve_quote | Quote lifecycle |
| Jobs | rs_list_jobs, rs_get_job, rs_update_job_status | Job tracking |
| Procurement | rs_get_procurement, rs_list_backorders | PROC status + backorders |
| Production | rs_get_production_status, rs_log_production_event | Shop floor events |
| Invoices | rs_list_invoices, rs_get_aging_report, rs_get_profitability | Financials |
| Search | rs_search | Universal cross-entity search |

### Auth
JWT-based via Supabase tokens. Tool access filtered by user role (ceo/operations_manager/shop_floor).

---

## 14. NEW FEATURES (since April 6)

### Flexible Quantity Tiers
Quotes now support **any number of quantity tiers** (not limited to 4). The pricing engine dynamically calculates per-tier breakdowns for however many tiers are entered.

### Multiple Contacts & Addresses per Customer
Customers support JSONB arrays of contacts (name, email, phone, role, is_primary) and separate billing/shipping address arrays (label, is_default). Migrated from single contact/address fields.

### Active Workflows Dashboard Tab
Dashboard now has a separate tab showing active workflows across the system — in-progress quotes, jobs in procurement, etc.

### Guided Workflow Stepper
Visual step-by-step navigation component (`workflow-stepper.tsx`) guiding users through the full BOM → Quote → Job → Ship → Invoice lifecycle.

### Email Templates System
5 configurable email template categories (quote, invoice, shipping, procurement, general) with variable substitution ({{customer_name}}, {{job_number}}, etc.). Managed at `/settings/email-templates`.

### Shipping Tracker
Full shipment tracking with carrier support (FedEx, Purolator, UPS, Canada Post), tracking numbers, and status lifecycle (pending → shipped → in_transit → delivered). Page at `/shipping`.

### Fabrication Orders
PCB/stencil fabrication order tracking from suppliers. Tracks supplier reference, quantities, costs, and status (ordered → in_production → shipped → received). Page at `/procurement/stencils`.

### Payment Monitor
Payment records linked to invoices with method tracking (cheque, wire, EFT, credit card). CEO-only access. Page at `/invoices/payments`.

### AI Chat Memory + File Upload
Chat conversations are now persistent across sessions. Users can upload files as attachments. Full conversation history with message threading.

### UI Polish
- M-Code distribution chart on BOM detail
- Quote PDF refinements
- Kanban drag-and-drop on Jobs board
- Mobile responsive layouts
- Loading states across all pages

---

## 15. MERGE-SPLIT WORKFLOW PATTERN (Critical Architecture)

The core business logic is a **merge-split pattern** that happens TWICE in every order lifecycle. This is the #1 thing developers get wrong — treating each board as independent.

### How It Works
1. **START SEPARATE** — Each board (GMP) has its own BOM data
2. **MERGE** — Multiple boards combine so M-codes are assigned once, API pricing runs once, procurement calculates once (saves API calls + enables bulk pricing)
3. **SPLIT BACK** — Data pushes back to individual boards for per-board quotes, per-board tracking

### Two Merge-Split Cycles
| Cycle | Trigger | Merge For | Split For |
|-------|---------|-----------|-----------|
| **Quoting** | RFQ received | Deduplicate MPNs, assign M-codes, fetch pricing across all boards | Individual quote PDFs per GMP |
| **Procurement** | PO received | Order all material together via Proc Batch Code | Individual production tracking per board |

### Human Checkpoints (Non-Negotiable)
The 11-button MasterSheet sequence has mandatory human stops:
- **After M-Code assignment** — Human reviews and overrides edge cases
- **After extras calculation** — Human verifies quantities before API calls
- **After API pricing** — Human reviews prices before committing to quotes

### Proc Batch Code Format
```
YYMMDD CUSTOMER-TYPE###
Example: 260407 ISC-TB001

T = Turnkey, A = Assy Only, C = Consignment, P = PCB Only, D = Components Only, M = PCB & Components
B = Batch (multiple boards), S = Single board
```
This is a **physical folder label** — not a database ID. Humans read it on the shop floor.

### Current Implementation Gap
The web app currently processes BOMs one at a time. The merge-split pattern with cross-BOM component deduplication and shared pricing resolution is **not yet implemented** — this is the next major architectural milestone. See `BUILD_PROMPT.md` Part 2 for full requirements.

---

## 16. NON-NEGOTIABLE REQUIREMENTS

1. Every stage transition requires **explicit human action** — no auto-advancing
2. Every data transformation must be **visible** — M-codes, extras, pricing shown before commitment
3. Merge-split pattern must be a **first-class data model concept** (Quote Batch + Proc Batch entities)
4. API calls are **expensive and intentional** — never speculative, always human-triggered
5. BG stock deduction happens at **proc file generation**, not order placement
6. Reception file generation triggers **4 outputs + status update** in one action
7. Customer BOM configs must be **extensible without code changes**
8. **Dual API runs by design** — quoting uses BOM qty, procurement uses ORDER qty (BOM + M-code-based extras)

---

## 17. KEY REFERENCE FILES

- `BUILD_PROMPT.md` — **START HERE** — Complete business logic spec with merge-split workflow, 10 "what AI gets wrong" rules, 5-phase lifecycle, non-negotiable requirements
- `CLAUDE.md` — Full development brief (69KB, database schema, M-Code rules, pricing formulas, customer configs)
- `WORKFLOW.md` — Step-by-step workflow guide for all processes
- `PROJECT_REPORT.md` — This file
- `supabase/migrations/` — 18 migration files defining full database schema
- `erp-rs-mcp/` — MCP server (20 tools, 9 domains)
- `lib/mcode/rules.ts` — 43 M-Code classification rules
- `lib/pricing/engine.ts` — Pricing calculation engine
- `lib/bom/parser.ts` — BOM parser (9 CP IP rules)
- `All vba codes/` — Source VBA from all 11 Excel workbooks (source of truth for business logic)
