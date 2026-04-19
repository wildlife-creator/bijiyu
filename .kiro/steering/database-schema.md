# データベース設計 — ビジ友

## 基本方針
- PostgreSQL（Supabase提供）
- テーブル名: snake_case, 複数形（users, jobs, messages）
- カラム名: snake_case（created_at, user_id）
- 外部キー: {テーブル名単数}_id（user_id, job_id）
- 主キー: UUID（Supabase のデフォルト）
- タイムスタンプ: timezone付き（timestamptz）
- 全テーブルに created_at, updated_at を付与
- ソフトデリート: deleted_at カラム（必要なテーブルのみ）

### updated_at 自動更新トリガー

全テーブルの `updated_at` を UPDATE 時に自動で現在時刻に更新するトリガーを、初回マイグレーションに含める。

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

`updated_at` カラムを持つ全テーブルに対して以下を適用する:

```sql
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON {テーブル名}
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

対象テーブル: users, jobs, applications, message_threads, subscriptions, option_subscriptions, client_profiles, organizations, organization_members, available_schedules, identity_verifications

## コアテーブル

### users（ユーザー）
Supabase Auth の auth.users（認証情報を管理するシステムテーブル）と連携。プロフィール情報を保持。

**auth.users との連携方法（Supabase 標準パターン）:**
- このテーブルは `public.users` として作成する（auth.users には直接カラムを追加できないため）
- `id` は `auth.users(id)` を外部キー（FK = 他テーブルを参照する仕組み）として参照する
- `ON DELETE CASCADE` を設定する（auth.users が削除されたら、public.users も自動で削除される）
- 新規ユーザー登録時は、Supabase の Database Trigger（トリガー = あるイベントが起きたら自動で処理を実行する仕組み）で auth.users への INSERT をきっかけに public.users にも行を自動作成する
- email は auth.users にもあるが、public.users にも保持する（RLS ポリシーで参照しやすくするため）
- **メールアドレス変更時の同期**: `auth.users.email` が UPDATE されたとき、AFTER UPDATE トリガー `on_auth_user_email_changed`（`handle_user_email_change()` を実行）で `public.users.email` を同期する。`supabase/config.toml` の `[auth.email] double_confirm_changes = true` により、旧新両方のメールアドレスで確認リンクがクリックされた時点で `auth.users.email` が実際に更新されるため、同期トリガーもそのタイミングで発火する（詳細は `authentication.md` のメール変更フロー参照）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | auth.users.id と同一 |
| role | text | 'contractor' / 'client' / 'staff' / 'admin' |
| email | text | メールアドレス |

**users.role と organization_members.org_role の使い分けルール:**

この2つは名前が似ているが、**用途がまったく異なる**:

- `users.role`: アプリ全体での立場を表す。Middleware（入口のチェック）で「この人は受注者か、発注者か、担当者か、システム管理者か」を判定するために使う
  - 'contractor' = 受注者（職人）
  - 'client' = 発注者（有料プラン加入者）
  - 'staff' = 法人プランの担当者（組織に所属するユーザー）
  - 'admin' = **システム管理者**（ビジ友の運営スタッフ。ADM画面にアクセスできる）

- `organization_members.org_role`: 組織の中での役割を表す。Server Action（操作ごとのチェック）で「この人は組織の中で何ができるか」を判定するために使う
  - 'owner' = 管理責任者
  - 'admin' = **組織管理者**（システム管理者とは別。自組織の担当者を追加・編集できる権限）
  - 'staff' = 担当者

**開発時の注意:** `users.role = 'admin'`（システム管理者）と `organization_members.org_role = 'admin'`（組織管理者）は名前が同じだが別の権限。混同しないこと。
| last_name | text | 姓 |
| first_name | text | 名 |
| gender | text | 性別 |
| birth_date | date | 生年月日 |
| prefecture | text | 都道府県 |
| company_name | text | 会社名/屋号（任意） |
| bio | text | 自己紹介 |
| avatar_url | text | プロフィール画像URL（Supabase Storage） |
| video_url | text | PR動画URL（TikTok等、動画掲載オプション） |
| is_active | boolean (DEFAULT true) | ログイン有効フラグ。false の場合 Middleware でログインをブロックする。past_due 超過時の担当者停止や、管理者によるアカウント一時停止に使用 |
| identity_verified | boolean | 本人確認済みフラグ |
| ccus_verified | boolean | CCUS登録済みフラグ |
| ccus_worker_id | text | CCUS技能者ID |
| stripe_customer_id | text | Stripe Customer ID |
| created_at | timestamptz | 作成日時 |
| updated_at | timestamptz | 更新日時 |
| deleted_at | timestamptz | 退会日時（ソフトデリート） |
| password_set_at | timestamptz (nullable) | 招待された担当者がパスワード設定を完了した時刻。`organization` spec の Migration file 9 で追加。CLI-022/023 の「招待中」バッジ判定（`IS NULL` で表示）と招待メール再送ボタン表示条件に使用。`acceptInviteAction` がパスワード保存成功時に admin client で `now()` を UPDATE する。`auth.users.user_metadata` ではなく自前カラムにする理由は一覧 SELECT で N+1 を避けるため |

### user_skills（ユーザースキル・職種）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| user_id | uuid (FK → users) | |
| trade_type | text | 職種（大工、電気工事士等） |
| experience_years | integer | 経験年数 |
| created_at | timestamptz | |

※ 1ユーザーにつき最大3職種

### user_qualifications（資格）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| user_id | uuid (FK → users) | |
| qualification_name | text | 資格名 |
| created_at | timestamptz | |

### user_available_areas（対応可能エリア）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| user_id | uuid (FK → users) | |
| prefecture | text | 都道府県 |
| created_at | timestamptz | |

## 案件・マッチング

### jobs（募集現場/案件）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| owner_id | uuid (FK → users) | 作成者（発注者） |
| organization_id | uuid (FK → organizations, nullable) | 所属組織 |
| title | text | 案件タイトル |
| description | text | 案件詳細 |
| prefecture | text | 勤務地（都道府県） |
| address | text | 詳細住所（勤務地） |
| trade_type | text | 募集職種 |
| headcount | integer | 募集人数 |
| reward_upper | integer | 報酬上限（円） |
| reward_lower | integer | 報酬下限（円） |
| work_start_date | date | 現場工期（開始） |
| work_end_date | date | 現場工期（終了） |
| recruit_start_date | date | 募集期間（開始） |
| recruit_end_date | date | 募集期間（終了） |
| work_hours | text | 稼働時間 |
| experience_years | text | 必要経験年数 |
| required_skills | text | 必須スキル |
| nationality_language | text | 国籍・言語 |
| items | text | 持ち物 |
| schedule_detail | text | スケジュール詳細 |
| project_details | text | 請負案件詳細 |
| owner_message | text | 発注者からのメッセージ |
| location | text | 勤務地（補足情報） |
| etc_message | text | 詳細その他 |
| status | text | 'draft' / 'open' / 'closed'。'closed' への自動遷移: ①募集期間終了（Edge Function `close-expired-jobs` が recruit_end_date 超過時に自動設定）、②発注者の支払い遅延による降格時（Edge Function `auto-cancel-past-due`）、③発注者の退会時（Server Action） |
| is_urgent | boolean | 急募フラグ（オプション） |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| deleted_at | timestamptz | |

### job_images（案件画像・書類）

案件に添付される画像や業務書類。1案件に複数添付可能。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| job_id | uuid (FK → jobs) | 対象案件 |
| image_url | text | Storage URL |
| image_type | text | 'photo'（現場写真）/ 'document'（業務書類） |
| sort_order | integer | 表示順 |
| created_at | timestamptz | |

### applications（応募）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| job_id | uuid (FK → jobs) | 応募先の案件 |
| applicant_id | uuid (FK → users) | 応募者（受注者） |
| headcount | integer | 応募人数 |
| working_type | text | 日程 |
| preferred_first_work_date | date | 初回稼働希望日 |
| first_work_date | date | 初回稼働日（確定後に設定） |
| message | text | 申し送り |
| client_notes | text | 発注者からの連絡事項（CLI-009-B で入力。CON-012「その他」に表示） |
| rejection_reason | text | お断り理由（CLI-009-C で入力。受注者には非公開） |
| document_urls | text[] | 発注者が応募レベルで添付した書類のファイルパス配列（CLI-009-B でアップロード → application-documents バケット）。非公開バケットのため表示時は `createSignedUrl()` で Signed URL を生成 |
| status | text | 'applied' / 'accepted' / 'rejected' / 'completed' / 'cancelled' / 'lost' |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| scout_message_id | uuid (FK → messages, nullable) | スカウト経由の応募の場合、元のスカウトメッセージID。通常の応募の場合は null。1スレッド内に複数スカウトが存在しうるため、スレッドIDではなくメッセージIDで特定する |

**制約:**
- UNIQUE (job_id, applicant_id) WHERE status NOT IN ('cancelled')
  — 同じ人が同じ案件に二重応募できないようにする部分UNIQUE制約（キャンセル済みのみ除外。rejected は除外しない = お断り後の再応募は不可）

<!--
  応募制限（無料ユーザー）:
  Server Actionで応募時に以下を検証する:
  - 無料ユーザーの場合: jobs.trade_type ∈ user_skills.trade_type AND jobs.prefecture ∈ user_available_areas.prefecture
  - 有料ユーザーの場合: 制限なし
  ※ RLSではなくServer Actionで制御（RLSはINSERT制御に複雑なJOINが必要になるため）

  再応募ルール:
  - cancelled（受注者キャンセル）後は同じ案件に再応募可能（UNIQUE制約から除外しているため）
  - rejected（お断り）後は同じ案件に再応募不可（UNIQUE制約に含まれているためDBレベルでブロック）
-->

### user_reviews（ユーザー評価 — 発注者→受注者）

発注者が受注者を評価する。6項目 + 補足。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| application_id | uuid (FK → applications) | 対象の応募 |
| reviewer_id | uuid (FK → users) | 評価者（発注者） |
| reviewee_id | uuid (FK → users) | 被評価者（受注者） |
| operating_status | text | 稼働状況（6選択肢: 問題なく稼働完了 / 一部欠席したものの概ね問題なく稼働完了 / 欠席（連絡あり）/ 欠席（連絡なし）/ 発注者側からお断り / その他） |
| status_supplement | text | 稼働状況の補足（CLI-028 で一覧表示） |
| rating_again | text | また依頼したいか（'good' / 'bad'） |
| rating_follows_instructions | text | 指示通りに動けるか（'good' / 'bad'） |
| rating_punctual | text | 稼働予定日にちゃんと来たか（'good' / 'bad'） |
| rating_speed | text | 作業は速いか（'good' / 'bad'） |
| rating_quality | text | 作業は丁寧か（'good' / 'bad'） |
| rating_has_tools | text | 工事に必要な工具を持っているか（'good' / 'bad'） |
| comment | text | 評価の補足コメント |
| created_at | timestamptz | |

**制約:**
- UNIQUE (application_id) — 1つの応募に対して評価は1回だけ（二重評価の防止）

### client_reviews（発注者評価 — 受注者→発注者）

受注者が発注者を評価する。現時点では1項目 + 補足。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| application_id | uuid (FK → applications) | 対象の応募 |
| reviewer_id | uuid (FK → users) | 評価者（受注者） |
| reviewee_id | uuid (FK → users) | 被評価者（発注者） |
| operating_status | text | 稼働状況（受注者側も同じ6選択肢） |
| status_supplement | text | 稼働状況の補足 |
| rating_again | text | また仕事を受けたいか（'good' / 'bad'） |
| comment | text | 評価の補足コメント |
| created_at | timestamptz | |

**制約:**
- UNIQUE (application_id) — 1つの応募に対して評価は1回だけ（二重評価の防止）

## メッセージ

### message_threads（メッセージスレッド）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| organization_id | uuid (FK → organizations, nullable) | 組織側の参加者。法人プランの場合に設定し、組織メンバー全員がスレッドにアクセス可能になる。個人プラン発注者の場合は null |
| participant_1_id | uuid (FK → users) | スレッド作成者（監査用、変更不可）。organization_id が設定されている場合でも、最初にスレッドを作成したユーザーのIDを記録する |
| participant_2_id | uuid (FK → users) | 受注者側の参加者（常に個人） |
| thread_type | text | 'message' / 'scout'。スカウトメッセージ（is_scout=true）を含むスレッドは 'scout' |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**制約:**
- UNIQUE (organization_id, participant_2_id) WHERE organization_id IS NOT NULL — 1組織 × 1受注者で常に1スレッド
- 個人スレッド（organization_id IS NULL）の一意性は participant_1_id + participant_2_id の組み合わせで Server Action 内で検証する

**スレッドモデル:**
- **法人プラン（organization あり）**: organization_id を設定。同一組織のメンバー全員がスレッドを閲覧・送信可能。誰が送信しても同じスレッドに入る
- **個人プラン（organization なし）**: organization_id = NULL。participant_1_id と participant_2_id の2者のみがアクセス可能（従来型）
- 将来、全発注者に organization を自動作成する段階で、個人スレッドを組織スレッドに移行する

### messages（メッセージ）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| thread_id | uuid (FK → message_threads) | 所属スレッド |
| sender_id | uuid (FK → users) | 送信者（メッセージを送信したユーザーのID） |
| body | text | メッセージ本文 |
| image_url | text | 添付画像URL（任意） |
| job_id | uuid (FK → jobs, nullable) | スカウト送信時の案件（スカウトの場合のみ） |
| is_scout | boolean | スカウトメッセージか（true = スカウト） |
| is_proxy | boolean | 代理アカウント（is_proxy_account = true の担当者）から送信されたメッセージか。発注者側の画面で「代理」バッジ表示に使用。受注者側には表示しない |
| read_at | timestamptz | 既読日時（null = 未読） |
| scout_status | text (nullable) | スカウト応答ステータス: 'pending' / 'accepted' / 'rejected'。is_scout = true のメッセージのみ使用。スカウトメッセージ作成時に 'pending' を設定し、受諾時に 'accepted'、拒否時に 'rejected' に更新する |
| created_at | timestamptz | |

**制約:**
- is_proxy はメッセージ送信時に sender の organization_members.is_proxy_account を参照して自動設定される
- CHECK: `(is_scout = false AND scout_status IS NULL) OR (is_scout = true AND scout_status IN ('pending', 'accepted', 'rejected'))` — スカウトメッセージのみ scout_status を持つ

## 課金・サブスクリプション

### subscriptions（サブスクリプション）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| user_id | uuid (FK → users) | 契約者 |
| stripe_subscription_id | text | Stripe Subscription ID |
| plan_type | text | 'individual' / 'small' / 'corporate' / 'corporate_premium' |
| status | text | 'active' / 'past_due' / 'cancelled' |
| current_period_start | timestamptz | 現在の課金期間開始 |
| current_period_end | timestamptz | 現在の課金期間終了 |
| past_due_since | timestamptz (nullable) | past_due 開始日時（支払い遅延がいつ始まったか） |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**制約:**
- UNIQUE (user_id) WHERE status IN ('active', 'past_due')
  — 1ユーザーにつき有効なサブスクリプションは1つだけ（解約済みは複数存在してOK）

**past_due_since の運用ルール:**
- Stripe Webhook で `invoice.payment_failed` を受信し status が past_due に変わった時点で、past_due_since に現在日時を設定する
- 支払いが成功して status が active に戻った場合は、past_due_since を NULL にリセットする
- 7日間猶予の自動解約判定: `past_due_since + INTERVAL '7 days' < NOW()` が true になった時点で、Edge Function（定期実行の処理）が自動解約を実行する
- 猶予期間中はユーザーに「残りX日で自動解約されます」の警告バナーを表示する

### option_subscriptions（オプション契約）

急募・補償・動画掲載などのオプションプランの契約。Stripeで別商品として管理する。
単発課金（急募・動画掲載）と月額課金（補償）の両方を同一テーブルで管理する。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| user_id | uuid (FK → users) | 契約者 |
| client_profile_id | uuid (FK → client_profiles, nullable) | 発注者プロフィール（発注者オプションの場合） |
| job_id | uuid (FK → jobs, nullable) | 対象案件（急募オプションの場合のみ。どの案件を急募にしたかを紐付ける） |
| payment_type | text | 'one_time'（単発課金）/ 'subscription'（月額課金） |
| stripe_subscription_id | text (nullable) | Stripe Subscription ID（月額課金の場合のみ。単発課金では null） |
| stripe_payment_intent_id | text (nullable) | Stripe Payment Intent ID（単発課金の場合のみ。月額課金では null） |
| option_type | text | 'urgent'（急募）/ 'compensation_5000'（補償¥5,000）/ 'compensation_9800'（補償¥9,800）/ 'video'（動画掲載） |
| status | text | 'active' / 'expired' / 'cancelled' |
| start_date | timestamptz | オプション有効開始日 |
| end_date | timestamptz (nullable) | オプション有効終了日（急募: start_date + 7日。動画掲載: null = 期限なし。補償: Stripe が管理） |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**status の使い分け:**
- 'active': 有効中
- 'expired': 期限切れ（単発課金で end_date を過ぎた場合。Edge Function `expire-options` が自動設定）
- 'cancelled': 解約済み（月額課金の Stripe 解約、またはユーザー退会時の強制解約）

**CHECK制約:**
- `(payment_type = 'one_time' AND stripe_subscription_id IS NULL) OR (payment_type = 'subscription' AND stripe_payment_intent_id IS NULL)` — 課金方式と Stripe ID の整合性を保証

<!--
  オプションの有効/無効はこのテーブルの status で管理する。
  client_profiles の is_urgent_option 等のフラグは、Webhook または Edge Function で自動更新する（キャッシュ的な役割）。
  将来的にStripe管理から手動管理に変更する場合も、テーブル構造はそのまま使える。

  ■ 単発課金オプションの処理（checkout.session.completed Webhook で実行）:
  - 急募オプション購入時:
    1. option_subscriptions に INSERT（payment_type = 'one_time', end_date = NOW() + 7日）
    2. client_profiles.is_urgent_option を true に更新
    3. 対象案件の jobs.is_urgent を true に更新
  - 急募オプション期限切れ時（Edge Function `expire-options` で実行）:
    1. option_subscriptions.status を 'expired' に更新
    2. client_profiles.is_urgent_option を false に更新（同ユーザーの他の active な急募がなければ）
    3. 対象案件の jobs.is_urgent を false に更新
  - 動画掲載オプション購入時:
    1. option_subscriptions に INSERT（payment_type = 'one_time', end_date = NULL）
    2. 管理者が ADM-010 で users.video_url を設定

  ■ 月額課金オプションの処理（Stripe Webhook で実行）:
  - 補償オプション解約時:
    1. option_subscriptions.status を 'cancelled' に更新
    2. client_profiles の該当フラグを false に更新
  - 動画掲載オプション解約時:
    1. option_subscriptions.status を 'cancelled' に更新
    2. users.video_url は保持（削除しない）、ただし表示時にオプション有効判定で非表示にする

  ■ Webhook の冪等性（べきとうせい = 同じ通知が2回来ても問題なく処理できること）:
  - Stripe Webhook イベントの event.id を処理済みとして記録し、重複処理を防止する
  - 処理済みイベント記録用に stripe_webhook_events テーブルを使用する（下記参照）
-->

## 法人プラン・組織

### 発注者表示名のルール

受注者に見える発注者名は **`client_profiles.display_name` に一本化**する。以前の `organizations.name` / `users.company_name` による複数テーブル解決は廃止。

**表示解決のルール**（`src/lib/utils/display-name.ts` の `resolveParticipantName()`）:

1. `client_profiles.display_name`（CLI-021 でユーザーが入力した社名・氏名）
2. `${users.last_name}${users.first_name}`（client_profiles が未作成 or display_name が空の場合のフォールバック）

**法人プランで Staff がメッセージを送った場合の名前解決**:
- Staff は client_profiles を持たない → 所属組織の Owner の client_profiles.display_name を使う
- 解決チェーン: Staff → `organization_members` → `organizations.owner_id` → `client_profiles WHERE user_id = owner_id` → `display_name`

**旧ヘルパーの廃止**:
- `src/lib/utils/resolve-org-names.ts` の `getActiveCorporateOrgNames()` は廃止する。`client_profiles` は公開 SELECT（RLS で全ユーザー閲覧可）のため、admin client を使わなくても他ユーザーの表示名を取得できる
- `organizations` / `organization_members` の `is_same_org` RLS で他組織の表示名が取れない問題は、`client_profiles` 参照に切り替えることで解消

**`users.company_name` の扱い**:
- COM-002（受注者としてのプロフィール入力）で入力する屋号。受注者プロフィールとして使用
- 発注者の表示名としては使用しない（CLI-021 の `client_profiles.display_name` が発注者表示名の唯一の入力元）

**ダウングレード/解約時**:
- `client_profiles` レコードは削除しない（再アップグレードでの再利用のため）
- 表示名は `client_profiles.display_name` がそのまま残る。プラン状態による表示切り替えは不要（どのプランでも同じ display_name が使われる）

### client_profiles（発注者プロフィール）

発注者として課金した際に自動作成される。受注者に公開される発注者情報を保持。**CLI-021（発注者情報編集）で全フィールドを編集する。**

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| user_id | uuid (FK → users) | 対応するユーザー |
| display_name | text | **社名・氏名（受注者に表示される発注者名）**。CLI-021 でユーザーが入力する。全プラン共通でこのカラムが発注者の表示名となる |
| address | text (nullable) | 住所。CLI-020 で社名の下に表示される |
| image_url | text | 発注者プロフィール画像URL |
| recruit_job_types | text[] | 募集職種（会社として全般的に扱う職種。案件ごとの職種は `jobs.trade_type` で別管理） |
| recruit_area | text[] | 募集エリア（複数都道府県、配列） |
| employee_scale | integer | 従業員規模 |
| working_way | text | 求める働き方 |
| language | text | 言語（例: 日本語、日本語・英語） |
| message | text | 発注者メッセージ（紹介文） |
| sns_x | boolean (DEFAULT false NOT NULL) | X（旧 Twitter）を利用しているかのチェック値。運営の集計・分析用。受注者には非公開。CLI-021 のチェックボックスで設定 |
| sns_instagram | boolean (DEFAULT false NOT NULL) | Instagram を利用しているかのチェック値。同上 |
| sns_tiktok | boolean (DEFAULT false NOT NULL) | TikTok を利用しているかのチェック値。同上 |
| sns_youtube | boolean (DEFAULT false NOT NULL) | YouTube を利用しているかのチェック値。同上 |
| sns_facebook | boolean (DEFAULT false NOT NULL) | Facebook を利用しているかのチェック値。同上 |
| admin_memo | text | 内部管理者のメモ（管理画面用） |
| is_urgent_option | boolean | 急募オプション有効フラグ |
| is_compensation_5000 | boolean | 補償5,000円オプション有効フラグ |
| is_compensation_9800 | boolean | 補償9,800円オプション有効フラグ |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**`recruit_job_types` と `jobs.trade_type` の違い:**
- `client_profiles.recruit_job_types` = 「この会社が全般的に扱う職種」（発注者の会社紹介として CLI-020 に表示。例: 塗装、電気、土木）
- `jobs.trade_type` = 「この案件の具体的な職種」（案件ごとに設定。例: 塗装）
- 両者は独立しており、案件には紐づかない

### organizations（組織）

法人プランの組織構造を管理するテーブル。**発注者表示名は持たない**（表示名は `client_profiles.display_name` に一本化）。組織メンバーの所属管理と Owner の特定にのみ使用する。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| owner_id | uuid (FK → users, UNIQUE) | 管理責任者 |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| deleted_at | timestamptz (nullable) | ソフトデリート日時。オーナー削除時のルールに基づき設定される |

**削除したカラム（旧定義から）:**
- `name`（発注者名/会社名）: `client_profiles.display_name` に一本化。発注者の表示名は Owner の `client_profiles.display_name` から取得する（「発注者表示名のルール」参照）

**制約:**
- UNIQUE (owner_id) — 1人のユーザーが所有できる組織は1つだけ。課金（subscriptions）がユーザー単位の設計のため、1つの契約で複数組織を運営できてしまうことを防ぐ
- FK (owner_id) → users に `ON DELETE RESTRICT`（物理削除を禁止。ソフトデリートのみ許可）

**組織オーナー削除時のルール（2026-04-19 改訂: C 案採用）:**

オーナー（管理責任者）がソフトデリート（退会）した場合の処理フロー:

- **Admin の有無に関わらず、組織全体をソフトデリートする**（`organizations.deleted_at` を設定）
  - 背景: Admin / Staff は Owner による招待（CLI-025）のみで作成されたアカウントで、正規の新規登録フロー（AUTH-001）・本人確認・独立した Stripe 契約を経ていない。Owner 退会後に組織の新代表として昇格させるには身元保証と契約主体の移行が必要だが、Owner 退会と同時に法人プラン契約も終了するため、そのまま継続運営させることは構造的に矛盾する。したがって**退会と同時に組織ごと凍結**し、事業継続を希望する場合は「元メンバーが新規法人アカウントを作成 + プラン契約 + 元メンバーを CLI-025 で再招待」の正規ルートに誘導する
- 処理内容:
  - `organizations.deleted_at` をセット（組織ソフトデリート）
  - 所属メンバー全員の `organization_members` を**物理削除**（`DELETE FROM organization_members WHERE organization_id = ...`）。`organization_members` 自体に `deleted_at` 列は持たない設計
  - Admin / Staff の `users.deleted_at` をセット（組織と連動してログイン不可化）
  - `client_profiles` レコードはそのまま残す（過去メッセージの表示整合性のため）
  - `scout_templates` は削除しない（組織ソフトデリート後は RLS でアクセス不能だが、履歴データとして保持）
  - 履歴データはすでに個別に保全される（`users.deleted_at` でメンバー個人のソフトデリート記録、`messages.sender_id` で過去の発言履歴）
- **物理削除は禁止** → `ON DELETE RESTRICT` により、users テーブルからの物理削除はエラーになる。必ずソフトデリート（deleted_at の設定）で運用する

**実装時の注意:**
- オーナー退会処理は Server Action で上記フローを実行し、直接 DELETE 文は使用しない
- **Owner 交代（契約者を別人に切り替える）は、退会ではなく「契約中の運営手動操作」で行う**（organization/requirements.md「管理責任者（Owner）の交代 パターン2」参照）。退会フローでは Owner 交代をサポートしない
- オーナー変更時は organization_members の org_role も連動して更新する（旧オーナー: 'owner' → 'admin' に降格 or 組織から削除、新オーナー: 'admin' → 'owner'）

### organization_members（組織メンバー）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| organization_id | uuid (FK → organizations) | 所属組織 |
| user_id | uuid (FK → users) | メンバー |
| org_role | text | 'owner' / 'admin' / 'staff' |
| is_proxy_account | boolean | 代理アカウントフラグ（true = このアカウントはビジ友の運営スタッフが操作する外部アカウント） |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**制約:**
- UNIQUE (organization_id, user_id) — 同じ人が同じ組織に二重登録されるのを防ぐ
- UNIQUE (organization_id) WHERE is_proxy_account = true — 1法人につき代理アカウントは1つだけ（部分ユニーク制約）

## マイリスト・お気に入り

### favorites（お気に入り/興味あり）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| user_id | uuid (FK → users) | ユーザー |
| target_type | text | 'job' / 'client' / 'user' |
| target_id | uuid | 対象のID（jobs.id / users.id） |
| created_at | timestamptz | |

※ target_type + target_id のポリモーフィック関連。
受注者: job, client のみ登録可。発注者: job, client, user を登録可。

## 空き日程

### available_schedules（空き日程）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| user_id | uuid (FK → users) | 受注者 |
| start_date | date | 空き開始日 |
| end_date | date | 空き終了日 |
| note | text | メモ（任意） |
| created_at | timestamptz | |
| updated_at | timestamptz | |

## 本人確認・CCUS

### identity_verifications（本人確認申請）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| user_id | uuid (FK → users) | 申請者 |
| document_type | text | 'identity' / 'ccus' |
| document_url_1 | text | 書類1のStorage URL |
| document_url_2 | text | 書類2のStorage URL（本人確認は2枚） |
| ccus_worker_id | text | CCUS技能者ID（CCUSの場合） |
| status | text | 'pending' / 'approved' / 'rejected' |
| rejection_reason | text | 否認理由 |
| reviewed_by | uuid (FK → users, nullable) | 承認/否認した管理者 |
| reviewed_at | timestamptz | 承認/否認日時 |
| created_at | timestamptz | |

**制約:**
- UNIQUE (user_id, document_type) WHERE status = 'pending'
  — 同じ種類の申請を重複して出せないようにする（審査中のものが1件だけになる）

**再提出ルール:**
- 否認（rejected）後の再提出は **新規 INSERT** で行う。rejected レコードは審査履歴として残す
- 同一ユーザーの同一 document_type で複数レコードが存在しうる（approved 1件 + rejected 複数件）
- 最新ステータスの取得: `WHERE user_id = ? AND document_type = ? ORDER BY created_at DESC LIMIT 1`
- users.identity_verified フラグは、管理者が approved にした時点で Server Action から `true` に更新する

## お問い合わせ

### contacts（お問い合わせ）

お問い合わせフォーム（COM-008）から送信されたデータを保存。表示画面はなく、ログとして蓄積する。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| last_name | text | 姓 |
| first_name | text | 名 |
| email | text | メールアドレス |
| contact_types | text[] | お問い合わせ項目（複数選択可） |
| content | text | お問い合わせ内容 |
| created_at | timestamptz | |

## スカウトテンプレート

### scout_templates（スカウトメッセージテンプレート）

発注者がスカウト送信時に使うテンプレート（CLI-016〜019）。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| owner_id | uuid (FK → users) | 作成者（発注者） |
| organization_id | uuid (FK → organizations, nullable) | 所属組織（法人プランの場合） |
| title | text | テンプレートタイトル |
| body | text | テンプレート本文 |
| memo | text | メモ（任意） |
| created_at | timestamptz | |
| updated_at | timestamptz | |

## Stripe Webhook イベント管理

### stripe_webhook_events（Webhook 処理済みイベント記録）

Stripe からの Webhook（自動通知）が重複して届いた場合に、同じ処理を2回実行しないための記録テーブル。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| stripe_event_id | text (UNIQUE) | Stripe のイベントID（例: evt_1234...）。UNIQUE制約（同じ値は1つしか入れない制約）で重複防止 |
| event_type | text | イベント種別（例: 'customer.subscription.deleted'） |
| status | text | 処理状態: 'processing'（処理中）/ 'completed'（完了）/ 'failed'（失敗） |
| error_message | text | 失敗時のエラー内容（status = 'failed' の場合に記録。正常時は null） |
| processed_at | timestamptz | 処理完了日時 |
| created_at | timestamptz | |

## 監査ログ

### audit_logs（監査ログ）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | |
| actor_id | uuid (FK → users, nullable) | 操作者 |
| action | text | 操作内容（'login', 'identity_access', 'role_change' 等） |
| target_type | text | 対象テーブル名 |
| target_id | uuid | 対象レコードID |
| metadata | jsonb | 追加情報（変更前後の値など） |
| ip_address | text | IPアドレス |
| created_at | timestamptz | |

## RLSポリシーの方針

全テーブルにRLS（Row Level Security = 行単位のアクセス制御）を有効化し、デフォルトで全アクセスを拒否する。
各テーブルに対して「誰が」「どの操作（読む/書く/更新/削除）を」「どの行に」できるかを明示的に許可する。

### 基本パターン

| パターン | ポリシー例 |
|---------|-----------|
| 自分のデータのみ | `auth.uid() = user_id` |
| 自分のデータ + 管理者 | `auth.uid() = user_id OR is_admin(auth.uid())` |
| 公開データ（読み取り） | `true`（SELECT のみ） |
| 組織内のデータ | `organization_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())` |
| 課金済みユーザーのみ | `EXISTS (SELECT 1 FROM subscriptions WHERE user_id = auth.uid() AND status IN ('active', 'past_due'))` |

### ソフトデリート（deleted_at）と RLS の組み合わせルール

ソフトデリート（= データを物理的に消さず、deleted_at に日時を入れて「削除済み」とするやり方）を使っているテーブルでは、RLS ポリシーに以下のルールを適用する:

| 対象ユーザー | ルール |
|------------|--------|
| 一般ユーザー（受注者・発注者・担当者） | `deleted_at IS NULL`（削除されていないデータのみ表示）を必ず含める |
| システム管理者（Admin） | `deleted_at IS NULL` を含めない（削除済みデータも確認できるようにする） |

対象テーブル: users, jobs（deleted_at カラムがあるテーブルすべて）

例: jobs テーブルの SELECT ポリシー
- 一般ユーザー向け: `status = 'open' AND deleted_at IS NULL`
- 作成者向け: `owner_id = auth.uid()`（全ステータス、削除済み含む）
- 同一組織向け: `is_same_org(auth.uid(), organization_id) AND deleted_at IS NULL`（全ステータス、削除済みは除外）
- 管理者向け: `is_admin(auth.uid())`（deleted_at 条件なし = 削除済みも見える）

### ユーザーソフトデリート時の連鎖処理ルール

ユーザーが退会した（deleted_at に日時が設定された）とき、そのユーザーに紐づくデータを以下のルールで処理する。この処理は Server Action（退会処理）の中でトランザクション（= 一連の処理をまとめて、途中で失敗したら全部取り消す仕組み）として実行する。

| テーブル | 処理 | 理由 |
|---------|------|------|
| jobs（案件） | ステータスを 'closed' に変更 | 退会者の案件を掲載し続けないため |
| applications（応募） | 進行中（status = 'applied' / 'accepted'）の応募を 'cancelled' に変更 | 相手への通知として。完了済みの応募はそのまま残す |
| message_threads（スレッド） | そのまま残す | 相手が過去のやり取りを確認できるように |
| messages（メッセージ） | そのまま残す | 同上。退会ユーザーの名前は画面上で「退会済みユーザー」と表示 |
| user_reviews（受注者評価） | そのまま残す | 公開情報として継続表示（退会ユーザー名は「退会済みユーザー」） |
| client_reviews（発注者評価） | そのまま残す | 被評価者本人・評価投稿者本人・同一組織メンバーへの限定公開として継続表示（退会ユーザー名は「退会済みユーザー」） |
| subscriptions（課金） | Stripe API でサブスクリプションをキャンセル → ステータスを 'cancelled' に更新 | 退会後も課金が続かないように |
| option_subscriptions（オプション） | 同上。Stripe でキャンセル → ステータスを 'cancelled' に更新 | 同上 |
| user_skills / user_qualifications / user_available_areas | そのまま残す | RLS の `deleted_at IS NULL` 条件により、他のユーザーからは自動的に非表示になる |
| favorites（お気に入り） | そのまま残す | 同上 |
| available_schedules（空き日程） | そのまま残す | 同上 |
| identity_verifications（本人確認） | そのまま残す | 管理者が退会後も確認できるようにするため |
| organization_members | 退会ユーザーのレコードを物理削除 | 組織のメンバー枠を空けるため |

**画面表示での注意:**
- 退会済みユーザーの名前は「退会済みユーザー」と表示する（個人情報保護のため実名は非表示）
- 退会済みユーザーのプロフィールページへのリンクは無効化する
- メッセージスレッドで退会済みユーザーとの新規メッセージ送信は不可にする

### ヘルパー関数（共通で使う判定用の関数）

```sql
-- 管理者かどうかを判定する関数（退会済みユーザーは false を返す）
CREATE FUNCTION is_admin(uid uuid) RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = uid AND role = 'admin' AND deleted_at IS NULL);
$$ LANGUAGE sql SECURITY DEFINER;

