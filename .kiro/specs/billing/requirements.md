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
  - 通常ルート（`/billing`）: 初めて有料プランに申し込む場合、初回事務手数料 20,000円 が加算される
  - 無料ルート（`/billing?fee=free`）: 初回事務手数料が免除される
  - 画面上の注記テキストが切り替わる:
    - 通常: 「基本プランの有料プランへ初めて申し込みをした場合、初回事務手数料として20,000円が必要となります。」
    - 無料: 「この画面から基本プランに申し込んだ場合は、初回事務手数料の20,000円が不要となります。」
  - 既に有料プラン加入済みの場合（プラン変更）: 初回事務手数料は発生しない（パラメータ無関係）
  - **初回事務手数料の Stripe 実装**: Checkout Session の `line_items` に one-time Price（¥20,000）を recurring Price と並べて追加する。ユーザーの決済画面に「月額 ¥X,XXX」と「初期費用 ¥20,000」が2行で表示される。fee=free の場合やプラン変更の場合は line_items から初期費用の行を除外する
  - **初回判定ロジック**: `subscriptions` テーブルに該当ユーザーのレコード（status が active / past_due / cancelled いずれか）が1件でも存在すれば初回ではない → 初期費用なし。レコードが0件なら初回 → 初期費用あり（fee=free Cookie がある場合は除外）
  - **fee=free の暗号化セッション（iron-session）**:
    - ライブラリ: `iron-session`（npm install iron-session）
    - Cookie 名: `bijiyu_fee`
    - 保存データ: `{ feeExempt: boolean, expiresAt: number }`（expiresAt は Unix タイムスタンプ）
    - Cookie オプション: httpOnly, secure（本番のみ）, sameSite: 'lax', maxAge: 24時間
    - 暗号化キー: 環境変数 `SESSION_SECRET`（32文字以上のランダム文字列）
    - Cookie のセットはミドルウェアで行う（`/billing` へのアクセス時に `fee=free` パラメータを検出したらセット）。これにより、未ログインユーザーがログイン画面にリダイレクトされる前に Cookie が保存される
  - **fee=free ユーザーの画面遷移（Phase 1）**:
    - 想定シーン: 運営が対面や LINE 等で `/billing?fee=free` のURLをユーザーに渡す
    - ログイン済みユーザー: `/billing?fee=free` → ミドルウェアで Cookie セット → CLI-026 表示（初期費用なし）
    - 未ログイン（アカウントあり）: `/billing?fee=free` → Cookie セット → `/login` にリダイレクト → ログイン → `/mypage` → 「プラン変更」をタップ → `/billing`（Cookie が残っているので初期費用なし）
    - 未登録（アカウントなし）: `/billing?fee=free` → Cookie セット → `/login` にリダイレクト → 新規登録フロー → `/mypage` → 「プラン変更」をタップ → `/billing`（Cookie が残っているので初期費用なし）
    - ※ ログイン/登録完了後の `/billing` への自動リダイレクトは Phase 1 では実装しない。ユーザーはマイページの「プラン変更」から自力で遷移する（Cookie は24時間有効なので十分な猶予がある）
- **CLI-026 のボタン状態**:
  - 未課金ユーザー（contractor）: 各プランに「申し込む」ボタン
  - 課金済みユーザー（現在のプラン）: 「ご利用中」バッジ（非活性）
  - 課金済みユーザー（他のプラン）: 「このプランに変更する」ボタン
  - 課金済みユーザー（解約したい場合）: 現在のプランに「解約する」ボタン
  - cancelled / subscription なしのユーザー: 無料プランに「ご利用中」バッジ
  - past_due 中: アップグレード・ダウングレードボタン非活性 + 警告メッセージ。**解約ボタンのみ有効**（即時解約、REQ-BL-005 参照）
  - past_due 中（現在のプラン表示）: 「ご利用中」+「お支払い確認中」バッジ（黄色）
- **担当者（staff）のアクセス制限**:
  - 担当者がCLI-026にアクセスした場合、プラン一覧・オプション一覧は閲覧可能
  - すべての「申し込む」「変更する」「解約する」ボタンを非活性にする
  - メッセージ表示:「担当者アカウントではプランの変更はできません。組織の管理者にお問い合わせください。」
  - Server Action でも role='staff' の場合はエラーを返す（フロントエンドのバイパス対策）
- **オプションプラン**:
  - 動画掲載: 100,000円/動画（ビジ友TikTokにユーザー紹介動画として掲載、管理者がADM-010で登録）
  - 急募: 20,000円（7日間、募集が最上位表示 + 急募タグ表示）
  - 補償 ¥5,000/月: 有事の際最大200万円の補償
  - 補償 ¥9,800/月: 有事の際最大500万円の補償
  - 各オプションの「申し込む」ボタン → Stripe Checkout へ遷移
  - **急募オプションの案件選択**: 急募の「申し込む」ボタンの上に、対象案件を選ぶプルダウンを表示する
    - プルダウンの選択肢: 自分がオーナーの `status='open'`（掲載中）かつ `jobs.is_urgent = false`（急募未適用）の案件。表示形式:「{案件タイトル}」
    - 既に急募オプションが有効な案件（`option_subscriptions` に `option_type='urgent', status='active'` のレコードがある案件）は選択肢から除外する
    - 掲載中の案件が0件の場合: プルダウンの代わりに「掲載中の案件がありません」と表示し、申し込みボタンは非活性
    - 案件が未選択の場合: 申し込みボタンは非活性
    - 選択された案件の job_id を Stripe Checkout Session の metadata に渡す
  - **補償オプションの排他制御**: 補償オプションは同時に1つのみ加入可能（¥5,000 と ¥9,800 の併用不可）。補償オプション加入中は、別の補償オプションの「申し込む」ボタンを非活性にする。切り替えたい場合は先に現在の補償を解約してから申し込む
  - **補償オプションの解約**: active な補償オプションがある場合、該当オプションに「解約する」ボタンを表示する
    - 押下時に確認ダイアログ:「補償オプション（¥{金額}/月）を解約しますか？　解約すると補償が適用されなくなります。」
    - Server Action で `stripe.subscriptions.cancel()` を呼び出し、即時解約する
    - Webhook（customer.subscription.deleted）で option_subscriptions.status と client_profiles のフラグを更新する
  - **動画掲載オプションの解約**: 動画掲載は買い切り（one_time）のため、ユーザー側の解約UIは設けない。掲載停止が必要な場合は管理者が ADM-010 で対応する運用とする

### REQ-BL-002: 決済画面（CLI-027）

