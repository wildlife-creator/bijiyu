# ステージング反映 設定チェックリスト（2026-09 改修 P1〜P11 + ステージング指摘修正）

作成: 2026-09-09。更新: 2026-09-10（P10 動画プラン整理・P11 価格改定と比較表・運営宛メールを反映）。対象コード: `feature/spec-changes-202608`（origin に push 済。先端は `git log origin/feature/spec-changes-202608 -1` で確認。2026-09-10 時点で 4d1f979 以降）。
このファイルは **Claude（Cowork）に引き継いで設定作業を進めるための手順書**。根拠は 8 月末の分岐点（`client/staging` = 583711d）から現在までのコード差分。

**2026-09-10 の追加分の要点**（詳細: `docs/requirements/archive/2026-08-09/video-plans-handoff-202609.md`。現在の仕様は `docs/requirements/current-spec.md`）:
- 動画プランを「プロフィール動画制作プラン（10 万）/ ユーザー撮影動画制作プラン（2 万）/ ビジ友公式SNS動画制作プラン（12 万・新設）」に整理。旧「職場紹介動画掲載」は新規販売停止 → Stripe Price の追加 1 本（A2）
- 月額を 2,800 / 9,800 / 28,000 / 168,000 円、初回事務手数料を 12,000 円に改定 → **Stripe の月額 Price 4 本 + 事務手数料 Price を作り直し、環境変数 5 本を差し替え**（A0・B4）
- 上位表示にスタンダードを追加、プレミアムの担当者上限 10 → 5 人 → マイグレーション 2 本追加（B1、計 8 本）
- 運営宛メールを 1 通新設（プランの新規申込）。宛先は既存の `OPS_NOTIFICATION_EMAIL` で設定作業の追加なし

## 0. 大前提（作業する Claude と人間の役割分担）

- **秘密の値（API キー・トークン・パスワード・署名 secret）は Claude に見せない。** Claude は「どの画面で・どの名前で・何を入れるか」を案内し、値の取得と貼り付けは人間が行う。貼り付け中は Claude の画面操作を止める。
- Claude が確認するときは **「変数名が存在するか」「動作するか」だけ**を見る。値を表示するコマンド（`cat .env.local`、Vercel の「値を表示」、`supabase secrets list` の値列 等）は実行しない。
- 秘密でないもの（Stripe の `price_…` / `bpc_…`、Supabase のプロジェクト ref、URL）は Claude が見ても問題ない。
- 万一見せてしまった鍵は、その発行元で**再発行**すれば無効化できる。

環境の対応:

| 項目 | 値 |
|---|---|
| ステージング URL | https://staging.bijiyuu.net |
| ステージング Supabase | プロジェクト `bijiyu-staging`（ref `mfrlsbnqybvkzwsmiolm`）。CLI で link 済み |
| Functions URL | https://mfrlsbnqybvkzwsmiolm.supabase.co/functions/v1/ |
| デプロイ元 | GitHub `bijiyu-app/bijiyu`（git リモート名 `client`）の `staging` ブランチ。ここに merge すると Vercel が自動デプロイ |
| コードの置き場 | GitHub `wildlife-creator/bijiyu`（リモート名 `origin`）の `feature/spec-changes-202608` |

決定済みの前提: 年払いの暫定金額は **月額 × 10**（定数 `YEARLY_PRICE_MONTHS`。正式金額は後日差し替えの可能性あり）。Cloudflare アカウントは開発側が作成する。

---

## A. 外部サービスの準備（反映前・いつでも可）

### A0. Stripe: 月額 Price 4 本 + 初回事務手数料 Price の金額変更（P11、2026-09-10 追加）

