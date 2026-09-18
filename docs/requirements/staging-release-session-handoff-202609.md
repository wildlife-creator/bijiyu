# Claude セッション引き継ぎ: ステージング反映作業（2026-09 改修 P1〜P11）

作成: 2026-09-15。前セッションの Claude（Cowork）が作成。
**新しいセッションへの指示例**: 「`docs/requirements/staging-release-session-handoff-202609.md` と `staging-release-checklist-202609.md` を読んで、続きから案内して」

## 1. 依頼者との約束（最重要・必ず守ること）

- 手順書は `docs/requirements/staging-release-checklist-202609.md`。役割分担はその §0 のとおり
- **秘密の値（sk_/whsec_/re_/APIトークン/service_role/署名secret）は Claude に見せない・表示するコマンドを実行しない**。貼り付け作業中は画面を見に行かない
- 識別子（`price_…` / `bpc_…` / プロジェクト ref / URL / Cloudflare Account ID / `sub_…` / `@test.local` のアドレス）は共有可
- 依頼者は非エンジニア。専門用語はかみ砕き、ターミナル操作は「コピーして貼る1行」まで具体化する。作業は「Claude がスクリプトを書き、依頼者が自分のターミナルで実行する」方式が定着している
- 依頼者のチャット表示ルール（件数宣言・結論先行・短文・並列は1行ずつ）は個人設定に登録済み

## 2. 進捗状況（2026-09-15 時点）

| 工程 | 状態 |
|---|---|
| A0 月額 Price 5 本の作り直し（P11 新価格） | 完了。旧 Price アーカイブ・旧テスト契約 4 件解約済み |
| A1 年払い Price 4 本 + プラン変更用ポータル | 完了 |
| A2 動画プラン 2 本 + 商品名変更 | 完了 |
| A3 Cloudflare（Stream 契約・Account ID・API トークン） | 完了。従量プラン（Stream のみ、実質 $5/月〜）。使用量通知（視聴 5,000 分）設定済み |
| A4 Webhook 登録 | 完了（staging 宛て） |
| ローカル環境での全項目動作確認 | 完了（決済・アップグレード確認画面・メール・並び順・管理画面・MP4 アップロード・運営アカウントのメッセージ/紹介/案内） |
| クライアント向けデモ | 2026-09-15 予定。進行表（demo-runsheet.html）をチャットで渡し済み |
| B1〜B5（staging 反映）・C1〜C6 | 未着手。**デモで OK が出てから**着手する約束 |

追加で実施した修正（コミット・プッシュ済み、先端 `1cb256c`）:
- メッセージ本文中の URL の自動リンク化（`1180934`）
- 会員向け動画表示枠の縦長 9:16 統一（`fd28155`）
- ADM-027 タブのスマホ幅はみ出し修正（`29ccdb8`）
- ステージング指摘 9 件（No.33/8/1・24/21/22/35・37/40/確認-3ab）は 2026-09-08 に全件実装済み（`archive/2026-08-09/staging-check-fix-plan-202609.md` 末尾参照）

## 3. 控えてある識別子（B4 で Vercel に貼る値。`.env.local` には反映済み）

```
STRIPE_PRICE_INDIVIDUAL=price_1UE3ffR1gPIkMTMdq391KTHt
STRIPE_PRICE_SMALL=price_1UE3fgR1gPIkMTMdQs1nf7Xe
STRIPE_PRICE_CORPORATE=price_1UE3fhR1gPIkMTMd4dESViyi
STRIPE_PRICE_CORPORATE_PREMIUM=price_1UE3fiR1gPIkMTMd8n8ZUeHE
STRIPE_PRICE_INITIAL_FEE=price_1UE3fjR1gPIkMTMdN9zyE81h
STRIPE_PRICE_INDIVIDUAL_YEARLY=price_1UE3paR1gPIkMTMdqsBKeWaJ
STRIPE_PRICE_SMALL_YEARLY=price_1UE3pbR1gPIkMTMdnBhXJY6n
STRIPE_PRICE_CORPORATE_YEARLY=price_1UE3pcR1gPIkMTMd6IC2rdvi
STRIPE_PRICE_CORPORATE_PREMIUM_YEARLY=price_1UE3pcR1gPIkMTMdY8eNmC2Y
STRIPE_PORTAL_UPDATE_CONFIGURATION_ID=bpc_1UE3slR1gPIkMTMd9knA6yWV
STRIPE_PRICE_VIDEO_SHOOTING=price_1UE45DR1gPIkMTMdI5nzu7Wz
STRIPE_PRICE_VIDEO_SNS=price_1UE45ER1gPIkMTMdguI21vyx
CLOUDFLARE_ACCOUNT_ID=a4b5fb9523a41e6a6cf651d494619d18
```

