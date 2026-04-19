-- ============================================================
-- scout_templates: allow all organization members to UPDATE/DELETE
-- ============================================================
-- Previously UPDATE/DELETE policies restricted access to
--   owner_id = auth.uid()
-- which prevented organization members from editing or deleting
-- templates authored by other members.
--
-- New behavior: scout templates are treated as an organization
-- asset. Any member of the same organization can UPDATE/DELETE
-- templates belonging to that organization, regardless of who
-- originally authored them.
--
-- SELECT and INSERT policies remain unchanged:
--   * SELECT already includes "self OR same org"
--   * INSERT sets owner_id = auth.uid() (author ownership)
--
-- See .kiro/specs/organization/requirements.md REQ-ORG-001..004
-- for the product-level rule, and
-- .kiro/steering/database-schema.md for the aligned RLS table.

DROP POLICY IF EXISTS "scout_templates_update" ON scout_templates;
DROP POLICY IF EXISTS "scout_templates_delete" ON scout_templates;

CREATE POLICY "scout_templates_update" ON scout_templates
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "scout_templates_delete" ON scout_templates
  FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );
