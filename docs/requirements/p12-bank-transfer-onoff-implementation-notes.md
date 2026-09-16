# P12「銀行振込をオン／オフだけにする」実装メモ（ユーザー承認済み）

作成: 2026-09-16。承認: 同日（切り替え方式 §3 を含めて提案どおり）。相談の経緯: 銀行振込の運営負荷を下げるため、P2（申込テーブル + 3 段階ステータス + 期限管理）と P9（運営の代理登録）で作った仕組みを**丸ごと廃止**し、「お問い合わせで受けて、運営が管理画面でプランをオン／オフするだけ」に作り直す。
親ドキュメント: `docs/requirements/spec-changes-202608.md` §2.1(1)（旧仕様。本メモが優先）、`p9-bank-transfer-lowkey-implementation-notes.md`（廃止対象）。
作業ブランチ（予定）: `p12-bank-transfer-onoff`（`feature/spec-changes-202608` から分岐）。

## 0. 要点（ユーザー決定事項）

| 決定 | 内容 |
|---|---|
| 入口 | お問い合わせ（COM-008）の「お支払い方法（銀行振込）について」。**ログイン中の会員だけ選べる**（未ログインには選択肢を出さない） |
| 希望プラン | 銀行振込を選んだときだけ「希望プラン」欄が出る（基本プラン 4 種 + 動画プラン 3 種）。月払い／年払いは聞かない（本文か運営が確認） |
| 会員情報の自動入力 | ログイン中は**お問い合わせの種類に関係なく**、会社名／屋号・氏名・メール・所在地を会員情報から最初から入れておく（上書き可）。電話番号は会員情報に無いので空欄 |
| 一覧 | ADM-025 を「**銀行振込お問い合わせ一覧**」に作り替え。銀行振込のお問い合わせだけを新着順に並べる。**ステータスは持たない**。各行からお問い合わせ詳細とユーザー詳細（発注者なら発注者詳細）へ |
| 有効化 | ユーザー詳細（ADM-009）と発注者詳細（ADM-004）の両方に同じ「銀行振込」枠。**プランのオン／オフ（と変更）だけ**。年払い・利用開始日・有効期限・期限延長・期限バッジ・期限メールは持たない |
| 動画プラン | 同じ枠から有効化できる（絞り込み検索と購入記録のため） |
| 廃止 | 申込テーブル `bank_transfer_requests`・3 段階ステータス・ADM-026・ADM-025-B（代理登録）・本人申込ボタンと環境変数・申込メール 2 種 |
| 切り替え | **カード ⇄ 銀行振込の切り替えは、順番を運営が気にしなくてよいようにアプリ側で処理する**（§3） |

## 1. 会員側

### 1.1 お問い合わせ（COM-008 `/contact`）
1. ログイン中は、フォームを開いた時点で次の項目が入っている: 会社名／屋号（発注者なら `client_profiles.display_name`、それ以外は `users.company_name`。無ければ空）、氏名（`users.last_name + first_name`）、メールアドレス（ログイン中のメール）、所在地（発注者なら `client_profiles.address`、それ以外は `formatResidence(users.prefecture, users.municipality)`）。電話番号は空欄。すべて上書き可
2. 「お問い合わせの種類」の選択肢「お支払い方法（銀行振込）について」は**ログイン中だけ表示**。サーバー側（Zod / Server Action）でも未ログインなら拒否
3. 銀行振込を選んだときだけ「希望プラン」（必須・単一選択）を表示: ライト／スタンダード／プレミアム／ハイエンド／プロフィール動画制作プラン／ユーザー撮影プラン／ビジ友公式SNS動画制作プラン。他の種類を選んでいるときは表示せず、送信値も空
4. 「ビジ友の利用目的」「業種・職種」は銀行振込でも必須のまま（フォームを分岐させない）
5. 送信後のメール: 送信者控え（既存）はそのまま。運営宛通知（既存）に「希望プラン」の行を追加。**旧 申込メール 2 種（`bank-transfer-requested` / `bank-transfer-requested-ops`）は廃止**

