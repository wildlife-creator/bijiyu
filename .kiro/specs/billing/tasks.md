
# Implementation Plan

- [x] 0. 既存テストの全実行とデグレ確認
  - `npm run test`（Vitest）を実行し、既存ユニット・統合テストがすべてパスすることを確認する
  - `supabase test db`（pgTAP）を実行し、既存 RLS テストがすべてパスすることを確認する
  - `supabase db reset` で DB をリセットしたのち、`supabase start` + `npm run dev` を起動して `npm run test:e2e`（Playwright）を実行し、既存 E2E テストがすべてパスすることを確認する
  - 失敗があれば billing 機能の実装に着手せず、まず原因を調査して既存機能を修正する
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 3.3, 4.1, 5.1, 5.2, 5.3, 6.1, 7.1, 8.1, 8.2, 9.1_

- [x] 0.5 Requirements Traceability Matrix の確認
  - `.kiro/specs/billing/requirements.md` の全 REQ-BL-XXX（および該当する画面要件）をリストアップする
  - tasks.md 内の `_Requirements: X.Y_` と突き合わせ、すべての要件が少なくとも 1 つのタスクでカバーされていることを表形式で確認する
  - カバーされていない要件があれば tasks.md に新規タスクを追加するか、既存タスクの `_Requirements:` を補強する
  - 確認結果を実装メモに残し、spec-impl フェーズ中に追加された要件との差分も継続的に確認する
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 3.3, 4.1, 5.1, 5.2, 5.3, 6.1, 7.1, 8.1, 8.2, 9.1_

- [x] 1. 基盤マイグレーションと型・定数のセットアップ
- [x] 1.1 subscriptions 予約情報カラム追加 + client_profiles UNIQUE 制約追加マイグレーション
  - 新規マイグレーションファイル 1 本で以下の 2 つの変更を同時に行う:
    - **subscriptions テーブルへのカラム追加**: `schedule_id TEXT` / `scheduled_plan_type TEXT` / `scheduled_at TIMESTAMPTZ` / `cancel_at_period_end BOOLEAN NOT NULL DEFAULT false` の 4 カラム
    - **client_profiles テーブルへの UNIQUE 制約追加**: `ALTER TABLE client_profiles ADD CONSTRAINT client_profiles_user_id_unique UNIQUE (user_id)` を発行する
  - **UNIQUE 制約が必要な理由**: Task 1.2 で定義する `handle_checkout_completed_plan` RPC 関数内で `INSERT INTO client_profiles ... ON CONFLICT (user_id) DO UPDATE` を使うため、user_id に UNIQUE 制約または unique index が必須となる
  - subscriptions の新規カラムは CLI-026 がダウングレード予約・解約予約状態を Stripe API に依存せず DB だけで再現できるようにするためのキャッシュとして使用する
  - `supabase db reset` でマイグレーションが適用されることを確認し、Supabase 型生成（`supabase gen types`）も再実行する
  - 既存の `client_profiles` レコード（seed や過去データ）に user_id の重複がないことを事前に確認する（重複があると UNIQUE 追加時にエラーになるため、マイグレーション前にクリーンアップが必要）
  - _Requirements: 3.2, 5.2, 5.3, 6.1_

- [x] 1.2 Webhook 処理用 PL/pgSQL RPC 関数のマイグレーション作成
  - 新規マイグレーションファイルを追加し、以下 6 本の SECURITY DEFINER 関数を作成する
    - `handle_checkout_completed_plan(event_data jsonb)` — subscriptions UPSERT（SELECT → 分岐 → INSERT/UPDATE の二重防御）+ users.role 更新（contractor のみ）+ client_profiles UPSERT + 法人プラン時の `ensure_organization_exists` 呼び出し + audit_logs INSERT を 1 トランザクションで実行
    - `handle_subscription_lifecycle_updated(event_data jsonb)` — subscriptions の plan_type / status / current_period / 予約情報カラム（schedule_id, scheduled_plan_type, scheduled_at, cancel_at_period_end）の更新 + 法人プラン時の `ensure_organization_exists` 呼び出し
    - `handle_subscription_lifecycle_deleted(event_data jsonb)` — subscriptions.status='cancelled' + users.role ダウングレード（client → contractor）+ 配下 staff の is_active=false + 掲載中案件の closed 化を 1 トランザクションで実行
    - `get_or_lock_stripe_customer(uid uuid)` — `SELECT stripe_customer_id, email FROM users WHERE id = uid FOR UPDATE` で行ロック取得、既存値があれば返し、null なら呼び出し元に制御を戻す
    - `set_stripe_customer_id(uid uuid, customer_id text)` — `WHERE stripe_customer_id IS NULL` 付き UPDATE による先勝ち制御
    - `ensure_organization_exists(uid uuid)` — `organizations` を `owner_id = uid AND deleted_at IS NULL` で SELECT、既存があれば再利用（organization_members に owner なければ追加）、なければ新規作成（name='', owner で organization_members 追加）
  - 全関数で `REVOKE EXECUTE ... FROM PUBLIC` + `GRANT EXECUTE ... TO service_role` を明示し、一般ユーザーから呼び出せないようにする
  - 関数定義は `CREATE OR REPLACE FUNCTION` で冪等にする
  - _Requirements: 2.1, 3.2, 3.3, 5.1_

- [x] 1.3 (P) pg_cron ジョブ登録マイグレーション
  - 新規マイグレーションファイルを追加し、`pg_cron` 拡張を有効化する
  - `expire-options` を `cron.schedule()` で SQL 直接実行で登録する（毎日 18:05 UTC = JST 03:05）。処理: `option_subscriptions SET status='expired' WHERE status='active' AND end_date IS NOT NULL AND end_date < NOW()`、続けて該当 urgent オプションの client_profiles.is_urgent_option を false に更新（同ユーザーに他の active urgent がない場合のみ）、対象 jobs.is_urgent を false に更新
  - `close-expired-jobs` を `cron.schedule()` で SQL 直接実行で登録する（毎日 18:10 UTC = JST 03:10）。処理: `UPDATE jobs SET status='closed' WHERE status='open' AND recruit_end_date < CURRENT_DATE`
  - `auto-cancel-past-due` 用に `pg_net` 拡張を有効化し、`cron.schedule()` で `net.http_post()` を介して Edge Function URL を呼び出すジョブを登録する（毎日 18:00 UTC = JST 03:00、Authorization ヘッダーに service_role キーを設定）
  - 実行時刻は5分ずつずらして競合を回避する
  - **セキュリティ注記**: `net.http_post()` の Authorization ヘッダーに service_role キーを直書きすると、キーが `cron.job` テーブルに平文で保存される。`cron.job` へのアクセスは postgres ロールに限定されているため Phase 1 ではこの方式を採用するが、将来（Phase 2）は Supabase Vault（`vault.create_secret` + `vault.decrypted_secrets`）経由でキーを参照する方式に移行することを推奨
  - _Requirements: 4.1, 8.1, 8.2_

- [x] 1.4 (P) is_paid_user の past_due 包含を pgTAP で検証
  - 新規 pgTAP テストを追加し、`is_paid_user(user_id)` が `subscriptions.status IN ('active', 'past_due')` のユーザーで true を返すことを確認する
  - cancelled / なし / past_due 超過後の cancelled の各ケースで false を返すことも確認する
  - 退会済みユーザー（users.deleted_at IS NOT NULL）で false を返すことも確認する
  - _Requirements: 1.1, 7.1_

- [x] 1.5 (P) PLAN_LIMITS 定数 + PLAN_RANK + comparePlans ヘルパーの作成
  - プランごとの上限値定数（free / individual / small / corporate / corporate_premium）を作成し、各プランに `maxOpenJobs` / `maxStaff` / `hasProxy` を定義する
  - **各プランに `rank: number` を追加**する（free=0, individual=1, small=2, corporate=3, corporate_premium=4）。プラン序列の比較に使用
  - プラン名・月額料金・機能比較表のラベルを定数化し、CLI-026 とメールテンプレートで共用できるようにする
  - プラン種別の TypeScript 型を export し、Server Action と RPC 呼び出しで型安全に扱えるようにする
  - 各プランに **`monthlyPriceTaxIncluded`**（税込月額、円単位の数値）を追加する。CLI-026 の確認ダイアログで「次回課金日と金額」を表示する際、Stripe API を呼ばずに DB の plan_type からこの定数を引いて表示する
  - 同じファイルに **`ACTION_TYPES` 定数**（audit_logs の `action` 列に入れる値の集合）を定義する。含まれる値: `subscription_created` / `subscription_updated` / `subscription_cancelled` / `subscription_reservation_cancelled` / `role_changed` / `auto_cancelled_past_due`
  - **DB 列名は `action`**（`action_type` ではない）。TypeScript 定数名 `ACTION_TYPES` は可読性のために維持するが、INSERT 時は `INSERT INTO audit_logs (action, ...) VALUES (ACTION_TYPES.subscription_created, ...)` のように列名 `action` にマッピングする
  - PLAN_LIMITS と ACTION_TYPES の両方を `as const` で型安全に export し、Server Action / RPC 呼び出し / メールテンプレートから型安全に参照できるようにする
  - **新規ヘルパー `comparePlans(currentPlan, targetPlan): 'upgrade' | 'downgrade' | 'same'`** を `src/lib/billing/compare-plans.ts` に作成する。`PLAN_LIMITS[plan].rank` を比較するのみのシンプルな関数。BillingPage の表示判定と changePlanAction の routing 両方で利用される
  - **`PRICE_ID_TO_PLAN_TYPE` 逆引きマップと `resolvePlanTypeFromPriceId(priceId): PlanType | null` ヘルパー**を同じファイル（`src/lib/constants/plans.ts`）に定義する。マップは既存の環境変数 `STRIPE_PRICE_INDIVIDUAL` / `STRIPE_PRICE_SMALL` / `STRIPE_PRICE_CORPORATE` / `STRIPE_PRICE_CORPORATE_PREMIUM` から起動時に構築する
  - 用途: `handleSubscriptionLifecycle` の updated 分岐で、Subscription Schedule の next phase から取得した price ID を plan_type に変換し `scheduled_plan_type` にセットするために使用する
  - 未知の price ID が返された場合は `null` を返し、Webhook 側で `stripe_webhook_events.status='failed'` に記録するエラーパスを通る
  - 環境変数の新規追加は不要（既存の `STRIPE_PRICE_*` を流用）
  - _Requirements: 1.1, 3.3, 5.1, 5.2, 5.3_

