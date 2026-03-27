# tech.md — ビジ友（bijiyu）技術スタック

## 概要

Next.js（App Router）をフルスタックフレームワークとして採用し、Supabaseをバックエンド基盤（DB・認証・ストレージ）、Stripeを決済基盤とする構成。Vercelにデプロイ。

## フロントエンド

| 項目 | 技術 |
|------|------|
| **フレームワーク** | Next.js（App Router） |
| **言語** | TypeScript |
| **CSSフレームワーク** | Tailwind CSS |
| **UIコンポーネント** | shadcn/ui（Radix UI + Tailwind CSSベース） |
| **状態管理** | React標準（useState / useContext）※必要に応じてzustand等を検討 |
| **フォーム** | React Hook Form + Zod（バリデーション） |
| **画像最適化** | Next.js Image コンポーネント |

## バックエンド

| 項目 | 技術 |
|------|------|
| **API** | Next.js API Routes（App Router: Route Handlers） |
| **DB操作** | Supabase Client SDK（`@supabase/supabase-js`） |
| **複雑なサーバー処理** | Supabase Edge Functions（必要に応じて） |
| **決済連携** | Stripe SDK + Webhook（API Routesで受信） |
| **メール送信** | Resend |
| **リアルタイム通知** | Supabase Realtime（アプリ内通知）。Web Push通知は将来検討 |

## データベース・BaaS

| 項目 | 技術 |
|------|------|
| **BaaS** | Supabase |
| **DB** | PostgreSQL（Supabase提供） |
| **リアルタイム** | Supabase Realtime（メッセージ機能等で活用） |
| **ストレージ** | Supabase Storage（プロフィール画像・現場写真等） |
| **アクセス制御** | Row Level Security（RLS） |
| **案件検索** | PostgreSQL 全文検索（Supabase経由） |

## 認証

| 項目 | 技術 |
|------|------|
| **認証基盤** | Supabase Auth |
| **認証方式** | メール/パスワード（基本）、ソーシャルログイン（Google等、将来検討） |
| **セッション管理** | Supabase Auth + Next.js Middleware |
| **ロール管理** | プロフィールテーブルで管理（usersテーブルにroleカラム） |

## 決済

| 項目 | 技術 |
|------|------|
| **決済基盤** | Stripe |
| **サブスク管理** | Stripe Billing（5プラン：無料〜法人高サポート） |
| **Webhook** | Stripe → Next.js API Route で課金イベント処理 |
| **顧客ポータル** | Stripe Customer Portal（プラン変更・解約） |

## ホスティング・インフラ

| 項目 | 技術 |
|------|------|
| **ホスティング** | Vercel |
| **ドメイン** | 未定 |
| **環境** | Production / Preview / Development |
| **CI/CD** | Vercel Git Integration（GitHub連携で自動デプロイ） |

## CI/CD パイプライン

### GitHub Actions によるテスト自動実行

PR 作成時に全テストを自動実行し、失敗した PR はマージをブロックする。
これにより、開発者がローカルでのテスト実行を忘れた場合でもデグレードを防止できる。

**実装時に `.github/workflows/ci.yml` を作成し、以下を含めること:**

| ステップ | コマンド | 目的 |
|---------|---------|------|
| 型チェック | `npm run build` | TypeScript コンパイルエラーの検出 |
| リント | `npm run lint` | コード規約違反の検出 |
| ユニット・統合テスト | `npm run test` | Vitest の全テスト実行 |
| RLS テスト | `supabase test db` | pgTAP によるセキュリティポリシーのテスト |
| E2E テスト | `npm run test:e2e` | Playwright による画面操作テスト |

**注意事項:**
- CI 環境では Supabase CLI の `supabase start`（Docker）が必要。GitHub Actions の `services` または `supabase/setup-cli` アクションを使用する
- E2E は CI の実行時間が長くなるため、初期は Vitest + RLS のみ CI で実行し、E2E は手動 or nightly で実行する運用も許容する
- CI の詳細な設定は実装フェーズで決定する。ここでは方針のみ定義する

## 開発環境

### ローカル開発構成

| 項目 | 技術 |
|------|------|
| **Supabase ローカル** | Supabase CLI + Docker |
| **Stripe ローカル** | Stripe CLI（Webhook ローカル転送） |
| **Node.js** | v20+ |
| **パッケージマネージャ** | npm |
| **リンター** | ESLint |
| **フォーマッター** | Prettier |
| **型チェック** | TypeScript strict mode |
| **AI開発** | Claude Code + cc-sdd（仕様駆動開発） |

