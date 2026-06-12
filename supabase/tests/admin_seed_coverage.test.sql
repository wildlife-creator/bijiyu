-- ============================================================
-- pgTAP: admin spec Task 13 — seed テストデータの網羅性検証
-- ============================================================
-- admin 画面（ADM-003 / 011 / 013 / 016〜021 / 023）の E2E が前提とする
-- seed データの不変条件を固定する。seed.sql の編集でカバレッジが
-- 静かに欠落する回帰を防ぐ（データは読み取りのみ・変更しない）。

BEGIN;
SELECT plan(28);

-- ------------------------------------------------------------
-- 管理者ユーザー（ADM-001 ログイン E2E 用）
-- ------------------------------------------------------------
SELECT ok(
  EXISTS (SELECT 1 FROM public.users WHERE role = 'admin' AND email = 'admin@test.local' AND deleted_at IS NULL),
  'admin テストユーザー admin@test.local が存在する'
);

-- ------------------------------------------------------------
-- 本人確認（ADM-011/012）: pending の identity / ccus 申請
-- ------------------------------------------------------------
SELECT ok(
  EXISTS (SELECT 1 FROM identity_verifications WHERE status = 'pending' AND document_type = 'identity'),
  'pending の本人確認（identity）申請が存在する'
);

SELECT ok(
  EXISTS (SELECT 1 FROM identity_verifications WHERE status = 'pending' AND document_type = 'ccus'),
  'pending の CCUS 申請が存在する'
);

-- CCUS 申請者は identity approved 済みの業務フロー整合を守る
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM identity_verifications iv
    JOIN public.users u ON u.id = iv.user_id
    WHERE iv.status = 'pending' AND iv.document_type = 'ccus'
      AND u.identity_verified = false
  ),
  'pending CCUS 申請者は全員 users.identity_verified = true'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM identity_verifications iv
    WHERE iv.status = 'pending' AND iv.document_type = 'ccus'
      AND NOT EXISTS (
        SELECT 1 FROM identity_verifications prev
        WHERE prev.user_id = iv.user_id
          AND prev.document_type = 'identity' AND prev.status = 'approved'
      )
  ),
  'pending CCUS 申請者は全員 identity の approved レコードを持つ'
);

-- ------------------------------------------------------------
-- 問い合わせ閲覧 3 ペア（ADM-016〜021）
-- ------------------------------------------------------------
SELECT ok(
  EXISTS (SELECT 1 FROM contacts WHERE user_id IS NOT NULL),
  'contacts: 登録ユーザー（user_id あり）の問い合わせが存在する'
);

SELECT ok(
  EXISTS (SELECT 1 FROM contacts WHERE user_id IS NULL),
  'contacts: 非ログイン（user_id なし）の問い合わせが存在する'
);

SELECT ok(
  EXISTS (SELECT 1 FROM contacts WHERE attachments IS NOT NULL AND array_length(attachments, 1) > 0),
  'contacts: 添付ありの問い合わせが存在する'
);

SELECT ok(
  EXISTS (SELECT 1 FROM contacts WHERE attachments IS NULL OR array_length(attachments, 1) IS NULL),
  'contacts: 添付なしの問い合わせが存在する'
);

SELECT ok(
  EXISTS (SELECT 1 FROM trouble_reports WHERE attachments IS NOT NULL AND array_length(attachments, 1) > 0),
  'trouble_reports: 添付ありのトラブル報告が存在する'
);

SELECT ok(
  EXISTS (SELECT 1 FROM job_inquiries),
  'job_inquiries: 求人問い合わせが存在する'
);

-- ------------------------------------------------------------
-- 代理メッセージ（ADM-023/024）
-- ------------------------------------------------------------
SELECT ok(
  EXISTS (SELECT 1 FROM admin_proxy_threads),
  'is_proxy=true のメッセージを含むスレッドがビューに存在する'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM message_threads t
    WHERE NOT EXISTS (SELECT 1 FROM admin_proxy_threads v WHERE v.thread_id = t.id)
  ),
  'is_proxy を含まない通常スレッドが存在する（ビュー非掲載の検証用）'
);

