-- ============================================================
-- 自分自身の users 行は deleted_at に関わらず常に SELECT 可能にする
-- ============================================================
-- 背景:
--   既存 users_select_public (deleted_at IS NULL) は他人のソフト削除済ユーザー
--   を隠す目的。しかし middleware が自分自身の行を引いて role/deleted_at/
--   is_active をチェックしているため、本人が退会直後にこのポリシーで弾かれると
--   「行が無い = 新規ユーザー扱い」になり /register/profile にリダイレクトされる
--   バグが発生した（C 案退会後の連動凍結メンバーで実例）。
--
-- 対策:
--   PERMISSIVE ポリシーを追加で入れ、`auth.uid() = id` なら常に SELECT 可能
--   にする。他人のソフト削除済みユーザーは相変わらず隠れる。
-- ============================================================

CREATE POLICY "users_select_self_always" ON public.users
  FOR SELECT TO authenticated
  USING (auth.uid() = id);
