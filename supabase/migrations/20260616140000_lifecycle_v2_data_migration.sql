-- ============================================================
-- proxy-account-multi-org-support Phase 5 / Task 5.1
--
-- 旧 `users.is_active = false` 冷凍保存データを新モデル
-- (organization_members 行物理削除 + users.deleted_at セット) に正規化する。
--
-- 背景:
--   Phase 4 で handle_subscription_lifecycle_deleted v2 / delete_staff_member v2
--   が「行削除統一」に切り替わったため、旧モデルで凍結された Admin / Staff の
--   既存データを新モデルに揃える必要がある。
--   旧モデル: `users.is_active = false` + organization_members 行は残置
--   新モデル: organization_members 行を削除 + users.deleted_at = now() セット
--
-- 影響対象:
--   `users.is_active = false`
--   AND `users.deleted_at IS NULL`           (まだ正規化されていない)
--   AND public.users.id にひもづく organization_members が 1 件以上
--
-- 冪等性:
--   本 migration は WHERE 句で「is_active=false AND deleted_at IS NULL」を
--   満たす行のみを対象とするため、再実行しても同じ結果になる。
--   migration 後に新規 is_active=false ユーザーが発生しない (Phase 4 で実装
--   完了) ことを前提とする。
--
-- ロールバック:
--   本 migration はデータ正規化であり、`users.deleted_at` を一度セットすると
--   元に戻せない (deleted_at に紐づく cascade 動作なし、生の UPDATE のため可逆
--   ではあるが、行削除した organization_members は復元不能)。
--   本番投入前に対象ユーザー件数を必ず事前カウントし、想定外の数 (例: > 10)
--   なら投入を保留する。詳細は `run-book-phase-5.md` 参照。
--
-- 末尾固定 grant migration (20260617120000_...) より前のタイムスタンプで配置。
-- ============================================================

-- 影響行数を NOTICE で出力 (本番ログで件数を確認するため)
DO $$
DECLARE
  v_target_count integer;
  v_member_count integer;
BEGIN
  SELECT count(*) INTO v_target_count
    FROM public.users
   WHERE is_active = false
     AND deleted_at IS NULL;

  SELECT count(*) INTO v_member_count
    FROM organization_members om
    JOIN public.users u ON u.id = om.user_id
   WHERE u.is_active = false
     AND u.deleted_at IS NULL;

  RAISE NOTICE
    '[lifecycle_v2_data_migration] normalizing % users (is_active=false AND deleted_at IS NULL); will delete % organization_members rows',
    v_target_count, v_member_count;
END
$$;

-- Step 1: 対象ユーザーの全 organization_members 行を物理削除
DELETE FROM organization_members
 WHERE user_id IN (
   SELECT id FROM public.users
    WHERE is_active = false
      AND deleted_at IS NULL
 );

-- Step 2: 対象ユーザーに deleted_at = now() をセット
-- is_active=false 自体は global ログインゲートとして残置 (要件 4.6)。
-- 二重に弾ける状態にしておくため上書きしない。
UPDATE public.users
   SET deleted_at = now()
 WHERE is_active = false
   AND deleted_at IS NULL;