- [x] 1.6 (P) Stripe SDK ラッパーと環境変数のセットアップ
  - Stripe SDK を npm install し、`STRIPE_SECRET_KEY` で初期化する共通モジュールを作成する
  - `.env.local.example` に必要な環境変数（`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_PORTAL_CONFIGURATION_ID` / `SESSION_SECRET` / `STRIPE_PRICE_*`（プラン4種 + 初期費用 + オプション4種）/ `RESEND_API_KEY`）を追記する
  - `SUPABASE_SERVICE_ROLE_KEY` の取り扱いを README または CLAUDE.md の実装メモに記載する
  - _Requirements: 2.1, 3.1, 7.1_

- [x] 1.7 (P) iron-session セットアップと fee=free Cookie ヘルパー
  - iron-session を npm install し、`SESSION_SECRET` を読み込む sealData / unsealData の薄いラッパーを作成する
  - Cookie 名を `bijiyu_fee` とし、`{ feeExempt: boolean, expiresAt: number }` のペイロード形式で読み書きできる関数を提供する
  - Cookie オプション: `httpOnly: true`, `secure: NODE_ENV === 'production'`, `sameSite: 'lax'`, `maxAge: 24 * 3600`
  - Server Component / Server Action / Middleware から呼び出せる API を提供する
  - _Requirements: 1.1_

- [x] 1.8 Stripe Dashboard で Products / Prices / Customer Portal Configuration を作成
  - Stripe テストモードで以下の Products と Prices を作成する:
    - 基本プラン 4 種（個人発注者様向け / 小規模事業主様向け / 法人向け / 法人向け（高サポート）、いずれも月額 subscription）
    - 初期費用（one-time、CLI-026 初回申込時に追加される）
    - 補償オプション 2 種（¥5,000 / 月、¥9,800 / 月、いずれも subscription）
    - 急募オプション（¥20,000、one-time）
    - 動画掲載オプション（¥100,000、one-time）
  - 作成した各 Price ID を `.env.local` の対応する環境変数にセットする（Task 1.6 で追加した環境変数）
  - Customer Portal Configuration を作成する。機能は「カード情報の更新」と「請求履歴」のみを on にし、「プラン変更」「解約」「サブスクの一時停止」等はすべて off にする
  - 作成した Configuration ID を `STRIPE_PORTAL_CONFIGURATION_ID` 環境変数にセットする
  - 本タスクは手動操作のため、着手時点で Stripe アカウントへアクセスできる環境を用意すること
  - 作業完了後、README または実装メモに「どの Price がどの環境変数に対応しているか」の対応表を記載する
  - _Requirements: 2.1, 7.1_

- [x] 2. fee=free Cookie + 課金状態 SELECT のミドルウェア統合
  - 既存 `src/middleware.ts` の冒頭（認証チェックの前）に fee=free 検出ロジックを挿入する
  - **Cookie セット側**: `pathname === '/billing'` かつ `searchParams.has('fee') && searchParams.get('fee') === 'free'` を検出したら、iron-session ヘルパーで `bijiyu_fee` Cookie をセット（feeExempt=true, expiresAt=24時間後）する
  - **subscriptions 状態の統合 SELECT（軽 4）**: 認証済みリクエスト全般（fee=free 検出後の認証処理の中）で `subscriptions WHERE user_id = ? AND status IN ('active', 'past_due') ORDER BY created_at DESC LIMIT 1` を **1 回だけ** 実行する。取得結果は以下の用途で再利用:
    - **(a) PastDueBanner 用ヘッダー設定**: `x-billing-status` ヘッダーに `'active' | 'past_due' | 'none'`、past_due の場合は `x-past-due-since` ヘッダーに ISO 8601 形式の文字列を付与（layout の Server Component が `headers()` で読み取り、追加の DB 問い合わせをせずに past_due 表示判定する）
    - **(b) Cookie 削除判定**: `pathname === '/billing'` のリクエストで、認証済みユーザー + `bijiyu_fee` Cookie 存在 + `status IN ('active', 'past_due')` の条件をすべて満たす場合、`NextResponse.cookies.delete('bijiyu_fee')` で Cookie を削除
  - **重要**: Cookie 削除は必ず Middleware で行う。BillingPage（Server Component）からは Next.js の仕様上 `cookies().delete()` が呼べないため、Middleware 以外では実装できない
  - 非認証リクエストでは subscriptions SELECT を行わない（オーバーヘッド回避）
  - 既存の認証・ルーティングロジック（contractor の billing パス例外、staff のルートブロック等）を破壊しないことを確認する
  - _Requirements: 1.1, 6.1_
  - **🛑 チェックポイント CP1（ユーザー承認必須・ここで必ず停止）**
    - このタスク完了後、以下を実行して結果をユーザーに報告する:
      1. `supabase db reset` でマイグレーションが正常適用されるか
      2. `supabase gen types typescript --local` で型生成が成功するか
      3. 追加されたミドルウェアのロジックが既存の認証フローを壊していないか（主要ルートへの手動アクセスで確認）
    - ユーザーから「次へ進んで」と明示的な承認があるまで Task 3 に着手しない
    - ユーザーから修正指示があった場合は指示に従って修正し、再度承認を得ること

- [x] 3. Webhook Route Handler と冪等性ガードの実装
- [x] 3.1 Stripe Webhook Route Handler の枠組みと署名検証
  - `/api/webhooks/stripe` に POST Route Handler を作成し、`export const runtime = 'nodejs'` を明示する
  - `request.text()` で raw body を取得（`request.json()` は禁止）、`stripe-signature` ヘッダーと組み合わせて `stripe.webhooks.constructEvent()` で署名検証を行う
  - 検証失敗時は 400 を返し、エラー詳細はログのみに出力（レスポンスには含めない）
  - 署名検証成功後、イベントタイプを判定して各ハンドラに振り分ける。未対応イベントタイプは 200 を返す
  - 全処理を 20 秒以内に完了させる（Stripe のタイムアウト前）
  - _Requirements: 3.1_
  - _Contracts: StripeWebhookHandler API_

- [x] 3.2 冪等性ガード（withWebhookIdempotency）の実装
  - admin client で `stripe_webhook_events` を `stripe_event_id` で SELECT する
  - 既存レコードが `status='completed'` の場合は 200 を返してスキップ
  - レコードが存在しない場合は `status='processing'` で INSERT を試みる。UNIQUE 違反（並行処理）が発生したら 200 を返してスキップ（Stripe の 409 リトライを避けるため必ず 2xx で応答）
  - INSERT 成功後にメイン処理（callback）を実行し、成功時は `status='completed'` + `processed_at=NOW()` に更新
  - メイン処理失敗時は `status='failed'` + `error_message` を記録し、**200 を返す**。Stripe の自動リトライは発動しないため、Phase 1 では運用者が Stripe ダッシュボードから手動 Resend する運用とする
  - 200 を返す理由: 冪等性ガードをシンプルに保つため。500 系を返して自動リトライさせると processing → failed → 再 INSERT 試行 → UNIQUE 違反 → スキップ … という複雑な状態遷移が発生し、stuck processing 問題（後述）も悪化する
  - **stuck processing の扱い**: `stripe_webhook_events` に既に `status='processing'` のレコードが存在する場合は、並行処理中 or 過去クラッシュの両方の可能性があるため、常に 200 を返してスキップする（自動復旧はしない）。運用者による手動復旧に委ねる方針を Phase 1 では採用
  - _Requirements: 3.1_

- [x] 3.3 handleCheckoutCompleted（基本プラン）の実装
  - イベントの `metadata.type === 'plan'` の場合、`supabase.rpc('handle_checkout_completed_plan', { event_data })` を呼び出すだけのラッパーとする
  - 個別の UPDATE/INSERT は TypeScript 側で行わず、すべて RPC 関数（タスク 1.2 で定義）の暗黙トランザクション内で完結させる
  - RPC 関数からのエラーを受け取った場合は冪等性ガード経由で `failed` 記録に委ねる
  - 法人プラン購入後の Cookie 削除は不要（Webhook はサーバー間通信で Cookie 不可）。クリーンアップは BillingPage 側で実施する
  - _Requirements: 3.2_

- [x] 3.4 handleCheckoutCompleted（オプション購入）の実装
  - イベントの `metadata.type === 'option'` の場合、option_type で振り分ける（補償 / 急募 / 動画掲載）
  - 補償オプション（`compensation_5000` / `compensation_9800`）:
    - **二重防御チェック（軽 2）**: INSERT 前に同ユーザーの active な補償オプションが存在しないかを `SELECT 1 FROM option_subscriptions WHERE user_id=? AND option_type IN ('compensation_5000','compensation_9800') AND status='active'` で確認。既存があれば `stripe_webhook_events.status='failed'` に記録（error_message: `"duplicate compensation option detected"`）+ 処理を中断
    - TypeScript 側で `option_subscriptions` に `payment_type='subscription'` + `stripe_subscription_id = session.subscription` で INSERT し、`client_profiles.is_compensation_*` を true に更新する
  - 急募オプション（`urgent`）:
    - `option_subscriptions` に `payment_type='one_time'`, **`stripe_payment_intent_id = session.payment_intent`**（軽 1）, `start_date=NOW()`, `end_date=NOW()+7日` で INSERT
    - `client_profiles.is_urgent_option=true` + 対象 `jobs.is_urgent=true` を更新する（job_id は metadata から取得）
  - 動画掲載オプション（`video`）:
    - `option_subscriptions` に `payment_type='one_time'`, **`stripe_payment_intent_id = session.payment_intent`**（軽 1）, `end_date=NULL` で INSERT する
  - 補償オプションの2テーブル更新は独立性が高く RPC 関数化は不要（admin client で順次実行）
  - **`stripe_payment_intent_id` の保存理由**: 返金やトラブル対応時のトレーサビリティ確保のため、one_time オプションは必ず payment_intent を記録する
  - _Requirements: 3.2, 4.1_

