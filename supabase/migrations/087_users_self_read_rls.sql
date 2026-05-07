-- ============================================================================
-- RLS gap: production-role users couldn't read their own users row.
--
-- The pre-existing policies on public.users are scoped to specific role
-- strings: 'ceo' (full), 'operations_manager' (read), 'shop_floor' (read
-- own row). A user whose role is `admin` or `production` matched none of
-- these. The middleware + login action both do
--   SELECT role, is_active FROM users WHERE id = auth.uid()
-- via the user-scoped client, so for production users that query returned
-- zero rows. The deactivation check (`if (profile && !profile.is_active)`)
-- silently passed → deactivated production users could still sign in.
--
-- Fix: a universal self-read policy. Every authenticated user can read
-- their OWN row (only). This works for any current or future role string.
-- The existing role-specific policies stay untouched so admins / ops can
-- still read other users.
-- ============================================================================

DROP POLICY IF EXISTS users_self_read ON public.users;

CREATE POLICY users_self_read ON public.users
  FOR SELECT
  USING (id = auth.uid());