- Stripe Checkout Session を使用した決済処理
- フロー:
  1. Server Action で Stripe Checkout Session を作成
  2. Stripe のホスティングする決済ページにリダイレクト
  3. 決済成功: success_url にリダイレクト
     - **全プラン共通**: CLI-021（発注者情報編集）に `?setup=true` 付きでリダイレクト。`setup=true` の場合、CLI-021 の画面上部に「プラン登録が完了しました。発注者として利用する場合は、社名または氏名を入力してください。受注者機能のみ利用する方はスキップ可（後からいつでも編集できます）」のガイドバナーを表示する。`client_profiles.display_name` はメッセージ画面で受注者に表示される名前に直結する
     - **法人プラン（corporate / corporate_premium）**: 社名入力必須。スキップ不可（「スキップ」ボタン非表示）。保存完了後に CON-001 へ遷移
     - **個人・小規模プラン**: 社名・氏名入力は任意。「スキップして後で設定する」ボタンを表示し、押下時は CON-001 へ遷移。入力せずスキップした場合は、Webhook が `client_profiles` 作成時にデフォルト値として格納した `display_name`（= `users.last_name + first_name`、受注者登録時に入力した姓名）が受注者への表示名としてそのまま使われる
     - **Webhook 未着時の race condition 対策**: `?setup=true` の CLI-021 アクセスは認証済みユーザーに対して緩和したガードで許可する（`users.role` や `subscriptions.plan_type` の確定を待たない）。保存 Server Action は Webhook 完了を前提とするため、Webhook 未着時は「プラン情報を反映中です。数秒後にもう一度お試しください」のエラーを返す（通常 数秒以内に Webhook が届き解消される）
  4. 決済キャンセル: cancel_url にリダイレクト（CLI-026 プラン案内）
- **Stripe Customer の作成タイミング**: Checkout Session 作成時の Server Action で、users.stripe_customer_id が null の場合は `stripe.customers.create()` で Stripe Customer を新規作成し、users.stripe_customer_id に保存する。以降の Checkout Session 作成では既存の Customer ID を使い回す。Webhook（checkout.session.completed）でも stripe_customer_id が未設定の場合は Session オブジェクトの customer から取得して保存する（二重防御）
- **オプション購入の success_url / cancel_url**:
  - 急募: success_url = CLI-026（プラン案内）+ `?option_success=urgent`（トースト:「急募オプションを購入しました」）
  - 補償: success_url = CLI-026 + `?option_success=compensation`（トースト:「補償オプションに加入しました」）
  - 動画掲載: success_url = CLI-026 + `?option_success=video`（トースト:「動画掲載オプションを購入しました」）
  - cancel_url: いずれも CLI-026（プラン案内画面に戻る）
- **二重課金防止の実装箇所**:
  1. Server Action（Checkout Session 作成時）: subscriptions テーブルに status IN ('active', 'past_due') のレコードがある場合、新規プランの Checkout Session は mode='subscription' ではなく既存サブスクリプションの update で処理する（プラン変更フロー）
  2. Webhook（checkout.session.completed）: subscriptions に status IN ('active', 'past_due') が既に存在する場合は新規 INSERT せず、既存レコードを UPDATE する（Checkout Session と Webhook の間で別の購入が完了した場合の防御）
- Stripe Checkout Session の設定:
  - **基本プラン（月額課金）**:
    - mode: 'subscription'
    - customer: users.stripe_customer_id（既存の場合）/ 新規作成
    - line_items: 選択されたプランの Stripe Price ID（recurring）。初回かつ fee=free でない場合は、初期費用の Price ID（one-time, ¥20,000）も追加する
    - metadata: `{ type: 'plan', plan_type: 'individual' | 'small' | 'corporate' | 'corporate_premium', user_id: '...' }`
    - success_url, cancel_url
  - **補償オプション（月額課金）**:
    - mode: 'subscription'
    - customer: users.stripe_customer_id（既存の場合）/ 新規作成
    - line_items: 選択された補償プランの Stripe Price ID（recurring）
    - metadata: `{ type: 'option', option_type: 'compensation_5000' | 'compensation_9800', user_id: '...' }`
    - success_url, cancel_url
  - **急募・動画掲載オプション（単発課金）**:
    - mode: 'payment'
    - customer: users.stripe_customer_id（既存の場合）/ 新規作成
    - line_items: 選択されたオプションの Stripe Price ID
    - metadata: `{ type: 'option', option_type: 'urgent' | 'video', user_id: '...', job_id: '...'（急募の場合） }`
    - success_url, cancel_url

### REQ-BL-003: Stripe Webhook 処理（バックエンド）

- API Route: `/api/webhooks/stripe` で Webhook を受信
- **runtime 指定**: `export const runtime = 'nodejs'` を明示（Edge Runtime では Stripe SDK が動作しない）
- **署名検証（必須）**: `request.text()` で raw body を取得し、`stripe.webhooks.constructEvent(body, sig, secret)` で検証する。`request.json()` を使うと body が消費され署名検証が失敗するため禁止
- **Supabase クライアント**: service_role キーで初期化した管理者クライアント（`src/lib/supabase/admin.ts`）を使用。RLS をバイパスして他ユーザーのデータを更新する
- べき等性の確保: stripe_webhook_events テーブルを使用して同一イベントの重複処理を防止する。具体的な手順:
  1. Webhook 受信時、`stripe_webhook_events` テーブルに `stripe_event_id` で SELECT を実行
  2. 既にレコードが存在し `status = 'completed'` の場合 → 200 を返して処理をスキップ（重複防止）
  3. レコードが存在しない場合 → `stripe_webhook_events` に INSERT（status = 'processing'）
  4. メインの Webhook 処理をトランザクション内で実行（service_role キーで Supabase に接続）
  5. 処理成功時 → `stripe_webhook_events.status` を 'completed' に更新、`processed_at` を設定
  6. 処理失敗時 → `stripe_webhook_events.status` を 'failed' に更新、`error_message` にエラー内容を記録
  7. ステップ 3 の INSERT が UNIQUE 制約違反（= 別リクエストが同時に処理中）の場合 → **200 を返して処理をスキップ**（409 を返すと Stripe がリトライを繰り返すため、必ず 2xx で応答する）

#### 処理すべきイベント:

