# 課金機能（billing）— 要件定義

## 概要

有料プランの案内・決済処理を提供する機能。Stripe Billing と連携し、
サブスクリプション課金を実装する。

## 対象画面

| 画面ID | 画面名 | 概要 |
|--------|--------|------|
| CLI-026 | 有料プラン案内 | プラン一覧・比較表示 |
| CLI-027 | 決済画面 | Stripe Checkout |

## 対象ロール

- 受注者（Contractor / 無料）: プラン案内の閲覧、課金申し込み
- 発注者（Client）: プラン変更、解約

## 機能要件

### REQ-BL-001: 有料プラン案内（CLI-026）

- 全プランの一覧と比較表を表示する
- 表示項目（プランごと）:
  - プラン名、月額料金
  - 機能比較表:
    - 職種（登録職種のみ / 無制限）
    - エリア（登録県 / 全域）
    - 新しい人へのメッセージ（5通/月 / 無制限）
    - 現場掲載（- / 1件/月 / 無制限）
    - 上位表示
    - 複数人利用（- / 10人 / 30人）
    - 代理メッセージ（- / 36通/年 / 300通/年）
- 現在のプランにハイライト表示（課金済みの場合）
- 各プランの「申し込む」ボタン → CLI-027 へ遷移
- 既に同一プランに加入中の場合: ボタン非活性
- プラン変更（アップグレード/ダウングレード）の場合: 変更内容の確認表示
- **初回事務手数料の制御**:
  - 通常ルート（`/plans`）: 初めて有料プランに申し込む場合、初回事務手数料 20,000円 が加算される
  - 無料ルート（`/plans?fee=free`）: 初回事務手数料が免除される
  - 画面上の注記テキストが切り替わる:
    - 通常: 「基本プランの有料プランへ初めて申し込みをした場合、初回事務手数料として20,000円が必要となります。」
    - 無料: 「この画面から基本プランに申し込んだ場合は、初回事務手数料の20,000円が不要となります。」
  - `fee=free` パラメータは暗号化セッション Cookie（iron-session 等）に保持する。クライアント側からは復号・改ざん不可。有効期限は24時間とし、期限切れの場合は通常ルート扱いにする。Stripe Checkout Session 作成時に Server Action 内でセッションを復号して参照する
  - 既に有料プラン加入済みの場合（プラン変更）: 初回事務手数料は発生しない（パラメータ無関係）
- **オプションプラン**:
  - 動画掲載: 100,000円/動画（ビジ友TikTokにユーザー紹介動画として掲載、管理者がADM-010で登録）
  - 急募: 20,000円（7日間、募集が最上位表示 + 急募タグ表示）
  - 補償 ¥5,000/月: 有事の際最大200万円の補償
  - 補償 ¥9,800/月: 有事の際最大500万円の補償
  - 各オプションの「申し込む」ボタン → Stripe Checkout へ遷移

### REQ-BL-002: 決済画面（CLI-027）

- Stripe Checkout Session を使用した決済処理
- フロー:
  1. Server Action で Stripe Checkout Session を作成
  2. Stripe のホスティングする決済ページにリダイレクト
  3. 決済成功: success_url にリダイレクト（CON-001 マイページ + 成功メッセージ）
  4. 決済キャンセル: cancel_url にリダイレクト（CLI-026 プラン案内）
- Stripe Checkout Session の設定:
  - **基本プラン・補償オプション（月額課金）**:
    - mode: 'subscription'
    - customer: users.stripe_customer_id（既存の場合）/ 新規作成
    - line_items: 選択されたプランの Stripe Price ID
    - success_url, cancel_url
  - **急募・動画掲載オプション（単発課金）**:
    - mode: 'payment'
    - customer: users.stripe_customer_id（既存の場合）/ 新規作成
    - line_items: 選択されたオプションの Stripe Price ID
    - metadata: `{ option_type: 'urgent' | 'video', user_id: '...', job_id: '...'（急募の場合） }`
    - success_url, cancel_url

### REQ-BL-003: Stripe Webhook 処理（バックエンド）

- API Route: `/api/webhooks/stripe` で Webhook を受信
- 署名検証（必須）: `stripe.webhooks.constructEvent` で検証
- べき等性の確保: stripe_webhook_events テーブルを使用して同一イベントの重複処理を防止する。具体的な手順:
  1. Webhook 受信時、`stripe_webhook_events` テーブルに `stripe_event_id` で SELECT を実行
  2. 既にレコードが存在し `status = 'completed'` の場合 → 200 を返して処理をスキップ（重複防止）
  3. レコードが存在しない場合 → `stripe_webhook_events` に INSERT（status = 'processing'）
  4. メインの Webhook 処理をトランザクション内で実行（service_role キーで Supabase に接続）
  5. 処理成功時 → `stripe_webhook_events.status` を 'completed' に更新、`processed_at` を設定
  6. 処理失敗時 → `stripe_webhook_events.status` を 'failed' に更新、`error_message` にエラー内容を記録
  7. ステップ 3 の INSERT が UNIQUE 制約違反（= 別リクエストが同時に処理中）の場合 → 409 を返して処理をスキップ

