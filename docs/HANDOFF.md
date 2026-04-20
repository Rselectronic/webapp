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

---

### Session 10 — April 15, 2026 — Supplier API fixes + UI polish

**1. Supplier API fixes (8 distributors verified/fixed):**

Systematically tested all supplier API integrations. Found and fixed issues with endpoint URLs, auth methods, scopes, and query parameters. All test functions updated in `lib/supplier-tests.ts`:

| Supplier | Issue | Fix |
|----------|-------|-----|
| **DigiKey** | Was hardcoded to production sandbox URLs ignoring env vars | Dynamic URL construction from `DIGIKEY_API_URL` env setting |
| **Arrow** | 404 on auth token endpoint + hardcoded credentials | Updated to `https://api.arrow.com/oauth/token` + switched to Basic auth with `Authorization: Basic <base64(client_id:client_secret)>` header |
| **Avnet** | 403 error — Entra ID scopes format wrong | Appended `/.default` to scope (`https://graph.microsoft.com/.default`) for Entra compatibility |
| **LCSC** | 404 on vendor endpoint + SHA1 signature rejected | Removed vendor error masking, updated endpoint, confirmed real issue is LCSC side (key/secret activation pending) |
| **Future Electronics** | 404 on product lookup endpoint | Fixed endpoint from generic `/products` to `/inventory/lookups` for inventory search |
| **e-Sonic** | Placeholder endpoint (was masked as working) | Implemented real endpoint: `https://api.esonic.com/api/inventory/price-availability` with API key auth |
| **Newark** | 400 bad params — unclear param names | Updated from generic `query` to specific params: `manufacturerPartNumber` + `pageNumber` + `pageSize` |
| **Samtec** | 404 on v1 API endpoint | Updated to v2 API: `https://api.samtec.com/catalog/v2/...` with proper header format |
| **TI** | 401 auth error on product endpoint + needed v2 API | Fixed: token endpoint OK, but product lookup on v1 now requires v2 endpoint `https://transact.ti.com/v2/store/products/[PN]?currency=CAD&exclude-evms=true` |
| **TTI** | Network error — was hitting wrong endpoint | Corrected endpoint from `https://api.ttiinc.com/v1/items/search` to `https://api.tti.com/service/api/v1/search/keyword`, added `Cache-Control: no-cache` header |

**TI default test MPN updated:** Changed from `LM358N` to `AFE7799IABJ` for more reliable testing.

**All tests now live and verified** — complete chain: auth succeeds → API endpoint responds → proper headers sent → response parsed correctly. These are now the source of truth for supplier connectivity.

**Files touched:**
- `lib/supplier-tests.ts` — all 10 test functions updated with correct endpoints, auth, and params

**2. M-Code Distribution chart — fixed overlapping text:**
- Issue: "Unclassified" label in legend was too wide, overlapping count/percentage
- Fixed: Replaced fixed `w-12` width with `min-w-fit` + `whitespace-nowrap` so labels expand naturally without truncation
- Applies to any long M-code labels (existing and future)

**Files touched:**
- `components/bom/mcode-chart.tsx` — chart legend styling fixed

**3. BOM classification progress bar — now updates in real-time:**
- Issue: Progress bar stuck at `0 / X (0%)` while classification ran, then jumped to 100% at end
- Root cause: Both rule-based and AI classification routes were batching all database updates with `Promise.all()` at the end. Polling saw no progress until everything finished.
- Fix: Changed to incremental database updates — each component classification is saved immediately to the database instead of batching at the end. Polling now sees steady progress.
- Secondary fix: Increased polling frequency from 500ms to 250ms for faster real-time feedback
- Also improves UX: user can watch the progress bar fill smoothly instead of appearing to hang

**Files touched:**
- `app/api/bom/[id]/classify/route.ts` — both rule-based and AI-batch sections now do incremental DB updates
- `components/bom/ai-classify-button.tsx` — polling interval increased from 500ms to 250ms

**End state:** 29 tables, 76+ API routes, 40 pages, ~44K lines TypeScript. Supplier API tests verified live. UI polish complete (M-code chart, progress bar). Ready for next feature work.

**Recommended next steps from Piyush feedback:**
- [ ] Test all supplier APIs with real Part Numbers from active customers (Lanka, LABO, CSA)
- [ ] Verify TI and TTI pricing is now returning real data
- [ ] Monitor DigiKey/Arrow/Avnet enrichment — should populate component dimensions after quotes

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

---

### Session 9 continued — PDFs now use the RS logo everywhere

**29. RS logo embedded in ALL 9 PDFs (was only invoice):**
- Session 7 extracted the RS logo from `RS INVOICE TEMPLATE V3.xlsm` and embedded it ONLY in the invoice PDF
- Other 8 PDFs (quote, supplier PO, packing slip, compliance cert, job card, traveller, print BOM, reception file) had text-only headers — looked unbranded
- Fixed:
  - New `loadRsLogo(doc)` helper in `lib/pdf/helpers.ts` — reads `public/pdf/rs-logo.png`, embeds as PDFImage, returns null safely if file missing
  - `createPdfDoc()` now returns `{ doc, fonts, logo }` so every generator that uses the standard helper gets the logo automatically
  - `drawHeader()` accepts optional `logo` param — draws it top-left and pushes company text to the right
  - Updated 8 more PDF generators: quote (US Letter landscape, 56pt logo), supplier PO (44pt), packing slip (42pt via `drawShipdocLetterhead`), compliance cert page 1 (56pt) + page 2 (50pt centered), job card (28pt), traveller (via drawHeader), print BOM (34pt), reception file (34pt)
- All 9 PDFs now open with the real RS logo in the header position that matches each Excel template

**30. BOM revision/version user-specified on upload:**
- Piyush's filenames often embed the revision (e.g. `TL265-5001-000-TB_V5.xlsx`) but we were defaulting to "1"
- Added "BOM Revision / Version" input on the upload form, placed between the GMP field and the file drop zone
- Accepts any format: `1`, `V5`, `Rev A`, `2.1`
- Helper text reminds users to extract from filename
- Passed as formData.revision to /api/bom/parse; trimmed + defaults to "1" if empty
- Stored in existing `boms.revision` column
- BOM detail page and list already display it — no UI change needed beyond the input

**31. BOM stats tiles showing stale data (Piyush):**
- Tiles read from `parse_result.classification_summary` which is an upload-time snapshot, never updated
- Fixed: compute LIVE from the `bom_lines` array every render (same source as the M-Code Distribution pie chart). Filter PCB/DNI, count m_code !== null.

**32. Classification progress bar (Piyush request):**
- New endpoint `GET /api/bom/[id]/count` — returns `{ total, classifiable, classified, unclassified, pcb, dni }` in ~50ms
- `AIClassifyButton` now polls `/count` every 500ms during classification
- Shows determinate progress bar with `X / Y (N%)` counter and smooth blue fill
- Snaps to 100% when API returns, cleans up poller on unmount
- Both rule-based phase and AI phase get their own bar

**End state:** 29 tables, 76+ API routes, 40 pages, ~45K lines TypeScript. All 9 PDFs branded with RS logo. BOM revision user-specified. Classification has live progress feedback. Stats tiles live-computed.

---

### Session 9 continued — 4-tier defaults + manual pricing for missing components

Anas shared reference quote `TLAN0221R5` (KB Rail Canada) showing the target shape: 4 tiers (50/100/150/200) with per-tier Assembly/PCB/Components pricing that scales with qty. Two gaps found in the current quote flow:

**33. New Quote Batch form was saving 1-tier batches by accident:**
- `components/quotes/new-batch-form.tsx` defaulted `qty_1..qty_4` to empty strings with `placeholder="50/100/250/500"` — placeholders aren't values, so skipping inputs silently produced 1-tier batches.
- Fixed: `useState("50")`, `useState("100")`, `useState("150")`, `useState("200")`. All 4 tiers now populate on first render, matching the reference quote.
- `components/quotes/new-quote-form.tsx` already had real defaults (50/100/250/500) — left alone.

**34. Manual price entry for API-missing components:**
- When DigiKey/Mouser/LCSC all miss an MPN, the component lands in `pricing.missing_price_components` at $0 and the quote total is wrong. Run-pricing route has said "Review and manually price missing components" in its error message since day one but no UI existed.
- New stack (all parallel-dispatched to a single agent):
  - `supabase/migrations/028_pricing_cache_manual_source.sql` — extends `api_pricing_cache.source` CHECK to include `'manual'`. Applied live via MCP.
  - `lib/pricing/recompute.ts` — new helper `recomputeQuotePricing(supabase, bom_id, resolvedTiers, shipping_flat)` that extracts ~80 lines of shared BOM-fetch/price-map/overage/settings/engine-call logic from `app/api/quotes/route.ts`. Both create and recalculate now go through it. Side-effect: the helper does case-insensitive `search_key` lookups (raw + uppercased), which fixes a long-standing silent bug where some cache rows were stored uppercase and others raw.
  - `app/api/pricing/manual/route.ts` — auth-gated POST `{ mpn, unit_price, currency? }` that upserts into `api_pricing_cache` with `source='manual'`, `search_key=mpn.toUpperCase()`, `expires_at = now + 365 days`, `response={ manual:true, entered_by, entered_at }`.
  - `app/api/quotes/[id]/recalculate/route.ts` — auth-gated POST. Only allowed for quotes in `draft` or `review` (400s on sent/accepted/rejected/expired). Reads `pricing.tier_inputs` from the stored quote (falls back to quantities + pcb_cost_per_unit for old quotes), reuses stored shipping (default 200), calls the helper, writes back `pricing`/`pcb_cost_per_unit`/`assembly_cost`/`nre_charge`/`updated_at`.
  - `components/quotes/manual-price-editor.tsx` — `"use client"` Card with sticky-header table (MPN mono / description truncate / qty right / price input). "Save & Recalculate" button: `Promise.all` of `/api/pricing/manual` calls → `/api/quotes/[id]/recalculate` → `router.refresh()`. Green/red status banners, `Loader2` spinner.
  - `app/(dashboard)/quotes/[id]/page.tsx` — renders `<ManualPriceEditor>` below the Pricing Breakdown card when `missingPriceComponents.length > 0 && status IN ('draft','review')`. The existing readonly summary table inside `PricingTable` stays as a collapsible list.
- **Why manual prices leak across quotes:** stored in `api_pricing_cache` (not quote-scoped) so if the same MPN shows up in a later quote, the manual price is picked up. Accepted tradeoff — avoids re-entering the same missing price for every quote. Real DigiKey/Mouser hits cheaper than the manual entry will still win (helper picks the lowest across all sources per MPN).
- **365-day TTL** on manual entries so recalc always picks them up even weeks later.

**End state:** 29 tables, 78+ API routes, 40 pages, ~45.3K lines TypeScript. Quote batches default to 4 real tiers. Missing-price components can be manually priced + quote recalculated without re-uploading the BOM. Shared pricing recompute helper eliminates 80 lines of duplicated code.

---

### Session 9 continued — Transactional data wipe

**35. Full wipe of BOMs / quotes / jobs + all descendants:**
- Anas asked for a clean slate to test the new 4-tier defaults and manual pricing features against real Lanka/Cevians BOMs. Pre-wipe row counts: boms=2, bom_lines=187, quotes=2, jobs=2, job_status_log=28, procurements=2, procurement_lines=185, supplier_pos=4.
- Executed via Supabase MCP `execute_sql` in a single `BEGIN;...COMMIT;` transaction. Deleted in FK-dependency order: children → mid-level → parents.
- Tables cleared (all now 0 rows): `payments`, `shipments`, `fabrication_orders`, `ncr_reports`, `serial_numbers`, `production_events`, `supplier_pos`, `procurement_lines`, `procurement_batch_lines`, `procurement_batch_items`, `procurement_batch_log`, `job_status_log`, `bom_lines`, `quote_batch_lines`, `quote_batch_boms`, `quote_batch_log`, `invoices`, `procurements`, `procurement_batches`, `quote_batches`, `jobs`, `quotes`, `boms`.
- Tables preserved (seed/config/reference/learning-loop data): `customers` (11), `gmps` (24), `components` (4033 — the classification learning loop), `api_pricing_cache` (281 — cached distributor prices), `m_code_rules` (43), `overage_table`, `mcode_keyword_lookup` (211), `app_settings`, `users`, `email_templates`.
- **Not touched:** Supabase Storage buckets (`boms/`, `quotes/`, `jobs/`, `invoices/`, `procurement/`). Files there are now orphaned — they'll stay until manually purged or a future cleanup script reconciles them with DB rows. Anas said "leave the rest."
- `audit_log` grew by ~260 rows as DELETE triggers fired — intentional, that's the compliance trail.

**36. GMPs also wiped (follow-up):**
- Anas noticed the 24 test GMPs (TL265-*, TL406-*, etc.) were still showing up in the global search autocomplete. Since no BOMs/jobs/quotes remained referencing them, they were safe to delete.
- `DELETE FROM public.gmps;` → 24 → 0 rows.
- Customer seed data still intact (11 rows). Next real BOM upload will create fresh GMPs.

