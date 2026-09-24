# 現行仕様まとめ（料金・オプション・動画・銀行振込・運営アカウント・一覧）

最終更新: 2026-09-24
対象: 2026-08〜09 の改修（旧 P1〜P12・ステージング指摘対応）で決まった仕様の「今の姿」。経緯・議論・当時の設計は `docs/requirements/archive/2026-08-09/` に残している（`README.md` に索引）。

このファイルは「仕様の正」で、コード内コメント・ステアリング（`.kiro/steering/`）・CLAUDE.md の各ルールはここを参照する。数字（金額・上限）はコードの定数が実値で、ここに書いた値と一致させること。

---

## 1. 基本プラン

| | 無料 | ライト | スタンダード | プレミアム | ハイエンド |
|---|---|---|---|---|---|
| 内部キー（`plan_type`） | `free` | `individual` | `small` | `corporate` | `corporate_premium` |
| 月額（税込） | ¥0 | ¥2,800 | ¥9,800 | ¥28,000 | ¥168,000 |
| 年額（税込・暫定） | ¥0 | ¥28,000 | ¥98,000 | ¥280,000 | ¥1,680,000 |
| 案件募集 | - | ○ | ○ | ○ | ○ |
| 現場掲載 | - | 同時 1 件まで | 無制限 | 無制限 | 無制限 |
| 上位表示 | - | - | ○ | ○ | ○ |
| 複数人利用（担当者） | - | - | - | 5 人まで | 30 人まで |
| 代理アカウント | - | - | - | ○ | ○ |

- 定数: `src/lib/constants/plans.ts`（`PLAN_LIMITS` / `PLAN_LABELS` / `INITIAL_FEE_TAX_INCLUDED` / `YEARLY_PRICE_TAX_INCLUDED`）。表示名はここに一元化し、UI・メールは必ず参照する。
- **初回事務手数料 ¥12,000**（税込）。基本プランへ初めて申し込むときだけ。カード払いは Stripe の Price（`STRIPE_PRICE_INITIAL_FEE`）を line item に足す。銀行振込は請求書で請求（アプリは判定しない）。
- **年額は暫定「月額 × 10」**（`YEARLY_PRICE_MONTHS`）。正式金額が決まったら定数と Stripe の年額 Price を同時に差し替える（`scripts/stripe/setup-yearly-prices.mjs`）。
- **上位表示**はスタンダード以上。DB の `users.list_plan_rank` / `jobs.owner_plan_rank`（0 = 無料・ライト / 1 = スタンダード / 2 = プレミアム / 3 = ハイエンド）で実装し、`subscriptions` のトリガーが自動更新する（§8）。
- 「法人プラン」「法人向け」と書かれている場合は、組織機能（複数人利用・代理アカウント）を持つプレミアム / ハイエンドの総称。「個人プラン」はライト / スタンダードの総称。
- プラン比較表（`/billing/plans`、CLI-026 プラン一覧）の行はクライアント確定の文言。検索機能・サポート担当（スカウト）・代理メッセージの通数・動画の付属はアプリで制御しない（案内上の目安・運用対応）。「サポート担当（スカウト）」= 管理運営アカウント（§7）が職人へ企業を、企業へ職人をメッセージで紹介する運用。

## 2. お支払い方法

### 2.1 クレジットカード（Stripe）

