-- ============================================================
-- R4 fix: admin_proxy_threads view を Phase 2 identity ベースに更新
--
-- 旧設計 (20260612100100):
--   contractor_id AS t.participant_2_id を決め打ちしていた。
--   Phase 2 で participant_1 = 受注者 の受注者起点スレッドが生まれると、
--   ADM-023/024 で「職人」欄と「発注者」欄が逆転して表示される問題があった。
--
-- 新設計:
--   受注者は業務ルールとして必ず個人 identity (organization_X_id が null)。
--   → contractor_id = organization_X_id が null な side の participant_X_id
--   → organization_id = organization_1_id / organization_2_id / 旧 organization_id
--     の COALESCE (org 側 identity を採用)
--
-- 注意:
--   両側 organization_X_id が null (組織を含まない代理送信の可能性は低いが)
--   の場合は participant_2_id を返す (旧挙動と一致)。
--   両側 organization_X_id 非 null (組織⇔組織の代理送信) は将来ケース。
--   その場合 participant_2_id を「受注者側」として返すが、実用上は起きない前提。
-- ============================================================

DROP VIEW IF EXISTS admin_proxy_threads;

CREATE VIEW admin_proxy_threads AS
SELECT
  t.id AS thread_id,
  COALESCE(t.organization_1_id, t.organization_2_id, t.organization_id) AS organization_id,
  CASE
    WHEN t.organization_1_id IS NULL AND t.organization_2_id IS NOT NULL
      THEN t.participant_1_id
    WHEN t.organization_2_id IS NULL AND t.organization_1_id IS NOT NULL
      THEN t.participant_2_id
    -- 両側 org 無し / 両側 org 有り のフォールバック: participant_2_id を採用 (旧挙動互換)
    ELSE t.participant_2_id
  END AS contractor_id,
  max(m.created_at) AS last_message_at,
  count(*) FILTER (WHERE m.is_proxy) AS proxy_count
FROM message_threads t
JOIN messages m ON m.thread_id = t.id
GROUP BY t.id
HAVING bool_or(m.is_proxy);

REVOKE ALL ON admin_proxy_threads FROM PUBLIC, anon, authenticated;

COMMENT ON VIEW admin_proxy_threads IS
  'ADM-023/024 代理メッセージ監督用 (Phase 2 identity ベース版)。
   contractor_id = organization_X_id が null な side の participant_X_id
   (受注者は必ず個人 identity という業務ルールに基づく)。
   organization_id = org 側の organization_X_id を COALESCE で採用。
   service_role 専用 (anon / authenticated は SELECT 不可)。';
