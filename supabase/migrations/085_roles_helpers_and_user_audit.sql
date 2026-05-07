-- ============================================
-- 085: Role helper functions + user audit columns
-- ============================================
-- Goal: introduce two canonical roles for new users (`admin`, `production`)
-- WITHOUT breaking the existing 3 legacy values (`ceo`, `operations_manager`,
-- `shop_floor`). Helper functions consolidate the role check used by RLS and
-- new app code.
--
-- Mapping:
--   ceo, operations_manager   ⇒ admin-equivalent  (is_admin())
--   admin                     ⇒ admin-equivalent
--   shop_floor                ⇒ production-equivalent (is_production())
--   production                ⇒ production-equivalent
--
-- Existing RLS policies keep working because legacy strings stay valid.
-- New code can use is_admin() / is_production() for clarity.
-- ============================================

-- 1. Extend the role CHECK constraint to include the two new canonical roles.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'ceo', 'operations_manager', 'production', 'shop_floor'));

-- 2. Add last_seen_at for cheap "last sign-in" rendering on the user-management
--    page. Mirrored from auth.users.last_sign_in_at on demand at sign-in.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- 3. Helper: is_admin() — caller is an active admin-equivalent user.
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.is_active = TRUE
      AND u.role IN ('admin', 'ceo', 'operations_manager')
  );
$$;

-- 4. Helper: is_production() — caller is an active production-equivalent user.
CREATE OR REPLACE FUNCTION public.is_production() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.is_active = TRUE
      AND u.role IN ('production', 'shop_floor')
  );
$$;

-- Lock down execution to authenticated users (functions read public.users via
-- SECURITY DEFINER, so they bypass RLS — that is the intent for a role check).
REVOKE ALL ON FUNCTION public.is_admin()      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_production() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin()      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_production() TO authenticated, service_role;
