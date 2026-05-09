-- Drop legacy compensation flag columns from client_profiles.
--
-- Background: 補償オプション（compensation_5000 / compensation_9800）は当初、
-- 発注者向けの保険として client_profiles のフラグで active 状態を保持していた。
-- 仕様変更により、補償オプションは受注者（contractor / client = owner）向けの
-- 給与未払い保険となり、無料 contractor も含めて購入できるようになった。
-- 受注者は client_profiles を持たないため、フラグでは管理できない。
--
-- 新仕様では active 判定の Single Source of Truth を option_subscriptions
-- (option_type IN ('compensation_5000','compensation_9800') AND status='active')
-- に一本化する。これに伴い、冗長なフラグカラムを削除する。
--
-- 関連ドキュメント:
--   .kiro/steering/product.md
--   .kiro/specs/billing/requirements.md（"#### 月額課金オプション（補償）"）
--   .kiro/specs/billing/design.md（"### Logical Data Model"）

ALTER TABLE client_profiles
  DROP COLUMN IF EXISTS is_compensation_5000,
  DROP COLUMN IF EXISTS is_compensation_9800;