| イベント | 処理内容 |
|---------|---------|
| checkout.session.completed（基本プラン） | **metadata.type = 'plan' で判別**。metadata.plan_type で subscriptions.plan_type を決定。subscriptions テーブルに新規レコード作成。users.role が 'contractor' の場合のみ 'client' に更新（既に 'staff' のユーザーは role を変更しない — 担当者は法人プランのオーナー経由で発注者機能を利用するため）。users.stripe_customer_id を設定。**client_profiles を UPSERT（存在しなければ INSERT、存在すれば何もしない）**。初期値: display_name = users.last_name + users.first_name。※ client_profiles の作成責務はこの Webhook が唯一の正規ルートとする（admin REQ-ADM-007 経由で作成された管理責任者も、課金完了時にこの Webhook で client_profiles が作成される。管理者が作成したユーザーも role='contractor' で作成され、通常の課金フローを通す）。**法人プラン（corporate / corporate_premium）の場合: organizations テーブルにレコードが存在しなければ自動作成（`owner_id` のみ設定、organization spec 実装時に `name` カラムは廃止される）し、organization_members に購入者を org_role='owner' で追加する** |
| checkout.session.completed（補償オプション） | **metadata.type = 'option' かつ option_type が compensation_5000 / compensation_9800 で判別**。option_subscriptions テーブルに INSERT（payment_type = 'subscription', stripe_subscription_id を設定）。client_profiles の該当フラグ（is_compensation_5000 / is_compensation_9800）を true に更新 |
| checkout.session.completed（単発オプション） | **metadata.type = 'option' かつ option_type が urgent / video で判別**。option_subscriptions テーブルに INSERT（payment_type = 'one_time'）。急募の場合: end_date = NOW() + 7日、client_profiles.is_urgent_option = true、対象案件の jobs.is_urgent = true に更新。動画掲載の場合: end_date = NULL で INSERT |
| customer.subscription.updated | **stripe_subscription_id で subscriptions テーブルを検索**。見つかった場合: plan_type, status, 期間を更新（プランアップグレード/ダウングレードの反映）。**plan_type が corporate / corporate_premium に変更された場合: organizations テーブルにレコードが存在しなければ自動作成（checkout.session.completed の法人プラン処理と同じロジック。共通関数 `ensureOrganizationExists(userId)` として切り出す）。organization_members に該当ユーザーを org_role='owner' で追加する**。**見つからない場合: option_subscriptions テーブルを stripe_subscription_id で検索し、補償オプションの status を更新**。**どちらにも見つからない場合: 200 を返して処理をスキップ**（checkout.session.completed が後から届くケースに対応。Stripe はイベントの到着順序を保証しないため） |
| customer.subscription.deleted | **stripe_subscription_id で subscriptions / option_subscriptions を検索**。subscriptions の場合: status を 'cancelled' に更新。users.role が 'client' の場合は 'contractor' にダウングレード。'staff'（担当者）の場合は users.is_active を false に設定してログインを停止する（roles-and-permissions.md の past_due 動作に準拠）。掲載中の案件（jobs.status = 'open'）を 'closed' に変更。**法人プランの場合: 組織配下の Admin / Staff 両方（`org_role IN ('admin', 'staff')`）の users.is_active を false に設定**（2026-04-19 改訂: 旧版は staff のみだったが、Admin も Owner の契約に連動するため対象に含める）。option_subscriptions の場合: status を 'cancelled' に更新し、client_profiles の該当フラグを false に更新。**見つからない場合: 200 を返して処理をスキップ** |
| customer.subscription.created | **新規サブスクリプション作成時**。`stripe_subscription_id` で subscriptions テーブルを検索し、未登録なら INSERT。法人プラン（corporate / corporate_premium）で既存組織が見つかる（`organizations.owner_id = user_id`）場合: 同一組織の **Admin / Staff 両方**（`org_role IN ('admin', 'staff')`）の users.is_active を true に復帰（再アップグレード時の冷凍解除、organization spec REQ-ORG-006-B J1 と整合。past_due → active 復帰と同じ `reactivateCorporateMembers()` 関数を共通利用。`org_role = 'staff'` のみの絞り込みは不可、Admin も含める必要あり） |
| invoice.payment_failed | subscriptions.status を 'past_due' に更新。**past_due_since が NULL の場合のみ**現在日時を設定（既に past_due の場合は上書きしない）。支払い失敗通知メール送信（Resend） |
| invoice.payment_succeeded（past_due 復帰時） | subscriptions.status を 'active' に更新。past_due_since を NULL にリセット。該当ユーザーが法人プランの owner の場合、organization_members 経由で配下の **Admin / Staff 両方**（`org_role IN ('admin', 'staff')`）の users.is_active を true に復帰させる（roles-and-permissions.md の past_due 動作に準拠。2026-04-19 改訂: 旧版は staff のみだったが、Admin も契約に連動するため対象に含める）。復帰対象は同一組織の全 Admin / Staff |

- **audit_logs への記録対象（billing 関連）**:
  - role 変更時（contractor → client、client → contractor）: action = 'role_changed', details に変更前後の role を記録
  - サブスクリプション作成時: action = 'subscription_created', details に plan_type
  - サブスクリプション変更時: action = 'subscription_updated', details に変更前後の plan_type
  - サブスクリプション解約時: action = 'subscription_cancelled'
  - 自動解約実行時: action = 'auto_cancelled_past_due'
  - actor_id: Webhook 経由の場合は null（システム操作）

**支払い遅延時の猶予期間（7日間）:**
- past_due 状態になってから7日間は、ユーザーは引き続きサービスを利用可能（機能制限なし）
- 猶予期間中の表示: ログイン後の画面上部に「お支払いが確認できません。残りX日で自動解約されます」の警告バナーを表示する
- 残り日数の計算: フロントエンド（TypeScript）で `Math.ceil(7 - (Date.now() - new Date(past_due_since).getTime()) / 86_400_000)` で算出。0以下の場合は「まもなく自動解約されます」と表示
- 7日経過後: Edge Function（Supabase の定期実行処理）が自動解約を実行する（subscriptions.status → 'cancelled'、users.role → 'contractor' にダウングレード）
- 自動解約実行時に、解約完了通知メールを送信する

**Edge Function: auto-cancel-past-due（自動解約の定期実行）:**
- 関数名: `auto-cancel-past-due`
- スケジュール: 毎日 AM 3:00（JST）に cron で実行（`0 18 * * *` UTC = JST 03:00）。3つの定期ジョブの中で最初に実行する
- 処理の流れ:
  1. subscriptions テーブルから `status = 'past_due'` かつ `past_due_since + 7日 < NOW()` のレコードを取得
  2. 該当する subscriptions.status を 'cancelled' に更新
  3. 該当ユーザーの users.role が 'client' の場合は 'contractor' にダウングレード（'staff' の場合はログイン不可にする）
  4. 掲載中の案件（jobs.status = 'open'）を 'closed' に変更（roles-and-permissions.md の past_due 動作に準拠）
  5. 組織メンバー（organization_members 経由の **Admin / Staff 両方**、`org_role IN ('admin', 'staff')`）の users.is_active を false に設定してログインを停止する（owner が支払いを再開した場合は is_active を true に復帰させる。2026-04-19 改訂: 旧版は staff のみだったが、Admin も契約に連動するため対象に含める）
  6. 対象ユーザーに解約完了通知メールを送信（Resend）
