# ステージング反映 設定チェックリスト（2026-09 改修 P1〜P9 + ステージング指摘修正）

作成: 2026-09-09。対象コード: `feature/spec-changes-202608`（origin に push 済、先端 678dfc6）。
このファイルは **Claude（Cowork）に引き継いで設定作業を進めるための手順書**。根拠は 8 月末の分岐点（`client/staging` = 583711d）から現在までのコード差分。

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

### A1. Stripe: 年払い Price 4 本 + プラン変更用ポータル設定

- **人間が自分のターミナルで** 1 回実行（Claude Code の `!` プレフィックスは使わない）:
  ```
  node scripts/stripe/setup-yearly-prices.mjs
  ```
  - `.env.local` の `STRIPE_SECRET_KEY`（ステージングで使っている Stripe アカウントのもの）で動く。金額指定は不要（既定で月額 × 10）
  - 出力される次の 5 行を控える（これらは識別子なので Claude に見せてよい）:
    `STRIPE_PRICE_INDIVIDUAL_YEARLY` / `STRIPE_PRICE_SMALL_YEARLY` / `STRIPE_PRICE_CORPORATE_YEARLY` / `STRIPE_PRICE_CORPORATE_PREMIUM_YEARLY` / `STRIPE_PORTAL_UPDATE_CONFIGURATION_ID`
  - 期待金額（税込・年）: ライト 38,000 / スタンダード 148,000 / プレミアム 480,000 / ハイエンド 1,480,000

### A2. Stripe: ユーザー撮影プラン（買い切り 20,000 円）の Price

- Stripe ダッシュボード → 商品 → 新規作成（名称例「ユーザー撮影プラン」、一回限り、¥20,000 税込）
- 作成された `price_…` を控える → `STRIPE_PRICE_VIDEO_SHOOTING`

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

### B1. ステージング DB にマイグレーション 6 本を適用

- 事前に **人間のターミナルで** `supabase login`（前回の CLI 更新で未ログイン化しているため）
- 適用（Claude 実行可。秘密は表示されない）:
  ```
  supabase db push --linked
  ```
- 対象（すべて「追加のみ」。既存のステージング動作に影響しない）:
  1. `20260901120000_bank_transfer.sql` … 銀行振込（申込テーブル・pg_cron 2 本）
  2. `20260901130000_stripe_yearly_billing_cycle.sql` … 年払い（billing_cycle）
  3. `20260902120000_videos.sql` … 動画テーブル（旧カラムからコピー移行。旧カラムは残す）
  4. `20260902130000_ops_account.sql` … 管理運営アカウント（users.is_hidden、messages RLS）
  5. `20260902140000_list_plan_rank.sql` … 一覧のプラン順ランク列
  6. `20260902150000_bank_transfer_video_shooting.sql` … 撮影プランの銀行振込許可
- 確認: `supabase migration list --linked` で Remote 列に 6 本が並ぶ

### B2. cron ジョブの通知先を確認（Supabase Studio の SQL Editor）

- 実行（SELECT のみ）:
  ```sql
  select jobname, schedule, command from cron.job order by jobname;
  ```
- `bank-transfer-expiry-notify` の command 内 URL が `https://mfrlsbnqybvkzwsmiolm.supabase.co/functions/v1/bank-transfer-expiry-notify` になっていること。
  `host.docker.internal` や `placeholder-set-via-app-settings` が入っていたら、既存の `auto-cancel-past-due` ジョブと同じ URL 形式・同じ Authorization ヘッダーの形に **人間が** SQL で登録し直す（`cron.unschedule` → `cron.schedule`。Authorization に service_role キーが入るため Claude は関与しない）。
- あわせて `expire-options` が登録されていることも確認

### B3. Edge Function 2 本をデプロイ + secrets

- デプロイ（Claude 実行可）:
  ```
  supabase functions deploy bank-transfer-expiry-notify --project-ref mfrlsbnqybvkzwsmiolm
  supabase functions deploy auto-cancel-past-due --project-ref mfrlsbnqybvkzwsmiolm
  ```
