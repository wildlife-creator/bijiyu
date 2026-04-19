-- ============================================================
-- Rollback for: 20260419100600_backfill_client_profiles_display_name.sql
-- ============================================================
-- Task 2.7 は organizations.name を一切変更しないため、本 revert は
-- client_profiles 側の書き込みを元に戻すことに専念する。
--
-- 判別基準:
--   (a) INSERT で新規作成した行
--       → 他カラム（address / image_url / language / message / message /
--          recruit_* / employee_scale / working_way / admin_memo / sns_*）が
--          全てデフォルト値のまま = バックフィル由来と判断し DELETE。
--   (b) UPDATE で display_name を上書きした行
--       → display_name が organizations.name と一致している行を NULL に戻す。
--         billing Webhook 由来の初期値と混在する可能性があるため、厳密な
--         復元は監査テーブル（本 spec では採用せず）が無い場合ベストエフォート。
--
-- 実行前に必ず以下を確認:
--   1. ブランチが Phase 3（Task 19）の DROP COLUMN に到達していないこと。
--      到達後は organizations.name を参照できないため本 revert は無効。
--   2. 本番データ規模が少ないうちのロールバックに限って有効。
--      大規模適用後は別途 DB バックアップからの復元を検討すること。

BEGIN;

-- (a) バックフィル INSERT 由来の行を削除
--     条件: display_name が organizations.name と一致し、他の任意入力カラムが全て
--           NULL / デフォルト値のまま（= CLI-021 で更新されていない）。
--     sns_* は NOT NULL DEFAULT false のため、boolean = false で判定する。
DELETE FROM client_profiles cp
 USING organizations o
 WHERE o.owner_id = cp.user_id
   AND o.deleted_at IS NULL
   AND o.name IS NOT NULL
   AND o.name <> ''
   AND cp.display_name = o.name
   AND cp.address        IS NULL
   AND cp.image_url      IS NULL
   AND cp.language       IS NULL
   AND cp.message        IS NULL
   AND cp.admin_memo     IS NULL
   AND cp.working_way    IS NULL
   AND cp.employee_scale IS NULL
   AND cp.recruit_area   IS NULL
   AND cp.recruit_job_types IS NULL
   AND cp.sns_x         = false
   AND cp.sns_instagram = false
   AND cp.sns_tiktok    = false
   AND cp.sns_youtube   = false
   AND cp.sns_facebook  = false
   AND cp.is_urgent_option     = false
   AND cp.is_compensation_5000 = false
   AND cp.is_compensation_9800 = false;

-- (b) バックフィル UPDATE 由来の display_name を NULL に戻す
--     条件: display_name が organizations.name と等しい（= 上書き由来）かつ
--           Step (a) で削除されなかった行
UPDATE client_profiles cp
   SET display_name = NULL
  FROM organizations o
 WHERE o.owner_id = cp.user_id
   AND o.deleted_at IS NULL
   AND o.name IS NOT NULL
   AND o.name <> ''
   AND cp.display_name = o.name;

COMMIT;
