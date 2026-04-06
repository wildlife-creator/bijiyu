-- マッチング機能: applications テーブルの UPDATE 用 RLS ポリシーを置き換え
-- 既存の汎用 UPDATE ポリシーを DROP し、ステータス遷移に応じた個別ポリシーに置き換える

-- 既存ポリシーを削除
DROP POLICY IF EXISTS "applications_update" ON applications;
DROP POLICY IF EXISTS "applications_update_self" ON applications;

-- 受注者キャンセル用ポリシー:
-- 自分の応募（applicant_id = auth.uid()）かつ status = 'applied' → cancelled のみ許可
CREATE POLICY "applications_update_cancel" ON applications
  FOR UPDATE TO authenticated
  USING (
    applicant_id = auth.uid()
    AND status = 'applied'
  )
  WITH CHECK (
    applicant_id = auth.uid()
    AND status = 'cancelled'
  );

-- 発注者 accept/reject 用ポリシー:
-- 案件のオーナー（または同一組織メンバー）が、status = 'applied' → accepted / rejected に変更可能
CREATE POLICY "applications_update_decide" ON applications
  FOR UPDATE TO authenticated
  USING (
    status = 'applied'
    AND (
      EXISTS (SELECT 1 FROM jobs WHERE jobs.id = applications.job_id AND jobs.owner_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM jobs
        WHERE jobs.id = applications.job_id
          AND jobs.organization_id IS NOT NULL
          AND is_same_org(auth.uid(), jobs.organization_id)
      )
    )
  )
  WITH CHECK (
    status IN ('accepted', 'rejected')
  );

-- 組織メンバーも応募を閲覧できるように SELECT ポリシーを追加
CREATE POLICY "applications_select_org" ON applications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = applications.job_id
        AND jobs.organization_id IS NOT NULL
        AND is_same_org(auth.uid(), jobs.organization_id)
    )
  );

-- 注: completed/lost への遷移（完了報告）は admin client (service_role) で実行するため、
-- RLS ポリシーは不要（service_role は RLS をバイパスする）
