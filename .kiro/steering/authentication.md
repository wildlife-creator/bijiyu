# 認証・認可パターン — ビジ友

## 認証方式

### 一般ユーザー認証
- 方式: Supabase Auth（メール/パスワード）
- セッション: Supabase Auth のJWTトークン + Next.js Middleware
- トークン保管: httpOnly Cookie（Supabase のデフォルト設定を活用）
- セッション有効期限: Supabase Auth のデフォルト（1時間、リフレッシュトークンで延長）
- 将来: ソーシャルログイン（Google等）を検討

### 管理者認証（完全分離）
- 管理者（ADM系画面）は一般ユーザーとは別の認証フローを使用
- 管理者専用のログイン画面（ADM-001）
- 管理者ロールはDBで管理（Supabase Auth のメタデータではなくusersテーブル）
- 管理者画面のルーティング: `/admin/*` に分離
- 一般ユーザーのトークンでは `/admin/*` にアクセス不可（Middleware で遮断）

### パスワードポリシー
- 最低8文字（推奨12文字以上）
- 英数字混合を推奨（Supabase Auth の設定で制御）
- パスワードリセット: 時間制限付きトークン（Supabase Auth 標準機能）
- リセットメール送信後、ユーザーに通知

## 認可モデル（ロールベース + プランベース）

### チェックポイント（三重防御）

```
リクエスト → Middleware（第1層: ルーティング制御）
  └ セッション有無、ロール確認、ルーティング制御
    ↓
  → Server Action（第2層: ビジネスロジックの権限チェック）
    └ 操作ごとの権限検証、月次制限チェック、組織内ロール確認
      ↓
    → Supabase RLS（第3層: データアクセス制御）
      └ 行レベルでのアクセス制御、データ所有者チェック
```

※ 三重防御の詳細は security.md の「Server Actions の権限チェック」セクションを参照

**Middleware（第1層: ルーティング制御）:**
- 未認証 → `/auth/*` 以外をリダイレクト
- 受注者（contractor） → `/admin/*` と 発注者専用画面をブロック
- 発注者（client） → `/admin/*` をブロック。CON系・CLI系の両方にアクセス可
- 担当者（staff） → CON系画面は閲覧可能だが、受注者アクション系（CON-004 応募入力、CON-011〜013 応募履歴、CON-014〜016 空き日程）と `/admin/*` をブロック。CON-003 の応募ボタンは非表示
- 管理者（admin） → `/admin/*` のみアクセス可

**Server Action（第2層: ビジネスロジックの権限チェック）:**
- 操作ごとに「この人はこの操作をしていいか？」を検証
- 月次制限（メッセージ月5通、案件月1件）のチェック
- 組織内ロール（org_role）に基づく操作権限の検証

**RLS（第3層: データアクセス制御）:**
- 自分のデータのみ読み書き可（基本原則）
- 公開プロフィールは全ユーザーが閲覧可
- メッセージは送信者・受信者のみ閲覧可
- 本人確認書類は本人 + 管理者のみ
- 案件は作成者が編集可、全ユーザーが閲覧可

## ロールエスカレーション防止

### 課金によるロール変更
```
Stripe Webhook（課金成功）
  → API Route で Webhook 署名検証（必須）
  → DBのsubscriptionsテーブル更新
  → usersテーブルのrole更新
  → Middlewareが次回リクエストで新ロールを反映
```

### 防止すべき攻撃パターン

| 攻撃 | 対策 |
|------|------|
| 無料ユーザーが発注者APIを直接呼出し | RLS で `is_paid_user()` 関数を使用（subscriptions.status IN ('active', 'past_due') をチェック。past_due = 支払い遅延中も猶予期間内は利用可。定義は database-schema.md 参照） |
| Webhookの偽造 | Stripe署名検証（`stripe.webhooks.constructEvent`） |
| 担当者が管理責任者の権限を取得 | organization_members.role をRLSでチェック |
| 課金解約後も発注者機能を使用 | Webhook（subscription.deleted）でロールを即時ダウングレード |
| セッションキャッシュの古いロールを利用 | Middleware でDBの users.role を毎回確認する（下記参照） |