- Supabase Dashboard の「Database → Extensions → pg_cron」で cron ジョブを登録する
- **Webhook リトライ方針**: Stripe の自動リトライ（本番: 最大16回・約3日間の指数バックオフ、テスト: 3回・数時間）に委任する。アプリ側で独自のリトライ機構は実装しない。Webhook ハンドラーは 2xx を素早く返すこと（20秒以内）。処理しないイベントタイプも 200 で応答する。3日経過後に失敗が残った場合は Stripe Dashboard から手動で Resend 可能

### REQ-BL-004: オプションプラン管理（バックエンド）

- オプションは Stripe の別商品として管理。課金方式により処理が異なる:

#### 単発課金オプション（急募・動画掲載）

- **急募（20,000円 / 7日間）**:
  - Stripe Checkout `mode: 'payment'` で決済
  - **重複購入制限**: 同一案件に対して同時に複数の急募オプションは購入不可。ただし期限切れ（`status='expired'`）後の再購入は可能。Server Action で `option_subscriptions` テーブルに `(job_id, option_type='urgent', status='active')` の存在チェックを行い、active が既に存在する場合はエラーを返す
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
  - **保存先: `option_subscriptions` テーブル**（`payment_type = 'subscription'`）。基本プラン（`subscriptions` テーブル）とは別管理。基本プランは1人1つの UNIQUE 制約があるため、補償オプションは option_subscriptions に格納する
  - Webhook で `checkout.session.completed` 受信時: option_subscriptions に INSERT（metadata.option_type で判別）。client_profiles の該当フラグを true に更新
  - Webhook で `customer.subscription.updated` / `deleted` 受信時: stripe_subscription_id で option_subscriptions を検索し、status を同期
  - 解約時: client_profiles の該当フラグ（is_compensation_5000 / is_compensation_9800）を false に更新

#### Edge Function: expire-options（オプション自動期限切れ）

- 関数名: `expire-options`
- スケジュール: 毎日 AM 3:05（JST）に cron で実行（`5 18 * * *` UTC = JST 03:05）。auto-cancel-past-due の5分後に実行
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
- スケジュール: 毎日 AM 3:10（JST）に cron で実行（`10 18 * * *` UTC = JST 03:10）。expire-options の5分後に実行
- 処理の流れ:
  1. jobs テーブルから `status = 'open'` かつ `recruit_end_date < CURRENT_DATE` のレコードを取得
  2. 該当レコードの status を 'closed' に更新
  3. 処理件数をログ出力
- Supabase Dashboard の「Database → Extensions → pg_cron」で cron ジョブを登録する
- **注意**: この処理は案件の募集期間が自然に終了した場合の自動クローズ。支払い遅延による強制クローズ（auto-cancel-past-due）とは別の処理

### REQ-BL-005: プラン変更

#### アップグレード（下位プラン → 上位プラン）
- Stripe の `subscription.update()` で即時反映
- `proration_behavior: 'create_prorations'` を指定し、残りの期間分を日割り差額精算して即時課金する
- 例: 個人発注者様向けプラン（¥3,800/月）→ 法人向けプラン（¥48,000/月）を月の半ばに変更した場合、残り期間分の差額が即時課金される
- Stripe Subscription ID は変わらない（同一 subscription の Price を入れ替える）
- **法人プラン（corporate / corporate_premium）へのアップグレード時**: organizations テーブルにレコードが存在しなければ、Webhook（customer.subscription.updated）で自動作成する（REQ-BL-003 の checkout.session.completed と同じロジック）

#### ダウングレード（上位プラン → 下位プラン）
- 現在の請求期間終了時に反映。`proration_behavior: 'none'`（日割り返金なし）を指定
- Stripe の `subscription.update()` で新しい Price を設定し、次回請求日から適用される
- **ダウングレードの Stripe 実装**: `stripe.subscriptions.update(id, { items: [{ id: itemId, price: newPriceId }], proration_behavior: 'none', billing_cycle_anchor: 'unchanged' })` を使用する。ただし、Stripe のデフォルト動作では Price 変更は即時反映される。「次回請求日から適用」を実現するには **Subscription Schedule** を使う方法がある: `stripe.subscriptionSchedules.create({ from_subscription: subscriptionId })` で Schedule に変換後、`phases` で次回請求日からの Price 変更を予約する。※ 実装時に Stripe のドキュメントで最新の推奨パターンを確認すること
- 請求期間終了日までは現在のプランの全機能が利用可能
- **ダウングレード前提条件チェック**（Server Action で検証。条件を満たさない場合はエラーメッセージを表示してブロック）:
  - プランごとの上限値は `src/lib/constants/plans.ts` の `PLAN_LIMITS` 定数で管理する:
    ```typescript
    const PLAN_LIMITS = {
      free:               { maxOpenJobs: 0,        maxStaff: 0,  hasProxy: false },
      individual:         { maxOpenJobs: 1,        maxStaff: 0,  hasProxy: false },
      small:              { maxOpenJobs: Infinity,  maxStaff: 0,  hasProxy: false },
      corporate:          { maxOpenJobs: Infinity,  maxStaff: 10, hasProxy: true  },
      corporate_premium:  { maxOpenJobs: Infinity,  maxStaff: 30, hasProxy: true  },
    };
    ```
  - **チェック1: 掲載中案件数** — `jobs` テーブルで `status='open'` の件数がダウングレード先の `maxOpenJobs` 以下であること
    - エラー:「掲載中の案件を{上限}件以下にしてからプラン変更してください（現在{N}件）」
    - 解約時は0件が条件
  - **チェック2: 未返信の応募** — `applications` テーブルで自分の案件に対する `status='applied'`（未対応）の応募が0件であること
    - エラー:「未対応の応募があります。すべて対応してからプラン変更してください」
  - **チェック3: 担当者数** — `organization_members` の件数（owner 除く）がダウングレード先の `maxStaff` 以下であること。代理アカウント（`is_proxy_account=true`）も担当者数に含む
    - エラー:「担当者を{上限}人以下にしてからプラン変更してください（現在{N}人）」
    - 解約時・個人/小規模へのダウングレード時は0人が条件
  - ※ 発注済み（status='accepted'）の応募はブロック対象外。進行中の案件のメッセージスレッドは解約後も利用可能（メッセージ送信は無料プランの月5スレッド制限が適用される）
  - ※ 組織データ（`organizations` テーブル）はダウングレード・解約時も削除しない（再アップグレード時に再利用）
