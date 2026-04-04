# Sprint 4: Jobs + Procurement + Invoicing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full order lifecycle — quote acceptance creates a job, jobs flow through procurement and production to shipping, invoices are generated with GST/QST taxes, and payments are tracked.

**Architecture:** When a quote is accepted, a job is auto-created. Jobs move through statuses via a Kanban-style board. Each job spawns a procurement record with lines auto-populated from the BOM + overage. Production events are logged by shop floor users. Invoices are generated from completed jobs with Canadian tax calculation. PDFs use the same `@react-pdf/renderer` pattern from Sprint 3.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, `@react-pdf/renderer`, shadcn/ui, `@base-ui/react` (NOT Radix — no `asChild`, Select `onValueChange` takes `string | null`).

**Critical patterns:**
- `params` and `searchParams` are `Promise<{...}>` — always `await`
- Supabase join results: `as unknown as Type`
- Select `onValueChange`: guard with `if (!v) return`
- Server Supabase: `import { createClient } from "@/lib/supabase/server"`
- Job numbers: `JB-YYMM-CODE-NNN` (e.g. `JB-2604-TLAN-001`)
- Invoice numbers: `INV-YYMM-NNN` (e.g. `INV-2604-001`)
- Proc codes: `YYMM-CODE-TBNNN` (e.g. `2604-TLAN-TB001`)
- Tax: TPS/GST 5%, TVQ/QST 9.975%

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `components/sidebar.tsx` | Modify | Enable Jobs, Procurement, Invoices nav |
| `app/api/jobs/route.ts` | Create | GET list, POST create from accepted quote |
| `app/api/jobs/[id]/route.ts` | Create | GET detail, PATCH status |
| `app/api/procurements/route.ts` | Create | GET list, POST create from job |
| `app/api/procurements/[id]/route.ts` | Create | GET detail, PATCH receiving |
| `app/api/production/route.ts` | Create | POST log event |
| `app/api/invoices/route.ts` | Create | GET list, POST create from job |
| `app/api/invoices/[id]/route.ts` | Create | GET detail, PATCH status/payment |
| `app/api/invoices/[id]/pdf/route.ts` | Create | GET generate invoice PDF |
| `components/jobs/job-status-badge.tsx` | Create | Status badge with colours |
| `components/jobs/job-kanban.tsx` | Create | Kanban board by status |
| `components/invoices/invoice-pdf.tsx` | Create | Invoice PDF template |
| `components/invoices/invoice-status-badge.tsx` | Create | Invoice status badge |
| `app/(dashboard)/jobs/page.tsx` | Create | Job list / Kanban |
| `app/(dashboard)/jobs/[id]/page.tsx` | Create | Job detail + timeline |
| `app/(dashboard)/procurement/page.tsx` | Create | Procurement list |
| `app/(dashboard)/procurement/[id]/page.tsx` | Create | Procurement detail + receiving |
| `app/(dashboard)/production/page.tsx` | Create | Production dashboard |
| `app/(dashboard)/production/log/page.tsx` | Create | Shop floor event logger |
| `app/(dashboard)/invoices/page.tsx` | Create | Invoice list + aging |
| `app/(dashboard)/invoices/[id]/page.tsx` | Create | Invoice detail + payment |

---

## Task 1: Enable sidebar nav + job creation API

**Files:**
- Modify: `components/sidebar.tsx`
- Modify: `components/quotes/quote-actions.tsx`
- Create: `app/api/jobs/route.ts`

- [ ] **Step 1: Enable Jobs, Procurement, Production, Invoices in sidebar**

In `components/sidebar.tsx`, set `enabled: true` for Jobs, Procurement, Production, and Invoices entries.

- [ ] **Step 2: Create jobs API — GET list + POST create**

