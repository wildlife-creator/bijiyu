-- ============================================================
-- Task 2.7: organizations.name → client_profiles.display_name
--           データバックフィル
-- ============================================================
-- 発注者表示名を client_profiles.display_name に一本化する。
-- 既存 organizations.name の値を対応 Owner の client_profiles に
-- コピーする。既存 client_profiles が無い Owner には新規作成で対応。
--
-- 前提:
--   - organizations.owner_id は UNIQUE
--   - client_profiles.user_id は UNIQUE（billing migration で追加済み）
--   → 1 owner に対し organization も client_profiles も最大 1 件。
--     ゆえに UPDATE と INSERT の件数が一意に定まる。
--
-- 安全策:
--   1. 事前 SELECT で件数内訳を RAISE NOTICE。supabase db reset ログで確認可能。
--   2. 想定件数と実行件数の整合チェック。不整合なら EXCEPTION で自動 ROLLBACK。
--   3. 空文字（name = ''）は UPDATE / INSERT どちらの対象外。display_name を
--      空のままにする（ユーザーが CLI-021 で後から入力する前提）。
--
-- organizations.name 自体は変更しない（Task 19 の Phase 3 まで残存）。
-- ロールバック手順は docs/operations/rollback/task-2-7-revert.sql を参照。

DO $$
DECLARE
  v_total_orgs         int;
  v_non_empty_names    int;
  v_would_update       int;
  v_would_insert       int;
  v_would_overwrite    int;
BEGIN
  SELECT count(*) INTO v_total_orgs
    FROM organizations
   WHERE deleted_at IS NULL;

  SELECT count(*) INTO v_non_empty_names
    FROM organizations
   WHERE deleted_at IS NULL
     AND name IS NOT NULL
     AND name <> '';

  SELECT count(*) INTO v_would_update
    FROM organizations o
    JOIN client_profiles cp ON cp.user_id = o.owner_id
   WHERE o.deleted_at IS NULL
     AND o.name IS NOT NULL
     AND o.name <> '';

  SELECT count(*) INTO v_would_insert
    FROM organizations o
    LEFT JOIN client_profiles cp ON cp.user_id = o.owner_id
   WHERE o.deleted_at IS NULL
     AND o.name IS NOT NULL
     AND o.name <> ''
     AND cp.user_id IS NULL;

  SELECT count(*) INTO v_would_overwrite
    FROM organizations o
    JOIN client_profiles cp ON cp.user_id = o.owner_id
   WHERE o.deleted_at IS NULL
     AND o.name IS NOT NULL
     AND o.name <> ''
     AND cp.display_name IS NOT NULL
     AND cp.display_name <> '';

  RAISE NOTICE
    'Task 2.7 pre-check: total_orgs=%, non_empty_names=%, would_update=%, would_insert=%, would_overwrite_existing=%',
    v_total_orgs, v_non_empty_names, v_would_update, v_would_insert, v_would_overwrite;

  -- 不変式: update + insert = non_empty_names（1:1 制約により必ず一致）
  IF v_would_update + v_would_insert <> v_non_empty_names THEN
    RAISE EXCEPTION
      'Task 2.7 invariant violated: update (%) + insert (%) <> non_empty_names (%)',
      v_would_update, v_would_insert, v_non_empty_names;
  END IF;
END $$;

-- Step 1: 既存 client_profiles の display_name を organizations.name で上書き
UPDATE client_profiles cp
   SET display_name = o.name
  FROM organizations o
 WHERE o.owner_id = cp.user_id
   AND o.deleted_at IS NULL
   AND o.name IS NOT NULL
   AND o.name <> '';

-- Step 2: client_profiles 未作成の Owner について新規 INSERT
INSERT INTO client_profiles (user_id, display_name)
SELECT o.owner_id, o.name
  FROM organizations o
  LEFT JOIN client_profiles cp ON cp.user_id = o.owner_id
 WHERE o.deleted_at IS NULL
   AND o.name IS NOT NULL
   AND o.name <> ''
   AND cp.user_id IS NULL;

DO $$
DECLARE
  v_post_count int;
BEGIN
  SELECT count(*) INTO v_post_count
    FROM client_profiles
   WHERE display_name IS NOT NULL
     AND display_name <> '';

  RAISE NOTICE
    'Task 2.7 post-apply: client_profiles with non-empty display_name=%',
    v_post_count;
END $$;