- [x] 3.5 handleSubscriptionLifecycle（updated / deleted の責務分離）の実装
  - **`customer.subscription.updated` の処理**:
    - TypeScript 側で `stripe_subscription_id` で `subscriptions` を SELECT し、現在の `plan_type` / `schedule_id` / `cancel_at_period_end` を**変更前の値**として保持しておく（後続のメール送信判定で使用）
    - ヒットしたら `handle_subscription_lifecycle_updated` RPC 関数に委譲
    - ヒットしなければ `option_subscriptions` を SELECT し、ヒットすれば status カラムを TypeScript 側で直接 UPDATE
    - どちらにも該当しなければ 200 スキップ（順序逆転対策）
  - **`customer.subscription.deleted` の処理**:
    - 同様に SELECT で分岐。subscriptions ヒット時は `handle_subscription_lifecycle_deleted` RPC 関数に委譲
    - **subscriptions ヒット時のトランザクション後処理（致命 B 防御 + Gap 3 対応）**:
      - **(a) 補償オプション連鎖キャンセル**: 同ユーザーの `option_subscriptions WHERE payment_type='subscription' AND status='active'` を SELECT し、各レコードの `stripe_subscription_id` に対して `stripe.subscriptions.cancel()` を呼び出す。それぞれの cancellation により Stripe から個別の `customer.subscription.deleted` Webhook が届き、option_subscriptions 分岐で DB が更新される。これにより「無料ユーザー × 補償オプション継続課金」を防ぐ
      - **(b) 解約完了通知メール送信**: `subscriptionCancelledEmail` を送信。**subscriptions ヒット時のみ送信**する（option_subscriptions ヒット時は送信しない）。メール送信失敗で本体処理をロールバックしない
    - **option_subscriptions ヒット時の処理（致命 B 防御）**:
      - status='cancelled' + `client_profiles.is_compensation_*=false` を TypeScript 側で直接 UPDATE
      - **メール送信は行わない**（補償オプション解約だけで「解約が完了しました」メールが届くとユーザーが基本プラン解約と誤認するため）
  - audit_logs への INSERT は RPC 関数内（基本プラン系）または TypeScript 側（オプション系）で記録する。DB 列名は **`action`**（`action_type` ではない）で、値は Task 1.5 で定義した ACTION_TYPES 定数から参照する:
    - `customer.subscription.updated` × subscriptions ヒット → `action = ACTION_TYPES.subscription_updated`
    - `customer.subscription.deleted` × subscriptions ヒット → `action = ACTION_TYPES.subscription_cancelled`
    - `customer.subscription.deleted` × option_subscriptions ヒット（補償解約）→ `action = ACTION_TYPES.subscription_cancelled`
    - actor_id は Webhook 経由のため常に `null`
    - 変更前後の情報は `metadata jsonb` 列に格納する（`details` ではない）
  - **price ID → plan_type の逆引き**: `customer.subscription.updated` の Subscription Schedule next phase（`subscription.schedule.phases[1].items[0].price`）から取得した price ID を、Task 1.5 で実装した `resolvePlanTypeFromPriceId()` を使って plan_type に変換し `scheduled_plan_type` カラムにセットする。未知の price ID が返された場合は `stripe_webhook_events.status='failed'` + `error_message='unknown price id: <id>'` として記録する
  - **subscriptionChangedEmail の送信判定（Gap 4 対応）**: `customer.subscription.updated` の subscriptions ヒット時、トランザクション後に変更前後の値を比較してメール送信を決定する:
    - **(a) アップグレード確定**: 変更前 plan_type !== 変更後 plan_type → 「プラン変更を承りました」（適用開始日 = 即時）
    - **(b) ダウングレード予約成立**: 変更前 schedule_id null → 変更後非 null → 「ダウングレード予約を承りました」（適用開始日 = `scheduled_at`、新プラン名 = `scheduled_plan_type` のラベル）
    - **(c) 解約予約成立**: 変更前 cancel_at_period_end=false → 変更後 true → 「解約予定を承りました」（適用開始日 = `current_period_end`）
    - **(d) 予約取消**: 変更前 schedule_id 非 null → 変更後 null、または cancel_at_period_end true → false → 「予約を取り消しました」（適用開始日不要）
    - これら以外の更新（current_period のみの更新等）はメール送信しない
  - **送信タイミングの一貫性**: Server Action（upgradePlanAction / scheduleDowngradeAction / changePlanAction）からは **直接メール送信しない**。Stripe に反映された後、Webhook で DB が確定したタイミングでメールを送ることで、「DB が未同期の状態でユーザーにメールが届く」リスクを回避する
  - メール送信失敗時はログ記録のみで本体処理はロールバックしない（既存方針）
  - _Requirements: 3.3, 9.1_

- [x] 3.6 handleSubscriptionLifecycle（payment_failed / payment_succeeded）の実装
  - `invoice.payment_failed`: subscriptions.status='past_due' に更新し、past_due_since が NULL の場合のみ NOW() を設定する。支払い失敗通知メール（paymentFailedEmail）を送信する
  - `invoice.payment_succeeded`: 該当サブスクが過去 past_due だった場合のみ反応し、status='active' に戻し past_due_since を NULL リセットする。法人プラン owner の場合は配下 staff の `is_active=true` を復帰する
  - これらは subscriptions の単一テーブル更新 + メール送信のみのため、TypeScript 側で admin client を使って直接実行する（RPC 関数化不要）
  - _Requirements: 3.3, 6.1_

- [x] 3.7 Webhook 実装完了時点の中間テスト実行
  - `npm run test` で Task 3 系のユニット・統合テスト（withWebhookIdempotency / handleCheckoutCompleted / handleSubscriptionLifecycle）がすべてパスすることを確認する
  - `supabase test db` で RPC 関数の pgTAP テスト（Task 14.1-14.4 のうち実装済みのもの）がパスすることを確認する
  - Task 0 で確認した既存テストにデグレがないことを再確認する
  - 失敗があれば次のブロック（Task 4 以降）に進まず修正する
  - _Requirements: 3.1, 3.2, 3.3_
  - **🛑 チェックポイント CP2（ユーザー承認必須・ここで必ず停止）**
    - `npm run test` と `supabase test db` の結果（pass/fail 件数と失敗テストの概要）をユーザーに報告する
    - Webhook 冪等性ガード、各ハンドラー関数、RPC 関数の実装状況をサマリーで報告する
    - ユーザーから「次へ進んで」と明示的な承認があるまで Task 4 以降に着手しない

- [x] 4. (P) Customer 確保サービスの実装
  - Stripe Customer ID を冪等に確保する TypeScript ラッパーを実装する
  - 1. `supabase.rpc('get_or_lock_stripe_customer', { uid })` を呼び出して既存値の有無と email を取得
  - 2. 既存値があればそのまま返す。null の場合は `stripe.customers.create({ email, metadata: { user_id } })` を呼び出して新しい Customer ID を取得
  - 3. `supabase.rpc('set_stripe_customer_id', { uid, customer_id })` を呼び出して `WHERE stripe_customer_id IS NULL` 付き UPDATE で先勝ち制御
  - 4. UPDATE の影響行数が 0 だった場合（並行リクエストが先に保存済み）、自分が作成した Stripe Customer を `stripe.customers.del()` で削除して既存値を再取得して返す
  - これにより並行リクエストでも Stripe 側に孤児 Customer が残らない
  - 本タスクは Task 1.2（RPC 関数マイグレーション）完了後、Task 3（Webhook 実装）と並行実装可能
  - _Requirements: 2.1_
  - _Contracts: EnsureStripeCustomer Service_

- [x] 5. プラン購入 Server Action の実装
- [x] 5.1 startCheckoutAction の認証・前提チェックと metadata 構築
  - 認証チェック → ロールチェック（staff の場合はエラー「担当者アカウントではプランの変更はできません」）→ アクティブサブスク存在チェック → fee=free Cookie 検証 → 初回判定 のシーケンスを実装する
  - 二重課金防止: 基本プラン購入時、subscriptions に status IN ('active', 'past_due') のレコードがあれば拒否（プラン変更フローへ誘導するエラーメッセージ）
  - 急募オプションの場合: 案件所有権チェック（owner_id = current user）+ 同案件で既に active な urgent オプションがないことを確認
  - 補償オプション排他制御: 既に1つの補償オプションが active の場合は別の補償の購入を拒否
  - **補償オプションのロールチェック（Gap 3 防御）**: `optionType === 'compensation_5000'` または `'compensation_9800'` の場合、以下を必須要件とする:
    - `users.role === 'client'` であること
    - `subscriptions` に `status IN ('active', 'past_due')` の基本プランレコードが存在すること
    - 満たさない場合はエラー「補償オプションは有料プランご加入のお客様のみお申し込みいただけます」を返す
    - 理由: 補償は発注業務に対する保険であり、無料ユーザーには対象がない。「無料ユーザー × 補償オプション継続課金」状態を入口で塞ぐ
  - Checkout Session の metadata を構築する: `{ type, plan_type | option_type, user_id, job_id（急募のみ） }`
  - 初回判定で初回かつ fee=free Cookie がない場合、line_items に初期費用 Price ID を追加する
  - _Requirements: 1.1, 2.1, 4.1_

- [x] 5.2 startCheckoutAction の Stripe Checkout Session 作成と success_url 振り分け
  - 前タスクの ensureStripeCustomer を呼び出して Customer ID を確保する
  - 基本プラン（mode='subscription'）: line_items に選択 Price ID を設定（初回時は初期費用 Price も追加）
  - 補償オプション（mode='subscription'）: line_items に補償 Price ID を設定
  - 急募・動画掲載オプション（mode='payment'）: line_items にオプション Price ID を設定
  - success_url の振り分け:
    - 法人プラン（corporate / corporate_premium）→ **`/mypage/organization-setup`**（Task 8.7 で実装する暫定組織名入力画面）にリダイレクトする。CLI-021 完成までの暫定対応。organization spec 完成後に Task 8.6 で正式な `CLI-021?setup=true` リダイレクトに差し替える（詳細手順は `.kiro/specs/organization/requirements.md`「付録 A: 実装前提リファクタリング手順」Step 4 参照）
    - 個人・小規模プラン → `/mypage?checkout=success`
    - 補償オプション → `/billing?option_success=compensation`
    - 急募オプション → `/billing?option_success=urgent`
    - 動画掲載オプション → `/billing?option_success=video`
  - cancel_url はすべて `/billing`（CLI-026）
  - 成功時に `{ checkoutUrl }` を返し、UI 側で `redirect()` する
  - _Requirements: 2.1, 2.2_
  - _Contracts: StartCheckout Service_

- [x] 6. プラン変更 Server Actions の実装
- [x] 6.1 (P) validateDowngradePrerequisites 共通バリデーション関数の実装
  - 引数（currentPlan, targetPlan）からダウングレード先の `PLAN_LIMITS` を取得する
  - チェック1: 自分がオーナーの `jobs WHERE status='open'` の件数が `maxOpenJobs` 以下であること（超過時のエラー文「掲載中の案件を{N}件以下にしてからプラン変更してください（現在{現件数}件）」）
  - チェック2: 自分がオーナーの案件への `applications WHERE status='applied'` が0件であること（超過時「未対応の応募があります。すべて対応してからプラン変更してください」）
  - チェック3: 自分の組織の `organization_members`（owner 除く）の件数が `maxStaff` 以下であること（代理アカウントも含む）
  - 解約時は targetPlan='free' を渡して `PLAN_LIMITS.free`（全0件）でチェックを実行する
  - 結果は `{ ok: true } | { ok: false, errors: string[] }` で返し、UI 側でトースト表示する
  - _Requirements: 5.2, 5.3_