### Supabase ローカル開発の方針

開発時はSupabase Cloudに直接接続せず、Docker上のローカルSupabaseを使用する。

```bash
# 初期セットアップ（1回だけ）
supabase init              # supabase/ ディレクトリ作成
supabase start             # Docker コンテナ起動（DB, Auth, Storage, Realtime）

# 日常の開発フロー
supabase start             # 起動
supabase db reset          # マイグレーションを最初から適用し直す
supabase stop              # 終了

# マイグレーション管理
supabase migration new <名前>   # 新しいマイグレーションファイル作成
supabase db push               # ローカルの変更をリモートに反映（本番デプロイ時）

# 型生成
supabase gen types typescript --local > src/types/database.ts
```

**環境の使い分け:**

| 環境 | Supabase | 用途 |
|------|---------|------|
| ローカル開発 | Supabase CLI + Docker | 日常の開発・テスト。RLSポリシーの検証 |
| Preview（Vercel） | Supabase Cloud（開発用プロジェクト） | PRプレビュー・チーム内レビュー |
| Production（Vercel） | Supabase Cloud（本番プロジェクト） | 本番サービス |

**ローカル開発の利点:**
- オフラインで開発可能
- テストデータを自由に作成・削除できる
- RLSポリシーやマイグレーションをローカルで検証してから本番に反映
- Supabase Cloudの無料枠を開発中に消費しない

### Stripe CLI（ローカル Webhook テスト）

billing 機能の実装時に使用する。Stripe の決済イベント（Webhook）をローカル環境で
テストするためのツール。

**なぜ必要か:**
- Stripe は決済完了時に Webhook イベントをサーバーに送信する
- ローカル開発中は localhost に外部からアクセスできない
- Stripe CLI がその橋渡しをして、Stripe → localhost:3000 にイベントを転送する
- これがないと「決済は完了したが users.role が contractor のまま」という状態になる

**インストール:**

  # macOS
  brew install stripe/stripe-cli/stripe

  # Windows
  scoop install stripe

**使い方:**

  # Stripe アカウントにログイン（初回のみ）
  stripe login

  # Webhook をローカルに転送（billing 開発中は常時起動）
  stripe listen --forward-to localhost:3000/api/webhooks/stripe

  # 出力される Webhook signing secret（whsec_...）を .env.local に設定
  # STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxx

  # テストイベントを手動で送信（動作確認用）
  stripe trigger checkout.session.completed
  stripe trigger customer.subscription.deleted
  stripe trigger invoice.payment_failed

**開発時の起動順序（billing 機能の開発時）:**

  # ターミナル1: Supabase
  supabase start

  # ターミナル2: Stripe CLI
  stripe listen --forward-to localhost:3000/api/webhooks/stripe

  # ターミナル3: Next.js
  npm run dev

**環境の使い分け（決済）:**

| 環境 | Stripe | 用途 |
|------|--------|------|
| ローカル開発 | Stripe CLI + テストモード | Webhook のローカル転送・テスト決済 |
| Preview（Vercel） | Stripe テストモード | PR プレビューでの決済テスト |
| Production（Vercel） | Stripe 本番モード | 本番決済 |


### Git LFS（デザインアセット管理）

80枚のPNG（推定合計50-100MB）をGitで効率的に管理するため、Git LFSを推奨する。

```bash
# 初期セットアップ（1回だけ）
# macOS
brew install git-lfs
# Windows（Git for Windowsに同梱済みの場合は不要）
# git lfs install のみでOK

# プロジェクトでLFSを有効化
git lfs install
git lfs track "design-assets/screens/*.png"
git add .gitattributes

# 以降は通常通り git add / commit するだけ
# PNGは自動的にLFS経由で管理される
```

※ Git LFSは必須ではない。PNGの枚数が少ないうちはなくても問題ない。リポジトリが重くなってきたら導入を検討する形でもOK。

### 共通コマンド