- **確認ダイアログ**:
  ```
  プラン変更の確認
  現在のプラン: 法人向けプラン（¥48,000/月）
  変更後のプラン: 個人発注者様向けプラン（¥3,800/月）
  ・{current_period_end の日付}まで現在のプランをご利用いただけます
  ・{current_period_end の翌日}から個人発注者様向けプランに切り替わり、¥3,800が課金されます
  ・プラン変更は{current_period_end の日付}までキャンセルできます
  [キャンセルする]  [プラン変更を予約する]
  ```
- ダウングレード予約後、CLI-026 の現在プランに「{日付}に{新プラン名}に変更予定」のラベルを表示
- ユーザーは請求期間終了日まで予約をキャンセル可能（Stripe の `subscription.update()` で元の Price に戻す）
- **予約キャンセル UI**: ダウングレード予約中の場合、現在のプランカード内に「{日付}に{新プラン名}に変更予定」ラベルと「変更をキャンセルする」ボタン（`variant="outline"`）を表示する。ボタン押下時の確認ダイアログ:「プラン変更の予約をキャンセルし、現在のプラン（{プラン名}）を継続しますか？」→ Server Action で Stripe の subscription.update() を呼び出し、元の Price に戻す。予約状態の判定: Stripe API の subscription オブジェクトから `schedule` または Price の変更予約を確認する

#### 解約（有料プラン → 無料プラン）
- Stripe の `subscription.update({ cancel_at_period_end: true })` で請求期間終了時にキャンセル予約
- 請求期間終了日までは現在のプランの全機能が利用可能
- **解約前提条件チェック**: ダウングレードと同じ3つのチェックを `PLAN_LIMITS.free` の上限値で実行（掲載中案件0件、未返信応募0件、担当者0人）
- **確認ダイアログ**:
  ```
  解約の確認
  ・{current_period_end の日付}まで現在のプランをご利用いただけます
  ・{current_period_end の翌日}から無料プランに切り替わります
  ・案件掲載・職人検索・スカウトなどの発注者機能が使えなくなります
  ・解約は{current_period_end の日付}までキャンセルできます
  [キャンセルする]  [解約を予約する]
  ```
- 解約予約後、CLI-026 に「{日付}に解約予定」のラベルを表示
- ユーザーは請求期間終了日まで予約をキャンセル可能
- **解約予約キャンセル UI**: 解約予約中の場合、現在のプランカード内に「{日付}に解約予定」ラベルと「解約をキャンセルする」ボタン（`variant="outline"`）を表示する。ボタン押下時の確認ダイアログ:「解約の予約をキャンセルし、現在のプラン（{プラン名}）を継続しますか？」→ Server Action で Stripe の `subscription.update({ cancel_at_period_end: false })` を呼び出す
- 解約実行時（Webhook: customer.subscription.deleted）: users.role → 'contractor'、発注者機能ロック、解約完了通知メール送信
- **法人プラン完全解約時の Admin / Staff の扱い**（2026-04-19 追加決定）: 
  - `organization_members` レコードは**物理削除しない**（再アップグレード時の復帰を可能にするため、organization 仕様書 REQ-ORG-006-B と整合）
  - Admin / Staff の `users.role` は `'staff'` のまま**変更しない**（契約者は Owner のみのため、Admin/Staff は受動的な連鎖影響対象）
  - Admin / Staff の `users.is_active` を **`false` に設定**してログイン不可にする（past_due 時と同じ扱いの延長）
  - 再アップグレード時（Owner が再度課金）: Webhook `customer.subscription.created` ハンドラで同一組織の全 Admin / Staff の `is_active` を `true` に復帰（past_due → active 復帰と同じロジックを流用）
  - これにより「法人プラン契約者の Owner だけが降格（client → contractor）し、Admin / Staff はログイン不可状態で冷凍保存 → 復帰」のライフサイクルが一貫する
- **解約後の accepted 案件へのアクセス**: 解約して contractor に戻ったユーザーでも、自分がオーナーの accepted（発注済み）案件に対する完了報告・評価画面にはアクセス可能とする。Middleware の role チェックで例外を追加するのではなく、該当ページの Server Component で「案件オーナーかどうか」を判定し、role ではなく所有権でアクセスを制御する。全 accepted 案件が completed になった時点でアクセス不可となる

#### past_due（支払い遅延）中の操作制限
- **アップグレード: 不可**（支払い遅延中に上位プランへの変更は矛盾するため）
- **ダウングレード: 不可**（まず支払いを解消してから変更）
- **解約: 可能**（ユーザーの意思を尊重。ただし即時解約となる）
- **支払い方法の更新: 可能**（Stripe Customer Portal へのリンクは常に表示）
- CLI-026 でアップグレード・ダウングレードボタンを非活性にし、メッセージを表示:「お支払いが未完了のため、プラン変更はできません。お支払い方法を更新するか、解約をお選びください。」
- Server Action でも past_due 状態チェックを実施（フロントエンドのバイパス対策）
- **past_due 中の解約は即時実行**（請求期間末ではなく、即座に解約処理を行う）。前提条件チェック（掲載中案件・未返信応募）はスキップし、案件は強制クローズされる
- **past_due 即時解約の Stripe API**: `stripe.subscriptions.cancel(subscriptionId)` を使用（`cancel_at_period_end: true` ではなく即時キャンセル）。Webhook（customer.subscription.deleted）が即座にトリガーされ、通常の解約処理が実行される
- **past_due 解約の確認ダイアログ**:
  ```
  ⚠ お支払い確認中のため、解約すると以下の処理が即時実行されます：
  ・掲載中の案件はすべて募集終了になります
  ・担当者アカウントはすべてログインできなくなります
  ・発注者機能（案件掲載・職人検索・スカウト等）が使えなくなります
  ・発注済みの案件のメッセージは引き続き利用できます
  ※ お支払い方法を更新すれば、解約せずにプランを継続できます。
  [お支払い方法を更新する]  [解約する]
  ```

### REQ-BL-006: past_due 警告バナー

