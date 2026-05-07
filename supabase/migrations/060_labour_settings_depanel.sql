-- ============================================
-- 060: labour_settings.cycle_depanel_seconds
-- ============================================
-- Adds a cycle-time column for depanelisation (separating panelised boards
-- after SMT). Only applies when boards_per_panel > 1 on the quote/BOM.
-- Default placeholder: 40 seconds per board.

ALTER TABLE public.labour_settings
  ADD COLUMN IF NOT EXISTS cycle_depanel_seconds NUMERIC(6, 3);

-- Backfill the active row with the placeholder value so existing quotes get
-- a reasonable number until shop-floor measurements are plugged in.
UPDATE public.labour_settings
SET cycle_depanel_seconds = 40
WHERE is_active = TRUE AND cycle_depanel_seconds IS NULL;