**Middleware のロール再検証ルール:**
- Middleware（入口チェック）では、トークン（ログイン状態を証明する情報）内の role を信用せず、**毎回 users テーブルの role を直接確認する**
- 理由: Stripe Webhook（課金の自動通知）で role が変更された場合、トークン内の role は古いままになる。これを放置すると「解約済みなのに発注者画面にアクセスできる」状態が発生する
- パフォーマンス: users テーブルの主キー（id）検索なので1ms以下で完了。毎リクエスト実行しても問題ない
- 検証方法: `SELECT role, deleted_at, is_active FROM users WHERE id = auth.uid()` で role・退会状態・ログイン有効フラグを同時にチェック
- **is_active チェック**: `is_active = false` の場合、セッションを破棄してログイン画面にリダイレクトする（エラーメッセージ:「アカウントが一時停止されています。詳しくは管理者にお問い合わせください」）。past_due 超過時の担当者停止や、管理者によるアカウント一時停止で使用される（database-schema.md の users.is_active 定義を参照）

## Stripe連携のセキュリティ

### Webhook処理パターン
```typescript
// API Route: /api/webhooks/stripe
// 1. 署名検証（必須）
const event = stripe.webhooks.constructEvent(
  body, sig, process.env.STRIPE_WEBHOOK_SECRET
);
// 2. イベントタイプに応じた処理
// 3. べき等性の確保（同じイベントの重複処理を防止）
```

### 検証すべきWebhookイベント
| イベント | 処理内容 |
|---------|---------|
| checkout.session.completed | サブスクリプション作成、ロール変更 |
| customer.subscription.updated | プラン変更の反映 |
| customer.subscription.deleted | ロールダウングレード（発注者→受注者） |
| invoice.payment_failed | 支払い失敗の通知、猶予期間の管理 |
| invoice.payment_succeeded | past_due 復帰時: ステータスを 'active' に戻し、担当者の is_active を復帰（詳細は billing spec 参照） |

## メール認証フロー
- 新規登録: メールアドレス入力 → 認証メール送信 → リンククリック → 情報入力 → マイページ直接遷移
- メールアドレス変更: 後述「メールアドレス変更フロー」参照
- パスワードリセット: メールアドレス入力 → リセットリンク送信 → 新パスワード設定 → 完了メッセージ → ログイン画面
- 担当者招待（法人プラン）: 後述「担当者招待フロー」参照
- すべてSupabase Auth の標準機能を活用

## 担当者招待フロー（法人プラン）

法人プランの Owner / Admin が CLI-025 から新規担当者（Admin / Staff）を追加する際の認証フロー。詳細は `.kiro/specs/organization/requirements.md` の「担当者招待メール」セクションを正とする。

### 概要
- **呼び出し元**: CLI-025（担当者新規作成）の Server Action
- **送信手段**: `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: '{SITE_URL}/auth/callback?type=invite' })`
  - この 1 コールで「`auth.users` へのユーザー作成」＋「招待メール送信」が同時に行われる
- **有効期限**: 24 時間（Supabase 標準 TTL。拡張設定なし）
- **再送**: CLI-022 / CLI-023 の「招待メールを再送する」ボタン（Owner / Admin のみ表示。表示条件は `public.users.password_set_at IS NULL`、つまり招待リンクからのパスワード設定が未完了のユーザーに対してのみ）
- **「招待中」バッジ / 「パスワード設定済み」判定**: `last_sign_in_at` は使わず `public.users.password_set_at` カラムで判定する。理由: 招待リンクを踏んで `/auth/callback` でセッション確立した時点で `last_sign_in_at` が更新されうるため、パスワード設定完了と区別できないケースがある。`acceptInviteAction` がパスワード保存成功時に admin client で `UPDATE public.users SET password_set_at = now() WHERE id = auth.uid()` を実行して設定時刻を記録する（`auth.users.user_metadata` ではなく `public.users` の正規カラムに記録することで、一覧画面で N+1 なくクエリ可能）

### 招待された人の画面遷移

