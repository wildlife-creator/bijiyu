# プロジェクト構造 — ビジ友

## 設計方針

機能ベース + Next.js App Router の規約に従う構成。

## ディレクトリパターン

### アプリケーションルート
**場所**: `src/app/`
**方針**: Next.js App Router のルーティング規約に従う

```
src/app/
├── (auth)/              # 認証系（AUTH-001〜007）
│   ├── login/
│   ├── register/
│   └── reset-password/
├── (authenticated)/     # ログイン後の一般ユーザー画面
│   ├── mypage/          # CON-001 マイページ
│   ├── jobs/            # 案件系（CON-002〜004, CLI-001〜004）
│   ├── users/           # ユーザー/発注者検索（CON-005〜006, CLI-005〜006）
│   ├── favorites/       # マイリスト（CON-007）
│   ├── messages/        # メッセージ（CON-008〜010, CLI-013〜015）
│   ├── applications/    # 応募（CON-011〜013, CLI-007〜012）
│   ├── schedule/        # 空き日程（CON-014〜016）
│   ├── profile/         # プロフィール・本人確認（COM-001〜006）
│   ├── organization/    # 担当者管理（CLI-016〜025）
│   └── billing/         # 課金（CLI-026〜027）
├── admin/               # 管理者系（ADM-001〜015）完全分離
│   ├── login/
│   ├── dashboard/
│   ├── clients/
│   ├── users/
│   ├── verifications/
│   ├── applications/
│   └── settings/
├── api/                 # API Routes
│   └── webhooks/
│       └── stripe/
├── layout.tsx
├── globals.css
└── page.tsx             # ルート（→ AUTH-001 or CON-001 にリダイレクト）
```

### コア画面（spec横断）
- CON-001（マイページ）: 受注者・発注者の共通エントリポイント
  - 課金前: 受注者メニューのみ表示
  - 課金後: 発注者メニューが追加
  - 実装: `src/app/(authenticated)/mypage/page.tsx`
  - 関連spec: auth（認証後の遷移先）、billing（課金後のメニュー変更）

### 共有コンポーネント
**場所**: `src/components/`

```
src/components/
├── ui/                  # shadcn/ui コンポーネント（npx shadcn-ui@latest addで追加）
├── layout/              # レイアウト系（Header, Footer, Sidebar, Navigation）
├── forms/               # 共通フォーム部品
└── shared/              # その他の共通コンポーネント
```

### ビジネスロジック
**場所**: `src/lib/`

```
src/lib/
├── supabase/            # Supabase クライアント設定
│   ├── server.ts        # サーバー用クライアント（createServerClient）
│   ├── client.ts        # ブラウザ用クライアント（createBrowserClient）
│   └── admin.ts         # サービスロール用（Webhook等）
├── stripe/              # Stripe 関連
├── email/               # Resend メール送信
│   ├── send-email.ts
│   └── templates/       # React Email テンプレート（.tsx）
├── validations/         # Zod スキーマ
└── utils/               # ユーティリティ関数
    └── display-name.ts  # 退会済みユーザーの表示名処理（下記参照）
```

### 退会済みユーザーの表示名処理（共通ユーティリティ）

退会済みユーザー（`deleted_at` が null でない）の名前を表示する際、全画面で統一的に「退会済みユーザー」と表示する。
この処理は `src/lib/utils/display-name.ts` に共通関数として定義し、各画面から呼び出す。

**対象関数:**

```typescript
// 受注者の表示名を返す。退会済みの場合は「退会済みユーザー」を返す
getUserDisplayName(user: { first_name: string; last_name: string; deleted_at: string | null }): string

// 発注者（組織）の表示名を返す。退会済みの場合は「退会済みユーザー」を返す
getClientDisplayName(profile: { display_name: string; user: { deleted_at: string | null } }): string
```

**使用する画面（退会済みユーザーが表示される可能性がある箇所）:**
- CON-008（メッセージ一覧）: 相手の名前
- CON-009（メッセージ詳細）: 送信者名
- CON-011（応募履歴一覧）: 発注者名
- CLI-007（応募者一覧）: 応募者名
- CLI-008〜012（マッチング詳細）: 相手方の名前
- CLI-028（発注者評価）: 評価対象者名
- CON-005, CLI-005（ユーザー検索）: 表示名
- ADM-008（管理画面ユーザー一覧）: 退会済み表示

### 型定義
**場所**: `src/types/`

```
src/types/
├── database.ts          # supabase gen types で自動生成
└── index.ts             # アプリ固有の型定義
```

## 命名規則

- **ファイル**: kebab-case（`user-profile.tsx`, `send-email.ts`）
- **コンポーネント**: PascalCase（`UserProfile`, `JobCard`）
- **関数**: camelCase（`getUserById`, `sendNotification`）
- **定数**: UPPER_SNAKE_CASE（`MAX_MESSAGE_COUNT`, `FREE_PLAN_LIMIT`）
- **DBカラム**: snake_case（`created_at`, `user_id`）

## インポート

```typescript
// 絶対パス（@/ エイリアス）
import { Button } from '@/components/ui/button'
import { createServerClient } from '@/lib/supabase/server'
import { userSchema } from '@/lib/validations/user'

// 相対パス（同一ディレクトリ内のみ）
import { JobCard } from './job-card'
```

**パスエイリアス:**
- `@/` → `src/`

## Supabase関連ファイル

```
supabase/
├── config.toml          # Supabase CLI 設定
├── migrations/          # DBマイグレーション
│   ├── 001_create_users.sql
│   ├── 002_create_jobs.sql
│   └── ...
├── seed.sql             # テストデータ
└── tests/               # pgTAP テスト（RLSポリシーテスト）
```

## デザインアセット

```
design-assets/
├── screens/             # Figma PNG（{画面ID}.png）
└── specs/               # デザイン要件CSS（{画面ID}-{pc|sp}.css）
```

命名規則は screen-map.md の画面IDと完全一致させる。

### 静的アセット（public）

```
public/
└── images/
    ├── logo-vertical.png    # ロゴ縦型（ランディング、認証画面）
    ├── logo-horizontal.png  # ロゴ横型（ヘッダー）
    └── icons/               # Figma デザイン準拠のカスタムアイコン PNG
        ├── icon-search.png
        ├── icon-memo.png
        ├── icon-globe.png
        ├── icon-briefcase.png
        ├── icon-avatar.png
        ├── icon-sort.png
        ├── icon-tag.png
        ├── icon-heart.png
        └── icon-pin.png
```

- ロゴは Next.js `<Image src="/images/logo-horizontal.png">` で参照
- アイコンは `<Image src="/images/icons/icon-heart.png">` で参照
- Lucide React で代替可能な場合は Lucide を優先（PNG は Figma デザインと完全一致が必要な場合のみ使用）