-- ------------------------------------------------------------
-- 応募履歴（ADM-013/014）: admin 専用 8 分類の網羅
-- ------------------------------------------------------------
SELECT ok(
  EXISTS (SELECT 1 FROM applications WHERE status = 'applied'),
  '8分類: 応募中（applied）が存在する'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM applications
    WHERE status = 'accepted' AND (first_work_date IS NULL OR first_work_date > CURRENT_DATE)
  ),
  '8分類: 発注済み・初回稼働日前（accepted ＋ 稼働日未到来 or 未確定）が存在する'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM applications
    WHERE status = 'accepted' AND first_work_date < CURRENT_DATE
  ),
  '8分類: 評価未入力（accepted ＋ 稼働日経過）が存在する'
);

SELECT ok(
  EXISTS (SELECT 1 FROM applications WHERE status = 'completed'),
  '8分類: 取引完了（completed）が存在する'
);

SELECT ok(
  EXISTS (SELECT 1 FROM applications WHERE status = 'lost'),
  '8分類: 取引不成立（lost）が存在する'
);

SELECT ok(
  EXISTS (SELECT 1 FROM applications WHERE status = 'rejected'),
  '8分類: 発注側からのお断り（rejected）が存在する'
);

SELECT ok(
  EXISTS (SELECT 1 FROM applications WHERE status = 'cancelled' AND cancelled_by = 'contractor'),
  '8分類: ユーザー側からのキャンセル（cancelled_by=contractor）が存在する'
);

SELECT ok(
  EXISTS (SELECT 1 FROM applications WHERE status = 'cancelled' AND cancelled_by = 'admin'),
  '8分類: 運営によるキャンセル（cancelled_by=admin）が存在する'
);

-- ------------------------------------------------------------
-- 発注者一覧（ADM-003）: 区分 5 種とオプションの整合
-- ------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN organization_members m ON m.user_id = u.id AND m.org_role = 'owner'
    WHERE u.role = 'client' AND u.deleted_at IS NULL
  ),
  '区分: 管理責任者（client ＋ org owner）が存在する'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN organization_members m ON m.user_id = u.id AND m.org_role = 'admin'
    WHERE u.role = 'staff' AND u.deleted_at IS NULL
  ),
  '区分: 組織管理者（staff ＋ org_role=admin）が存在する'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN organization_members m ON m.user_id = u.id AND m.org_role = 'staff'
    WHERE u.role = 'staff' AND u.deleted_at IS NULL
  ),
  '区分: 担当者（staff ＋ org_role=staff）が存在する'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active' AND s.plan_type = 'individual'
    WHERE u.role = 'client' AND u.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.user_id = u.id AND m.org_role = 'owner')
  ),
  '区分: 個人発注者（individual・組織オーナーでない）が存在する'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active' AND s.plan_type = 'small'
    WHERE u.role = 'client' AND u.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.user_id = u.id AND m.org_role = 'owner')
  ),
  '区分: 小規模発注者（small・組織オーナーでない）が存在する'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM option_subscriptions o
    JOIN public.users u ON u.id = o.user_id AND u.role = 'client' AND u.deleted_at IS NULL
    WHERE o.option_type = 'urgent' AND o.status = 'active'
  ),
  'オプション: 急募（urgent）active の発注者が存在する'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM option_subscriptions o
    JOIN public.users u ON u.id = o.user_id AND u.role = 'client' AND u.deleted_at IS NULL
    WHERE o.option_type = 'video_workplace' AND o.status = 'active'
  ),
  'オプション: 職場紹介動画（video_workplace）active の発注者が存在する'
);

SELECT * FROM finish();
ROLLBACK;