- 2026-09-10 のクライアント決定で月額と初回事務手数料が変わった。**A1 の年払い Price を作る前に**、Stripe ダッシュボードで次の Price を新しい金額で作成し（既存 Price の金額は変更できないため新規作成）、`.env.local` / Vercel の環境変数を差し替える:
  | 環境変数 | 旧 | 新（税込・月） |
  |---|---|---|
  | `STRIPE_PRICE_INDIVIDUAL`（ライト） | 3,800 | **2,800** |
  | `STRIPE_PRICE_SMALL`（スタンダード） | 14,800 | **9,800** |
  | `STRIPE_PRICE_CORPORATE`（プレミアム） | 48,000 | **28,000** |
  | `STRIPE_PRICE_CORPORATE_PREMIUM`（ハイエンド） | 148,000 | **168,000** |
  | `STRIPE_PRICE_INITIAL_FEE`（初回事務手数料・一回限り） | 20,000 | **12,000** |
- 古い Price は「アーカイブ」しておく
- **注意: 旧 Price に紐づく staging のテスト契約は、環境変数を差し替えた後に Stripe からの更新通知（プラン変更・更新・解約）が来ると「unknown price id」で処理に失敗する**（アプリは環境変数にある Price ID しか知らないため）。対策: 差し替え前に Stripe ダッシュボードで旧 Price の契約（staging のテスト契約のみ）をすべて解約しておく。C6 のテストデータ整理と合わせて実施
- 確認: `node scripts/cp1-verify-stripe.mjs`（期待金額は更新済み。`.env.local` の差し替え後に実行）

### A1. Stripe: 年払い Price 4 本 + プラン変更用ポータル設定

- **人間が自分のターミナルで** 1 回実行（Claude Code の `!` プレフィックスは使わない）:
  ```
  node scripts/stripe/setup-yearly-prices.mjs
  ```
  - `.env.local` の `STRIPE_SECRET_KEY`（ステージングで使っている Stripe アカウントのもの）で動く。金額指定は不要（既定で月額 × 10）
  - 出力される次の 5 行を控える（これらは識別子なので Claude に見せてよい）:
    `STRIPE_PRICE_INDIVIDUAL_YEARLY` / `STRIPE_PRICE_SMALL_YEARLY` / `STRIPE_PRICE_CORPORATE_YEARLY` / `STRIPE_PRICE_CORPORATE_PREMIUM_YEARLY` / `STRIPE_PORTAL_UPDATE_CONFIGURATION_ID`
  - 期待金額（税込・年、月額 × 10）: ライト 28,000 / スタンダード 98,000 / プレミアム 280,000 / ハイエンド 1,680,000（A0 の新しい月額 Price を元に作られる。A0 より先に実行すると旧金額で作られるので順番に注意）
- **ポータル設定の「日割り」は `always_invoice`（差額をその日に請求）であること**（2026-09-24 追加。支払い E2E 全パターンで発見・修正した不具合②）
  - 2026-09-24 より前のスクリプトは `create_prorations` で作っており、その設定だと**アップグレードの差額が次回更新日にまとめて請求され、月払い → 年払いの会員は 1 年間追加請求なし**になる。スクリプト（commit 110d7fb 以降）は `always_invoice` を出すよう修正済み
  - **A1 をまだ実行していない環境**: 上のスクリプトを実行すれば自動で正しい設定になる。追加作業なし
  - **A1 を 2026-09-24 より前に実行済みの環境**（ステージング・本番とも該当しうる）: 次のどちらかで直す
    - (a) Stripe ダッシュボード → 設定 → Billing → 顧客ポータル → 該当の設定（`STRIPE_PORTAL_UPDATE_CONFIGURATION_ID` の `bpc_…`、見出し「ビジ友 プラン変更」）→ サブスクリプションの更新 → 日割り計算を「即時請求」に変更（環境変数はそのまま）
    - (b) スクリプトをもう一度実行して、出力された新しい `STRIPE_PORTAL_UPDATE_CONFIGURATION_ID` を Vercel の環境変数に差し替える（年払い Price も作り直されるので、その 4 本も差し替える）
  - 確認: 会員がアップグレード（例: ライト → スタンダード）を確定した直後に、Stripe ダッシュボードの顧客の請求書に `subscription_update` の請求書（差額）が**その日付で**発行・決済されていること。次回更新まで未請求の明細が残っていたら未反映
  - ローカル（Claude の手元のサンドボックス）は反映済み。ステージング・本番の Stripe アカウントはそれぞれ別の設定を持つため、**環境ごとに**確認が必要

