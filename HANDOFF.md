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

**End state:** 27 tables, 56 API routes, 34 pages, 77 components, ~30K lines TypeScript, 106 commits. Zero native dependencies. Clean database (customers + GMPs + rules + keywords remain, all transactional data wiped).

---

## Known Issues / Tech Debt

### Must Fix Soon
- [ ] **Duplicate PAR rules** between `rules.ts` (in-code) and `m_code_rules` DB table — classifier uses in-code rules. Need to consolidate to DB-only.

### Nice to Have
- [ ] Copy button on M-code override cells (Anas requested)
- [ ] Guided workflow wizard (stepper component showing BOM → Classify → Quote → Job → PROC → Ship → Invoice)
- [ ] Email integration (send quotes/invoices)
- [ ] AI chat memory persistence
- [ ] Mobile responsiveness

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

*Last updated: April 8, 2026, Session 3 (late)*
