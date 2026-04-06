-- ============================================================
-- client_reviews SELECT ポリシーの修正
-- 全ユーザー閲覧可 → 被評価者本人および同一組織メンバーのみ
-- ============================================================

-- Drop the old permissive policy
DROP POLICY IF EXISTS "client_reviews_select" ON client_reviews;

-- Helper function: check if the current user can view a client_review
-- Allowed if: reviewee is the current user, OR current user belongs to
-- the same organization as the reviewee.
CREATE OR REPLACE FUNCTION can_view_client_review(p_reviewee_id uuid) RETURNS boolean AS $$
  SELECT
    p_reviewee_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.organization_members AS my_mem
      JOIN public.organization_members AS reviewee_mem
        ON my_mem.organization_id = reviewee_mem.organization_id
      WHERE my_mem.user_id = auth.uid()
        AND reviewee_mem.user_id = p_reviewee_id
    )
$$ LANGUAGE sql SECURITY DEFINER;

-- Create the restricted policy
CREATE POLICY "client_reviews_select" ON client_reviews
  FOR SELECT TO authenticated
  USING (can_view_client_review(reviewee_id));
