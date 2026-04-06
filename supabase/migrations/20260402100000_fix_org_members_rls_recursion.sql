-- Fix infinite recursion in organization_members / organizations SELECT policies.
--
-- Problem:
--   organization_members_select queries organization_members itself in its
--   USING clause, causing PostgreSQL to detect infinite recursion when the
--   policy is evaluated.  The organizations_select policy also directly
--   queries organization_members, triggering the same recursive chain.
--
-- Solution:
--   Use the existing SECURITY DEFINER function is_same_org() which bypasses
--   RLS, breaking the recursion loop.

-- 1. Fix organization_members_select
DROP POLICY IF EXISTS "organization_members_select" ON organization_members;

CREATE POLICY "organization_members_select" ON organization_members
  FOR SELECT TO authenticated
  USING (
    is_same_org(auth.uid(), organization_id)
  );

-- 2. Fix organizations_select
DROP POLICY IF EXISTS "organizations_select" ON organizations;

CREATE POLICY "organizations_select" ON organizations
  FOR SELECT TO authenticated
  USING (
    is_same_org(auth.uid(), id)
  );