### A1b. Stripe: 商品名を日本語の表示名に揃える（2026-09-24 追加）

- Stripe の確認画面（プラン変更・決済）には商品名がそのまま会員に見える。初期の商品は `bijiyu_plan_corporate` のような内部名で、ローカルの支払い E2E で会員に見えていることを確認した
- **人間が自分のターミナルで**（対象環境の `STRIPE_SECRET_KEY` が入った `.env.local` で）:
  ```
  node scripts/stripe/rename-products.mjs          # 変更内容の確認だけ
  node scripts/stripe/rename-products.mjs --apply  # 更新
  ```
  - 名前だけを更新する（Price・金額・ID は変わらない）。ライトプラン / スタンダードプラン / プレミアムプラン / ハイエンドプラン / 初回事務手数料 / 急募オプション / 動画 3 プラン / 補償 2 種
  - ステージング・本番の Stripe アカウントごとに実行。A0〜A2 で新しく商品を作った後に実行する

### A2. Stripe: ユーザー撮影動画制作プラン（買い切り 20,000 円）・ビジ友公式SNS動画制作プラン（買い切り 120,000 円）の Price

- Stripe ダッシュボード → 商品 → 新規作成（名称例「ユーザー撮影動画制作プラン」、一回限り、¥20,000 税込）
- 作成された `price_…` を控える → `STRIPE_PRICE_VIDEO_SHOOTING`
- 同様に「ビジ友公式SNS動画制作プラン」（一回限り、¥120,000 税込）を作成 → `STRIPE_PRICE_VIDEO_SNS`（P10、2026-09-10 追加）
- 既存の「自己PR動画掲載」商品（`STRIPE_PRICE_VIDEO`）は名称を「プロフィール動画制作プラン」に変更しておく（Price ID はそのまま）。「職場紹介動画掲載」（`STRIPE_PRICE_VIDEO_WORKPLACE`）は新規販売停止だが、環境変数は残す（既存契約の Webhook 用。staging では未購入のため実害なし）

### A3. Cloudflare: アカウント + Stream 有効化（開発側が作成）

- Cloudflare ダッシュボード → Stream を有効化（支払い設定が必要）
- 控えるもの:
  - **Account ID**（Stream 画面右側。秘密ではない）→ `CLOUDFLARE_ACCOUNT_ID`
  - **API トークン**（My Profile → API Tokens → Create Token、権限 Account › Stream › Edit。**秘密**）→ `CLOUDFLARE_STREAM_API_TOKEN`

### A4. Cloudflare: 通知 URL（Webhook）の登録

- A3 の 2 つを `.env.local` に入れたうえで、**人間が自分のターミナルで**:
  ```
  node scripts/cloudflare/setup-stream-webhook.mjs https://staging.bijiyuu.net/api/webhooks/cloudflare-stream
  ```
- 出力される署名用 secret は**秘密**。そのまま Vercel の `CLOUDFLARE_STREAM_WEBHOOK_SECRET` に貼る（Claude に見せない）
- A3〜A4 が未完でも反映自体は可能（MP4 アップロードだけ使えない。URL 貼り付け登録は動く）

---

## B. 反映当日（この順番で）

### B1. ステージング DB にマイグレーション 8 本を適用

- 事前に **人間のターミナルで** `supabase login`（前回の CLI 更新で未ログイン化しているため）
- 適用（Claude 実行可。秘密は表示されない）:
  ```
  supabase db push --linked
  ```
