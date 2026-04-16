-- Add lead_times JSONB column to quotes table
-- Stores per-tier lead time estimates
-- Example: {"tier_1": "4-6 weeks", "tier_2": "3-5 weeks", "tier_3": "3-4 weeks", "tier_4": "2-3 weeks"}
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS lead_times JSONB DEFAULT '{}';
