# P5「管理運営アカウント」実装メモ（引き継ぎ・ユーザー承認済み）

作成: 2026-09-02。承認: 同日ユーザー「オッケーです。進めてください」（5 点の既定案 + 「管理画面からの運営メッセージ閲覧は入れない」を含めて承認）。
親ドキュメント: `docs/requirements/spec-changes-202608.md` §2.4 / D10 / §5（P5 行）。

## 0. ブランチ・進行状況

- 3 層ブランチ運用: ① `staging`（触らない）→ ② `feature/spec-changes-202608`（P1〜P4 マージ済み、origin push 済み）→ ③ フェーズ作業ブランチ
- **P5 の作業ブランチ `p5-ops-account` は作成済み**（feature から分岐、先頭 = P4 マージコミット `cd58b8d`）。実装はこれから
- 完了ごとに ② へ `--no-ff` マージ → origin push。P1〜P8 が揃ってから ① へマージ
- 管理運営アカウントの**実登録は P6 完了後**（仕様 §5 の注記）。P5 ではテストデータ（seed）で検証する

## 1. 受け入れ条件（承認済み）

### A. データ
1. `users` に非表示フラグ **`is_hidden boolean NOT NULL DEFAULT false`** を追加（追加のみの migration）。RLS（`users_select_public`）は変更しない（メッセージ相手・応募者・案件の発注者名として正当に見える必要があるため。除外はクエリ側で行う）
2. 課金は **手動サブスク行**で「支払い済み」扱い（D10）: `subscriptions` に `payment_method = 'bank_transfer'`、`plan_type = 'corporate_premium'`（ハイエンド）、`current_period_end = 2099-12-31`（JST 末日）の行を運営が付与。新しい支払方法（enum 値）は**追加しない**（後述 2.2 の理由）

### B. 管理画面（ADM-009 に「管理運営アカウント」セクションを新設）
3. 「管理運営アカウントに設定する」ボタン（確認ダイアログ付き）: 以下を 1 操作で実行
   - `users.is_hidden = true`
   - 上記 2 のサブスク行を作成（既に active / past_due の契約があれば拒否）
   - `role` が contractor なら client へ昇格、`client_profiles` を upsert（表示名 = 姓名。実運用では CLI-021 で「ビジ友 運営」等に変更する）、`ensure_organization_exists` RPC で組織作成（ハイエンドは法人扱い。担当者を複数登録できる）
   - 監査ログ `ops_account_set`（+ 既存の `subscription_created` / `role_changed`）
   - **有効化メールは送らない**（内部アカウントのため）
4. 「管理運営アカウントを解除する」ボタン: `is_hidden = false` に戻すのみ（監査ログ `ops_account_unset`）。契約行の解約は既存の ADM-004「銀行振込」パネルで行う
5. ADM-008（ユーザー一覧）/ ADM-003（発注者一覧）/ ADM-004 / ADM-009 に「管理運営」バッジを表示（運営が見分けられるように。admin 画面では非表示にしない）

### C. 一覧・検索・導線からの除外（他ユーザーから見えない）
6. 以下のクエリに `.eq("is_hidden", false)` を追加（計 9 か所）:
   CLI-005 職人一覧 / CLI-006 職人詳細（直リンクは 404）/ CON-005 発注者一覧（キーワード事前クエリ含む 2 か所）/ CON-006 発注者詳細（直リンクは 404）/ CON-006 求人お問い合わせ / マイリスト（発注者タブ・見込みユーザータブ）/ 評価詳細 `/users/[id]/reviews`
7. サーバー側ガード（直 POST / 直 URL 対策）: マイリスト登録 Action / スカウト送信ページ + Action / **`/messages/new?to=` の新規スレッド作成**（相手が非表示・退会済み・自分自身なら作成しない）
8. **意図的に除外しないもの**: メッセージ一覧・スレッド詳細・一斉送信の宛先（運営が始めたスレッドへの返信に必要）、応募者一覧・発注履歴（実際に応募した場合は見えるべき）、案件検索の発注者名（運営が出した案件は表示のまま）、メール宛先ヘルパー、Edge Function / cron、管理画面

