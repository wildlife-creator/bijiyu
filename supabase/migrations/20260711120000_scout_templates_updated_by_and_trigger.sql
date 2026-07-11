-- ============================================================
-- scout_templates: 最終更新者(updated_by) 追加 + updated_at トリガー補填
-- ============================================================
-- 背景:
--   スカウト定型文（法人プランでは組織メンバー全員が共有）は作成日・作成者
--   しか記録されておらず、他メンバーが編集しても「誰がいつ変えたか」が
--   分からなかった。
--
-- 2 つの修正:
--   1. updated_by カラム追加（最終更新者。更新系 Server Action が実行者を設定）
--   2. set_updated_at トリガー補填（★既存バグ修正）
--      scout_templates は table 定義に updated_at カラムを持つが、
--      他の全テーブルと違い set_updated_at トリガーが貼られていなかった。
--      そのため UPDATE しても updated_at が INSERT 時刻のまま前進せず、
--      一覧の `ORDER BY updated_at DESC` が実質「作成日順」に退化していた。
--      CLAUDE.md「DB トリガーとカラムの整合」ルール（updated_at カラムと
--      set_updated_at トリガーはセット）の逆パターン（カラム有・トリガー無）。
--
-- updated_by は退会（ソフトデリート）で消さない履歴データのため、
-- 更新者が将来物理削除されてもテンプレ本体を巻き込まないよう
-- ON DELETE SET NULL とする（owner_id は既存どおり ON DELETE CASCADE）。

ALTER TABLE scout_templates
  ADD COLUMN updated_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON scout_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
