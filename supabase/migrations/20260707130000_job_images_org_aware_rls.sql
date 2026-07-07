-- ============================================================
-- job_images の RLS を組織対応に拡張
-- ============================================================
--
-- 背景:
--   job_images の INSERT / UPDATE / DELETE ポリシーは
--   `jobs.owner_id = auth.uid()` のみを条件にしていたため、
--   組織メンバーが「他メンバーが作った同じ組織の案件」に対して
--   画像の追加・更新・削除ができなかった。
--
-- 実例（2026-07-07 手動テスト時に発見）:
--   1. 普通の担当者 (org_role=staff) が案件を作成 (owner_id=staff)
--   2. Staff が 1 枚目の画像を追加 → 成功 (owner_id = auth.uid())
--   3. Owner が同じ案件を編集画面で開き 2 枚目の画像を追加
--      - Storage への upload は成功（Owner フォルダに書き込み）
--      - しかし job_images テーブルへの INSERT は RLS で silent block
--        (jobs.owner_id=staff != auth.uid()=owner)
--      - Server Action は insert のエラーを捕まえない実装のため
--        画面上は成功したように見えるが公開後に画像が出ない
--   4. 削除も同様のパターンでブロックされうる
--
-- 対応:
--   jobs.jobs_update ポリシー既存の書き方
--     `(owner_id = auth.uid()) OR
--      (organization_id IS NOT NULL AND is_same_org(auth.uid(), organization_id))`
--   と同じ形に、job_images の INSERT/UPDATE/DELETE を揃える。
--   SELECT ポリシーは deleted_at IS NULL チェックのみで既に十分寛容なので変更なし。
-- ============================================================

-- INSERT: 案件オーナー本人 OR 同一組織メンバーなら画像追加可
DROP POLICY IF EXISTS "job_images_insert" ON public.job_images;
CREATE POLICY "job_images_insert" ON public.job_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id = job_images.job_id
        AND jobs.deleted_at IS NULL
        AND (
          jobs.owner_id = auth.uid()
          OR (
            jobs.organization_id IS NOT NULL
            AND public.is_same_org(auth.uid(), jobs.organization_id)
          )
        )
    )
  );

-- UPDATE: 同上（sort_order 変更等の用途を想定）
DROP POLICY IF EXISTS "job_images_update" ON public.job_images;
CREATE POLICY "job_images_update" ON public.job_images
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id = job_images.job_id
        AND jobs.deleted_at IS NULL
        AND (
          jobs.owner_id = auth.uid()
          OR (
            jobs.organization_id IS NOT NULL
            AND public.is_same_org(auth.uid(), jobs.organization_id)
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id = job_images.job_id
        AND jobs.deleted_at IS NULL
        AND (
          jobs.owner_id = auth.uid()
          OR (
            jobs.organization_id IS NOT NULL
            AND public.is_same_org(auth.uid(), jobs.organization_id)
          )
        )
    )
  );

-- DELETE: 同上（削除ボタン用）
DROP POLICY IF EXISTS "job_images_delete" ON public.job_images;
CREATE POLICY "job_images_delete" ON public.job_images
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id = job_images.job_id
        AND jobs.deleted_at IS NULL
        AND (
          jobs.owner_id = auth.uid()
          OR (
            jobs.organization_id IS NOT NULL
            AND public.is_same_org(auth.uid(), jobs.organization_id)
          )
        )
    )
  );

COMMENT ON POLICY "job_images_insert" ON public.job_images IS
  '案件オーナー本人または同一組織メンバー (org_role=admin/staff) は画像追加可';
COMMENT ON POLICY "job_images_update" ON public.job_images IS
  '案件オーナー本人または同一組織メンバー (org_role=admin/staff) は画像更新可';
COMMENT ON POLICY "job_images_delete" ON public.job_images IS
  '案件オーナー本人または同一組織メンバー (org_role=admin/staff) は画像削除可';