- subscriptions.status が 'past_due' のユーザーに対し、全画面共通でヘッダー直下に警告バナーを表示する
- レイアウト: ルートレイアウト（`layout.tsx`）の最上部に配置。全幅バナー
- バナー内容:
  - テキスト:「お支払いが確認できません。残り○日で自動解約されます。」
  - ボタン:「お支払い方法を更新する」→ Stripe Customer Portal にリダイレクト
  - 残り日数: フロントエンド（TypeScript）で `Math.ceil(7 - (Date.now() - new Date(past_due_since).getTime()) / 86_400_000)` で算出。0以下の場合は「まもなく自動解約されます」と表示
- デザイン（デザインカンプなし — 既存パターンに準拠）:
  - 残り4日以上: `bg-yellow-50 border-yellow-200 text-yellow-800`
  - 残り3日以下: `bg-red-50 border-red-200 text-red-800`
- past_due でないユーザーにはバナーを表示しない
- **データ取得**: ルートレイアウト（Server Component）で、認証済みユーザーの場合に subscriptions テーブルから status と past_due_since を取得する。status = 'past_due' の場合のみ PastDueBanner コンポーネントを表示する。PastDueBanner は Client Component（残り日数のリアルタイム計算のため）

### REQ-BL-007: Stripe Customer Portal 連携

- Stripe Customer Portal を利用し、以下の機能を Stripe のホスト画面に委任する:
  - カード情報の更新
  - 請求履歴の閲覧・請求書ダウンロード
- アプリ側の実装: Server Action で `stripe.billingPortal.sessions.create()` を呼び出し、生成された URL にリダイレクトする
- Customer Portal へのリンク配置箇所:
  - CLI-026（プラン案内画面）内の「お支払い情報を管理する」リンク
  - past_due 警告バナーの「お支払い方法を更新する」ボタン

### REQ-BL-008: 定期実行処理の実装方式

- 定期実行処理は処理の複雑さに応じて **pg_cron 直接実行** と **pg_cron + Edge Function** を使い分ける
- pg_cron ジョブの登録はマイグレーションファイルで行う
- 実行時刻は5分ずつずらし、同時実行による競合を回避する

#### 実装方式の使い分け:

| ジョブ | 実行時刻 | 方式 | 理由 |
|-------|---------|------|------|
| auto-cancel-past-due | 03:00 JST | pg_cron → Edge Function | メール送信が必要なため SQL だけでは完結しない |
| expire-options | 03:05 JST | pg_cron（SQL直接実行） | 単純な UPDATE 文で完結する |
| close-expired-jobs | 03:10 JST | pg_cron（SQL直接実行） | 単純な UPDATE 文で完結する |

#### pg_cron SQL 直接実行（expire-options, close-expired-jobs）:
- pg_cron の `cron.schedule()` で SQL を直接実行する
- メリット: Edge Function のデプロイ・認証が不要。シンプルで障害点が少ない
- SQL はマイグレーションファイル内の `cron.schedule()` に直接記述する

#### pg_cron + Edge Function（auto-cancel-past-due）:
- **pg_cron（スケジューラー）**: 時刻になったら `net.http_post()` で Edge Function の URL を呼び出す
- **Edge Function（実行エンジン）**: TypeScript で記述。DB 更新 + メール送信（Resend）を処理する
- ファイル配置: `supabase/functions/auto-cancel-past-due/index.ts`
- 認証: Authorization ヘッダーに `SUPABASE_SERVICE_ROLE_KEY` を渡す
- ローカルテスト: `supabase functions serve` でローカル起動し、手動で HTTP リクエストを送信してテスト
- **エラーハンドリング**:
  - 対象ユーザーを1件ずつ処理し、1件のエラーが他のユーザーの処理をブロックしないようにする（try-catch で個別にエラーハンドリング）
  - レスポンスボディに処理結果を含める: `{ total: N, succeeded: N, failed: N, errors: [...] }`
  - 対象が0件の場合もログを残す（正常動作の確認用）
  - pg_cron のジョブ実行結果は `cron.job_run_details` テーブルに自動記録されるため、失敗時は Supabase Dashboard で確認可能
  - Phase 2 で管理者への Slack 通知等のアラート連携を検討する

### REQ-BL-009: 決済系メール通知テンプレート

- 既存のメール送信基盤（`src/lib/email/send-email.ts` + Resend）を利用する
- 新規テンプレートファイル:
  - `src/lib/email/templates/payment-failed.ts` — 支払い失敗通知
  - `src/lib/email/templates/subscription-changed.ts` — プラン変更確認
  - `src/lib/email/templates/subscription-cancelled.ts` — 解約完了通知
- テンプレート形式: 既存の `matching-accepted.ts` と同じ HTML テンプレート方式（`{ subject: string; html: string }` を返す関数）
- デザイン: 既存テンプレートと統一（ヘッダー紫、本文白、フッター灰色、ピル型 CTA ボタン）
- **メール宛名**: `users.last_name + first_name`（個人名）を使用。billing 系メールはシステムからユーザーへの通知であり、相手方の名前表示は不要
- **名前表示ルール**: メール通知で相手方の名前を表示する際は `.kiro/specs/messaging/requirements.md` の「名前表示ルール」に従う。auto-cancel-past-due の解約完了通知メールの宛名も同ルールを適用

## 非機能要件

### セキュリティ

- Stripe Webhook の署名検証は必須（偽造防止）
- カード情報はサーバー・DBに一切保存しない（Stripe が管理）
- Stripe Customer ID のみ DB に保持
- Webhook の API Route はサービスロールキーで Supabase に接続（`src/lib/supabase/admin.ts` に専用クライアントを作成。環境変数 `SUPABASE_SERVICE_ROLE_KEY` は `NEXT_PUBLIC_` プレフィックスなしで設定し、ブラウザへの漏洩を防ぐ）
- 課金ステータスの確認は RLS ポリシーで実施（`is_paid_user()` 関数が `subscriptions.status IN ('active', 'past_due')` を含むことを実装時に検証する）

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

### 通常ルート（初期費用あり）
```
CON-001（マイページ）→ CLI-026（プラン案内）→ CLI-027（Stripe Checkout / 月額+初期費用）
                                              → CON-001（成功）
                                              → CLI-026（キャンセル）
```

### fee=free ルート（初期費用免除）
```
/billing?fee=free → [ミドルウェアで Cookie セット]
  ├─ ログイン済み → CLI-026（初期費用なし表示）→ CLI-027（月額のみ）→ CON-001（成功）
  └─ 未ログイン → AUTH-001（ログイン）→ CON-001 → CLI-026（Cookie で初期費用なし）→ CLI-027 → CON-001
```

