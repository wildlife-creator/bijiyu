-- Phase 2 Step 1 + Step 3: message_threads identity ペア (org⇔org 対応)
-- migration および backfill トリガーの検証
BEGIN;
SELECT plan(14);

-- ============================================================
-- 1. スキーマ: 新カラムが存在する
-- ============================================================
SELECT has_column(
  'public',
  'message_threads',
  'organization_1_id',
  'organization_1_id カラムが存在する'
);

SELECT has_column(
  'public',
  'message_threads',
  'organization_2_id',
  'organization_2_id カラムが存在する'
);

-- 2. 旧カラムは移行期間中まだ残っている
SELECT has_column(
  'public',
  'message_threads',
  'organization_id',
  '旧 organization_id は移行期間中まだ残っている（後方互換）'
);

-- ============================================================
-- 3. インデックス: identity ペア UNIQUE と各 org インデックス
-- ============================================================
SELECT has_index(
  'public',
  'message_threads',
  'idx_message_threads_identity_pair_unique',
  'identity ペア UNIQUE インデックスが存在する'
);

SELECT has_index(
  'public',
  'message_threads',
  'idx_message_threads_org_1',
  'organization_1_id のインデックスが存在する'
);

SELECT has_index(
  'public',
  'message_threads',
  'idx_message_threads_org_2',
  'organization_2_id のインデックスが存在する'
);

-- ============================================================
-- 4. RLS ポリシー: 新 org カラムでの認可判定に対応している
-- ============================================================
SELECT policy_roles_are(
  'public',
  'message_threads',
  'message_threads_select',
  ARRAY['authenticated'],
  'SELECT ポリシーは authenticated ユーザー向け'
);

SELECT policy_roles_are(
  'public',
  'message_threads',
  'message_threads_insert',
  ARRAY['authenticated'],
  'INSERT ポリシーは authenticated ユーザー向け'
);

-- ============================================================
-- 5. Backfill: seed に含まれる既存 org スレッドが正しく振り分けられている
-- ============================================================

-- 5-a. organization_id が set されている行は organization_1_id または
--       organization_2_id のどちらかに backfill されている
SELECT is(
  (SELECT count(*)::int FROM message_threads
   WHERE organization_id IS NOT NULL
     AND organization_1_id IS NULL
     AND organization_2_id IS NULL),
  0,
  'organization_id セット済みの行はすべて organization_1_id か organization_2_id に backfill されている'
);

-- 5-b. backfill 先の org は organization_id と一致する（もう一方は NULL 想定）
SELECT is(
  (SELECT count(*)::int FROM message_threads
   WHERE organization_id IS NOT NULL
     AND COALESCE(organization_1_id, organization_2_id) <> organization_id),
  0,
  'backfill された org は元の organization_id と一致する'
);

-- ============================================================
-- 6. identity ペア UNIQUE の実効確認: 同じペアで 2 件目 INSERT すると失敗する
-- ============================================================
DO $$
DECLARE
  existing_id uuid;
  existing_p1 uuid;
  existing_p2 uuid;
  existing_org1 uuid;
BEGIN
  -- 既存の org スレッドを 1 件借りる
  SELECT id, participant_1_id, participant_2_id, organization_1_id
    INTO existing_id, existing_p1, existing_p2, existing_org1
  FROM message_threads
  WHERE organization_1_id IS NOT NULL
  LIMIT 1;

  IF existing_id IS NULL THEN
    RAISE EXCEPTION 'seed に org スレッドが 1 件も無い（本来ありえない）';
  END IF;

  -- 同じ identity ペア (organization_1_id, participant_2_id) で 2 件目を試みる
  BEGIN
    INSERT INTO message_threads (participant_1_id, participant_2_id, organization_1_id, thread_type)
    VALUES (existing_p1, existing_p2, existing_org1, 'message');
    RAISE EXCEPTION 'UNIQUE 制約が効いていない: 2 件目の同一 identity ペアが insert できてしまった';
  EXCEPTION
    WHEN unique_violation THEN
      -- 期待通り
      NULL;
  END;
END $$;

SELECT pass('identity ペア UNIQUE 制約が同一ペアの重複を拒否する');

-- ============================================================
-- 7. Trigger: 旧 organization_id のみ set の INSERT で organization_1_id が
--    自動 backfill される (scout-send / bulk-send 等の safety net)
-- ============================================================
DO $$
DECLARE
  test_p1 uuid := gen_random_uuid();
  test_p2 uuid := gen_random_uuid();
  test_org uuid;
  inserted_org1 uuid;
  inserted_org2 uuid;
