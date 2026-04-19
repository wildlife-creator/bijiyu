-- ============================================================
-- Task 2.9: handle_new_user トリガー拡張（D 対応）
-- ============================================================
-- CLI-025 担当者招待で auth.admin.inviteUserByEmail に以下メタデータを
-- 渡すと、INSERT INTO auth.users トリガーで public.users を
-- role='staff' + 氏名入りで作成する。
--
--   raw_user_meta_data = {
--     invited_role:       'staff',
--     invited_last_name:  '山田',
--     invited_first_name: '太郎',
--     ...
--   }
--
-- 目的:
--   (a) 担当者が contractor を経由せず最初から staff ロールで作成される
--       → 孤児 auth.users が「無料受注者として居座る」リスクを解消
--   (b) 氏名が INSERT 時点で揃う（B1 の事後 UPDATE 経路を廃止）
--       → RPC 側（insert_staff_member_with_limit）は既存 users を
--         変更しないクリーンな設計に収束（R3 リスク解消）
--
-- AUTH-001（通常サインアップ）との互換性:
--   invited_role が渡されない or 'staff' 以外の値 → 'contractor'
--   （メタデータ汚染防止のためホワイトリスト）
--   invited_last_name / invited_first_name が NULL → public.users は NULL
--   これは移行前と挙動互換（旧実装では氏名は profile 更新フローで後から入る）

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_invited_role       text;
  v_invited_last_name  text;
  v_invited_first_name text;
  v_role               user_role;
BEGIN
  v_invited_role       := NEW.raw_user_meta_data->>'invited_role';
  v_invited_last_name  := NEW.raw_user_meta_data->>'invited_last_name';
  v_invited_first_name := NEW.raw_user_meta_data->>'invited_first_name';

  -- ホワイトリスト: 'staff' のみ受理。それ以外は全て contractor にフォールバック。
  IF v_invited_role = 'staff' THEN
    v_role := 'staff'::user_role;
  ELSE
    v_role := 'contractor'::user_role;
  END IF;

  INSERT INTO public.users (id, role, email, last_name, first_name)
  VALUES (
    NEW.id,
    v_role,
    NEW.email,
    v_invited_last_name,
    v_invited_first_name
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガー本体は 005_auth_trigger.sql で作成済み（on_auth_user_created）。
-- 関数を CREATE OR REPLACE するだけでトリガーは自動的に新実装を使用する。
