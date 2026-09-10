# 動画プラン整理 + 公式SNS動画プラン追加 — 引き継ぎメモ（2026-09-10）

前セッション（ステージング指摘修正の続き）での議論を、次のセッションが読んで着手できるようにまとめたもの。**判断待ちの項目が残っており、実装はまだ始めていない。**

## 1. ここまでの状況（完了済み）

- ステージング指摘修正 9 件 + 1b/1c/2c は `feature/spec-changes-202608` に merge 済・`origin` に push 済（詳細: `staging-check-fix-plan-202609.md` 末尾）。クライアント側（`client/staging`）には未反映
- 年払いの暫定金額を月額 × 10 に変更済（`YEARLY_PRICE_MONTHS`、commit 678dfc6）
- ステージング反映の設定チェックリスト: `staging-release-checklist-202609.md`（Claude Cowork に引き継いで設定作業を進める予定。秘密の値は Claude に見せない運用）
- **今回の動画プランの作業が入るなら、上記チェックリスト A2 に「公式SNS動画の Stripe Price（120,000 円）作成 → `STRIPE_PRICE_VIDEO_SNS`」が 1 行増える**

## 2. きっかけ

ユーザーから「動画プランがもう 1 つあった」と指摘。

- 既存の 10 万円プラン 2 つ（自己PR動画 / 職場紹介動画）= **プロフィール動画**。ビジ友のスタッフが現地で撮影〜編集し、動画を渡す。ビジ友に載せる場合は運営が掲載する
- **新規: ビジ友の公式 SNS に掲載するための動画の撮影・編集プラン = 120,000 円**（内部キー案 `video_sns`）
- 仕様書 `spec-changes-202608.md` §2.2 に「プレミアム・ハイエンドの年払いユーザーに公式SNS掲載用動画をプレゼント」の記述あり（運用対応、アプリに無料化ロジックは入れない前提）

## 3. 現状の表記（4 プラン × 場所）

| 内部キー | 金額 | 買える人 | 料金画面（`BillingClient.tsx` `VIDEO_OPTION_UI_NAMES`） | メール・管理画面（`options.ts` `OPTION_LABELS`） | product.md | 料金画面の説明文 |
|---|---|---|---|---|---|---|
| `video` | 100,000 | 全会員（staff 不可） | 自己PR動画掲載 | 受注者PR動画 | 動画掲載（受注者PR） | あなたの仕事ぶりや人柄を動画でアピール。プロフィール画面と**ビジ友のTikTok紹介ページ**に掲載します。 |
| `video_workplace` | 100,000 | **発注者プラン加入者のみ** | 職場紹介動画掲載 | 職場紹介動画 | 職場紹介動画掲載 | 現場や会社の雰囲気を動画でアピール。職人が見る会社詳細ページと**ビジ友のTikTok紹介ページ**に掲載します。 |
| `video_shooting` | 20,000 | 全会員 | ユーザー撮影プラン | ユーザー撮影プラン | ユーザー撮影プラン | ご自身で撮影した動画を、ビジ友が編集して掲載することができます。※ビジ友で決められた動画の構成に合わせて動画撮影をお願いします。 |
| `video_sns`（新規） | 120,000 | 未定（全会員の想定） | — | — | — | — |

問題点: ①10 万プランに「スタッフが現地で撮影・編集」が書かれていない ②10 万プランの説明に「TikTok 紹介ページに掲載」があり、SNS を別プランにすると矛盾 ③同じプランの名前が場所ごとに 3 通り。

## 4. ユーザーの方向性（2026-09-10 時点・未確定）

**「自己PR動画」と「職場紹介動画」を「プロフィール動画」1 つにまとめてよいのではないか**という提案がユーザーから出た。Claude の見解は「賛成。P4 の『システムは動画の種別を持たず、運営が掲載場所を決める』設計と整合する」。

まとめた場合の整理案（Claude 提案・ユーザー未承認）:

| 名称（画面・メール・仕様書で統一） | 金額 | 買える人 | 説明文（案） |
|---|---|---|---|
| **プロフィール動画制作** | 100,000 円 | 全会員（staff 不可） | ビジ友のスタッフが現地にお伺いして撮影・編集し、あなたや会社を紹介する動画を制作します。<br>完成した動画はお渡しし、ご希望に応じてプロフィール画面や会社詳細ページに掲載します。 |
| **ユーザー撮影プラン** | 20,000 円 | 全会員（staff 不可） | ご自身で撮影した動画を、ビジ友が編集してプロフィール画面や会社詳細ページに掲載します。<br>※ビジ友で決められた動画の構成に合わせて動画撮影をお願いします。 |
| **公式SNS動画制作** | 120,000 円 | 全会員（staff 不可） | ビジ友のスタッフが現地にお伺いして撮影・編集し、ビジ友の公式SNSで紹介する動画を制作します。<br>※撮影日程は、お申し込み後に運営からご連絡します。 |

命名の考え方: 10 万・12 万は「撮影〜編集して動画を渡す」のが本体なので「〜制作」。2 万は「掲載してもらう」のが本体なので「プラン」のまま。

### 未決の判断（次セッションで確認すること）