- 申込: Stripe Checkout → `checkout.session.completed` Webhook → RPC `handle_checkout_completed_plan` で契約行作成・role 昇格・有効化メール。
- **アップグレード（上位プラン / 月払い → 年払い）は Stripe のホスト画面で確定する**。`changePlanAction` が Customer Portal の `subscription_update_confirm` セッション URL を返し、会員が Stripe 側で日割り差額・次回請求を確認して確定。**差額（年払い切替なら年額 − 月払いの未使用分）は確定した当日に請求書化して決済する**（ポータル設定 `proration_behavior=always_invoice`。2026-09-24 に `create_prorations` から変更。それ以前は差額が次回更新日にまとめて請求されていた）。DB 更新と「プラン変更を承りました」メールは `customer.subscription.updated` Webhook が行う（Server Action は先行 UPDATE もメール送信もしない）。
- **ダウングレード（下位プラン / 年払い → 月払い）はアプリ内ダイアログで期末切替を予約**（Stripe の subscription schedule）。予約中は他のプランを選べない。予約の取消はアプリ内。予約内容は Server Action が DB に先行書き込みし、予約メールも同期送信する（Webhook の到着順に依存しない）。期末に適用されたら Webhook が予約カラムを消し、Stripe のスケジュールも終了する（適用後に「変更予定」が残らない）。
- **解約**はアプリ内（期末解約の予約）。支払い遅延（`past_due`）中は即時解約のみ。未払い 7 日で Edge Function `auto-cancel-past-due` が自動解約。
- **サイクル切替ルール**: プランのランク差があればランクが優先。同じプランなら 月払い → 年払い = 即時（アップグレード扱い）、年払い → 月払い = 次回更新日（ダウングレード扱い）。判定は `comparePlanChange()`（`src/lib/billing/compare-plans.ts`）。
- Stripe の Price は 月額 4 + 年額 4 + 初回事務手数料 1 + オプション（急募 1・動画 3・補償 2）。環境変数名は `.env.local.example` を正とする。Webhook は Price ID から `resolvePlanPriceFromId()` でプランとサイクルを解決する。
- ポータル設定は 2 つ: `STRIPE_PORTAL_CONFIGURATION_ID`（お支払い情報の管理 = カード更新・請求履歴）と `STRIPE_PORTAL_UPDATE_CONFIGURATION_ID`（プラン変更確認専用）。混ぜない。

### 2.2 銀行振込

**アプリは「プランのオン／オフ」だけを持つ。** 申込レコード・ステータス・金額計算・利用開始日・有効期限・期限延長・期限通知は持たない。請求書・振込先・支払期限・更新時期はアプリ外（会計ソフト等）で管理する。

流れ:

1. 会員が**ログイン中に**お問い合わせ（COM-008）で「お支払い方法（銀行振込）について」を選び、希望プラン（基本プラン 4 種 + 動画プラン 3 種）を指定して送る。未ログインには選択肢を出さず、Server Action でも拒否する。
2. 運営は ADM-025「銀行振込お問い合わせ一覧」（`/admin/bank-transfers`。`contacts` を種類で絞った一覧。ステータスなし）で確認し、各行の「お問い合わせ詳細」（ADM-017）へ。ADM-017 は上部に「送信時のログインアカウント：（登録メール）」を文字で出し、フォームのメールと違えば注意書きを出す。**ユーザー詳細への直リンクは置かない**（複数アカウントの取り違え防止。運営は ADM-008 で検索する）。
3. 請求書送付・入金確認（アプリ外）。
4. ADM-009 ユーザー詳細の「銀行振込」枠（`<BankTransferPanel>`）でプランを「有効にする」→ 契約行（`payment_method='bank_transfer'`, `current_period_end=NULL`）を作り、role 昇格・`client_profiles`・組織作成・監査ログ・有効化メール（Stripe 経路と同じ副作用 = `grantBankTransferPlan()`）。以降の「変更する」「無効にする」、動画プランの「有効にする」も同じ枠。**枠は ADM-009 だけ**に置く（ADM-004 発注者詳細はプラン・支払い方法の表示のみ）。

ルール:

- 対象は基本プラン 4 種と動画プラン 3 種。急募と補償は対象外。
- 銀行振込行は `billing_cycle='monthly'` 固定・`current_period_end=NULL`（期限なし。運営が「無効にする」まで有効）。**`current_period_end` を表示・判定に使わない。**
- 有料判定（`is_paid_user()` / `resolveEffectiveSubscription`）は支払い方法を問わない。Stripe を呼ぶ処理（プラン変更・解約・ポータル・未払い自動解約）は `payment_method='stripe'` に絞り、銀行振込行には `BANK_TRANSFER_MANAGED_BY_OPS_MESSAGE` を案内する。
- **支払い方法の切り替えは同じ契約行の書き換え**で行う（有効な契約は常に 1 行）。
  - カード → 銀行振込: 運営が ADM-009 で「銀行振込に切り替える」→ Stripe の schedule を release → Stripe を即時解約（日割り返金なし）→ 同じ行を銀行振込に UPDATE。その後の Stripe Webhook は行が見つからず skip する。
  - 銀行振込 → カード: 会員が料金プラン画面の「カード払いにする」で Checkout → RPC `handle_checkout_completed_plan` が銀行振込行を後処理なしで終了させてから Stripe 行を作る。運営宛の新規申込メールに「以後、銀行振込の請求書は不要」の一文が入る。会員向けの画面にはこの仕組みを書かない。