- 対象（すべて「追加のみ」。既存のステージング動作に影響しない）:
  1. `20260901120000_bank_transfer.sql` … 銀行振込（申込テーブル・pg_cron 2 本。→ 9. で申込テーブルと期限 cron は削除される）
  2. `20260901130000_stripe_yearly_billing_cycle.sql` … 年払い（billing_cycle）
  3. `20260902120000_videos.sql` … 動画テーブル（旧カラムからコピー移行。旧カラムは残す）
  4. `20260902130000_ops_account.sql` … 管理運営アカウント（users.is_hidden、messages RLS）
  5. `20260902140000_list_plan_rank.sql` … 一覧のプラン順ランク列
  6. `20260902150000_bank_transfer_video_shooting.sql` … 撮影プランの銀行振込許可
  7. `20260910120000_video_plans_consolidation.sql` … 公式SNS動画の銀行振込許可（P10）
  8. `20260910130000_list_plan_rank_small.sql` … 上位表示にスタンダードを追加（既存行を再計算。P11）
  9. `20260916120000_bank_transfer_onoff.sql` … 銀行振込をオン／オフだけに（P12。申込テーブル・期限 cron・期限 index を削除、contacts.bank_transfer_plan 追加、handle_checkout_completed_plan v3）
- 確認: `supabase migration list --linked` で Remote 列に 9 本が並ぶ

### B2. cron ジョブの通知先を確認（Supabase Studio の SQL Editor）

- 実行（SELECT のみ）:
  ```sql
  select jobname, schedule, command from cron.job order by jobname;
  ```
- P12 で `bank-transfer-expiry-notify` は廃止（migration 9. が `cron.unschedule` する）。一覧に **残っていないこと** を確認する
- `auto-cancel-past-due` と `expire-options` が登録されていることを確認

### B3. Edge Function をデプロイ + secrets

- デプロイ（Claude 実行可。P12 で `bank-transfer-expiry-notify` は廃止 = デプロイ不要。既にデプロイ済みなら `supabase functions delete bank-transfer-expiry-notify --project-ref mfrlsbnqybvkzwsmiolm` で消してよい）:
  ```
  supabase functions deploy auto-cancel-past-due --project-ref mfrlsbnqybvkzwsmiolm
  ```
- secrets（**人間のターミナルで**。値は Claude に見せない）。`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` は Supabase が自動で渡すため設定不要:

  | 名前 | 用途 | 秘密? |
  |---|---|---|
  | `STRIPE_SECRET_KEY` | auto-cancel-past-due 用（既に設定済みのはず。無ければ追加） | **秘密** |

  ※ P12 で期限通知（`bank-transfer-expiry-notify`）を廃止したため、その用途だった `RESEND_API_KEY` / `EMAIL_FROM` / `OPS_NOTIFICATION_EMAIL` / `APP_URL` の Edge Function secrets は不要（設定済みでも害はない）
- 確認（名前だけ）: `supabase secrets list --project-ref mfrlsbnqybvkzwsmiolm` の名前列に上記があること

### B4. Vercel（ステージング環境）の環境変数

Vercel → プロジェクト → Settings → Environment Variables。対象環境はステージング（Preview の `staging` ブランチ、既存変数と同じ環境に揃える）。**人間が貼る。**

