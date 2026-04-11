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
- [ ] **Duplicate PAR rules** between `rules.ts` (in-code) and `m_code_rules` DB table — classifier uses in-code rules. Need to consolidate to DB-only.
- [ ] **Security: /api/pricing/[mpn] has no auth check** — anyone can query supplier APIs

### Nice to Have
- [ ] Copy button on M-code override cells (Anas requested)
- [ ] Guided workflow wizard (stepper component showing BOM → Classify → Quote → Job → PROC → Ship → Invoice)
- [ ] Email integration (send quotes/invoices)
- [ ] AI chat memory persistence
- [ ] Mobile responsiveness
- [ ] Volume-based price breaks from DigiKey/Mouser (per-tier pricing)

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

**Abdul's Wiki created** (ABDULS_WIKI.md — 1,934 lines):
- Complete tutorial explaining the entire system from zero context
- 10 parts: business, data model, M-codes, BOM parser, pricing, procurement, API layer, frontend, deployment, what's not built
- Written as a teaching document, not just reference tables

**Reference prompt created** for Anas to use in any AI tool working on the app.

**Fixes:**
- Create Procurement button was linking to non-existent page — created `/procurement/new` page with job details, overage explanation, and one-click procurement creation
- Print Copy BOM and Reception File buttons work (were failing when no BOM linked to job)

- Stencil/PCB orders page fixed — was crashing due to RLS on nested joins, switched to admin client with auth check
- Abdul's Wiki expanded to Part 14 (2,777 lines) — every page, every button, every field documented

**End state:** 27 tables, 58 API routes, 36 pages, ~30K lines TypeScript, 125+ commits. 4,026 components. Codebase clean.

*Last updated: April 11, 2026, Session 6*
