-- ============================================================
-- client_recruit_areas の RLS を組織対応に拡張
-- ============================================================
--
-- 背景:
--   client_recruit_areas の INSERT / UPDATE / DELETE ポリシーは
--   `client_id = auth.uid()` のみを条件にしていたため、
--   組織管理者 (org_role='admin') が Owner の代理として
--   発注者情報 (CLI-021) の募集エリアを保存できなかった。
--
-- 実例（2026-07-07 手動テスト時に発見）:
--   1. 組織 Admin (org_role='admin') が CLI-021 で「募集エリア」を変更して保存
--   2. Server Action (saveClientProfileAction) は Admin を許可
--      (org_role='staff' のみ拒否する設計)
--   3. ①client_profiles.upsert → 成功
--      (client_profiles の INSERT/UPDATE ポリシーは既に組織対応済み)
--   4. ②replace_client_recruit_areas RPC (SECURITY INVOKER = RLS 適用)
--      → DELETE が RLS で 0 行 silent block
--      → INSERT が RLS violation で失敗
--   5. Server Action は areasError を検知して
--      「募集エリアの保存に失敗しました」を返すが、①の commit は残り
--      profiles だけ新値・areas は旧値の部分更新が発生
--
-- 対応:
--   avatars_client_profile_write_* (20260419100400) と同じ
--   is_org_admin_or_owner_of() SECURITY DEFINER 関数を使い、
--   client_recruit_areas_owner_write を組織対応ポリシーに置換する。
--
--   関数 is_org_admin_or_owner_of(uid, target_owner_user_id) の意味:
--     (a) uid = target_owner_user_id (Owner 本人)
--     (b) uid が target_owner_user_id の所有する組織に owner/admin として所属
--   client_recruit_areas.client_id は client_profiles.user_id (= 組織 Owner)
--   と等しいため、そのまま target_owner_user_id として渡せる。
--
--   なお `client_id = auth.uid()` の短絡を前段に残すのは Owner 本人ケースで
--   SECURITY DEFINER 関数呼び出しをスキップして性能を稼ぐため
--   (指示書 §3 の方針に合わせた belt-and-suspenders 形)。
--
--   SELECT ポリシー (client_recruit_areas_select_all) は公開読み取り
--   (認証済み全ユーザーが SELECT 可) のため変更しない。
-- ============================================================

DROP POLICY IF EXISTS client_recruit_areas_owner_write ON public.client_recruit_areas;

CREATE POLICY client_recruit_areas_owner_write
  ON public.client_recruit_areas
  FOR ALL
  TO authenticated
  USING (
    client_id = auth.uid()
    OR public.is_org_admin_or_owner_of(auth.uid(), client_id)
  )
  WITH CHECK (
    client_id = auth.uid()
    OR public.is_org_admin_or_owner_of(auth.uid(), client_id)
  );

COMMENT ON POLICY client_recruit_areas_owner_write ON public.client_recruit_areas IS
  'Owner 本人または組織管理者 (org_role=owner/admin) は募集エリアを INSERT/UPDATE/DELETE 可';
