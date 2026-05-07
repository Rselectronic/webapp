-- ============================================================================
-- 100_invoice_lines.sql
--
-- Break the 1:1 invoices↔jobs relationship.
--
-- Today: invoices.job_id is a NOT NULL FK to a single job. Multi-job
-- consolidated invoices stuff a "Consolidated invoice for jobs: …" text
-- marker into invoices.notes; per-line quantity is not queryable.
--
-- After this migration:
--   - Per-line truth lives in invoice_lines (one row per job covered, with
--     its own quantity, unit_price, line_total, optional shipment_line_id).
--   - invoices.job_id stays as a denormalised pointer to the FIRST line's
--     job (for back-compat with existing readers and indexes).
--
-- Partial invoicing: an invoice line can cover a subset of a job's
-- quantity. A job is "fully invoiced" only when SUM(invoice_lines.quantity)
-- across non-cancelled invoices >= jobs.quantity. Until then the job stays
-- at 'delivered'.
--
-- Mirrors the shape of migration 099 (shipment_lines).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. invoice_lines
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id),
  shipment_line_id UUID REFERENCES public.shipment_lines(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,4) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON public.invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_job ON public.invoice_lines(job_id);

COMMENT ON TABLE public.invoice_lines IS
  'Per-job line items on an invoice. One invoice covers 1..N jobs, possibly at partial quantities. SUM(quantity) per job across non-cancelled invoices determines fully-invoiced state.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. RLS — admin-only, mirroring invoices.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_lines_admin ON public.invoice_lines;
CREATE POLICY invoice_lines_admin
  ON public.invoice_lines
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Backfill from existing invoices.
--
-- Two cases:
--   (a) Consolidated multi-job invoice: notes contains
--       "Consolidated invoice for jobs: JB-X (GMP-X), JB-Y (GMP-Y), …"
--       — the marker only carries job_number, not per-line qty/total. We
--       split the invoice subtotal proportionally by jobs.quantity (the
--       weighting model the legacy PDF route also assumes when reconstructing
--       line items from quote tiers).
--   (b) Single-job legacy invoice: one line carrying the linked job's full
--       quantity, unit_price = subtotal / quantity (0 if quantity = 0),
--       line_total = invoice.subtotal.
--
-- Idempotent: only insert if no invoice_lines exist for that invoice yet.
-- ────────────────────────────────────────────────────────────────────────────

-- (a) Consolidated invoices — extract job_numbers via regex, join to jobs,
-- weight by jobs.quantity.
WITH consolidated AS (
  SELECT
    i.id AS invoice_id,
    i.subtotal,
    -- Pull the comma-separated list after the marker.
    regexp_replace(
      i.notes,
      '^.*Consolidated invoice for jobs:\s*',
      '',
      's'
    ) AS list_str
  FROM public.invoices i
  WHERE i.notes IS NOT NULL
    AND i.notes LIKE '%Consolidated invoice for jobs:%'
    AND NOT EXISTS (
      SELECT 1 FROM public.invoice_lines il WHERE il.invoice_id = i.id
    )
),
parsed AS (
  -- Split on comma; first whitespace-delimited token of each entry is the job_number.
  SELECT
    c.invoice_id,
    c.subtotal,
    trim(split_part(trim(entry), ' ', 1)) AS job_number
  FROM consolidated c
  CROSS JOIN LATERAL string_to_table(c.list_str, ',') AS entry
),
joined AS (
  SELECT
    p.invoice_id,
    p.subtotal,
    j.id AS job_id,
    j.quantity AS job_quantity
  FROM parsed p
  JOIN public.jobs j ON j.job_number = p.job_number
),
weighted AS (
  SELECT
    invoice_id,
    job_id,
    job_quantity,
    subtotal,
    SUM(job_quantity) OVER (PARTITION BY invoice_id) AS total_quantity
  FROM joined
)
INSERT INTO public.invoice_lines (invoice_id, job_id, quantity, unit_price, line_total, description)
SELECT
  w.invoice_id,
  w.job_id,
  w.job_quantity,
  CASE WHEN w.job_quantity > 0
       THEN ROUND(w.subtotal::numeric / NULLIF(w.total_quantity, 0), 4)
       ELSE 0
  END AS unit_price,
  CASE WHEN w.total_quantity > 0
       THEN ROUND((w.subtotal::numeric * w.job_quantity::numeric) / w.total_quantity, 2)
       ELSE 0
  END AS line_total,
  'Backfilled from consolidated invoice'
FROM weighted w;

-- (b) Single-job legacy invoices — one line covering the full job quantity.
INSERT INTO public.invoice_lines (invoice_id, job_id, quantity, unit_price, line_total, description)
SELECT
  i.id,
  i.job_id,
  COALESCE(j.quantity, 1),
  CASE WHEN COALESCE(j.quantity, 0) > 0
       THEN ROUND(i.subtotal::numeric / j.quantity, 4)
       ELSE 0
  END AS unit_price,
  ROUND(i.subtotal::numeric, 2) AS line_total,
  'Backfilled from legacy single-job invoice'
FROM public.invoices i
JOIN public.jobs j ON j.id = i.job_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.invoice_lines il WHERE il.invoice_id = i.id
);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Adjust the line_total rounding so that SUM(line_total) per invoice
--    matches invoice.subtotal exactly. We absorb the remainder into the
--    last (largest) line.
-- ────────────────────────────────────────────────────────────────────────────
WITH sums AS (
  SELECT
    il.invoice_id,
    SUM(il.line_total) AS total_lines,
    i.subtotal AS invoice_subtotal
  FROM public.invoice_lines il
  JOIN public.invoices i ON i.id = il.invoice_id
  GROUP BY il.invoice_id, i.subtotal
),
diffs AS (
  SELECT
    invoice_id,
    (invoice_subtotal - total_lines)::numeric AS delta
  FROM sums
  WHERE ROUND((invoice_subtotal - total_lines)::numeric, 2) <> 0
),
last_line AS (
  -- Pick a deterministic "last" line per invoice: largest quantity, then
  -- earliest created_at as a tiebreak. We update line_total by the delta.
  SELECT DISTINCT ON (il.invoice_id)
    il.id,
    il.invoice_id,
    d.delta
  FROM public.invoice_lines il
  JOIN diffs d ON d.invoice_id = il.invoice_id
  ORDER BY il.invoice_id, il.quantity DESC, il.created_at ASC
)
UPDATE public.invoice_lines il
   SET line_total = il.line_total + ll.delta
  FROM last_line ll
 WHERE il.id = ll.id;
