# 動画プラン整理 + 公式SNS動画プラン追加 — 引き継ぎメモ（2026-09-10）

前セッション（ステージング指摘修正の続き）での議論を、次のセッションが読んで着手できるようにまとめたもの。**§4 の判断は 2026-09-10 にすべて確定済み（§4 参照）。実装は同日 `p10-video-plans` ブランチで完了（§6 の範囲。実装結果は §9）。** 後続タスク（プラン比較表の修正）は §8。

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

## 4. 確定事項（2026-09-10 ユーザー承認済）

「自己PR動画」と「職場紹介動画」を **「プロフィール動画」1 つに統合**し、公式SNS動画を新設する。名称・説明文は以下で確定（画面・メール・仕様書で統一。ブランド表記は既存どおり「ビジ友」）。

### 4.1 名称・金額・説明文（確定）

**1. プロフィール動画制作プラン　100,000 円　買える人: 全会員（staff 不可）**

> ビジ友のスタッフが現地にお伺いして撮影・編集し、あなたや会社を紹介する動画を制作します。
> ご希望に応じてビジ友のユーザー詳細や発注者詳細のページに掲載することができます。
> ※エリアにより交通費等が発生する場合があります。
> ※プレミアム・ハイエンドプランの方は本プランが含まれていますので、お申し込みは不要です（2本目以降をご希望の場合はお申し込みください）。

**2. ユーザー撮影プラン　20,000 円　買える人: 全会員（staff 不可）**

> ご自身で撮影した動画をビジ友運営が編集して、ご希望に応じてビジ友のユーザー詳細や発注者詳細のページに掲載することができます。
> ※ビジ友で決められた動画の構成に合わせて動画撮影をお願いします。

**3. ビジ友公式SNS動画制作プラン　120,000 円　買える人: 全会員（staff 不可）　内部キー `video_sns`**

> ビジ友のスタッフが現地にお伺いして撮影・編集し、ビジ友の公式SNSで紹介する動画を制作します。
> ※エリアにより交通費等が発生する場合があります。
> ※プレミアム・ハイエンドプランを年払いでご利用の方は本プランが含まれていますので、お申し込みは不要です。

命名の考え方: 語尾は 3 つとも「〜プラン」で統一。掲載先の呼び方は**他の会員から見た画面名**（ユーザー詳細 / 発注者詳細）に揃える。「完成した動画はお渡しし」は運用未確定のため入れない。「TikTok 紹介ページ」は 10 万プランから外し、SNS 掲載は 12 万プランに集約。

### 4.2 画面上の呼び方（確定）

| 場所 | 現在 | 変更後 |
|---|---|---|
| 会員が見るページの動画欄の見出し（`<VideoList label>`: COM-001 / CLI-006 / ADM-009 の「PR動画」、CON-006 / CLI-020 / ADM-004 の「職場紹介動画」） | PR動画 / 職場紹介動画 | 両方とも **プロフィール動画** |
| ADM-027 の掲載先タブ名（`VIDEO_PLACEMENT_LABELS`） | 受注者PR動画 / 職場紹介動画 | **ユーザープロフィール（ユーザー詳細）** / **発注者情報詳細（発注者詳細）** |
| ADM-009 / ADM-004 の ADM-027 への入口ボタン | 受注者PR動画を投稿/編集する / 職場紹介動画を投稿/編集する | 動画を投稿/編集する（両方） |
| ADM-004 の動画セクション見出し | 職場紹介動画 | プロフィール動画 |

### 4.3 判断 6 点の結論

| # | 判断 | 結論 |
|---|---|---|
| 1 | 名称・説明文 | §4.1 / §4.2 のとおり |
| 2 | 統合の実装方式 | 内部キー `video` / `video_workplace` は両方残し、**新規販売は `video` のみ**（`video_workplace` は Checkout / 銀行振込の新規申込を拒否。補償停止と同じやり方）。リリース前で購入者がいないため購入記録の書き換え・データ移行は不要 |
| 3 | プロフィール動画制作プランの購入対象 | **全会員（staff 不可）**。`video_workplace` の「発注者プラン加入者のみ」制限（`isClientPlanActive`）は撤廃。掲載先はプランに関係なく運営が ADM-027 のタブで選ぶ |
| 4 | 管理画面の絞り込みラベル | **「プロフィール動画」1 つに統合**（`video` + `video_workplace` の両方にヒット）。ADM-008 の「動画掲載(受注者PR)」・ADM-003 の「動画掲載（職場紹介）」・ADM-003 行のバッジ「職場紹介動画」（`CLIENT_OPTION_BADGE_LABELS`）をすべて「プロフィール動画」へ。どこに載せているかは会員詳細 → ADM-027 で確認できる |
| 5 | 10 万プランの「TikTok 紹介ページ」 | 外す。SNS は 12 万プランに集約 |
| 6 | 公式SNS動画の条件 | 全会員（staff 不可）・作り直しの再購入可。**ADM-008 の絞り込みに「ユーザー撮影プラン」「ビジ友公式SNS動画」を追加**（ADM-008 の選択肢 = プロフィール動画 / ユーザー撮影プラン / ビジ友公式SNS動画 / 補償 2 種。ADM-003 は 急募 / プロフィール動画 のまま） |

