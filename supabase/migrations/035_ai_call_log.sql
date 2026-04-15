-- ============================================================================
-- Migration 035 — AI telemetry table (ai_call_log)
-- ============================================================================
-- Every AI call in the webapp (mcode classifier, BOM column mapper, chat
-- assistant) writes one row here. Gives us usage, cost, latency, and failure
-- visibility from SQL without needing to log into Vercel or Anthropic.
--
-- Not audited (no audit_log trigger) — the log IS the audit record.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_call_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Which code path fired this. Used to group usage in the dashboard.
  purpose TEXT NOT NULL CHECK (purpose IN (
    'mcode_classifier',      -- lib/mcode/ai-classifier.ts fetchComponentParams
    'bom_column_mapper',     -- lib/bom/ai-column-mapper.ts
    'chat_assistant',        -- app/api/chat/route.ts (the in-app chat)
    'other'
  )),

  -- Provider + model identifiers
  provider TEXT NOT NULL DEFAULT 'anthropic',  -- 'anthropic' | 'openai' | 'vercel-gateway' | ...
  model TEXT NOT NULL,                         -- e.g. 'claude-haiku-4-5-20251001'

  -- Token usage (null if the provider didn't return it)
  input_tokens INT,
  output_tokens INT,
  total_tokens INT GENERATED ALWAYS AS (COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) STORED,

  -- Wall-clock latency in ms
  latency_ms INT,

  -- Outcome
  success BOOLEAN NOT NULL,
  error_message TEXT,

  -- Context identifiers (all nullable — populate what's available)
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  bom_id UUID REFERENCES public.boms(id) ON DELETE SET NULL,
  mpn TEXT,              -- for classifier calls
  conversation_id UUID,  -- for chat calls

  -- Free-form JSON for anything else (classifier input params, chat tool name,
  -- column mapper header preview, etc.)
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ai_call_log_called_at ON public.ai_call_log(called_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_call_log_purpose ON public.ai_call_log(purpose, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_call_log_user ON public.ai_call_log(user_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_call_log_success ON public.ai_call_log(success) WHERE success = false;

ALTER TABLE public.ai_call_log ENABLE ROW LEVEL SECURITY;

-- CEO + Operations Manager can read (for the dashboard)
CREATE POLICY ai_call_log_read ON public.ai_call_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);

-- Service role inserts via admin client (bypasses RLS). No INSERT policy for regular users.
COMMENT ON TABLE public.ai_call_log IS 'Per-call telemetry for every AI invocation. Inserted from server-side AI wrapper in lib/ai/telemetry.ts. CEO-readable via Settings -> AI Usage.';
