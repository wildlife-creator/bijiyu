# 課金機能（billing）— 調査ログ・設計判断

## Summary
- **Feature**: billing
- **Discovery Scope**: Complex Integration（外部決済 Stripe + Webhook + 定期実行 + ロール変更）
- **Key Findings**:
  - Stripe Webhook の冪等性は `stripe_webhook_events` テーブル（既にマイグレーション済み）で担保する
  - Webhook イベント順序の保証はないため、`subscription` レコードが見つからない場合は 200 を返してスキップする防御パターンを採用
  - 補償オプションは `subscriptions` テーブルの UNIQUE 制約と衝突するため `option_subscriptions` テーブルに分離する
  - past_due の自動解約はメール送信を伴うため pg_cron + Edge Function、その他のオプション期限切れは pg_cron 直接 SQL で実装する
  - fee=free（初回事務手数料免除）は iron-session の暗号化 Cookie をミドルウェアでセットして判定する
  - 法人プラン購入後は CLI-021 にリダイレクトし企業名入力を強制（`organizations.name` がメッセージ画面の表示名に直結するため）

## Research Log

### Stripe Webhook の冪等性とリトライ
- **Context**: Stripe は同じイベントを複数回送信する可能性があり、リトライ戦略を設計する必要がある
- **Sources Consulted**:
  - Stripe Docs: Receive Stripe events in your webhook endpoint（公式）
  - 既存マイグレーション `supabase/migrations/20260324160600_002_core_tables.sql:428-436`（`stripe_webhook_events` テーブル定義）
- **Findings**:
  - Stripe の本番リトライは最大16回・約3日間。テストモードは3回・数時間
  - Stripe は 2xx を期待し、3 秒以内のレスポンスを推奨。20 秒を超えるとタイムアウト扱いとなりリトライされる
  - 冪等性を確保するには `event.id` を一意キーで記録し、INSERT 時の UNIQUE 制約違反で重複検知する方法が標準
  - 同時並行処理時は 409 を返すと Stripe がリトライを繰り返すため、200 を返してスキップするのが推奨
- **Implications**:
  - `stripe_webhook_events` の `stripe_event_id` UNIQUE 制約を冪等性ガードとして使用する
  - Webhook ハンドラ内でアプリ独自リトライは実装せず、Stripe の自動リトライに委任する
  - 失敗時は status='failed' を記録し、Stripe Dashboard から手動 Resend で再処理可能とする

### Webhook 署名検証と Next.js Route Handler の制約
- **Context**: Next.js App Router の Route Handler で Stripe 署名検証を成功させるには raw body が必要
- **Sources Consulted**:
  - Stripe Docs: `constructEvent` メソッド
  - Next.js App Router Route Handlers ドキュメント
- **Findings**:
  - `request.json()` は body を消費するため署名検証用の raw body が取れない
  - `request.text()` で raw body を取得し、`stripe.webhooks.constructEvent(rawBody, signature, secret)` に渡す必要がある
  - Stripe SDK は Node.js 環境前提なので Edge Runtime ではエラーになる。`export const runtime = 'nodejs'` を明示する必要がある
- **Implications**:
  - `/api/webhooks/stripe/route.ts` は `runtime = 'nodejs'`、`request.text()` を使う
  - 署名検証は handler の最初に実行し、失敗時は 400 を返す

### Stripe Checkout と Subscription/Payment モードの使い分け
- **Context**: 月額課金（プラン・補償）と単発課金（急募・動画掲載）が混在する
- **Sources Consulted**: Stripe Docs（Checkout Sessions API、line_items、metadata）
- **Findings**:
  - `mode: 'subscription'`: recurring price のみ受理。one-time price と組み合わせると初期費用として課金できる
  - `mode: 'payment'`: one-time のみ
  - metadata は最大50個までキー保存可能。Webhook 受信時に同じ metadata がそのまま参照できる
