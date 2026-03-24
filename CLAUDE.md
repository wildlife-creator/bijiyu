# CLAUDE.md — ビジ友（bijiyu）プロジェクト指示書

## プロジェクト概要

建設業界の職人（受注者）と発注者をつなぐWebマッチングサービス。
cc-sdd（Spec-Driven Development）で開発を進める。

## パス構成

- ステアリング: `.kiro/steering/`
- 仕様書: `.kiro/specs/`
- デザインアセット: `design-assets/`（画面PNG、CSS spec、globals.css、tailwind.config.ts）
- リファレンス: `reference/`（PNG マッピング等）
- Supabase: `supabase/`（migrations, seed, tests）※実装フェーズで作成

## ステアリングファイル一覧（12ファイル）

| ファイル | 内容 |
|---------|------|
| product.md | サービス概要、プラン、ビジネスモデル |
| tech.md | 技術スタック、メール、テスト、Realtime戦略 |
| structure.md | ディレクトリ構成、命名規則、ルーティング |
| screen-map.md | 全77画面一覧、画面ID |
| screen-navigation.md | 画面遷移フロー |
| roles-and-permissions.md | ロール、権限、プラン制限 |
| security.md | セキュリティ方針、入力検証 |
| authentication.md | 認証、認可、Stripe Webhook |
| database-schema.md | テーブル設計、RLS、マイグレーション |
| design-system.md | デザイントークン、レスポンシブ方針 |
| design-rule.md | Tailwindクラス実装ルール |
| implementation-notes.md | 実装判断の補足・注意点 |

## 開発ワークフロー

### cc-sdd フロー
1. `spec-init` → 機能の初期化
2. `spec-requirements` → 要件定義
3. `spec-design` → 設計
4. `spec-tasks` → タスク分解
5. `spec-impl` → 実装

### 開発の進め方
- 全77画面を機能グループごとに実装する
- 各グループの実装完了ごとに動作確認を行う
- テストはリスクベース: 書き込み+権限系はフルテスト、読み取り系はミニマル

## 言語・コーディング規約

### 言語
- コード: English（変数名、関数名、コメント）
- UI テキスト: Japanese（ボタンラベル、エラーメッセージ、プレースホルダー）
- ドキュメント: Japanese（spec ファイル、steering ファイル）

### TypeScript
- `strict: true` を有効にする
- `any` は使用禁止。型が不明な場合は `unknown` を使う
- 型定義は Supabase CLI の `supabase gen types` で自動生成したものを使用する
- コンポーネントの Props は `interface` で定義する

### ファイル命名
- ファイル名: kebab-case（例: `job-search-form.tsx`）
- コンポーネント名: PascalCase（例: `JobSearchForm`）
- 関数・変数名: camelCase（例: `getJobById`）
- 定数: UPPER_SNAKE_CASE（例: `MAX_SKILLS_COUNT`）
- DB関連の型: snake_case（Supabase 自動生成に合わせる）

### インポート
- `@/` エイリアスを使用する（`../../` の相対パスは禁止）
- インポート順: React → 外部ライブラリ → `@/` 内部モジュール → 相対パス

### コンポーネント設計
- Server Component をデフォルトとする
- `"use client"` は必要な場合のみ付与（useState、useEffect、イベントハンドラ使用時）
- 1ファイル1コンポーネント（ヘルパーコンポーネントは同ファイル内可）
- Props が5つ以上になったら設計を見直す

### スタイリング
- Tailwind CSS のユーティリティクラスのみ使用する
- カスタム CSS は原則禁止（globals.css の CSS変数定義を除く）
- shadcn/ui コンポーネントを優先的に使用する
- design-rule.md に定義されたクラスの組み合わせに従う

### 開発ツール（MCP）
- コードベースの検索・シンボル参照・編集には Serena MCP のツールを優先的に使用すること
- ファイルの全文検索や grep よりも、Serena のセマンティック検索（シンボル定義・参照の追跡）を先に試す

### データフェッチ
- デフォルト: React Server Components（RSC）で直接フェッチ
- 変更操作: Server Actions
- リアルタイム: Supabase Realtime（メッセージ + 通知バッジのみ）
- クライアントフェッチ: 上記で対応できない場合のみ

### エラーハンドリング
- Server Actions は `{ success: boolean, error?: string, data?: T }` 形式で返す
- ユーザー向けエラーメッセージは日本語で表示する
- 技術的なエラー詳細はログに記録し、ユーザーには見せない
- フォームバリデーションは Zod スキーマでクライアント・サーバー両方で実施する

### セキュリティ（必ず守ること）
- 全テーブルに RLS を有効化し、デフォルトで全アクセスを拒否する
- 権限チェックは Middleware（ルーティング）+ RLS（データアクセス）の二重防御
- 機密データ（本人確認書類等）は非公開バケットに保存する
- 環境変数をコードにハードコードしない

### テスト
- テストファイルは `__tests__/` ディレクトリに配置する
- 命名: `{対象}.test.ts` / `{対象}.test.tsx`
- spec-tasks で生成されたテスト指示に従う
- 高リスク（書き込み + 権限）: ユニット + インテグレーション必須
- 低リスク（読み取りのみ）: ユニットのみで可

### Git コミット
- 1機能1コミットを基本とする
- コミットメッセージは日本語で、何を変更したか簡潔に書く
- マイグレーションファイルは必ずコミットに含める

## 禁止事項

- `any` 型の使用
- `!important` の使用
- インラインスタイル（`style={}` 属性）の使用
- `console.log` を本番コードに残すこと
- `.env` ファイルの Git コミット
- RLS を無効にしたままのテーブルを残すこと
- `dangerouslySetInnerHTML` の使用（XSS対策）
- パスワード・トークン・機密情報のログ出力