### 1.2 料金プラン画面（CLI-026 `/billing`）
6. 「銀行振込をご希望の方はお問い合わせください」（`BankTransferContactNote`）は今のまま。**本人申込ボタン（`BankTransferApplyButton` / `requestBankTransferAction` / 環境変数 `NEXT_PUBLIC_BANK_TRANSFER_SELF_SERVICE_ENABLED`）と「申込受付中」表示は削除**
7. 銀行振込で契約中の表示は「お支払い方法: 銀行振込 ／ 変更・解約は運営までご連絡ください」だけにする（月払い／年払い・有効期限は出さない）
8. 銀行振込で契約中の会員には、各プランのボタンを「**カード払いで申し込む**」（Stripe Checkout）として押せるようにする。現在のプランの枠にも「カード払いに切り替える」（同じプランで Checkout）を出す。決済が完了すると銀行振込の契約は自動で終了する（§3.2）
9. 解約ボタン・お支払い情報の管理（Customer Portal）は銀行振込中は出さない（今のまま）

## 2. 管理画面

### 2.1 ADM-025 銀行振込お問い合わせ一覧（`/admin/bank-transfers`、URL は据え置き）
10. `contacts` のうち `inquiry_type = 'お支払い方法（銀行振込）について'` を新着順・20 件ページング。キーワード検索（会社名／屋号・氏名・メール）は ADM-016 と同じ部品
11. 行の表示: 受信日時・会社名／屋号・氏名・メールアドレス・希望プラン
12. 行のボタン: 「お問い合わせ詳細」（ADM-017、`backTo` 付き）と「ユーザー詳細」（`users.role='client'` なら「発注者詳細」ADM-004、それ以外は ADM-009）。会員が退会済みならユーザー詳細のみ
13. 管理メニュー（ADM-002）のラベルを「銀行振込お問い合わせ一覧」に変更。ADM-026・ADM-025-B は削除

### 2.2 ADM-017 お問い合わせ詳細
14. 希望プランがあれば「希望プラン」行を表示（既存の「登録ユーザー」バッジ・ユーザー詳細リンクはそのまま）

### 2.3 「銀行振込」枠（ADM-009 ユーザー詳細 / ADM-004 発注者詳細、共通部品）
表示条件: 対象が `role IN ('contractor','client')` かつ退会済みでない。staff / admin には出さない。ADM-009 では「管理運営アカウント」枠の直前に置く。

15. **有料プランなし** → 基本プラン（Select、既定ライト）+「有効にする」。確認ダイアログ「入金を確認したうえで有効化してください。有料会員に切り替わり、本人に有効化メールが届きます」→ 実行。有効化後、ADM-009 なら「発注者詳細を開く」リンクを表示
16. **銀行振込で契約中** → 「〇〇プラン（現在）」Select +「変更する」（ダウングレード時は既存の前提条件チェック）+「無効にする」（既存の解約処理 = Stripe 解約と同じ後処理: 発注者権限の解除・掲載中案件の終了・配下担当者の停止・解約完了メール）
17. **カード払いで契約中（active / past_due）** → 基本プラン Select +「銀行振込に切り替える」。確認ダイアログ「カード払いはこの時点で停止します（残り期間の日割り返金はありません。以降の請求は銀行振込）」→ §3.1 の処理。切替後は 16 の表示になる
18. **動画プラン** → いずれの状態でも表示。Select（3 種）+「有効にする」。既存の `activateOption` の動画分岐と同じ（`option_subscriptions` に `one_time` / `bank_transfer` 行、本人・運営に購入完了メール）。作り直しの再購入も可
19. 監査ログ: `bank_transfer_activate`（金額・サイクルは記録しない）/ `bank_transfer_plan_change` / `bank_transfer_cancel_subscription`（既存）/ `bank_transfer_switch_from_stripe`（新設）/ `bank_transfer_option_activate`（新設）
20. 補償オプション（販売停止中）と急募は銀行振込の対象にしない

### 2.4 削除
21. ADM-026（`/admin/bank-transfers/[id]`: 送付済・取消・メモ・有効化）、ADM-025-B（`/admin/bank-transfers/new`）、`createBankTransferRequestByAdminAction`、期限延長 `extendBankSubscriptionAction`
22. ADM-003 発注者一覧・ADM-004 の「期限間近／期限切れ」バッジ、`deriveExpiryBadge` 一式、Edge Function `bank-transfer-expiry-notify` と pg_cron ジョブ

## 3. 支払い方法の切り替え（アプリが順番を保証する）

背景: 有料プランが切れると「案件終了・発注者権限の解除・担当者停止」の後処理が走る。切り替えで一瞬でも「両方なし」を作ると会員に実害が出るため、**同じ契約行（`subscriptions` 1 行）の支払方法を書き換える**方式にし、契約行が途切れないようにする。`subscriptions_unique_active`（1 人 1 有効行）は据え置き。

