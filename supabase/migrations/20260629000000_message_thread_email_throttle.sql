-- §2.1 メッセージ受信通知メールの throttle 用カラム追加
--
-- 「(スレッド × 受信側) で 15 分間隔ガード」を実現するため、
-- 受信側ごとに「最後に通知メール送信した時刻」を保持する。
-- スレッド内の「会社サイド全員」で 1 個のクロックを共有 (個別メンバーごとには持たない)。
--
-- - last_email_to_contractor_at: 受注者宛通知の最終送信時刻
-- - last_email_to_client_side_at: 発注者側 (個人発注者 or 法人組織全員) 宛通知の最終送信時刻
--
-- メリット: シンプル、別テーブル不要、メンバー追加・削除時のクリーンアップ不要
-- 妥協点: 新規メンバー追加直後のメッセージは「クロックが新しい」と判定されて
--   届かない可能性があるが、次の throttle 窓 (最大 15 分後) で届くため実害は少ない。

ALTER TABLE message_threads
  ADD COLUMN IF NOT EXISTS last_email_to_contractor_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_email_to_client_side_at timestamptz;

COMMENT ON COLUMN message_threads.last_email_to_contractor_at IS
  '§2.1 受注者宛メッセージ受信通知メールの最終送信時刻。throttle 15 分判定に使用。';
COMMENT ON COLUMN message_threads.last_email_to_client_side_at IS
  '§2.1 発注者側 (個人発注者 or 法人組織全員) 宛メッセージ受信通知メールの最終送信時刻。throttle 15 分判定に使用。';