- secrets（**人間のターミナルで**。値は Claude に見せない）。`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` は Supabase が自動で渡すため設定不要:

  | 名前 | 用途 | 秘密? |
  |---|---|---|
  | `RESEND_API_KEY` | 期限通知メール送信 | **秘密** |
  | `EMAIL_FROM` | 送信元アドレス（本体アプリと同じ値） | いいえ |
  | `OPS_NOTIFICATION_EMAIL` | 運営の受信先 | いいえ |
  | `APP_URL` | メール内リンクの基点 = https://staging.bijiyuu.net | いいえ |
  | `STRIPE_SECRET_KEY` | auto-cancel-past-due 用（既に設定済みのはず。無ければ追加） | **秘密** |

  例: `supabase secrets set EMAIL_FROM=... OPS_NOTIFICATION_EMAIL=... APP_URL=https://staging.bijiyuu.net --project-ref mfrlsbnqybvkzwsmiolm`
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
| `NEXT_PUBLIC_COMPENSATION_OPTION_ENABLED` | 設定しない（未設定 = 補償オプション非表示・販売停止） | 任意 | — |
| `NEXT_PUBLIC_BANK_TRANSFER_SELF_SERVICE_ENABLED` | 設定しない（未設定 = 本人申込ボタン非表示、運営が代理登録） | 任意 | — |
| `CLOUDFLARE_ACCOUNT_ID` | A3 | A3 完了後 | いいえ |
| `CLOUDFLARE_STREAM_API_TOKEN` | A3 | A3 完了後 | **秘密** |
| `CLOUDFLARE_STREAM_WEBHOOK_SECRET` | A4 の出力 | A4 完了後 | **秘密** |

- 既存の変数（`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_*`（月額 4 + オプション） / `STRIPE_PORTAL_CONFIGURATION_ID` / `NEXT_PUBLIC_APP_URL` / Supabase 3 種 / Resend 系）はそのまま
- 環境変数を追加・変更したら **再デプロイが必要**（B5 のデプロイで反映される）

### B5. コードの反映（feature → クライアント側 staging）

1. `feature/spec-changes-202608` をクライアント側リモートへプッシュ（Claude 実行可）:
   ```
   git push client feature/spec-changes-202608
   ```
2. GitHub `bijiyu-app/bijiyu` で Pull Request: base `staging` ← compare `feature/spec-changes-202608`。内容は P1〜P9 と ステージング指摘修正 A〜D（本文に `docs/requirements/spec-changes-202608.md` と `staging-check-fix-plan-202609.md` を参照）
3. マージ → Vercel が自動デプロイ。完了を待つ
4. マージ前に B1〜B4 が済んでいること（コードが新しい DB 列・環境変数を前提にしている）

---

## C. 反映直後の確認と運営作業

| # | 作業 | 誰が |
|---|---|---|
| C1 | スモーク: ログイン → マイページ → 料金プラン（年払い切替・金額表示）→ 案件一覧 → メッセージ を開く | Claude 案内 + 人間 |
| C2 | **詰みデータの解消**: 管理画面 → 応募履歴一覧 → 「表町電気工事」「かずひで333」の応募詳細（ADM-014）→「完了扱いにする」。その後、該当クライアントのアカウントで退会画面が通ること（実際に退会はしない）を確認 | 人間 |
| C3 | **管理運営アカウントの実登録**: 管理画面 → 発注者アカウント → 新規招待（ADM-006/007）で運営用アカウントを作成 → ユーザー詳細（ADM-009）の「管理運営アカウントに設定」 | 人間 |
| C4 | Stripe 実決済: 年払いでの申込 / 月払い→年払い切替（Stripe ホスト画面）/ 撮影プラン購入 を各 1 回。Webhook で `subscriptions.billing_cycle` 等が入ること | 人間 |
| C5 | Cloudflare（A3〜A4 済なら）: ADM-027 で MP4 を 1 本アップロード → 「状態を確認」で ready → 会員画面に表示 | 人間 |
| C6 | 開発中のテストデータで不要なもの（名前に「テスト」）を削除。ステージング DB の実データは削除以外変更しない | 人間 |

---

## D. 後日・別判断

- 旧動画カラム（`users.video_url` / `client_profiles.workplace_video_url`）の **DROP マイグレーションは未作成**。B5 後に落ち着いてから作成・適用（残しておいて害はない）
- 年払いの正式金額が決まったら `YEARLY_PRICE_TAX_INCLUDED`（`src/lib/constants/plans.ts`）と Stripe の年額 Price（`scripts/stripe/setup-yearly-prices.mjs` の `YEARLY_AMOUNTS` で上書き実行）を同時更新
- 本番公開前: 法務ページのプレースホルダー（利用規約の施行日、プライバシーポリシーの保護管理者・制定日）、ログイン CSRF の判断
- 開発環境: `npx playwright install chromium` を対話ターミナルで完了させる（E2E の一時設定を不要にする）

## 参照

- 変更内容: `docs/requirements/spec-changes-202608.md`（P1〜P9）、`docs/requirements/staging-check-fix-plan-202609.md`（指摘修正 A〜D と実装結果）
- 環境変数の見本: `.env.local.example`
- ブランチ運用: `spec-changes-202608.md` §5