秘密側（`CLOUDFLARE_STREAM_API_TOKEN` / `CLOUDFLARE_STREAM_WEBHOOK_SECRET`）は依頼者の `.env.local` にあり、B4 で**依頼者が** Vercel に貼る。

## 4. 追加したスクリプト（すべてコミット済み。本番反映でも再利用する）

| ファイル | 用途 |
|---|---|
| `scripts/stripe/setup-monthly-prices.mjs` | A0: 新月額 Price 作成 + 旧アーカイブ + 旧契約一覧 |
| `scripts/stripe/cancel-old-price-test-subs.mjs` | A0 の後片付け（対象 sub をハードコード。テストモード専用ガード付き） |
| `scripts/stripe/setup-video-prices.mjs` | A2: 動画プラン 2 本 + 商品名変更 |
| `scripts/stripe/verify-new-prices.mjs` | A1/A2 の検証（年払い・動画・ポータル） |
| `scripts/stripe/debug-portal.mjs` | ポータル設定の中身表示（調査用） |
| `scripts/cloudflare/verify-stream.mjs` | A3/A4 の検証（トークン有効性・Webhook 宛先。秘密は表示しない） |
| `scripts/stripe/setup-yearly-prices.mjs`（既存を修正） | payment_method_update を true に（Stripe 仕様変更対応。false だと 400） |

## 5. 既知の注意点

- **ポータル設定の「対象商品 0 件」は正常**。現行 Stripe API は設定に商品リストを保存しない（アプリが subscription_update_confirm で切替先を都度指定する方式）。`debug-portal.mjs` で確認済み
- **ローカル環境を `supabase db reset` しない**（デモ前）。リハーサルで作った実 Stripe 契約（田中=スタンダード月払い）とアップ済み動画が前提のため。デモ後の reset は可だが、reset すると DB 側だけ消えて Stripe 側にテスト契約が残るので、不要になったら Stripe 側でも解約する（C6 と同時でよい）
- ローカルのメールは未送信で `/tmp/bijiyu-dev-mail/` に保存される（`RESEND_API_KEY` 未設定のため）
- テストアカウントのパスワードは全員 `testpass123`。運営テスト用は `ops-account@test.local`（ローカル専用。**本番の運営アカウントは C3 で新規作成**）
- ローカル決済テストは `stripe listen --forward-to http://localhost:3000/api/webhooks/stripe` を起動しておくこと
- 前セッションでは Claude の作業シェル（device_bash）からリポジトリのマウントが読めず、ファイル読み書きは stage/commit ツール経由で行った。新セッションで同様なら同じ方式で
- Claude のブラウザパネルは Stripe Checkout の決済後リダイレクトを表示できないことがある（決済自体は成功する）。決済系の確認は依頼者の通常ブラウザで

## 6. 残タスク（デモ OK 後）

1. B1: 依頼者のターミナルで `supabase login` → `supabase db push --linked`（マイグレーション 8 本）→ `supabase migration list --linked` で確認
2. B2: cron の通知先確認（SELECT のみ。直しが必要なら依頼者が SQL 実行）
3. B3: Edge Function 2 本デプロイ + secrets（secrets は依頼者のターミナル）
4. B4: Vercel 環境変数（§3 の一覧 + 秘密 2 本を依頼者が貼る）→ B5 のデプロイで反映
5. B5: `git push client feature/spec-changes-202608` → PR（base: staging）→ マージ
6. C1〜C6: チェックリストどおり（C2 詰みデータ解消は ADM-014「完了扱いにする」で = 指摘修正 2a の実地検証）

## 7. クライアントに確認中・未決の事項

- 動画表示枠の基準比率: 暫定で縦長 9:16 に統一済み。デモで見せて異論があれば変更（実装は 1 か所の定数変更で済む作りにしてある）
- 年払いの正式金額: 暫定「月額 × 10」のまま。確定したら checklist D 項の手順で更新
- 修正依頼メモ: `docs/requirements/archive/2026-08-09/video-display-size-request-202609.md`（対応済み。経緯の記録）
