-- 詳細住所（勤務地）フローの修正
-- ============================================================
-- 背景:
--   - 詳細住所（番地以下）は本来 CLI-009（発注可否）で発注者が承認する受注者ごとに
--     入力し、マッチング成立した受注者にだけ表示する設計（応募レベルの情報）。
--   - 旧 jobs.address は「案件レベルの番地以下詳細住所」を意図していたが、CLI-004
--     （募集現場新規登録）に入力欄が実装されておらず常に空のまま、複数画面に表示
--     されていた（成立前の受注者にも漏れうる構造）。
--   - 単位（案件 vs 応募）が合わないため jobs.address を流用せず、応募レベルの
--     applications.work_location に一本化する。
--
-- 変更:
--   1. applications.work_location 列を追加（CLI-009 で入力、成立した受注者にのみ表示）
--   2. jobs.address 列を削除（役割は work_location に移管）
--
-- RLS: work_location は applications の列であり、applications の既存 RLS
--      （受注者は自分の応募を、発注者は自案件への応募を参照可）でそのまま保護される。
--      新規ポリシーは不要。

ALTER TABLE applications ADD COLUMN work_location text;
COMMENT ON COLUMN applications.work_location IS '勤務地（番地以下の詳細住所）。CLI-009 で発注者が入力し、マッチング成立した受注者にのみ表示する';

ALTER TABLE jobs DROP COLUMN address;
