# 一回きりの検証スクリプト（アーカイブ）

過去の実装フェーズで手動検証に使ったスクリプト。現在の運用では使わないが、再現手順の記録として残す。
現在も使うスクリプトは `scripts/stripe/`（Price 作成・検証）、`scripts/cloudflare/`（Stream 設定）、`scripts/capture/`（操作確認集の生成）、`scripts/cp1-verify-stripe.mjs`（Stripe 環境変数の検証。出荷手順書から参照）、`scripts/upload-email-assets.mjs`、`scripts/build-master-*.ts`。

| ファイル | 用途（当時） |
|---|---|
| `cp1-verify-playwright.mjs` | 課金 spec CP1 の画面検証 |
| `cp3-stripe-checkout.mjs` | 課金 spec CP3 の Stripe Checkout 通し検証 |
| `manual-test-recycle.mjs` | メール再利用（email-recycle-on-delete）の手動検証ヘルパー |
| `screenshot-billing.mjs` | 料金プラン画面のスクリーンショット取得 |
| `generate-test-magic-links.mjs` | パスワード表示トグルの確認用マジックリンク生成 |
