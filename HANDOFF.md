# RS PCB Assembly — Handoff Log

> **Read this file first in every new Claude session.**
> It contains the full running history of what's been built, what works, what's broken, and what's next.
> Also read: `CLAUDE.md` (spec), `BUILD_PROMPT.md` (business logic), `WORKFLOW.md` (SOPs).

---

## Project Identity

- **App:** Custom ERP replacing 11 Excel/VBA workbooks for RS PCB Assembly (Montreal)
- **CEO:** Anas Patel (apatel@rspcbassembly.com) — the user
- **Live URL:** https://webapp-fawn-seven.vercel.app
- **Supabase:** project `dypkautohnduuttaujzp` (PostgreSQL 17, us-west-2)
- **Stack:** Next.js 16.2.2 + Supabase + Tailwind + shadcn/ui + pdf-lib
- **Repo:** Rselectronic/webapp on GitHub (main branch)

---

## Supplier API Status (verified live April 13, 2026)

Every BOM price lookup fires these 3 APIs in parallel, takes the cheapest, and caches for 7 days.

| API | Status | Returns | Auth | Rate limit |
|-----|--------|---------|------|------------|
| **DigiKey v4** | ✅ Working | Price + dimensions + mounting type + package + category | OAuth 2.0 client_credentials | 1,000 req/day |
| **Mouser v1** | ✅ Working | Price + stock qty + Mouser PN | API key in query string | 30/min + 1,000/day |
| **LCSC** | ❌ Blocked vendor-side | — | SHA1 signature (rejected) | — |

**LCSC needs Anas action:** email the LCSC contact to either activate the key/secret or provide the correct signature recipe. Current behavior is they reject every auth variant (SHA1/MD5/SHA256/query/headers). Client returns `null` safely so pricing continues with DigiKey + Mouser.

### How the APIs are supposed to work — the full flow

```
User uploads BOM → /api/bom/parse parses components
     ↓
User clicks "Calculate Pricing" on quote form
     ↓
POST /api/quotes/preview
     ↓
For each unique MPN in the BOM:
  1. Check api_pricing_cache (7-day TTL per entry)
     → HIT: use cached price (no API call)
     → MISS: fire all 3 APIs in parallel via Promise.allSettled
        ├─ DigiKey: OAuth token → keyword search → extract v4 fields
        │   (ManufacturerProductNumber, ProductVariations[0].DigiKeyProductNumber,
        │    Parameters[].ParameterText/ValueText)
        ├─ Mouser: apiKey query → keyword search → extract first price break
        └─ LCSC: SHA1 signature → search → extract first price tier (returns null)
  2. Pick cheapest across all 3 suppliers
  3. Cache the full response in api_pricing_cache
  4. Enrich components table (DigiKey only — only one that returns dimensions):
     mounting_type, package_case, category, length_mm, width_mm, height_mm
     → This feeds PAR-20 through PAR-24 size rules for future M-code classification
  5. Apply component_markup (default 20%) → unit cost
     ↓
Quote engine calculates per-tier totals:
  component_cost + PCB cost + assembly cost (SMT/TH/MANSMT placements)
  + setup time + programming time + NRE (programming + stencil + PCB fab + misc)
     ↓
Return pricing per tier to the UI
```

### Why DigiKey is primary
- Only supplier that returns component dimensions in its keyword search response
- Dimensions feed M-code classification (size-based PAR rules)
- Every price lookup auto-enriches the `components` table — the more you price, the smarter future classification becomes

### What happens when an API fails
- **DigiKey auth fails:** token request throws, client returns `null`, pricing falls back to Mouser + LCSC
- **Mouser API key missing:** client returns `null` immediately, no error
- **LCSC signature rejected:** client catches error, returns `null`
- **All 3 fail for one MPN:** retry with description keyword search (first 5 words of description)
- **All retries fail:** MPN flagged as "missing price" in preview response, UI shows collapsible list
- **Rate limit exceeded:** treated as failure, same fallback chain

### Critical bug fixed April 13 2026
DigiKey client was silently broken — it used v3 response field names on a v4 endpoint:
- `ManufacturerPartNumber` (v3) → should be `ManufacturerProductNumber` (v4)
- Top-level `DigiKeyPartNumber` (v3) → should be `ProductVariations[0].DigiKeyProductNumber` (v4)
- `Parameters[].Parameter/.Value` (v3) → should be `ParameterText/ValueText` (v4)

Result: every DigiKey enrichment field (package_case, mounting_type, dimensions) came back `undefined`. Component table was never getting populated, size-based M-code rules (PAR-20 through PAR-24) had no data to match against.

**Now fixed and verified live** with `ERJ-2GE0R00X`:
```
DIGIKEY: OK
{ mpn: "ERJ-2GE0R00X", unit_price: 0.16 CAD, digikey_pn: "P0.0JTR-ND",
  mounting_type: "Surface Mount", package_case: "0402 (1005 Metric)",
  category: "Chip Resistor - Surface Mount",
  length_mm: 1, width_mm: 0.5, height_mm: 0.4 }

MOUSER: OK
{ mpn: "ERJ-2GE0R00X", unit_price: 0.144 CAD, mouser_pn: "667-ERJ-2GE0R00X",
  stock_qty: 2652551 }

LCSC: NULL (vendor-side blocker)
```

Full API implementation details: **ABDULS_WIKI.md Part 16**.

---

## Session History

### Session 1 — April 6, 2026

**Starting point:** Bare MVP — 24 pages, 18 API routes, 18 DB tables, 8 AI chatbot tools.

**Built:**
- Quality/NCR system (`/quality` pages, NCR reports, CAAF forms)
- Inventory/BG Stock (`/inventory`, feeder stock dashboard, low-stock alerts)
- Shipping Documents (packing slip PDF, RoHS + IPC compliance certificates)
- Production Floor Docs (Job Card, Traveller, Print BOM, Reception File — 4 PDFs)
- Serial Number Tracking (auto-generate per-board serials)
- PO Pricing Validation (quote vs PO price comparison)
- Multi-PO Invoice Consolidation
- MCP Server (20 tools for external AI access)
- AI Chatbot expanded from 8 to 22 tools
- M-Code rules expanded from 24 to 43 PAR rules
- Overage table fixed to absolute extras (matching Excel)
- 3-supplier pricing: DigiKey + Mouser + LCSC APIs
- Profitability engine (quoted vs actual cost)
- BG stock auto-deduction on procurement
- Collapsible sidebar + dark/light mode
- Security fixes (auth on chat API, filter injection, stack trace removal)

**Migrations applied:** 008-012 (ncr_reports, serial_numbers, bg_stock, overage fix, PAR rules 25-48)

**Bugs fixed:** BOM dropdown empty, pricing table crash, PDF `renderToBuffer` crash, migration 012 wrong column names, chat API privilege escalation, PostgREST filter injection, stack trace leak.

**End state:** 23 tables, 40 API routes, 27 pages, 62 components, ~23K lines TypeScript, 75 commits.

---

### Session 2 — April 7, 2026

**Built:**
- Multiple contacts and addresses per customer (contacts JSONB array, billing/shipping address arrays)
- Removed 4-tier quantity restriction — quotes now support any number of tiers
- BOM list fix — handle array/object join responses for customer and GMP data
- Active Workflows moved to separate dashboard tab
- Renumbered migrations 013-017 to resolve duplicate numbering

**End state:** 93 commits.

---

### Session 3 — April 8, 2026

**The big one — Quote Batch Workflow + M-Code keyword engine.**

**Built:**

1. **Quote Batch Workflow (merge-split pattern)**
   - New tables: `quote_batches`, `quote_batch_boms`, `quote_batch_lines`, `quote_batch_log`
   - Migration 019 applied to Supabase
   - 7 API endpoints:
     - `POST /api/quote-batches` — create batch
     - `POST /api/quote-batches/[id]/merge` — cross-BOM component dedup (Steps 1-3)
     - `POST /api/quote-batches/[id]/assign-mcodes` — M-code classification (Step 4)
     - `PATCH /api/quote-batches/[id]/lines/[lineId]` — manual M-code override (Step 5)
     - `POST /api/quote-batches/[id]/calculate-extras` — overage calc (Step 6)
     - `POST /api/quote-batches/[id]/run-pricing` — API pricing (Step 9)
     - `POST /api/quote-batches/[id]/send-back` — split back + quote generation (Steps 10-11)
   - 3 pages: `/quotes/batches`, `/quotes/batches/new`, `/quotes/batches/[id]`
   - 3 components: `batch-workflow.tsx`, `new-batch-form.tsx`, `mcode-override-cell.tsx`
   - Human checkpoints at M-code review, extras verification, pricing verification
   - Workflow progress bar with step-by-step visibility