#### 処理すべきイベント:

| イベント | 処理内容 |
|---------|---------|
| checkout.session.completed（基本プラン） | subscriptions テーブルに新規レコード作成。users.role が 'contractor' の場合のみ 'client' に更新（既に 'staff' のユーザーは role を変更しない — 担当者は法人プランのオーナー経由で発注者機能を利用するため）。users.stripe_customer_id を設定。**client_profiles を UPSERT（存在しなければ INSERT、存在すれば何もしない）**。初期値: display_name = users.last_name + users.first_name。※ client_profiles の作成責務はこの Webhook が唯一の正規ルートとする（admin REQ-ADM-007 経由で作成された管理責任者も、課金完了時にこの Webhook で client_profiles が作成される） |
| checkout.session.completed（単発オプション） | metadata の option_type で判別。option_subscriptions テーブルに INSERT（payment_type = 'one_time'）。急募の場合: end_date = NOW() + 7日、client_profiles.is_urgent_option = true、対象案件の jobs.is_urgent = true に更新。動画掲載の場合: end_date = NULL で INSERT |
| customer.subscription.updated | subscriptions テーブルの plan_type, status, 期間を更新。プランアップグレード/ダウングレードの反映 |
| customer.subscription.deleted | subscriptions.status を 'cancelled' に更新。users.role が 'client' の場合は 'contractor' にダウングレード。'staff'（担当者）の場合は users.is_active を false に設定してログインを停止する（roles-and-permissions.md の past_due 動作に準拠）。発注者専用データへのアクセスをロック |
| invoice.payment_failed | subscriptions.status を 'past_due' に更新。past_due_since に現在日時を設定。支払い失敗通知メール送信（Resend） |
| invoice.payment_succeeded（past_due 復帰時） | subscriptions.status を 'active' に更新。past_due_since を NULL にリセット。該当ユーザーが法人プランの owner の場合、organization_members 経由で配下の担当者（staff）の users.is_active を true に復帰させる（roles-and-permissions.md の past_due 動作に準拠）。復帰対象は同一組織の全 staff |

**支払い遅延時の猶予期間（7日間）:**
- past_due 状態になってから7日間は、ユーザーは引き続きサービスを利用可能（機能制限なし）
- 猶予期間中の表示: ログイン後の画面上部に「お支払いが確認できません。残りX日で自動解約されます」の警告バナーを表示する
- 残り日数の計算: `7 - EXTRACT(DAY FROM NOW() - past_due_since)` で算出
- 7日経過後: Edge Function（Supabase の定期実行処理）が自動解約を実行する（subscriptions.status → 'cancelled'、users.role → 'contractor' にダウングレード）
- 自動解約実行時に、解約完了通知メールを送信する

**Edge Function: auto-cancel-past-due（自動解約の定期実行）:**
- 関数名: `auto-cancel-past-due`
- スケジュール: 毎日 AM 3:00（JST）に cron で実行（`0 18 * * *` UTC = JST 03:00）
- 処理の流れ:
  1. subscriptions テーブルから `status = 'past_due'` かつ `past_due_since + 7日 < NOW()` のレコードを取得
  2. 該当する subscriptions.status を 'cancelled' に更新
  3. 該当ユーザーの users.role が 'client' の場合は 'contractor' にダウングレード（'staff' の場合はログイン不可にする）
  4. 掲載中の案件（jobs.status = 'open'）を 'closed' に変更（roles-and-permissions.md の past_due 動作に準拠）
  5. 担当者アカウント（organization_members 経由の staff）の users.is_active を false に設定してログインを停止する（owner が支払いを再開した場合は is_active を true に復帰させる）
  6. 対象ユーザーに解約完了通知メールを送信（Resend）
- Supabase Dashboard の「Database → Extensions → pg_cron」で cron ジョブを登録する

### REQ-BL-004: オプションプラン管理（バックエンド）

- オプションは Stripe の別商品として管理。課金方式により処理が異なる:

#### 単発課金オプション（急募・動画掲載）

- **急募（20,000円 / 7日間）**:
  - Stripe Checkout `mode: 'payment'` で決済
  - Webhook `checkout.session.completed` 受信時の処理:
    1. option_subscriptions テーブルに INSERT（payment_type = 'one_time'）
    2. start_date = NOW()、end_date = NOW() + 7日間
    3. status = 'active'
    4. client_profiles.is_urgent_option を true に更新
    5. 対象案件（metadata.job_id）の jobs.is_urgent を true に更新
  - 7日経過後: Edge Function `expire-options` が自動で期限切れ処理（後述）