### D. メッセージ導線（用途 ①職人を発注者へ提案 ②案件を職人へ提案）
9. 新規スレッドの入口は**既存の「メッセージを送る」ボタン**（CLI-006 → 職人へ、CON-006 → 発注者へ。どちらも `/messages/new?to=`）をそのまま使う。運営は client ロールなので両方に到達できる。提案内容（案件 URL・職人ページ URL）は本文に書く。**新しい入口ボタンは作らない**
10. 発注者⇔発注者（運営の組織 ⇔ 法人発注者の組織）スレッドが正しく動くよう、以下の「片側は必ず受注者（個人）」前提を直す:
    - `messages` の SELECT / INSERT RLS を identity ペア（`organization_1_id` / `organization_2_id`）対応にする（現在は旧 `organization_id` のみ参照。相手法人の担当者がスレッドは見えるのに本文が読めない・返信できない）
    - スレッド詳細の「自分の発言か」判定を「閲覧者の side」基準にする（両側が組織のとき吹き出しの左右が崩れる）
    - スカウトの承諾 / 辞退ボタンは「相手が受注者側の個人」のときのみ表示（運営から個人発注者へ送ったメッセージに承諾ボタンが出ないように）
11. CON-006 に自分自身ガード（`id === user.id` → 404。CLI-006 には既にある）

### E. 品質・その他
12. 課金画面（/billing）で運営アカウントには既存の銀行振込表示（「お支払い方法: 銀行振込 / 有効期限 2099/12/31 / 運営が管理」）が出る。内部アカウントなので**そのまま許容**（文言の作り分けはしない）
13. vitest（admin Action・/messages/new ガード・除外クエリ）/ pgTAP（`is_hidden` 列・`messages` RLS の identity 対応）/ E2E（seed の運営アカウントが CLI-005 / CON-005 / マイリストに出ない、運営 → 発注者・職人へメッセージ、相手側が読める・返信できる、ADM-009 の設定 / 解除）全通過
14. steering（database-schema / screen-map / roles-and-permissions / product）・CLAUDE.md 更新

### 意図的な除外
- 一覧の除外を除く一覧改修（プラン順・おすすめ順・プルダウン化）→ P6
- 管理運営アカウントの実登録・実名（「ビジ友 運営」等の表示名）→ P6 完了後に運営が ADM-006/007 の招待 → ADM-009 で設定
- 一斉送信・スカウトから運営が「新しい相手」へ送る機能（一斉送信は既存相手のみ、スカウトは自社案件のみの現行仕様を維持）
- ADM-023/024（代理メッセージ閲覧）の「職人 / 発注者」ラベルが発注者⇔発注者スレッドで片方を「職人」と表示する点（閲覧専用・運営向けのため許容。必要なら P6 以降）
- **管理画面から運営アカウントのメッセージを閲覧する機能（ADM-023/024 の対象拡張）は入れない**（承認済み。運営アカウントでログインして読む運用。複数人なら担当者招待で各自のログインを作る。後から手戻りなく追加可能）

## 2. 設計方針（調査結果に基づく確定事項）

### 2.1 非表示フラグ
- `users.is_hidden`。既存フラグは流用不可: `is_active` / `deleted_at` は middleware でログアウトさせる凍結フラグ、`organization_members.is_proxy_account` は組織メンバー単位で目的が違う、`role='admin'` は `/admin/*` 以外に入れない
- **RLS では絞らない**（`users_select_public` は据え置き）。絞ると message スレッドの相手名・応募者・案件の発注者 embed がサイレントに null になる
- 除外はクエリ側（受け入れ条件 6・7）。エリア検索ヘルパー（`buildAreaFilterIds`）は最終的に `users` 本体クエリと `.in("id", …)` で交わるため変更不要

### 2.2 手動サブスク（A 案: `bank_transfer` 行の直接付与を採用）
- 有料判定（`is_paid_user()` / `resolveEffectiveSubscription` / `/billing` / mypage / `jobs_insert` RLS）は `status IN ('active','past_due')` しか見ず、支払方法・期限を見ない → 銀行振込行は今日そのままハイエンド会員として動く
- Stripe 前提の書き込み（`plan-actions.ts` の変更・解約、`auto-cancel-past-due`、`handle_subscription_lifecycle_updated`）は `bank_transfer` を既に拒否 / 対象外 → 内部アカウントに必要な隔離がそのまま得られる
- 期限 2099 年なら期限バッジ（30 日前）も期限通知 cron も発火しない（コード変更不要）
- B 案（enum に `manual` を追加）は約 13 か所の分岐修正が必要で、`plan-actions.ts:106` の `=== 'bank_transfer'` ガードが `manual` を素通りさせて Stripe 経路に落ちる危険がある → 不採用
- `bank_transfer_requests`（申込レコード）は**作らない**（作ると /billing に「申込受付中」バナーが出る）。付与 Action は P2 の `activatePlan`（`src/app/admin/(protected)/bank-transfers/actions.ts:311-429`）の副作用列（行作成 → role 昇格 → client_profiles → 組織作成 → 監査）を共通化して再利用し、有効化メールだけ省く
- 付与の置き場所は **ADM-009**（ADM-004 は `role='client'` でないと 404 になるため、招待直後の contractor 状態では開けない）。付与後の契約操作（解約等）は ADM-004 の既存パネル