1. 上表の名称・説明文でよいか（行ごとに修正可）
2. 統合の実装方式: **内部キーは `video` / `video_workplace` を両方残し、新規販売は `video` のみ**（補償オプション停止と同じやり方。過去の購入・管理画面・メールはそのまま動く）でよいか
3. 「プロフィール動画」を全会員に開放してよいか（現状 `video_workplace` だけ発注者プラン加入者限定）
4. 管理画面（ADM-003 / ADM-008）のオプション絞り込みラベル「動画掲載(受注者PR)」「動画掲載（職場紹介）」を残す（旧名併記）か 1 つに統合するか
5. 10 万プランの説明から「TikTok 紹介ページ」を外す（SNS は 12 万に集約）でよいか
6. 公式SNS動画の買える人 = 全会員（staff 不可）でよいか。再購入可・管理画面の絞り込みなし（P7 と同じ）でよいか

## 5. 管理画面の掲載の流れ（現状。ユーザーに説明済）

1. 申込把握: カード決済 → 運営宛「動画オプションの新規お申し込み」メール（`OPS_NOTIFICATION_EMAIL`）。銀行振込は ADM-025/026
2. 撮影・編集・納品はアプリ外
3. 掲載: ADM-027 `/admin/users/[id]/videos`（入口 = ADM-009「受注者PR動画を投稿/編集する」= `placement=contractor_page`、ADM-004 の職場紹介動画ボタン = `placement=client_page`）。タブで掲載先（職人ページ / 会社ページ）を選び、「動画を追加する」→ MP4 アップロード（Cloudflare、200MB）または URL 追加（TikTok 等）。管理用ラベル・並び替え・削除・状態確認。監査ログあり
4. 会員通知: その掲載先で公開中が 0 → 1 本になったときだけ「動画を掲載しました」メール
5. 公式SNS動画は掲載先がアプリ外なので ADM-027 には登場しない（プロフィールにも載せる場合は同画面から追加しラベル「SNS用」）

**統合した場合に直すべき名称**: `src/lib/videos/constants.ts` の `VIDEO_PLACEMENT_LABELS`（現在は商品名「受注者PR動画」「職場紹介動画」→ 掲載先名「職人ページ」「会社ページ」へ）、`VIDEO_PLACEMENT_OPTION_TYPE`（掲載お知らせメールの【動画種別】が商品名前提）、ADM-009 のボタン文言「受注者PR動画を投稿/編集する」→「動画を投稿/編集する」、ADM-004 の職場紹介動画ボタン文言。

## 6. 実装時に触る範囲（P7 の前例 = `p7-video-shooting-option-implementation-notes.md` と同じ手順）

新規 `video_sns` 追加:
- `src/lib/billing/options.ts`: `OptionType` / `OPTION_LABELS` / `OPTION_PRICES_TAX_INCLUDED`（120000）/ `VIDEO_OPTION_TYPES`
- `src/app/(authenticated)/billing/actions.ts`: Zod enum・`priceIdForOption`（`STRIPE_PRICE_VIDEO_SNS`）・success_url
- `src/app/(authenticated)/billing/bank-transfer-actions.ts`: enum
- `src/app/(authenticated)/billing/BillingClient.tsx`: 行追加・`hasVideoOption`・`VIDEO_OPTION_UI_NAMES`・成功トースト
- migration: `bank_transfer_requests_target_consistency` CHECK の option_type 列挙に `video_sns` を追加（P7 の `20260902150000` が前例。忘れると銀行振込申込だけ失敗）+ pgTAP
- `.env.local.example`: `STRIPE_PRICE_VIDEO_SNS`
- Webhook / ADM-026 有効化 / 有効化メールは `isVideoOption()` 経由で自動対応
- テスト: `start-checkout-action` / `handle-checkout-completed` / `bank-transfer-actions` / `bank-transfer-admin-actions` / `bank-transfer.test` に `video_sns`、E2E `billing.spec` / `bank-transfer.spec`
- docs: product.md オプション表、database-schema.md、CLAUDE.md の動画ルール、`spec-changes-202608.md` §2.3 に追記（「呼び分けは商品名として維持」の記述を更新）

統合（`video_workplace` の新規販売停止 + 名称統一）:
- `BillingClient.tsx`: 職場紹介動画の行を削除（または非表示）、自己PR 行を「プロフィール動画制作」に改名・説明文差し替え、`isClientPlanActive` 制限を外す
- `options.ts` `OPTION_LABELS`: `video` → 「プロフィール動画」、`video_workplace` → 「プロフィール動画（旧: 職場紹介）」等
- `billing/actions.ts` / `bank-transfer-actions.ts`: `video_workplace` の新規申込を拒否（既存購入・Webhook・ADM-026 は維持）
- `src/lib/videos/constants.ts` + ADM-009 / ADM-004 のボタン文言（§5 参照）
- ADM-003 / ADM-008 の絞り込みラベル（判断 4）
- E2E / vitest の期待文言更新、docs（product.md・spec-changes §2.3 ・design 系）
- 工数目安: 新規追加 0.5 日 + 統合 0.5 日

## 7. 環境メモ

- E2E: `@playwright/test` 1.58.2 が要求する `chromium_headless_shell-1208` の DL が止まる環境。scratchpad の一時 config（`launchOptions.executablePath` → 既存 `chromium_headless_shell-1234`）で実行した。次回は対話ターミナルで `npx playwright install chromium` を完了させること
- **E2E 全件の前に必ず `supabase db reset`**（使い捨て seed が消費されるため）
- ブランチ運用: `feature/spec-changes-202608` から作業ブランチ（例 `p10-video-plans`）を切り、完了後 `--no-ff` で feature へ merge → `origin` へ push。`client/staging` は触らない
