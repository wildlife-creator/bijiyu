-- ============================================================
-- email-recycle-on-delete spec / Task 12 手動確認用 SQL
--
-- 実行: docker exec -i supabase_db_bijiyu psql -U postgres -d postgres \
--         < scripts/manual-test-recycle.sql
-- (もしくは個別クエリを Studio / psql に貼り付け)
-- ============================================================

-- ============================================================
-- 基本状況: er-* テスト fixtures の現在状態
-- (auth.users.email が原本か印付き化済みか / public.users.deleted_at)
-- ============================================================
\echo ''
\echo '=== er-* fixtures の現在状態 ==='
SELECT
  au.email                                       AS auth_email,
  pu.deleted_at IS NOT NULL                      AS pu_deleted,
  au.email ~ '^deleted-\d{8}-[a-z0-9]{4,}-'     AS is_suffixed,
  au.id
FROM auth.users au
JOIN public.users pu ON pu.id = au.id
WHERE au.email LIKE 'er-%@test.local'
   OR au.email ~ '^deleted-\d{8}-[a-z0-9]+-er-'
ORDER BY au.id;

-- ============================================================
-- audit_logs: 4 種 action の件数 + 最新 metadata
-- ============================================================
\echo ''
\echo '=== audit_logs: 4 種 action ==='
SELECT action, count(*) AS cnt
  FROM audit_logs
 WHERE action IN (
   'auth_email_recycled',
   'auth_email_recycle_failed',
   'auth_email_restored',
   'auth_email_restore_failed'
 )
 GROUP BY action
 ORDER BY action;

\echo ''
\echo '=== audit_logs: 最新 10 件 (本 spec 関連) ==='
SELECT
  to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS at,
  action,
  target_id,
  metadata
FROM audit_logs
WHERE action LIKE 'auth_email_%'
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================
-- 無関係 user の email 不変確認 (Task 12 / Step 7)
--   対象: 本 spec での印付け対象外の active な user
--   基準: contractor@test.local / client@test.local /
--         seed の代理 staff (f888aaaa) で兼任継続中の人 等
-- ============================================================
\echo ''
\echo '=== 無関係 active user の email が原本のままか ==='
SELECT
  au.email                                          AS auth_email,
  pu.deleted_at                                     AS pu_deleted_at,
  au.email ~ '^deleted-\d{8}-[a-z0-9]{4,}-'        AS is_suffixed_should_be_false
FROM auth.users au
JOIN public.users pu ON pu.id = au.id
WHERE au.email IN (
  'contractor@test.local',
  'contractor2@test.local',
  'contractor3@test.local',
  'contractor4@test.local',
  'client@test.local',
  'client2@test.local',
  'individual-client@test.local',
  'staff@test.local',
  'admin@test.local',
  'phase8-z1-owner@test.local',
  'phase8-reuse-target@test.local'
)
ORDER BY au.email;

-- ============================================================
-- 兼任継続中の代理 staff (phase8-multi-keep) の email 不変
--   id = f888bbbb. 2 法人在籍中なので 1 法人削除しても印付け化されないはず
-- ============================================================
\echo ''
\echo '=== 兼任継続中の phase8-multi-keep の状態 ==='
SELECT
  au.email,
  au.email ~ '^deleted-\d{8}-[a-z0-9]{4,}-' AS is_suffixed_should_be_false,
  pu.deleted_at AS pu_deleted_should_be_null,
  count(om.organization_id) AS organization_count
FROM auth.users au
JOIN public.users pu ON pu.id = au.id
LEFT JOIN organization_members om ON om.user_id = au.id
WHERE au.id = 'f888bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
GROUP BY au.email, pu.deleted_at;
