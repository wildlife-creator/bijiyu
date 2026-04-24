-- ============================================================
-- Task 2.2: client_profiles に住所 + SNS 保有フラグ列を追加
-- ============================================================
-- CLI-021（発注者情報編集画面）で入力する項目を保存するため、
-- 以下 6 列を追加する。文字列長上限は Zod でクライアント/サーバー両面
-- チェックするため DB 側では CHECK 制約を追加しない（既存慣行準拠）。
--
--   address        — 住所（任意、200 字上限は Zod で制御）
--   sns_x          — X/Twitter 保有フラグ
--   sns_instagram  — Instagram 保有フラグ
--   sns_tiktok     — TikTok 保有フラグ
--   sns_youtube    — YouTube 保有フラグ
--   sns_facebook   — Facebook 保有フラグ
--
-- sns_* は運営側集計用。UI 上の表示に用いない（要件書 REQ-ORG-002 参照）。

ALTER TABLE client_profiles
  ADD COLUMN address       text,
  ADD COLUMN sns_x         boolean NOT NULL DEFAULT false,
  ADD COLUMN sns_instagram boolean NOT NULL DEFAULT false,
  ADD COLUMN sns_tiktok    boolean NOT NULL DEFAULT false,
  ADD COLUMN sns_youtube   boolean NOT NULL DEFAULT false,
  ADD COLUMN sns_facebook  boolean NOT NULL DEFAULT false;
