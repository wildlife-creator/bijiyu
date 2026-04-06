-- ============================================================
-- client_reviews SELECT ポリシーの修正
-- レビュー投稿者（reviewer_id）本人も閲覧可能にする
-- ============================================================

CREATE OR REPLACE FUNCTION can_view_client_review(p_reviewee_id uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM client_reviews cr
    WHERE cr.reviewee_id = p_reviewee_id
      AND cr.reviewer_id = auth.uid()
  )
  OR p_reviewee_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.organization_members AS my_mem
    JOIN public.organization_members AS reviewee_mem
      ON my_mem.organization_id = reviewee_mem.organization_id
    WHERE my_mem.user_id = auth.uid()
      AND reviewee_mem.user_id = p_reviewee_id
  )
$$ LANGUAGE sql SECURITY DEFINER;