- **Implications**:
  - 基本プランの初回事務手数料（¥20,000 one-time）は `mode='subscription'` の line_items に追加可能
  - オプション種別（plan / option）と詳細種別（plan_type / option_type）を metadata に格納し、Webhook ハンドラでルーティング判定する
  - 急募オプションは metadata に `job_id` も含め、Webhook で対象案件を更新できるようにする

### Subscription Schedule によるダウングレード予約
- **Context**: 「次回請求日からダウングレードを反映する」を Stripe で実現する方法を検討
- **Sources Consulted**: Stripe Docs（Subscription Schedules、`from_subscription`）
- **Findings**:
  - `subscription.update()` で price を変更すると即時反映が原則
  - 「次回請求日から」を実現するには Subscription Schedule に変換し、`phases` で次回開始の price 変更を予約する
  - `from_subscription` で既存サブスクから Schedule を生成可能
  - 解約予約は `subscription.update({ cancel_at_period_end: true })` で十分（Schedule 不要）
- **Implications**:
  - ダウングレード予約: Subscription Schedule を使用
  - 解約予約: `cancel_at_period_end: true`
  - 予約状態の取得: subscription オブジェクトの `schedule` 属性 / `cancel_at_period_end` フラグ

### Stripe Customer Portal の許可操作の限定
- **Context**: 解約・プラン変更はアプリ内 UI で完結させる方針のため、Customer Portal の機能を絞る
- **Sources Consulted**: Stripe Docs（Customer Portal Configuration）
- **Findings**:
  - Customer Portal の機能（payment_method_update / invoice_history / subscription_cancel など）は Configuration で個別に on/off 可能
  - 設定は Stripe Dashboard から作成し、`billingPortal.sessions.create({ configuration })` で指定できる
- **Implications**:
  - Phase 1 の Portal 機能は「カード情報の更新」「請求履歴の閲覧・ダウンロード」のみ許可
  - 解約・プラン変更はアプリ側 UI のみで実行し、Portal からの操作を禁止することで UX とビジネスロジックの一貫性を保つ
  - Portal 設定 ID を環境変数で管理し、本番/テストで切り替え可能にする

### iron-session による fee=free Cookie の暗号化
- **Context**: `/billing?fee=free` でアクセスしたユーザーに 24 時間有効な暗号化セッションを発行する
- **Sources Consulted**: iron-session npm パッケージドキュメント
- **Findings**:
  - iron-session は AEAD 暗号化（@hapi/iron）で Cookie を保護する。改ざん不可
  - Next.js Middleware から Cookie を直接書き込めるため、未認証 → ログイン → /billing への遷移中も Cookie が維持される
  - SESSION_SECRET は 32 文字以上のランダム文字列が必要
- **Implications**:
  - ミドルウェアで `/billing?fee=free` へのアクセス時に Cookie をセット（認証チェックの前段で実行）
  - Cookie 形式: `{ feeExempt: boolean, expiresAt: number }`、有効期限 24 時間
  - 環境変数 `SESSION_SECRET` を `.env.local.example` に追加

### pg_cron + Edge Function のハイブリッド構成
- **Context**: 定期実行ジョブが3つ（auto-cancel-past-due / expire-options / close-expired-jobs）あり、SQL 完結型と外部 API 呼び出し型が混在する
- **Sources Consulted**: Supabase Docs（pg_cron 拡張、`net.http_post`、Edge Functions）
- **Findings**:
  - pg_cron は cron 構文で SQL を直接実行できる。シンプルな UPDATE は完結する
  - メール送信が必要な場合は SQL だけでは不可能。Edge Function を `net.http_post` でキックする方式が標準
  - cron ジョブは `cron.schedule()` で登録、実行結果は `cron.job_run_details` で確認可能
- **Implications**:
  - `expire-options` / `close-expired-jobs` は pg_cron SQL 直接実行（マイグレーションで定義）
  - `auto-cancel-past-due` のみ Edge Function を経由（`SUPABASE_SERVICE_ROLE_KEY` を Authorization に設定）
  - 実行時刻を5分ずつずらして競合回避（03:00 / 03:05 / 03:10 JST）
  - エラー時の個別ハンドリング（1件のエラーで全体ブロックしない設計）