- [x] 6.2 (P) upgradePlanAction の実装（changePlanAction から内部呼び出しされるヘルパー）
  - 認証 + ロール（client のみ）+ past_due でないこと を確認する
  - **同一プラン validation（Gap 5）**: `currentPlan === targetPlan` の場合はエラー「同じプランへの変更はできません」を返す。changePlanAction でも検証されるが二重防御として実装
  - `stripe.subscriptions.update(id, { items: [{ id, price: newPriceId }], proration_behavior: 'create_prorations' })` を呼び出して即時アップグレードする
  - Stripe Subscription ID は変わらない（同一サブスクの Price 入れ替え）
  - 成功後は CLI-026 に戻ってトースト表示。Webhook で DB が更新される
  - **本タスクは UI から直接呼ばない**。Task 6.6（changePlanAction）経由でのみ呼び出される
  - _Requirements: 5.1_

- [ ] 6.3.0 Stripe Subscription Schedule の事前動作確認（Task 6.3 着手前に必ず実施）
  - **目的**: Stripe API の実挙動と設計書の前提が一致していることを確認し、実装時の手戻りを防ぐ。research.md に記載の通り Subscription Schedule の挙動は複雑なため、コードを書く前に手動で動作確認する
  - Stripe CLI（`stripe listen --forward-to localhost:3000/api/webhooks/stripe`）と Stripe Dashboard（test mode）を使い、以下 4 パターンを手動で検証する
  - **パターン 1: ダウングレード予約の作成**
    - テスト用の active な subscription を 1 つ作成
    - `subscriptionSchedules.create({ from_subscription })` で Schedule を生成
    - `schedule.update({ phases: [currentPhase, nextPhase] })` で次回請求日に price 変更を予約
    - Stripe Dashboard で phases の構造を確認し、design.md の記述（`schedule.phases[1].items[0].price` から price ID を取得）と一致することを検証する
  - **パターン 2: ダウングレード予約のキャンセル**
    - パターン 1 の Schedule に対して `subscriptionSchedules.release()` を実行
    - subscription 本体が残り、Schedule のみ解放されることを確認する
    - `release()` 後の subscription の `schedule` 属性が null になることを確認する
  - **パターン 3: ダウングレード予約中に解約予約を追加**
    - パターン 1 の状態で `subscription.update({ cancel_at_period_end: true })` を実行
    - Schedule と cancel_at_period_end が共存可能かどうかを Stripe Dashboard で確認する
    - 両方が共存する場合の Stripe の挙動（どちらが優先されるか）を記録する
    - 共存不可の場合はエラーメッセージを記録し、Server Action 側（changePlanAction / scheduleCancelAction）で事前バリデーションを追加する必要があるか判断する
  - **パターン 4: Schedule 発動時の Webhook の種類と順序**
    - 現在の phase 終了日を手動で早めて Schedule を発動させる（Stripe Dashboard の test clock を使用）
    - Stripe から届く Webhook の種類（`customer.subscription.updated` / `subscription_schedule.updated` / `subscription_schedule.released` 等）と順序を記録する
    - design.md の `handleSubscriptionLifecycle` の updated 分岐ロジックが正しく動く前提になるため、届いた Webhook の種類と順序が設計と一致することを確認する
    - 不一致がある場合は design.md の該当セクション（`handleSubscriptionLifecycle` の Implementation Notes）を更新してから実装コードを書く
  - **各パターンの結果を実装メモとして記録**し、design.md の Implementation Notes に追記または「確認済み」チェックを入れる
  - 上記 4 パターンの確認が完了してから、scheduleDowngradeAction の実装コード（Task 6.3）を書き始める
  - _Requirements: 5.2_

- [x] 6.3 scheduleDowngradeAction と cancelDowngradeReservationAction の実装
  - scheduleDowngradeAction: 認証 + past_due チェック → `validateDowngradePrerequisites` → `subscriptionSchedules.create({ from_subscription })` で Schedule を生成 → `subscriptionSchedules.update()` で next phase の price を targetPlan の Price ID に予約
  - **scheduleDowngradeAction は UI から直接呼ばない**。Task 6.6（changePlanAction）経由でのみ呼び出される
  - cancelDowngradeReservationAction: 現在の subscription を `subscriptions.retrieve()` で取得し、`schedule` 属性で分岐
    - schedule 非 null → `subscriptionSchedules.release(scheduleId)` で Schedule を解放。戻り値 `{ cancelledType: 'downgrade', previousTargetPlan }`
    - schedule null かつ `cancel_at_period_end === true` → `subscriptions.update({ cancel_at_period_end: false })`。戻り値 `{ cancelledType: 'cancel' }`
    - どちらでもない場合 → 冪等的に success を返す（UI 側でフォールバック表示）
  - **Stripe API エラーハンドリング（Gap 6）**: `subscriptions.retrieve()` または `subscriptionSchedules.release()` が以下のエラーを返した場合は適切なメッセージで返す:
    - `resource_missing` または `subscription is canceled` → 「解約処理が既に完了したため、取り消しできません。プラン案内画面を再度ご確認ください」（subscription が deleted 後に走った race ケース）
    - その他の Stripe API エラー → 「予約のキャンセルに失敗しました。しばらくしてから再度お試しください」
  - audit_logs に `subscription_reservation_cancelled` を記録する（action 列に `ACTION_TYPES.subscription_reservation_cancelled` を使用）
  - _Requirements: 5.2_
  - _Contracts: PlanChange Service_

- [x] 6.4 scheduleCancelAction と cancelImmediatelyAction の実装
  - scheduleCancelAction: 認証 + past_due でないこと → `validateDowngradePrerequisites(currentPlan, 'free')` → `subscription.update({ cancel_at_period_end: true })` で解約予約
  - cancelImmediatelyAction: past_due 状態のときのみ呼び出し可能。前提条件チェックをスキップして `subscriptions.cancel(subscriptionId)` で即時解約。掲載中案件は Webhook 経由で強制クローズされる
  - past_due 中以外で cancelImmediatelyAction が呼ばれた場合はエラーを返す
  - _Requirements: 5.3_

- [x] 6.5 (P) cancelCompensationAction の実装
  - 認証 + 該当補償オプションの所有者であることを確認する
  - 対象の `option_subscriptions.stripe_subscription_id` を取得し、`stripe.subscriptions.cancel(stripeSubscriptionId)` で即時解約する
  - DB の状態更新は Webhook（customer.subscription.deleted）が同期する
  - 解約成功後は CLI-026 に戻ってトースト表示
  - _Requirements: 4.1_

- [x] 6.6 changePlanAction（プラン変更ルーティング Server Action）の実装
  - 「このプランに変更する」ボタンの統一エントリ。Task 6.2（upgradePlanAction）と Task 6.3（scheduleDowngradeAction）に振り分ける wrapper Server Action
  - 処理手順:
    1. 認証 + ロール（client のみ）+ past_due でないことを確認
    2. 現在のサブスクリプションから `currentPlan` を取得（`subscriptions.plan_type`）
    3. **予約状態チェック（Gap 1 防御）**: `subscriptions.schedule_id` が非 null、または `cancel_at_period_end=true` の場合 → エラー「予約をキャンセルしてからプラン変更してください」を返す
    4. Task 1.5 で作成した `comparePlans(currentPlan, targetPlan)` を呼び出して比較結果を取得
    5. 結果に応じて分岐:
       - `'upgrade'` → Task 6.2 の `upgradePlanAction(targetPlan)` を呼び出す
       - `'downgrade'` → Task 6.3 の `scheduleDowngradeAction({ targetPlan })` を呼び出す
       - `'same'` → エラー「同じプランへの変更はできません」を返す
    6. 戻り値に `performedType: 'upgrade' | 'downgrade'` を含めて UI 側でトースト出し分けを可能にする
  - 成功時の戻り値:
    - upgrade: `{ success: true, data: { performedType: 'upgrade', newPlanName } }`
    - downgrade: `{ success: true, data: { performedType: 'downgrade', scheduledAt, newPlanName } }`
  - **本タスクが UI から呼ばれる唯一のプラン変更エントリ**。upgradePlanAction / scheduleDowngradeAction を BillingPage / PlanCard から直接呼んではいけない
  - _Requirements: 5.1, 5.2_
  - _Contracts: ChangePlan Service_

- [x] 7. Customer Portal 連携と Server Action 完了時点の中間テスト
- [x] 7.1 (P) openCustomerPortalAction の実装
  - 認証 → `users.stripe_customer_id` を取得 → `stripe.billingPortal.sessions.create({ customer, return_url: '/billing', configuration: STRIPE_PORTAL_CONFIGURATION_ID })` で Session を生成 → URL を返す
  - Configuration ID は環境変数で管理する。Stripe Dashboard で「カード情報の更新」「請求履歴」のみ on にした Configuration を事前作成しておく（Task 1.8 で実施）
  - _Requirements: 7.1_
  - _Contracts: CustomerPortal Service_

- [x] 7.2 Server Action 実装完了時点の中間テスト実行
  - `npm run test` で Task 4-7 系のユニットテスト（ensureStripeCustomer / startCheckoutAction / プラン変更 Server Actions / openCustomerPortalAction）がすべてパスすることを確認する
  - Task 0 と Task 3.7 で確認したテストにデグレがないことを再確認する
  - 失敗があれば次のブロック（Task 8 以降）に進まず修正する
  - _Requirements: 2.1, 5.1, 5.2, 5.3, 7.1_

- [x] 8. CLI-026 プラン案内画面の実装（design-assets/screens/CLI-026.png, CLI-026-b.png）
  > 注: 8.1（Server Component 基盤）完了後、8.2 / 8.3 / 8.4 / 8.5 は並列実装可
