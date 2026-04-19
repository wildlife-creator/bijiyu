-- ============================================================
-- Task 2.3: users.password_set_at 追加 + email インデックス追加
-- ============================================================
-- R2: 招待フロー（AUTH-008 パスワード初回設定）で、招待完了前（NULL）
-- と完了後（timestamptz）を区別するために password_set_at を追加。
-- CLI-022 担当者一覧の「招待中」バッジ表示判定に使用する。
--
-- 同時に idx_users_email を追加。CLI-025 メール重複チェックを
-- public.users.email 経由で O(log N) に引くため。
-- auth.users.email の UNIQUE 制約に連動するため、public.users.email は
-- 実質ユニークだが、handle_user_email_change トリガー反映までの race を
-- 許容するため **非 UNIQUE** インデックスとする。

ALTER TABLE public.users
  ADD COLUMN password_set_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