### ダウングレード/解約フロー
```
CLI-026（プラン案内）→「このプランに変更する」/「解約する」
  → 前提条件チェック（掲載中案件・未返信応募・担当者数）
    ├─ チェック失敗 → エラーメッセージ表示（CLI-026 に留まる）
    └─ チェック成功 → 確認ダイアログ表示
      ├─ キャンセル → CLI-026 に戻る
      └─ 予約実行 → CLI-026（「{日付}に変更予定」ラベル表示）
         → 請求期間終了 → Webhook（customer.subscription.updated / deleted）→ 自動反映
```

### past_due 中の解約フロー
```
CLI-026（プラン案内 / past_due 状態）→「解約する」
  → 即時解約確認ダイアログ（⚠ 警告付き）
    ├─「お支払い方法を更新する」→ Stripe Customer Portal
    └─「解約する」→ 即時解約実行 → CON-001（マイページ / contractor に戻る）
```

### プラン購入後の発注者情報設定フロー
```
CLI-027（Stripe Checkout 成功 / 全プラン共通）
  → CLI-021（?setup=true / 発注者情報設定 + 成功トースト）
     ├─ 法人プラン: 社名必須 → 保存後 → CON-001（マイページ）
     └─ 個人・小規模プラン: 社名・氏名は任意
           ├─ 入力して保存 → CON-001
           └─「スキップして後で設定する」→ CON-001（Webhook が client_profiles.display_name にデフォルト格納した姓名がそのまま表示名として使われる）
法人プランのみ追加フロー: CON-001 →（任意のタイミングで）CLI-022（担当者一覧）→ CLI-025（担当者新規作成）
```

### Stripe Customer Portal
```
CLI-026「お支払い情報を管理する」→ Stripe Customer Portal（カード更新・請求履歴）
past_due 警告バナー「お支払い方法を更新する」→ Stripe Customer Portal
```

## 関連テーブル

- users: role 更新、stripe_customer_id
- subscriptions: サブスクリプション管理（CRUD）
- option_subscriptions: オプション契約管理
- client_profiles: 発注者プロフィール作成、オプションフラグ更新
- organizations: 法人プラン購入時に自動作成（`owner_id` のみ設定）。発注者表示名は `client_profiles.display_name` に一本化されており、`organizations.name` カラムは organization spec で廃止される
- organization_members: 担当者管理（ダウングレード前提条件チェックで件数確認）
- audit_logs: ロール変更ログ

## 関連 steering

- database-schema.md: subscriptions, option_subscriptions, client_profiles テーブル
- authentication.md: ロールエスカレーション防止、Stripe 連携のセキュリティ
- security.md: 決済情報の取り扱い
- product.md: プラン一覧、機能制限
- tech.md: Stripe Webhook 処理パターン

## 決定済み事項（議論の経緯）

以下は検討の結果決定した事項。実装時の判断根拠として記録する。

- **補償オプションの保存先**: `option_subscriptions` テーブルに `payment_type='subscription'` で保存。`subscriptions` テーブルは基本プラン専用（1人1つの UNIQUE 制約のため）
- **組織の自動作成**: 法人プラン購入時に Webhook で自動作成（`owner_id` のみ設定。ユーザーが後から CLI-021 で `client_profiles.display_name` に発注者名を入力する設計）。暫定期間中の `ensure_organization_exists` は `name=''` でレコードを作成するが、organization spec 実装時に `name` カラム自体が廃止される。ダウングレード時は組織データを残す（再アップグレード時に再利用）
- **初期費用の DB 記録**: 不要。Stripe の決済履歴で管理。初回判定は subscriptions テーブルのレコード有無で行う
- **急募オプションの再購入**: expired 後は同一案件に再購入可能。チェック条件は `status='active'` のみ
- **アップグレード課金方式**: 日割り差額精算で即時課金（`proration_behavior: 'create_prorations'`）
- **ダウングレード・解約の適用タイミング**: 現在の請求期間終了時に適用。期間終了日まで現プランの全機能利用可能。予約キャンセルも可能
- **past_due 中の操作**: アップグレード・ダウングレード不可、解約のみ可（即時実行、前提条件チェックなし）
- **Webhook 冪等性**: 同時処理中は 200 OK を返す（409 は Stripe がリトライするため不可）
- **Webhook イベント順序逆転**: subscription レコードが見つからない場合は 200 で処理スキップ
- **plan_type 判別**: Checkout Session の metadata で判別（`type: 'plan'` / `type: 'option'`）
- **管理者作成ユーザー**: role='contractor' で作成し、通常の課金フローを通す
- **定期ジョブの実装**: close-expired-jobs と expire-options は pg_cron SQL 直接実行、auto-cancel-past-due のみ Edge Function（メール送信が必要なため）
- **ダウングレード前提条件**: 3つのチェック（掲載中案件数・未返信応募・担当者数）に集約。代理アカウントは担当者数に含まれるため個別チェック不要。全10パターンが同一ロジックで処理可能
- **PLAN_LIMITS 定数**: `src/lib/constants/plans.ts` にプランごとの上限値を定義。DB ではなくコード内定数で管理（変更頻度が低いため）
- **発注者表示名は `client_profiles.display_name` に一本化**: CLI-021 で display_name を保存する。`organizations.name` カラムは organization spec の実装時に廃止されるため同期は不要（詳細は `.kiro/steering/database-schema.md`「発注者表示名のルール」および `.kiro/specs/organization/requirements.md` 付録 A 参照）
- **解約後のメッセージ**: 進行中（accepted）の案件のスレッドは引き続き利用可能。ただし無料プランのメッセージ制限（月5スレッド）が適用される。既存スレッドへの返信は制限なし（制限は新規スレッド作成のみ）
- **解約後の完了報告・評価**: 自分がオーナーの accepted 案件に対してはアクセス可能。ページ側で所有権チェック（role ではなく案件オーナーかで判定）。受注者が不利にならないための措置
- **プラン購入後の発注者情報入力（全プラン共通）**: success_url を全プランで CLI-021（`?setup=true`）に統一。背景は「`client_profiles.display_name` がメッセージ・案件カード・スカウト等で受注者に表示される唯一の名前源」であり、課金した瞬間に発注者名を設定する導線を持つべきため
  - **法人プラン**: 社名入力必須、スキップ不可
  - **個人・小規模プラン**: 社名・氏名は任意。「スキップして後で設定する」ボタンを表示し、スキップ時は Webhook が `client_profiles.display_name` のデフォルト値として格納した姓名（`users.last_name + first_name`）がそのまま表示名として使われる
  - **理由（なぜ個人・小規模でもスキップ可にするか）**: 受注者機能の制限（登録職種×登録県）解除のみを目的に課金するユーザーも存在するため。発注者機能を使わないなら表示名は誰にも見えず、強制入力はフリクションにしかならない
  - 詳細は organization spec REQ-ORG-006 参照