### 4.4 プラン付属（プレミアム・ハイエンド）の扱い — アプリ側の制御は入れない

| 会員の状態 | プロフィール動画制作（10 万） | ビジ友公式SNS動画制作（12 万） |
|---|---|---|
| 無料・ライト・スタンダード | 購入 | 購入 |
| プレミアム・ハイエンド（月払い） | **プランに付属** | 購入 |
| プレミアム・ハイエンド（年払い） | **プランに付属** | **プランに付属** |

- `spec-changes-202608.md` §2.2(2) の「プレミアム・ハイエンドは職場紹介動画が無料 / 年払いは公式SNS動画プレゼント」を「プロフィール動画」に読み替えたもの。方針は同じく**運用対応**
- **アプリ側は料金画面の注意書きのみ**（§4.1 の 2 つの「※」）。購入ボタンは付属会員にも残す（2 本目の購入があり得るため）。決済側のガード・ADM-004 の「〜付き」目印は**作らない**（確認箇所を増やさない。ユーザー判断）
- 運営は ADM-004 の「発注者情報」に併記されるプラン + 月払い/年払いを見て撮影を案内する。誤って決済した人は運営が Stripe で返金（例外対応）

## 5. 管理画面の掲載の流れ（現状。ユーザーに説明済）

1. 申込把握: カード決済 → 運営宛「動画オプションの新規お申し込み」メール（`OPS_NOTIFICATION_EMAIL`）。銀行振込は ADM-025/026
2. 撮影・編集・納品はアプリ外
3. 掲載: ADM-027 `/admin/users/[id]/videos`（入口 = ADM-009「受注者PR動画を投稿/編集する」= `placement=contractor_page`、ADM-004 の職場紹介動画ボタン = `placement=client_page`）。タブで掲載先（職人ページ / 会社ページ）を選び、「動画を追加する」→ MP4 アップロード（Cloudflare、200MB）または URL 追加（TikTok 等）。管理用ラベル・並び替え・削除・状態確認。監査ログあり
4. 会員通知: その掲載先で公開中が 0 → 1 本になったときだけ「動画を掲載しました」メール
5. 公式SNS動画は掲載先がアプリ外なので ADM-027 には登場しない（プロフィールにも載せる場合は同画面から追加しラベル「SNS用」）

**統合で直す名称は §4.2 で確定**。加えて `VIDEO_PLACEMENT_OPTION_TYPE`（掲載お知らせメール §6.6.C の【動画種別】が商品名前提）は「プロフィール動画」表記に揃えるか、掲載先名で出すかを実装時に決める（どちらも `video` / `video_workplace` を区別しない前提）。

## 6. 実装時に触る範囲（P7 の前例 = `p7-video-shooting-option-implementation-notes.md` と同じ手順）

新規 `video_sns` 追加:
- `src/lib/billing/options.ts`: `OptionType` / `OPTION_LABELS` / `OPTION_PRICES_TAX_INCLUDED`（120000）/ `VIDEO_OPTION_TYPES`
- `src/app/(authenticated)/billing/actions.ts`: Zod enum・`priceIdForOption`（`STRIPE_PRICE_VIDEO_SNS`）・success_url
- `src/app/(authenticated)/billing/bank-transfer-actions.ts`: enum
- `src/app/(authenticated)/billing/BillingClient.tsx`: 行追加（§4.1 の 3 番の文言）・`hasVideoOption`・`VIDEO_OPTION_UI_NAMES`・成功トースト
- migration: `bank_transfer_requests_target_consistency` CHECK の option_type 列挙に `video_sns` を追加（P7 の `20260902150000` が前例。忘れると銀行振込申込だけ失敗）+ pgTAP
- `.env.local.example`: `STRIPE_PRICE_VIDEO_SNS`
- Webhook / ADM-026 有効化 / 有効化メールは `isVideoOption()` 経由で自動対応
- テスト: `start-checkout-action` / `handle-checkout-completed` / `bank-transfer-actions` / `bank-transfer-admin-actions` / `bank-transfer.test` に `video_sns`、E2E `billing.spec` / `bank-transfer.spec`
- docs: product.md オプション表、database-schema.md、CLAUDE.md の動画ルール、`spec-changes-202608.md` §2.3 に追記（「呼び分けは商品名として維持」の記述を更新）

