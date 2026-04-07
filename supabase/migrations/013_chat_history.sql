-- ============================================
-- CHAT HISTORY: Conversations, Messages, Attachments
-- ============================================

-- 1. CHAT_CONVERSATIONS
CREATE TABLE public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CHAT_MESSAGES
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL DEFAULT '',
  metadata JSONB DEFAULT '{}',  -- tool calls, file refs, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CHAT_ATTACHMENTS
CREATE TABLE public.chat_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,       -- Supabase Storage path in chat-attachments bucket
  file_type TEXT NOT NULL,       -- MIME type or extension
  file_size INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_chat_conversations_user ON public.chat_conversations(user_id);
CREATE INDEX idx_chat_conversations_updated ON public.chat_conversations(updated_at DESC);
CREATE INDEX idx_chat_messages_conversation ON public.chat_messages(conversation_id);
CREATE INDEX idx_chat_messages_created ON public.chat_messages(conversation_id, created_at);
CREATE INDEX idx_chat_attachments_message ON public.chat_attachments(message_id);

-- RLS
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own conversations
CREATE POLICY chat_conversations_own ON public.chat_conversations
  FOR ALL USING (user_id = auth.uid());

-- Users can only see messages in their own conversations
CREATE POLICY chat_messages_own ON public.chat_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations
      WHERE id = chat_messages.conversation_id
      AND user_id = auth.uid()
    )
  );

-- Users can only see attachments on their own messages
CREATE POLICY chat_attachments_own ON public.chat_attachments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.chat_messages m
      JOIN public.chat_conversations c ON c.id = m.conversation_id
      WHERE m.id = chat_attachments.message_id
      AND c.user_id = auth.uid()
    )
  );