### 既存コードベースとの統合
- **Context**: 既存の認証・組織・マッチング機能と整合する必要がある
- **Sources Consulted**:
  - `src/middleware.ts`（既に `BILLING_PATH_PREFIX` と contractor の例外処理が実装済み）
  - `src/lib/supabase/admin.ts`（service_role キーで admin client を作成済み）
  - `supabase/migrations/20260324160600_002_core_tables.sql`（subscriptions / option_subscriptions / stripe_webhook_events / users.stripe_customer_id がマイグレーション済み）
  - `src/lib/email/send-email.ts` + `templates/`（既存テンプレートと同じ HTML パターン）
- **Findings**:
  - 既存の `subscriptions` テーブル定義は本機能の要件と一致する。追加マイグレーションは不要
  - `client_profiles` テーブルに `language` カラムが既に追加済み（`20260404110000_add_language_to_client_profiles.sql`）
  - middleware には billing 例外処理が既に実装されているため、追加するのは fee=free Cookie のセット処理
  - admin client は `createAdminClient()` 関数で既に提供されているため、Webhook ハンドラから利用可能
- **Implications**:
  - DB マイグレーション追加は最小限（新規バケット不要、既存テーブル流用）
  - Webhook ハンドラと Server Action は既存の admin/server client を使い分ける
  - メールテンプレートは既存パターン（`{ subject, html }` を返す関数）を踏襲する

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Webhook 主導 + Server Action 補助 | 状態遷移は Webhook で確定し、UI 操作（Checkout 開始・解約予約）は Server Action が担う | Stripe をシステムオブレコードとして扱える。データ整合性が高い | Webhook 遅延時の表示が一時的にずれる | **採用**。要件で「Webhook 未着の遅延は許容」とされているため整合する |
| Server Action 主導 + Webhook 補助 | Server Action 内で DB 更新を先に行い、Webhook は通知用途のみ | UI の即時反映が容易 | Stripe API 呼び出し失敗時にロールバックが難しい。データ不整合のリスク | 不採用 |
| Polling + Webhook | Webhook 未着時にクライアントが Stripe API をポーリング | 遅延を補えるが複雑 | 実装コスト・API rate limit のリスク | Phase 2 検討 |

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Customer Portal 全機能委任 | 解約・プラン変更も Portal で実施 | 実装コスト最小 | 前提条件チェック（掲載中案件・担当者数）を組み込めない | 不採用 |
| アプリ内 UI で完結 + Portal はカード/履歴のみ | 解約・プラン変更は CLI-026 から、Portal はカード更新と請求履歴のみ | 前提条件チェックを Server Action で組み込める。UX 一貫性 | 実装範囲が広い | **採用**。前提条件チェックが必須要件 |

## Design Decisions

### Decision: Webhook 主導の状態遷移モデル
- **Context**: Stripe イベントとアプリ DB の同期、二重課金防止、ロール変更タイミングを設計する必要がある
- **Alternatives Considered**:
  1. Server Action で先に DB 更新 → 後から Webhook で確認
  2. Webhook で唯一の正規ルートとして DB 更新 → Server Action は Checkout Session 作成のみ
- **Selected Approach**: Webhook を唯一の正規ルートとして DB を更新する。Server Action は Checkout Session 作成・解約予約・前提条件チェックを担い、`subscriptions` テーブルへの直接書き込みは行わない（Stripe Customer ID 保存のみ例外）
- **Rationale**: Stripe をシステムオブレコードとして扱うことで、決済成否とアプリ状態の不整合を回避できる。要件で「Webhook 未着による一時的な role 不整合は許容」と明記されており、整合する
- **Trade-offs**:
  - メリット: データ整合性が高い、ロジックの集約点が明確
  - デメリット: Checkout 完了から CON-001 表示までの数秒間、role が古い可能性がある
- **Follow-up**: success_url のトースト表示で「数秒後にメニューが更新されます」のような UX フォロー（Phase 2）