- [x] 8.1 BillingPage（Server Component）のデータ取得とボタン状態決定
  - 対応するデザインカンプ: `design-assets/screens/CLI-026.png`（初回申込: 事務手数料あり）と `design-assets/screens/CLI-026-b.png`（プラン変更: 事務手数料不要）。両方確認してレイアウト・配置・色を合わせる
  - Server Component で `users.role` / `subscriptions`（status, plan_type, schedule_id, scheduled_plan_type, scheduled_at, cancel_at_period_end）/ `option_subscriptions` / `client_profiles` / `organization_members` を 1 リクエストで取得する
  - 初回判定: `subscriptions` にレコードが0件で `bijiyu_fee` Cookie がない場合のみ初期費用ありとする
  - **Stripe API は CLI-026 表示時に呼ばない**（DB のキャッシュカラムから予約状態を取得する）
  - fee=free Cookie の削除は **Middleware が担当する**ため、BillingPage 側では Cookie の読み取りのみ行う（初回判定に使用）。BillingPage から `cookies().delete()` を呼ばないこと（Server Component では Next.js の仕様上呼び出せない）
  - ボタン状態決定ロジック（10 パターン以上）:
    - **未課金（subscriptions レコード 0 件、または cancelled のみ）** → 各プランに「申し込む」→ Task 5(startCheckoutAction) を呼ぶ。**cancelled のみのユーザーも未課金と同等に扱う**（ボタン文言・遷移先は同じ。再購入時は cancelled レコードがあるため初期費用なし扱いになる点に注意 — Gap 2 対応）
    - 課金済み（同プラン）→「ご利用中」バッジ非活性
    - **課金済み（他プラン）→「このプランに変更する」→ Task 6.6(changePlanAction) を呼ぶ**（内部で comparePlans → upgrade / downgrade に振り分け）
    - past_due → アップグレード/ダウングレード非活性、解約のみ有効、現在プランに「ご利用中」+「お支払い確認中」バッジ
    - **予約あり（schedule_id 非 null または cancel_at_period_end=true）→ 他プラン全ての「このプランに変更する」ボタンを非活性化** + ツールチップ「予約をキャンセルしてから操作してください」を表示（Gap 1 対応）。現在プランカードのみ「変更をキャンセルする」/「解約をキャンセルする」を表示
    - staff → 全ボタン非活性 + 制限メッセージ表示
  - **Server Action 振り分けの責務**: BillingPage / PlanCard はプラン変更時に **必ず Task 6.6 changePlanAction を呼ぶ**こと。upgradePlanAction（6.2）や scheduleDowngradeAction（6.3）を直接呼んではいけない。changePlanAction が内部で comparePlans を使って routing する
  - searchParams 監視: `checkout=success` / `option_success=urgent|compensation|video` を読み取ってトーストキューに渡す
  - _Requirements: 1.1, 5.1, 5.2, 5.3, 6.1_

- [x] 8.2 (P) PlanCard と機能比較表コンポーネント
  - 5 プラン（無料 / 個人発注者様向け / 小規模事業主様向け / 法人向け / 法人向け（高サポート））の比較表を作成する。比較項目: 職種・エリア・マイリスト登録・新規メッセージ・現場掲載・検索機能・上位表示・複数人利用・代理メッセージ
  - 各プランカードに月額料金と CTA ボタンを表示する。CTA は親（BillingPage）から渡された状態に応じて文言・活性が変わる
  - **CTA 振り分けロジック**: 親 BillingPage が currentPlan + targetPlan + 状態フラグ（schedule_id / cancel_at_period_end / past_due / staff）を考慮して PlanCard に渡す `onClick` プロパティを決定する。具体的には:
    - 未課金 → `onClick={() => startCheckoutAction({ type: 'plan', planType: targetPlan })}`
    - 課金済み（他プラン）+ 予約なし + !past_due → `onClick={() => changePlanAction({ targetPlan })}`
    - 予約あり / past_due / staff / 同プラン → ボタン disabled（onClick なし）
  - 「申し込む」ボタンは `useTransition` + `disabled` で連打防止する
  - 現在プラン（active / past_due）はカード自体をハイライト表示する
  - ダウングレード/解約予約状態のとき、現在プランカード内に「{scheduled_at の日付}に{scheduled_plan_type のプラン名}に変更予定 / 解約予定」ラベルと「変更をキャンセルする」「解約をキャンセルする」ボタン（`variant="outline"`）を表示する
  - **予約あり時の他プランカード**: 「このプランに変更する」ボタンは disabled + ツールチップ「予約をキャンセルしてから操作してください」を表示（Gap 1）
  - デザインカンプ通りのレイアウト・余白・色を再現する（PC / SP 両方）
  - _Requirements: 1.1, 5.1, 5.2, 5.3_

- [x] 8.3 (P) OptionSection の実装
  - 4 種オプション（急募 ¥20,000 / 動画掲載 ¥100,000 / 補償 ¥5,000/月 / 補償 ¥9,800/月）を表示する
  - 急募オプションには案件選択プルダウンを表示する。選択肢は「自分がオーナーの `status='open'` かつ `is_urgent=false` かつ既存 active urgent オプションがない案件」のみ
  - 0件の場合は「掲載中の案件がありません」を表示し、申込ボタンを非活性
  - 案件未選択時も申込ボタンを非活性
  - 補償オプションの排他制御: `client_profiles.is_compensation_5000` または `is_compensation_9800` のいずれかが true の場合、もう一方の申込ボタンを非活性
  - active な補償オプションには「解約する」ボタンを表示する。押下時に確認ダイアログ → cancelCompensationAction を呼び出す
  - 動画掲載は買い切りのため解約ボタンを表示しない
  - _Requirements: 1.1, 1.2, 4.1_

- [x] 8.4 (P) 確認ダイアログとトーストの実装
  - プラン変更ダイアログ: ダウングレード予約時に「現在のプラン」「変更後のプラン」「current_period_end までの利用案内」「次回課金日と金額」を表示し、「キャンセルする」「プラン変更を予約する」ボタンを配置する
  - アップグレードダイアログ: 「現在のプラン」「変更後のプラン」「日割り差額即時課金」を表示し、「キャンセルする」「プラン変更する」ボタンを配置する
  - 解約ダイアログ: 「current_period_end までの利用案内」「無料プランへの切替時期」「発注者機能ロック」を表示する
  - past_due 解約ダイアログ: 警告アイコン付きで「即時解約」「掲載中案件の強制クローズ」「担当者ログイン停止」「補償オプションも連鎖キャンセル」を明示し、「お支払い方法を更新する」「解約する」を提示する
  - **changePlanAction の戻り値 `performedType` で出し分け**:
    - `'upgrade'` → 「{newPlanName} にアップグレードしました」
    - `'downgrade'` → 「{scheduledAt} に {newPlanName} への変更を予約しました」
  - **cancelDowngradeReservationAction の戻り値 `cancelledType` で出し分け**:
    - `'downgrade'` → 「ダウングレード予約を取り消しました（{previousTargetPlan のプラン名}）」
    - `'cancel'` → 「解約予定を取り消しました」
    - 戻り値なし → 「すでに予約はキャンセル済みです」
  - searchParams（`checkout=success` / `option_success=*`）を読み取り、対応するトーストを表示後 `router.replace()` で URL から削除する
  - _Requirements: 5.1, 5.2, 5.3, 2.2, 4.1_

- [x] 8.5 (P) staff 制限と past_due 警告メッセージ
  - `users.role === 'staff'` のとき、CLI-026 の上部に「担当者アカウントではプランの変更はできません。組織の管理者にお問い合わせください。」のメッセージを表示し、すべての CTA ボタンを非活性にする
  - past_due 中は CLI-026 の現在プラン上に「お支払いが完了していません。お支払い方法を更新するか、解約をお選びください。」のインライン警告メッセージを表示する（PastDueBanner と重複しないよう、CLI-026 内では文言を簡潔にする）
  - _Requirements: 1.1, 5.3, 6.1_

- [ ] 8.6 【organization spec 依存】CLI-021 への `?setup=true` フロー統合（organization spec 側で実施）
  - **本タスクは organization spec 側の実装作業**として扱う。billing spec 側では追跡・参照のみ。具体的な手順は `.kiro/specs/organization/requirements.md`「付録 A: 実装前提リファクタリング手順」**Step 4**（`organization-setup` の CLI-021 統合）を正とする
  - **切替時に削除されるもの（本 tasks.md で着手した暫定資産）**:
    - 暫定画面 `src/app/(authenticated)/mypage/organization-setup/page.tsx`（Task 8.7 で実装）
    - 暫定 Server Action `saveOrganizationNameAction`（`src/app/(authenticated)/mypage/organization-setup/actions.ts`）
    - 暫定 Client Component `OrganizationSetupForm.tsx`
    - `src/__tests__/billing/save-org-name-action.test.ts`（Vitest）
    - 暫定画面用 E2E シナリオ（Task 15.5 のシナリオ 1〜7、`e2e/billing.spec.ts` 内）
    - 本 tasks.md 内の **`organizations.name` への参照行**（削除・書き換え対象）:
      - L436（Task 8.7 の表示条件 `organizations.name=''`）
      - L519（Task 13 の seed: `organizations.name='ビジ友建設'`）
      - L520（Task 13 の seed: `organizations.name=''`）
      - L657・L659・L660・L661（Task 13.14 フォールバックテストの `organizations.name` ケース）
      - L673（Task 13.14 `organizations.name` 更新確認）
      - L744・L745（Task 15.5 シナリオ 2・3 の `organizations.name` 反映確認）
  - **billing spec 側で差し替える箇所**（organization spec 実装中にまとめて修正される）:
    - `src/app/(authenticated)/billing/actions.ts` L95-100 付近（`buildSuccessUrl`）: **全プラン**の success_url を `CLI-021?setup=true` に統一（現行の法人=organization-setup / 個人/小規模=?checkout=success の分岐を廃止）
    - `src/app/(authenticated)/billing/BillingClient.tsx` L205 付近: アップグレード成功時の `window.location.href` を全プラン CLI-021?setup=true に変更
    - `billing/impl-memo.md` L254・L294 の `organizations.name` 参照は**歴史的記録として残す**（未来の開発者が過去の仕様変遷を追えるようにするため、削除しない）
    - 本 tasks.md の Task 5.2（success_url の振り分け記述）・Task 15.5（E2E シナリオ）は organization spec 完了時に CLI-021 ベースに書き換え
  - **CLI-021 での `?setup=true` 挙動（全プラン共通）**:
    - 画面上部にセットアップバナーを表示:
      - 法人プラン（corporate / corporate_premium）: 「社名の入力が必須です（後からいつでも編集できます）」。`display_name` 必須、スキップボタン非表示
      - 個人・小規模プラン（`individual` / `small`）: 「発注者として利用する場合は社名または氏名を入力してください。受注者機能のみ利用する方はスキップ可（後からいつでも編集できます）」。`display_name` 任意、「スキップして後で設定する」ボタン表示 → 押下で DB 操作せず CON-001 へ遷移
    - 入力欄プリフィル: `client_profiles.display_name` の現在値を表示（Webhook がデフォルト格納した `users.last_name + first_name`、またはユーザーが以前編集した値）
    - Webhook 未着時のアクセスは `users.role` / `subscriptions.plan_type` を待たず許可（ガード緩和）。保存 Server Action は Webhook 完了を前提とし未完了時はエラー返却
    - 再アップグレード時の冪等性: `?setup=true` は常にセットアップバナーを表示する（簡素化のため「既に編集済みかどうか」の判定は行わない）。再アップグレード時は既存の編集済み display_name が prefill として表示されるため、法人ユーザーはそのまま保存、非法人ユーザーはスキップすればよい
  - _Requirements: 2.2, 5.1_
  - _依存: .kiro/specs/organization/ の design / tasks / 実装完了_

