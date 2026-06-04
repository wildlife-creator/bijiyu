-- ============================================================
-- organization-scoping-consistency Task 2.1
-- client_reviews に organization_id を新設（案C）
-- ------------------------------------------------------------
-- 受注者→発注者評価（client_reviews）に「評価対象案件の会社」の鍵を持たせ、
-- 発注者評価を会社単位で集計できるようにする。
--   * 値 = jobs.organization_id（評価作成時に submitContractorReportAction が保存）
--   * 個人発注者の案件は NULL のまま
--   * reviewee_id（案件作成者）は不変で併存（会社集計の作成者別内訳を残すため）
--   * 組織削除時は ON DELETE SET NULL（評価行は残す）
-- 既存 RLS（can_view_client_review 等）は変更しない。
-- user_reviews（受注者への評価）には列を追加しない（被評価者が常に個人のため）。
-- ============================================================

ALTER TABLE client_reviews
  ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

-- 会社単位集計（organization_id でのフィルタ）用の部分インデックス。
-- 個人発注者ぶん（NULL）はインデックス対象外。
CREATE INDEX idx_client_reviews_organization
  ON client_reviews (organization_id)
  WHERE organization_id IS NOT NULL;