```bash
# 開発サーバー起動（Next.js + Supabaseローカル）
supabase start && npm run dev

# ビルド
npm run build

# テスト
npm run test           # Vitest（ユニット・統合）
supabase db reset && npm run test:e2e  # Playwright（E2E）※DBリセット後に実行
supabase test db       # RLSテスト（pgTAP）

# Stripe Webhook ローカル転送（billing 開発時）
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Stripe テストイベント送信（billing 開発時）
stripe trigger checkout.session.completed
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_failed

# 型生成
supabase gen types typescript --local > src/types/database.ts

# リント・フォーマット
npm run lint
npm run format
```

## 技術方針

- **サーバーコンポーネント優先**: Next.js App Routerのサーバーコンポーネントをデフォルトとし、インタラクションが必要な部分のみクライアントコンポーネント化
- **型安全**: Supabaseの型生成（`supabase gen types`）を活用し、DBスキーマとTypeScriptの型を同期
- **RLSファースト**: データアクセス制御はSupabase RLSで行い、APIルートでの二重チェックも実施
- **環境変数管理**: Supabaseキー・Stripeキー等はVercel環境変数で管理。コードにハードコードしない
- **ロール管理**: プロフィールテーブル（usersテーブル）でロールを管理。課金によるロール変更はDB更新で対応し、Middlewareでセッションキャッシュを活用
- **UIコンポーネント**: shadcn/uiをベースにし、プロジェクト内にコピーして使用。必要なコンポーネントだけ追加し、カスタマイズはTailwind CSSで行う
- **通知**: 初期はSupabase Realtimeによるアプリ内通知のみ。ブラウザのWeb Push通知はMVP後に検討

## データフェッチ戦略

### 基本原則
- サーバーコンポーネント（RSC）でのデータ取得をデフォルトとする
- クライアントコンポーネントでの fetch は以下の場合のみ使用:
  - リアルタイム更新が必要（メッセージ、通知）
  - ユーザー操作に応じた動的再取得（検索フィルター、無限スクロール）
  - 楽観的UI更新が必要（いいね、既読など即座にフィードバックしたい操作）

### パターン別の実装方針

| パターン | 取得方法 | 使用箇所 |
|---------|---------|---------|
| 初期表示（静的） | RSC + Supabase server client | 案件一覧、プロフィール詳細、管理画面 |
| ページネーション | RSC + searchParams | 案件一覧、ユーザー一覧（20件ずつ） |
| リアルタイム更新 | Supabase Realtime（後述） | メッセージ、通知バッジ |
| ユーザー操作起点の更新 | Server Actions + revalidatePath | 案件作成、プロフィール編集、応募 |
| 楽観的UI | useOptimistic + Server Actions | メッセージ送信、既読マーク |

### Supabase クライアントの使い分け
- サーバーコンポーネント / Server Actions: `createServerClient`（cookieベース）
- クライアントコンポーネント（Realtime等）: `createBrowserClient`
- API Route（Webhook等）: `createClient`（サービスロールキー）

## Supabase Realtime 利用方針

### 使用範囲
Realtime はコストと複雑性が伴うため、使用箇所を限定する。

| 機能 | Realtime | 理由 |
|------|---------|------|
| メッセージ（1対1チャット） | ○ 使用 | 即時性が必須。ポーリングではUXが悪い |
| 通知バッジ（未読数） | ○ 使用 | ヘッダーに常時表示。新着を即座に反映 |
| 案件一覧 | × 不使用 | ページ遷移 or リロードで十分 |
| マッチング状態 | × 不使用 | Server Actions + revalidatePath で対応 |
| 管理画面 | × 不使用 | 手動リロードで十分 |

### Realtime 実装パターン

メッセージ機能での標準パターン:

1. **購読開始**: チャット画面マウント時に該当スレッドを購読
2. **購読終了**: チャット画面アンマウント時に購読解除（メモリリーク防止）
3. **楽観的UI**: 送信ボタン押下 → 即座にUIに反映 → Server Action実行
   → 失敗時はUIをロールバック＋エラートースト表示
4. **再接続**: 接続断 → 自動再接続（Supabase Realtimeの標準機能）
   → 再接続後に差分メッセージを取得（最後の受信タイムスタンプ以降）
5. **既読管理**: メッセージ表示時に既読APIを呼び出し（デバウンス処理で頻度制限）

### 注意事項
- Realtime の同時接続数は Supabase プランに依存する（Free: 200接続）
- 購読チャネルは `messages:thread_id=xxx` のようにフィルタリングし、不要なデータを受信しない
- Realtime のイベントタイプは INSERT のみ購読する（UPDATE/DELETE は不要）