Create `app/api/jobs/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function generateJobNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerCode: string
): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `JB-${yy}${mm}-${customerCode}-`;
  const { count } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .like("job_number", `${prefix}%`);
  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const customerId = url.searchParams.get("customer_id");

  let query = supabase
    .from("jobs")
    .select("id, job_number, status, quantity, assembly_type, scheduled_start, scheduled_completion, created_at, customers(code, company_name), gmps(gmp_number, board_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);
  if (customerId) query = query.eq("customer_id", customerId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    quote_id: string;
    quantity: number;
    assembly_type?: string;
    scheduled_start?: string;
    scheduled_completion?: string;
    notes?: string;
  };

  if (!body.quote_id || !body.quantity) {
    return NextResponse.json({ error: "quote_id and quantity required" }, { status: 400 });
  }

  // Fetch quote with customer code
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, customer_id, gmp_id, bom_id, status, customers(code)")
    .eq("id", body.quote_id)
    .single();

  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  if (quote.status !== "accepted") {
    return NextResponse.json({ error: "Quote must be accepted before creating a job" }, { status: 400 });
  }

  const customer = quote.customers as unknown as { code: string } | null;
  const jobNumber = await generateJobNumber(supabase, customer?.code ?? "UNK");

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      job_number: jobNumber,
      quote_id: body.quote_id,
      customer_id: quote.customer_id,
      gmp_id: quote.gmp_id,
      bom_id: quote.bom_id,
      quantity: body.quantity,
      assembly_type: body.assembly_type ?? "TB",
      status: "created",
      scheduled_start: body.scheduled_start ?? null,
      scheduled_completion: body.scheduled_completion ?? null,
      notes: body.notes ?? null,
      created_by: user.id,
    })
    .select("id, job_number")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log status
  await supabase.from("job_status_log").insert({
    job_id: job.id, old_status: null, new_status: "created", changed_by: user.id,
  });

  return NextResponse.json(job);
}
```

- [ ] **Step 3: Add "Create Job" action to quote-actions when status=accepted**

Modify `components/quotes/quote-actions.tsx` to add a "Create Job" button when status is `accepted`. On click, POST to `/api/jobs` with `{ quote_id, quantity }` (quantity from the first tier), then redirect to `/jobs/${job.id}`.

Add to the STATUS_TRANSITIONS map:
```typescript
accepted: { label: "Create Job", next: "create_job" },
```

And handle the `create_job` case specially — instead of PATCHing the quote, POST to `/api/jobs`.

- [ ] **Step 4: Verify build and commit**

```bash
npm run build 2>&1 | tail -20
git add -A && git commit -m "feat: jobs API + enable nav + create job from accepted quote"
```

---

## Task 2: Jobs API — get detail + update status

**Files:**
- Create: `app/api/jobs/[id]/route.ts`

- [ ] **Step 1: Create the file**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_STATUSES = [
  "created", "procurement", "parts_ordered", "parts_received",
  "production", "inspection", "shipping", "delivered", "invoiced", "archived",
] as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job, error } = await supabase
    .from("jobs")
    .select("*, customers(code, company_name, contact_name), gmps(gmp_number, board_name), boms(file_name, revision), quotes(quote_number, pricing)")
    .eq("id", id)
    .single();

  if (error || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Fetch status log
  const { data: statusLog } = await supabase
    .from("job_status_log")
    .select("old_status, new_status, notes, created_at")
    .eq("job_id", id)
    .order("created_at", { ascending: true });

  // Fetch production events
  const { data: events } = await supabase
    .from("production_events")
    .select("event_type, notes, created_at")
    .eq("job_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ ...job, status_log: statusLog ?? [], production_events: events ?? [] });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { status?: string; notes?: string };

  if (body.status && !VALID_STATUSES.includes(body.status as typeof VALID_STATUSES[number])) {
    return NextResponse.json({ error: `Invalid status` }, { status: 400 });
  }

  // Get current status for log
  const { data: current } = await supabase.from("jobs").select("status").eq("id", id).single();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status) updates.status = body.status;
  if (body.notes !== undefined) updates.notes = body.notes;

  const { data, error } = await supabase
    .from("jobs")
    .update(updates)
    .eq("id", id)
    .select("id, job_number, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.status && current) {
    await supabase.from("job_status_log").insert({
      job_id: id, old_status: current.status, new_status: body.status,
      changed_by: user.id, notes: body.notes ?? null,
    });
  }

  return NextResponse.json(data);
}
```

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit && git add -A && git commit -m "feat: jobs API GET detail + PATCH status with status log"
```

---

## Task 3: Job status badge + Kanban components

**Files:**
- Create: `components/jobs/job-status-badge.tsx`
- Create: `components/jobs/job-kanban.tsx`

- [ ] **Step 1: Create job status badge**

```typescript
import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  created:        { label: "Created",        variant: "secondary" },
  procurement:    { label: "Procurement",    variant: "secondary" },
  parts_ordered:  { label: "Parts Ordered",  variant: "secondary" },
  parts_received: { label: "Parts Received", variant: "default" },
  production:     { label: "Production",     variant: "default" },
  inspection:     { label: "Inspection",     variant: "default" },
  shipping:       { label: "Shipping",       variant: "default" },
  delivered:      { label: "Delivered",       variant: "default" },
  invoiced:       { label: "Invoiced",       variant: "default" },
  archived:       { label: "Archived",       variant: "destructive" },
};

export function JobStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
```

