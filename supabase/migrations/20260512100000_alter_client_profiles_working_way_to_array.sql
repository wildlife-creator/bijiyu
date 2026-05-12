-- working_way を text → text[] に変換
--
-- 背景:
--   CON-005-popup（発注者検索）の実装に合わせ、CLI-021 でも「求める働き方」を
--   複数選択で登録できるようにする。検索側は単一選択のまま overlaps() で OR 検索。
--   既存の他フィールド（recruit_job_types / recruit_area / language）と整合させる。
--
-- 旧データの変換ルール:
--   client_profiles.working_way:
--     NULL / ''       → NULL
--     "1日から可"     → ARRAY['1日から可']
--     "長期歓迎"      → ARRAY['長期歓迎']
--     その他自由文     → ARRAY[<元の値>]（手動マッピングは行わない。次回 CLI-021 編集時に正規化）

ALTER TABLE client_profiles ADD COLUMN working_way_new text[];

UPDATE client_profiles
SET working_way_new = CASE
  WHEN working_way IS NULL OR length(trim(working_way)) = 0 THEN NULL
  ELSE ARRAY[working_way]
END;

ALTER TABLE client_profiles DROP COLUMN working_way;
ALTER TABLE client_profiles RENAME COLUMN working_way_new TO working_way;