| 変数名 | 値の出どころ | 必須? | 秘密? |
|---|---|---|---|
| `STRIPE_PRICE_INDIVIDUAL_YEARLY` | A1 の出力 | 必須 | いいえ |
| `STRIPE_PRICE_SMALL_YEARLY` | A1 | 必須 | いいえ |
| `STRIPE_PRICE_CORPORATE_YEARLY` | A1 | 必須 | いいえ |
| `STRIPE_PRICE_CORPORATE_PREMIUM_YEARLY` | A1 | 必須 | いいえ |
| `STRIPE_PORTAL_UPDATE_CONFIGURATION_ID` | A1（`bpc_…`） | 必須 | いいえ |
| `STRIPE_PRICE_VIDEO_SHOOTING` | A2 | 必須 | いいえ |
| `STRIPE_PRICE_VIDEO_SNS` | A2（P10） | 必須 | いいえ |
| `STRIPE_PRICE_INDIVIDUAL` | A0（**既存の値を新 Price に差し替え**） | 必須 | いいえ |
| `STRIPE_PRICE_SMALL` | A0（差し替え） | 必須 | いいえ |
| `STRIPE_PRICE_CORPORATE` | A0（差し替え） | 必須 | いいえ |
| `STRIPE_PRICE_CORPORATE_PREMIUM` | A0（差し替え） | 必須 | いいえ |
| `STRIPE_PRICE_INITIAL_FEE` | A0（差し替え） | 必須 | いいえ |
| `NEXT_PUBLIC_COMPENSATION_OPTION_ENABLED` | 設定しない（未設定 = 補償オプション非表示・販売停止） | 任意 | — |
| `NEXT_PUBLIC_BANK_TRANSFER_SELF_SERVICE_ENABLED` | 設定しない（未設定 = 本人申込ボタン非表示、運営が代理登録） | 任意 | — |
| `CLOUDFLARE_ACCOUNT_ID` | A3 | A3 完了後 | いいえ |
| `CLOUDFLARE_STREAM_API_TOKEN` | A3 | A3 完了後 | **秘密** |
| `CLOUDFLARE_STREAM_WEBHOOK_SECRET` | A4 の出力 | A4 完了後 | **秘密** |

- 既存の変数（`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_VIDEO` / `STRIPE_PRICE_VIDEO_WORKPLACE` / `STRIPE_PRICE_URGENT` / 補償 2 本 / `STRIPE_PORTAL_CONFIGURATION_ID` / `NEXT_PUBLIC_APP_URL` / `OPS_NOTIFICATION_EMAIL` / Supabase 3 種 / Resend 系）はそのまま。**月額 4 本と初回事務手数料の 5 本だけは A0 の新 Price ID に差し替える**（上の表）
- 環境変数を追加・変更したら **再デプロイが必要**（B5 のデプロイで反映される）

### B5. コードの反映（feature → クライアント側 staging）

1. `feature/spec-changes-202608` をクライアント側リモートへプッシュ（Claude 実行可）:
   ```
   git push client feature/spec-changes-202608
   ```
2. GitHub `bijiyu-app/bijiyu` で Pull Request: base `staging` ← compare `feature/spec-changes-202608`。内容は P1〜P11 と ステージング指摘修正 A〜D（本文に `docs/requirements/archive/2026-08-09/` の `spec-changes-202608.md`、`staging-check-fix-plan-202609.md`、`video-plans-handoff-202609.md` を参照）
3. マージ → Vercel が自動デプロイ。完了を待つ
4. マージ前に B1〜B4 が済んでいること（コードが新しい DB 列・環境変数を前提にしている）

---

## C. 反映直後の確認と運営作業