### Decision: 補償オプションは option_subscriptions に分離
- **Context**: 補償（¥5,000 / ¥9,800）は月額課金だが、`subscriptions` テーブルには `UNIQUE (user_id) WHERE status IN ('active', 'past_due')` 制約があり、基本プランと併存できない
- **Alternatives Considered**:
  1. `subscriptions` の UNIQUE 制約を緩和して全プラン同一テーブル
  2. `option_subscriptions` に `payment_type='subscription'` で格納
- **Selected Approach**: option_subscriptions に payment_type='subscription' で格納。Webhook では metadata.type で `subscriptions` / `option_subscriptions` を振り分ける
- **Rationale**: 既存の UNIQUE 制約は基本プランの二重課金防止に必須で、緩和すべきではない。option_subscriptions は単発・月額の両方を扱える設計のため、補償はここに自然に収まる
- **Trade-offs**: Webhook の `subscription.updated/deleted` ハンドラで2テーブル検索が必要になる（実装はシンプル）
- **Follow-up**: Webhook ハンドラの統合テストで、補償サブスクの状態同期を検証する

### Decision: 定期実行の pg_cron / Edge Function 使い分け
- **Context**: 3つの定期ジョブ（auto-cancel-past-due / expire-options / close-expired-jobs）の実装方式を選定
- **Alternatives Considered**:
  1. すべて Edge Function（Vercel Cron や Supabase Edge Function）
  2. すべて pg_cron（SQL 完結）
  3. ハイブリッド: メール送信を伴うものは Edge Function、SQL 完結なものは pg_cron 直接実行
- **Selected Approach**: ハイブリッド。`auto-cancel-past-due` のみ Edge Function、`expire-options` / `close-expired-jobs` は pg_cron 直接 SQL
- **Rationale**: Edge Function は障害点が増える（HTTP 呼び出し、デプロイ、認証）。SQL で完結するジョブは pg_cron 直接実行のほうがシンプル。メール送信は Resend API 呼び出しが必要なため Edge Function を選択
- **Trade-offs**: 実装方式が混在するため、運用時に「どのジョブがどこで動いているか」を `auto-cancel-past-due/index.ts` のヘッダーコメントとマイグレーションファイルで明示する
- **Follow-up**: Phase 2 で Slack 通知を追加する際、Edge Function 側で対応

### Decision: fee=free を iron-session で実装
- **Context**: 初回事務手数料を免除する URL パラメータの状態をログイン前後で維持する必要がある
- **Alternatives Considered**:
  1. URL パラメータを毎回引き回す（`?fee=free` を redirect URL に追加）
  2. 平文 Cookie で保存
  3. iron-session（暗号化 Cookie）
  4. DB に一時テーブルを用意
- **Selected Approach**: iron-session（暗号化 Cookie、24時間有効）
- **Rationale**: URL 引き回しは未ログイン → 登録 → ログイン → /billing の長い導線で漏れやすい。平文 Cookie は改ざん可能。iron-session は暗号化されており改ざん不可、Server Component / Server Action から検証可能
- **Trade-offs**: iron-session という追加依存が必要。SESSION_SECRET の管理が必要
- **Follow-up**: 24時間以上経った場合の期限切れ表示は実装不要（自動的に Cookie が無効化される）

### Decision: 担当者制限の三重防御
- **Context**: 担当者（staff）が CLI-026 で課金・プラン変更を行うことを完全に防ぐ必要がある
- **Alternatives Considered**:
  1. UI の disable のみ
  2. Middleware ブロック
  3. Server Action でロールチェック
  4. 上記すべて（三重防御）
- **Selected Approach**: 三重防御。CLI-026 は閲覧可能のままにし、UI で全操作ボタンを非活性化、Server Action 側でも `role === 'staff'` をエラー扱いとする
- **Rationale**: CLI-026 の閲覧自体は許可（運用上の参考情報として）するが、書き込み操作はバイパス対策で Server Action 側でも検証する。CLAUDE.md の「禁止パターン」セクションに準拠
- **Trade-offs**: Middleware では CLI-026 をブロックできない（閲覧許可のため）が、Server Action のチェックで補完する
- **Follow-up**: Vitest で `role='staff'` 時に Server Action がエラーを返すことを必須テスト

