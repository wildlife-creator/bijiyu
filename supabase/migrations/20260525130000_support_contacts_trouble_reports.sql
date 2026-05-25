-- ============================================================
-- support: contacts 組み替え + trouble_reports 新規 + 添付バケット
-- ============================================================
-- お問い合わせ（COM-008）の全面改修とトラブル報告（COM-012）の新規追加。
-- 旧 contacts（姓名・5択・本文）を業務問い合わせ向け構造へ ALTER し、
-- trouble_reports テーブルと非公開バケット support-attachments を追加する。
-- db reset 後は空テーブルへの ALTER のため安全。本番データ投入後は
-- NOT NULL 追加に DEFAULT/backfill が必要（現状は本番データ無し）。

-- ========================
-- 1.1 contacts ALTER（旧4列 DROP・新規列 ADD）
-- ========================

-- 旧カラムを廃止
ALTER TABLE contacts DROP COLUMN IF EXISTS last_name;
ALTER TABLE contacts DROP COLUMN IF EXISTS first_name;
ALTER TABLE contacts DROP COLUMN IF EXISTS contact_types;
ALTER TABLE contacts DROP COLUMN IF EXISTS content;

-- ログイン送信者の参照（任意・なりすまし防止のためサーバー側で設定）
-- ユーザー削除時は null 化して問い合わせ記録は残す
ALTER TABLE contacts
  ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE SET NULL;

-- 基本情報
ALTER TABLE contacts ADD COLUMN company_name text NOT NULL;
ALTER TABLE contacts ADD COLUMN name text NOT NULL;
ALTER TABLE contacts ADD COLUMN phone text NOT NULL;
ALTER TABLE contacts ADD COLUMN address text;

-- お問い合わせについて（ラベル保存・単一選択）
ALTER TABLE contacts ADD COLUMN inquiry_type text NOT NULL;
ALTER TABLE contacts ADD COLUMN purpose text NOT NULL;
-- 業種・職種。保有スキルの user_skills.trade_type と区別するため列名は industry
ALTER TABLE contacts ADD COLUMN industry text NOT NULL;

-- 案件情報（任意）
ALTER TABLE contacts ADD COLUMN project_description text;
ALTER TABLE contacts ADD COLUMN project_area text;

-- 動画掲載の相談（任意・ラベル保存）
ALTER TABLE contacts ADD COLUMN video_consultation text;

-- 詳細・添付
ALTER TABLE contacts ADD COLUMN detail text NOT NULL;
ALTER TABLE contacts ADD COLUMN attachments text[];

-- ========================
-- 1.3 contacts RLS 変更（公開 INSERT を塞ぐ）
-- ========================
-- 直接書き込み口を廃止し、検証済みサーバー処理（service role）のみが書き込む。
-- SELECT は contacts_select_admin（admin のみ）を維持。UPDATE/DELETE は不許可を維持。
DROP POLICY IF EXISTS "contacts_insert_anon" ON contacts;
DROP POLICY IF EXISTS "contacts_insert_authenticated" ON contacts;

-- ========================
-- 1.2 trouble_reports 新規作成 + RLS
-- ========================
CREATE TABLE trouble_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 報告者（本人）。ユーザー削除時は null 化して記録は残す（contacts と整合）
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reporter_name text NOT NULL,
  counterparty_name text NOT NULL,
  email text NOT NULL,
  category text,
  content text NOT NULL,
  attachments text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trouble_reports ENABLE ROW LEVEL SECURITY;

-- SELECT は管理者のみ
CREATE POLICY "trouble_reports_select_admin" ON trouble_reports
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

-- INSERT は本人（自分の参照に限る）
CREATE POLICY "trouble_reports_insert_own" ON trouble_reports
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE/DELETE は一般ユーザーに不許可（ポリシー無し = default deny）

-- ========================
-- 1.4 添付用の非公開バケット
-- ========================
-- public=false かつ storage.objects に本バケット向けポリシーを作らない
-- = default deny（service role のみアクセス）。お問い合わせは匿名送信があり
-- uid ベースの Storage RLS が使えないため、書き込みはサーバー処理が代行する。
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-attachments', 'support-attachments', false)
ON CONFLICT (id) DO NOTHING;
