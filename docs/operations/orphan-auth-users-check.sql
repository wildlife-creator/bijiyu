-- ============================================================
-- 孤児 auth.users 検出クエリ（Task 14.2）
-- ============================================================
-- public.users に対応行を持たない auth.users を検出する。
-- handle_new_user トリガー失敗や CLI-025 担当者作成 RPC 失敗時の
-- cleanup 漏れ（member_create_failed_cleanup_failed）を後追い検出する。
--
-- 想定運用:
--   - 週次実行（Supabase Dashboard SQL Editor または cron）
--   - 1 時間以上前の孤児のみ対象（直近作成のものは trigger 遅延の可能性）
--   - 対応手順は docs/operations/orphan-auth-users-playbook.md 参照

SELECT
  au.id AS auth_user_id,
  au.email,
  au.created_at
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL
  AND au.created_at < now() - interval '1 hour'
ORDER BY au.created_at DESC;