| # | 作業 | 誰が |
|---|---|---|
| C1 | スモーク: ログイン → マイページ → 料金プラン（年払い切替・新金額 2,800/9,800/28,000/168,000・動画 3 プランの行）→ プラン一覧（比較表）→ 案件一覧（おすすめ順でスタンダード以上が上）→ メッセージ を開く | Claude 案内 + 人間 |
| C2 | **詰みデータの解消**: 管理画面 → 応募履歴一覧 → 「表町電気工事」「かずひで333」の応募詳細（ADM-014）→「完了扱いにする」。その後、該当クライアントのアカウントで退会画面が通ること（実際に退会はしない）を確認 | 人間 |
| C3 | **管理運営アカウントの実登録**: 管理画面 → 発注者アカウント → 新規招待（ADM-006/007）で運営用アカウントを作成 → ユーザー詳細（ADM-009）の「銀行振込」枠でハイエンドを「有効にする」→ **開発側が** Supabase の SQL エディタで `UPDATE users SET is_hidden = true WHERE email = '（運営用アカウントのメール）';` を実行（2026-09-17 変更: 管理画面の「管理運営アカウントに設定」は廃止）。確認: 管理画面の一覧に「管理運営」バッジが出る / 会員側の職人一覧・発注者一覧に出ない | 人間 + 開発 |
| C4 | Stripe 実決済: 年払いでの申込（初回事務手数料 12,000 円が乗ること）/ 月払い→年払い切替（Stripe ホスト画面。**確定した当日に差額の請求書 `subscription_update` が発行・決済されること** = A1 のポータル設定 `always_invoice` の確認。確認画面の商品名が「プレミアムプラン」等の日本語になっていること = A1b の確認）/ 撮影プラン購入 / 公式SNS動画購入 を各 1 回。Webhook で `subscriptions.billing_cycle` 等が入ること。**運営宛（`OPS_NOTIFICATION_EMAIL`）に「プランの新規お申し込みがありました」「動画オプションの新規お申し込みがありました」が届くこと** | 人間 |
| C4b | 銀行振込（P12）: 会員でログイン → お問い合わせで「お支払い方法（銀行振込）について」+ 希望プランを送信（会社名・氏名・メールが最初から入っていること）→ 運営宛通知メールに「希望プラン」が出ること → 管理画面「銀行振込お問い合わせ一覧」に出る → 「ユーザー詳細」→「銀行振込」枠で「有効にする」→ 会員宛「プランのお申し込みを承りました」と運営宛「プランの新規お申し込みがありました」が届き、料金プラン画面が「ご利用中」+「お支払い方法: 銀行振込」になること。発注者詳細でも同じ枠が出て「変更する」が効くこと | 人間 |
| C4c | 管理画面: ADM-008（ユーザーアカウント一覧）の絞り込みが「すべて / プロフィール動画制作プラン / ユーザー撮影動画制作プラン / ビジ友公式SNS動画制作プラン」だけであること（補償は無い）。ADM-003（発注者アカウント一覧）の絞り込みと行のバッジが急募だけであること。ADM-027 のタブ名が「ユーザープロフィール（ユーザー詳細）」「発注者情報詳細（発注者詳細）」になっていること | 人間 |
| C5 | Cloudflare（A3〜A4 済なら）: ADM-027 で MP4 を 1 本アップロード → 「状態を確認」で ready → 会員画面に表示 | 人間 |
| C6 | 開発中のテストデータで不要なもの（名前に「テスト」）を削除。ステージング DB の実データは削除以外変更しない。旧 Price に紐づく Stripe のテスト契約が残っていれば Stripe 側でも解約（A0 の注意参照） | 人間 |

---

## D. 後日・別判断

- 旧動画カラム（`users.video_url` / `client_profiles.workplace_video_url`）の **DROP マイグレーションは未作成**。B5 後に落ち着いてから作成・適用（残しておいて害はない）
- 年払いの正式金額が決まったら `YEARLY_PRICE_TAX_INCLUDED`（`src/lib/constants/plans.ts`）と Stripe の年額 Price（`scripts/stripe/setup-yearly-prices.mjs` の `YEARLY_AMOUNTS` で上書き実行）を同時更新
- 月額を再度変えるときは A0 と同じ手順（アプリ定数 `PLAN_LIMITS` + Stripe Price 作り直し + 環境変数差し替え + 旧 Price 契約の整理）
- 本番公開前: 法務ページのプレースホルダー（利用規約の施行日、プライバシーポリシーの保護管理者・制定日）、ログイン CSRF の判断
- 開発環境: `npx playwright install chromium` を対話ターミナルで完了させる（E2E の一時設定を不要にする）

## 参照

- 変更内容: `docs/requirements/archive/2026-08-09/spec-changes-202608.md`（P1〜P9）、同 `staging-check-fix-plan-202609.md`（指摘修正 A〜D と実装結果）、同 `video-plans-handoff-202609.md`（P10 動画プラン整理・P11 価格改定と比較表・メール整理）。現在の仕様は `docs/requirements/current-spec.md`
- 環境変数の見本: `.env.local.example`
- ブランチ運用: `docs/requirements/archive/2026-08-09/spec-changes-202608.md` §5
