-- ============================================================
-- 銀行振込のお問い合わせをシンプルにする
--   仕様: docs/requirements/current-spec.md §2.2
--
-- 1. 希望プランの入力欄をやめ、「問い合わせ詳細」に書いてもらう形にする。
--    contacts.bank_transfer_plan（20260916120000 で追加）を DROP する。
--    既存の希望は失わないよう、DROP 前に問い合わせ詳細の末尾へ「（希望プラン：〜）」として書き足す。
-- 2. お問い合わせの種類名を「お支払い方法（銀行振込）について」→「銀行振込について」に変える。
--    ADM-025 は種類名の完全一致で絞るため、既存行も書き換える（書き換えないと一覧から消える）。
-- ============================================================

UPDATE contacts
SET detail = detail || E'\n\n（希望プラン：' ||
  CASE bank_transfer_plan
    WHEN 'individual' THEN 'ライトプラン'
    WHEN 'small' THEN 'スタンダードプラン'
    WHEN 'corporate' THEN 'プレミアムプラン'
    WHEN 'corporate_premium' THEN 'ハイエンドプラン'
    WHEN 'video' THEN 'プロフィール動画制作プラン'
    WHEN 'video_shooting' THEN 'ユーザー撮影動画制作プラン'
    WHEN 'video_sns' THEN 'ビジ友公式SNS動画制作プラン'
    ELSE bank_transfer_plan
  END || '）'
WHERE bank_transfer_plan IS NOT NULL;

ALTER TABLE contacts DROP COLUMN bank_transfer_plan;

UPDATE contacts
SET inquiry_type = '銀行振込について'
WHERE inquiry_type = 'お支払い方法（銀行振込）について';
