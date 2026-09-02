# P7「ユーザー撮影プラン（購入導線）」実装メモ（ユーザー承認済み）

作成: 2026-09-02。承認: 同日（Q1 = 20,000 円、Q3 の説明文は下記で確定、Q2 / Q4 / Q5 は提案どおり）。親ドキュメント: `docs/requirements/spec-changes-202608.md` §2.3(4) / §5（P7 行）。
作業ブランチ: `p7-video-shooting-option`（`feature/spec-changes-202608` = P1〜P6 マージ済み `802ca0d` から分岐）。

## 0. 仕様の要点（§2.3(4)）

- ビジ友指定の構成に沿ってユーザーが撮影 → 素材をメールで運営へ送付 → ビジ友側で編集・掲載
- **アプリ側の実装は購入導線のみ**（素材の授受はアプリ外。成果物は P4 の動画基盤に運営が登録する）
- 決済: Stripe（買い切り、実装済みの仕組み）＋ 銀行振込（P2 のフロー）

## 1. 確認事項（承認済み）

| # | 項目 | 提案 |
|---|---|---|
| Q1 | **料金（税込）** | **20,000 円**（確定）。`OPTION_PRICES_TAX_INCLUDED` と `.env.local.example` のコメントに反映 |
| Q2 | **購入できる人** | 受注者・発注者を問わず全会員（担当者 staff と admin は不可）。既存の「自己PR動画掲載」と同じ扱い。職場紹介動画のような「発注者プラン加入者のみ」の制限は付けない |
| Q3 | **画面上の商品名と説明文** | 名前: **「ユーザー撮影プラン」**。説明文（確定）: 1 行目「ご自身で撮影した動画を、ビジ友が編集して掲載することができます。」2 行目「※ビジ友で決められた動画の構成に合わせて動画撮影をお願いします。」。掲載先の行は置かない（掲載先は運営が決める P4 の方針と整合させ、他オプションとの違い＝自分で撮ることを際立たせる） |
| Q4 | **再購入** | 動画系オプションと同じく再購入可（「既にご購入済みです。改めて購入しますか？」の確認ダイアログ） |
| Q5 | **管理画面の扱い** | 一覧（ADM-003）の絞り込み・バッジは追加しない（既存の「自己PR動画掲載」も同じ）。運営は申込通知メールと、銀行振込なら ADM-025/026 で把握する |

## 2. 受け入れ条件（案）

### A. 購入導線（Stripe）
1. 料金プラン画面（CLI-026 `/billing`）のオプションプランに「ユーザー撮影プラン」の行を追加。既存の動画オプション 2 行と同じレイアウト（名前・金額・説明・申込ボタン・銀行振込ボタン）
2. 「ユーザー撮影プランを申し込む」→ Stripe Checkout（買い切り）→ 決済完了で `option_subscriptions` に `option_type = 'video_shooting'`（`payment_type = 'one_time'`、期限なし）が作成され、ボタンが「購入済み」になる
3. 購入直後に申込者へ「動画オプションのお申し込みを承りました」メール（既存テンプレ流用、オプション名だけ差し替え）、運営へ申込通知メール（既存の運営向けテンプレ流用）が届く。法人プランなら組織メンバー全員に申込者控えを配信（既存と同じ）
4. 担当者（staff）は申し込めない（ボタン非活性 + Server Action で拒否、既存どおり）

### B. 購入導線（銀行振込）
5. 「銀行振込で申し込む」→ 申込レコード（`bank_transfer_requests`、`target_kind = 'option'`、`option_type = 'video_shooting'`、金額 = 料金）が作られ、申込者控え・運営宛の 2 通が届く。受付中はボタンが非活性になる（既存と同じ）
6. 運営が ADM-026 で「入金を確認して有効化」すると `option_subscriptions` が作成され、有効化メール（Stripe 購入時と同じテンプレ）が届く。ADM-025/026 の対象表示に「ユーザー撮影プラン」と出る

### C. 表示・その他
7. 購入の有無で動画の表示は変わらない（P4 の方針どおり。成果物は運営が ADM-027 で登録する）
8. `expire-options` の自動失効・Stripe のサブスク処理には流入しない（買い切り・期限なし）
9. 料金表・特定商取引法ページ・規約の文言変更は不要（特商法の「動画制作サービスについて」の記載で既にカバー。必要なら P8 で調整）

### D. 品質
10. vitest（Checkout 作成 / Webhook / 銀行振込申込 / ADM-026 有効化）に `video_shooting` のケースを追加。E2E: 料金プラン画面の表示・ボタン活性、銀行振込の申込 → ADM-026 有効化 → 「購入済み」表示の通し
11. steering（product / database-schema）・`.env.local.example`・CLAUDE.md の更新

