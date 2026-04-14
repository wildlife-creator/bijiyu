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
- メールアドレス変更: 新アドレスに認証メール → リンククリック → 変更完了
- パスワードリセット: メールアドレス入力 → リセットリンク送信 → 新パスワード設定 → 完了メッセージ → ログイン画面
- すべてSupabase Auth の標準機能を活用
