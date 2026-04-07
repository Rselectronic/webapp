# Session Log — April 6, 2026

> Read this file + CLAUDE.md + PROJECT_REPORT.md + WORKFLOW.md to get full context.

---

## What Was Built This Session

### Starting Point
- Existing MVP: 24 pages, 18 API routes, 18 DB tables, 8 AI chatbot tools
- Missing: most SOP workflow features from the Excel VBA system

### What Was Added (75 commits, ~10K lines added)

#### New Modules
1. **Quality/NCR system** — `/quality` pages, NCR reports, CAAF forms, severity/category classification
2. **Inventory/BG Stock** — `/inventory` page, feeder stock dashboard, low/out-of-stock alerts
3. **Shipping Documents** — Packing slip PDF, RoHS + IPC compliance certificate PDFs
4. **Production Floor Docs** — Job Card, Production Traveller, Print BOM, Reception File (4 PDFs)
5. **Serial Number Tracking** — Auto-generate per-board serials linked to jobs
6. **PO Pricing Validation** — Quote vs PO price comparison on job detail page
7. **Multi-PO Invoice Consolidation** — One invoice for multiple jobs from same customer
8. **MCP Server** — 20 tools via Model Context Protocol for external AI access

#### Enhanced Features
- **Proc Batch Code** fixed to SOP format: `YYMMDD CUST-XYNNN`
- **AI Chatbot** expanded from 8 to 22 tools (read + write + workflow guide)
- **AI Classify button** on BOM detail page — one-click M-Code classification
- **M-Code rules** expanded from 24 to 43 PAR rules
- **Overage table** fixed from percentages to absolute extras (matching Excel spec)
- **3-supplier pricing** — DigiKey + Mouser + LCSC APIs all wired up
- **Profitability engine** — quoted vs actual cost, margin per job
- **BG stock auto-deduction** on procurement creation
- **Supplier allocation** — auto-assign cheapest supplier from cache
- **Collapsible sidebar** + **dark/light mode** toggle
- **New Customer dialog** with billing/shipping addresses
- **Security fixes** — auth + role check on chat API, filter injection protection, stack trace removal

#### Database Migrations Applied to Supabase
- 008: `ncr_reports` table + RLS
- 009: `serial_numbers` table + RLS
- 010: `bg_stock` + `bg_stock_log` tables + RLS
- 011: Overage table fix (absolute values)
- 012: 24 additional M-Code PAR rules (PAR-25 to PAR-48)

#### Deployed
- **Vercel**: https://webapp-fawn-seven.vercel.app (production)
- All 9 env vars configured (Supabase, Anthropic, DigiKey, Mouser, LCSC)

---

## Current Stats
- 23 database tables
- 40 API routes
- 27 pages
- 62 components
- 22 AI chatbot tools
- 20 MCP server tools
- 9 PDF templates
- 15 business logic engines
- 43 M-Code PAR rules
- ~23K lines of TypeScript
- 75 commits

---

## What's NOT Done Yet (Next Session Priority)

### Priority 1: Guided Workflow Flow
The app works but each page is independent. It needs to feel like a connected wizard:
- **Stepper component** at top of pages showing: BOM → Classify → Quote → Job → PROC → Production → Ship → Invoice
- Current step highlighted, completed steps checkmarked
- **"Next Step" button** on every page that auto-navigates forward
- After BOM upload → auto-redirect to classify page
- After classify → show "Create Quote" button
- After quote accepted → auto-create job with one click
- Breadcrumb context on each page: "CVNS > cn > QT-2604-001 > JB-2604-CVNS-001"

### Priority 2: AI Memory + File Upload
- **New table**: `chat_history` (user_id, session_id, role, content, tool_calls, created_at)
- Save every chat message to DB so AI remembers past conversations
- **File upload in chat** — drag BOM onto chat, AI calls parse API + classifies
- AI references past interactions: "Last time you quoted Lanka TL265..."
- **Learning loop**: manual M-Code corrections saved to `components` table for future auto-match

### Priority 3: Remaining SOP Gaps (lower priority)
- Email integration (send quotes/invoices via email)
- Courier tracking (DigiKey/Mouser shipment status)
- Distributor invoice tracking (invoices FROM suppliers)
- Stencil/PCB order tracking (separate from component procurement)
- Transaction monitoring (PO spending audit trail)

### Priority 4: UI Polish
- BOM detail page could show classification summary chart
- Quote PDF should more closely match existing RS format
- Job Kanban could use drag-and-drop for status changes
- Mobile responsiveness improvements

---

## Key Files to Read First
1. `CLAUDE.md` — Full development brief (69KB — database schema, M-Code rules, pricing formulas, customer configs, MCP spec)
2. `PROJECT_REPORT.md` — Complete inventory of every file, table, API, engine
3. `WORKFLOW.md` — Step-by-step guide for every process
4. `SESSION_LOG.md` — This file (what was done, what's next)

---

## Bugs Found & Fixed
1. BOM dropdown empty on quote form — API returned array, form expected `{ boms: [] }`
2. Pricing table crash — API returned `{ pricing: { tiers } }`, form expected `{ tiers }`
3. PDF generation crash — `"use client"` on PDF components broke server-side `renderToBuffer()`
4. Migration 012 wrong column names — used `code` instead of `rule_id` for m_code_rules
5. Chat API privilege escalation — `createAdminClient()` with no role check (security fix)
6. PostgREST filter injection — unsanitized `.or()` calls (security fix)
7. Stack trace in error response — `err.stack` returned to client (security fix)

---

## How to Start Next Session
```
Read SESSION_LOG.md, CLAUDE.md, PROJECT_REPORT.md, and WORKFLOW.md.

The RS PCB Assembly ERP webapp is deployed at https://webapp-fawn-seven.vercel.app.
Supabase project: dypkautohnduuttaujzp. 23 tables, 40 API routes, 27 pages.

Next priorities:
1. Guided workflow wizard (stepper + next-step navigation)
2. AI chat memory (save to DB) + BOM file upload in chat
3. Learning loop for M-Code classification
```