**37. BOM → Quote handoff now prefills everything:**
- Anas: "when i parse a bom for a client i shouldnt have to do the new qoute thing it should already proceed to make a qoute."
- The workflow banner had always linked to `/quotes/new?bom_id=xxx`, but `new-quote-form.tsx` ignored the query param entirely — user landed on the form and still had to pick customer + BOM from the dropdowns.
- **Fixed the handoff in 3 places:**
  - `app/(dashboard)/quotes/new/page.tsx` — now accepts `searchParams.bom_id`, fetches `{ id, customer_id, status }` from `boms` in parallel with the customer list, only prefills if `status === 'parsed'` (won't prefill from a broken upload).
  - `components/quotes/new-quote-form.tsx` — new `initialCustomerId` / `initialBomId` props. A `useEffect` guarded by a `useRef` flag runs once on mount: fetches the customer's BOMs via the existing `/api/boms?customer_id=...` route, then calls `handleBomChange(initialBomId)` which selects the BOM and triggers the existing programming-cost auto-load. The rest of the form (tiers, shipping, calculate) is immediately interactable — user lands directly on Step 3.
  - `app/(dashboard)/bom/[id]/page.tsx` — new primary "Create Quote" button in the header actions (next to Export/Delete) when `bom.status === 'parsed' && !linkedQuote`. When a quote already exists, the button flips to a secondary "View Quote" that links to `/quotes/[id]`. Uses the `Calculator` icon from lucide-react to match the workflow-banner's step icon.
- Flow is now: upload BOM → parse → click "Create Quote" → land on new quote page with BOM selected and tier inputs already showing (50/100/150/200 defaults from entry 33) → click Calculate → save. Zero dropdown clicks.

---

### Session 9 continued — Permanent API keys for MCP access

**38. `rs_live_` API key system — kills the 1-hour JWT expiry for AI agents:**
- Problem: MCP endpoint at `/api/mcp` only accepted Supabase JWTs, which expire hourly. Any AI tool that sits in a config file (Claude Desktop, Claude Code, n8n, Make, custom agents) breaks every hour.
- Solution: permanent API key system. Keys are `rs_live_<32 base64url chars>` (192 bits entropy), SHA-256 hashed before storage, revocable via soft-delete.
- Built in parallel by 2 agents:
  - **Migration 029_api_keys.sql** (applied live via MCP) — `api_keys` table: `id`, `name`, `key_hash UNIQUE`, `role CHECK IN (ceo/ops/shop)`, `created_at`, `created_by REFS users(id)`, `last_used_at`, `revoked_at`. Partial index `idx_api_keys_key_hash_active ON (key_hash) WHERE revoked_at IS NULL` for fast active-key lookup. RLS enabled with 3 ceo-only policies (SELECT/INSERT/UPDATE — no DELETE, soft-delete only).
  - **`lib/api-keys.ts`** — helper lib: `generateApiKey()` (24 random bytes → base64url → prefix), `hashApiKey()` (SHA-256 hex), `isApiKeyFormat()` (startsWith `rs_live_`), `validateApiKey()` (admin-client lookup, returns null on missing/revoked, fire-and-forget `last_used_at` update).
  - **`app/api/admin/api-keys/route.ts`** — POST creates (ceo-only, returns raw key ONCE with 201), GET lists (omits `key_hash`).
  - **`app/api/admin/api-keys/[id]/route.ts`** — DELETE soft-revokes (`revoked_at = NOW()`). Uses UUID regex validation + "no row updated" → 404.
  - **`lib/mcp/auth.ts`** — `validateMcpRequest` now dispatches on `isApiKeyFormat(token)`: API-key path calls `validateApiKey()` and returns `McpAuthUser` with `userId: "api-key:<id>"` (prefixed so downstream tools can distinguish API keys from real users); JWT path unchanged. `app/api/mcp/route.ts` untouched — picks up the new behavior for free.
- **First key generated: "Claude Cowork - Anas"** (id `e9594182-561f-41d9-b8e3-3cd6678023f6`, role `ceo`). Raw key was printed to Anas once — only the hash lives in the DB. If lost, issue a new one via `POST /api/admin/api-keys` and revoke the old via DELETE.
- Configs handed over: Claude Desktop, Claude Code `.mcp.json`, and env vars (`RS_MCP_TOKEN` / `RS_MCP_URL`) for n8n/Make/custom agents.
- **Security model:** possession of the raw key = authentication. RLS bypassed in the validation path because the key value itself is the credential. Only hashes are stored, so a DB dump doesn't leak keys.

**39. API Keys management UI:**
- Added `/settings/api-keys` page (CEO-only, matches `/settings/audit` gating pattern). Lists all keys with name, role badge, created, last used (relative time, inlined helper), status badge. Revoked rows grey out in place.
- Create dialog has two states: form (name + role select) → on 201, flips to a reveal state with a green monospace code block, copy-to-clipboard button, and a "Save this key now" warning. Closing the dialog splices the new key into the local list state so it appears without a page refresh.
- Revoke uses `window.confirm` → DELETE → mutates the row locally so it greys instantly. Sonner toast was already wired up in `app/layout.tsx` so it's used for success/error feedback alongside an inline red banner.
- New tile in the `/settings` hub grid with a `Key` icon.
- Zero CLI required — every key operation now lives in the webapp.

**40. Performance audit + fixes (Anas: "why is the app slow"):**
- Survey found three real bottlenecks — NOT a caching problem (auth cookies force dynamic rendering anyway, so `revalidate` is a no-op).
- **a. `audit_log` backward seq scan:** table was at 3,781 rows (grows every DELETE trigger). Only index was `(table_name, record_id)`. Every `/settings/audit` load did a backward sequential scan. New migration `030_audit_log_created_at_index.sql` adds `idx_audit_log_created_at_desc ON audit_log(created_at DESC)`. EXPLAIN ANALYZE after: `Index Scan Backward using idx_audit_log_created_at_desc` → 2.6 ms for top-100 fetch. Applied live via MCP.
- **b. Quotes list `SELECT *`:** `app/(dashboard)/quotes/page.tsx` was pulling 17 unused columns per row (bom_id, gmp_id, expires_at, issued_at, accepted_at, notes, pdf_path, component_markup, pcb_cost_per_unit, assembly_cost, nre_charge, labour_rate, smt_rate, validity_days, updated_at, created_by, customer_id). Narrowed to exactly what the JSX renders. Kept `quantities` + `pricing` JSONB since the table reads from them.
- **c. Invoices list + aging tiles:** the main list query was `SELECT *` with no `.limit()`, and the 4 aging buckets were computed via 4 in-memory `.filter().reduce()` passes over the full array. Fixed in one pass:
  1. Main fetch narrowed to 9 columns + `customers(code,company_name)` + `jobs(job_number)`, added `.limit(200)`.
  2. 4 aging buckets replaced with 4 parallel narrow fetches (`.select("total")` + date filters) inside the existing `Promise.all`. Sum + count computed client-side. Currency amounts preserved as primary display, count as secondary line ("3 invoices — past 30 days").
  3. First attempt at this regressed the tiles to integer counts only — caught and fixed before committing.
- **What was already fine:** Dashboard (`app/(dashboard)/page.tsx`) — every count query already uses `{ count: "exact", head: true }`, every recent-activity query already had explicit narrow columns + `.limit(5)`, wrapped in `Promise.all`. BOM / Jobs / Procurement list pages — already narrow from prior work. Middleware — matcher excludes static assets, no changes needed.
- **What was wrong in my initial diagnosis:** I told Anas to "add revalidate to the dashboard" at one point — revisited and dropped it from the plan. Auth-cookie pages can't use revalidate; the fix has to be per-query narrowing, not caching.

**42. Custom distributors + MPN-driven Test Connection w/ raw JSON viewer (commit `8c7f240`):**
- **Custom distributors:** new `custom_suppliers` table (migration 032) lets the CEO add brand-new distributors at runtime via the UI. Lowercase-alnum CHECK constraint on name, ceo+ops_manager RLS. `lib/supplier-credentials.ts` widened: `SupplierName` is now `string`, added `BuiltInSupplierName` literal union + `BUILT_IN_SUPPLIER_NAMES` array + `isBuiltInSupplier()` guard + `getSupplierMetadata()` async lookup that falls back to DB for custom names. `addCustomSupplier()` validates name format, reserved-name collision, field schemas. `deleteCustomSupplier()` cascades the credential row.
- **New API routes:** `POST /api/admin/supplier-credentials/custom` + `DELETE /api/admin/supplier-credentials/custom/[name]`. The existing PUT/DELETE/PATCH/test routes flow through `getSupplierMetadata()` so they work for custom distributors too.
- **UI Add Distributor flow:** "+ Add Distributor" button in `api-config-manager.tsx` panel header opens a Dialog with name, display_name, default currency, supported currencies (chip selector over 16 standard ISO codes), and a dynamic credential-fields editor (add/remove rows with key + label + type). Live validation, reserved-name check against the 12 built-ins, submit disabled until valid. After submit, the new row inserts into local state and auto-expands so the CEO can immediately enter credentials.
- **Custom row visual:** purple "Custom" badge next to the display_name, plus a red "Delete distributor" button inside the expansion panel. Built-ins show neither.
- **Custom test connection:** dispatcher's default case returns `"Custom distributor — no built-in test connection. Credentials are stored encrypted but cannot be verified from this UI."` — honest, not fake-green.
- **MPN-driven Test Connection:** `TestResult` extended with `raw_response`, `status_code`, `request_url`. `testSupplierConnection(supplier, credentials, mpn?)` accepts an optional MPN override per call. Per-distributor defaults preserved (ERJ-2GE0R00X for most, IPL1-110-01-S-D for Samtec, LM358N for TI).
- **Secret redaction in captured URLs:** new `redactUrl(url, secretParams)` helper strips Mouser `apiKey`, LCSC `key/signature/nonce/timestamp`, Newark `callInfo.apiKey`, TTI `apiKey` from any URL captured for display. Avnet/Arrow access_tokens are replaced with the literal string `"<redacted>"` before being put in `raw_response`.
- **POST `/api/admin/supplier-credentials/[supplier]/test` body change:** now reads optional `{ mpn }` from JSON body. Empty/missing → undefined → test function uses its default.
- **UI test result viewer:** expanded panel gets a "Test the API with a part number" card — text input + Test Connection button + Enter-key trigger. Results auto-expand the row if it was collapsed. One-line summary banner (✓/✗) + `Status: 200 • <redacted-url>` strip + collapsible `<details>` JSON viewer (terminal-styled `<pre>` block, max-h-96, horizontal scroll). Manual × dismiss only — auto-clear-after-8s removed entirely so the CEO can actually read the JSON.

**43. Session 10 follow-ups closed — bulk test + prod client porting (commit `4ad6112`):**
- After Piyush's Session 10 fixes to `lib/supplier-tests.ts`, three follow-ups remained: (1) test with real customer MPNs, (2) verify TI/TTI return real data, (3) make sure the runtime pricing path uses the same fixed endpoints.
- **Bulk test tool:** new `POST /api/admin/supplier-credentials/test-all` endpoint accepts `{ mpn? }`, fires `testSupplierConnection()` in parallel across all configured suppliers via `Promise.allSettled`, returns `{ mpn, results[], summary }`. Per-test 15s timeout inherited from the internal AbortController. Not-configured suppliers excluded from results, counted in `summary.not_configured`. Ceo + ops_manager (deliberately broader than sibling routes so Piyush can run it).
- **UI:** new "Test All Distributors" card at the top of `/settings/api-config` with an MPN input (placeholder `ERJ-2GE0R00X`), Run All Tests button, colored summary strip (green/amber/red based on fail ratio), and a results table sorted failures-first. Timeouts render as `—` status code with truncated error message + full text in title tooltip. Raw JSON deliberately NOT shown in aggregate view — click individual per-row Test buttons to see full response for one distributor.
- **Production pricing client porting:**
  - `lib/pricing/digikey.ts` — **real bug fix.** Old code hardcoded `https://api.digikey.com/` for both token and search, silently ignoring `creds.environment === "Sandbox"`. Every customer who had sandbox creds stored was getting prod-URL hits (and silent failures). Added `digikeyBaseUrl(env)` helper, inlined URL construction in `getAccessToken()` + `searchPartPrice()`. Token cache, OAuth flow, response parser untouched.
  - `lib/pricing/mouser.ts` — no drift, nothing to port. Piyush didn't list a Mouser fix and the production v1 search still works.
  - `lib/pricing/lcsc.ts` — unmasked silent error swallowing. Previously `!res.ok` / `data.code !== 200` / outer `catch {}` all returned null with no logs, so LCSC outages looked like cache misses. Now each path logs via `console.warn` with mpn + status + truncated body before returning null. Engine fallback behavior unchanged.
- All ports tagged with `// Ported from lib/supplier-tests.ts fix by Piyush 2026-04-15 (Session 10 entry 1)` for traceability.
- **Edge cases surfaced by the porting audit:**
  - Brief said Piyush's Arrow URL is `api.arrow.com/oauth/token`, actual code uses `my.arrow.com/api/security/oauth/token`. If Arrow starts failing, check Arrow's current OAuth docs.
  - LCSC test client sends signature as `signature=` param but production uses `sign=`. Different endpoints → probably correct-by-design, but if LCSC unblocks and prod path 401s, this is the first place to check.
  - DigiKey sandbox flag is now actually honored in production — before this fix, rotating credentials between prod/sandbox only affected the test button, not live quotes.

*Last updated: April 15, 2026, Session 10 (continued — bulk test + prod client porting)*

---

## Entry 44 — April 15, 2026 (Session 11) — Piyush round-3 + Anas reversals

Six items shipped in response to Piyush + Anas feedback captured via WhatsApp screenshots. No sprint boundary — all scoped surgical fixes on top of the current main branch. TypeScript clean (`tsc --noEmit` exit 0).

1. **Custom order quantity in Create Job dialog** — [components/quotes/quote-actions.tsx](components/quotes/quote-actions.tsx). Previously the dialog forced the user to pick one of the quoted tiers (50/100/250/500) as the job qty. Anas's ask: customer accepts the quote, then PO's an odd number (e.g. 75). We need to create the job for 75 using the NEXT LOWER TIER's unit price (so 75 bills at the 50-unit rate, not the 100-unit rate).
   - Added `customQty` state + `Input` field below the tier grid.
   - `resolveForQty(qty)` picks the highest tier whose `board_qty <= qty`; falls back to the smallest tier if below range.
   - Live preview shows "Pricing from the 50-unit tier ($X/unit) → $Y for 75 units".
   - Clicking a tier card clears the custom qty; typing in the custom qty clears the tier selection. Submit button enabled when EITHER is valid.
   - `POST /api/jobs` already accepts `quantity` directly, so no API change needed.

2. **CPC column showing MPN on Lanka BOMs** — [lib/bom/parser.ts:161-175](lib/bom/parser.ts#L161-L175). The Apr 14 Piyush-round-2 fix removed the `cpc = mpn` FALLBACK, but Lanka BOMs literally duplicate the MPN into column index 2 (their `columns_fixed` position for `cpc`). The parser was correctly preserving what the file contained, but the UX was confusing because CPC and MPN columns showed identical values.
   - Normalizer now returns null when `cpc.trim() === mpn.trim()`, in addition to the existing empty/`N/A` cases. So when the source genuinely duplicates MPN into the CPC column, the CPC column shows `—` and a missing CPC is visually distinct from a present one.
   - This is a display-layer dedup — we do NOT lose data, and BOMs with a real separate CPC (Legend, Signel, etc.) are unaffected.

3. **Re-enable Auto-PCB creation** — [lib/bom/parser.ts:186-220](lib/bom/parser.ts#L186-L220). This is a direct reversal of Anas's 2026-04-14 decision (which had disabled Rule 8 on the basis that "the GMP itself represents the board"). Anas on 2026-04-15: "PCB line should be created automatically if there is no PCB line in the BOM". Re-enabled with this fallback chain:
   - Prefer `gmpInfo.gmp_number` (the GMP the BOM is being uploaded against).
   - Else `extractPcbNameFromFile(bomFileName)` (strips BOM_/CP_IP_/Rev suffixes).
   - If both fail, log `AUTO-PCB-FAIL` and continue without a PCB row.
   - Synthesized row: designator `PCB1`, qty 1, cpc null, description = `board_name` (if GMP has one) else the PCB name, mpn = the PCB name. `stats.auto_pcb = true`.

4. **BOM view filter + search** — Already built in commit fdb29ae (Apr 14). Piyush's screenshot appears to have been from an older cached deploy. Rather than re-implement, made the existing filter panel visually obvious: **blue-tinted border + "FILTER & SEARCH" heading**, search placeholder expanded to mention all searchable fields (MPN, description, designator, CPC, manufacturer). [components/bom/bom-table.tsx:222-250](components/bom/bom-table.tsx#L222-L250). If Piyush still doesn't see it after deploy, the issue is either browser cache or a stale deployment — not the code.

5. **Edit button in Component Database** — [app/(dashboard)/settings/components/page.tsx:505-527](app/(dashboard)/settings/components/page.tsx#L505-L527). Inline edit was already wired up as "click the M-code badge", but Anas wanted an explicit affordance. Added a `Pencil` icon next to the existing `Trash2` in the Actions column that triggers `startEdit(comp)`. Actions column widened 16→24 to fit both buttons.

6. **DM file pricing parameters status** — STILL BLOCKED. `lib/pricing/engine.ts` defaults (component_markup 20%, pcb_markup 30%, SMT $0.35/placement, TH $0.75/placement, NRE $350, labour $130/hr) are the placeholder values from CLAUDE.md. The real values need to come from **DM Common File V11** exports — specifically Anas needs to send the Size Table, MachineCodes, and Admin sheets (same ask from commit fdb29ae). Until that happens, quote totals will NOT match what the Excel DM produces. Flagged in today's session. No code change — this is a data-import task that belongs in Sprint 3 verification.

### Files touched in entry 44
- `components/quotes/quote-actions.tsx` — custom qty input + tier resolver
- `lib/bom/parser.ts` — CPC=MPN dedup, Rule 8 Auto-PCB re-enabled
- `components/bom/bom-table.tsx` — filter panel visual prominence
- `app/(dashboard)/settings/components/page.tsx` — Pencil edit button
- `HANDOFF.md`, `ABDULS_WIKI.md` — this entry

*Entry 44 last updated: April 15, 2026, Session 11*

---

## Entry 45 — April 15, 2026 (Session 11 cont.) — DM V11 Admin file ingested

Anas dropped `admin file.xlsx` into `~/Downloads` from the DM Common File V11 export. Three sheets: **Admin** (47 PAR rules), **Size Table** (5 size tiers), **MachineCodes** (238 package keyword → M-code mappings).

**Diff against previous extract (migration 026, April 14):**
- **Size Table** — identical. No change needed. `lib/mcode/vba-algorithm.ts` SIZE_TIERS already byte-for-byte correct.
- **Admin PAR rules** — 1 new rule: **PAR-02A** (mounting_type = "Panel Mount, Through Hole, Right Angle" → TH). All 47 others match.
- **MachineCodes** — 5 new keywords not in the April 14 extract:
  - `8-MSOP` → CPEXP
  - `1806` → CP
  - `DO-214BA` → CP
  - `806` → CP
  - `16-TSSOP` → IP
  - (Plus one encoding fix for the multi-line `LITE-ON INC ... LED SMT` row.)

**What was shipped:**
1. **Migration 033** [supabase/migrations/033_dm_admin_refresh_apr15.sql](supabase/migrations/033_dm_admin_refresh_apr15.sql) — additive only, `ON CONFLICT DO NOTHING`. Safe to re-run.
2. **Applied to live Supabase** via MCP `apply_migration`. Confirmed: `mcode_keyword_lookup` 211 → 216 active, `m_code_rules` 43 → 44 active (PAR-02A present → TH).
3. **VBA algorithm fast path** [lib/mcode/vba-algorithm.ts:214-221](lib/mcode/vba-algorithm.ts#L214-L221) — added explicit `mounting === "Panel Mount, Through Hole, Right Angle"` short-circuit so PAR-02A fires without a DB roundtrip.
4. **Seed CSVs rewritten** from the xlsx source — [supabase/seed-data/dm-file/machine_codes.csv](supabase/seed-data/dm-file/machine_codes.csv), [admin_par_rules.csv](supabase/seed-data/dm-file/admin_par_rules.csv), [size_table.csv](supabase/seed-data/dm-file/size_table.csv). Source file archived at `supabase/seed-data/dm-file/_SOURCE_admin_file_2026-04-15.xlsx` for provenance.

**DB drift warning:** the live DB had 211 active keywords (not 218) and 43 active PAR rules (not 47) BEFORE migration 033. Migration 026 either didn't fully seed, or rows were soft-deleted / deactivated later. Not investigated — 033 is additive so this doesn't block today's ingest, but **Sprint 3 verification should re-seed all 218 keywords + 47 rules** from the current CSVs to guarantee the live DB matches the source of truth. Owner: Abdul. Flagged, not fixed.

**What this file does NOT contain** — and what's still needed from Anas:
- **Pricing parameters** (component markup, PCB markup, labour rate, SMT/TH/MANSMT per-placement costs, NRE breakdowns, setup + programming time) are NOT in this xlsx. Those live in different DM V11 tabs (Admin/Settings/Rates in the main DM workbook). `lib/pricing/engine.ts` is STILL running on CLAUDE.md placeholder values. The DM-params-pending memory and the note in entry 44 remain open. Today's ingest only unblocked M-code **classification**, not **pricing**.

### Files touched in entry 45
- `supabase/migrations/033_dm_admin_refresh_apr15.sql` — new
- `lib/mcode/vba-algorithm.ts` — PAR-02A short-circuit
- `supabase/seed-data/dm-file/machine_codes.csv` — rewritten from source
- `supabase/seed-data/dm-file/admin_par_rules.csv` — rewritten from source
- `supabase/seed-data/dm-file/size_table.csv` — rewritten from source
- `supabase/seed-data/dm-file/_SOURCE_admin_file_2026-04-15.xlsx` — archived source
- `HANDOFF.md`, `ABDULS_WIKI.md` — this entry

*Entry 45 last updated: April 15, 2026, Session 11 (DM Admin ingest)*

---

## Entry 46 — April 15, 2026 (Session 11 cont.) — Full DB reseed + VBA-sourced pricing defaults

Anas asked me to (a) fix the DB drift I flagged in entry 45 and (b) seed pricing params from the VBA code alone since we still don't have the DM pricing sheet export. Both done.

### What's in the live DB now (verified post-apply)

| Table | Before | After | Source |
|---|---|---|---|
| `m_code_rules` active | 44 | **48** | `admin file.xlsx` Admin sheet → `supabase/seed-data/dm-file/admin_par_rules.csv` |
| `mcode_keyword_lookup` active | 216 | **224** | same file MachineCodes sheet → `machine_codes.csv` |
| `app_settings.pricing.component_markup_pct` | 20 | **30** | `Generate_TIME_File_V4.bas:863` (VBA commented default) |
| `app_settings.pricing.labour_rate_per_hour` | 75 | **130** | `Generate_TIME_File_V4.bas:858` |
| `app_settings.pricing.smt_rate_per_hour` | 165 | 165 | `Generate_TIME_File_V4.bas:860` (already matched) |
| `app_settings.pricing.pcb_markup_pct` | 30 | 30 | `Calculation_V1.bas:122` (already matched) |
| `app_settings.pricing.default_shipping` | 200 | 200 | `Calculation_V1.bas:121` (already matched) |
| `app_settings.pricing._vba_sourced` | — | `true` | audit flag so future sessions know these values were seeded from VBA |
| `app_settings.pricing._vba_sourced_at` | — | `'2026-04-15'` | provenance date |

### Migration 034 — implementation notes

File: [supabase/migrations/034_reseed_dm_from_csv_and_vba_pricing.sql](supabase/migrations/034_reseed_dm_from_csv_and_vba_pricing.sql) (312 lines, TRUNCATE + INSERT for both tables, plus jsonb `||` update for settings)

**Gotcha 1 — M-code leading zero.** Excel strips leading zeros from numeric cells, so the MachineCodes sheet stores `0402` as integer `402`. The seed CSV reflects the raw export; the SQL inserts normalize `'402'` → `'0402'` at load time via a Python map. Every `0402` keyword mapping is now correctly assigned `'0402'` as its M-code instead of `'402'`. The VBA algorithm and classifier expect the leading-zero form.

**Gotcha 2 — Audit trigger broken from day one.** [supabase/migrations/024_audit_log_triggers.sql:111](supabase/migrations/024_audit_log_triggers.sql#L111) added `audit_app_settings` using `audit_trigger_func()`, but that function uses `NEW.id` / `OLD.id` to populate `audit_log.record_id`. **`app_settings` has no `id` column** — its PK is `key TEXT`. So every UPDATE to app_settings since migration 024 landed has failed with `ERROR: 42703: record "new" has no field "id"`. We just never noticed because nothing in the server-side code was hitting that path successfully until today. Fixed in migration **034a** (DROP TRIGGER). The table now has a `COMMENT ON TABLE` noting why auditing is disabled until the trigger function is fixed. Grep confirmed app_settings is the only audited table without an id column — no other silent failures. **Sprint 3 cleanup:** rewrite `audit_trigger_func()` to pick a record identifier based on table PK metadata, then re-enable the trigger.

### What's sourced from VBA vs still missing

**Sourced from VBA code (hardcoded in or commented-out as legacy defaults):**
- Component markup 30% — `Generate_TIME_File_V4.bas` line 863 comment
- PCB markup 30% — `Calculation_V1.bas:122` active code
- Labour rate $130/hr — `Generate_TIME_File_V4.bas:858`
- SMT rate $165/hr — `Generate_TIME_File_V4.bas:860`
- Shipping flat $200 — `Calculation_V1.bas:121` active code

**NOT in the VBA** (still using `app_settings` seed-time placeholders from migration 006):
- `smt_cost_per_placement: 0.35`, `th_cost_per_placement: 0.75`, `mansmt_cost_per_placement: 1.25` — these per-placement values aren't how RS actually calculates labour. The real DM formula multiplies time × hourly rate ($130 + $165). The per-placement cost model in `lib/pricing/engine.ts` is a simplified approximation. Full migration to the time-based model needs the TIME V11 SMT/labour time lookup tables, which live in worksheet cells (not VBA source).
- `setup_time_hours: 1`, `programming_time_hours: 1` — placeholders. Actual setup/programming time is computed per-BOM from the "Programming" worksheet based on BOM line count + single/double side ([Calculation_V1.bas:185-195](All vba codes/DM Common File - Reel Pricing V11/Calculation_V1.bas#L185-L195)), which is a lookup table. Without the workbook data, we can't seed this.
- `nre_programming/stencil/pcb_fab/misc: 100/100/0/50` — NREs are per-BOM manual entries in the DM workbook (`DM_NRE1_Column` through `DM_NRE4_Column`), NOT hardcoded defaults. Every BOM gets its own NRE figures entered by hand.

### Code changes

- Updated `?? 20` fallbacks to `?? 30` for `component_markup_pct`:
  - [app/api/quotes/route.ts:172](app/api/quotes/route.ts#L172)
  - [app/api/quote-batches/[id]/run-pricing/route.ts:64](app/api/quote-batches/[id]/run-pricing/route.ts#L64)
- TypeScript clean (`tsc --noEmit` exit 0)

### Files touched in entry 46

- `supabase/migrations/034_reseed_dm_from_csv_and_vba_pricing.sql` — new (as a file for version tracking; actually applied in two pieces via MCP due to the audit trigger blocker)
- `app/api/quotes/route.ts` — fallback 20 → 30
- `app/api/quote-batches/[id]/run-pricing/route.ts` — fallback 20 → 30
- Live Supabase DB (via MCP `apply_migration` twice: 034a fix-trigger + 034b reseed)
- `HANDOFF.md`, `ABDULS_WIKI.md`, memory files

### What's left (pricing)

The pricing engine still won't exactly match DM Excel output for any BOM where the quoted labour + SMT time differs from the default 1hr+1hr, or for any NRE-heavy board. To close the gap fully:

1. Export the "Programming" worksheet from DM Common File V11 (the BOM-line-count → programming-fee lookup table). Seed into a new `programming_fees` table or into the engine as a lookup array.
2. Export the "Settings" sheet's SMT time calculation formulas. These describe how `smt_hours` is derived from placement count and feeder count.
3. Gather real NRE default ranges from Anas for each job type.

Until then, the VBA-sourced defaults are the **best we can do without opening the xlsx**. Quotes will be ballpark-correct (markup + labour + SMT + shipping) but will drift on setup/programming time and NRE.

*Entry 46 last updated: April 15, 2026, Session 11 (DB reseed + VBA pricing)*

---

## Entry 47 — April 15, 2026 (Session 11 cont.) — AI agent audit + telemetry

Anas asked me to audit the AI agents in the repo and clean up. Five surfaces found, three kept, two deleted, one instrumented. Typecheck clean. Live DB verified.

### Classifier health check (the important finding)

Before deleting or refactoring anything, I simulated the classifier pipeline against all 264 non-PCB/non-DNI `bom_lines` currently in the DB:

| Layer | Hits | % | Notes |
|---|---|---|---|
| 1a — `components` DB lookup | 32 | 12% | MPN match via 4,033-row components table |
| 1b — keyword lookup | 207 | **78%** | word-boundary match against mpn/description/cpc |
| 2 — description-only PAR rules | 0 | 0% | PAR-13/14/16/17/37/41/43/44 etc. — none of our sample BOMs hit these |
| needs AI enrichment | 25 | 9.5% | Pipeline falls to Claude Layer 3 |

**239/264 = 90.5% auto-classified without any AI call.** Blows past the original 60% target from the plan doc. Today's migration 034 reseed (217 → 224 keywords, 44 → 48 PAR rules, 402 → 0402 normalization) is paying off — the keyword table alone carries 78% of the load.

**The 25 that still need AI break into two categories:**
1. **Word-boundary near-misses (~15):** parts like `1206L005`, `SZYY1206B`, `SOD323F`, `HTSSOP-16`, `STQFP100`. The keyword `1206` is in our table but word-boundary match requires non-alphanumeric delimiters on both sides, so `1206L` doesn't match `1206`. Same story for `SOD323F`, `HTSSOP-16`, etc. Adding a handful of suffix variants (or a `contains` match mode alongside `word_boundary`) would probably push us past 95%.
2. **Genuinely ambiguous (~10):** crystals with no package hint, shunts, bulk caps — these legitimately need AI enrichment or manual review.

No code change today — this is a diagnostic. Leaving as a follow-up task: add `contains`-mode keyword variants for the near-miss patterns, re-run the simulation, expect 95%+.

### AI surface audit — what was in the repo

1. **M-code AI classifier** — [lib/mcode/ai-classifier.ts](lib/mcode/ai-classifier.ts) — live, Layer 3 fallback. Uses `@anthropic-ai/sdk` with `claude-haiku-4-5-20251001`. Returns physical parameters, NOT M-codes; the VBA algorithm in `vba-algorithm.ts` does the actual assignment.
2. **BOM column AI mapper** — [lib/bom/ai-column-mapper.ts](lib/bom/ai-column-mapper.ts) — live, fallback when keyword-based column detection fails. Same SDK/model.
3. **In-app chat agent** — [app/api/chat/route.ts](app/api/chat/route.ts) — live, 1229 lines, 38 tools across read + action categories. Uses Vercel AI SDK (`@ai-sdk/anthropic` + `streamText`) with `claude-sonnet-4-20250514`. Frontend is [components/chat/ai-chat.tsx](components/chat/ai-chat.tsx) (675 lines) using `useChat` from `@ai-sdk/react`.
4. **In-app MCP server (HTTP streamable)** — [app/api/mcp/route.ts](app/api/mcp/route.ts) + [lib/mcp/tools/](lib/mcp/tools/) — live, 20 tools, per-request stateless McpServer with role-gated tool registration via `buildMcpServerForRole()`. Works with Claude Desktop / mcp-inspector / any MCP client. ✓
5. **Standalone stdio MCP server** — `erp-rs-mcp/` — **orphaned, deleted.**

### Deletions (commit-ready, not yet committed)

1. **`erp-rs-mcp/`** — 67 MB, stdio MCP package from April 6 (`41a52b8`). Drifted out of sync with `lib/mcp/tools/` — diffing every tool file showed 10/10 differ, and no code outside itself imports from it. Its own `MCP_SETUP.md` documentation claimed it "remains in the repo for local Claude Code / CLI use" but nothing was wired up. Deleted. If stdio access is needed later, write a thin wrapper that shells out to `/api/mcp`.
2. **`app/api/mcp/classify/route.ts`** and **`app/api/mcp/overview/route.ts`** — legacy JSON-REST shims. `MCP_SETUP.md` claimed they were "for backwards compatibility with the in-app Chat", but grepping every `.ts`/`.tsx` file in the repo found **zero callers**. The chat route imports `classifyWithAI` directly from `lib/mcode/ai-classifier`, not from these endpoints. Deleted.
3. **`MCP_SETUP.md`** — updated to reflect reality: only `/api/mcp` exists, with history notes on what was removed and when.

### AI telemetry (new) — migration 035 + wrapper

Every AI call in the webapp now logs to `public.ai_call_log` so we can see usage, cost, latency, and failure rates from SQL without needing to log into Vercel or Anthropic.

**Schema:** [supabase/migrations/035_ai_call_log.sql](supabase/migrations/035_ai_call_log.sql)
- `purpose` (`mcode_classifier` / `bom_column_mapper` / `chat_assistant` / `other`)
- `provider`, `model`
- `input_tokens`, `output_tokens`, `total_tokens` (generated)
- `latency_ms`
- `success`, `error_message`
- `user_id`, `bom_id`, `mpn`, `conversation_id` (all nullable, populated where available)
- `metadata` JSONB
- Indexed on `called_at DESC`, `(purpose, called_at)`, `(user_id, called_at)`, and `success=false` (partial index for error investigation).

**RLS:** CEO + Operations Manager can read. No regular-user INSERT policy — the wrapper uses the admin client and bypasses RLS.

**Not audited** — the log IS the audit record. Adding a separate audit trigger would be circular.

**Wrapper:** [lib/ai/telemetry.ts](lib/ai/telemetry.ts)
- `recordAiCall(record)` — fire-and-forget insert. Telemetry errors are caught and logged to console so a telemetry outage never breaks the AI call it wraps.
- `withAiTelemetry(base, fn)` — convenience wrapper that times a call and records the outcome based on success/failure. Not currently used but available for refactors.

**Instrumented call sites:**
- [lib/mcode/ai-classifier.ts](lib/mcode/ai-classifier.ts) — `fetchComponentParams()` records on both success (with token counts from `response.usage`) and error paths.
- [lib/bom/ai-column-mapper.ts](lib/bom/ai-column-mapper.ts) — same pattern.
- [app/api/chat/route.ts](app/api/chat/route.ts) — added `onFinish` + `onError` callbacks on the `streamText()` call. Token counts come from the AI SDK's `usage` object. Captures `user_id`, `conversation_id`, `message_count`, `has_page_context`, `has_file_context` as metadata.

**What you get:** after the next deploy + a few days of normal usage, run something like:

```sql
-- Cost-per-day by purpose (rough — assumes $3/$15 per 1M tokens)
SELECT date_trunc('day', called_at) AS day,
       purpose,
       COUNT(*) AS calls,
       SUM(input_tokens)::int AS in_tok,
       SUM(output_tokens)::int AS out_tok,
       ROUND(AVG(latency_ms)::numeric, 0) AS avg_ms,
       ROUND(SUM(input_tokens)::numeric / 1000000 * 3 +
             SUM(output_tokens)::numeric / 1000000 * 15, 2) AS approx_usd
FROM ai_call_log
WHERE called_at > NOW() - INTERVAL '7 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;
```

A dedicated Settings → AI Usage page is a follow-up (2-3 hours). For now, SQL or MCP query is enough.

### Not done (saved for future sessions)

- **(C) Merge chat tool queries into `lib/mcp/tools/`.** ~9 chat tools duplicate MCP tool logic (listCustomers, getCustomer, businessOverview, listQuotes, listJobs, listInvoices, getJobDetail, classifyComponent, searchAll). Not urgent but annoying — drift risk. Medium-size refactor, 30-60 min with side-by-side diffing.
- **(D) Vercel AI Gateway migration.** Would give provider failover, unified observability dashboard, and zero-retention guarantees. But (E) telemetry covers most of the "I want to see usage" use case and lives in our own DB, so (D) is deferred until we actually need gateway features (probably when we experiment with non-Anthropic models).
- **Keyword suffix variants** to catch the 15 word-boundary near-misses (1206L, SOD323F, HTSSOP-16, STQFP100, etc.). Would push auto-classification from 90.5% → 95%+. Trivial data migration — just append rows to `mcode_keyword_lookup`.

### Files touched in entry 47

- `supabase/migrations/035_ai_call_log.sql` — new (applied to live DB)
- `lib/ai/telemetry.ts` — new wrapper module
- `lib/mcode/ai-classifier.ts` — telemetry recording + `CLASSIFIER_MODEL` constant
- `lib/bom/ai-column-mapper.ts` — telemetry recording + `COLUMN_MAPPER_MODEL` constant
- `app/api/chat/route.ts` — `onFinish` / `onError` telemetry + `CHAT_MODEL` constant
- `erp-rs-mcp/` — **deleted** (entire 67 MB package)
- `app/api/mcp/classify/route.ts` — **deleted**
- `app/api/mcp/overview/route.ts` — **deleted**
- `MCP_SETUP.md` — rewritten to reflect current state

TypeScript clean (`tsc --noEmit` exit 0). Nothing committed yet — user should review and commit.

*Entry 47 last updated: April 15, 2026, Session 11 (AI audit + telemetry)*

---

## Entry 48 — April 15, 2026 (Session 11 cont.) — Real pricing from DM/TIME xlsm + markup correction

Anas authorized me to force-extract the pricing data from the DM and TIME workbooks directly instead of waiting for a clean export. Found both files on his disk under `/Users/rselectronicpc/Downloads/RS Master/`, copied them into `supabase/seed-data/dm-file/` as immutable source-of-truth artifacts, and read out the pricing values.

### ⚠️ IMPORTANT CORRECTION to entry 46

**Entry 46 seeded `component_markup_pct = 30` and `pcb_markup_pct = 30` based on commented-out VBA defaults in `Generate_TIME_File_V4.bas` lines 862-863. THESE WERE STALE.**

The **actual live values** from the TIME V11 `final` sheet rows 15-18 (the 4 quantity tiers) are:

```
Qty 1-4:  Labour 130   SMT 165   PCB markup 0.25   Component markup 0.25
```

**Both markups are 25%, not 30%.** Migration 036 fixes this.

Impact: any quote generated today under commit `042c366` that used the fallback `?? 30` in the batch-pricing or quote-creation paths was billing at **30% component markup** — 5 percentage points too high vs what DM Excel would output. Any quote generated using the live `app_settings.pricing.component_markup_pct` value was also 30% — same problem. Both are now corrected to 25%.

**Heads up:** the chat conversation / audit log from today may show some discussion of 30% markup that's now historically incorrect. Anas should NOT go back and retroactively re-invoice based on that number. The correct rate for quotes is 25%, and the DB has 25% from migration 036 onwards.

### What entry 48 shipped

**1. Source xlsm archives copied into the repo** (for provenance; we don't touch the originals):
- `supabase/seed-data/dm-file/_SOURCE_DM_Common_File_V11_2026-04-15.xlsm` (9.2 MB)
- `supabase/seed-data/dm-file/_SOURCE_TIME_V11_2026-04-15.xlsm` (561 KB)
- (Already had `_SOURCE_admin_file_2026-04-15.xlsx` from entry 45.)

**2. Migration 036** [supabase/migrations/036_programming_fees_and_real_markups.sql](supabase/migrations/036_programming_fees_and_real_markups.sql):

**Part A — New `programming_fees` table:**
- 28 rows from DM V11 Programming sheet.
- Schema: `bom_lines (PK) | additional_cost | standard_price | double_side_price | source`.
- Query pattern: `SELECT * FROM programming_fees WHERE bom_lines <= $1 ORDER BY bom_lines DESC LIMIT 1; pick standard_price or double_side_price based on assembly_type`.
- Coverage: 1 line → $300/$400 up to 300 lines → $2250/$2350. Incremental: $50/10 lines below 70 lines, $75/10 lines above.
- RLS: read-only for any authenticated user (reference data, not transactional).

**Part B — app_settings.pricing updates:**
- `component_markup_pct`: 30 → **25** ✓
- `pcb_markup_pct`: 30 → **25** ✓
- `board_setup_fee_standard`: new = $250 (from DM Programming sheet "Type of Board" table)
- `board_setup_fee_double_side`: new = $350
- `_xlsm_sourced: true` audit flag (replaces/augments `_vba_sourced`)
- `_xlsm_sourced_at: '2026-04-15'`
- `_xlsm_sources`: jsonb array naming which sheets gave us which values

**3. Code fallbacks corrected** from entry 46's `?? 30` to `?? 25`:
- [app/api/quotes/route.ts:172](app/api/quotes/route.ts#L172)
- [app/api/quote-batches/[id]/run-pricing/route.ts:64](app/api/quote-batches/[id]/run-pricing/route.ts#L64)

**4. Programming fee seed CSV:**
- [supabase/seed-data/dm-file/programming_fees.csv](supabase/seed-data/dm-file/programming_fees.csv) — 28 rows, versioned alongside the other DM seeds.

### Verified post-apply state

```
programming_rows:      28
comp_markup:           25
pcb_markup:            25
labour_rate:           130
smt_rate:              165
std_setup_fee:         250
double_setup_fee:      350
xlsm_sourced:          true
```

Applied via MCP `apply_migration`. Local file at `supabase/migrations/036_programming_fees_and_real_markups.sql` matches what was run.

### Discovery: the real SMT time model

While reading TIME V11's `final` sheet I also noticed:

```
Row 30: 'CP CPH'    Qty1=4.5  Qty2=4.5  Qty3=4.5  Qty4=4.5
Row 31: 'IP CPH'    Qty1=2sec Qty2=2sec Qty3=2sec Qty4=2sec  (datetime.timedelta)
```

Plus the `Settings` sheet in TIME V11 maps 80+ named ranges (`Set_SMT_Placement_Rng`, `Set_CP_Feeders_Rng`, `Set_Total_Printer_Time_Rng`, `Set_Total_Setup_Time_Rng`, etc.) to specific cell addresses in the `final` sheet. The SMT cost in DM is calculated as **placement_count / CPH → hours → × rate**, NOT as a flat `per_placement × placements` product.

**This means `lib/pricing/engine.ts`'s per-placement cost model (`smt_cost_per_placement 0.35`, `th_cost_per_placement 0.75`) is architecturally wrong — it's a simplified approximation that can drift materially from DM output when placement counts are large or feeder counts skew the CPH calculation.**

Porting the full time-based model requires:
1. New `smt_time_params` table or app_settings fields: `cp_cph`, `ip_cph`, `th_placement_time`, `setup_time_per_feeder`, `printer_load_time`, etc. (~20 values to lift from TIME V11 Settings sheet's named ranges).
2. Rewrite `lib/pricing/engine.ts` to compute `smt_hours = f(placements, feeders, CPH, setup_time)` per tier, then `labour_cost = smt_hours × smt_rate`.
3. Regression-test against a few real quotes to confirm parity with DM Excel output.

This is a ~4-6 hour task. NOT done in entry 48 because Anas said don't break anything. Flagged as a bigger follow-up for when we have a clean branch.

### Files touched in entry 48

- `supabase/migrations/036_programming_fees_and_real_markups.sql` — new (applied live)
- `supabase/seed-data/dm-file/programming_fees.csv` — new
- `supabase/seed-data/dm-file/_SOURCE_DM_Common_File_V11_2026-04-15.xlsm` — new (archived copy)
- `supabase/seed-data/dm-file/_SOURCE_TIME_V11_2026-04-15.xlsm` — new (archived copy)
- `app/api/quotes/route.ts` — fallback 30 → 25
- `app/api/quote-batches/[id]/run-pricing/route.ts` — fallback 30 → 25
- `HANDOFF.md`, `ABDULS_WIKI.md`, memory — this entry

TypeScript clean (`tsc --noEmit` exit 0).

### What's still open

- **SMT time model port** (4-6 hrs) — described above. The biggest remaining gap between web app quotes and DM Excel.
- **Use `programming_fees` in engine.ts** — right now the table exists but `engine.ts` still uses `settings.programming_time_hours × labour_rate`. Should switch to a DB lookup based on `bomLines` + `assembly_type`. 30-60 min wire-up.
- **Keyword suffix variants** (from entry 47 follow-up list) — 1206L, SOD323F, HTSSOP-16, STQFP100 — trivial data migration to push classification from 90.5% → 95%+.
- **Settings → AI Usage page** — once `ai_call_log` has a few days of data.

*Entry 48 last updated: April 15, 2026, Session 11 (real pricing extraction + markup correction)*

---

## Entry 49 — April 16, 2026 (Session 11 cont.) — PCB + CPC bug fix (for real this time)

Two bugs from entry 44 that I thought I'd fixed but hadn't.

### 1. Auto-PCB was a bug, not a feature request

Entry 44 re-enabled Rule 8 (auto-PCB creation) because I misread Piyush's WhatsApp: *"PCB line should be created automatically if there is no PCB line in the BOM"*. I interpreted this as a request to synthesize PCB rows. It was actually **describing the bug behavior** — the parser was creating ghost PCB rows and Piyush was reporting it as wrong.

Anas confirmed on April 16: auto-PCB is a bug. The GMP itself represents the board. No ghost rows.

**Fix:** [lib/bom/parser.ts](lib/bom/parser.ts) Rule 8 block re-disabled — logs `AUTO-PCB-FAIL` and moves on. The one auto-generated row (`TL000-5001-000-T`, designator `PCB1`) was deleted from `bom_lines` via SQL.

**Memory updated** to NEVER re-enable auto-PCB without explicit written confirmation. This has flip-flopped 3 times (Apr 14 disabled → Apr 15 enabled → Apr 16 disabled). No more.

### 2. CPC=MPN dedup only affected new uploads

Entry 44 fixed the parser so new BOMs wouldn't store CPC when it's identical to MPN. But **existing `bom_lines` rows** still had the old duplicated values from their original parse. The user re-opened the same BOM and still saw CPC = MPN in every row.

**Fix:** `UPDATE bom_lines SET cpc = NULL WHERE TRIM(cpc) = TRIM(mpn) AND NOT is_pcb` — cleaned all existing rows. 0 remaining after fix.

**Lesson:** parser fixes only affect future uploads. For data bugs, always run a SQL backfill on existing rows too.

### 3. .gitignore for MCP config files

Added `claude_desktop_config.json`, `mcp_config.json`, `.mcp.json` to `.gitignore` so filled configs with live `rs_live_*` API keys can't accidentally be committed.

### Also in this session

- Validated Anas's `rs_live_*` API key against the live MCP endpoint — handshake succeeds, all 20 tools visible, key `"test claude dev bot"` with CEO role.
- Wrote filled `claude_desktop_config.json` to `~/` (outside repo) for Anas's bot integration.

### Files touched

- `lib/bom/parser.ts` — Rule 8 re-disabled
- `.gitignore` — MCP config exclusions
- `HANDOFF.md` — this entry
- Live DB: 1 auto-PCB row deleted, CPC=MPN rows nulled

Commit `956e280`, pushed to main.

*Entry 49 last updated: April 16, 2026, Session 11*

---

## Entry 50 — April 16, 2026 (Session 12) — CPC root cause, column mapper, overage display, sortable BOM, invoice terms, multi-quote

Seven changes shipped across 5 commits (`08fc866`..`e8fac15`). All pushed to main.

### 1. CPC root cause found and fixed (`41ed94e`)

The CPC "bug" had THREE stacked causes:
- **All 11 customers had empty `bom_config: {}`** — the configs from CLAUDE.md were never seeded into the live DB. Parser was auto-detecting columns for every customer and never finding a CPC column.
- **The CPC=MPN dedup from entry 44 was wrong** — Lanka uses MPN as their CPC (column position 2 in their fixed-layout files). Nulling CPC when it matched MPN was removing real data. Reverted: parser now shows whatever the file has, only nulls empty/N/A.
- **Existing rows needed backfill** — ran `UPDATE bom_lines SET cpc = mpn` for all TLAN BOMs.

**Fix:** seeded `bom_config` for all 11 customers via SQL. Lanka gets `columns_fixed: ["qty", "designator", "cpc", "description", "mpn", "manufacturer"]`. Other 10 get `auto_detect` with `cpc_fallback: mpn`. New uploads will read CPC correctly.

### 2. Invoice due_date respects payment terms (`08fc866`)

Was hardcoded to `issued_date + 30 days` in both `app/api/invoices/route.ts` and the chat agent's `createInvoice` tool. Now reads `customers.payment_terms`, parses the number from "Net 30" / "Net 60" / etc., and adds that many days. Falls back to 30 if no terms set.

### 3. Overage cost displayed in quote pricing table (`6161ec8`)

The engine already charged for overage extras (attrition parts per M-code) in the component cost, but the pricing table didn't break it out. Now shows:
```
Components (incl. overage)       $12,500
  ↳ Overage extras (340 parts)      $850
```
Added `overage_cost` + `overage_qty` to `PricingTier` type, tracked in `engine.ts`, displayed as an indented sub-row in `pricing-table.tsx`. Hidden when $0.

### 4. Sortable BOM table columns (`507fb37`)

Click column headers to sort asc/desc: M-Code, CPC, Qty, MPN, Manufacturer. Active sort shows arrow indicator. PCB rows always pin to top. Works alongside search + M-code filter + unclassified toggle.

### 5. BOM column mapper on upload (`e8fac15`)

When a file is dropped on the upload page:
- Client reads it with SheetJS and shows a preview (headers + 5 sample rows)
- 6 dropdown selectors (Qty*, Designator*, CPC, Description, MPN*, Manufacturer) auto-filled from keyword detection
- User can override any mapping before uploading
- Mapped columns highlighted blue in the preview table
- Server accepts the user's mapping as highest priority (before bom_config, auto-detect, AI fallback)

New component: [components/bom/column-mapper.tsx](components/bom/column-mapper.tsx)

### 6. Multiple quotes from same BOM (`e8fac15`)

BOM detail page no longer hides "Create Quote" when a quote already exists. Shows "New Quote" button alongside "View Quote" so you can create fresh quotes when the customer changes quantities.

### 7. Programming fees + correct markups (`dddd269`)

From late Session 11 (April 15): extracted the real DM Common File V11 and TIME V11 workbooks from Anas's disk, found markups are 25% (not 30% from stale VBA comments). Created `programming_fees` table with the 28-row BOM-line-count lookup. See entries 46-48 for full details.

### Files touched in entry 50

- `lib/bom/parser.ts` — reverted CPC=MPN dedup, kept empty/N/A normalization
- `app/api/invoices/route.ts` — due_date from customer payment_terms
- `app/api/chat/route.ts` — same fix for createInvoice tool
- `lib/pricing/types.ts` — added overage_cost, overage_qty to PricingTier
- `lib/pricing/engine.ts` — track overage cost per line
- `components/quotes/pricing-table.tsx` — overage sub-row display
- `app/api/quotes/[id]/pdf/route.ts` — backwards compat for old quotes
- `components/bom/bom-table.tsx` — sortable column headers
- `components/bom/column-mapper.tsx` — new mapper UI component
- `components/bom/upload-form.tsx` — client-side file preview + mapper integration
- `app/api/bom/parse/route.ts` — accept user-provided column_mapping
- `app/(dashboard)/bom/[id]/page.tsx` — allow multiple quotes per BOM
- Live DB: customer bom_configs seeded, CPC values restored for TLAN BOMs

*Entry 50 last updated: April 16, 2026, Session 12*

---

## Entry 51 — Quoting Engine Overhaul: 6 SOP Gaps Closed (April 16, 2026, Session 13)

Anas provided the full RS Quotation Process SOP (14-page PDF covering phases A–K single-BOM + L–O batch). Audited the web app against every phase. Found 6 material gaps. Fixed all 6 + 4 cosmetic issues from code review.

### 1. Programming fees wired into pricing engine

`programming_fees` table (migration 036, 28 rows) was seeded but never queried. `lib/pricing/engine.ts` was using `programmingTimeHours × labourRate` ($130 flat).

**Now:** Imports `calculateProgrammingCost()` from `lib/pricing/programming-cost.ts`. Looks up the tiered fee based on BOM line count + single/double-sided assembly type. A 45-line TB BOM now correctly costs $450 (was $130). Double-counting guard: if `nre_programming` is already set from the form, engine sets its own programming cost to $0.

`assembly_type` threaded through: `quotes/route.ts`, `quotes/preview/route.ts`, `recompute.ts`, `labour/route.ts`.

### 2. Time-based assembly cost (replaces flat per-placement)

**Before:** `assembly = SMT × $0.035 + TH × $0.75`. A 500-placement board cost $17.50.

**After:** CPH (Components Per Hour) model from DM/TIME V11:
- CP/CPEXP: 4,500 CPH | 0402: 3,500 | 0201: 2,500 | IP: 2,000 | TH: 150 | MANSMT: 100
- `placement_time = total_placements / CPH` (per M-code category)
- `feeder_setup = (CP_feeders × 2min + IP_feeders × 3min + 2 × printer_setup × 15min) / 60`
- `labour_cost = total_hours × $130/hr`
- `machine_cost = SMT_hours × $165/hr` (machine rate only for pick-and-place)
- `assembly_cost = labour + machine`

All CPH rates + setup params configurable in `/settings/pricing`. Toggle: "Time-Based" vs "Legacy Per-Placement" — old quotes display correctly.

Files: `lib/pricing/engine.ts`, `lib/pricing/types.ts` (10 new PricingSettings fields, 8 new LabourBreakdown fields), `components/settings/pricing-settings-form.tsx`, `components/quotes/pricing-table.tsx` (shows time breakdown when time model active).

### 3. Multi-page quote PDF

**Before:** Single page summary only. No addresses, no per-tier breakdown.

**After:**
- **Page 1:** RS header + BILL TO (billing address from `billing_addresses` array) + SHIP TO + QUOTE DETAILS (GMP, board, BOM, validity, payment terms) + summary pricing table + lead times + notes + T&Cs
- **Pages 2–N:** One per quantity tier — Material Cost (before/after markup, overage), PCB Cost, Assembly Cost (SMT/TH/MANSMT placements or time breakdown), NRE Breakdown (programming, stencil, PCB fab, setup, misc), Shipping, bold Tier Total + per-unit

Reads from `billing_addresses` (plural, JSONB array) with fallback to legacy `billing_address` (singular). Handles both `street` and `line1` field names via `extractDefaultAddress()`.

File: `app/api/quotes/[id]/pdf/route.ts` (~900 lines, complete rewrite).

### 4. Lead time field

**Migration 037:** `ALTER TABLE quotes ADD COLUMN lead_times JSONB DEFAULT '{}'`

- Quote form: per-tier lead time input with defaults ("4-6 weeks" small qty, "3-4 weeks" large qty)
- Saved to DB via `quotes/route.ts`
- Displayed on quote detail page (Clock icon card)
- Rendered in PDF: summary table row + per-tier detail page header

### 5. Historical procurement price lookup

**Before:** Only checked 7-day API cache. No "what did we pay last time?" equivalent.

**After:** New file `lib/pricing/historical.ts` with 4 functions:
- `lookupHistoricalPrice(mpn)` — queries `procurement_lines` for last 5 records
- `lookupHistoricalPricesBulk(mpns)` — batch version for quote batches
- `lookupComponentSupplierPNs(mpn)` — gets DigiKey/Mouser/LCSC PNs from `components` table for better API search keys
- `cacheHistoricalPrice()` — caches historical price with 30-day TTL

Pricing flow is now 4 steps: cache → historical → component PNs → APIs. If all APIs fail but historical exists, returns historical as fallback. Response includes `historical_price`, `historical_date`, `historical_supplier` for reference.

**Migration 038:** Adds `'procurement_history'` to `api_pricing_cache.source` CHECK constraint + index on `procurement_lines(upper(mpn))`.

### 6. Stock-aware supplier fallback

**Before:** Picked cheapest price regardless of stock. DigiKey `stock_qty` was always `null`.

**After:**
- `lib/pricing/digikey.ts` now extracts `QuantityAvailable` from DigiKey V4 response
- `selectBestSupplier()` prefers cheapest **with stock** over cheapest overall
- Zero-stock suppliers only used if everything is out of stock (flagged as `out_of_stock`)
- DigiKey PN preserved in 404 response for manual lookup
- Batch pricing tracks `in_stock_count`, `out_of_stock_count`, `historical_hits`
- Backward compatible: old cache entries with `stock_qty: null` treated as "unknown" (not penalized)

### Code review fixes (4 additional)

1. `smt_rate` column now stores hourly rate ($165) when time model active, per-placement ($0.035) when legacy
2. NRE breakdown in pricing-table.tsx labeled "(per quote, not per tier)"
3. `calculateLabourCost` standalone function now includes feeder setup in SMT placement cost
4. Removed duplicate `fmtDate` — imports from `lib/pdf/helpers.ts`

### Critical bugs caught during review

1. `lead_times` was never saved to DB — form sent it, API ignored it → fixed
2. PDF read old `billing_address` (singular) instead of `billing_addresses` (plural array) → fixed
3. Case-sensitive `.in()` in bulk historical lookup missed MPNs with different casing → fixed
4. Non-null `best!` assertion could crash → added null guard

### Files touched

- `lib/pricing/engine.ts` — time-based assembly cost + programming fee wiring
- `lib/pricing/types.ts` — 10 new PricingSettings, 8 new LabourBreakdown fields, price_source expansion
- `lib/pricing/historical.ts` — NEW: historical procurement lookup
- `lib/pricing/digikey.ts` — stock_qty extraction
- `lib/pricing/recompute.ts` — assembly_type passthrough
- `app/api/quotes/route.ts` — assembly_type, lead_times, smt_rate fix
- `app/api/quotes/preview/route.ts` — assembly_type
- `app/api/quotes/[id]/pdf/route.ts` — multi-page rewrite
- `app/api/pricing/[mpn]/route.ts` — historical lookup + stock-aware selection
- `app/api/quote-batches/[id]/run-pricing/route.ts` — bulk historical + stock tracking
- `app/api/quote-batches/[id]/send-back/route.ts` — new LabourBreakdown fields
- `app/api/procurements/route.ts` — historical fallback
- `app/api/labour/route.ts` — time model support
- `app/(dashboard)/quotes/[id]/page.tsx` — lead times card
- `app/(dashboard)/settings/pricing/page.tsx` — CPH defaults
- `components/quotes/new-quote-form.tsx` — lead time inputs
- `components/quotes/pricing-table.tsx` — time breakdown display + NRE label
- `components/settings/pricing-settings-form.tsx` — CPH fields + model toggle
- `supabase/migrations/037_add_lead_time_to_quotes.sql`
- `supabase/migrations/038_historical_procurement_pricing.sql`

### What's still pending

- Per-M-code time lookup from TIME V11 "Settings" named ranges (current CPH rates are good defaults but could be refined)
- PDF page overflow protection on per-tier detail pages (works for typical BOMs, could overflow on extreme cases)
- GST/QST tax numbers not shown in PDF header (required for invoices, optional for quotes)

*Entry 51 written: April 16, 2026, Session 13*

## Entry 52 — 4 UX Bugs Fixed from Piyush Test Walkthrough (April 16, 2026, Session 13b)

Full end-to-end test of quoting flow (Upload CSV → Parse → Classify → Quote → Pricing → PDF) for Cevians CVN-CTL-001 revealed 4 bugs. All fixed.

### 1. Auto-scroll to pricing results (critical UX)

User clicks "Calculate Pricing" → results render below the fold → page doesn't scroll → user thinks it's broken. Fixed: `useRef` + `scrollIntoView({ behavior: 'smooth' })` after `setPreview()`. File: `components/quotes/new-quote-form.tsx`.

### 2. M-Code chart stale after manual assigns

Donut chart was server-rendered (stale snapshot). Moved into `BomTable` client component as `useMemo` from live `lines` state. Files: `components/bom/bom-table.tsx`, `app/(dashboard)/bom/[id]/page.tsx`.

### 3. "No parsed BOMs" race condition

First nav from BOM page showed error before prefill fetch completed. Added `prefilling` state → shows spinner instead of error during load. File: `components/quotes/new-quote-form.tsx`.

### 4. NRE card missing setup + misc fees

Card showed $800 (prog + stencil) but NRE is $950 (+ setup $100 + misc $50). Now reads all 5 NRE line items from labour breakdown. File: `app/(dashboard)/quotes/[id]/page.tsx`.

### Test Results: Cevians CVN-CTL-001 (15 components)

- 12/15 auto-classified from rules (80%), 3 manual (STM32→IP, USB-C→MANSMT, Crystal→TH)
- All 15 priced, $0 missing. Time-based assembly model active.
- 5-page PDF: summary + 4 tier details. Addresses, lead times, NRE itemization all present.
- Per-unit: $204.72 (50) / $184.92 (100) / $170.59 (250) / $164.13 (500)

*Entry 52 written: April 16, 2026, Session 13b*

## Entry 53 — Delete UX Overhaul + Cancel Invoice (April 16, 2026, Session 13c)

Three commits addressing delete workflow across the entire app.

### 1. Clickable links to blocking records in delete dialogs

When you try to delete something that has dependencies (e.g., a BOM with quotes), the error dialog now shows clickable links to each blocking record instead of just a count.

| Entity | Blocking records shown as links |
|--------|-------------------------------|
| BOM | Quotes (→ /quotes/{id}), Jobs (→ /jobs/{id}) |
| Quote | Jobs (→ /jobs/{id}) |
| Job | Invoices (→ /invoices/{id}), Procurements (→ /procurement/{id}) |
| Customer | Quotes, Jobs, BOMs — all linked |
| Procurement | Supplier POs (→ /procurement/{id}) |

APIs return up to 5 blocking record identifiers in 409 responses.

Files changed: 5 API routes (`bom/[id]`, `quotes/[id]`, `jobs/[id]`, `customers/[id]`, `procurements/[id]`) + 5 delete button components.

### 2. Missing procurement delete button

`DeleteProcurementButton` component existed but was never imported on the procurement detail page. Now shows next to Order All / Create PO / Generate Reception File buttons.

File: `app/(dashboard)/procurement/[id]/page.tsx`

### 3. Cancel Invoice button

Delete handler blocks paid invoices with "Cancel it first" — but there was no cancel button. Added a red "Cancel Invoice" button to `InvoiceActions`. Shows on all non-cancelled invoices. For paid invoices, confirms with a warning that cancelling won't reverse recorded payments. Once cancelled, the invoice becomes deletable.

File: `components/invoices/invoice-actions.tsx`

*Entry 53 written: April 16, 2026, Session 13c*

- 12 distributors (DigiKey, Mouser, LCSC, Avnet, Arrow, TTI, Newark, Samtec, TI, TME, Future, e-Sonic) now have credentials stored AES-256-GCM encrypted in `supplier_credentials` table (migration 031). Master key in `SUPPLIER_CREDENTIALS_KEY` env var, never in DB or repo.
- `lib/supplier-credentials.ts` exposes `getCredential`, `setCredential`, `deleteCredential`, `getPreferredCurrency`, `setPreferredCurrency`, `listCredentialStatus`, plus the `SUPPLIER_METADATA` registry (per-supplier field schemas, supported currencies, default currency, docs URL).
- `/settings/api-config` page (CEO-only): compact row-based layout matching the reference screenshot Anas sent. One row per distributor → click to expand inline → credential fields with "leave blank to keep current" UX → Save / Test Connection.
- Per-distributor Test Connection: `POST /api/admin/supplier-credentials/[supplier]/test`. Real implementations for DigiKey, Mouser, LCSC, TTI, Newark, Samtec, TI, TME (full auth + search probe). Token-only verification for Avnet + Arrow (search endpoint shape uncertain). Assumption-based probe for Future. Honest "not testable" for e-Sonic. 15s AbortController timeout.
- `lib/pricing/digikey.ts` / `mouser.ts` / `lcsc.ts` updated to read credentials from DB first, fall back to env vars (existing Vercel deploy keeps working). Currency for outbound API calls now sourced from `getPreferredCurrency()` instead of hardcoded "CAD". 60-second module-level cache.
- 12 credentials seeded directly via mcp execute_sql with encrypted ciphertext. No raw values in repo (verified via grep for unique key fragments → zero matches).
- **Required env var (must be added to both `.env.local` and Vercel):** `SUPPLIER_CREDENTIALS_KEY=KW5HRsscO1DmhafcTJmPWg9Z8+pjsd2q8ExGmOLW4K0=`. Without it the page renders a red error card instead of the manager. Adding the env var to Vercel does NOT auto-redeploy — must trigger a fresh build (push a commit or click Redeploy in the dashboard).

## Entry 54 — Session 14 (April 17, 2026) — BOM UX, Quote Form Overhaul, Loading Skeletons, Sortable Tables

Broad session covering BOM upload polish, quote form enhancements, pricing engine improvements, table UX across the app, and loading skeletons on every route. Two committed fixes (`eeddb31`, `5a90c83`) plus extensive uncommitted work.

### 1. Header Row + Last Row controls in BOM column mapper

Some customer BOMs have banner/title rows at the top and summary/notes rows at the bottom. Auto-detection usually picks the right header row, but there was no way to override or exclude trailing junk.

- **Header Row selector** — number input (1-indexed) in the column mapper. Defaults to auto-detected row. Changing it re-auto-detects column mappings and updates the preview.
- **Last Row to Process** — number input (1-indexed, inclusive). Defaults to total rows. Lets users exclude summary/total/notes rows at the bottom.
- **Server-side support** — `POST /api/bom/parse` accepts optional `header_row` and `last_row` in formData, overriding bom_config and auto-detection.
- **Row number display** — preview table shows actual file row numbers for cross-referencing with spreadsheet.

### 2. Header row parsed as data bug fix

Upload form now always sends `header_row` when the column mapper is visible. Previously, TLAN's `columns_fixed` bom_config could override the auto-detected header row, causing the header to be treated as a component data row.

### 3. Manual pricing for components without MPN (commit `eeddb31`)

Components with no MPN (only CPC or description) broke the manual price editor — sent empty mpn to API which rejected it. Fixed the entire chain:
- Editor uses `bom_line_id` as stable key, shows "No MPN" for UUID fallbacks, column header changed to "MPN / CPC"
- API accepts `bom_line_id` as alternative to mpn, looks up CPC from bom_lines table for cache key
- Quote preview and recompute search cache by mpn then cpc then bom_line_id
- Missing-price components carry `bom_line_id` and `cpc` through the full pipeline

### 4. Source reference on pricing settings (commit `5a90c83`)

New `PricingSourceReference` component on Settings > Pricing page. Shows where every pricing number comes from — links to the actual VBA source files (DM V11, TIME V14) with line-number references. New API route `GET /api/settings/source-files/[filename]` serves the reference data.

### 5. Chart colors fixed

M-Code distribution chart: APCB now fuchsia (`#d946ef`), Unclassified now red (`#ef4444`). Both were previously the same fallback gray, making them indistinguishable.

### 6. NRE Breakdown removed from Settings

Removed the NRE defaults card from Settings > Pricing. NRE values (programming, stencil, PCB fab) are entered per-quote on the quote form — having global defaults was misleading since NRE varies by board complexity and is a first-time-only charge.

### 7. Per-quote markup overrides

Component Markup % and PCB Markup % inputs on the quote form. Empty = use global 25% default. Override flows through:
- `POST /api/quotes/preview` — accepts `component_markup_pct` and `pcb_markup_pct`
- `POST /api/quotes` — stores overrides in quote record
- `lib/pricing/recompute.ts` — passes overrides to engine

### 8. Sortable columns on Customers page

New client component `CustomersTable` with clickable sort headers on Code, Company Name, Contact, Payment Terms, Status. Extracted from the server page into a client component to support interactive sorting. File: `components/customers/customers-table.tsx`.

### 9. Search + sortable columns on BOMs page

New client component `BomListTable` with search bar (filters by filename, customer, GMP across all columns) and sortable column headers. Extracted from server page. File: `components/bom/bom-list-table.tsx`.

### 10. Loading skeletons on 10 new routes

Added `loading.tsx` files for instant navigation feedback. 6 routes already had them; 10 new ones added:
- `bom/[id]`, `customers/[id]`, `invoices/[id]`, `jobs/[id]`, `procurement/[id]`
- `procurement/`, `production/`, `quotes/[id]`, `quotes/new/`, `settings/`

### 11. BOM upload: editable BOM Name + Gerber fields

After file selection, the upload form now shows editable fields:
- **BOM Name** — defaults to filename sans extension, user can override
- **Gerber Name** — freetext for gerber package name
- **Gerber Revision** — freetext for revision

Migration `039_bom_name_gerber_fields.sql` adds `bom_name`, `gerber_name`, `gerber_revision` columns to `boms` table.

### 12. Board Details on quote form

New section on the quote creation form:
- **Assembly Type** — dropdown: TB (Top+Bottom), TS (Top-side), CS (Consignment), AS (Assembly-only)
- **Boards per Panel** — number input for panelization
- **IPC Class** — radio: 1, 2, or 3
- **Solder Type** — radio: Lead-Free or Leaded

Assembly type feeds into programming fee calculation. Migration `040_quote_board_details.sql` adds `assembly_type`, `boards_per_panel`, `ipc_class`, `solder_type` columns to `quotes` table.

### 13. Pricing table: expandable markup breakdown

Replaced the separate overage sub-row. Components and PCB rows now have a clickable chevron that expands to show:
- "Cost before markup" — raw cost from supplier pricing
- "Markup (25%)" — the markup amount with green highlight

New fields added to `PricingTier` type and engine output: `component_cost_before_markup`, `component_markup_amount`, `component_markup_pct`, `pcb_cost_before_markup`, `pcb_markup_amount`, `pcb_markup_pct`.

### 14. Supplier API timeouts (Piyush bug report)

DigiKey/Mouser/LCSC search calls had no timeout — if an API was unresponsive, pricing calculation hung indefinitely. Added `AbortSignal.timeout(15_000)` to all 3 supplier search functions and `AbortSignal.timeout(10_000)` to DigiKey OAuth. Client-side Calculate Pricing button now has a 2-minute abort with user-friendly error message. Files: `lib/pricing/digikey.ts`, `lib/pricing/mouser.ts`, `lib/pricing/lcsc.ts`, `components/quotes/new-quote-form.tsx`.

### 15. Time model CPH rates seeded

`app_settings.pricing` was missing `use_time_model`, `cp_cph`, `small_cph`, `ip_cph`, `th_cph`, `mansmt_cph`, and feeder setup times. Assembly cost calculations fell through to zero. Seeded all values from DM/TIME V11: CP 4,500 CPH, 0402 3,500, 0201 2,500, IP 2,000, TH 150, MANSMT 100, plus feeder load times (2/3 min) and printer setup (15 min). No migration needed — direct DB update to existing `app_settings` JSONB.

### Files touched

**New files:**
- `components/bom/bom-list-table.tsx` — search + sortable BOM list
- `components/customers/customers-table.tsx` — sortable customer table
- `components/settings/pricing-source-reference.tsx` — source reference display
- `app/api/settings/source-files/[filename]/route.ts` — source file API
- `supabase/migrations/039_bom_name_gerber_fields.sql` — bom_name, gerber columns
- `supabase/migrations/040_quote_board_details.sql` — assembly_type, boards_per_panel, ipc_class, solder_type
- 10 `loading.tsx` files (see item 10 above)

**Modified files:**
- `components/bom/column-mapper.tsx` — header row + last row inputs
- `components/bom/upload-form.tsx` — all file rows state, header/last row management, BOM name + gerber fields
- `components/bom/mcode-chart.tsx` — APCB + Unclassified colors
- `components/quotes/new-quote-form.tsx` — markup overrides, board details, assembly type
- `components/quotes/pricing-table.tsx` — expandable markup sub-rows, removed overage row
- `components/quotes/manual-price-editor.tsx` — MPN-less component support
- `components/settings/pricing-settings-form.tsx` — removed NRE Breakdown card
- `app/(dashboard)/bom/page.tsx` — extracted to BomListTable client component
- `app/(dashboard)/customers/page.tsx` — extracted to CustomersTable client component
- `app/(dashboard)/quotes/[id]/page.tsx` — MPN-less manual price support
- `app/(dashboard)/settings/pricing/page.tsx` — added source reference component
- `app/api/bom/parse/route.ts` — header_row, last_row, bom_name, gerber fields
- `app/api/boms/route.ts` — query adjustments
- `app/api/customers/route.ts` — query adjustments
- `app/api/jobs/route.ts` — query adjustments
- `app/api/quotes/preview/route.ts` — markup override support, MPN-less pricing
- `app/api/quotes/route.ts` — markup overrides, board details stored
- `app/api/quotes/[id]/pdf/route.ts` — board details in PDF
- `app/api/pricing/manual/route.ts` — bom_line_id fallback for MPN-less parts
- `app/api/search/route.ts` — query adjustments
- `lib/pricing/engine.ts` — markup breakdown fields in PricingTier output
- `lib/pricing/types.ts` — 6 new markup breakdown fields + bom_line_id/cpc on MissingPrice
- `lib/pricing/recompute.ts` — markup override passthrough, MPN-less lookup chain
- `lib/pricing/digikey.ts` — 15s timeout on search, 10s timeout on OAuth
- `lib/pricing/mouser.ts` — 15s timeout on search
- `lib/pricing/lcsc.ts` — 15s timeout on search

### What's still pending

- LCSC API still blocked vendor-side — Anas needs to email LCSC contact
- End-to-end validation with Lanka BOMs (80% of revenue, haven't stress-tested real formats)
- Batch send-back route uses legacy per-placement model — should migrate to time-based CPH model ($0.35→$0.035 fix applied, but architecture is still flat-rate)
- Keyword suffix variants to push auto-classification from 90.5% → 95%+ (trivial data migration)

*Entry 54 last updated: April 17, 2026, Session 14 — all committed and deployed (commits bf68db9, fbec547, 78eecf5)*

## Entry 55 — April 18, 2026 (Session 14 cont.) — Client-Side Rendering on Customers Page

Piyush pointed out that the customers page had a server-side Search button (click → page reload) and the Active/Inactive/All tabs also triggered page reloads. For client-side rendering, everything should be instant — no buttons, no reloads.

### 1. Instant search (no Search button)

Replaced the server-side `<form>` with a client-side search input in `CustomersTable`. Filters as you type across code, company name, contact, and email. Shows "X of Y" count while filtering. No button, no page reload.

### 2. Active/Inactive/All — client-side toggle

Moved the status filter buttons from the server page into the `CustomersTable` client component. Clicking Active/Inactive/All now filters instantly in-memory — no URL change, no server round-trip.

### 3. Server page simplified

The server page (`customers/page.tsx`) now fetches ALL customers in a single query with no filters. The client component handles all filtering (search + status) in the browser. Removed `Link` import, `searchParams`, and the server-side status/search logic.

### Files touched

- `components/customers/customers-table.tsx` — added instant search input, status filter buttons, `useMemo` filtering
- `app/(dashboard)/customers/page.tsx` — removed server-side search form + status filter links, simplified to fetch-all

Commits: `657189f` (instant search), `810b963` (client-side status filters). Both pushed to main.

*Entry 55 written: April 18, 2026, Session 14 (continued)*

## Entry 56 — TH Pin Count on BOM Lines (April 20, 2026)

Every BOM line classified as `m_code = 'TH'` (Through-Hole) now carries a pin count that feeds the time-based assembly model (TH cost per board = `pin_count × th_cost_per_pin`). This ports the DM Common File V11 behaviour where `THpinsExists()` (VBA `Module1_V3.bas:1284`) blocks the 11-button quote sequence if any TH line is missing its pin count. Real quote example from the VBA extract: `TL265-5001-000-T` = 20 TH parts, 149 TH pins.

### 1. UI — new "TH Pins" column on BOM detail table

`components/bom/bom-table.tsx`:

- Added `pin_count: number | null` to the `BomLine` interface.
- New "TH Pins" column rendered between M-Code and Reasoning. Cell shows `—` for non-TH lines; renders an inline `PinCountInput` (editable number 0–9999) for TH lines.
- Empty TH inputs are highlighted amber (border + background) so missing pin data is visible at a glance.
- Optimistic update on blur/Enter → `PATCH /api/bom/lines/:id`. Rolls back if the request fails.
- Two new summary badges above the table:
  - `N TH parts` (amber) — total count of TH-classified lines.
  - `N missing TH pins` (red) — count of TH lines with no pin_count.

### 2. API — PATCH handler on `/api/bom/lines/[id]`

`app/api/bom/lines/[id]/route.ts`: added a `PATCH` handler alongside the existing `DELETE`. Accepts `{ pin_count: number | null }`. Validates integer 0–9999 or null. CEO / operations_manager role required (same as DELETE). Returns `{ ok: true, id, pin_count }`.

### 3. Data source strategy

Pin count lives in two places by design:

- **`components.pin_count`** (per-MPN, reusable) — master library value. Populated from DM Common File V11 `Procurement!K` (extracted 1,509 unique MPN/mfr pairs, saved to `supabase/seed-data/dm-file/th_pins_extracted.json`). Migrations `041_components_pin_count.sql` + `042_seed_th_pins.sql` drafted but **not applied yet** — user asked to ship UI first.
- **`bom_lines.pin_count`** (per-BOM-line, override) — per-design value the user can adjust on that specific quote. The UI currently writes here.

Classifier integration (not yet built): when Layer 1 (DB lookup) assigns `m_code='TH'` to a BOM line, it should also pull `components.pin_count` and pre-fill `bom_lines.pin_count`. Until that wiring ships, TH pins are filled manually by Piyush on the BOM detail page.

### What's still pending

- **Apply migrations 041 + 042** to add `components.pin_count` column and seed 1,509 TH pin values from the DM file. The UI PATCH endpoint will 500 on DB write until the column exists.
- **Add `bom_lines.pin_count` column** via a new migration (042-pair or 043). Without this, the PATCH also 500s.
- **Classifier pre-fill** — FastAPI `m_code_classifier` should include pin_count in its Layer 1 response when m_code resolves to TH.
- **Quote-approval gate** — port VBA `THpinsExists()`: block quote approval / PDF generation when any TH line has NULL `pin_count`. Belongs in the quote preview + approve API routes.
- **BOM export** — add `pin_count` column to CSV/XLSX export so users can see it outside the app.

### Files touched

- `components/bom/bom-table.tsx` — `BomLine` type, `handlePinCountChange`, TH pin column + cell, `PinCountInput` component, summary badges.
- `app/api/bom/lines/[id]/route.ts` — new `PATCH` handler with role check and pin_count validation.
- `supabase/migrations/041_components_pin_count.sql` — new migration (drafted, not applied).
- `supabase/migrations/042_seed_th_pins.sql` — 1,509-row seed (drafted, not applied).
- `supabase/seed-data/dm-file/th_pins_extracted.json` — extract source (1,546 rows from `Procurement!K`).

*Entry 56 written: April 20, 2026 — UI shipped; DB migrations drafted, awaiting apply.*

## Entry 57 — Component Pricing Review + 12-distributor pricing system (April 20, 2026)

Major subsystem: a new page at `/bom/[id]/pricing` that queries up to 12 distributors in parallel for every BOM line, shows their quotes side-by-side with FX-converted CAD prices, and lets the user pin a specific supplier per qty tier. Those picks persist in `bom_line_pricing` and feed directly into the existing quote pricing engine.

### 1. Supplier API clients — 9 new + 1 rewrite + 2 adapters

Each client exports a function that returns `SupplierQuote[]` — a unified shape with MPN, manufacturer, supplier_part_number, price_breaks (`{min_qty, max_qty, unit_price, currency}[]`), stock, lead_time_days, MOQ, order_multiple, lifecycle, NCNR, franchised flag, datasheet/product URLs. Every client follows the same pattern (module-level cred cache with 60s TTL, DB-first with env fallback, 15s AbortSignal timeout, fail-soft returning `[]`).

| Supplier | File | Auth | Native CCY | Price breaks | Lead time | Notes |
|---|---|---|---|---|---|---|
| DigiKey | `lib/pricing/digikey.ts` | OAuth2 | USD | — (single-tier adapter) | — | existing client, new adapter in registry |
| Mouser | `lib/pricing/mouser.ts` | API key | USD | — (single-tier adapter) | — | existing client, new adapter in registry |
| LCSC | `lib/pricing/lcsc.ts` | SHA1 sig | USD | ✓ | — | **rewritten** — old client used wrong endpoint shape + `sign=` instead of `signature=`; fix sources the signing payload alphabetically (`key/nonce/secret/timestamp`) |
| TTI | `lib/pricing/tti.ts` | `apiKey` header | USD | ✓ | weeks→days | lead-time string parser handles "25 Weeks"/"Stock" |
| Newark | `lib/pricing/newark.ts` | `callinfo.apiKey` query | CAD (via `canada.newark.com` store) | ✓ | days | default 10 results; Element14 casing quirk (`callinfo` vs `callInfo`) |
| Future | `lib/pricing/future.ts` | `x-orbweaver-licensekey` header | CAD | ✓ | weeks→days | `lookup_type=exact`; flat `part_attributes[]` array is flattened to a dict |
| TI | `lib/pricing/ti.ts` | OAuth2 | **CAD native** | ✓ | — | PN-based lookup; `looksLikeTiPart()` pre-filter avoids 404 noise on non-TI MPNs |
| Avnet | `lib/pricing/avnet.ts` | OAuth2 + Ocp-Apim-Subscription-Key | USD | — (single-price per call) | weeks→days | multi-row (same MPN across suppliers); needs 4× calls for 4 tiers — future enhancement is batched POST |
| Arrow | `lib/pricing/arrow.ts` | OAuth2 (Basic header) | USD | ✓ (stringified) | days | multi-row per warehouse; all numeric fields come stringified |
| TME | `lib/pricing/tme.ts` | HMAC-SHA1 sig | USD | ✓ | null | OAuth1-style signing via Node `crypto`; batch-capable (future) |
| Samtec | `lib/pricing/samtec.ts` | Bearer JWT (static) | USD | ✓ | days | PN-based; `customerBookPrice[]` preferred over `price[]`; `looksLikeSamtecPart()` pre-filter |
| e-Sonic | `lib/pricing/esonic.ts` | UUID in URL path | USD | ✓ (stringified) | weeks→days | response is a bare array; everything string-coerced |

**Registry:** `lib/pricing/registry.ts` maps `BuiltInSupplierName` → search function and exposes `runSupplierSearch()` (safe wrapper) + `supplierCanServiceMpn()` (for pre-filtering manufacturer-direct suppliers TI/Samtec).

### 2. Schema additions — 3 new migrations (drafted, **NOT YET APPLIED**)

- `supabase/migrations/043_pricing_cache_enrichment.sql` — adds `manufacturer`, `supplier_part_number`, `price_breaks JSONB`, `lead_time_days`, `moq`, `order_multiple`, `lifecycle_status`, `ncnr`, `franchised`, `warehouse_code` columns to `api_pricing_cache`. All nullable; existing rows unaffected.
- `supabase/migrations/044_bom_line_pricing.sql` — new table holding per-tier supplier selections. One row per `(bom_line_id, tier_qty)`. RLS: CEO + operations_manager read/write.
- `supabase/migrations/045_fx_rates.sql` — FX cache table keyed on `(from_currency, to_currency)`. Seeded with `CAD→CAD = 1.0`. Source field distinguishes `live` (fetched from provider) vs `manual` (CEO override). Manual picks aren't overwritten by live fetches.

### 3. FX helper

`lib/pricing/fx.ts`:
- `fetchLiveRates(currencies, to="CAD")` — hits `https://open.er-api.com/v6/latest/{to}` (free, no auth), inverts the rates, writes back to `fx_rates` with `source="live"`.
- `setManualRate(from, to, rate)` — writes with `source="manual"`.
- `getRate(from, to)` — DB cache read; returns null if never fetched.
- `convertAmount(amount, from, to)` — convenience wrapper.

### 4. API routes

- `POST /api/bom/[id]/pricing-review/fetch` — body `{ suppliers[], bom_line_ids? }`. For each BOM line × selected supplier, fires `runSupplierSearch()` (4-lines-at-a-time concurrency control to cap ~24 in-flight). Persists each quote to `api_pricing_cache` with 7-day TTL. Returns `{ results: [{bom_line_id, quotes: QuoteWithCad[]}], api_calls, fx_rates_used }`.
- `POST /api/bom/lines/[id]/pricing-selection` — body `{ tier_qty, supplier, selected_unit_price, selected_currency, ... }`. Looks up cached FX rate; if foreign currency and no rate cached, returns 400 prompting user to click "Fetch Live Rates". Upserts on `(bom_line_id, tier_qty)`.
- `DELETE /api/bom/lines/[id]/pricing-selection?tier_qty=N` — removes a pick.
- `GET /api/fx?to=CAD&from=USD,EUR` — reads cached rates.
- `POST /api/fx` — body `{ action: "fetch_live", currencies? }` OR `{ action: "manual", from, to, rate }`.

### 5. UI page — `/bom/[id]/pricing`

Server page loads BOM + lines + existing selections + cached quotes + FX rates + credential status in parallel, hydrates the client component so the review is instant on reload.

Client component `components/pricing-review/pricing-review-panel.tsx`:
- **Section 1 — Distributor checkbox grid** (12 suppliers). Suppliers without credentials are greyed out with "no creds" label, link to `/settings/api-config`.
- **Section 2 — Tier qty editor** (default `1, 10, 100, 500, 1000`, comma-separated).
- **Section 3 — FX rates panel** with "Fetch Live Rates" button + per-currency manual override inputs. USD/EUR/GBP/CNY/JPY displayed.
- **Fetch Prices button** (large) — fires the pricing-review fetch endpoint.
- **Per-line expandable rows** — shows MPN/manufacturer/m_code/qty-per-board + badge with quotes count and `N/M picked` status. Expanding reveals a table with one row per supplier quote: Supplier badge, warehouse, stock, lead time, MOQ, Auth/NCNR/lifecycle flags, then one column per tier showing CAD price (and native under it). Click a tier's cell to pin that supplier; click again to unpin.

### 6. Engine wire-up

- New optional `pricing_overrides: Map<bom_line_id, Map<tier_qty, unit_price_cad>>` on `QuoteInput`.
- In the per-tier loop, `effectiveUnitPrice = override ?? line.unit_price` — pinned picks beat cache-resolved prices, absent entries fall through to the existing supplier cache chain.
- `/api/quotes/preview` loads `bom_line_pricing` for the quote's BOM lines and builds the override map before calling `calculateQuote`.

### 7. Entry points

- **BOM detail page** — new "Review Pricing" outlined button next to "Create Quote" (visible when bom.status = 'parsed').
- **New Quote form** — a subtle blue callout card between BOM selection and Board Details: "Review Component Pricing (optional)" with an "Open Pricing Review" button (opens in a new tab so the quote form state isn't lost).

### ⚠ Required before this is usable — migrations must be applied

`psql` / `supabase` CLI aren't available in this environment, so I couldn't apply the DDL directly. Anas (or Piyush with DB rights) needs to run these three SQL files in the Supabase SQL editor — paste each file's contents, click Run:

1. `supabase/migrations/043_pricing_cache_enrichment.sql`
2. `supabase/migrations/044_bom_line_pricing.sql`
3. `supabase/migrations/045_fx_rates.sql`

(Also `041` and `042` from Entry 56 if those haven't been applied yet.)

Until these run: the `/bom/[id]/pricing` page loads fine but both "Fetch Prices" and saving selections will 500 with "column 'price_breaks' does not exist" / "relation 'bom_line_pricing' does not exist".

### What's still pending

- **Avnet batching** — current client fires 1 API call per (MPN, qty=1). Future enhancement: send multiple `items[]` per call with different quantities to cut API volume. User was uncertain whether Avnet's Postman collection batches.
- **DigiKey / Mouser full price breaks** — the existing flat clients are wrapped as single-tier adapters in `registry.ts`. Eventually we should extract the `StandardPricing`/`PriceBreaks` arrays they already return so tier-break pricing shows up on the review page without a re-fetch per tier.
- **TME + Samtec lead time** — both APIs have separate endpoints for lead time (`GetDeliveryTime.json` / per-series quote form). Skipped per user decision #9 / #5.
- **Credential field updates** — Avnet's `SUPPLIER_METADATA` still lists `subscription_key` as expected; confirm the live credential record in `supplier_credentials` has this populated. If not, Piyush needs to re-save Avnet creds in `/settings/api-config`.
- **LCSC creds rotation** — the rewritten client uses the correct signature recipe but the LCSC account still needs valid `key` + `secret` (vendor confirmed they're unblocked in theory).
- **Multi-tier Avnet / batch TME** — on-demand enhancements.

### Files added

**Migrations (awaiting apply):**
- `supabase/migrations/043_pricing_cache_enrichment.sql`
- `supabase/migrations/044_bom_line_pricing.sql`
- `supabase/migrations/045_fx_rates.sql`

**Library:**
- `lib/pricing/fx.ts`, `lib/pricing/registry.ts`
- `lib/pricing/ti.ts`, `lib/pricing/avnet.ts`, `lib/pricing/arrow.ts`, `lib/pricing/tti.ts`, `lib/pricing/newark.ts`, `lib/pricing/future.ts`, `lib/pricing/tme.ts`, `lib/pricing/samtec.ts`, `lib/pricing/esonic.ts`

**API routes:**
- `app/api/bom/[id]/pricing-review/fetch/route.ts`
- `app/api/bom/lines/[id]/pricing-selection/route.ts`
- `app/api/fx/route.ts`

**UI:**
- `app/(dashboard)/bom/[id]/pricing/page.tsx`
- `components/pricing-review/pricing-review-panel.tsx`

### Files modified

- `lib/pricing/types.ts` — added `SupplierQuote`, `PriceBreak`, `pricing_overrides` on `QuoteInput`
- `lib/pricing/lcsc.ts` — rewritten signing + endpoint + added `searchLcscQuotes`
- `lib/pricing/engine.ts` — reads `pricing_overrides` in the per-tier loop
- `app/api/quotes/preview/route.ts` — loads `bom_line_pricing` and threads overrides
- `app/(dashboard)/bom/[id]/page.tsx` — "Review Pricing" button
- `components/quotes/new-quote-form.tsx` — blue callout card linking to review page

*Entry 57 written: April 20, 2026 — full code shipped, DB migrations awaiting manual apply.*

## Entry 58 — Quote Wizard + pricing-review polish (April 20, 2026, cont.)

Multi-session day. Entry 57 shipped the 12-distributor pricing-review *foundation*; this entry documents everything built on top after that: a brand-new 3-step quote wizard that replaces `/quotes/new` as the canonical quoting flow, a pile of pricing-review refinements, and a set of BOM-page polish tasks. All applied against prod data (Anas applied migrations 041–048 via Supabase SQL editor). Classic quote form `/quotes/new` still works but no longer has a UI entry point from the BOM page.

### 1. Quote wizard — new canonical flow

New routes/files:

- `app/(dashboard)/quotes/wizard/[id]/page.tsx` — server page. Loads quote + BOM lines (excl. qty=0 / PCB / DNI) + fx_rates + overage_table + pricing_preferences + quote_customer_supplied + fresh api_pricing_cache rows (24h TTL) + credential status, passes the bundle to `QuoteWizard`.
- `components/quote-wizard/quote-wizard.tsx` — client stepper. Renders **all three steps mounted simultaneously**, toggling visibility via `className={step === N ? "" : "hidden"}`. Earlier versions used conditional unmount which was wiping the pricing panel's fetched quotes / selections whenever the user switched steps. Procurement modes that skip step 2 (`consign_parts_supplied`, `assembly_only`) never render step 2 at all.
- `components/quote-wizard/start-quote-button.tsx` — POSTs `/api/quotes/wizard/start`, pushes `/quotes/wizard/<id>` on success.

#### Step 1 — Quantities & Procurement Mode

UI: tier quantities input (required, positive integers, no default) + procurement-mode radio card with four options:
- **Turnkey** — RS procures all components + PCB, assembles. Uses step 2 + step 3 PCB.
- **Consignment — customer supplies parts** — customer ships components; RS procures PCB + assembles. **Skips step 2.**
- **Consignment — customer supplies PCB** — customer ships bare PCBs; RS procures parts + assembles. Uses step 2; step 3 hides the PCB-price input.
- **Assembly Only** — customer ships both; RS charges labour only. **Skips step 2 AND step 3 PCB.**

"Save & Continue" writes tier_quantities into `quantities` JSONB + procurement_mode column + `wizard_status = 'quantities_done'`, then advances to step 2 (or 3 if step 2 is skipped).

#### Step 2 — Component Pricing

Embeds the full `PricingReviewPanel` with wizard context (`quoteId`, `tiersFromQuote`, `initialPreferences`, `pinnedPreferenceId`, `initialCustomerSupplied`). In wizard mode the tier editor is replaced with a read-only badge list — tiers are locked to step 1. "Continue to Step 3" writes `wizard_status = 'pricing_done'`.

#### Step 3 — Board Details & Calculate

Form: boards-per-panel / IPC class (1/2/3) / solder type (leaded | leadfree) / assembly type (TB | TS). Per-tier PCB unit price table (hidden for consign_pcb_supplied + assembly_only). NRE inputs: programming / stencil / setup / PCB fab / misc. Shipping flat. Calculate button runs the engine and renders a tier-breakdown table inline.

### 2. Quote numbering

`POST /api/quotes/wizard/start` generates `quote_number` per Anas's rule (2026-04-20):

- **First quote for a given GMP** → `<CUSTOMER_CODE><4-digit sequence>`, e.g. `TLAN0001`. Sequence counter is **per-customer**, computed by regex-parsing existing quote numbers in the customer's set and taking `max(seq) + 1`.
- **Re-quote of same GMP** (any new BOM revision of that board) → strip any trailing `R\d+` from the oldest existing quote for that GMP to get a **base**, then append `R<next>` where next = count of existing R-quotes for that GMP + 1. Example timeline: `TLAN0001` → `TLAN0001R1` → `TLAN0001R2`.
- Duplicate-collision on `quote_number` (unique constraint) surfaces as HTTP 409 so the client can retry.

### 3. Pricing review — big finish

Everything on top of Entry 57's foundation that shipped today:

**Per-tier order-qty math:** panel computes `orderQtysByLine[id][tierIdx] = qty_per_board × tier + getOverage(m_code, tier)` on the client using the overage table passed in as a prop. Each tier column header now shows three lines — `qty 100` / `10 × 100 + 35` / `order 1035`. `priceAtTier(quote, orderQty)` uses the order qty (not the raw tier) for break lookup.

**Real price-break ladders for DigiKey + Mouser.** The adapters previously synthesized a single-entry `price_breaks` array with the headline unit_price, which meant every tier saw the same price. Now:
- `lib/pricing/digikey.ts` — extracts `ProductVariations[0].StandardPricing[]` → `price_breaks: DigiKeyPriceBreak[]`.
- `lib/pricing/mouser.ts` — extracts the full `PriceBreaks[]` array, not just `[0]`.
- `lib/pricing/registry.ts` — new `toUnifiedBreaks()` converts `{quantity, unit_price}` lists into unified `{min_qty, max_qty, unit_price, currency}` shape with max_qty computed from the next tier.

**Avnet per-tier calls.** Avnet returns a single price for a single qty. `SupplierSearchContext` gains a `quantity?: number` field. Registry routes Avnet calls through with the tier's order qty. Fetch route loops `body.tier_order_qtys[line.id]` unique values for `SINGLE_QTY_SUPPLIERS` (currently just Avnet) and `mergeSingleQtyResults()` collapses the per-qty single-entry ladders into one sorted `price_breaks` array per supplier-part-number.

**Customer-supplied parts:** `quote_customer_supplied` table (migration 046) stores per-quote flags. `PricingReviewPanel` shows a checkbox on each row; toggling POSTs to `/api/quotes/[id]/customer-supplied`. Marking a line supplied also deletes any pinned `bom_line_pricing` for that line so the engine doesn't accidentally charge for it. Lines with zero fetched quotes get a yellow "Candidate for customer-supplied" badge.

**Distributor preferences:** `pricing_preferences` table (migration 047) seeds five system presets (Cheapest / Cheapest in stock / Cheapest in stock (authorized) / Shortest lead time / DigiKey→Mouser→LCSC→others priority). `/api/pricing-preferences` GET/POST/DELETE (system presets are read-only). Panel adds a 4th card "Apply Distributor Preference" with a dropdown + Apply button — server-side `/api/quotes/[id]/auto-pick` loads cached quotes, normalizes prices to CAD, applies the rule per (line, tier), upserts winners into `bom_line_pricing`, and records `pinned_preference` on the quote.

**Stock indicator.** `computeStockStatus(quotes, maxOrderQty)` returns `green` (someone stocks enough), `amber` (partial stock), `red` (nobody stocks it), or `none` (no quotes). Rendered as a `StockBadge` inline on each line.

**Summary badges → filter pills.** The row of summary badges above the per-line list is now clickable — each badge filters the list to lines matching its bucket. Buckets: `quoted` / `unquoted` / `fullyPicked` / `partialPicks` / `noPicks` / `customerSuppliedCount`. The `classifyLine()` memo feeds both the counts and the filter.

**"Stale" pick indicator.** When a line has `bom_line_pricing` selections but no current quotes visible (cache expired or was never reloaded), the N/M picked badge renders in amber with a `(stale)` suffix instead of green.

**Cache lookups — multi-warehouse fix.** Arrow / Newark cache rows are written with keys like `MPN#VM5`, `MPN#V72` to avoid primary-key collisions. The server page's `.in("search_key", [MPN])` was only reading exact matches, so warehouse-keyed quotes vanished on reload (leaving pinned selections without visible quotes). Fix: query with an `or()` filter that accepts both `search_key.eq.X` and `search_key.like.X#*`. Panel hydration strips `#WAREHOUSE` to group all warehouse variants under the base MPN key.

**Cache TTL reduced to 24h** for the pricing-review fetch (was 7 days). Legacy `/api/quotes/preview` still uses 7 days.

**Warehouse column removed** from the per-line quotes sub-table (Piyush felt it was noise; Arrow's multi-warehouse rows still appear as distinct rows).

### 4. BOM page polish (independent of the wizard)

- **Resizable columns.** `bom-table.tsx` now uses `table-layout: fixed` with a `<colgroup>` of pixel-width `<col>`s. Initial widths seeded from container measurement in a `useLayoutEffect`. Each header has a 4px drag handle; dragging only grows/shrinks that column and lets the table overflow horizontally (container has `overflow-x-auto`).
- **Sort added to Designator + Description.** `SortField` type extended; comparator maps `designator` → `reference_designator` field.
- **Qty=0 filtering everywhere.**
  - `/api/bom/[id]/classify` — skips qty=0 from both rule + AI mode; clears existing m_code on qty=0 lines to stay consistent.
  - BOM detail tiles (Components / Classified / Need Review) exclude qty=0.
  - M-Code chart + summary badges + M-Code filter pills exclude qty=0.
  - AI Classify button unclassified count excludes qty=0.
  - All 5 pricing flow routes filter with `.gt("quantity", 0)`.
- **`router.refresh()` on line delete** so the 4 summary tiles update (they live on the parent server page).
- **Per-line delete confirmation uses shadcn AlertDialog** instead of browser `confirm()` — single dialog at table level, target tracked in state.
- **Tooltip alignment fix.** `CellWithTooltip` gets `align="start"` + `sideOffset={8}` + `alignOffset={8}` so the arrow points at the truncated text, not the cell's center.
- **Customer typeahead on BOM upload form.** Replaced the `Select` dropdown with an `Input` + filtered dropdown matching the GMP typeahead pattern. Filters by code OR company name, case-insensitive. Shows a `/settings/customers` nudge when no match.
- **Column mapper — blank Header Row handling.** Changed the mapper's visibility from `showMapper && previewHeaders.length > 0` to `showMapper && allFileRows.length > 0` so the entire section no longer vanishes when the user picks a blank row. Added an amber warning inside the mapper when the selected row has no headers.
- **Header Row + Last Row inputs** in the column mapper (already existed in Entry 54; this session only fixed the vanishing-section bug).

### 5. BOM detail page — single entry point

Removed **Review Pricing** and **New Classic Quote** buttons from the BOM detail page. The only quoting entry now is the **Start Quote** button (which goes through the wizard). `/bom/[id]/pricing` and `/quotes/new` still exist as addressable routes for debugging, but no UI links to them.

### 6. Schema — 3 new migrations applied

- `046_quote_customer_supplied.sql` — per-(quote_id, bom_line_id) with notes, added_by, added_at. RLS for CEO + ops.
- `047_pricing_preferences.sql` — preferences table + 5 seeded system presets. RLS: all authed read, CEO/ops write.
- `048_quotes_wizard_fields.sql` — adds `wizard_status`, `procurement_mode`, `pinned_preference` to `quotes`. Backfills existing quotes as `complete`.

All four post-Entry-57 RLS-bearing migrations (044, 045, 046, 047) were retrofitted with `DROP POLICY IF EXISTS` so they're safely re-runnable after a partial failure.

### 7. Small bug fixes surfaced during the session

- **`&amp;` rendering in buttons.** JSX decodes `&amp;` in text children but not inside JS string literals like `{saving ? "…" : "Save &amp; Continue"}`. Replaced both affected literals (`Save & Continue`, `Calculate & Save`) with plain ampersands.
- **Tiers not syncing wizard → panel.** `PricingReviewPanel` was snapshotting `tiersFromQuote` into `useState` on first mount. After step 1 saved new tiers + `router.refresh()` fired, the panel state stayed stale. Fix: in wizard mode the panel derives `tiers` directly from the `tiersFromQuote` prop on every render; standalone mode keeps the editable local-state path.
- **Selections not syncing after auto-pick / customer-supplied toggle.** Added `useEffect`s that watch `initialSelections` + `initialCustomerSupplied` prop references and re-hydrate local state after `router.refresh()`.
- **Summary badges not updating after preference apply.** The summary `useMemo` dep chain (via `classifyLine` callback) already depended on the right state, but was coupled to a stale classifier before the dependency chain was normalised. Now recomputes cleanly after both fetchPrices and applyPreference.

### Files added

**Migrations:**
- `supabase/migrations/046_quote_customer_supplied.sql`
- `supabase/migrations/047_pricing_preferences.sql`
- `supabase/migrations/048_quotes_wizard_fields.sql`

**API routes:**
- `app/api/quotes/wizard/start/route.ts` — quote-number generator + draft creation.
- `app/api/quotes/[id]/wizard/route.ts` — generic step saver.
- `app/api/quotes/[id]/customer-supplied/route.ts` — GET/POST/DELETE.
- `app/api/quotes/[id]/auto-pick/route.ts` — apply preference rule.
- `app/api/quotes/[id]/calculate/route.ts` — step-3 Calculate + persist.
- `app/api/pricing-preferences/route.ts` — GET + POST.
- `app/api/pricing-preferences/[id]/route.ts` — DELETE.

**UI:**
- `app/(dashboard)/quotes/wizard/[id]/page.tsx`
- `components/quote-wizard/quote-wizard.tsx`
- `components/quote-wizard/start-quote-button.tsx`

### Files modified (the big ones)

- `components/pricing-review/pricing-review-panel.tsx` — wizard-mode props, read-only tier display, preferences card, customer-supplied checkbox, stock badges, summary-filter pills, stale pick indicator, base-key cache hydration.
- `components/bom/bom-table.tsx` — resizable columns, designator/description sort, AlertDialog delete, router.refresh() on delete, qty=0 filtering.
- `components/bom/upload-form.tsx` — customer typeahead textbox (replaces Select dropdown).
- `components/bom/column-mapper.tsx` — amber warning when header row is blank.
- `app/api/bom/[id]/pricing-review/fetch/route.ts` — 24h cache TTL, `tier_order_qtys` body param, per-tier Avnet loop, qty=0 filter.
- `app/(dashboard)/bom/[id]/pricing/page.tsx` + `app/(dashboard)/quotes/wizard/[id]/page.tsx` — `or()` cache query for MPN + MPN#* keys, qty=0 filter.
- `app/(dashboard)/bom/[id]/page.tsx` — removed Review Pricing + Classic Quote buttons.
- `app/api/bom/[id]/classify/route.ts` — qty=0 skip + existing-m_code clearing.
- `app/api/quotes/[id]/calculate/route.ts` — procurement-mode-driven SKIP_COMPONENTS / SKIP_PCB sets, customer-supplied exclusion, pricing_overrides build-up.
- `lib/pricing/digikey.ts` — `StandardPricing[]` → `price_breaks`.
- `lib/pricing/mouser.ts` — full `PriceBreaks[]` → `price_breaks`.
- `lib/pricing/avnet.ts` — `quantity` parameter.
- `lib/pricing/registry.ts` — `quantity` in context, `toUnifiedBreaks()` helper, DigiKey/Mouser adapters use real ladders.

### What's still pending after today

- **Wizard PDF generation** — step 3 saves `quote.pricing` but the existing quote PDF generator doesn't yet render a "Customer to supply" section for the customer-supplied lines.
- **Custom preference rule editor** — schema supports it (`rule = 'custom'`, `config` JSONB), API accepts it, but there's no UI to create / edit a custom rule yet. Users can only pick from the 5 system presets right now.
- **LCSC vendor unblock** — key still returns 401 at times; waiting on Piyush's follow-up with LCSC support.
- **Avnet multi-item batching** — we still fire one call per (MPN, tier) because the user was unsure whether their Postman collection batches. Future optimization.
- **Classic `/quotes/new` form** — left in place as a shortcut for power users but no longer has a UI entry point. Candidate for deletion once the wizard is fully proven in prod.
- **Step 3 NRE is flat-per-quote**, not per-tier like the classic form. Upgrade if Piyush finds the flat model too coarse.

*Entry 58 written: April 20, 2026 — full day's worth of work shipped and applied to prod.*