- 会員向け案内: 料金プラン画面末尾と FAQ Q17 に「銀行振込をご希望の方はログインのうえお問い合わせください」。
- 管理画面の Server Action は `src/app/admin/(protected)/clients/[id]/bank-subscription-actions.ts` に集約。E2E は `e2e/bank-transfer.spec.ts`。

## 3. オプションプラン

| オプション | 内部キー | 価格（税込） | 課金 | 内容 |
|---|---|---|---|---|
| プロフィール動画制作プラン | `video` | ¥100,000/動画 | 買い切り（Stripe payment / 銀行振込） | スタッフが現地で撮影・編集し、本人や会社を紹介する動画を制作。掲載先（ユーザー詳細 / 発注者詳細）は運営が ADM-027 で選ぶ。プレミアム・ハイエンドには付属（アプリでは判定しない。注意書きと運用） |
| ユーザー撮影動画制作プラン | `video_shooting` | ¥20,000/動画 | 買い切り（同上） | 会員が指定の構成で撮った素材を運営が編集して掲載。素材の授受はアプリ外 |
| ビジ友公式SNS動画制作プラン | `video_sns` | ¥120,000/動画 | 買い切り（同上） | スタッフが撮影・編集し公式 SNS で紹介。掲載先はアプリ外。プレミアム・ハイエンドの年払いには付属（運用） |
| 急募 | `urgent` | ¥20,000/7 日間 | 買い切り（Stripe payment のみ） | 掲載中の案件を 7 日間、募集一覧の最上位に表示し「急募」タグを付ける。案件を掲載できる有料プランの会員のみ |
| 補償（¥5,000 / ¥9,800）| `compensation_5000` / `compensation_9800` | 月額 | Stripe subscription | **販売停止中**（保険業法上のリスクにより保険会社との別契約に切り出す方針）。`NEXT_PUBLIC_COMPENSATION_OPTION_ENABLED=true` のときだけ料金画面と Checkout で受け付ける。加入中の契約の表示・解約・Webhook・メールはフラグに関係なく動く。コードは削除しない |

- 定義は `src/lib/billing/options.ts`（`OptionType` / `OPTION_LABELS` / `OPTION_PRICES_TAX_INCLUDED` / `VIDEO_OPTION_TYPES` / `VIDEO_OPTION_UI_NAMES`）。動画 3 種は同じ経路（Checkout・Webhook `handleVideoOption`・銀行振込の有効化・メール）で扱う。
- 動画プランは全会員（staff / admin 以外）が購入でき、**再購入できる**（作り直しのため。画面は「再度購入する」+ 確認ダイアログ）。
- 旧「自己PR動画掲載」「職場紹介動画掲載」（`video_workplace`）はプロフィール動画制作プランに統合し、キーごと削除済み。既存行は migration で `video` に書き換えた。復活させない。
- 報酬未払いの窓口: お問い合わせ（COM-008）「報酬未払いについて」= 発生前の相談、トラブル報告（COM-012）「報酬未払い」= 発生後。選択肢は `src/lib/constants/contact-options.ts` / `trouble-options.ts`。

## 4. 料金プラン画面（CLI-026、`/billing`）

画面名は「料金プラン」（マイページ・ヘッダーのメニュー名も同じ）。上から:

1. **ご契約状況**: プラン（「ご利用中」バッジ）、お支払い方法（クレジットカード・月払い/年払い または 銀行振込）、次回更新日、変更予定 / 解約予定、支払い遅延の警告。操作は「お支払い情報を管理する」（Stripe ポータル）と、状態に応じて「解約する」「即時解約する」「変更をキャンセルする」「解約をキャンセルする」の 1 つ。銀行振込中は運営が管理する旨の案内。無料は「無料プラン」と初回事務手数料の注意書き。
2. **基本プラン**: プラン比較表へのリンク、月払い / 年払いの切替タブ、4 プランの行。行のボタンは **「2,800円/月 このプランにする」のように価格 + 「このプランにする」の 1 種類**（年払いタブは「〜円/年」、銀行振込中は「〜円/月 カード払いにする」）。契約中の行は「ご利用中」バッジのみ。予約中・支払い遅延中・担当者は押せない。
3. **オプションプラン**: 「購入済み」（動画プランの購入日つき一覧）→ 動画 3 プラン（価格 + 1 行の説明 + 「詳しく見る」でたたむ注意書き + 短い名前入りの「プロフィール動画を申し込む」/「〜を再度購入する」。短い名前は `VIDEO_OPTION_SHORT_NAMES` = プロフィール動画 / ユーザー撮影動画 / 公式SNS動画）→ 急募（価格・説明は常時。案件の選択と申込は有料のみ）→ 補償（販売中または加入中のときだけ）。
4. 銀行振込の案内 1 行、「もどる」。