## メール送信パターン（Resend）

### 基本方針
- メール送信サービス: Resend
- テンプレート管理: React Email（JSXでテンプレートを定義）
- 送信トリガー: Server Actions または Webhook ハンドラー内で実行
- 送信元アドレス: noreply@{ドメイン}（トランザクションメール）

### メール種別と送信トリガー

| 種別 | メール内容 | トリガー | 対象spec |
|------|-----------|---------|---------|
| 認証系 | メールアドレス確認 | Supabase Auth 標準機能 | auth |
| 認証系 | パスワードリセット | Supabase Auth 標準機能 | auth |
| 通知系 | マッチング成立通知（受注者へ） | Server Action（発注者が応募を承認時） | matching |
| 通知系 | 発注お断り通知（受注者へ） | Server Action（発注者が応募を拒否時） | matching |
| 通知系 | スカウト受信通知（受注者へ） | Server Action（発注者がスカウト送信時） | messaging |
| 通知系 | 新着メッセージ通知 | Server Action（未読一定時間後） | messaging |
| 通知系 | 本人確認 承認通知 | Server Action（管理者承認時） | profile |
| 通知系 | 本人確認 否認通知（再提出依頼） | Server Action（管理者否認時） | profile |
| 通知系 | CCUS登録 承認通知 | Server Action（管理者承認時） | profile |
| 通知系 | CCUS登録 否認通知 | Server Action（管理者否認時） | profile |
| 通知系 | 退会完了通知 | Server Action（退会処理完了時） | profile |
| 決済系 | 支払い失敗通知 | Stripe Webhook（invoice.payment_failed） | billing |
| 決済系 | プラン変更確認 | Stripe Webhook（subscription.updated） | billing |
| 決済系 | 解約完了通知 | Stripe Webhook（subscription.deleted） | billing |
| 運営系 | サービスからのお知らせ | 管理画面からの手動送信 | admin |

### Supabase Auth メールとの使い分け

| メール | 送信方法 | 理由 |
|--------|---------|------|
| メールアドレス確認 | Supabase Auth 標準 | 認証トークンの生成・検証をSupabaseに任せるため |
| パスワードリセット | Supabase Auth 標準 | 同上 |
| その他すべて | Resend（アプリ側で送信） | テンプレートの自由度、送信タイミングの制御が必要 |

Supabase Auth の標準メールもカスタムSMTP（Resend）経由で送信可能。
Supabase Dashboard > Authentication > Email Templates でテンプレートをカスタマイズし、
SMTP設定にResendのクレデンシャルを設定する。

### 実装パターン

送信処理は以下のヘルパー関数に集約する:

- ファイル配置: `src/lib/email/`
  - `send-email.ts` — Resend API呼び出しのラッパー
  - `templates/` — React Email テンプレート（.tsx）

- 送信失敗時の方針:
  - リトライ: Resend の自動リトライに任せる（設定で3回まで）
  - ログ: 送信結果（成功/失敗）を監査ログに記録
  - ユーザーへの影響: メール送信失敗で本体処理をロールバックしない
    （例: マッチング承認は成功、通知メールだけ失敗 → 許容）

### テンプレートの統一ルール
- ヘッダー: ビジ友ロゴ + サービス名
- フッター: 配信停止リンク + サービスURL + 問い合わせ先
- レスポンシブ: モバイルで読みやすいシングルカラムレイアウト
- 言語: 日本語のみ

## テスト戦略

### テストツール
- ユニットテスト / 統合テスト: Vitest
- E2Eテスト: Playwright
- RLSテスト: Supabase CLI（`supabase test db`）+ pgTAP

### テスト密度の判断基準

spec-tasks フェーズで各タスクにテストを含めるかどうかは、以下の基準で判断すること。

| リスクレベル | 対象 | テスト種別 | 例 |
|------------|------|----------|-----|
| 高 | データ書き込み + 権限チェック | ユニット + 統合 + RLS | 本人確認書類アクセス、ロール変更、Webhook処理 |
| 中 | データ書き込みあり | ユニット + 統合 | プロフィール更新、案件作成、メッセージ送信 |
| 低 | 表示のみ（読み取り） | ユニットのみ（必要な場合） | 案件一覧表示、プロフィール閲覧 |

### 第1層: ユニットテスト（全specで実施）
- Zodバリデーションスキーマのテスト
- 権限判定ロジック（canAccess, canEdit 等）のテスト
- 料金計算・プラン判定ロジックのテスト
- spec-impl の各タスクと同時に作成する

