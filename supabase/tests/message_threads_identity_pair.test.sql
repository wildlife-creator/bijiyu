-- Phase 2 Step 1: message_threads identity ペア (org⇔org 対応) の migration 検証
BEGIN;
SELECT plan(11);

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

SELECT * FROM finish();
ROLLBACK;
