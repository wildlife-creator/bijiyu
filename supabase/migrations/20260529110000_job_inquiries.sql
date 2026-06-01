-- ============================================================
-- job_inquiries: 求人へのお問い合わせ（job-inquiry / COM-013〜015）
-- ============================================================
-- 発注者詳細(CON-006)から特定の発注者宛に送る「橋渡し」の問い合わせ。
-- 状態管理フラグも返信機能も持たない最小構成（save-and-read）。
-- SELECT は admin / 宛先 client 本人 / 宛先組織メンバー の 3 条件で OR 開放、
-- INSERT は本人（sender = self）のみ、UPDATE/DELETE はポリシー無し = default deny。

CREATE TABLE job_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 送信者（認証ユーザー）。退会時は NULL 化して記録は残す
  sender_id uuid REFERENCES users(id) ON DELETE SET NULL,
  -- 宛先発注者（client role）。退会時は NULL 化して記録は残す
  target_client_id uuid REFERENCES users(id) ON DELETE SET NULL,
  -- 宛先発注者の組織（is_same_org() RLS 用に denormalize）。個人プランは NULL
  target_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  -- フォーム入力値（編集後の値）
  name text NOT NULL,
  email text NOT NULL,
  topics text[] NOT NULL CHECK (array_length(topics, 1) >= 1),
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 連投制限 COUNT の高速化（sender_id = self AND created_at > now() - 1h）
CREATE INDEX job_inquiries_sender_id_created_at_idx
  ON job_inquiries (sender_id, created_at DESC);

-- 受信箱一覧の高速化（宛先 client 本人）
CREATE INDEX job_inquiries_target_client_id_created_at_idx
  ON job_inquiries (target_client_id, created_at DESC);

-- 組織共有受信箱の高速化（法人プラン）
CREATE INDEX job_inquiries_target_organization_id_created_at_idx
  ON job_inquiries (target_organization_id, created_at DESC)
  WHERE target_organization_id IS NOT NULL;

ALTER TABLE job_inquiries ENABLE ROW LEVEL SECURITY;

-- SELECT: admin（将来の運営統合管理画面用のデータの器）
CREATE POLICY "job_inquiries_select_admin" ON job_inquiries
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

-- SELECT: 宛先 client 本人
CREATE POLICY "job_inquiries_select_target" ON job_inquiries
  FOR SELECT TO authenticated
  USING (target_client_id = auth.uid());

-- SELECT: 宛先 client の組織メンバー（法人プラン。owner/admin/staff 共有受信箱）
CREATE POLICY "job_inquiries_select_org_member" ON job_inquiries
  FOR SELECT TO authenticated
  USING (
    target_organization_id IS NOT NULL
    AND is_same_org(auth.uid(), target_organization_id)
  );

-- INSERT: 認証済み + 送信者が本人
CREATE POLICY "job_inquiries_insert_own" ON job_inquiries
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- UPDATE / DELETE: ポリシー無し = default deny（admin client / バックエンドのみ）
