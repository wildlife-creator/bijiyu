-- video-display Task 2
-- 発注者の「職場紹介動画」URL を保持するカラムを client_profiles に追加する。
--
-- - 受注者PR動画 (users.video_url) とは独立した別カラム。
-- - NULL 許容 / default なし / index 不要 / CHECK なし（URL 検証はアプリ層の
--   parseVideoUrl + VideoUrlSchema が担う）。
-- - 既存 RLS（SELECT 公開 USING (true) / 書き込みは own）で十分なため
--   ポリシー追加は行わない。運営による代理更新は admin（service-role）client が
--   RLS をバイパスして実行する。
--
-- option_subscriptions.option_type は CHECK 制約が無い素の text のため、
-- 新値 'video_workplace' の INSERT に DDL 変更は不要（既存 'video' の意味は据置）。

ALTER TABLE client_profiles ADD COLUMN workplace_video_url text;

COMMENT ON COLUMN client_profiles.workplace_video_url IS
  '職場紹介動画の URL（video_workplace オプション）。表示判定は option_subscriptions の active な video_workplace との AND。';