- [x] 8.7 組織名入力暫定画面（`/mypage/organization-setup`）の実装
  - **目的**: CLI-021 完成までの暫定対応。法人プラン購入直後のユーザーに組織名入力を求める軽量画面を先行実装する。これにより法人名が空文字のまま受注者にメッセージが届くリスクを最小化する
  - **配置**: `src/app/(authenticated)/mypage/organization-setup/page.tsx`（Server Component）+ Client Component のフォーム
  - **page.tsx（Server Component）の責務**:
    - 認証チェック（非認証なら `/login` リダイレクト）
    - 表示条件の検証: `users.role='client'` AND `subscriptions.plan_type IN ('corporate', 'corporate_premium')` AND `organizations.name=''`（または null）
    - 表示条件を満たさない場合は `/mypage` に即リダイレクト（冪等性）
    - 既に組織名入力済みの場合も `/mypage` にリダイレクト
    - staff ロールのアクセスは `/mypage` にリダイレクトして拒否
    - 条件を満たせば Client Component のフォームをレンダリング
  - **Client Component フォームの実装**:
    - タイトル: 「組織名を入力してください」
    - 説明文: 「法人プランにご登録いただきありがとうございます。受注者に表示される組織名を入力してください」
    - 入力フィールド 1 つ（組織名、必須、1〜100 文字、`trim()` 必須、Zod でクライアント側バリデーション）
    - 送信ボタン（primary、ピル型、CTA スタイル、`useTransition` + `disabled` で連打防止）
  - **Server Action `saveOrganizationNameAction(name: string)` の実装**:
    - 認証チェック + ロールチェック（client のみ許可、staff / contractor は拒否）
    - Zod による組織名バリデーション（1〜100 文字、trim、空文字拒否）
    - `organizations` テーブルの `name` カラムを UPDATE（`owner_id = user.id` で特定）
    - `audit_logs` に action='organization_name_set' を記録（actor_id = user.id）
    - 成功後は `redirect('/mypage?setup_completed=true')`
  - デザインカンプがないため、同プロジェクトの既存フォーム画面（プロフィール編集等）のレイアウトを踏襲する。primary CTA ボタン（ピル型）+ 中央寄せ
  - **CLI-021 完成後の扱い**: Task 8.6 で本画面と Server Action を削除し、CLI-021 の `?setup=true` フローに統合する
  - _Requirements: 2.2_
  - **🛑 チェックポイント CP3（ユーザー承認必須・目視比較必須）**
    - Task 8 系（8.1〜8.5, 8.7）がすべて完了した時点でここに到達する
    - 実装完了後、`design-assets/screens/CLI-026.png` および `design-assets/screens/CLI-026-b.png` と実装結果を項目ごとに比較し、差分を箇条書きでユーザーに報告する
    - 確認項目: 要素の配置順序、セクション分割、カード・ボタンのスタイル、余白のバランス、アイコン（assets/icons/ のプロジェクト専用アイコンが使われているか）、CTA ボタンの色（bg-primary + text-white + rounded-full ピル型）、フォーム要素の背景（bg-background 白）
    - ユーザーから「次へ進んで」と明示的な承認があるまで Task 9 以降に着手しない
    - デザインカンプとの差分が見つかった場合は差分一覧を提示し、修正するか現状維持するかをユーザーに確認すること

- [x] 9. PastDueBanner（全画面共通）の実装
  - ルートレイアウト（`src/app/(authenticated)/layout.tsx` 等）の最上部に PastDueBanner を配置する
  - **データ取得は Middleware 経由**（軽 4: Task 2 で設定した `x-billing-status` / `x-past-due-since` ヘッダーを使用）:
    - layout の Server Component で `headers()` から `x-billing-status` を読み取る
    - `'past_due'` のとき、`x-past-due-since` から ISO 8601 文字列を取得して `Date` に変換
    - layout はこのために subscriptions テーブルを SELECT しない（Middleware が既に SELECT 済み）
    - 1 リクエストあたり subscriptions SELECT は **1 回のみ**（Middleware で実行）
  - **残日数計算は Server 側で実行**: `Math.max(0, 7 - Math.floor((Date.now() - new Date(pastDueSince).getTime()) / 86_400_000))`
  - **severity 判定も Server 側**: 残 4 日以上は `'warning'`、3 日以下は `'critical'`
  - Banner Client Component は `daysRemaining` と `severity` を props で受け取り、色分け表示と「お支払い方法を更新する」ボタンのみ担当する（残日数の再計算はしない）
  - 残日数 0 以下の場合は「まもなく自動解約されます」と表示する
  - 「お支払い方法を更新する」ボタンは openCustomerPortalAction を呼び出して Stripe Customer Portal にリダイレクトする
  - _Requirements: 6.1_
  - _Contracts: PastDueBanner State_

- [x] 10. 決済系メールテンプレート 3 種の作成
- [x] 10.1 (P) paymentFailedEmail テンプレート
  - 既存の `src/lib/email/templates/matching-accepted.ts` と同じ HTML テンプレート方式（紫ヘッダー、白本文、灰フッター、ピル型 CTA）で実装する
  - props: 受信者名 / プラン名 / 次回リトライ予定日 / サービス URL
  - 宛名は `users.last_name + first_name`（スペースなし結合）
  - 件名「【ビジ友】お支払いが確認できません」
  - 本文に「お支払い方法を更新する」CTA ボタンを設置する
  - _Requirements: 9.1_

- [x] 10.2 (P) subscriptionChangedEmail テンプレート
  - props: 受信者名 / 旧プラン名 / 新プラン名 / 適用開始日 / サービス URL
  - 件名「【ビジ友】プラン変更を承りました」
  - アップグレード（即時）/ ダウングレード予約（次回請求日から）の両方を1つのテンプレートで扱えるよう、適用開始日を可変にする
  - _Requirements: 9.1_

- [x] 10.3 (P) subscriptionCancelledEmail テンプレート
  - props: 受信者名 / プラン名 / 解約日 / サービス URL
  - 件名「【ビジ友】解約が完了しました」
  - 通常解約・past_due 自動解約の両方で使用できる文言にする
  - _Requirements: 9.1_

- [x] 11. auto-cancel-past-due Edge Function の実装
  - `supabase/functions/auto-cancel-past-due/index.ts` を作成する
  - 認証ヘッダ `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` を検証する。**不一致または欠落の場合は 401 Unauthorized を返して即終了**（軽 3）。エラー詳細はログのみに出力し、レスポンスボディには含めない
  - admin client で `subscriptions WHERE status='past_due' AND past_due_since + INTERVAL '7 days' < NOW()` を取得する
  - 各レコードを順次処理（try-catch で個別エラーハンドリング）:
    - `stripe.subscriptions.cancel(stripeSubscriptionId)` で Stripe 側を即時解約（DB 更新は Webhook 経由）。**Webhook の `customer.subscription.deleted` ハンドラ内で補償オプション連鎖キャンセルが自動実行される**ため、Edge Function 側では補償オプションを個別に処理する必要はない（Gap 3 対応）
    - 解約完了通知メール（subscriptionCancelledEmail）を送信
    - audit_logs に `auto_cancelled_past_due` を記録（actor_id=null、action 列は `ACTION_TYPES.auto_cancelled_past_due`）
  - レスポンス: `{ total: N, succeeded: N, failed: N, errors: [{ userId, message }] }`
  - 0 件の場合もログを残す（正常動作の確認用）
  - 同じユーザーを2回処理しても Stripe 側で既にキャンセル済みならエラーになるが try-catch で吸収する（冪等性）
  - **Deno ランタイム上の注意**: Supabase Edge Functions は Deno 環境で動作するため、Stripe SDK は `import Stripe from 'npm:stripe'` 形式で import する。Resend も `import { Resend } from 'npm:resend'` で import する。Node.js の `require()` や bare module import は使えない
  - admin client は `import { createClient } from 'jsr:@supabase/supabase-js@2'` または相当の Deno 互換経路で import する
  - テスト時は `deno test` または `supabase functions serve` で動作確認する
  - _Requirements: 8.1_
  - _Contracts: AutoCancelPastDue Batch_

- [x] 12. seed.sql の billing 用テストデータ追加
  - 以下のユーザーパターンを seed.sql に追加する
    - 未課金 contractor（既存の `contractor@test.local` を利用）
    - active な個人プラン client（subscriptions に status='active', plan_type='individual'）
    - active な法人プラン owner + 配下 staff 1〜2 名（organizations + organization_members、`organizations.name='ビジ友建設'` 設定済み）
    - **法人プラン購入直後で組織名未入力のユーザー**（subscriptions: status='active' plan_type='corporate', `organizations.name=''` 空文字、organization_members に owner レコードあり。Task 8.7 暫定画面の E2E テスト + Task 13.14 フォールバックテスト用）
    - **active な法人プラン owner + 補償オプション active のユーザー**（補償連鎖キャンセル E2E テスト用。subscriptions + option_subscriptions[compensation_5000 or 9800] + client_profiles.is_compensation_*=true）
    - past_due ユーザー（past_due_since を7日以上前に設定して自動解約テストに使う）
    - cancelled ユーザー（過去 client、現在 contractor。再課金フローの確認用、cancelled の subscriptions レコードが残っている）
    - **ダウングレード予約中のユーザー**（subscriptions に schedule_id 非 null + scheduled_plan_type / scheduled_at 設定済み。Gap 1 のボタン非活性 E2E テスト用）
    - 急募オプション active のユーザー + 対象案件（option_subscriptions.option_type='urgent', end_date=未来）
    - 補償オプション active のユーザー（is_compensation_5000=true）
  - 各ユーザーの client_profiles / organization_members も整合させる
  - `supabase db reset` で seed が正しく投入されることを確認する
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 3.3, 4.1, 5.1, 5.2, 5.3, 6.1, 7.1, 8.1, 8.2, 9.1_