BEGIN
  -- テスト用 users + organization を作る (ROLLBACK 内なので実データに影響しない)
  INSERT INTO auth.users (id, email, created_at, updated_at, aud, role)
  VALUES
    (test_p1, 'phase2-trigger-p1@test', now(), now(), 'authenticated', 'authenticated'),
    (test_p2, 'phase2-trigger-p2@test', now(), now(), 'authenticated', 'authenticated');

  -- handle_new_user トリガーが auth.users INSERT で public.users 行を作るため
  -- ここでは UPDATE で必要フィールドを補う
  UPDATE public.users SET role = 'client', last_name = 'テスト', first_name = 'P1'
  WHERE id = test_p1;
  UPDATE public.users SET role = 'contractor', last_name = 'テスト', first_name = 'P2'
  WHERE id = test_p2;

  INSERT INTO public.organizations (owner_id)
  VALUES (test_p1)
  RETURNING id INTO test_org;

  -- 旧 organization_id のみ set (organization_1/2 は明示的に NULL)
  INSERT INTO public.message_threads
    (participant_1_id, participant_2_id, organization_id, thread_type)
  VALUES
    (test_p1, test_p2, test_org, 'message')
  RETURNING organization_1_id, organization_2_id
  INTO inserted_org1, inserted_org2;

  -- Trigger により organization_1_id に自動 backfill されているはず
  IF inserted_org1 IS DISTINCT FROM test_org THEN
    RAISE EXCEPTION 'trigger 未動作: organization_1_id = %, expected %',
      inserted_org1, test_org;
  END IF;

  IF inserted_org2 IS NOT NULL THEN
    RAISE EXCEPTION 'trigger 過剰動作: organization_2_id は NULL のはず (実際: %)',
      inserted_org2;
  END IF;
END $$;

SELECT pass('trigger: 旧 organization_id 単独 set で organization_1_id が backfill される');

-- ============================================================
-- 8. Trigger: 新カラム明示 set した場合は trigger が上書きしない
-- ============================================================
DO $$
DECLARE
  test_p1 uuid := gen_random_uuid();
  test_p2 uuid := gen_random_uuid();
  test_org uuid;
  inserted_org1 uuid;
  inserted_org2 uuid;
BEGIN
  INSERT INTO auth.users (id, email, created_at, updated_at, aud, role)
  VALUES
    (test_p1, 'phase2-explicit-p1@test', now(), now(), 'authenticated', 'authenticated'),
    (test_p2, 'phase2-explicit-p2@test', now(), now(), 'authenticated', 'authenticated');

  UPDATE public.users SET role = 'contractor', last_name = 'テスト', first_name = 'P1'
  WHERE id = test_p1;
  UPDATE public.users SET role = 'client', last_name = 'テスト', first_name = 'P2'
  WHERE id = test_p2;

  INSERT INTO public.organizations (owner_id)
  VALUES (test_p2)
  RETURNING id INTO test_org;

  -- 新コード想定: organization_2_id を明示 set (contractor→org のケース)
  INSERT INTO public.message_threads
    (participant_1_id, participant_2_id, organization_2_id, thread_type)
  VALUES
    (test_p1, test_p2, test_org, 'message')
  RETURNING organization_1_id, organization_2_id
  INTO inserted_org1, inserted_org2;

  -- Trigger は明示的な set を尊重して何もしない
  IF inserted_org2 IS DISTINCT FROM test_org THEN
    RAISE EXCEPTION '新カラム明示 set が保持されていない: organization_2_id = %, expected %',
      inserted_org2, test_org;
  END IF;

  IF inserted_org1 IS NOT NULL THEN
    RAISE EXCEPTION 'trigger が新カラム明示 set を上書きした: organization_1_id = %',
      inserted_org1;
  END IF;
END $$;

SELECT pass('trigger: 新カラム明示 set 時は trigger が上書きしない');

-- ============================================================
-- 9. Trigger: 個人⇔個人 (organization_id も新カラムも NULL) で NULL 保持
-- ============================================================
DO $$
DECLARE
  test_p1 uuid := gen_random_uuid();
  test_p2 uuid := gen_random_uuid();
  inserted_org1 uuid;
  inserted_org2 uuid;
  inserted_org_old uuid;
BEGIN
  INSERT INTO auth.users (id, email, created_at, updated_at, aud, role)
  VALUES
    (test_p1, 'phase2-null-p1@test', now(), now(), 'authenticated', 'authenticated'),
    (test_p2, 'phase2-null-p2@test', now(), now(), 'authenticated', 'authenticated');

  UPDATE public.users SET role = 'contractor', last_name = 'テスト', first_name = 'P1'
  WHERE id = test_p1;
  UPDATE public.users SET role = 'contractor', last_name = 'テスト', first_name = 'P2'
  WHERE id = test_p2;

  INSERT INTO public.message_threads
    (participant_1_id, participant_2_id, thread_type)
  VALUES
    (test_p1, test_p2, 'message')
  RETURNING organization_id, organization_1_id, organization_2_id
  INTO inserted_org_old, inserted_org1, inserted_org2;

  IF inserted_org_old IS NOT NULL OR inserted_org1 IS NOT NULL OR inserted_org2 IS NOT NULL THEN
    RAISE EXCEPTION '個人⇔個人スレッドで org カラムがセットされてしまった';
  END IF;
END $$;

SELECT pass('trigger: 個人⇔個人スレッドは全 org カラムが NULL 保持される');

SELECT * FROM finish();
ROLLBACK;