### Decision: ダウングレード前提条件は単一定数 PLAN_LIMITS で集約
- **Context**: ダウングレード/解約の前提条件チェック（10 パターン）を統一ロジックで処理したい
- **Alternatives Considered**:
  1. プランごとに個別チェック関数を実装
  2. PLAN_LIMITS 定数 + 共通バリデーション関数
- **Selected Approach**: `src/lib/constants/plans.ts` に `PLAN_LIMITS` 定数を定義し、共通の `validateDowngradePrerequisites(currentPlan, targetPlan)` 関数で全パターンを処理
- **Rationale**: 10 パターンが同一ロジック（掲載中案件数 / 未返信応募 / 担当者数の比較）で処理可能。プランごとの個別関数は重複が多く保守性が低い
- **Trade-offs**: PLAN_LIMITS は DB ではなくコード内定数。プラン上限の変更には PR が必要だが、変更頻度は低いため許容
- **Follow-up**: Vitest で `validateDowngradePrerequisites` を全パターンテスト

## Risks & Mitigations
- **Webhook イベント順序の逆転**（`subscription.updated` が `checkout.session.completed` より先に届く）→ subscription レコードが見つからない場合は 200 を返してスキップ。後続イベントで正規化される
- **Webhook 重複処理**（Stripe のリトライ、同時並行）→ `stripe_webhook_events` の UNIQUE 制約 + 同時並行時は 200 スキップ
- **Stripe API 障害時の Checkout Session 作成失敗** → Server Action がエラーを返し、ユーザーにトースト表示。リトライはユーザー側操作に委任
- **法人プラン購入後に企業名未入力で離脱** → success_url を CLI-021（`?setup=true`）に直接リダイレクトし、CLI-021 で必須バリデーション
- **pg_cron ジョブの実行失敗** → `cron.job_run_details` で失敗ログ確認可能。Phase 2 で Slack 通知を追加
- **iron-session の SESSION_SECRET 漏洩** → 環境変数管理。コードへのハードコード禁止。漏洩時はキー再生成 + 全 Cookie 無効化
- **二重課金**（Server Action と Webhook の競合）→ Server Action 側でアクティブサブスク存在チェック + Webhook 側でも UPSERT 防御の二重チェック
- **担当者制限のバイパス** → Middleware（CON-004 等）+ UI 非活性化 + Server Action ロールチェックの三重防御
- **past_due 中の解約による案件強制クローズで業務支障** → 確認ダイアログで影響範囲を明示、ユーザーの意思を尊重
- **Customer Portal で意図しない操作（解約等）が可能になる** → Portal Configuration で機能を限定、許可操作はカード更新と請求履歴のみ

## References
- [Stripe Webhooks](https://stripe.com/docs/webhooks) — 署名検証、リトライ、冪等性のベストプラクティス
- [Stripe Checkout Sessions](https://stripe.com/docs/api/checkout/sessions) — mode='subscription' / 'payment' の使い分け、line_items、metadata
- [Stripe Subscription Schedules](https://stripe.com/docs/billing/subscriptions/subscription-schedules) — ダウングレード予約のための phases 構成
- [Stripe Customer Portal](https://stripe.com/docs/customer-management) — 機能限定 Configuration の作成
- [Supabase pg_cron](https://supabase.com/docs/guides/database/extensions/pg_cron) — `cron.schedule()` と `net.http_post()` のハイブリッド構成
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions) — TypeScript Function のデプロイと認証
- [iron-session](https://github.com/vvo/iron-session) — Next.js 用の暗号化 Cookie セッションライブラリ
- [.kiro/steering/authentication.md](../../steering/authentication.md) — ロールエスカレーション防止、Stripe 連携セキュリティ
- [.kiro/steering/database-schema.md](../../steering/database-schema.md) — subscriptions / option_subscriptions / stripe_webhook_events テーブル定義
- [.kiro/steering/roles-and-permissions.md](../../steering/roles-and-permissions.md) — past_due 時の動作、担当者制限
