-- ============================================================
-- admin spec Task 2.2: admin_proxy_threads view
-- 代理メッセージ監督用の集約ビュー（ADM-023/024）
-- - is_proxy = true のメッセージを1件以上含むスレッドのみを集約する
-- - service_role（admin client）専用。anon / authenticated は SELECT 不可
-- - 注意: メッセージ量増でこの集約コストが上がった場合は
--   materialized view 化（＋定期 REFRESH）を検討すること
-- ============================================================

CREATE VIEW admin_proxy_threads AS
SELECT
  t.id AS thread_id,
  t.organization_id,
  t.participant_2_id AS contractor_id,
  max(m.created_at) AS last_message_at,
  count(*) FILTER (WHERE m.is_proxy) AS proxy_count
FROM message_threads t
JOIN messages m ON m.thread_id = t.id
GROUP BY t.id
HAVING bool_or(m.is_proxy);

-- service_role のみ参照可能にする（admin client 経由のアクセス専用）
REVOKE ALL ON admin_proxy_threads FROM PUBLIC, anon, authenticated;