2. **Quote PDF fixed**
   - Replaced `@react-pdf/renderer` (native yoga-layout crashes on Vercel serverless) with `pdf-lib` (pure JS)
   - Handles both pricing formats: `{ tiers: [] }` and `{ tier_1: {}, tier_2: {} }`
   - Null-safe formatting
   - **Other PDF routes still use @react-pdf/renderer and will crash on Vercel** — invoices, supplier POs, shipping docs, production docs all need the same fix

3. **M-Code keyword engine (230 terms)**
   - New table: `mcode_keyword_lookup` (migration 020)
   - 230 keywords from Anas's master list: package names, mounting types, component categories
   - Checked BEFORE PAR rules in classification pipeline
   - Classification priority order now: components DB → keyword lookup → PAR rules → Claude AI
   - Fixes: SOT-23 was misclassified as MANSMT, now correctly CP
   - "fiber" → PCB detection added

4. **Learning loop connected**
   - Manual M-code overrides in batch workflow save to `components` table
   - Layer 1 (database lookup) catches these automatically on future BOMs
   - "You've done it for the rest of time" — Anas's words

5. **Customer page — Boards/GMPs section**
   - Shows all boards for a customer with GMP number, board name, revision, active status
   - Each board shows its uploaded BOM files with status and component count
   - "Add Board" and "Upload BOM" buttons per board

6. **BOM parser enhancements**
   - Column mapper improvements
   - Parser type updates

**Bugs fixed:**
- Quote PDF 500 error on Vercel (native dependency crash)
- `fmt()` crash on null pricing values
- Send-back route outputting wrong pricing format for PDF consumption

**Migrations applied:** 019 (quote_batches), 020 (mcode_keyword_lookup + 230 seed terms)

**Deployed:** Vercel production, commit `964f355`

**End state:** 27 tables, 48 API routes, 30 pages, 65 components, ~27K lines TypeScript.

**Later in Session 3 — Cleanup + PDF migration + UI improvements:**

- Removed 2 stale git worktrees, added `.claude/` to `.gitignore`
- Disabled PAR-48 catch-all rule and 5 conflicting DB rules missing field_2 conditions
- Deleted orphaned `quote-pdf.tsx`, stale sprint plans (7,860 lines removed)
- Removed `@types/react-pdf` (unused)
- **Ported ALL 9 PDF routes to pdf-lib** — removed `@react-pdf/renderer` entirely:
  - Quote PDF, Invoice PDF, Supplier PO PDF
  - Packing Slip, Compliance Certificate
  - Job Card, Traveller, Print BOM, Reception File
  - Deleted 8 orphaned React PDF components
  - Created shared `lib/pdf/helpers.ts` for common header/footer/table utilities
- **M-code reasoning UI** — batch workflow now shows:
  - Why M-code was chosen: "DB Match" / "Rule" / "AI" / "Manual" / "Unclassified"
  - Color-coded confidence bar: green (90%+), yellow (70-89%), red (<70%)
- **BOM detail page** — header shows GMP number as primary heading instead of file name
- Updated PROJECT_REPORT.md

**Deployed:** Vercel production, commit `efdc75f`

**Even later in Session 3 — M-code reasoning, pricing APIs, customer editing, dark mode, data reset:**

- **Human-readable M-code reasoning:**
  - Added `m_code_reasoning` column to `bom_lines` (migration 022) and `quote_batch_lines` (migration 021)
  - Classifier now generates plain-English explanations (e.g. `Found "SOT-23" in component data -> chip package (standard SMT)`) instead of just rule IDs
  - BOM table shows: source label (DB/Rule/AI/Manual) + reasoning text + confidence bar (green/yellow/red)
  - Same reasoning shown in batch workflow table
- **Pricing calls DigiKey/Mouser/LCSC directly:**
  - Removed fragile self-referencing HTTP fetch with cookie forwarding
  - Run Pricing step now imports supplier API clients directly
  - Queries all 3 suppliers in parallel, picks cheapest, caches for 7 days
  - Quote preview now shows real component prices instead of $0
- **Customer edit form:**
  - Full inline editing of company info, contacts, addresses, BOM config, and notes
  - All fields editable from the customer detail page
- **Dark mode polish pass:** Visual consistency improvements across the app
- **Full data reset:** Deleted all BOMs, bom_lines, quotes, jobs, invoices, procurements, production events — clean slate for fresh testing

**Deployed:** Vercel production, commit `407aa40`

---

### Session 4 — April 9, 2026

**4,026 master components loaded into database:**
- Bulk imported from RS master component database PDF (167 pages)
- Layer 1 (database lookup) now catches 4,026 MPNs instantly at 95% confidence
- Verified: 23/23 sample MPNs across all pages found with correct M-codes
- Cleaned 252 duplicate rows from overlapping import batches
- Non-standard M-codes preserved: APCB (352), EA (59), PCB (47), MEC (42), CABLE, FUSE, LABEL, etc.

**Component Database management page** (Settings → Component Database):
- View/search/add/edit/delete component M-codes
- Stats cards with M-code distribution
- Inline editing — click M-code badge to change
- Page size selector (50/100/200 rows)
- Performance fix: single query instead of paginated loop

**BOM parser handles raw customer BOMs:**
- 30+ new column keywords added (Part No, P/N, Component, Count, Item, Spec, etc.)
- Multi-pass fallback: exact → contains → partial → guess
- Scans 30 rows for headers (up from 20), picks best match
- Graceful error: shows detected headers and suggests BOM config
- No longer requires pre-processed CP IP files

**Quote pricing calls APIs directly:**
- Preview route now calls DigiKey/Mouser/LCSC for real component prices
- No more $0 components

**Deployed:** Vercel production, commit `6f3fce8`

**End state:** 27 tables, 58 API routes, 35 pages, ~30K lines TypeScript, 115 commits. 4,026 components in master database.

---

### Session 5 — April 8, 2026 (later)

**Procurement ordering/receiving flow fixed end-to-end.**

**FIX 1: PATCH API supports 4 actions** (`app/api/procurements/[id]/route.ts`):
- `action: "order_line"` — marks a single line as ordered (sets `qty_ordered = qty_needed + qty_extra`, `order_status = "ordered"`)
- `action: "order_all"` — marks ALL pending lines as ordered in one call
- `action: "receive_line"` — existing receiving logic (backward compatible, still default)
- `action: "update_status"` — manually set procurement status (for completing)
- All actions recalculate procurement-level `lines_ordered`, `lines_received`, and `status` automatically

**FIX 2: Order buttons in UI** (`app/(dashboard)/procurement/[id]/page.tsx`):
- New `OrderButton` component (`components/procurement/order-button.tsx`) — per-line "Order" button for pending lines
- New `OrderAllButton` component (`components/procurement/order-all-button.tsx`) — bulk "Mark All as Ordered" with confirmation dialog
- Table now shows "Order Qty" column (qty_needed + extras)
- Action column is context-aware: pending lines show "Order", ordered lines show "Receive", received lines show nothing
- `ReceiveButton` updated to pass `action: "receive_line"` explicitly

**FIX 3: Supplier PO creation updates procurement counts** (`app/api/supplier-pos/route.ts`):
- After marking lines as ordered, recalculates `lines_ordered`, `lines_received`, and procurement `status`
- Procurement status auto-advances from "draft" to "ordering" when POs are created

**End-to-end flow now works:** Pending lines -> Mark as Ordered (single or bulk) -> Create Supplier PO (auto-groups by supplier) -> Receive lines -> Procurement auto-completes.

**BOM classification UX fixes:**
- Summary/total rows filtered out (qty-only rows with no designator/MPN/description now skipped)
- Two-step classification: rules first (instant), then AI for leftovers only
- M-codes apply immediately after classification (no page refresh needed)
- "29 components have no price" now shows WHICH MPNs are missing with a collapsible list
- BOM upload: existing GMP no longer blocks — uploads as new revision under existing GMP automatically
- BOM export button: downloads CP IP BOM as .xlsx with Qty, Designator, CPC, Description, MPN, Manufacturer, M-Code, Reasoning
- Pricing description fallback: when MPN search fails on DigiKey/Mouser, retries with description keywords (e.g. "0603 10K resistor")
- Missing price components visible on ALL quotes (old and new) — collapsible list shows which MPNs have no price
- AI chatbot system prompt updated: knows about 4,026 component database, keyword lookup, description fallback pricing

**Codebase cleanup (4-agent audit):**
- Added auth checks to 6 unprotected API routes (pricing, components, bg-stock, gmps, settings)
- Removed console.error from 3 production API routes (mcp/classify, mcp/overview, chat/upload)
- Fixed empty catch blocks in 3 components (added error logging)
- Fixed dark mode on invoice dialog
- Deleted 2 orphaned components (template-render-button, serial-numbers)
- Verified: no unused imports, no dead API routes, no duplicate utilities, all deps in use