担当者（staff）は閲覧のみ（全ボタン無効）。実装は `src/app/(authenticated)/billing/`（`page.tsx` が状態を組み立て、`BillingClient.tsx` が描画）。

## 5. 動画基盤

- `videos` テーブル（1 行 = 1 本。`placement` = `contractor_page`（ユーザー詳細） / `client_page`（発注者詳細）、`sort_order`、`provider` = `cloudflare` / `external`、`status` = `processing` / `ready`）。旧 `users.video_url` / `client_profiles.workplace_video_url` は参照しない（DROP 予定）。
- **表示はオプション購入の有無で出し分けない**。`getReadyVideos()` → `<VideoList>` の 1 パターン。会員が見る見出しは掲載先に関係なく「プロフィール動画」（`VIDEO_SECTION_LABEL`）。
- 登録・並び替え・削除は管理者専有（ADM-027 `/admin/users/[id]/videos`。タブ名は画面名 `VIDEO_PLACEMENT_LABELS`）。MP4 は Cloudflare Stream に**ブラウザから直接**アップロード（`createVideoUploadAction` で一時 URL 発行）。処理完了は Webhook `/api/webhooks/cloudflare-stream` か「状態を確認」で `ready` に。削除は Cloudflare 側も消す。
- 掲載お知らせメールは「その掲載場所で公開中が 0 → 1 本になったとき」だけ。本文は【掲載先】（`VIDEO_PLACEMENT_MEMBER_LABELS`）。
- 環境変数 `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_STREAM_API_TOKEN` / `CLOUDFLARE_STREAM_WEBHOOK_SECRET` が無い環境では URL 登録だけ動く。
- 会員向けの表示枠は縦長 9:16 で統一（`src/components/video-embed/video-frame.ts`）。

## 6. 管理画面の関連仕様

| 画面 | 仕様 |
|---|---|
| ADM-003 発注者一覧 | オプションの絞り込み・行バッジは**急募のみ** |
| ADM-004 発注者詳細 | プラン・支払い方法（カードは月払い / 年払い付き）の表示、急募の加入状況（案件名 + 期限を 1 件 1 行）。銀行振込の操作枠は置かない。ADM-009 へのリンクは置かない |
| ADM-008 ユーザー一覧 | オプションの絞り込みは動画 3 プラン（正式名）のみ |
| ADM-009 ユーザー詳細 | 「銀行振込」枠（§2.2）。動画プラン欄に「購入済み:」一覧（カード・振込両方）。発注者でもある会員には ADM-004 と同じ「アカウントを削除する」。ADM-004 へのリンクは置かない。管理運営アカウントには「管理運営」バッジのみ（設定画面はない） |
| ADM-014 応募詳細 | 評価・完了報告の入力期間（初回稼働日〜稼働終了日 + 5 日）を過ぎた `accepted` は「完了扱いにする」「発注を取り消す」で運営が解消できる（当事者の退会がブロックされ続けるのを防ぐ） |
| ADM-016/017 お問い合わせ | ログイン中に送られたものは「ログイン時に送信」バッジ + 「送信時のログインアカウント」の文字表示。ユーザー詳細への直リンクなし。トラブル報告・求人お問い合わせの詳細には従来どおり導線あり |
| ADM-025 銀行振込お問い合わせ一覧 | §2.2 |
| ADM-027 動画管理 | §5 |

## 7. 管理運営アカウント

- 運営が「職人を発注者へ提案 / 案件を職人へ提案」するために使う会員。`users.role='client'` + `users.is_hidden=true`。ハイエンド相当の発注者として通常画面を使う。
- 他の会員の「人を探す」画面・導線には出さない: 職人一覧 / 職人詳細 / 発注者一覧 / 発注者詳細 / 求人お問い合わせ / マイリスト / 評価詳細 / スカウト送信 / 新規スレッド作成。**RLS では隠さない**（メッセージ相手・応募者・案件の発注者として見える必要がある）。
- 契約は普通の銀行振込行（`corporate_premium`、期限なし）。設定は開発側: ADM-009 の銀行振込枠でハイエンドを有効化 → SQL で `is_hidden = true`。設定画面・Server Action は持たない。管理画面には「管理運営」バッジを出す。
- メッセージの「自分側 / 相手側」は side の user id 集合で判定する（`computeIsMine`）。個人⇔個人・個人⇔組織・組織⇔組織のいずれでも対称に動く。