#### Vitest モックの品質ルール

Server Action のテストでは、テストの信頼性を保つために以下のルールを守ること。

**モック対象の判断基準:**

| 対象 | モックする？ | 理由 |
|------|------------|------|
| Server Action 関数自体 | ✕ モックしない | 内部ロジック（Zod バリデーション、FormData 解析、エラーハンドリング）をテストするため |
| Supabase クライアント | ○ モックする | 外部依存を排除するため |
| Supabase Storage | ○ モックする | 外部依存を排除するため |
| Stripe API | ○ モックする | 外部依存を排除するため |
| Resend（メール送信） | ○ モックする | 外部依存を排除するため |
| Next.js の機能（cookies, redirect等） | ○ モックする | サーバー環境固有の機能のため |

#### Supabase クライアントのモック例

正しいモック（Server Action の内部ロジックは実物が動く）:
```typescript
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'user-1', last_name: 'テスト', role: 'contractor' },
        error: null,
      }),
      insert: vi.fn().mockResolvedValue({ data: { id: 'new-1' }, error: null }),
      update: vi.fn().mockResolvedValue({ data: { id: 'user-1' }, error: null }),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'avatars/user-1/abc.jpg' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'http://localhost:54321/storage/v1/object/public/avatars/user-1/abc.jpg' } }),
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    },
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1', email: 'test@example.com' } },
        error: null,
      }),
    },
  })),
}))
```

誤ったモック（Server Action の内部ロジックが一切テストされない）:
```typescript
// ✕ これをやってはいけない
vi.mock('@/app/(authenticated)/profile/edit/actions', () => ({
  updateProfileAction: vi.fn().mockResolvedValue({ success: true }),
}))
```

#### FormData を含むテストの書き方

```typescript
// ✅ 正しい: 実際に FormData を組み立てて Server Action に渡す
const formData = new FormData()
formData.append('lastName', '山田')
formData.append('firstName', '太郎')
formData.append('gender', '男性')
formData.append('avatar', new File(['dummy'], 'avatar.png', { type: 'image/png' }))

const result = await updateProfileAction(formData)
expect(result.success).toBe(true)
```

```typescript
// ✕ 誤り: FormData を省略して直接オブジェクトを渡す
const result = await updateProfileAction({ lastName: '山田' })
```

#### 異常系テストの書き方

```typescript
// Supabase が error を返すケース
vi.mocked(mockSupabase.from).mockReturnValue({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({
    data: null,
    error: { message: 'Not found', code: 'PGRST116' },
  }),
} as any)

const result = await someAction(formData)
expect(result.success).toBe(false)

// auth.getUser() が error を返すケース（未認証）
vi.mocked(mockSupabase.auth.getUser).mockResolvedValue({
  data: { user: null },
  error: { message: 'Not authenticated' },
} as any)
```

### 第2層: 統合テスト（セキュリティ関連specで重点実施）

重点対象spec: auth, billing, profile, organization

- **RLSポリシーテスト（最重要）**:
  - 受注者Aが発注者Bのデータにアクセスできないこと
  - 本人確認書類は本人と管理者のみアクセス可
  - 課金ステータスに応じた機能制限が正しく動作すること
- **Stripe Webhookハンドラー**:
  - 署名検証の成功/失敗
  - べき等性（同一イベントの重複処理防止）
  - 各イベントタイプの処理結果
- **ロール変更フロー**:
  - 課金成功 → 受注者から発注者へのロール昇格
  - 解約 → 発注者から受注者へのダウングレード
  - 法人プラン内の権限階層

### デグレーション防止ゲート（spec-impl 開始時の必須チェック）

新しい機能の spec-impl を開始する際、最初のステップとして以下を順に実行する。
いずれかが失敗した場合、新機能の実装に着手せず、まず失敗の原因を調査・修正すること。

```bash
# 1. ユニット・統合テスト
npm run test

# 2. RLS テスト（pgTAP）
supabase test db

# 3. E2E テスト（Playwright）※ 事前に supabase start + supabase db reset + npm run dev が必要
npm run test:e2e
```

**なぜ3種類すべて実行するのか:**
- Vitest: Server Action のロジック破壊、Zod スキーマ変更の副作用を検出
- RLS テスト: マイグレーション追加によるセキュリティポリシーの意図しない変更を検出
- E2E: 画面遷移やフォーム送信など、ユーザー操作レベルの破壊を検出