- [x] 13. ユニット・統合テストの実装
- [x] 13.1 (P) PLAN_LIMITS と validateDowngradePrerequisites のユニットテスト
  - PLAN_LIMITS の値が要件通り（個人発注者様向け=1案件0担当者、小規模事業主様向け=∞案件0担当者、法人向け=∞案件10担当者、法人向け（高サポート）=∞案件30担当者）であることを確認
  - validateDowngradePrerequisites の全プラン変更マトリクス網羅（ダウングレード 6 パターン × 3 種類のチェック失敗 + 解約 5 パターン = 計 23 ケース）
  - 掲載中案件超過 / 未返信応募あり / 担当者超過 のそれぞれのエラーメッセージを検証
  - _Requirements: 5.2, 5.3_

- [x] 13.2 (P) BillingPage のボタン状態決定ロジックのユニットテスト
  - 10 パターン以上のスナップショットテスト: 未課金 / active 個人 / active 法人 / past_due / cancelled / staff / fee=free 適用 / 予約あり / 補償加入中 / 急募加入中
  - BillingPage の予約情報表示が DB キャッシュ（subscriptions.schedule_id 等）から取得されることを確認
  - _Requirements: 1.1, 5.2, 5.3_

- [x] 13.3 (P) PastDueBanner のサーバー側残日数計算テスト
  - 境界値テスト: 0 / 1 / 3 / 4 / 7 / 8 日
  - severity 判定の境界値（3 vs 4）も明示的にテスト
  - 残日数 0 以下のときに「まもなく自動解約されます」が出ること
  - _Requirements: 6.1_

- [x] 13.4 (P) ensureStripeCustomer の並行性テスト
  - モック Stripe SDK + モック Supabase RPC で「先勝ち」「後勝ち（孤児削除）」の両ケースを検証
  - 後勝ちのリクエストが `customers.del` を呼ぶことを確認
  - 既存 Customer ID が存在する場合は Stripe API を呼ばずに早期 return することを確認
  - _Requirements: 2.1_

- [x] 13.5 cancelDowngradeReservationAction の3分岐テスト
  - schedule 非 null → ダウングレード予約のキャンセル + 戻り値 `{ cancelledType: 'downgrade', previousTargetPlan }`
  - schedule null かつ cancel_at_period_end=true → 解約予約のキャンセル + 戻り値 `{ cancelledType: 'cancel' }`
  - どちらでもない（冪等ケース）→ success を返す
  - subscriptionSchedules.release が冪等であること（schedule=null の場合に成功を返す）
  - _Requirements: 5.2_

- [x] 13.6 startCheckoutAction のシナリオテスト
  - 初回購入（fee=free なし）→ Checkout Session line_items に初期費用 Price ID が含まれる
  - 初回購入（fee=free あり）→ 初期費用 Price ID が含まれない
  - 既存サブスクあり時のプラン購入 → エラー（プラン変更フローへ誘導）
  - staff ロールで呼び出し → エラー（担当者制限）
  - 急募オプション（他人の案件 ID）→ 所有権エラー
  - 補償オプション（既に1つ加入）→ 排他制御エラー
  - **補償オプション × contractor ロール → エラー**「補償オプションは有料プランご加入のお客様のみ...」（Gap 3 防御）
  - _Requirements: 2.1, 4.1_

- [x] 13.7 Webhook ハンドラの統合テスト
  - withWebhookIdempotency: 既存 completed → 200 スキップ / 並行 INSERT 失敗 → 200 スキップ / 新規 → 処理実行 / 失敗時 → status='failed' 更新
  - stuck processing 検出時のスキップ: `stripe_webhook_events` に既に `status='processing'` のレコードがある状態で同じ `stripe_event_id` の処理を試みた場合、メイン処理が実行されず 200 が返ることを確認
  - handleCheckoutCompleted: metadata.type 振り分け（plan / option × 4種）
  - handleCheckoutCompleted の二重防御: 既存 active あり時に failed 記録
  - **handleSubscriptionLifecycle の4分岐テスト**:
    - `customer.subscription.updated` × subscriptions ヒット → `handle_subscription_lifecycle_updated` RPC が呼ばれる
    - `customer.subscription.updated` × option_subscriptions ヒット → TypeScript 側で直接 UPDATE（RPC 呼ばれない）
    - `customer.subscription.deleted` × subscriptions ヒット → `handle_subscription_lifecycle_deleted` RPC が呼ばれる
    - `customer.subscription.deleted` × option_subscriptions ヒット → TypeScript 側で直接 UPDATE
  - 上記 4 分岐テストに**加えて**、`customer.subscription.updated` / `customer.subscription.deleted` のいずれも subscriptions / option_subscriptions のどちらにもヒットしないケース（順序逆転対策のスキップケース）で 200 を返し、DB に変更がないことを確認する
  - 順序逆転（updated が completed より先に届く）→ 200 スキップ
  - past_due → active 復帰時の staff の is_active 復帰
  - **非対応イベントの 200 スキップテスト**:
    - `customer.updated`（カード情報更新等）→ 署名検証成功 + 200 + DB に変更なし
    - `customer.created`（初回 Customer 作成）→ 同上
    - `invoice.finalized` / `invoice.created` 等の情報系イベント → 同上
  - 非対応イベント受信時に冪等性ガード（`stripe_webhook_events`）にも記録されないことを確認する（processing の INSERT をしないか、completed で即スキップする）
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 13.8 (P) メールテンプレート関数のユニットテスト
  - 3 テンプレートそれぞれの subject / 宛名整形 / HTML 構造を検証
  - 宛名が `users.last_name + first_name`（スペースなし結合）になることを確認
  - _Requirements: 9.1_

- [x] 13.9 (P) Middleware の fee=free Cookie クリーンアップ + 統合 SELECT のユニットテスト
  - 認証済みユーザー × subscriptions に active あり × bijiyu_fee Cookie あり → `NextResponse.cookies.delete('bijiyu_fee')` が呼ばれる
  - 認証済みユーザー × subscriptions に active あり × bijiyu_fee Cookie なし → 何もしない
  - 認証済みユーザー × subscriptions なし × bijiyu_fee Cookie あり → 何もしない（Cookie は維持）
  - 未認証ユーザー × 任意 → 何もしない
  - `pathname !== '/billing'` → 何もしない
  - **統合 SELECT のヘッダー設定テスト**（軽 4）:
    - 認証済み × active → `x-billing-status: active` がレスポンスに含まれる
    - 認証済み × past_due → `x-billing-status: past_due` + `x-past-due-since: <ISO 文字列>` がレスポンスに含まれる
    - 認証済み × subscriptions なし → `x-billing-status: none`
    - 未認証 → 上記ヘッダーは設定されない
  - _Requirements: 1.1, 6.1_

- [x] 13.10 (P) comparePlans / changePlanAction / resolvePlanTypeFromPriceId のユニットテスト
  - **comparePlans の境界値**:
    - `comparePlans('individual', 'small')` → `'upgrade'`
    - `comparePlans('corporate_premium', 'individual')` → `'downgrade'`
    - `comparePlans('small', 'small')` → `'same'`
    - `comparePlans('free', 'individual')` → `'upgrade'`
    - 全 5×5 = 25 通りの組み合わせを網羅
  - **changePlanAction の routing**:
    - 上位プラン → upgradePlanAction が呼ばれる（Supabase / Stripe をモックして検証）
    - 下位プラン → scheduleDowngradeAction が呼ばれる
    - 同一プラン → エラー「同じプランへの変更はできません」
    - 予約あり（schedule_id 非 null）→ エラー「予約をキャンセルしてからプラン変更してください」
    - 予約あり（cancel_at_period_end=true）→ 同上
    - past_due → エラー
    - staff → エラー
  - **`resolvePlanTypeFromPriceId` の網羅テスト**:
    - 既知の 4 プラン（individual / small / corporate / corporate_premium）の price ID を渡すと対応する plan_type が返ること
    - 未知の price ID を渡すと `null` が返ること
    - 環境変数のモック（`vi.stubEnv` 等）を使って各 `STRIPE_PRICE_*` をテスト用の値に差し替え、ロジックの正しさのみを検証する
  - _Requirements: 3.3, 5.1, 5.2_

- [x] 13.11 (P) 補償オプション購入時のロールチェックテスト
  - contractor（無料ユーザー）が補償オプション購入を試みる → エラー「補償オプションは有料プランご加入のお客様のみ...」
  - active な client が購入を試みる → 成功（Stripe Checkout URL が返される）
  - past_due の client が購入を試みる → 成功（past_due でも基本プラン契約は存在するため）
  - cancelled のみの ex-client が購入を試みる → エラー（active/past_due の subscription なし）
  - staff が購入を試みる → エラー（既存の staff 拒否）
  - _Requirements: 4.1_

- [x] 13.12 (P) 補償オプション連鎖キャンセルのテスト
  - **基本プラン解約 → 連鎖キャンセル発動**:
    - 法人プラン active + 補償 ¥9,800 active のユーザーで `customer.subscription.deleted`（基本プラン）を受信
    - handle_subscription_lifecycle_deleted RPC 完了後、TypeScript 側で同ユーザーの active な option_subscriptions が SELECT され、`stripe.subscriptions.cancel()` が呼ばれることを確認
    - 複数の補償オプション（実際には排他で1つのみだが、テストでは強制的に複数存在させる）でも全て cancel されることを確認
  - **option_subscriptions ヒット時のメール送信なし**:
    - 補償オプションのみの解約（subscriptions ヒットせず option_subscriptions ヒット）で `subscriptionCancelledEmail` が送信されないことを確認
  - _Requirements: 3.3, 4.1_

- [x] 13.13 (P) subscriptionChangedEmail の送信判定テスト（Gap 4）
  - **(a) アップグレード**: 変更前 plan_type='individual' → 変更後 'small' → メール送信される（適用開始日 = 即時）
  - **(b) ダウングレード予約**: 変更前 schedule_id=null → 変更後非 null → メール送信される（適用開始日 = scheduled_at）
  - **(c) 解約予約**: 変更前 cancel_at_period_end=false → 変更後 true → メール送信される
  - **(d) 予約取消**: 変更前 schedule_id 非 null → 変更後 null → メール送信される
  - **(e) 関係ない更新**: current_period_end のみ変更 → メール送信されない
  - _Requirements: 3.3, 9.1_