-- 課金済みユーザーかどうかを判定する関数（past_due = 支払い遅延中も含む。退会済みは false）
CREATE FUNCTION is_paid_user(uid uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = uid AND status IN ('active', 'past_due')
    AND user_id IN (SELECT id FROM users WHERE deleted_at IS NULL)
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 同じ組織に所属しているかを判定する関数（退会済みユーザーは false を返す）
CREATE FUNCTION is_same_org(uid uuid, org_id uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = uid AND organization_id = org_id
    AND user_id IN (SELECT id FROM users WHERE deleted_at IS NULL)
  );
$$ LANGUAGE sql SECURITY DEFINER;
```

**重要:** 3つの関数すべてに `deleted_at IS NULL`（= 退会していないユーザーのみ対象）の条件を含めている。これにより、退会済みユーザーが管理者権限を持ち続けたり、有料ユーザーとして扱われ続けることを防ぐ。

**RLS ポリシーでの使用例:**

```sql
-- is_admin() の使用例: identity_verifications の SELECT ポリシー
-- 「自分の申請 or 管理者なら全件閲覧可」
CREATE POLICY "identity_verifications_select" ON identity_verifications
  FOR SELECT USING (
    user_id = auth.uid() OR is_admin(auth.uid())
  );

-- is_paid_user() の使用例: jobs テーブルの INSERT ポリシー
-- 「課金済みユーザーのみ案件作成可」
CREATE POLICY "jobs_insert" ON jobs
  FOR INSERT WITH CHECK (
    is_paid_user(auth.uid()) AND owner_id = auth.uid()
  );

-- is_same_org() の使用例: organization_members の SELECT ポリシー
-- 「同じ組織のメンバーのみ閲覧可」
CREATE POLICY "org_members_select" ON organization_members
  FOR SELECT USING (
    is_same_org(auth.uid(), organization_id)
  );
```

**パフォーマンスに関する注意:**

上記のヘルパー関数は RLS ポリシーの中で呼ばれるため、テーブルの行数が多い場合に繰り返し実行される。
高速に動作させるために、以下のインデックス（索引 = 検索を速くするための目次）が**必須**:

| 関数 | 必要なインデックス |
|------|-----------------|
| is_admin() | users テーブルの (id, role) — PK で id は索引済み。role の確認も高速 |
| is_paid_user() | subscriptions テーブルの (user_id, status) — この組み合わせでの検索が高速になる |
| is_same_org() | organization_members テーブルの (user_id, organization_id) — UNIQUE制約で索引済み |

※ これらのインデックスは「パフォーマンス用インデックス」セクションにも含まれている

**将来的なパフォーマンス改善策（ユーザー数が増えて遅くなった場合）:**

is_paid_user() の呼び出しが多い場合、users テーブルに `is_paid_cache`（課金済みかどうかのキャッシュ = 事前に計算した結果を保存する列）を追加する方法がある:
- users テーブルに `is_paid_cache boolean DEFAULT false` を追加
- subscriptions テーブルが更新されるたびに、トリガー（自動処理）で is_paid_cache を連動更新
- RLS ポリシーで subscriptions テーブルへの副問い合わせが不要になり、高速化される
- ※ 初期段階では不要。Supabase の Query Insights（クエリ分析ツール）で遅いクエリが見つかった場合に導入を検討する

### 主要テーブル別ポリシー

※ 以下は設計方針。実装時の spec-design フェーズで最終確定する。

#### users（ユーザー）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT（読む） | 公開情報（名前、アイコン等） | 認証済みユーザー全員 |
| SELECT（読む） | 非公開情報（メール等） | 本人 or 管理者 |
| INSERT（作成） | 自分のレコード | `auth.uid() = id` かつ `role = 'contractor'` のみ許可。admin での登録はRLSでブロック |
| UPDATE（更新） | 自分のレコード | 本人のみ（`auth.uid() = id`）。role カラムの変更は Server Action 経由のみ（RLSでは role の直接変更を禁止） |
| DELETE（削除） | — | 不可（ソフトデリート = deleted_at を設定する方式で対応） |

#### jobs（案件）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 全案件 | 認証済みユーザー全員（status = 'open' かつ deleted_at IS NULL のみ。draft/closed は作成者または同一組織メンバーのみ） |
| SELECT | 自分の案件（削除済み含む） | 作成者本人は deleted_at が設定された案件も閲覧可能（内容確認・復元検討のため。ただし編集は不可） |
| SELECT | 同一組織の案件 | 同一組織メンバーは deleted_at IS NULL の案件のみ閲覧可能（全ステータス） |
| INSERT（作成） | — | 課金済みユーザー（`is_paid_user(auth.uid())`） |
| UPDATE | 自社の案件 | 作成者 or 同じ組織のメンバー（deleted_at IS NULL の案件のみ。削除済みの案件は編集不可） |
| DELETE | — | 不可（ソフトデリート） |

#### applications（応募）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 自分が応募した or 自分の案件への応募 | `applicant_id = auth.uid() OR job.owner_id = auth.uid()` |
| INSERT | — | 認証済みユーザー（※ 職種・エリア制限は Server Action で検証） |
| UPDATE（受注者キャンセル） | 自分の応募 | `applicant_id = auth.uid() AND status = 'applied'` → cancelled のみ許可（WITH CHECK）。※ 5日前制限は Server Action で検証 |
| UPDATE（発注者 発注可否） | 自社案件への応募 | 案件の `owner_id = auth.uid()` or 同一組織メンバー、かつ `status = 'applied'` → accepted / rejected のみ許可（WITH CHECK） |
| UPDATE（完了報告） | — | admin client（サービスロール）で実行。RLS ポリシーは不要。accepted → completed / lost への変更と評価 INSERT を原子的に実行するため |

#### messages（メッセージ）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 自分が参加しているスレッド、または自分の組織のスレッドのメッセージ | `thread_id IN (自分がアクセス可能なスレッド)` |
| INSERT | — | 自分がアクセス可能なスレッドにのみ送信可（※ 月5通制限は Server Action で検証） |
| UPDATE（read_at, scout_status） | — | **RLS ポリシーなし**。admin client（service_role）で実行する。PERMISSIVE ポリシーの OR 結合による意図しない権限昇格を防ぐため、UPDATE 操作は全て Server Action 内で権限チェック後に admin client で実行する |

**messages の RLS パフォーマンス注意:**

messages テーブルの RLS ポリシーでは、「自分がアクセス可能なスレッドか？」を確認するために message_threads テーブルへの副問い合わせが必要。メッセージはデータ量が多くなりやすいため、以下の最適化を行う:

- SELECT ポリシーでは `IN` ではなく `EXISTS` を使う
  ```sql
  EXISTS (
    SELECT 1 FROM message_threads
    WHERE id = messages.thread_id
    AND (
      participant_1_id = auth.uid()
      OR participant_2_id = auth.uid()
      OR (organization_id IS NOT NULL AND is_same_org(auth.uid(), organization_id))
    )
  )
  ```
- message_threads の participant_1_id, participant_2_id, organization_id にインデックスを設定（パフォーマンス用インデックスのセクション参照）
- messages の (thread_id, created_at) インデックスにより、スレッド内のメッセージ取得も高速化される

**Supabase Realtime:**
- `ALTER PUBLICATION supabase_realtime ADD TABLE messages` で messages テーブルの Realtime を有効化する
- INSERT イベントのみ購読（UPDATE/DELETE は購読しない）
- 自分が送信したメッセージは `onSendComplete` コールバックで即時反映し、Realtime では他ユーザーからのメッセージのみ処理する

#### identity_verifications（本人確認書類）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 自分の申請 or 全申請（管理者） | `user_id = auth.uid() OR is_admin(auth.uid())` |
| INSERT | — | 本人のみ |
| UPDATE | — | 管理者のみ（承認/否認操作） |

#### subscriptions（課金情報）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 自分の契約 | `user_id = auth.uid()` |
| INSERT / UPDATE | — | サーバー側のみ（Stripe Webhook 経由。service_role キーを使用） |

#### user_skills（ユーザースキル・職種）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 自分のスキル or 公開プロフィールとして全ユーザーが閲覧可 | `user_id = auth.uid()` or 閲覧時は全員可 |
| INSERT / UPDATE / DELETE | 自分のスキルのみ | `user_id = auth.uid()` |

#### user_qualifications（資格）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 公開プロフィールとして全ユーザーが閲覧可 | 全員可 |
| INSERT / UPDATE / DELETE | 自分の資格のみ | `user_id = auth.uid()` |

#### user_available_areas（対応可能エリア）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 公開プロフィールとして全ユーザーが閲覧可 | 全員可 |
| INSERT / UPDATE / DELETE | 自分のエリアのみ | `user_id = auth.uid()` |

#### job_images（案件画像・書類）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 全ユーザーが閲覧可（案件と同じ公開範囲） | 全員可（`deleted_at IS NULL` の案件に紐づくもの） |
| INSERT / UPDATE / DELETE | 案件の作成者または同一組織メンバー | `job.owner_id = auth.uid() OR is_same_org(auth.uid(), job.organization_id)` |

#### user_reviews（ユーザー評価 — 発注者→受注者）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 全ユーザーが閲覧可（公開評価） | 全員可 |
| INSERT | 対象の応募の発注者のみ | `reviewer_id = auth.uid()` かつ応募ステータスが accepted |
| UPDATE / DELETE | — | 不可（評価は変更・削除できない） |

#### client_reviews（発注者評価 — 受注者→発注者）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 被評価者本人、評価投稿者本人、または同一組織メンバー | `can_view_client_review(reviewee_id)` SECURITY DEFINER 関数で判定: `reviewee_id = auth.uid()` または `reviewer_id = auth.uid()` または同一組織に所属するユーザー |
| INSERT | 対象の応募の受注者のみ | `reviewer_id = auth.uid()` かつ応募ステータスが accepted |
| UPDATE / DELETE | — | 不可（評価は変更・削除できない） |

#### message_threads（メッセージスレッド）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 自分が参加しているスレッド、または自分の組織のスレッド | `participant_1_id = auth.uid() OR participant_2_id = auth.uid() OR (organization_id IS NOT NULL AND is_same_org(auth.uid(), organization_id))` |
| INSERT | — | 認証済みユーザー（Server Action で制限チェック） |
| UPDATE | thread_type の更新のみ（スカウトメッセージ追加時に 'message' → 'scout' に変更） | Server Action 経由で更新。RLS は participant チェックまたは組織チェック |
| DELETE | — | **不可**（スレッドは削除しない設計。退会ユーザーのスレッドも相手側が過去のやり取りを確認できるように残す。database-schema.md の「ユーザーソフトデリート時の連鎖処理ルール」参照） |

#### option_subscriptions（オプション契約）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 自分のオプション契約 | `user_id = auth.uid()` |
| INSERT / UPDATE | — | サーバー側のみ（Stripe Webhook 経由。service_role キーを使用） |

#### client_profiles（発注者プロフィール）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 全ユーザーが閲覧可（公開プロフィール） | 全員可 |
| INSERT / UPDATE | 自分のプロフィール or 同じ組織の管理責任者/管理者 | `user_id = auth.uid() OR user_id IN (SELECT owner_id FROM organizations WHERE id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND org_role IN ('owner', 'admin')))` |

※ client_profiles には organization_id カラムがないため、user_id → organizations.owner_id → organization_members の関係を辿って同じ組織かどうかを判定する

#### organizations（組織）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 同じ組織のメンバー | `is_same_org(auth.uid(), id)` |
| SELECT | メッセージスレッドの受注者側参加者 | `EXISTS (SELECT 1 FROM message_threads WHERE organization_id = organizations.id AND participant_2_id = auth.uid())`。受注者がスレッド一覧・詳細で組織名を表示するために必要 |
| INSERT / UPDATE | — | サーバー側のみ（管理者が ADM-006 で作成。service_role キーを使用） |

#### organization_members（組織メンバー）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 同じ組織のメンバー | `organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())` |
| INSERT / UPDATE / DELETE | — | Server Action で org_role を検証した上で実行（管理責任者/管理者のみ） |

#### favorites（お気に入り/興味あり）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 自分のお気に入りのみ | `user_id = auth.uid()` |
| INSERT / DELETE | 自分のお気に入りのみ | `user_id = auth.uid()` |

#### available_schedules（空き日程）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 自分の日程 or 全ユーザーが閲覧可（発注者が職人の空きを確認する用途） | 全員可 |
| INSERT / UPDATE / DELETE | 自分の日程のみ | `user_id = auth.uid()` |

#### contacts（お問い合わせ）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 全件（管理者のみ） | `is_admin(auth.uid())`。一般ユーザーの閲覧画面はないため管理者限定 |
| INSERT | — | anon（未認証）+ authenticated（認証済み）の両方を許可。ログイン前でも問い合わせ送信可能 |
| UPDATE / DELETE | — | 不可。問い合わせデータは変更・削除しない（ログとして保持） |

※ contacts テーブルには user_id カラムがない（未ログインでも送信可能なため）。RLS はユーザー単位のフィルタリングを行わない。

#### scout_templates（スカウトメッセージテンプレート）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | 自分のテンプレート or 同じ組織のテンプレート | `owner_id = auth.uid() OR organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())` |
| INSERT | 自分のテンプレート or 同じ組織のメンバー全員 | 発注者本人（個人/小規模プラン）は `owner_id = auth.uid()` かつ `organization_id IS NULL`。法人プランは組織メンバー全員（owner / admin / staff）が作成可。`owner_id` は作成者、`organization_id` は作成者の所属組織に自動設定 |
| UPDATE | 自分のテンプレート or 同じ組織のメンバー全員 | `owner_id = auth.uid() OR organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())`。組織の共有資産として、他メンバー作成のテンプレートも同組織内であれば編集可 |
| DELETE | 同上 | 同上。担当者が退会した場合のテンプレートは管理責任者に `owner_id` を移譲する（organization/requirements.md REQ-ORG-008 参照）。テンプレートは組織の共有資産として残す |

#### stripe_webhook_events（Webhook 処理済みイベント記録）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT / INSERT / UPDATE | — | サーバー側のみ（service_role キーを使用。ユーザーからは一切アクセス不可） |

#### audit_logs（監査ログ）
| 操作 | 対象 | 条件 |
|------|------|------|
| SELECT | — | 管理者のみ（`is_admin(auth.uid())`） |
| INSERT | — | サーバー側のみ（service_role キーを使用） |
| UPDATE / DELETE | — | 不可（監査ログは改ざん・削除できない） |

## パフォーマンス用インデックス（索引 = 検索を速くするための仕組み）

以下のカラムにインデックスを作成する。頻繁に検索・ソート・結合に使われるカラムが対象。

| テーブル | カラム | 用途 |
|---------|--------|------|
| jobs | (status, prefecture, trade_type) | 案件検索（ステータス × エリア × 職種の複合検索） |
| jobs | (owner_id) | 自社の案件一覧表示 |
| jobs | (created_at) | 新着順ソート |
| applications | (job_id, status) | 案件ごとの応募一覧 |
| applications | (applicant_id) | 自分の応募履歴 |
| messages | (thread_id, created_at) | スレッド内のメッセージ時系列表示 |
| messages | (sender_id, created_at) | レート制限チェック（直近1分間の送信数カウント） |
| message_threads | (participant_1_id) | スレッド一覧（自分が参加しているスレッドの検索） |
| message_threads | (participant_2_id) | 同上 |
| message_threads | (organization_id) | 組織ベーススレッドの検索（法人プラン用） |
| favorites | (user_id, target_type) | マイリスト表示 |
| identity_verifications | (status) | 管理者の承認待ち一覧 |
| subscriptions | (user_id, status) | is_paid_user() ヘルパー関数の高速化（RLSで頻繁に呼ばれる） |
| audit_logs | (actor_id, created_at) | 監査ログの検索 |
| jobs | (organization_id) | 組織ごとの案件一覧表示（法人プラン用） |
| organization_members | (organization_id, org_role) | 組織内の権限チェック（org_role での絞り込みを高速化） |
| user_skills | (user_id) | ユーザーのスキル一覧表示・RLSでの所有者チェック |
| scout_templates | (owner_id) | 個人テンプレートの一覧表示 |
| scout_templates | (organization_id) | 組織テンプレートの一覧表示（法人プラン用） |
| applications | (scout_message_id) WHERE scout_message_id IS NOT NULL | スカウト経由応募の検索（部分インデックス） |
| users | (email) | CLI-025 担当者新規作成時のメール重複チェック高速化（O(log N)）。`organization` spec の Migration file 3 で追加（`idx_users_email`） |

※ インデックスは検索を速くする反面、データの書き込み（INSERT/UPDATE）が少し遅くなるトレードオフがある。上記は検索頻度が高いカラムに絞って設定する。

## マイグレーション管理

- Supabase CLI の `supabase migration new` でマイグレーションファイルを作成
- ファイルは `supabase/migrations/` に配置される
- ローカルで `supabase db reset` で検証してからリモートに `supabase db push`
- マイグレーションは不可逆（ロールバックが必要な場合は新しいマイグレーションで対応）

## 選択肢データ（OptionSets）の方針

職種、エリア、スキル、資格、性別などの選択肢リストは、初期段階ではコード内の定数（TypeScript の配列/オブジェクト）として定義する。管理画面から追加・編集する必要が出てきた場合にマスタテーブルへ移行する。

対象の選択肢: 職種（JobType）、エリア（都道府県）、スキル（Skill）、資格（Qualification）、性別（Gender）、経験年数（ExperienceYear）、求める働き方（WorkingWay）、国籍・言語（NationalityLanguage）、退会理由（CancelReason）、お問い合わせ項目（ContactType）、稼働状況（OperatingStatus）、各種ステータス

**ContactType の初期値（contacts.contact_types の選択肢）:**
- 'サービスについて'
- '料金・お支払いについて'
- 'アカウントについて'
- 'バグ・不具合報告'
- '機能要望'
- 'その他'

※ 複数選択可（text[] 型）。運用中に項目の追加が必要になった場合は TypeScript 側の定数配列を更新する

### データ型の使い分け方針

データベースのカラム（列）で選択肢を扱う場合、以下の方針で型を選択する:

**PostgreSQL enum 型を使うもの**（= 選択肢が固定で、今後ほぼ変わらないもの）:

| カラム | enum 型名 | 値 |
|--------|----------|-----|
| users.role | user_role | 'contractor', 'client', 'staff', 'admin' |
| jobs.status | job_status | 'draft', 'open', 'closed' |
| applications.status | application_status | 'applied', 'accepted', 'rejected', 'completed', 'cancelled', 'lost' |
| subscriptions.status | subscription_status | 'active', 'past_due', 'cancelled' |
| option_subscriptions.status | option_status | 'active', 'expired', 'cancelled' |
| option_subscriptions.payment_type | option_payment_type | 'one_time', 'subscription' |
| identity_verifications.status | verification_status | 'pending', 'approved', 'rejected' |
| message_threads.thread_type | thread_type | 'message', 'scout' |
| organization_members.org_role | org_role | 'owner', 'admin', 'staff' |
| stripe_webhook_events.status | webhook_status | 'processing', 'completed', 'failed' |

※ enum 型のメリット: 想定外の値が入るのを防げる、ストレージ効率が良い（text より小さい）
※ enum 型のデメリット: 後から値を追加するときにマイグレーション（ALTER TYPE ... ADD VALUE）が必要

**text 型のままにするもの**（= 選択肢が将来増える可能性があるもの）:

| カラム | 理由 |
|--------|------|
| user_skills.trade_type（職種） | 業界の変化で新しい職種が追加される可能性 |
| user_qualifications.qualification_name（資格名） | 新資格が増える可能性 |
| users.prefecture, user_available_areas.prefecture（都道府県） | 47都道府県で固定だが、コード定数で十分 |
| jobs.experience_years（経験年数） | テキスト表現のため |
| contacts.contact_types（お問い合わせ項目） | 運用中に項目が追加される可能性 |

※ text 型のカラムは、TypeScript 側の定数（配列/オブジェクト）+ Zod スキーマ（バリデーションライブラリ）で値を制限する

## Storage バケット

| バケット名 | 公開 | 用途 | アップロード RLS |
|-----------|------|------|-----------------|
| avatars | public | プロフィール画像 | 認証ユーザーが自分のフォルダ（`{user_id}/`）に INSERT |
| job-attachments | private | 案件添付画像 | 認証ユーザーが自分のフォルダに INSERT |
| identity-documents | private | 本人確認書類 | 認証ユーザーが自分のフォルダに INSERT |
| application-documents | private | 発注者が応募レベルで添付する書類（CLI-009-B）。`applications.document_urls` にファイルパスを保存。表示時は `createSignedUrl()` で Signed URL を生成 | 認証ユーザーが自分のフォルダ（`{user_id}/`）に INSERT。全認証ユーザーが SELECT 可 |
| message-attachments | private | メッセージ添付画像（CON-010 で送信）。`messages.image_url` にファイルパスを保存。表示時は `createSignedUrl()` で Signed URL を生成 | 認証ユーザーが自分のフォルダ（`{user_id}/`）に INSERT。スレッド参加者（participant_1 または participant_2）が SELECT 可 |