- **課金直後の CLI-021 アクセスガード緩和**: `?setup=true` 付きの CLI-021 アクセスは `users.role` や `subscriptions.plan_type` の確定を待たず認証済みユーザーに許可する。Webhook 未着時でも画面表示は可能にし、保存 Server Action 側で Webhook 完了前のエラーハンドリング（「プラン情報を反映中です」表示）を行う
- **アップグレード時の組織自動作成**: customer.subscription.updated で plan_type が corporate / corporate_premium に変更された場合も、checkout.session.completed と同じ組織作成ロジックを実行する。共通関数 `ensureOrganizationExists(userId)` として切り出す
- **補償オプションの解約UI**: CLI-026 のオプションセクションに「解約する」ボタンを表示。Server Action で Stripe サブスクリプションをキャンセルする。Stripe Customer Portal への委任ではなく、アプリ内で完結させる（申し込みと同じ画面で解約できる方がわかりやすいため）
- **急募オプションの案件選択**: CLI-026 のオプションセクションに案件選択プルダウンを表示。掲載中かつ急募未適用の案件のみ選択可能。案件管理画面（CLI-002）からの導線は設けない
- **動画掲載オプションの解約**: ユーザー側の解約UIは不要（買い切りのため）。掲載停止は管理者が ADM-010 で対応する運用
- **決済完了〜Webhook のタイムラグ**: success_url に `?checkout=success` パラメータを付与し、CON-001 でトースト表示。Webhook 未着による一時的な role 不整合は許容する（通常 数秒以内に解消）。Phase 1 ではポーリング等の追加対策は不要
- **ダウングレード/解約予約のキャンセルUI**: CLI-026 の現在プランカード内に「変更をキャンセルする」/「解約をキャンセルする」ボタンを表示。予約状態は Stripe API の subscription オブジェクトから取得する
- **担当者（staff）のCLI-026アクセス**: 閲覧は許可、全操作ボタンは非活性。「担当者アカウントではプランの変更はできません」メッセージを表示
- **Edge Function のエラーハンドリング**: 1件のエラーで全体をブロックしない設計。処理結果をレスポンスに含める。Phase 2 で Slack 通知を検討
- **Stripe Customer ID の保存タイミング**: Checkout Session 作成時の Server Action で `stripe.customers.create()` → DB 保存。Webhook でも二重防御で保存
- **補償オプションの排他制御**: ¥5,000 と ¥9,800 の同時加入は不可。加入中は別の補償の申し込みボタンを非活性にする。切り替えは先に解約してから再申し込み
- **オプション購入の success_url**: CLI-026 に `?option_success={type}` パラメータ付きでリダイレクト。トーストで購入完了を通知
- **past_due 即時解約の Stripe API**: `stripe.subscriptions.cancel()` を使用（`cancel_at_period_end` ではなく即時キャンセル）
- **ダウングレードの Stripe 実装**: Subscription Schedule の利用を検討。実装時に Stripe ドキュメントで最新の推奨パターンを確認
- **audit_logs の記録内容**: role 変更・サブスクリプション CRUD・自動解約を記録。Webhook 経由の場合は actor_id = null
- **past_due バナーのデータ取得**: ルートレイアウト（Server Component）で subscriptions を取得。PastDueBanner は Client Component
- **二重課金防止**: Server Action（Checkout Session 作成時）と Webhook（checkout.session.completed）の2箇所でチェック

## 未確認事項

### billing 機能で必要な環境変数（.env.local に設定）

| 変数名 | 用途 | 値の取得元 |
|--------|------|-----------|
| STRIPE_SECRET_KEY | Stripe API の秘密鍵 | Stripe Dashboard > API keys |
| STRIPE_WEBHOOK_SECRET | Webhook 署名検証用シークレット | Stripe CLI（ローカル）/ Stripe Dashboard（本番） |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY | フロントエンド用公開鍵（Checkout リダイレクトに必要な場合） | Stripe Dashboard > API keys |
| SESSION_SECRET | iron-session の暗号化キー（32文字以上） | 自分で生成 |
| STRIPE_PRICE_INDIVIDUAL | 個人発注者様向けプランの Price ID | Stripe Dashboard > Products |
| STRIPE_PRICE_SMALL | 小規模事業主様向けプランの Price ID | 同上 |
| STRIPE_PRICE_CORPORATE | 法人向けプランの Price ID | 同上 |
| STRIPE_PRICE_CORPORATE_PREMIUM | 法人向けプラン（高サポート）の Price ID | 同上 |
| STRIPE_PRICE_INITIAL_FEE | 初回事務手数料の Price ID（one-time） | 同上 |
| STRIPE_PRICE_COMPENSATION_5000 | 補償¥5,000の Price ID | 同上 |
| STRIPE_PRICE_COMPENSATION_9800 | 補償¥9,800の Price ID | 同上 |
| STRIPE_PRICE_URGENT | 急募の Price ID | 同上 |
| STRIPE_PRICE_VIDEO | 動画掲載の Price ID | 同上 |

### 後日決定する事項

- **Stripe 環境変数の設定**: Stripe アカウントでプロダクト・価格を作成後、上記の環境変数を `.env.local` に設定する
- **fee=free Phase 2（将来対応）**: ログイン/登録完了後に `/billing` へ自動リダイレクトする `redirect` パラメータの引き回し実装

### 実装時に検証する事項

- **fee=free Cookie の維持**: ログイン前後（未ログイン → `/billing?fee=free` → ログイン → `/billing`）で Cookie が消えないか手動テストで確認
- **is_paid_user() 関数**: マイグレーション内の定義が `subscriptions.status IN ('active', 'past_due')` を含むことを確認
- **billing テスト用 seed データ**: 以下の状態をカバーする seed データを用意すること
  - 未課金ユーザー（contractor）: 初回購入フローのテスト
  - active な個人プランユーザー: アップグレード・ダウングレードのテスト
  - active な法人プランユーザー + 組織 + 担当者: 担当者数チェックのテスト
  - past_due ユーザー（past_due_since を7日以上前に設定）: 自動解約のテスト
  - cancelled ユーザー（元 client、現 contractor）: 再課金フローのテスト
  - 急募オプション active のユーザー + 対象案件: 期限切れ処理のテスト
  - 補償オプション active のユーザー: 解約フローのテスト