- [x] 13.14 (P) 組織名空文字フォールバック（暫定 UI 離脱時の二重防御）のテスト
  - **目的**: 法人プラン購入後に Task 8.7 の組織名入力暫定画面でユーザーが入力を離脱した場合（`organizations.name=''` のまま）でも、メッセージ画面で受注者側に空文字でなく姓名が表示されることを保証する
  - messaging 機能の `resolveParticipantName()` の挙動を Vitest で検証する:
    - `organizations.name=''` AND `users.company_name='株式会社XXX'` → 「株式会社XXX」を返す
    - `organizations.name=''` AND `users.company_name=null` AND `last_name='山田' first_name='太郎'` → 「山田太郎」を返す（スペースなし結合）
    - `organizations.name='ビジ友建設'` → 「ビジ友建設」を返す（暫定 UI で入力済みのケース）
  - これにより、暫定 UI を離脱したユーザーのメッセージスレッドでも受注者側で空欄表示にならない二重防御を保証
  - _Requirements: 2.2_

- [x] 13.15 (P) saveOrganizationNameAction のユニットテスト
  - 認証なし → エラー
  - staff ロール → エラー（client 以外は拒否）
  - contractor ロール → エラー
  - 空文字（trim 後 0 文字）→ Zod バリデーションエラー
  - 101 文字 → Zod バリデーションエラー
  - 1 文字（境界値）→ 成功
  - 100 文字（境界値）→ 成功
  - 成功時に `organizations.name` が更新され `audit_logs` に `organization_name_set` が記録される
  - 成功後 `/mypage?setup_completed=true` にリダイレクトされる
  - _Requirements: 2.2_

- [x] 14. RLS テスト（pgTAP）の追加
- [x] 14.1 PL/pgSQL 関数の権限テスト
  - 6 本の SECURITY DEFINER 関数（`handle_checkout_completed_plan` / `handle_subscription_lifecycle_updated` / `handle_subscription_lifecycle_deleted` / `get_or_lock_stripe_customer` / `set_stripe_customer_id` / `ensure_organization_exists`）が `anon` / `authenticated` ロールから呼び出せず `permission denied` になることを確認
  - `service_role` ロールから呼び出した場合に正常実行されることを確認
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 14.2 handle_checkout_completed_plan の各種パターンとロールバックテスト
  - 初回購入（subscriptions 0 件）→ 1 件 INSERT + users.role='client' に更新 + client_profiles 作成 + 法人プランなら organizations + organization_members 作成
  - 再購入（cancelled レコードあり）→ 新規 INSERT 成功
  - 二重防御発動（既存 active あり）→ 関数が例外を投げて全テーブルの更新がロールバックされる
  - 法人プラン既存組織あり → ensure_organization_exists 経由で再利用、organization は新規作成されない
  - 関数中盤で意図的に失敗させ（例: 不正な metadata.plan_type）、subscriptions / users.role / client_profiles のいずれも更新されていないことを確認
  - pgTAP テスト用 UUID は seed.sql と重複しないものを使う
  - _Requirements: 3.2_

- [x] 14.3 handle_subscription_lifecycle_updated / deleted の原子性テスト
  - `handle_subscription_lifecycle_updated`: 予約情報カラム更新の途中で意図的に失敗させ（例: `ensure_organization_exists` 内で強制エラー）、subscriptions の更新もロールバックされていることを確認
  - `handle_subscription_lifecycle_deleted`: users.role ダウングレード後に staff の is_active 更新を失敗させ、subscriptions.status='cancelled' 更新もロールバックされていることを確認
  - _Requirements: 3.3_

- [x] 14.4 set_stripe_customer_id の先勝ち制御テスト
  - 並行 UPDATE のうち 1 つだけが影響行数 1 を返し、もう一方が 0 を返すことを確認
  - 既存値が NULL でない場合は誰の UPDATE も成功しないことを確認
  - _Requirements: 2.1_

- [x] 14.5 (P) subscriptions / option_subscriptions / stripe_webhook_events の RLS 確認
  - 一般ユーザー（contractor / client / staff）からの SELECT が自分のレコードのみに制限されること
  - 一般ユーザーからの INSERT / UPDATE / DELETE がすべて拒否されること
  - service_role キーでの読み書きが成功すること
  - _Requirements: 1.1, 4.1_

- [x] 15. E2E テスト（Playwright）の作成
- [x] 15.1 CLI-026 表示パターンの E2E テスト
  - Stripe Checkout 画面はテスト対象外。CLI-026 の表示と Server Action 呼び出しに集中する
  - 5 ユーザー × 表示パターン: 未課金 contractor / active 個人 client / active 法人 owner / past_due / staff
  - 「申し込む」ボタン押下で startCheckoutAction が呼ばれて Stripe Checkout の URL にリダイレクトされること（リダイレクト先で停止）
  - success_url 戻り後のトースト表示を `?checkout=success` を直接付与してテスト
  - past_due 状態のユーザーで PastDueBanner が表示されること
  - staff ユーザーで全ボタンが非活性であること
  - ダウングレード予約状態のユーザーで「変更をキャンセルする」ボタンが表示されること
  - Customer Portal ボタン押下時に外部 URL にリダイレクトされること
  - _Requirements: 1.1, 6.1, 7.1, 5.2, 5.3_

- [x] 15.2 (P) ダウングレード予約フローの E2E テスト
  - active 法人 owner で CLI-026 → 個人発注者様向けプランに「このプランに変更する」→ 前提条件チェック失敗（掲載中案件超過）→ エラー表示
  - 前提条件を満たした状態で再実行 → 確認ダイアログ → 予約成功 → 「{日付}に個人発注者様向けプランに変更予定」ラベル表示
  - **予約あり状態で他プラン（法人向けプラン（高サポート））の「このプランに変更する」ボタンが非活性** + ツールチップ「予約をキャンセルしてから操作してください」が表示されること（Gap 1 対応）
  - 「変更をキャンセルする」→ 確認ダイアログ → 取り消し成功 → トースト「ダウングレード予約を取り消しました」
  - 取り消し後、他プランの「このプランに変更する」ボタンが活性に戻ること
  - _Requirements: 5.2_

- [x] 15.3 (P) past_due 即時解約フローの E2E テスト
  - past_due ユーザーで CLI-026 → 解約ボタンが警告アイコン付きの即時解約ダイアログを表示
  - 「解約する」→ 即時解約成功 → CON-001 に遷移
  - past_due ユーザーでアップグレード/ダウングレードボタンが非活性であること
  - _Requirements: 5.3, 6.1_

- [x] 15.4 (P) オプション購入フローの E2E テスト
  - 急募オプション: active な法人 owner で CLI-026 → 案件選択プルダウン → 「申し込む」→ Checkout URL にリダイレクト
  - 案件 0 件の場合に「掲載中の案件がありません」表示と申込ボタン非活性
  - 補償オプション排他: 既に補償加入中のユーザーで別の補償ボタンが非活性
  - 補償オプション解約: 「解約する」→ 確認ダイアログ → 解約成功
  - _Requirements: 4.1_

- [x] 15.5 (P) 法人プラン購入 → 組織名入力暫定画面の E2E テスト
  - **⚠️ 移行予定**: 本シナリオ 1〜7 は `/mypage/organization-setup` 暫定画面の存在を前提としている。organization spec の CLI-021 実装完了時に、Task 8.6 の差替作業の一部として本 E2E テストを **CLI-021 `?setup=true` 版に書き直す**（`.kiro/specs/organization/requirements.md` 付録 A Step 5 参照）
  - **シナリオ 1**: 法人プラン購入フロー（テストカード `4242 4242 4242 4242`）→ Checkout 完了 → `/mypage/organization-setup` にリダイレクトされることを確認
  - **シナリオ 2**: 暫定画面で組織名「テスト株式会社」を入力 → 送信 → `organizations.name='テスト株式会社'` が DB に反映され、`/mypage?setup_completed=true` にリダイレクトされることを確認
  - **シナリオ 3**: 既に組織名入力済みのユーザー（seed: `organizations.name='ビジ友建設'`）が `/mypage/organization-setup` にアクセス → 即 `/mypage` にリダイレクトされることを確認（冪等性）
  - **シナリオ 4**: staff ロールが `/mypage/organization-setup` にアクセス → 即 `/mypage` にリダイレクトされることを確認
  - **シナリオ 5**: contractor ロールが `/mypage/organization-setup` にアクセス → 即 `/mypage` にリダイレクトされることを確認
  - **シナリオ 6（バリデーション）**: 暫定画面で空文字を送信 → エラー表示、画面遷移なし
  - **シナリオ 7（バリデーション）**: 暫定画面で 101 文字以上を送信 → エラー表示、画面遷移なし
  - _Requirements: 2.2_
  - **🛑 チェックポイント CP4（ユーザー承認必須・Task 16 は手動作業のためここで一旦終了）**
    - Task 15 系（15.1〜15.5）がすべて完了した時点でここに到達する
    - `npm run test:e2e` の結果（pass/fail 件数）をユーザーに報告する
    - Task 16（Stripe CLI を使ったローカル Webhook 統合動作確認）は手動作業が必要なため、Claude Code は着手せず、代わりに以下をユーザーに提示する:
      1. `supabase start` / `stripe listen --forward-to localhost:3000/api/webhooks/stripe` / `npm run dev` の 3 ターミナル起動手順
      2. `stripe listen` の出力から取得した `whsec_...` を `.env.local` にセットする手順
      3. 手動テスト項目のチェックリスト（個人プラン購入・法人プラン購入・subscription.deleted trigger・invoice.payment_failed trigger・急募オプション購入・補償オプション購入）
    - ユーザーが手動テストを実施し、結果を報告した後に Task 16 のチェックボックスを Claude Code が埋める
    - すべて完了したら、最終的に `npm run test` / `supabase test db` / `npm run test:e2e` を再実行してデグレなしを確認する

- [x] 16. 統合動作確認（Stripe CLI を使ったローカル Webhook 検証）
  - ターミナル1: `supabase start`
  - ターミナル2: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`（出力された `whsec_...` を `.env.local` に設定）
  - ターミナル3: `npm run dev`
  - 手動テスト:
    - テストカード `4242 4242 4242 4242` で個人プラン購入 → users.role が client に変わることを確認
    - 同様に法人プラン購入 → organizations + organization_members が自動作成され、CLI-021 (`?setup=true`) にリダイレクトされることを確認
    - `stripe trigger customer.subscription.deleted` → users.role が contractor に戻ることを確認
    - `stripe trigger invoice.payment_failed` → subscriptions.status が past_due に変わり PastDueBanner が表示されることを確認
    - 急募オプション購入 → 対象案件の jobs.is_urgent が true になり、option_subscriptions に1件追加されることを確認
    - 補償オプション購入 → client_profiles.is_compensation_5000 / 9800 が true に更新されることを確認
  - すべての手動テストが成功した後、`npm run test` / `supabase test db` / `npm run test:e2e` を再実行してデグレなしを確認する
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 3.3, 4.1, 5.1, 5.2, 5.3, 6.1, 7.1, 8.1, 8.2, 9.1_
