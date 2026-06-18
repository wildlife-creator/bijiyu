-- ============================================================
-- 2026-06-17: public スキーマの標準 API ロール権限を最後に再付与する
--
-- 経緯:
--   ローカル開発で `supabase db reset` 後に、anon / authenticated / service_role が
--   public スキーマの全テーブルに対する SELECT/INSERT/UPDATE/DELETE 権限を
--   持たない状態が観測された（pg_class.relacl が Dxtm のみ）。
--   結果として「permission denied for table users」等で全クエリが失敗し、
--   全アカウントのログイン・全画面表示が壊れた。
--   Supabase CLI（2.106.0）内部の権限付与ステップが完走しないケースがある
--   ため、ユーザー migration の最後で明示的に再付与する。
--
--   このファイルは「最後に必ず走る」ことが重要。今後 migration を追加する際は
--   このファイルより前のタイムスタンプにすること（このファイルは末尾固定）。
--   タイムスタンプを変える必要が出たら、合わせてさらに後ろに置き直すこと。
-- ============================================================

-- 既存テーブル / シーケンスへの一括付与
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 今後 CREATE される新テーブル向けのデフォルト権限
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- 意図的な REVOKE の再適用
-- admin_proxy_threads は service_role（admin client）専用ビュー。
-- 上の GRANT ALL ON ALL TABLES で復活してしまうため、ここで再 REVOKE する。
REVOKE ALL ON admin_proxy_threads FROM PUBLIC, anon, authenticated;
