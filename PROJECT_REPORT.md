# RS PCB Assembly — Full Project Report

> Generated: April 6, 2026
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
- **22,918 lines of TypeScript**
- **221 source files**
- **73 commits**
- **27 pages**, **40 API routes**, **62 components**
- **23 database tables**, **12 migrations**
- **22 AI chatbot tools**

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

## 3. DATABASE SCHEMA (23 Tables)

| Table | Purpose |
|-------|---------|
| users | Extends Supabase auth (3 roles: ceo, operations_manager, shop_floor) |
| customers | Customer master data (code, company_name, bom_config JSONB) |
| gmps | Global Manufacturing Packages (board definitions per customer) |
| boms | Uploaded BOM files (file path, parsing status) |
| bom_lines | Parsed component lines (MPN, manufacturer, M-Code) |
| components | Master component library (cached from APIs) |
| api_pricing_cache | Price cache from DigiKey/Mouser/LCSC (7-day TTL) |
| m_code_rules | 43 PAR classification rules (Layer 2 engine) |
| overage_table | Material overage per M-Code per quantity tier (absolute extras) |
| quotes | Quote records (4 quantity tiers, pricing JSONB) |
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

---

## 4. API ROUTES (40 endpoints)

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

### Quotes
- `GET/POST /api/quotes` — List/create quotes
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
- `GET /api/supplier-pos/[id]/pdf` — Supplier PO PDF

### Invoices
- `GET/POST /api/invoices` — List/create (supports multi-PO consolidation)
- `GET/PATCH /api/invoices/[id]` — Get/update invoice
- `GET /api/invoices/[id]/pdf` — Generate invoice PDF

### Production & Quality
- `POST /api/production` — Log production events
- `GET/POST /api/ncr` — NCR list/create
- `GET/PATCH /api/ncr/[id]` — NCR detail/update

### Inventory & Pricing
- `GET/POST /api/bg-stock` — BG feeder stock
- `POST /api/bg-stock/[id]/adjust` — Stock adjustment
- `GET /api/pricing/[mpn]` — 3-supplier pricing (DigiKey+Mouser+LCSC)

### AI & Search
- `POST /api/chat` — AI chatbot (22 tools, role-gated)
- `GET /api/search` — Universal search
- `POST /api/mcp/classify` — AI M-Code classification
- `GET /api/mcp/overview` — Classification stats
- `GET /api/export` — CSV export
- `GET/PATCH /api/settings` — App settings

---

## 5. PAGES (27 routes)

| Page | URL | Purpose |
|------|-----|---------|
| Login | `/login` | Email/password auth |
| Dashboard | `/` | 8 KPIs + activity feed |
| Customers | `/customers` | List + search + "New Customer" dialog |
| Customer Detail | `/customers/[id]` | Contact, order history |
| BOMs | `/bom` | BOM list |
| BOM Upload | `/bom/upload` | Upload Excel/CSV |
| BOM Detail | `/bom/[id]` | Component table + AI Classify button |
| Quotes | `/quotes` | List with status filters |
| New Quote | `/quotes/new` | BOM select, 4 tiers, pricing calc |
| Quote Detail | `/quotes/[id]` | Pricing table, PDF, approval |
| Jobs | `/jobs` | Kanban + Table views |
| Job Detail | `/jobs/[id]` | PO validation, shipping, production docs, NCR, serials |
| Procurement | `/procurement` | PO list with status tabs |
| Procurement Detail | `/procurement/[id]` | Line items, receiving |
| Production | `/production` | Real-time dashboard |
| Production Log | `/production/log` | Event logger (shop floor) |
| Invoices | `/invoices` | Aging report + multi-PO create |
| Invoice Detail | `/invoices/[id]` | PDF, payment tracking |
| Quality | `/quality` | NCR list with KPIs |
| NCR Detail | `/quality/[id]` | CAAF form, status workflow |
| Inventory | `/inventory` | BG feeder stock dashboard |
| Reports | `/reports` | Revenue + profitability table |
| Settings | `/settings` | Config hub |
| Pricing Settings | `/settings/pricing` | Markup rates |
| M-Code Rules | `/settings/m-codes` | 43 PAR rules |
| Customer BOM Config | `/settings/customers` | Per-customer column mapping |
| Audit Log | `/settings/audit` | Change history |

---

## 6. BUSINESS LOGIC ENGINES (15/15 complete)

| # | Engine | File(s) |
|---|--------|---------|
| 1 | Pricing Engine (4-tier calculation) | `lib/pricing/engine.ts` |
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

## 8. AI CHATBOT (22 tools)

### Query Tools (read-only)
listCustomers, getCustomer, businessOverview, listQuotes, listJobs, listInvoices, listNCRs, getBGStock, getJobDetail, getBomLines, getJobSerials, searchAll, getJobProfitability, getPricing, getWorkflowGuide

### Action Tools (CEO/Operations Manager only)
updateJobStatus, classifyBomLine, classifyBomBatch, createProcurement, generateSerials

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
- Row Level Security on all 23 tables
- Auth middleware on all routes (redirect unauthenticated)
- Chat API: explicit auth + role check before admin client
- PostgREST filter injection protection (input sanitization on .or() calls)
- No stack traces in error responses
- API keys in .env.local (gitignored)
- VBA source files gitignored (contain hardcoded keys)

---

## 11. GIT HISTORY (73 commits)

### Session: April 6, 2026 (this session)
```
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

## 13. KEY REFERENCE FILES

- `CLAUDE.md` — Full development brief (69KB, database schema, M-Code rules, pricing formulas, customer configs)
- `WORKFLOW.md` — Step-by-step workflow guide for all processes
- `PROJECT_REPORT.md` — This file
- `supabase/migrations/` — 12 migration files defining full database schema
- `lib/mcode/rules.ts` — 43 M-Code classification rules
- `lib/pricing/engine.ts` — Pricing calculation engine
- `lib/bom/parser.ts` — BOM parser (9 CP IP rules)
