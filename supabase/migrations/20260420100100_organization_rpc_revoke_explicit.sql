-- ============================================================
-- Task 15.3 発見対応: organization spec の SECURITY DEFINER 関数に
-- 対して anon / authenticated の EXECUTE を明示的に REVOKE
-- ============================================================
-- Supabase のデフォルト（`ALTER DEFAULT PRIVILEGES IN SCHEMA public
-- GRANT EXECUTE ON FUNCTIONS TO anon, authenticated`）により、public に
-- 作成した新規関数は authenticated / anon に自動で EXECUTE が付与される。
-- 既存 billing 側でも 20260413100000_billing_rpc_revoke_explicit.sql で
-- 同じ修正を入れており、organization 側の関数も同じパターンで明示的に
-- REVOKE する。

REVOKE EXECUTE ON FUNCTION public.insert_staff_member_with_limit(
  uuid, uuid, text, boolean, integer
) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_staff_member(
  uuid, uuid, uuid
) FROM anon, authenticated;

-- is_org_admin_or_owner_of は RLS 評価で authenticated から呼ばれるため
-- EXECUTE を authenticated に保持する（Task 2.5 で既に GRANT 済み）。
-- anon にも EXECUTE があると予期しない呼び出し経路が増えるため REVOKE。
REVOKE EXECUTE ON FUNCTION public.is_org_admin_or_owner_of(uuid, uuid) FROM anon;