### 3.1 カード → 銀行振込（運営の「銀行振込に切り替える」）
1. Stripe: `schedule_id` があれば `subscriptionSchedules.release` → `subscriptions.cancel(stripe_subscription_id)`（即時。日割り返金なし）
2. DB: 同じ行を `payment_method='bank_transfer'`, `stripe_subscription_id=NULL`, `plan_type=選択値`, `status='active'`, `cancel_at_period_end=false`, `schedule_id/scheduled_*=NULL`, `past_due_since=NULL`, `current_period_end=NULL` に UPDATE
3. その後 Stripe から届く `customer.subscription.updated` / `deleted` は、`stripe_subscription_id` で行が見つからないため**「処理済み」として何もしない**（`handle-subscription-lifecycle.ts` は RPC を呼ぶ前に TS 側で行を SELECT し、無ければ skip する既存挙動。RPC の変更は不要と実装時に確認）
4. 会員へのメール: 送らない（支払方法の変更は運営と会員が合意済みの操作。プランを同時に変える場合も、銀行振込中のプラン変更（「変更する」）と同じくメールなし）
5. 監査 `bank_transfer_switch_from_stripe`（旧 stripe_subscription_id を metadata に）

### 3.2 銀行振込 → カード（会員が料金プラン画面で Checkout）
1. Checkout 開始（`startCheckoutAction`）の二重契約チェックを「有効な **Stripe** 行があれば拒否」に変更（銀行振込行は無視）。Stripe API 側の active チェックは今のまま
2. `checkout.session.completed` → RPC `handle_checkout_completed_plan`: 有効な銀行振込行があれば**後処理なしで `status='cancelled'`** にしてから Stripe 行を INSERT（同一トランザクション）。role・案件・担当者は触らない
3. 監査: 既存 `subscription_created` に加え `bank_transfer_ended_by_stripe_checkout`
4. 運営の作業なし（銀行振込の請求を止めるだけ）

### 3.3 銀行振込の契約行の値
- `billing_cycle` は `'monthly'` 固定（列は Stripe 年払いのために残す）、`current_period_start=有効化時刻`、`current_period_end=NULL`（期限なし）。既存行の値は触らない（アプリが参照しなくなる）
- 管理運営アカウント（P5、期限 2099-12-31）は変更しない

## 4. データ

### 4.1 migration（1 本、`2026091X_bank_transfer_onoff.sql`）
- `DROP TABLE bank_transfer_requests`、`DROP TYPE bank_transfer_request_status / bank_transfer_target_kind`
- `cron.unschedule('bank-transfer-expiry-notify')`、`DROP INDEX subscriptions_bank_transfer_expiry_idx`
- `ALTER TABLE contacts ADD COLUMN bank_transfer_plan text`（希望プランのキー: `individual/small/corporate/corporate_premium/video/video_shooting/video_sns`。表示は `PLAN_LABELS` / `OPTION_LABELS`。NULL = 銀行振込以外）
- `handle_checkout_completed_plan` 改（有効な銀行振込行を静かに cancelled にしてから INSERT）
- `payment_method_type` / `subscriptions.payment_method` / `option_subscriptions.payment_method` / CHECK 制約は据え置き

### 4.2 seed
- `bank-requested@test.local` と `bank_transfer_requests` の行を削除。`bank-client@test.local`（銀行振込で契約中）は残し、期限関連の説明を更新。`bank-transfer-e2e@test.local`（無料）は「お問い合わせ → 有効化」の E2E 用に残す
- 銀行振込のお問い合わせ 1 件（`contacts`、`user_id` 付き、希望プラン付き）を追加（一覧の E2E 用）

## 5. 文言・設定
- FAQ Q17: 「銀行振込をご希望の場合は、**ログインのうえ**お問い合わせ窓口からご連絡ください。」に変更（`docs/legal/faq.md` と画面本文の一致検証あり）。特商法は変更なし
- `.env.local.example`: `NEXT_PUBLIC_BANK_TRANSFER_SELF_SERVICE_ENABLED` を削除。Edge Function `bank-transfer-expiry-notify` 用 secrets の記述を削除
- `src/lib/billing/bank-transfer.ts`: 申込・期限・金額計算（`computeBankTransferAmount` / `computePeriodEnd` / `deriveExpiryBadge` / `describeBankTransferTarget` 等）を削除。残すのは `BANK_TRANSFER_MANAGED_BY_OPS_MESSAGE`、`BANK_TRANSFER_CONTACT_MESSAGE`、`dateStringToJstIso` / `todayJstDateString`（管理運営アカウントが使用）

