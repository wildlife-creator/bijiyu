-- ============================================================
-- withdrawal_surveys: 退会理由アンケートの保存（集計用の器）
-- ============================================================
-- 退会フォーム（COM-006）で収集する退会理由を保存する。これまで reason/details は
-- バリデーションのみで DB に残していなかったため、退会動向の集計が不可能だった。
-- 文言変更に強い reason_code（固定識別子）と退会時点の表示文 reason_label を併せて
-- 保存し、role / plan_type のスナップショットで属性別集計を可能にする。
-- 管理画面は本マイグレーションでは作らない（contacts / trouble_reports と同じ
-- 「器だけ」方針）。RLS は trouble_reports と同じ作法に揃える。

CREATE TABLE withdrawal_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 退会者本人。ユーザー物理削除時は null 化して集計記録は残す（contacts と整合）
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  -- 文言変更に左右されない固定識別子（集計のグルーピングキー）
  reason_code text NOT NULL,
  -- 退会時点の表示文（参照用スナップショット）
  reason_label text NOT NULL,
  -- 自由記述（任意）
  details text,
  -- 退会時点の属性スナップショット（属性別集計用 / 退会後に変わらない値として保存）
  role text,
  plan_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE withdrawal_surveys ENABLE ROW LEVEL SECURITY;

-- SELECT は管理者のみ（集計・分析用）
CREATE POLICY "withdrawal_surveys_select_admin" ON withdrawal_surveys
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

-- INSERT は本人のみ（退会処理中、signOut 前の認証済みセッションで自分の行を記録）
CREATE POLICY "withdrawal_surveys_insert_own" ON withdrawal_surveys
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE/DELETE は一般ユーザーに不許可（ポリシー無し = default deny）

-- 集計クエリ向けインデックス
CREATE INDEX idx_withdrawal_surveys_reason_code ON withdrawal_surveys (reason_code);
CREATE INDEX idx_withdrawal_surveys_created_at ON withdrawal_surveys (created_at);