この3層すべてを通過して初めて「既存機能が壊れていない」と判断できる。

### 第3層: E2Eテスト（各 spec-impl 完了後に作成）

各機能の spec-impl 完了後、その機能の書き込み系操作（保存・アップロード・送信など）をカバーする Playwright テストを作成する。
新しい機能の spec-impl 開始時の最初のステップとして `npm run test:e2e` を実行し、既存の全 Playwright テストが通ること（デグレードがないこと）を確認する。

**対象操作の例（書き込み系を優先）:**
- フォーム送信（プロフィール保存、お問い合わせ送信、退会手続き等）
- ファイルアップロード（アバター画像、本人確認書類、CCUS書類）
- 認証フロー（ログイン、新規登録、パスワードリセット）
- 決済フロー（課金、プラン変更、解約）

**主要フロー（参考）:**

| # | フロー | 対象spec | 目的 |
|---|--------|---------|------|
| 1 | 新規登録 → メール認証 → プロフィール設定 | auth, profile | 基本導線の確認 |
| 2 | 案件検索 → 案件詳細 → 応募 | job-search | 受注者のコアフロー |
| 3 | 課金 → 発注者機能アンロック → 案件作成 | billing, job-posting | 課金連動の確認 |
| 4 | 管理者ログイン → 本人確認承認 | admin, profile | 管理者フローの確認 |
| 5 | メッセージ送受信（受注者 ↔ 発注者） | messaging | リアルタイム通信の確認 |

#### Playwright テスト環境

##### 実行前提条件

Playwright テストは実際のブラウザ＋ローカル Supabase で動作する。実行前に以下が必要:

1. `supabase start` でローカル Supabase が起動していること
2. `supabase db reset` で DB がクリーンな状態であること（seed.sql のテストデータが投入済み）
3. `npm run dev` で Next.js 開発サーバーが起動していること

```bash
# Playwright テストの実行手順
supabase start              # 1. Supabase 起動（未起動の場合）
supabase db reset            # 2. DB リセット + seed 投入
npm run dev &                # 3. Next.js 起動（バックグラウンド）
npm run test:e2e             # 4. テスト実行
```

##### テスト用ユーザー（seed.sql で作成）

| ロール | メールアドレス | パスワード | 用途 |
|--------|-------------|-----------|------|
| 受注者（Contractor） | contractor@test.local | testpass123 | 受注者機能のテスト |
| 発注者（Client） | client@test.local | testpass123 | 発注者機能のテスト |
| 担当者（Staff） | staff@test.local | testpass123 | 法人プラン担当者機能のテスト |
| 管理者（Admin） | admin@test.local | testpass123 | 管理者画面のテスト |

seed.sql では以下も含めること:
- 発注者のサブスクリプション（subscriptions テーブル、status = 'active'）
- 担当者の組織所属（organizations, organization_members テーブル）
- テスト用の案件データ（jobs テーブル、1〜2件）
- テスト用の Storage バケット作成（avatars, job-attachments, identity-documents, ccus-documents, message-attachments）

##### メール認証の扱い

ローカル開発環境では `supabase/config.toml` で**メール確認をスキップ**する設定にする:

```toml
[auth]
enable_confirmations = false
```

新規登録フローのテスト（メール認証の動作確認が必要な場合）のみ、
ローカル Supabase の Inbucket（http://127.0.0.1:54324）でメールを確認する。

##### データベース状態管理

- テスト実行前に `supabase db reset` で DB を初期状態に戻す（seed.sql のデータのみの状態）
- テスト間でデータが干渉しないよう、各テストは seed データを前提として動作すること
- テスト内で作成したデータのクリーンアップは不要（次回の `db reset` でリセットされる）

### テストファイルの配置
- ユニット / 統合: `src/__tests__/` 配下に spec 名でディレクトリを切る
- E2E: `e2e/` 配下にフロー名でファイルを作成
- RLS: `supabase/tests/` 配下に pgTAP テストを配置

### spec-tasks での記載ルール
tasks.md にテストタスクを含める際は、以下の形式で記載する:
- タスク名に [test] プレフィックスを付与
- 対象のリスクレベル（高/中/低）を明記
- テスト種別（ユニット/統合/RLS/E2E）を明記