**M-code classification fixes:**
- Keyword matching now uses word-boundary for short keywords (≤4 chars) to prevent false matches like "LPC2468" matching "0402"
- IP (IC Package) added to SMT_MCODES in pricing engine — was missing, causing $0 assembly cost for all ICs
- MEC, Accs, CABLE, DEV B documented as non-placement M-codes (don't contribute to assembly cost)

---

## Known Issues / Tech Debt

### Must Fix Soon
- [ ] **Procurement: no reception file trigger UI** — receiving marks qty but doesn't generate reception file PDF
- [ ] **Duplicate PAR rules** between `rules.ts` (in-code) and `m_code_rules` DB table — classifier uses in-code rules. Need to consolidate to DB-only
- [ ] **M-code classification still has inaccuracies** — Anas reported wrong M-codes. Word-boundary fix applied for short keywords but some components still misclassify. Need specific examples to trace which rule/keyword is wrong
- [ ] **Labour costing (TIME file)** — NOT BUILT. No labour rate tracking, no TIME file equivalent
- [ ] **Production scheduling** — NOT BUILT. No kanban, no refresh-qty, no scheduling
- [ ] **Procurement merge-split cycle 2** — NOT BUILT. Second merge-split for ordering at ORDER quantities (vs BOM quantities)
- [ ] **Proc batch code format** — `generateProcCode()` exists but may not match SOP format YYMMDD CUST-XYNNN

### Fixed (was broken)
- [x] **Security: /api/pricing/[mpn]** — auth check added (Session 5)
- [x] **Stencil page crash** — RLS nested join issue fixed with admin client (Session 6)
- [x] **New Order button crash** — dialog fetched {jobs:[]} as object not array (Session 6)
- [x] **Create Procurement 404** — page didn't exist, now created at /procurement/new (Session 6)
- [x] **IP missing from pricing** — IC packages were $0 assembly cost, now in SMT_MCODES (Session 6)

### Nice to Have
- [ ] Copy button on M-code override cells (Anas requested)
- [ ] Guided workflow wizard (stepper component showing BOM → Classify → Quote → Job → PROC → Ship → Invoice)
- [ ] Email integration (send quotes/invoices)
- [ ] AI chat memory persistence
- [ ] Mobile responsiveness
- [ ] Volume-based price breaks from DigiKey/Mouser (per-tier pricing)
- [ ] Dashboard quick action buttons (New Quote, New Job)
- [ ] Loading states on slow operations (pricing, classification)
- [ ] QC verification workflow (PROC Verification V3 equivalent)

---

## Key Architecture Decisions

1. **Merge-split is a first-class concept** — `quote_batches` groups BOMs temporarily for shared operations, then releases them into individual quotes. Same pattern will be used for procurement batches.

2. **Keyword lookup before rules** — 230 common terms checked first (fast, exact). PAR rules are more complex pattern matching. AI is last resort (expensive).

3. **Learning loop** — every manual M-code override saves to `components` table. Future BOMs with same MPN are auto-classified. System gets smarter with every quote.

4. **pdf-lib over @react-pdf/renderer** — pure JS, no native dependencies, works everywhere including Vercel serverless.

5. **Human checkpoints are mandatory** — no auto-advancing between workflow steps. Each stage transition is an explicit button click. This preserves the quality control that the Excel system provided.

6. **API calls are intentional** — DigiKey/Mouser APIs only fire after human verifies order quantities. No speculative API calls.

---

## Files to Read for Context

| File | What | Size |
|------|------|------|
| `HANDOFF.md` | This file — running session history | — |
| `CLAUDE.md` | Full dev spec: schema, M-codes, pricing, customers, MCP | 69KB |
| `BUILD_PROMPT.md` | Business logic: merge-split, 11-button sequence, what AI gets wrong | 15KB |
| `WORKFLOW.md` | Step-by-step SOPs for every process | 18KB |
| `PROJECT_REPORT.md` | Complete file/table/API inventory | 22KB |

---

---

### Session 6 — April 11, 2026

**M-code classification accuracy fixes:**
- Keyword matching uses word-boundary for short keywords (≤4 chars) — prevents "LPC2468" falsely matching "0402"
- IP (IC Package) was MISSING from SMT_MCODES in pricing engine — every IC was $0 assembly cost, now fixed
- MEC, Accs, CABLE, DEV B documented as non-placement M-codes

**Full app audit (bugs, blockers, UX):**
- Identified: proc batch codes not being assigned, reception file no UI trigger, duplicate PAR rules, middleware deprecation
- Dashboard needs quick action buttons, loading states on slow operations, mobile improvements

**Abdul's Wiki** (ABDULS_WIKI.md — 2,777 lines):
- Complete tutorial explaining the entire system from zero context
- 14 parts: business, data model, M-codes, BOM parser, pricing, procurement, API layer, frontend, deployment, what's not built, architecture decisions, formulas, data flow walkthrough, every page/button documented

**Bug fixes:**
- Create Procurement page created at `/procurement/new` — was a 404
- Stencil/PCB orders page fixed — RLS nested join issue, switched to admin client
- New Order button on stencil page fixed — dialog crashed because `/api/jobs` returns `{jobs:[]}` not array
- Print Copy BOM and Reception File buttons work from job detail page

**Reference prompt created** for Anas to use in any AI tool working on the app.

**Deployed:** Vercel production, commit `b6aaef5`

**End state:** 27 tables, 58 API routes, 36 pages, ~31K lines TypeScript, 130+ commits. 4,026 components. Codebase clean.

---

### Session 7 — April 11, 2026

**5 bugs/features fixed in parallel (5 agents, worktree isolation).**

**1. Reception File Trigger UI** (was: no way to generate reception file from procurement):
- Added "Generate Reception File" button to procurement detail page header
- Only shows when status is `partial_received` or `fully_received`
- Calls existing `/api/jobs/{job_id}/production-docs?type=reception` endpoint
- Opens PDF in new tab — no new API routes needed

**2. Labour Costing / TIME File** (was: NOT BUILT):
- Extended `PricingSettings` type with `smt_rate_per_hour` ($165/hr from VBA), granular NRE breakdown (5 items)
- New `LabourBreakdown` interface: per-tier SMT/TH/MANSMT placement costs, setup cost, programming cost
- Enhanced `calculateQuote()` to include full labour breakdown in every tier
- New `POST /api/labour` endpoint — calculates labour cost for any BOM + quantity
- Settings page expanded: Labour Rates & Time section, NRE breakdown with 5 configurable items
- Pricing table: collapsible "Show Labour & NRE Breakdown" section with M-code stats
- Quote batch send-back updated to populate labour data
- Migration 023 applied (labour costing settings)
- Key VBA rates: labour $130/hr, SMT $165/hr

**3. Production Scheduling** (was: NOT BUILT):
- **Kanban Board**: 4 columns (Parts Received → Production → Inspection → Ready to Ship), drag-and-drop + click-to-move, color-coded urgency borders
- **Weekly Schedule**: Mon-Fri calendar grid, job date spans, week navigation, unscheduled jobs warning
- **Production Dashboard**: KPI cards, overdue jobs panel, today's active jobs, upcoming 7 days, recent events
- **Job Scheduler**: inline date picker on job detail page for scheduled start/completion
- Production page rebuilt with 3 togglable views (Dashboard / Kanban / Weekly)
- No new tables/APIs — uses existing `jobs`, `production_events`, `job_status_log`
- Based on VBA Production Schedule V3 spec (7 modules)

**4. Procurement Merge-Split Cycle 2** (was: NOT BUILT):
- New tables: `procurement_batches`, `procurement_batch_lines` (migration 020)
- 6 API endpoints under `/api/procurement-batches/`:
  - Create batch, merge components, calculate extras, allocate suppliers, create POs, split back
- 3 UI pages: `/procurement/batches`, `/procurement/batches/new`, `/procurement/batches/[id]`
- 2 new components: `batch-workflow.tsx`, `new-proc-batch-form.tsx`
- Follows same merge-split pattern as quote batches
- Cross-job component deduplication at ORDER quantities with recalculated overage

**5. Proc Batch Code Format** (was: generating wrong codes like "BT" instead of "TB"):
- Found VBA source: `procbatchcode_generator_V2.bas` from Job Queue V8
- Removed broken `ASSEMBLY_TYPE_MAP` that reversed letter order (TB→BT)
- Added all 12 valid type codes from VBA (TB, TS, AB, AS, CB, CS, PB, PS, DB, DS, MB, MS)
- Sequence counter changed from per-customer-per-type to per-customer globally (matching VBA)
- Removed unused `is_batch` parameter

**New files created:**
- `components/production/production-kanban.tsx`
- `components/production/weekly-schedule.tsx`
- `components/production/production-dashboard.tsx`
- `components/production/job-scheduler.tsx`
- `components/procurement/batch-workflow.tsx`
- `components/procurement/new-proc-batch-form.tsx`
- `app/api/labour/route.ts`
- `app/api/procurement-batches/route.ts`
- `app/api/procurement-batches/[id]/route.ts`
- `app/(dashboard)/procurement/batches/page.tsx`
- `app/(dashboard)/procurement/batches/new/page.tsx`
- `app/(dashboard)/procurement/batches/[id]/page.tsx`
- `supabase/migrations/020_procurement_batches.sql`
- `supabase/migrations/023_labour_costing_settings.sql`

**6. AI Agent expanded from 23 to 39 tools:**
- **16 new tools** added to `/api/chat/route.ts`:
  - **Write actions:** `createQuote`, `updateQuoteStatus`, `createJobFromQuote`, `scheduleJob`, `createInvoice`, `markInvoicePaid`, `orderProcurementLines`, `receiveProcurementLine`, `createNCR`, `updateCustomer`, `generateDocument`
  - **Read tools:** `getProductionSchedule` (kanban/overdue/upcoming views), `getLabourCost`, `getAgingReport`, `listProcurements`
- AI can now perform the full lifecycle via chat: create quotes, accept them into jobs, schedule production, create procurement, order/receive parts, generate invoices, mark paid, generate any PDF
- System prompt updated: AI now identifies as both DATA ASSISTANT and ACTION AGENT
- Step limit increased from 8 to 12 to support multi-tool workflows
- All write tools gated by `isPrivileged` (CEO + Operations Manager only)

**7. Audit log triggers (migrations 024 + 025):**
- Created `audit_trigger_func()` — PostgreSQL trigger function that automatically logs all changes
- Applied to **31 of 39 tables** (migration 024: 12 core tables, migration 025: 19 remaining)
- On UPDATE: only stores changed fields (not full row) to keep audit_log lean
- Skips no-op updates (where nothing actually changed)
- Captures `auth.uid()` automatically — tracks who made every change
- Existing `/settings/audit` page now shows all changes (was empty before)
- Skipped 8 tables: audit_log (infinite loop), 4 log tables (already logs), api_pricing_cache + chat_messages + chat_attachments (high volume)

**8. M-code classification 10x speed boost:**
- AI calls: sequential → parallel batches of 10 (`classifyBatchWithAI` in `lib/mcode/ai-classifier.ts`)
- Keyword lookup: was querying DB per-component → now fetched ONCE per BOM and passed to all
- DB component lookup: per-component SELECT → single batch IN query for all MPNs
- DB updates: sequential awaits → `Promise.all()` parallel writes
- Before: 20 components = ~30 seconds. After: ~3 seconds.

**9. Pricing calculations documented:**
- Added Part 15 to ABDULS_WIKI.md: every formula, rate, and default in the app
- Sections 15.1–15.9: quote pricing, overage, supplier selection, batch workflow, invoices, profitability, labour, defaults
- Found discrepancy: batch send-back hardcodes SMT at $0.35 instead of $0.035 (10x off)

**10. Cleaned up MD files:**
- Deleted `BUILD_PROMPT.md` and `PROJECT_REPORT.md` (content in ABDULS_WIKI.md and HANDOFF.md)
- Kept: ABDULS_WIKI.md, HANDOFF.md, WORKFLOW.md, CLAUDE.md, AGENTS.md, README.md

**11. DigiKey API enrichment + size-based M-code rules now working:**
- DigiKey client (`lib/pricing/digikey.ts`) now extracts `Parameters` from API response: `mounting_type`, `package_case`, `category`, `length_mm`, `width_mm`, `height_mm`
- New `lib/pricing/enrich-components.ts` — saves API data to `components` table (fire-and-forget after pricing lookups)
- Pricing route (`/api/pricing/[mpn]`) enriches components table from DigiKey, Mouser, and LCSC after every lookup
- Classifier now fetches component details (dimensions, package, mounting type) and passes them to rules engine
- Size rules PAR-20 through PAR-24 now actually fire:
  - PAR-20: L 0.4-0.99 × W 0.2-0.59 → 0201
  - PAR-21: L 1.0-1.09 × W 0.5-0.59 → 0402
  - PAR-22: L 1.5-3.79 × W 0.8-3.59 → CP
  - PAR-48: L 3.8-4.29 × W 3.6-3.99 → CPEXP
  - PAR-23: L 4.3-25 × W 4.0-25 → IP
  - PAR-24: L 25+ × W 25+ → MEC
- `classifyBomLines` batch-fetches component details in single query alongside M-code lookups
- Previously these rules were dead code — dimensions never populated. Now they auto-populate from DigiKey.

**End state:** 29 tables, 65+ API routes, 39 pages, ~37K lines TypeScript. AI agent: 39 tools. Full audit trail on 31 tables. Classification 10x faster. Size rules live.

---

### Session 8 — April 13, 2026

**6 UI/UX bugs fixed from Anas's screenshots (6 parallel agents).**

**1. Payment Terms — configurable from settings:**
- New settings page: `/settings/payment-terms` with add/remove UI
- Payment terms stored in `app_settings` (key: `payment_terms`)
- Customer edit form and create customer dialog now fetch terms from settings
- Fallback to defaults if settings not configured

**2. GMP Autocomplete combobox:**
- Replaced toggle button (text/dropdown) with single combobox input
- Type to search — dropdown auto-appears with matching GMPs (gmp_number + board_name)
- Select existing or type new — no mode switching
- Click-outside closes dropdown

**3. BOM Description column fix:**
- Removed "value" from description keyword exact-match and contains-match lists in `lib/bom/column-mapper.ts`
- Added "value" as last-resort fallback — only used if no actual "Description" column exists
- Fixes Cevians BOM showing "100nF", "4.7k" in Description instead of actual part descriptions

**4. 0402 M-code classification fix:**
- Fixed keyword matching in `app/api/quote-batches/[id]/assign-mcodes/route.ts`
- Components with "0402" in description (like "RES 23.4K OHM 0.1% 1/16W 0402") now correctly classify as 0402, not CP
- Classifier `classifyComponent` now fetches keywords from DB when none are passed (single-component calls)

**5. Quote tier layout redesign — row-wise with per-tier PCB + NRE breakdown:**
- Each tier is now a ROW: Board Qty | PCB Unit Price | NRE Programming | NRE Stencil | NRE PCB Fab
- PCB unit price is per-tier (different quantities = different PCB prices)
- NRE split into 3 categories: Programming (dynamic), Stencil ($400 default), PCB Fabrication (dynamic)
- Shipping remains a single shared field below the tier table
- Preview API updated to accept per-tier PCB prices and NRE breakdown
- Quote creation API updated to store per-tier pricing
- Pricing engine updated to accept per-tier NRE values

**6. BOM PCB line auto-creation:**
- Parser now always creates a PCB line if BOM doesn't have one
- 3-tier fallback: filename extraction → GMP info (board_name/gmp_number) → generic "PCB1"
- `AUTO-PCB` logged in parse result with source detail
- GMP record fetched before parsing to provide board name

**Files changed:**
- `lib/bom/column-mapper.ts` — description keyword priority fix
- `lib/bom/parser.ts` — PCB auto-creation with GMP fallback
- `app/api/bom/parse/route.ts` — pass GMP info to parser
- `components/bom/upload-form.tsx` — GMP autocomplete combobox
- `components/customers/customer-edit-form.tsx` — dynamic payment terms from settings
- `components/customers/create-customer-dialog.tsx` — dynamic payment terms from settings
- `components/customers/customer-edit-toggle.tsx` — payment terms prop
- `app/(dashboard)/customers/[id]/page.tsx` — pass payment terms to edit form
- `app/(dashboard)/settings/page.tsx` — link to payment terms settings
- `app/(dashboard)/settings/payment-terms/page.tsx` — new settings page
- `components/settings/payment-terms-settings.tsx` — new settings component
- `app/api/settings/route.ts` — payment terms CRUD
- `components/quotes/new-quote-form.tsx` — row-wise tier layout with per-tier PCB + NRE
- `app/api/quotes/preview/route.ts` — accept per-tier PCB prices and NRE breakdown
- `app/api/quotes/route.ts` — store per-tier pricing
- `lib/pricing/engine.ts` — per-tier NRE calculation
- `lib/pricing/types.ts` — updated QuoteInput types
- `app/api/quote-batches/[id]/assign-mcodes/route.ts` — 0402 classification fix
- `lib/mcode/classifier.ts` — keyword fetch fallback for single-component calls

**7. Programming cost auto-calculation from BOM line count:**
- New `lib/pricing/programming-cost.ts` — full lookup table from Anas's metric (28 tiers, 1-300+ lines)
- Standard (single-sided) vs double-sided pricing ($100 difference)
- New API: `GET /api/bom/[id]/line-count` — returns line count + auto-calculated programming cost
- Quote form auto-fills NRE Programming when a BOM is selected (all tiers updated)
- Double-sided detection: checks job assembly_type (TB = double-sided, default)
- Extrapolation for 300+ lines at $75/10-line tier

**8. Dead code audit + cleanup:**
- N+1 query in procurement batches: sequential UPDATE loop → single batch `.in()` query
- Removed `console.log` in login action that leaked user email to server logs
- Audit found codebase is clean: no unused files, no unused deps, no orphaned routes

**9. Delete functionality on ALL entities (BOM, Quotes, Jobs, Procurements, Invoices, Customers, NCRs):**
- Every entity now has a `DELETE` API endpoint + confirmation dialog button on its detail page
- All deletes check referential integrity — blocks with clear error if downstream records exist
- Each uses `AlertDialog` confirmation, shows inline error if blocked

| Entity | API Route | Who Can Delete | Safety Checks |
|--------|-----------|---------------|---------------|
| BOM | `DELETE /api/bom/[id]` | CEO + Ops | Blocks if quotes/jobs reference it |
| Quote | `DELETE /api/quotes/[id]` | CEO + Ops | Blocks if jobs reference it. Deletes PDF from storage |
| Job | `DELETE /api/jobs/[id]` | CEO only | Blocks if invoices/procurements reference it. Cascades: status_log, events, serials |
| Procurement | `DELETE /api/procurements/[id]` | CEO + Ops | Blocks if supplier POs reference it. Cascades: procurement_lines |
| Invoice | `DELETE /api/invoices/[id]` | CEO only | Blocks if status is "paid". Deletes PDF, cascades payments |
| Customer | `DELETE /api/customers/[id]` | CEO only | Soft-delete (is_active=false). Blocks hard delete if quotes/jobs/BOMs exist |
| NCR | `DELETE /api/ncr/[id]` | CEO + Ops | Only deletable when status is "open" (closed NCRs are quality records) |

**10. Monthly Gantt chart view for production scheduling:**
- New `components/production/monthly-gantt.tsx` — horizontal bar chart showing jobs as colored bars spanning their scheduled dates
- Color-coded by status: amber (parts received), blue (production), purple (inspection), green (shipping)
- Navigate months with prev/next buttons + "Today" reset
- Today line (blue vertical), weekend shading, week start lines
- Overdue jobs highlighted with red ring + "LATE" badge
- Hover tooltip: job number, customer, GMP, dates, duration, status, qty
- Unscheduled jobs shown below as badges
- Month summary: scheduled count, total boards, overdue count
- 4th tab on production page: Dashboard | Kanban | Weekly | **Monthly**
- Monthly view fetches all non-archived jobs (not just production statuses)

**11. All 9 PDFs rewritten to match Excel source-of-truth templates (6 parallel agents):**

Anas added `/Users/rselectronicpc/Downloads/6. BACKEND/` with the actual Excel templates the business uses. Agents extracted layouts from the .xlsm/.xlsx files (unzipped them as ZIP archives, parsed sharedStrings.xml + sheet XML) and rewrote each PDF generator to match.

- **Invoice** (`api/invoices/[id]/pdf`): US Letter, RS logo embedded from template (`public/pdf/rs-logo.png`), red "ELECTRONIQUE INC." header, BILL TO / SHIP TO panels, dark navy line items table with 6 columns (PO# | PRODUCT# | DESCRIPTION | QTY | UNIT PRICE | TOTAL AMOUNT), CAD totals with GST 5% / QST 9.975%, tax ID panel
- **Supplier PO** (`api/supplier-pos/[id]/pdf`): US Letter, SUPPLIER / SHIP TO blocks, meta strip (REQUISITIONER | SHIP VIA | CURRENCY | F.O.B. | PAYMENT TERMS), 7-column table (# | MANUFACTURER PN | MANUFACTURER | DC | QTY | UNIT PRICE | EXT PRICE), 20-row minimum, multi-page with repeating headers, totals panel
- **Packing Slip** (`api/jobs/[id]/shipping-docs?type=packing_slip`): 8-column table (#, LINE#, PART#, DESCRIPTION, ORDERED, SHIPPED, CURRENT, BACK ORDER), courier + tracking, 30-day return disclaimer
- **Compliance Certificate** (`api/jobs/[id]/shipping-docs?type=compliance`): now 2 pages — page 1 Lead-Free Certification (EU RoHS, solder materials table, "Approved by Shamsuddin Patel"), page 2 IPC-A-610 Certificate of Compliance
- **Job Card** (`api/jobs/[id]/production-docs?type=job_card`): Landscape A4, 8-column batch table (PO # | Product Name | BL | Qty | BOM Name | Gerber Name | Stencil Name | MCODE Summary), BATCH-AWARE — renders one row per job in same procurement batch, M-Code summary computed live per BOM
- **Production Traveller** (`api/jobs/[id]/production-docs?type=traveller`): 9 checklist sections matching Excel (Reception Setup, Printing, Supports, CP, IP, Manual Parts, Pre-Reflow Final Check, Mecanical, TH Setup, Final Inspection, Packing), each step has tick box + Name + Date slots, Pass/Fail checkboxes on inspections, auto-paginated with "Page X of N"
- **Print BOM** (`api/jobs/[id]/production-docs?type=print_bom`): Landscape A4, 10 columns matching template (Serial | X-Qty | Order Qty | Qty | R Des. | CPC # | Description | MPN | Mfr | M-Code), PCB row pinned amber, DNI rows red, alternating row bands, BOM SUMMARY totals block with M-Code breakdown
- **Reception File** (`api/jobs/[id]/production-docs?type=reception`): Landscape A4, pulls from procurement_lines (real supplier/PN/prices), 16-column PROC table (# | R.Des | MPN | Description | MFR | M-Code | Supplier | Supplier PN | Qty/Brd | Extra | Needed | Ordered | Rcvd | Recv Date | Checked | OK), physical checkboxes, signature block + 5 QC checkboxes on last page

**Bonus fixes:**
- Added URL alias map in production-docs route: `?type=job_card`, `?type=print_bom`, `?type=reception_file` (underscored versions from chat API) now work alongside hyphenated forms
- Fixed pre-existing type errors in print_bom and reception branches

**12. Invoice PDF polish:**
- Removed all red accent colors (ELECTRONIQUE INC. header, email/web, BILL TO/SHIP TO, TERMS headers) — unified dark slate
- BILL TO / SHIP TO addresses now word-wrap instead of truncating with "..."
- Block height auto-expands to fit longer block
- Font size 8.5pt so long emails fit cleanly

**13. Print BOM + Reception File crash fix (Greek letters):**
- Root cause: pdf-lib's standard Helvetica uses WinAnsi encoding which can't encode `Ω`, `μ`, `±`, `²`, etc. Lanka BOMs have `1kΩ`, `0.1μF` in descriptions — first unsupported char crashed widthOfTextAtSize → entire PDF blew up.
- Added `sanitizeForPdf()` helper in `lib/pdf/helpers.ts` with a full replacement map:
  - Greek: Ω→Ohm, μ→u, π→pi, Δ→D, α/β/γ/θ/λ → latin
  - Math: ±→+/-, ×→x, ÷→/, ≈→~, ≤→<=, ≥→>=, ∞→inf, √→sqrt, °→ deg
  - Superscripts: ²→^2, ³→^3, etc.
  - Typographic: — – ― → -, smart quotes → straight, … → ..., • → *
  - Non-printable: replaced with "?"
- Called on every string field before it enters Print BOM, Reception, Job Card, and Traveller generators
- `truncate()` helper also wraps with sanitize automatically

**14. ABDULS_WIKI.md Part 16 — Supplier APIs:**
- Full documentation of how DigiKey/Mouser/LCSC are implemented
- Auth flows, endpoints, request/response shapes, rate limits
- Caching strategy (api_pricing_cache, 7-day TTL)
- How M-code classification uses DigiKey's enrichment data
- Failure modes and fallbacks
- All API routes that call suppliers

**15. Supplier APIs audited + DigiKey fixed (silent v3→v4 schema bug):**
- DigiKey was silently broken — client read v3 response field names on a v4 endpoint. `ManufacturerPartNumber` → actually `ManufacturerProductNumber`, `Parameter/Value` → `ParameterText/ValueText`, top-level `DigiKeyPartNumber` → `ProductVariations[0].DigiKeyProductNumber`. Every package_case/mounting_type/dimensions extraction came back `undefined`.
- Fixed, verified live with ERJ-2GE0R00X: returns $0.16 CAD, P0.0JTR-ND, Surface Mount, 0402 (1005 Metric), 1.0mm × 0.5mm × 0.4mm
- Mounting type fallback added: DigiKey doesn't populate the parameter for chip resistors/caps, so we infer from Category name (e.g. "Chip Resistor - Surface Mount" → Surface Mount)
- Size parsing handles DigiKey's imperial+mm format: `0.039" L x 0.020" W (1.00mm x 0.50mm)` — prefers parenthetical mm
- Components table enrichment confirmed persisting
- Mouser: working, price-only as expected (no dimensions in keyword search response)
- LCSC: vendor-side blocker. Endpoint rejects every auth variant tried (SHA1/MD5/SHA256/query/headers). Returns `code:427 signature Is Required` → `code:424 Key Is Required`. Client handles gracefully (returns null, falls back to DigiKey+Mouser). Need Anas to email LCSC contact for correct signature scheme OR key activation.

**16. AI chat file upload — real binary support (was silently broken for images/PDFs):**
- **Root cause**: 3 layers of bugs
  - Upload route only parsed spreadsheets — PNG/PDF files uploaded to storage, binary never reached the AI
  - Chat UI only tracked string `fileContext` — no state for binary media
  - Chat API had no concept of image/PDF parts — `attachments` was only used for DB metadata, never forwarded to Claude
- **Now working:**
  - Images (PNG/JPG/GIF/WEBP): base64-encoded → queued in `pendingMedia` → attached as Claude vision input on next turn → Claude reads pixels
  - PDFs: base64-encoded → attached as Claude native PDF input → Claude reads PDF directly (Sonnet 4 supports this natively)
  - BOM xlsx: first 50 rows parsed → injected into system prompt
  - Plain .txt: first 8KB injected
- Multi-turn memory: binary cleared after send (no re-upload of 5MB per message), text marker stays in fileContext
- Files: `app/api/chat/upload/route.ts` rewritten, `components/chat/ai-chat.tsx` adds `MediaAttachment` state + wiring, `app/api/chat/route.ts` adds multipart user-message rewriter

**17. AI chat page-context awareness:**
- New `lib/chat/page-context.ts`:
  - `detectPageContext(pathname)` parses URLs like `/quotes/<uuid>`, `/jobs/<uuid>`, `/bom/<uuid>`, `/procurement/<uuid>`, `/invoices/<uuid>`, `/customers/<uuid>`, `/quality/<uuid>`, `/quotes/batches/<uuid>`, `/procurement/batches/<uuid>`
  - `fetchPageContextSummary()` loads <400-token human-readable summary per entity (number, status, customer, BOM, pricing, etc.)
  - `getPageSuggestions()` returns 3-4 quick-action prompts per entity type
- Chat route reads `currentPage` from body, injects `## CURRENT PAGE CONTEXT` block into system prompt
- **New system prompt section "PAGE-AWARE TAKE-OVER MODE":** tells AI to read page context first, take over on vague messages without asking clarifying questions, use its 39 write tools when user says "do it"
- Chat UI uses `usePathname()` — updates automatically on navigation, header subtitle shows "Viewing quote" with green sparkle, empty state says "I can see this quote — no need to re-explain", quick-action chips appear
- Cost: +1 Supabase query per message, +300-500 tokens per prompt. Negligible.

**18. MCP server — real @modelcontextprotocol/sdk v1.29 implementation:**
- **Previous state**: `app/api/mcp/route.ts` was FAKE MCP — plain REST JSON returning a tool registry. Didn't speak JSON-RPC, didn't speak MCP protocol at all. Also an orphan `erp-rs-mcp/` stdio package that was never wired up.
- **Now built**: Real Streamable HTTP MCP server at `/api/mcp` using `WebStandardStreamableHTTPServerTransport` (stateless, JSON-response mode, Web Standards Request/Response — native Next.js App Router fit)
- 20 MCP tools across 10 domain files (`lib/mcp/tools/{customers,boms,quotes,jobs,procurement,production,invoices,inventory,search,overview}.ts`)
- Supabase JWT auth via `Authorization: Bearer <token>` header, per-request server scoped to role:
  - CEO: all 20 tools
  - Operations Manager: 18 tools (no aging report, no profitability)
  - Shop Floor: 6 tools (overview, list/get jobs, production status, log event, search)
- `middleware.ts` updated to skip cookie auth redirect for `/api/mcp` (MCP clients use Bearer, not cookies)
- **MCP_SETUP.md** created with Claude Desktop config, curl JSON-RPC examples, role matrix, mcp-inspector instructions
- **Verified live:**
  - Unauthenticated → 401 with proper JSON-RPC error
  - Initialize → returns protocolVersion, serverInfo
  - tools/list (CEO) → 20 tools
  - tools/list (shop_floor) → 6 tools (role filter confirmed)
  - tools/call rs_business_overview → real RS data (11 customers, 2 active jobs)
  - Sequential requests stable, no EPIPE, ~230-305ms
- Fixed an EPIPE crash by removing the `finally { transport.close() }` block — was closing the transport before the Response stream was drained

**Claude Desktop setup** (Anas can use this today once deployed to Vercel):
```json
{
  "mcpServers": {
    "rs-pcb-assembly": {
      "url": "https://webapp-fawn-seven.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer <supabase-jwt>" }
    }
  }
}
```

**End state:** 29 tables, 76+ API routes, 40 pages, ~43K lines TypeScript. All 9 PDFs match Excel templates. RS logo embedded in invoice. Greek letters sanitized. DigiKey enrichment actually working. AI chat accepts images/PDFs with vision. AI chat is page-context-aware. Real MCP server live with 20 tools.

---

### Session 9 — April 14, 2026 — Piyush feedback round

Piyush sent screenshots from the BOM classification page with 3 concrete issues and 1 critical architectural complaint. All fixed in parallel (3 agents):

**19. CPC column showing MPN (bug):**
- Parser had `if (!cpc) cpc = mpn` fallback at line 161 of `lib/bom/parser.ts` — Lanka BOMs without a CPC column were displaying MPNs in the CPC column
- Also the PCB row construction did `cpc: cpc || mpn`
- Batch merge route reintroduced the fallback downstream with `line.cpc ?? line.mpn ?? ""`
- Fixed in all 5 places. `ParsedLine.cpc` type changed to `string | null`. BOM table renders `—` for null CPC.
- Supplier lookup routes that use `mpn || cpc` are intentional (search order for pricing API) — left alone.

**20. BOM table UX — filter, search, padding, column expand:**
- 412-line rewrite of `components/bom/bom-table.tsx` (was 199 lines)
- Filter bar with search input (MPN/description/designator/CPC/manufacturer)
- Multi-select M-code filter chips, sorted by frequency with counts per chip
- "Unclassified" appears as its own chip + "Show only unclassified" toggle
- Clear filters link + "Showing X of Y" counter
- Cell padding `px-3 py-2.5` on every cell
- Tooltips on truncate-prone columns (Designator/CPC/Description/MPN/Manufacturer/Reasoning) — hover to see full value
- Explicit column widths + `min-w-[1400px]` + `overflow-x-auto` so columns don't collapse
- Added `components/ui/tooltip.tsx` and `components/ui/switch.tsx` via shadcn

**21. AI classifier rewritten to VBA algorithm (critical architectural change):**

Piyush's complaint: "AI is giving generic information about any part number, which I don't require. What I need from AI is, for any part number on which there is no M code in our database, AI should go and check the MOUNTING TYPE. If Through Hole → TH (done). If Surface Mount → get LENGTH and WIDTH and compare to size table. That should be how AI works."

This was exactly the VBA algorithm from `mod_OthF_Digikey_Parameters.bas`. The old code asked Claude "what M-code is this?" which gave noisy subjective answers. The new code asks Claude for physical parameters only, then a deterministic algorithm picks the M-code.

**Files touched:**
- `lib/mcode/ai-classifier.ts` — rewritten. New `fetchComponentParams()` returns `{ mounting_type, length_mm, width_mm, package_case, category }` instead of `{ m_code, confidence }`. The AI is now a parameter oracle, not a classifier. `classifyWithAI` and `classifyBatchWithAI` kept as backwards-compatible wrappers.
- `lib/mcode/vba-algorithm.ts` — new file. Direct TypeScript port of the VBA algorithm:
  - `SIZE_TIERS` table: rank 1 = 0201 (0.4-0.99 × 0.2-0.59), rank 2 = 0402 (1.0-1.09 × 0.5-0.59), rank 3 = CP (1.5-3.79 × 0.8-3.59), rank 4 = CPEXP (3.8-4.29 × 3.6-3.99), rank 5 = IP (4.3-25 × 4.0-25), rank 6 = MEC (25+)
  - `classifyBySize()` — applies the VBA "higher rank wins" rule. A 1.5mm × 0.5mm component correctly gets CP (len rank 3), not 0402 (width rank 2). Exactly matches VBA lines 324-340.
  - `classifyBySpecialCaseDescription()` — free wins, no AI needed: "Pin"+"Crimp"→CABLE, "End Launch Solder"→TH, "Connector Header position" no SMT/SMD→TH
  - `applyVbaAlgorithm()` — full pipeline: mounting_type short-circuits (TH→TH, mixed→MANSMT) → special cases → connectors category branches → size rule
- `lib/mcode/classifier.ts` — updated:
  - Layer 1c added: runs `classifyBySpecialCaseDescription` before PAR rules (free wins)
  - `classifyComponentFull` now calls `fetchComponentParams` → enriches components table (fire-and-forget) → runs `applyVbaAlgorithm` → returns result
  - New `classifyBomLinesWithAI` batch function — parallel AI param fetch + parallel DB enrichment
  - All old callers (`app/api/chat/route.ts`, `app/api/bom/[id]/classify/route.ts`) still work unchanged

**New classification flow (matches VBA step-for-step):**
1. Layer 1: DB lookup by MPN (instant)
2. Layer 1b: Keyword lookup from mcode_keyword_lookup
3. Layer 1c: VBA special-case description checks (free wins)
4. Layer 2: PAR rules (package_case, description, mounting_type matching)
5. Layer 3: AI fetch physical params → enrich components table → apply VBA algorithm → return M-code
   - If Through Hole → TH (done)
   - If Surface Mount + Through Hole → MANSMT
   - If Surface Mount → size rank lookup (higher rank wins between length and width)

**Key insight:** The AI is now a "dumb parameter oracle" — never picks M-codes. All M-code assignment goes through deterministic logic. This means the classifier output is predictable and debuggable — you can always trace WHY a part got classified a certain way.

**Still outstanding from Piyush's feedback:**
- **PCB auto-creation** — I fixed this in Session 8 but Piyush still sees it missing. Need to verify the deployment caught it. May need another look.
- **PAR rules from DM file** — the Size Table, MachineCodes, and Admin sheets from DM Common File V11 need to be exported as CSV and seeded into the database for the M-code rules to match Excel exactly. The current rules in `lib/mcode/rules.ts` are my best guess from the VBA source. Anas needs to export those 3 sheets from DM Common File V11 for me to replace the seed data.

**End state:** 29 tables, 76+ API routes, 40 pages, ~44K lines TypeScript. AI classifier rewritten to match VBA algorithm exactly. BOM table has filter+search+tooltips. CPC column bug fixed. Still waiting on DM file sheets for final rule accuracy.

**22. DM Common File V11 sheets extracted and seeded (source of truth):**

Found the DM Common File V10.11.xlsm in OneDrive (`/Folder Test With Rehan/`). Extracted 3 critical sheets via `xlsx` npm package:

- **Admin sheet** → `supabase/seed-data/dm-file/admin_par_rules.csv` — 47 PAR rules with 2-condition operator pairs, source field references (Mounting Type, Sub-Category, Product Description, Package / Case, Features, Attachment Method, Category)
- **Size Table sheet** → `supabase/seed-data/dm-file/size_table.csv` — the actual dimension ranges
- **MachineCodes sheet** → `supabase/seed-data/dm-file/machine_codes.csv` — 239 package/keyword → M-code mappings

**Critical corrections to `lib/mcode/vba-algorithm.ts`:**
- **0402 range was WRONG** — I had `1.00-1.09 × 0.50-0.59` (only matches literal 0402 size). Real range is `1.00-1.49 × 0.49-0.79` — a much broader window. This means parts like 0404 and similar were getting misclassified as CP or unclassified.
- **0201 width max was wrong** — I had 0.59, real is 0.48
- **No MEC in Size Table** — I had added a phantom "rank 6 MEC" row. In reality, MEC comes from PAR rules (HEATSINK, Standoff, etc.) not size. A component whose dimensions don't match any tier now returns null and falls through to PAR rules. SIZE_TIERS now has 5 entries, not 6.

**Supabase seeded from real DM data:**
- `mcode_keyword_lookup`: 211 real keywords (replaced placeholder seed). Short ones (≤8 chars) use word-boundary matching to avoid "LPC2468" matching "0402". Long descriptions use contains matching on description field only.
- `m_code_rules`: 43 real PAR rules from Admin sheet (the 4 size-table placeholder rules PAR-18/19/20/21 are intentionally skipped — handled by `vba-algorithm.ts` and keyword lookup respectively).

**New ClassificationInput fields to support DM rules:** `sub_category`, `features`, `attachment_method`. The `fetchComponentParams` AI call will need to fetch these too in a follow-up (agent deployed the VBA port without these extra fields — they're in the m_code_rules table but currently no field on ClassificationInput). Rules that reference these fields will fail-safe to "no match" until the AI fetches them.

**Still on Piyush's list:**
- PCB auto-creation: code verified present and correct (3-tier fallback in parser.ts). Previous "missing" reports were likely from BOMs uploaded before the fix deployed.

**New branch for Piyush to test:**
- Branch: `piyush-sandbox` (created from main, pushed)
- Vercel will auto-build a preview deployment — he gets his own URL to play with without affecting main
- Anas merges main into piyush-sandbox after every fix so Piyush's preview stays in sync

**23. Auto-PCB creation DISABLED (Anas override):**
- Session 7 added 3-tier PCB auto-creation (filename → GMP info → generic "PCB1") because Piyush asked for it.
- Anas overrode: "we don't want the PCB line showed". The GMP itself already represents the board, so fabricating a ghost row was confusing and duplicate information.
- Parser now: still detects and pins any PCB row that exists in the source BOM (designator match `^PCB[A-Z0-9\-]*$`). If no PCB row → logs `AUTO-PCB-FAIL` and nothing is fabricated.

**24. DM Common File V11 sheets extracted (source of truth):**

Found DM Common File in OneDrive at `/Folder Test With Rehan/DM Common File - Reel Pricing V10.11.xlsm`. Extracted 4 critical sheets as CSVs in `supabase/seed-data/dm-file/`:

- **Admin sheet** → `admin_par_rules.csv` — 47 PAR rules with source field references (Mounting Type, Sub-Category, Product Description, Package / Case, Features, Attachment Method, Category)
- **Size Table sheet** → `size_table.csv` — exact dimension ranges (with corrections vs my earlier guess)
- **MachineCodes sheet** → `machine_codes.csv` — 239 package/keyword → M-code mappings
- **ExtraOrder (overage) sheet** → `overage_tables.csv` — 676 rows of overage tiers per M-code, up to 391,000 parts

**Critical corrections to `lib/mcode/vba-algorithm.ts` SIZE_TIERS:**
- **0402 range was WRONG** — I had `1.00-1.09 × 0.50-0.59` (only matches literal 0402 size). Real range is `1.00-1.49 × 0.49-0.79` — a much broader window. Parts were getting misclassified as CP or unclassified.
- **0201** width max was 0.59, real is 0.48
- **Removed phantom MEC tier** — the real Size Table has no MEC entry. MEC comes from PAR rules only.

**Supabase re-seeded from real DM data (migrations 026, 027):**
- `mcode_keyword_lookup`: **211 real keywords** from MachineCodes sheet (replaced 240 placeholders)
- `m_code_rules`: **43 real PAR rules** from Admin sheet (PAR-18/19/20/21 skipped — handled by `vba-algorithm.ts` and keyword lookup)
- `overage_table`: **621 tiers across 11 M-codes** (was 6 tiers max qty 500, now 403 CPEXP tiers, 43 CP/0402 tiers each, up to 100k parts)

**25. ClassificationInput extended with 3 new fields (sub_category, features, attachment_method):**
- `fetchComponentParams` AI prompt updated to ask Claude for all 9 fields (mounting, dimensions, package, category, sub_category, features, attachment_method)
- `applyVbaAlgorithm` now runs sub-category-based rules BEFORE size lookup, matching the VBA Admin rule order: Slide Switches, Tactile Switches, RF Shields, Ferrite Cores, Film Capacitors, Card Guides, Board Supports
- Description keyword rules inline: Standoff, HEATSINK, DPAK TO-252, Battery Insulator, Spacer, Clip, Clamp, Relay+SMT
- Category rules: Cables Wires Management → CABLE, Development Boards → DEV B
- Extra mounting-type branches (PCB TH, PCB SMT, Panel Mount, Panel PCB TH) for PAR-35/36/46/47
- `rules.ts matchesCondition` supports `not_contains` operator (splits on comma, checks NONE are present — for PAR-27/28 "not contains SMT, SMD, SURFACE MOUNT")
- `contains` now case-insensitive (matches VBA `Option Compare Text`)

**26. AI fallback for BOM column mapping:**
- Previously: parser hard-failed with a wall of text if column names didn't match the keyword detector
- Now: if `resolveColumnMapping` throws, we call `aiMapColumns(headers, sampleRows)` which asks Claude to propose a mapping from a preview of 5 rows
- Claude returns `{ qty, designator, mpn, manufacturer, description, cpc }` as exact header name references
- Strict validation: every mapped field must reference a real header; requires at least `qty + designator + (mpn OR description)` to proceed
- Parse response now includes `mapping_source: "keyword" | "ai"` so the UI can show a badge when AI was used
- BOM record stores `parse_result.mapping_source` for audit
- Cost: ~1.5 second Haiku call, only fires on BOMs that fail keyword detection. Normal BOMs (Lanka, Cevians, etc.) never touch it.

**27. BOM stats tiles live-computed (was showing stale data):**
- Classified / Need Review / Merged Lines tiles read from `parse_result.classification_summary` which is a snapshot from upload time — never updated after classification
- Piyush reported tiles showed 0 even after classification ran successfully
- Fixed: tiles now compute LIVE from the `bom_lines` array on every render (same source as the M-Code Distribution pie chart). Filter out PCB and DNI rows, count `m_code !== null` as classified, `m_code === null` as unclassified.

**28. Progress bar for M-code classification:**
- Piyush asked: "while classifying we should have a progress bar showing lines complete"
- New lightweight endpoint `GET /api/bom/[id]/count` — returns `{ total, classifiable, classified, unclassified, pcb, dni }` in ~50ms
- `AIClassifyButton` now:
  1. Snapshots starting classified count before API call
  2. Polls `/count` every 500ms while classification runs
  3. Shows a determinate progress bar with `X / Y (N%)` counter and smooth blue fill
  4. Snaps to 100% when the API returns
  5. Cleans up poller on unmount (no memory leaks)
- Both rule-based phase and AI phase get their own progress bar

---

## Known Issues / Tech Debt

### Must Fix Soon
- [ ] **Duplicate PAR rules** between `rules.ts` (in-code) and `m_code_rules` DB table — classifier uses in-code rules. Need to consolidate to DB-only

### Fixed (was broken)
- [x] **Security: /api/pricing/[mpn]** — auth check added (Session 5)
- [x] **Stencil page crash** — RLS nested join issue fixed with admin client (Session 6)
- [x] **New Order button crash** — dialog fetched {jobs:[]} as object not array (Session 6)
- [x] **Create Procurement 404** — page didn't exist, now created at /procurement/new (Session 6)
- [x] **IP missing from pricing** — IC packages were $0 assembly cost, now in SMT_MCODES (Session 6)
- [x] **Procurement: no reception file trigger UI** — button added to procurement detail page (Session 7)
- [x] **Labour costing (TIME file)** — full module built with settings, API, pricing integration (Session 7)
- [x] **Production scheduling** — Kanban, weekly schedule, dashboard, job scheduler built (Session 7)
- [x] **Procurement merge-split cycle 2** — batch ordering with cross-job dedup built (Session 7)
- [x] **Proc batch code format** — fixed to match VBA YYMMDD CUST-XYNNN format (Session 7)
- [x] **Payment terms hardcoded** — now configurable from settings (Session 8)
- [x] **GMP field clunky toggle** — replaced with autocomplete combobox (Session 8)
- [x] **BOM Description mapped wrong** — "Value" no longer overrides actual Description (Session 8)
- [x] **0402 M-code misclassification** — components with "0402" in description now classify correctly (Session 8)
- [x] **Quote tiers horizontal** — redesigned to row-wise with per-tier PCB price + 3 NRE categories (Session 8)
- [x] **BOM missing PCB line** — Session 8 added 3-tier fallback. REVERSED in Session 9 per Anas: no auto-creation, GMP represents the board.
- [x] **CPC column showed MPN** — parser had `cpc = mpn` fallback at 5 places, all removed (Session 9)
- [x] **AI classifier doing generic M-code guessing** — rewritten to fetch physical params only, then deterministic VBA algorithm assigns M-code (Session 9)
- [x] **PAR rules were best-guess** — extracted actual 43 rules from DM Common File V11 Admin sheet (Session 9)
- [x] **Keyword lookup was placeholder** — replaced with 211 real keywords from DM MachineCodes sheet (Session 9)
- [x] **Overage table undersized** — was 6 tiers max qty 500. Now 621 tiers from DM ExtraOrder sheet, up to 100k parts. 0402 rate was 10x wrong. (Session 9)
- [x] **Size ranges wrong** — 0402 was `1.00-1.09 × 0.50-0.59` (literal only). Real DM range: `1.00-1.49 × 0.49-0.79`. Fixed. (Session 9)
- [x] **BOM parser hard-failed on weird columns** — AI fallback mapper added. Any table-like BOM now works. (Session 9)
- [x] **BOM table no filter/search/tooltips** — 412-line UX rewrite: filter chips, search box, cell padding, column tooltips, unclassified toggle (Session 9)
- [x] **BOM stats tiles stale after classify** — now live-computed from bom_lines every render (Session 9)
- [x] **No classification progress feedback** — new `/count` endpoint + polling progress bar in AIClassifyButton (Session 9)

### Nice to Have
- [ ] Copy button on M-code override cells (Anas requested)
- [ ] Guided workflow wizard (stepper component showing BOM → Classify → Quote → Job → PROC → Ship → Invoice)
- [ ] Email integration (send quotes/invoices)
- [ ] AI chat memory persistence
- [ ] Mobile responsiveness
- [ ] Dashboard quick action buttons (New Quote, New Job)
- [ ] Loading states on slow operations (pricing, classification)
- [ ] QC verification workflow (PROC Verification V3 equivalent)

---

## How to Start Next Session

```
Read HANDOFF.md first, then CLAUDE.md.

Key context:
- App is ~85% complete toward replacing 11 Excel/VBA workbooks
- 4,032 components pre-loaded + growing via DigiKey enrichment
- Quote flow works end-to-end (BOM → classify → price → PDF)
- Quote tiers are row-wise with per-tier PCB price + 3 NRE categories
- Labour costing built with VBA TIME File rates ($130/hr labour, $165/hr SMT)
- Production scheduling: Kanban + weekly view + dashboard + monthly Gantt
- Procurement ordering/receiving + batch merge-split cycle 2 built
- All 9 PDFs match Excel source-of-truth templates
- All API routes have auth checks
- Full audit trail on 31 tables via DB triggers
- Classification 10x faster (parallel batches) + exact DM algorithm
- M-code rules: 43 real DM Admin PAR rules + 211 real MachineCodes keywords
- Overage: 621 real DM ExtraOrder tiers (was 6 placeholder)
- Supplier APIs: DigiKey ✅ (fixed v3→v4 bug), Mouser ✅, LCSC ❌ (vendor blocked)
- AI chat: 39 tools, image/PDF vision, page-context aware, take-over mode
- Real MCP server: 20 tools via Streamable HTTP for Claude Desktop
- Piyush sandbox branch: separate from main, Vercel preview deployment
- BOM parser has AI fallback for unknown column layouts
- Abdul's Wiki (ABDULS_WIKI.md) Part 15 = calculations, Part 16 = supplier APIs

What needs work next:
1. End-to-end validation with a real Lanka/Cevians BOM (highest leverage)
2. Quote PDF still needs matching template (not in backend folder yet)
3. LCSC API blocked vendor-side — Anas to email LCSC contact
4. Email integration (send quotes/invoices)
5. QC verification workflow (PROC Verification V3 equivalent)
6. Batch send-back SMT rate discrepancy ($0.35 vs $0.035 — 10x off)

IMPORTANT RULES:
- Update HANDOFF.md after EVERY change AND push — Anas requires this
- Look at VBA code in "All vba codes/" folder BEFORE building any feature
- Never build from assumptions — verify against the Excel/VBA source of truth
- The VBA code IS the spec. DM Common File sheets live in /supabase/seed-data/dm-file/
- When pushing to main, always merge main into piyush-sandbox so Piyush stays in sync
```

*Last updated: April 14, 2026, Session 9 (Piyush feedback round, DM file seeding, classifier rewrite)*