統合（`video_workplace` の新規販売停止 + 名称統一）:
- `BillingClient.tsx`: 職場紹介動画の行を削除、自己PR 行を「プロフィール動画制作プラン」に改名・説明文差し替え（§4.1 の 1 番。注意書き 2 つ含む）、`isClientPlanActive` 制限を外す。ユーザー撮影プランの説明文も §4.1 の 2 番へ差し替え
- `options.ts` `OPTION_LABELS`: `video` → 「プロフィール動画」、`video_workplace` → 「プロフィール動画（旧: 職場紹介）」（メール・管理画面の既存行向け。購入者はいないので実質は表示されない）
- `billing/actions.ts` / `bank-transfer-actions.ts`: `video_workplace` の新規申込を拒否（既存購入・Webhook・ADM-026 は維持）
- `src/lib/videos/constants.ts`（`VIDEO_PLACEMENT_LABELS`）+ ADM-009 / ADM-004 のボタン文言 + 6 か所の `<VideoList label>`（§4.2 参照）
- ADM-003 / ADM-008 の絞り込み（判断 4・6）: ラベル統合 + `video`/`video_workplace` 両方にヒットする集合取得 + ADM-008 に `video_shooting` / `video_sns` の選択肢追加（`VALID_OPTIONS` と `filters.tsx`）。`CLIENT_OPTION_BADGE_LABELS` も改名
- E2E / vitest の期待文言更新、docs（product.md・spec-changes §2.3 ・design 系）
- 工数目安: 新規追加 0.5 日 + 統合 0.5 日 + 絞り込み追加 0.25 日

## 7. 環境メモ

- E2E: `@playwright/test` 1.58.2 が要求する `chromium_headless_shell-1208` の DL が止まる環境。scratchpad の一時 config（`launchOptions.executablePath` → 既存 `chromium_headless_shell-1234`）で実行した。次回は対話ターミナルで `npx playwright install chromium` を完了させること
- **E2E 全件の前に必ず `supabase db reset`**（使い捨て seed が消費されるため）
- ブランチ運用: `feature/spec-changes-202608` から作業ブランチ（例 `p10-video-plans`）を切り、完了後 `--no-ff` で feature へ merge → `origin` へ push。`client/staging` は触らない

## 8. 後続タスク: プラン比較表の修正（動画プラン整理が終わってから・内容未確定）

ユーザーから「動画プランの整理が終わったら、プランと価格が一覧になっている表も直したい」（2026-09-10）。**何をどう直すかは未確認**。着手時に次の候補を見せて決めてもらう。

- 対象: 料金プラン画面（CLI-026）から開く **プラン比較表 `/billing/plans`**（`src/app/(authenticated)/billing/plans/page.tsx` の `PLAN_COLUMNS` / `FEATURES`）。同じ表が `.kiro/steering/product.md`「プラン一覧」と `.kiro/steering/roles-and-permissions.md` にもあるので揃える
- 現在の内容: 列 = 無料 / ライト / スタンダード / プレミアム / ハイエンド、行 = 月額（¥0 / ¥3,800 / ¥14,800 / ¥48,000 / ¥148,000）・職種・エリア・マイリスト登録・新しい人へのメッセージ・現場掲載・検索機能・上位表示・複数人利用・代理メッセージ
- 修正候補（提示済・未回答）:
  1. 年払いの行を足す（金額は `YEARLY_PRICE_MONTHS` = 月額 × 10 の暫定。正式金額は未確定）
  2. 動画の付属を行として足す（プロフィール動画制作 = プレミアム・ハイエンド ○ / ビジ友公式SNS動画制作 = 年払いのプレミアム・ハイエンド ○）
  3. 既存の行の項目名・数値の見直し
  4. オプション（急募・動画 3 プラン）の価格表を足す
- 注意: product.md のオプション表（動画掲載（受注者PR）/ 職場紹介動画掲載 / ユーザー撮影プラン）は動画プラン整理の側で §4.1 の 3 プランに書き換える（§6 の docs 項目）

## 9. 実装結果（2026-09-10、ブランチ `p10-video-plans`）

- §6 の範囲をすべて実装。migration `20260910120000_video_plans_consolidation.sql`（`bank_transfer_requests` の CHECK に `video_sns` 追加）+ pgTAP `bank_transfer_video_sns.test.sql`
- 実装時の判断:
  - 掲載お知らせメール（§6.6.C）の【動画種別】は【掲載先】（ユーザー詳細ページ / 発注者詳細ページ、`VIDEO_PLACEMENT_MEMBER_LABELS`）に変更。`VIDEO_PLACEMENT_OPTION_TYPE` は削除
  - 会員向け見出しは定数 `VIDEO_SECTION_LABEL`（`src/lib/videos/constants.ts`）に集約
  - 新規販売停止は `isDiscontinuedOption()` / `DISCONTINUED_OPTION_MESSAGE`（`src/lib/billing/options.ts`）で 3 入口共通。管理画面の絞り込みは `PROFILE_VIDEO_OPTION_TYPES`（`video` + `video_workplace`）
  - 料金画面の「購入済み」判定は `video` と旧 `video_workplace` のどちらかが active なら購入済み扱い（seed の client@test.local が該当）
- テスト: vitest 全件 PASS（video_sns の Checkout / Webhook / 銀行振込 / 代理登録 / 金額、video_workplace の 3 入口拒否を追加）、pgTAP 455 PASS、E2E は billing / video-display / bank-transfer / admin の 61 件 PASS + 全件実行
- 触っていないもの: seed（`video_workplace` の既存行はそのまま。統合後も「購入済み」として扱われる）、法務 4 ページ（動画商品名の記載なし）、`/billing/plans` 比較表（§8）
