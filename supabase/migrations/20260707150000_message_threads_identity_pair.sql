-- ============================================================
-- Phase 2 Step 1: message_threads を identity ペア (org⇔org 対応) に拡張
-- ============================================================
--
-- 目的:
--   従来の「1 organization_id + 席2=受注者」モデルを、identity ペア
--   (participant_1 側の組織 / participant_2 側の組織) に一般化する。
--   これにより「発注者⇔発注者」「受注者⇔受注者」「組織⇔組織」を含む
--   任意のロール組み合わせでスレッドが成立する内部モデルを持てる。
--
-- 移行方針 (デグレ最小化 = phased):
--   本 migration: 新カラムを追加し既存 organization_id から backfill。
--                 旧 organization_id は当面残す (Phase 2 コード移行完了後に drop)。
--                 RLS は新旧両方の組織カラムを OR で判定 (移行期間中の後方互換)。
--
-- 参考: [[project-notification-spec-progress]] メッセージ機能設計改修 (A1/A2/A4)
-- ============================================================

-- ------------------------------------------------------------
-- 1. 新カラム追加
-- ------------------------------------------------------------
ALTER TABLE message_threads
  ADD COLUMN organization_1_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN organization_2_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

COMMENT ON COLUMN message_threads.organization_1_id IS
  'participant_1 側の所属組織 ID (Phase 2 で identity ベース化)。個人の場合 NULL';
COMMENT ON COLUMN message_threads.organization_2_id IS
  'participant_2 側の所属組織 ID (Phase 2 で identity ベース化)。個人の場合 NULL';
COMMENT ON COLUMN message_threads.organization_id IS
  'deprecated: Phase 2 で organization_1_id/organization_2_id に分離。コード完全移行後 drop 予定';

-- ------------------------------------------------------------
-- 2. 既存データ backfill
--    organization_id をどちら側のカラムに入れるかは
--    organization_members のメンバーシップから判定する。
-- ------------------------------------------------------------

-- 2-a: participant_1 がその org のメンバーなら organization_1_id へ
UPDATE message_threads t
SET organization_1_id = t.organization_id
WHERE t.organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM organization_members m
    WHERE m.organization_id = t.organization_id
      AND m.user_id = t.participant_1_id
  );

-- 2-b: participant_2 がその org のメンバーなら organization_2_id へ
--       (2-a で埋まっていない残りのみ)
UPDATE message_threads t
SET organization_2_id = t.organization_id
WHERE t.organization_id IS NOT NULL
  AND t.organization_1_id IS NULL
  AND EXISTS (
    SELECT 1 FROM organization_members m
    WHERE m.organization_id = t.organization_id
      AND m.user_id = t.participant_2_id
  );

-- 2-c: 逃げ道 (どちらもメンバーでない古いデータ/テストデータ):
--       安全側で organization_1_id に格納。逃げ道パスを踏むケースは
--       運用上は基本発生しない前提だが、backfill を確実に完了させる。
UPDATE message_threads t
SET organization_1_id = t.organization_id
WHERE t.organization_id IS NOT NULL
  AND t.organization_1_id IS NULL
  AND t.organization_2_id IS NULL;

-- ------------------------------------------------------------
-- 3. RLS を新旧両組織カラムで判定するように更新
--    (移行期間中の後方互換: 旧 organization_id も引き続き見る)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "message_threads_select" ON message_threads;
DROP POLICY IF EXISTS "message_threads_insert" ON message_threads;
DROP POLICY IF EXISTS "message_threads_update_type" ON message_threads;

CREATE POLICY "message_threads_select" ON message_threads
  FOR SELECT TO authenticated
  USING (
    participant_1_id = auth.uid()
    OR participant_2_id = auth.uid()
    OR (organization_1_id IS NOT NULL AND is_same_org(auth.uid(), organization_1_id))
    OR (organization_2_id IS NOT NULL AND is_same_org(auth.uid(), organization_2_id))
    OR (organization_id IS NOT NULL AND is_same_org(auth.uid(), organization_id))
  );

CREATE POLICY "message_threads_insert" ON message_threads
  FOR INSERT TO authenticated
  WITH CHECK (
    participant_1_id = auth.uid()
    OR participant_2_id = auth.uid()
    OR (organization_1_id IS NOT NULL AND is_same_org(auth.uid(), organization_1_id))
    OR (organization_2_id IS NOT NULL AND is_same_org(auth.uid(), organization_2_id))
    OR (organization_id IS NOT NULL AND is_same_org(auth.uid(), organization_id))
  );

CREATE POLICY "message_threads_update_type" ON message_threads
  FOR UPDATE TO authenticated
  USING (
    participant_1_id = auth.uid()
    OR participant_2_id = auth.uid()
    OR (organization_1_id IS NOT NULL AND is_same_org(auth.uid(), organization_1_id))
    OR (organization_2_id IS NOT NULL AND is_same_org(auth.uid(), organization_2_id))
    OR (organization_id IS NOT NULL AND is_same_org(auth.uid(), organization_id))
  );

-- ------------------------------------------------------------
-- 4. インデックス
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_message_threads_org_1
  ON message_threads (organization_1_id)
  WHERE organization_1_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_message_threads_org_2
  ON message_threads (organization_2_id)
  WHERE organization_2_id IS NOT NULL;

-- ------------------------------------------------------------
-- 5. identity ペアの UNIQUE 制約
--    identity_X = organization_X_id (あれば) else participant_X_id
--    (identity_1, identity_2) の順序無関係で 1 スレッド
--
--    LEAST/GREATEST を使うことで (A, B) と (B, A) を同一視する。
--    UUID を text にキャストして辞書順比較する。
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_threads_identity_pair_unique
ON message_threads (
  LEAST(
    COALESCE(organization_1_id::text, participant_1_id::text),
    COALESCE(organization_2_id::text, participant_2_id::text)
  ),
  GREATEST(
    COALESCE(organization_1_id::text, participant_1_id::text),
    COALESCE(organization_2_id::text, participant_2_id::text)
  )
);

-- NOTE: 旧 UNIQUE (organization_id, participant_2_id) WHERE organization_id IS NOT NULL
--        は当面残す。新規スレッドは organization_id + organization_1_id/2_id 両方に
--        書き込むため両制約が矛盾なく成立する。organization_id drop 時にこの旧
--        インデックスも drop する。