- **動画掲載（100,000円 / 動画）**:
  - Stripe Checkout `mode: 'payment'` で決済
  - Webhook `checkout.session.completed` 受信時の処理:
    1. option_subscriptions テーブルに INSERT（payment_type = 'one_time'）
    2. start_date = NOW()、end_date = NULL（期限なし、解約まで有効）
    3. status = 'active'
  - 管理者が ADM-010 で TikTok 動画 URL を登録する（users.video_url を更新）

#### 月額課金オプション（補償）

- **補償 ¥5,000/月、補償 ¥9,800/月**:
  - Stripe Checkout `mode: 'subscription'` で決済
  - Webhook 処理は基本プランと同様（customer.subscription.updated / deleted で status を同期）
  - 解約時: client_profiles の該当フラグ（is_compensation_5000 / is_compensation_9800）を false に更新

#### Edge Function: expire-options（オプション自動期限切れ）

- 関数名: `expire-options`
- スケジュール: 毎日 AM 3:00（JST）に cron で実行（auto-cancel-past-due と同じタイミング）
- 処理の流れ:
  1. option_subscriptions テーブルから `status = 'active'` かつ `end_date IS NOT NULL` かつ `end_date < NOW()` のレコードを取得
  2. 該当レコードの status を 'expired' に更新
  3. option_type = 'urgent' の場合:
     a. client_profiles.is_urgent_option を false に更新（ただし、同じユーザーに他の active な急募オプションが残っている場合は true のまま）
     b. 対象案件の jobs.is_urgent を false に更新
  4. 処理件数をログ出力
- Supabase Dashboard の「Database → Extensions → pg_cron」で cron ジョブを登録する

#### Edge Function: close-expired-jobs（募集期限切れ案件の自動クローズ）

- 関数名: `close-expired-jobs`
- スケジュール: 毎日 AM 3:00（JST）に cron で実行（expire-options, auto-cancel-past-due と同じタイミング）
- 処理の流れ:
  1. jobs テーブルから `status = 'open'` かつ `recruit_end_date < CURRENT_DATE` のレコードを取得
  2. 該当レコードの status を 'closed' に更新
  3. 処理件数をログ出力
- Supabase Dashboard の「Database → Extensions → pg_cron」で cron ジョブを登録する
- **注意**: この処理は案件の募集期間が自然に終了した場合の自動クローズ。支払い遅延による強制クローズ（auto-cancel-past-due）とは別の処理

### REQ-BL-005: プラン変更

- **past_due（支払い遅延）中のプラン変更は禁止**:
  - CLI-026（プラン案内画面）でプラン変更ボタンを非活性にする
  - 表示メッセージ:「お支払いが未完了のため、プラン変更はできません。お支払いを完了してからプラン変更をお願いいたします。」
  - Server Action でも past_due 状態チェックを実施（フロントエンドのバイパス対策）
- アップグレード: Stripe の `subscription.update` で即時反映
- ダウングレード: 現在の課金期間終了時に反映（Stripe の proration 設定）
- 解約: Stripe の `subscription.cancel` で課金期間終了時にキャンセル
  - 解約後: users.role が 'contractor' に戻り、発注者機能がロック
  - 解約完了通知メール送信

## 非機能要件

### セキュリティ

- Stripe Webhook の署名検証は必須（偽造防止）
- カード情報はサーバー・DBに一切保存しない（Stripe が管理）
- Stripe Customer ID のみ DB に保持
- Webhook の API Route はサービスロールキーで Supabase に接続
- 課金ステータスの確認は RLS ポリシーで実施

### データ整合性

- Webhook 処理はトランザクション内で実行
- role 変更と subscriptions 更新は同一トランザクション
- 二重課金防止: 既存のアクティブなサブスクリプションがある場合、新規作成を拒否

### 通知メール

- 支払い失敗通知: invoice.payment_failed 時
- プラン変更確認: subscription.updated 時
- 解約完了通知: subscription.deleted 時
- メール送信失敗で本体処理をロールバックしない（security.md の「メール送信失敗時の共通方針」に準拠）

## 画面遷移

```
CON-001（マイページ）→ CLI-026（プラン案内）→ CLI-027（Stripe Checkout）
                                              → CON-001（成功）
                                              → CLI-026（キャンセル）
```

## 関連テーブル

- users: role 更新、stripe_customer_id
- subscriptions: サブスクリプション管理（CRUD）
- option_subscriptions: オプション契約管理
- client_profiles: 発注者プロフィール作成、オプションフラグ更新
- audit_logs: ロール変更ログ

## 関連 steering

- database-schema.md: subscriptions, option_subscriptions, client_profiles テーブル
- authentication.md: ロールエスカレーション防止、Stripe 連携のセキュリティ
- security.md: 決済情報の取り扱い
- product.md: プラン一覧、機能制限
- tech.md: Stripe Webhook 処理パターン

## 未確認事項

なし