### 2.3 メッセージ
- スレッドは identity ペア化済み（`20260707150000_message_threads_identity_pair.sql`）で 発注者⇔発注者 も DB 上は成立し、`message_threads` の RLS も対応済み。**`messages` の RLS だけ旧 `organization_id` 参照のまま**（`20260406100000_messaging_scout_status.sql:73-100`）→ 新 migration で `organization_1_id` / `organization_2_id` も見る形に更新（`message_threads_select` と同じ式）
- `/messages/new`（`src/app/(authenticated)/messages/new/page.tsx:172-192`）は admin client で INSERT し、相手のロール・退会・自分自身のチェックが無い → `is_hidden` / `deleted_at` / 自分自身のガードを追加（運営が始めたスレッドは相手側から返信できる = 既存スレッドは対象外）
- 「個人側 = 受注者」前提の箇所（`messages/[threadId]/page.tsx:74-98` の `showScoutActions` / `isContractorSide` / `contractorId`、`message-thread-view.tsx:47-59` の `computeIsMine`）を閲覧者 side 基準に修正。修正後も 受注者⇔発注者 の既存挙動は不変（既存 E2E で回帰確認）
- 入口ボタン（CLI-006 / CON-006 の「メッセージを送る」）は既存のまま。スカウトは「自社案件」が必須なので運営の提案には使わない（本文に案件 URL を書く運用）

### 2.4 管理画面
- ADM-009 に `"use client"` パネル（`ops-account-panel.tsx`）+ `ops-account-actions.ts`（`setOpsAccountAction` / `unsetOpsAccountAction`。`requireAdmin()` + 監査ログ）。既存の `bank-subscription-panel.tsx` + `bank-subscription-actions.ts` の構成をそのまま踏襲
- `AuditAction` union に `ops_account_set` / `ops_account_unset` を追加
- バッジは ADM-008 / ADM-003 の行と ADM-004 / ADM-009 のヘッダーに「管理運営」（`text-body-xs` のピル）

### 2.5 テストデータ（seed）
- `ops-account@test.local`（ID 帯 `0b500000-…`、表示名「ビジ友運営（テスト）」）: `role='client'`, `is_hidden=true`, ハイエンドの銀行振込行（期限 2099）, 組織 + `client_profiles`。用途: 除外・メッセージの E2E
- 相手側は既存の contractor@test.local / client@test.local を使う

## 3. 調査で確定した現状（file:line）

### 3.1 露出面（除外対象）
| 画面 | ファイル | 現在のフィルタ |
|---|---|---|
| CLI-005 `/users/contractors` | `src/app/(authenticated)/users/contractors/page.tsx:212-222` | role IN (contractor, client), 自分除外, deleted_at |
| CLI-006 `/users/contractors/[id]` | 同 `[id]/page.tsx:69-79` | role IN (contractor, client) |
| CON-005 `/clients` | `src/app/(authenticated)/clients/page.tsx:82-86`（キーワード）, `:140-149`（本体） | role=client, deleted_at |
| CON-006 `/clients/[id]` | 同 `[id]/page.tsx:65-79` | role=client（自分自身ガード無し） |
| 求人お問い合わせ | `src/app/(authenticated)/clients/[id]/inquiry/page.tsx:36-44`, `actions.ts:41,49` | role=client + `canSendJobInquiry` |
| マイリスト | `src/app/(authenticated)/favorites/page.tsx:293-302`（発注者）, `:436-447`（見込み） | role のみ |
| マイリスト登録 Action | `src/app/(authenticated)/jobs/search-actions.ts:472-478` | deleted_at |
| スカウト送信 | `src/app/(authenticated)/messages/scout-send/page.tsx:29-39`, `actions.ts:311-330` | deleted_at |
| 評価詳細 | `src/app/(authenticated)/users/[id]/reviews/page.tsx:41-45` | フィルタ無し |
| 新規スレッド | `src/app/(authenticated)/messages/new/page.tsx:44-51, 172-192` | ログインのみ（admin client で INSERT） |