## 8. 一覧の並び替え

- 発注者一覧（CON-005）と案件一覧（CON-002）の「おすすめ順」はプラン順（ハイエンド → プレミアム → スタンダード → その他。案件はさらに急募が先）。`users.list_plan_rank` / `jobs.owner_plan_rank` をトリガーで自動更新する。TS 側でランクを更新したり `subscriptions` を join したりしない。
- 並び替え UI は共通部品 `<SortSelect>` + `src/lib/constants/sort-options.ts` の定数（先頭 = 既定）。並び順は URL の `?sort=` を正とし、未知の値は既定に倒す。`SortSelect` は他の検索条件を引き継ぎ `page` を落とす。
- 対象: CON-002 / CON-005 / CON-007 / CON-011 / CLI-001 / CLI-005 / CLI-007 / CLI-007B / CLI-010。対象外: メッセージ一覧・管理画面の一覧。

## 9. 応募・スカウト・退会（ステージング指摘で確定したルール）

- 結果待ち（`applied`）の応募は受注者が日付制限なしで取り下げられる（CON-012「応募を取り下げる」。発注者組織へ通知メール）。発注済み（`accepted`）は初回稼働日の 5 日前まで。
- 期限を過ぎた `accepted` は ADM-014 で運営が解消する（§6）。退会ガードのメッセージには原因の案件名とお問い合わせ窓口を示す。
- スカウトの受信者は「送信者の反対側」で判定する（`resolveScoutRecipientUserIds()`）。法人 Owner が職人としてスカウトを受ける（両側が組織）場合も受諾 / 辞退できる。担当者（staff）には「返答は管理責任者のみ」の案内。送信側には「相手の返答を待っています」。
- 管理画面の「もどる」は `backTo` を全経路（検索・ページ送り・並び替え・子リンク）で維持する。検索フォームは URL 由来の初期値を `key` にして state を作り直す。
- 入力欄はスマホで 16px 以上。検索条件パネルは開いた直後に自動フォーカスしない。

## 10. 環境変数（このまとめに関係するもの）

`.env.local.example` を正とする。

- Stripe: `STRIPE_PRICE_INDIVIDUAL` / `_SMALL` / `_CORPORATE` / `_CORPORATE_PREMIUM`（月額 4）、同 `_YEARLY`（年額 4）、`STRIPE_PRICE_INITIAL_FEE`、`STRIPE_PRICE_URGENT`、`STRIPE_PRICE_VIDEO` / `_VIDEO_SHOOTING` / `_VIDEO_SNS`、`STRIPE_PRICE_COMPENSATION_5000` / `_9800`、`STRIPE_PORTAL_CONFIGURATION_ID`、`STRIPE_PORTAL_UPDATE_CONFIGURATION_ID`
- Cloudflare: `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_STREAM_API_TOKEN`、`CLOUDFLARE_STREAM_WEBHOOK_SECRET`
- フラグ: `NEXT_PUBLIC_COMPENSATION_OPTION_ENABLED`（未設定 = 補償の販売停止）

## 11. 関連ファイル

- 定数: `src/lib/constants/plans.ts`、`src/lib/billing/options.ts`、`src/lib/constants/contact-options.ts`、`src/lib/constants/sort-options.ts`
- 課金: `src/app/(authenticated)/billing/`、`src/lib/billing/`（`grant-plan.ts` / `activation-emails.ts` / `webhook/`）
- 銀行振込（管理画面）: `src/components/admin/bank-transfer-panel.tsx`、`src/app/admin/(protected)/clients/[id]/bank-subscription-actions.ts`、`src/lib/admin/bank-transfers.ts`
- 動画: `src/lib/videos/`、`src/lib/cloudflare/stream.ts`、`src/app/admin/(protected)/users/[id]/videos/`
- DB: `.kiro/steering/database-schema.md`（subscriptions / option_subscriptions / videos / list_plan_rank）
- 出荷手順: `docs/requirements/staging-release-checklist-202609.md`（Stripe / Cloudflare / Vercel の設定手順。反映後も本番で再利用）