- [ ] **Step 2: Create Kanban board component**

A "use client" component. Accepts `jobs` array. Groups by status into columns. Each card shows job number, customer, GMP, quantity. Click navigates to job detail.

Columns: Created → Procurement → Production → Shipping → Delivered → Invoiced.

Use simple CSS grid. Each column is a Card with a header and list of job cards inside.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit && git add components/jobs && git commit -m "feat: JobStatusBadge + JobKanban components"
```

---

## Task 4: Job list page + Job detail page

**Files:**
- Create: `app/(dashboard)/jobs/page.tsx`
- Create: `app/(dashboard)/jobs/[id]/page.tsx`

- [ ] **Step 1: Create job list page**

Server component. Fetches jobs from Supabase with customer/GMP joins. Renders the Kanban board. Also has a "Table View" with status filter tabs (like quotes page).

- [ ] **Step 2: Create job detail page**

Server component. Fetches job with all joins + status_log + production_events. Shows:
- Header: job number, customer, GMP, status badge
- Info cards: Quantity, Assembly Type, Quote #, Scheduled dates
- Status timeline (from job_status_log)
- Production events list
- Action buttons to advance status (similar to QuoteActions pattern)
- Link to procurement if status >= procurement

- [ ] **Step 3: Create job actions client component**

`components/jobs/job-actions.tsx` — "use client", shows button to advance to next status. Maps:
- created → procurement
- procurement → parts_ordered
- parts_ordered → parts_received
- parts_received → production
- production → inspection
- inspection → shipping
- shipping → delivered
- delivered → invoiced

On click: PATCH `/api/jobs/${id}` with `{ status: next }`, then `router.refresh()`.

- [ ] **Step 4: Verify and commit**

```bash
npm run build 2>&1 | tail -20
git add -A && git commit -m "feat: job list (Kanban + table) + job detail page with timeline"
```

---

## Task 5: Procurement API — create from job + receiving

**Files:**
- Create: `app/api/procurements/route.ts`
- Create: `app/api/procurements/[id]/route.ts`

- [ ] **Step 1: Create procurement list + create API**

POST creates a procurement from a job. Auto-generates proc_code as `YYMM-CODE-TBNNN`. Auto-populates procurement_lines from bom_lines + overage table.

GET lists procurements with status filters.

- [ ] **Step 2: Create procurement detail + receiving API**

GET returns procurement with all lines.

PATCH `/api/procurements/[id]` accepts `{ line_id, qty_received }` to mark individual lines as received. Updates procurement counts.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit && git add -A && git commit -m "feat: procurement API (create from job, line-by-line receiving)"
```

---

## Task 6: Procurement pages

**Files:**
- Create: `app/(dashboard)/procurement/page.tsx`
- Create: `app/(dashboard)/procurement/[id]/page.tsx`

- [ ] **Step 1: Create procurement list page**

Server component. Lists procurements with job reference, status, line counts.

- [ ] **Step 2: Create procurement detail page**

Shows proc_code, job link, line-by-line table with: MPN, description, M-Code, qty needed, qty ordered, qty received, status. "Mark Received" button per line.

- [ ] **Step 3: Verify and commit**

```bash
npm run build 2>&1 | tail -20
git add -A && git commit -m "feat: procurement list + detail pages with receiving workflow"
```

---

## Task 7: Production event logging

**Files:**
- Create: `app/api/production/route.ts`
- Create: `app/(dashboard)/production/log/page.tsx`
- Create: `app/(dashboard)/production/page.tsx`

- [ ] **Step 1: Create production events API**

POST `/api/production` — accepts `{ job_id, event_type, notes? }`. Validates event_type against the CHECK constraint values. Inserts into production_events.

GET `/api/production?job_id=xxx` — lists events for a job.

- [ ] **Step 2: Create shop floor event logger page**

`/production/log` — simple page for Hammad. Select a job (only jobs in "production" or "inspection" status), then click event type buttons to log events. Shows recent events below.

- [ ] **Step 3: Create production dashboard page**

`/production` — CEO view. Lists all jobs in production/inspection status with their latest event. Real-time updates can come later.

- [ ] **Step 4: Verify and commit**

```bash
npm run build 2>&1 | tail -20
git add -A && git commit -m "feat: production event logger + dashboard"
```

---

## Task 8: Invoice API + PDF generation

**Files:**
- Create: `app/api/invoices/route.ts`
- Create: `app/api/invoices/[id]/route.ts`
- Create: `app/api/invoices/[id]/pdf/route.ts`
- Create: `components/invoices/invoice-pdf.tsx`
- Create: `components/invoices/invoice-status-badge.tsx`