除外しない（意図的）: `messages/page.tsx:46-73`、`bulk-send/page.tsx:48-92`、`jobs/search/page.tsx:164-190`（案件の発注者名）、`applications/**`、`src/lib/email/recipients/**`（全て `.eq("id")` / 組織メンバー限定で全ユーザー走査は無い）、`supabase/functions/**`、`src/app/admin/**`

### 3.2 手動サブスク
- `subscriptions` の一意制約: `subscriptions_unique_active (user_id) WHERE status IN ('active','past_due')`（`20260324160600_002_core_tables.sql:278`）
- CHECK `subscriptions_bank_transfer_no_stripe`（`20260901120000_bank_transfer.sql:35-37`）
- 有料判定が支払方法を見ない根拠: `20260707120000_is_paid_user_org_aware.sql:34-67`、`src/lib/billing/resolve-effective-subscription.ts:32-61`
- Stripe 経路の拒否: `src/app/(authenticated)/billing/plan-actions.ts:106-111`、`supabase/functions/auto-cancel-past-due/index.ts:51-53`
- 期限バッジ / 通知: `src/lib/admin/clients-list.ts:76-84`、`supabase/functions/bank-transfer-expiry-notify/index.ts:149-155`（30 日前と当日のみ）
- P2 の付与副作用の手本: `src/app/admin/(protected)/bank-transfers/actions.ts:311-429`（`activatePlan`）。ADM-004 の契約操作: `src/app/admin/(protected)/clients/[id]/bank-subscription-actions.ts`
- `/billing` の銀行振込表示: `src/app/(authenticated)/billing/BillingClient.tsx:500-507, 562, 891`
- middleware: `role='admin'` は `/admin/*` 以外に入れない（`src/middleware.ts:433-439`）→ 運営アカウントは admin とは別の client アカウント
- 招待フロー（ADM-006/007）: `src/app/admin/(protected)/clients/new/actions.ts:50-177`（姓名付きで users 行が作られ、受注者オンボ不要 → 運営アカウントの作成に最適）

### 3.3 メッセージ
- identity ペア: `src/lib/messaging/identity.ts:31-60`、一意制約 `20260707150000_message_threads_identity_pair.sql:127-137`。`message_threads` RLS `:78-107`（identity 対応済み）
- **`messages` RLS が旧式**: `20260406100000_messaging_scout_status.sql:73-100`
- 旧一意制約 `idx_message_threads_org_contractor_unique (organization_id, participant_2_id)`（同 `:15-17`）は残っているが、identity 制約と整合するため触らない
- 「個人側 = 受注者」前提: `src/app/(authenticated)/messages/[threadId]/page.tsx:74-98`、`src/components/messaging/message-thread-view.tsx:47-59`、`messages/[threadId]/actions.ts:328-354`（`respondToScoutAction`）、`supabase/migrations/20260708120000_admin_proxy_threads_view_identity.sql:25-40`（許容）
- 相手名解決は identity 基準で対称（`src/lib/messaging/counterparty-display.ts:107-206`、`src/lib/email/send/message-notification.ts:73-236`）→ 変更不要
- 入口: CLI-006 `users/contractors/[id]/page.tsx:220-238, 385-401`、CON-006 `clients/[id]/page.tsx:284-292, 411-429`（いずれも `/messages/new?to=`、`!isDeleted` のみ）

## 4. 進め方の注意
- 実装後の検証: `npx tsc --noEmit` → `npx vitest run` → `supabase db reset` + `supabase test db` → `npm run dev` + Playwright（P4 と同じく手元の chromium を一時 config で指定。一時 config はコミットしない）
- migration を書いたら `supabase db reset` → `supabase gen types typescript --local > src/types/database.ts`
- `messages` RLS の更新は「変更」だが、条件を広げる方向（旧条件 OR 新条件）で既存挙動を包含するため、作業中に適用してもステージング利用に影響しない
- コミットはユーザー承認後。完了 → 承認 → ③にコミット → ②へ `--no-ff` マージ → push
