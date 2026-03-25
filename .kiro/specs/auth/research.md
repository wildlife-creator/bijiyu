# Research & Design Decisions — auth

## Summary
- **Feature**: auth（認証機能）
- **Discovery Scope**: New Feature（グリーンフィールド）
- **Key Findings**:
  - Supabase Auth はメール認証フローで `signUp` 時に `auth.users` にレコードを作成し、メール確認後にセッションを確立する。DB Trigger で `public.users` が自動生成される
  - `@supabase/ssr` パッケージが Next.js App Router との統合に推奨される。Cookie ベースのセッション管理を提供し、Server Components / Server Actions / Middleware すべてで使用可能
  - 新規登録フローでは `signUp` → メール確認 → リダイレクト → プロフィール入力の段階的フローが必要。Supabase Auth のリダイレクトURL設定と `auth/callback` Route Handler でトークン交換を行う

## Research Log

### Supabase Auth + Next.js App Router 統合パターン
- **Context**: Next.js App Router での Supabase Auth のセッション管理方法を確認
- **Sources Consulted**: Supabase 公式ドキュメント（Auth with Next.js）、`@supabase/ssr` README
- **Findings**:
  - `@supabase/ssr` が `@supabase/auth-helpers-nextjs` に代わる推奨パッケージ
  - Cookie ベースのセッション管理。`createServerClient`（Server Components / Server Actions / Middleware 用）と `createBrowserClient`（Client Components 用）を提供
  - Middleware でセッションリフレッシュ（`supabase.auth.getUser()`）を毎リクエスト実行する必要がある
  - `auth/callback` Route Handler で PKCE コード交換を処理する
- **Implications**: `src/lib/supabase/` に server.ts / client.ts / middleware.ts のヘルパーを配置。steering の structure.md に準拠

### メール認証 → プロフィール入力フロー
- **Context**: `signUp` 後のメール確認完了からプロフィール入力画面への遷移方法
- **Sources Consulted**: Supabase Auth ドキュメント（Email Auth / Redirect URLs）
- **Findings**:
  - `signUp` の `options.emailRedirectTo` で確認メールのリンク先を指定可能
  - メール内リンククリック → `/auth/callback?code=xxx` → Route Handler でトークン交換 → `/register/profile` へリダイレクト
  - トークン交換後はセッションが確立され、`auth.users` にレコードが存在する状態
  - DB Trigger（005_auth_trigger.sql）により `public.users` に `role='contractor'` のレコードが自動作成済み
- **Implications**: プロフィール入力画面では `public.users` の UPDATE + `user_skills` / `user_available_areas` の INSERT を行う

### パスワードリセットフロー
- **Context**: Supabase Auth のパスワードリセット機能の挙動確認
- **Sources Consulted**: Supabase Auth ドキュメント（Password Reset）
- **Findings**:
  - `resetPasswordForEmail` でリセットメール送信。`redirectTo` オプションでリダイレクト先を指定
  - リセットリンククリック → `/auth/callback?code=xxx&type=recovery` → Route Handler でトークン交換 → パスワード再設定画面へリダイレクト
  - `updateUser({ password: newPassword })` で新パスワードを設定
  - 存在しないメールでもエラーを返さない（Supabase の設定で制御可能）
- **Implications**: `/auth/callback` Route Handler で `type` パラメータを確認し、recovery の場合は `/reset-password/confirm` へリダイレクト

### Middleware でのロール検証
- **Context**: authentication.md の「Middleware のロール再検証ルール」を実装する方法
- **Sources Consulted**: Supabase + Next.js Middleware パターン
- **Findings**:
  - Middleware で `supabase.auth.getUser()` を呼び出しセッションを検証
  - 認証済みの場合、`public.users` から `role`, `deleted_at`, `is_active` を取得
  - JWT 内の role を信用せず、毎回 DB を直接参照する（authentication.md の方針）
  - `is_active = false` の場合はセッション破棄 → ログイン画面へリダイレクト
- **Implications**: Middleware はセッション検証 + DB ロール取得の2段階処理

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Server Actions + RSC | Server Actions でフォーム処理、RSC で初期表示 | Next.js 標準、型安全、steering 準拠 | クライアント状態管理が限定的 | 採用 |
| API Routes | REST API で認証エンドポイントを作成 | RESTful | Server Actions より冗長、不要な複雑さ | 不採用（Webhook 以外） |

## Design Decisions

### Decision: Server Actions によるフォーム処理
- **Context**: ログイン・登録・パスワードリセットのフォーム送信処理
- **Alternatives Considered**:
  1. Server Actions — Next.js 標準のフォーム処理
  2. API Routes — REST エンドポイント
- **Selected Approach**: Server Actions
- **Rationale**: tech.md の方針（変更操作は Server Actions）に準拠。型安全で、Zod バリデーションとの統合が容易
- **Trade-offs**: API Route のような明示的なエンドポイント定義がない分、外部からの呼び出しには不向き（auth 機能では不要）
- **Follow-up**: `{ success: boolean, error?: string, data?: T }` 形式の統一レスポンス型を定義

### Decision: PKCE コード交換用 Route Handler
- **Context**: メール確認リンク・パスワードリセットリンクのコールバック処理
- **Selected Approach**: `/auth/callback` Route Handler で PKCE コード交換を行い、フロー種別（signup / recovery）に応じてリダイレクト先を分岐
- **Rationale**: Supabase Auth の推奨パターン。Server-side でトークン交換を行うことでセキュリティを確保

### Decision: 新規登録のプロフィール入力をトランザクションで処理
- **Context**: REQ-AUTH-006 のプロフィール情報登録（users UPDATE + user_skills INSERT + user_available_areas INSERT）
- **Selected Approach**: Supabase の `rpc` で PostgreSQL 関数を呼び出し、トランザクション内で一括処理
- **Rationale**: 3テーブルへの書き込みを原子的に行う必要がある。個別のクエリではデータ不整合のリスクがある
- **Trade-offs**: PostgreSQL 関数の追加が必要だが、データ整合性を保証できる
- **Follow-up**: マイグレーションに `complete_registration` 関数を追加

## Risks & Mitigations
- **リスク1**: メール認証リンクの有効期限切れ → Supabase Auth 標準の期限管理に委任。期限切れ時はエラーメッセージ + 再送案内を表示
- **リスク2**: DB Trigger と RLS の相互作用 → `handle_new_user` は `SECURITY DEFINER` で実行されるため RLS をバイパス。テストで検証
- **リスク3**: Middleware での DB 問い合わせによるレイテンシ → PK 検索のため1ms以下（authentication.md で確認済み）

## References
- Supabase Auth with Next.js — 公式ドキュメント
- `@supabase/ssr` — Supabase の Next.js 向け SSR パッケージ
- authentication.md — ビジ友プロジェクトの認証方針
- security.md — セキュリティ方針（三重防御、メール送信失敗時の方針）