- [ ] **Step 1: Create invoice list + create API**

POST creates invoice from a completed job. Auto-generates `INV-YYMM-NNN`. Calculates:
- subtotal from quote pricing (accepted tier)
- TPS/GST = subtotal * 0.05
- TVQ/QST = subtotal * 0.09975
- total = subtotal + GST + QST + freight - discount

GET lists invoices with aging info (days outstanding).

- [ ] **Step 2: Create invoice detail + payment API**

GET returns invoice with customer/job joins.

PATCH accepts `{ status, paid_date, payment_method }` for marking paid.

- [ ] **Step 3: Create invoice PDF template**

`components/invoices/invoice-pdf.tsx` using `@react-pdf/renderer`. RS branding header (same as quote PDF). Shows:
- Bill To (customer), Invoice #, Date, Due Date
- Line items from quote pricing
- Subtotal, GST 5%, QST 9.975%, Freight, Total
- Payment terms, bank info placeholder

- [ ] **Step 4: Create invoice PDF API route**

`app/api/invoices/[id]/pdf/route.ts` — same pattern as quote PDF route. Renders with `renderToBuffer`, uploads to Supabase Storage `invoices/` bucket.

- [ ] **Step 5: Create invoice status badge**

Same pattern as QuoteStatusBadge. States: draft, sent, paid, overdue, cancelled.

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit && git add -A && git commit -m "feat: invoice API, PDF generation (GST/QST), status badge"
```

---

## Task 9: Invoice pages

**Files:**
- Create: `app/(dashboard)/invoices/page.tsx`
- Create: `app/(dashboard)/invoices/[id]/page.tsx`

- [ ] **Step 1: Create invoice list page**

Server component. Lists invoices with: invoice #, customer, total, status, issued date, days outstanding. Overdue invoices highlighted. Status filter tabs. Aging summary at top (current, 30+, 60+, 90+ days).

- [ ] **Step 2: Create invoice detail page**

Shows invoice info, pricing breakdown (subtotal, GST, QST, freight, total), payment info. Action buttons: "Mark as Sent", "Record Payment". PDF download link.

- [ ] **Step 3: Create invoice actions client component**

`components/invoices/invoice-actions.tsx` — buttons for draft→sent, sent→paid (with payment date/method input).

- [ ] **Step 4: Verify and commit**

```bash
npm run build 2>&1 | tail -20
git add -A && git commit -m "feat: invoice list (aging report) + detail page with payment tracking"
```

---

## Task 10: Build verification + final cleanup

- [ ] **Step 1: Run full build**

```bash
npm run build 2>&1
```

Expected: All new routes compile. Fix any TypeScript errors (common: `as unknown as` casts on Supabase joins, Select `onValueChange` null guards).

- [ ] **Step 2: Verify all routes listed**

Expected new routes:
```
ƒ /jobs
ƒ /jobs/[id]
ƒ /procurement
ƒ /procurement/[id]
ƒ /production
ƒ /production/log
ƒ /invoices
ƒ /invoices/[id]
ƒ /api/jobs
ƒ /api/jobs/[id]
ƒ /api/procurements
ƒ /api/procurements/[id]
ƒ /api/production
ƒ /api/invoices
ƒ /api/invoices/[id]
ƒ /api/invoices/[id]/pdf
```

- [ ] **Step 3: Final commit**

```bash
git add -A && git commit -m "feat: Sprint 4 complete — jobs, procurement, production, invoicing"
```

---

## Self-Review

**Spec coverage:**
- ✅ Quote acceptance → Job creation (Task 1)
- ✅ Job Kanban board (Task 3-4)
- ✅ Job detail page with timeline (Task 4)
- ✅ Drag/click status advancement (Task 4 — job-actions)
- ✅ Procurement creation from job (Task 5)
- ✅ Procurement lines from BOM + overage (Task 5)
- ✅ Receiving workflow (Task 5-6)
- ✅ Production event logger for Hammad (Task 7)
- ✅ Production dashboard for CEO (Task 7)
- ✅ Invoice generation from job (Task 8)
- ✅ Invoice PDF with GST/QST (Task 8)
- ✅ Invoice list with aging (Task 9)
- ✅ Payment tracking (Task 9)

**Not included (post-MVP per spec):**
- Supplier PO generation/PDF (medium priority)
- Realtime Supabase subscriptions (can add later)
- Email templates

**Type consistency:** All status strings match DB CHECK constraints. Job/invoice number generators follow same pattern as quote numbers.