### 意図的な除外
- 素材送付フォーム・進捗管理など「購入後」の機能（仕様どおりアプリ外）
- 管理画面の絞り込み・バッジ（Q5）
- 新しい掲載場所（`video_placement`）の追加（成果物は既存の職人ページ / 会社ページに載せる）

## 3. 設計方針

### 3.1 DB
- `option_subscriptions.option_type` は CHECK 制約のない text で、既存の `video` / `video_workplace` と同じ買い切り行（`payment_type = 'one_time'`、`end_date = NULL`）を使う（変更なし）
- **migration 1 本**（`20260902150000_bank_transfer_video_shooting.sql`）: `bank_transfer_requests` の `target_consistency` CHECK がオプション種別を列挙しているため、許可リストに `'video_shooting'` を追加する。実装時の E2E（銀行振込申込）で CHECK 違反として発覚（当初「migration なし」と見込んでいたが誤り）。新オプションを足すときはこの列挙も更新すること

### 3.2 コード（既存の「職場紹介動画掲載」追加時と同じ触り方）
| 箇所 | 変更 |
|---|---|
| `src/lib/billing/options.ts` | `OptionType` に `"video_shooting"`、`OPTION_LABELS`（ユーザー撮影プラン）、`OPTION_PRICES_TAX_INCLUDED`（Q1）。買い切り動画系 3 種をまとめる `VIDEO_OPTION_TYPES` を追加 |
| `src/app/(authenticated)/billing/actions.ts` | Zod スキーマの動画系 enum に追加、`priceIdForOption` に `STRIPE_PRICE_VIDEO_SHOOTING`、success_url の `option_success=video_shooting` |
| `src/lib/billing/webhook/handle-checkout-completed.ts` | `handleVideoOption` / `handleVideoWorkplaceOption` を 1 つの「買い切り動画オプション」ハンドラに統合し、`video_shooting` を分岐に追加 |
| `src/lib/billing/activation-emails.ts` | `sendVideoActivatedEmails` の型を動画系 3 種に広げる（本文は既存テンプレのまま、オプション名だけ差し替え） |
| `src/app/(authenticated)/billing/bank-transfer-actions.ts` | 動画系 enum に追加（金額は `OPTION_PRICES_TAX_INCLUDED` から自動） |
| `src/app/admin/(protected)/bank-transfers/actions.ts` | 有効化の動画系分岐（買い切り・期限なし）が `video_shooting` も通るよう型を広げる。表示名は `OPTION_LABELS` 経由で自動 |
| `src/app/(authenticated)/billing/BillingClient.tsx` | 「ユーザー撮影プラン」の行を追加（職場紹介動画掲載の下）。購入済み判定・再購入ダイアログ・成功トーストを 3 種対応に一般化 |
| `supabase/migrations/20260902150000_bank_transfer_video_shooting.sql` | `bank_transfer_requests_target_consistency` CHECK の option_type 列挙に `video_shooting` を追加 |
| `.env.local.example` | `STRIPE_PRICE_VIDEO_SHOOTING`（Stripe ダッシュボードで Product / Price を作成して設定。他のオプションと同じ運用） |
| docs | `product.md` のオプション表に行追加、`database-schema.md` の `option_type` 一覧に追記、CLAUDE.md の動画基盤ルールに「オプション種別を足すときの触り方」を 1 行追記 |

### 3.3 触らないもの
- `src/lib/videos/constants.ts`（掲載場所と対応オプションの対応表）: 新しい掲載場所は作らないため変更なし。成果物は運営が既存の職人ページ / 会社ページに登録する
- ADM-003 の絞り込み・バッジ（Q5）、料金表ページ（`/billing/plans` にオプションの記載なし）、法務 4 ページ

### 3.4 テスト
- vitest: `start-checkout-action.test.ts` / `handle-checkout-completed.test.ts` / `bank-transfer-actions.test.ts` / `bank-transfer-admin-actions.test.ts` に `video_shooting` のケース（happy path + 失敗系）
- E2E: `billing.spec.ts` に表示・活性（無料受注者でも申込可）、`bank-transfer.spec.ts` に「オプションを銀行振込で申込 → ADM-026 有効化 → 購入済み」の通し。Stripe 決済本体は既存どおり手動確認（Stripe CLI）
- pgTAP: `supabase/tests/bank_transfer_video_shooting.test.sql`（CHECK が `video_shooting` を受け付ける / 未知の種別は拒否 / option_subscriptions の買い切り行）

## 4. 進め方
- 承認後: 実装 → `npx tsc --noEmit` → `npx vitest run` → `supabase db reset` + `supabase test db` → E2E（一時 config でブラウザ指定、コミットしない）→ 承認 → ③にコミット → ②へ `--no-ff` マージ → push
- クライアント側の宿題（P0）: Stripe ダッシュボードで「ユーザー撮影プラン」の Product / Price を作成し、staging / 本番の `STRIPE_PRICE_VIDEO_SHOOTING` に設定する（金額確定後）