## 6. テスト
- vitest: `bank-transfer-actions.test.ts`（本人申込）→ 削除。`bank-transfer-admin-actions.test.ts` → 有効化 / 切替（Stripe cancel 呼出・schedule release・行の書き換え）/ 変更 / 無効化 / 動画有効化 / staff・admin・退会済み拒否 に書き直し。`bank-transfer.test.ts`（純粋関数）→ 残る関数分のみ。`bank-transfer-email-templates.test.ts` → 削除。`contact` 系: ログイン限定・希望プラン必須・自動入力。`clients-list.test.ts` の期限バッジ → 削除。webhook: 見つからない Stripe ID の skip、Checkout 完了時の銀行振込行の終了。法務本文一致
- pgTAP: `bank_transfer_requests.test.sql` / `bank_transfer_video_shooting.test.sql` / `bank_transfer_video_sns.test.sql` → 削除。`bank_transfer_onoff.test.sql`（廃止物の不在・`contacts.bank_transfer_plan`・`handle_checkout_completed_plan` v3 の銀行振込行終了）を追加
- E2E `bank-transfer.spec.ts`: ①会員ログイン → お問い合わせ（銀行振込・希望プラン）→ 送信 ②admin → 銀行振込お問い合わせ一覧に出る → ユーザー詳細 → 有効にする → 会員の /billing で「ご利用中」+「お支払い方法: 銀行振込」 ③未ログインで /contact に銀行振込の選択肢が無い ④発注者詳細から「変更する」「無効にする」。`admin.spec.ts` のメニュー名を更新

## 7. 仕様書の更新
- `.kiro/steering/database-schema.md`（`bank_transfer_requests` 節の削除、`subscriptions` の銀行振込説明、`contacts.bank_transfer_plan`）、`screen-map.md`（ADM-025 の改名、ADM-026 / ADM-025-B の削除）、`product.md`
- `CLAUDE.md`: 「銀行振込の本人申込は既定で非表示・運営が代理登録（P9）」節を本メモの内容に置き換え。「銀行振込と Stripe 前提処理の分離」節の期限関連の記述を修正
- `docs/requirements/staging-release-checklist-202609.md` / `changes-summary-202609.md`: 銀行振込の項目を差し替え（Edge Function のデプロイ・secrets が不要になる）

## 8. 実装結果（2026-09-16）

- 作業ブランチ `p12-bank-transfer-onoff`。migration `20260916120000_bank_transfer_onoff.sql`（申込テーブル・enum・期限 cron・期限 index の削除、`contacts.bank_transfer_plan`、`handle_checkout_completed_plan` v3）
- 追加: `src/components/admin/bank-transfer-panel.tsx`（共通枠）、`src/lib/support/contact-prefill.ts`（自動入力）、`src/app/(support)/contact/contact-form.tsx`（フォーム本体。`page.tsx` は Server Component 化）、`BANK_TRANSFER_PLAN_CHOICES` 等（`src/lib/constants/contact-options.ts`）、`VIDEO_OPTION_UI_NAMES`（`src/lib/billing/options.ts` に移動）
- 書き換え: `clients/[id]/bank-subscription-actions.ts`（有効化 / 変更 / 無効化 / カード→振込 / 動画）、`src/lib/admin/bank-transfers.ts`（お問い合わせ一覧のクエリ）、ADM-025 / ADM-009 / ADM-004 / ADM-017 / ADM-003、`billing/{page,BillingClient,actions}`、`contact/actions.ts`、`grant-plan.ts`（期限 null 可）、`bank-transfer.ts`（縮小）
- 削除: ADM-026・ADM-025-B・`filters.tsx`・旧 `bank-transfers/actions.ts`・`bank-subscription-panel.tsx`・`bank-transfer-actions.ts`・`bank-transfer-apply-button.tsx`・メールテンプレ 2 種・Edge Function `bank-transfer-expiry-notify`・vitest 2 本・pgTAP 3 本・`NEXT_PUBLIC_BANK_TRANSFER_SELF_SERVICE_ENABLED`
- テスト: vitest / pgTAP（`bank_transfer_onoff.test.sql`）/ E2E（`e2e/bank-transfer.spec.ts` 書き直し）。結果は commit メッセージ参照
- 補足: カード → 銀行振込の切替後に届く Stripe Webhook は既存の TS 側ガードで skip されるため RPC v5 は不要だった（§3.1 に反映）