```
メール受信 → リンククリック → /auth/callback?type=invite
  → /auth/callback が exchangeCodeForSession でセッション確立
  → AUTH-008（/accept-invite/confirm）にリダイレクト
  → パスワード設定
  → CON-001（マイページ）
```

### AUTH-008 招待承諾・パスワード設定（新規画面）

- **配置**: `src/app/(auth)/accept-invite/confirm/page.tsx`
- **Server Action**: `acceptInviteAction`（`supabase.auth.updateUser({ password })` を呼び出し）
- **デザイン**: AUTH-004（パスワード再設定）と同一レイアウト。タイトル・説明文・ボタン文言・遷移先のみ招待向けに差し替え
- **期限切れ時**: 「リンクの有効期限が切れています。招待元に再送を依頼してください」＋「ログイン画面へ戻る」ボタン

### `/auth/callback` Route Handler の分岐追加

既存の `src/app/auth/callback/route.ts` に `type === 'invite'` の分岐を追加する:

```
if (flowType === 'invite') {
  return NextResponse.redirect(new URL('/accept-invite/confirm', origin));
}
```

現状の `type === 'recovery'` → `/reset-password/confirm`、デフォルト → `/register/profile` に並ぶ 3 つ目の分岐となる。

## メールアドレス変更フロー

メールアドレス変更時は Supabase Auth の "Secure email change"（新旧両方への確認）を有効化する。乗っ取り被害時に攻撃者が新メールへ書き換えて旧メールをロックアウトする攻撃を防ぐため。

### Supabase 設定

`supabase/config.toml` の `[auth.email]` セクションに既に以下が設定済み（追加作業不要）:

```toml
[auth.email]
double_confirm_changes = true
```

この設定により、メール変更リクエスト時に**旧メールと新メール両方**に確認リンクが送信され、両方クリックされるまで `auth.users.email` は更新されない。旧メールでのログインは確認完了まで維持される。

※ Supabase のダッシュボード上は "Secure email change" という名称で表示される機能と同一。過去のドキュメントで `enable_secure_email_change` と記載されているが、`config.toml` での正しいキー名は `double_confirm_changes`。

### パターンA: 本人が自分自身のメールを変更する

使用される画面: CLI-024（担当者編集 - 自己編集）、COM-006 等のプロフィール画面

1. Server Action 内で本人セッションの `supabase.auth.updateUser({ email: newEmail })` を呼ぶ
2. Supabase が旧メール・新メール両方に確認リンクを送信
3. 両方のリンクがクリックされた時点で `auth.users.email` が更新
4. DB トリガーで `public.users.email` を同期（`database-schema.md` の users テーブル定義参照）
5. UI: 「新旧メールアドレスに確認メールを送信しました。両方のリンクをクリックすると変更が完了します」トースト

### パターンB: 管理者が他ユーザーのメールを変更する（強制変更）

使用される画面:
- CLI-024（Owner / Admin が他メンバーを編集）
- ADM-008 系（システム管理者がユーザーを編集）

1. Server Action で権限検証（対象ユーザーに対する編集権限があるか）
2. admin client で `supabase.auth.admin.updateUserById(targetUserId, { email: newEmail, email_confirm: true })` を呼ぶ（即時反映）
3. DB トリガーで `public.users.email` を同期
4. 旧メール・新メール両方に通知メールを送信（「管理者によりメールアドレスが変更されました。身に覚えがない場合は〜〜」）
5. UI: 「メールアドレスを変更しました」トースト

**パターンB を使う場面**:
- 退職者のメールを代替アドレスへ付け替える
- 新入社員のアカウントのメールを設定し直す
- 本人が旧メールにアクセスできない等でパターンA を完了できない場合の救済

### 複数回の変更リクエスト

確認メール未クリックのまま新しい変更リクエストが出された場合、最新のリクエストで上書きされる（Supabase のデフォルト挙動）。システム側での特別な制御は行わない。

### 退職者等で旧メールが生きていないケース

パターンA は旧メールの確認が通らないため不可。Owner / Admin がパターンB で強制変更する運用とする。
