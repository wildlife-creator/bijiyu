# Research & Design Decisions — job-search

## Summary
- **Feature**: job-search（案件検索・応募・発注者検索・マイリスト・職人検索）
- **Discovery Scope**: Extension（既存の案件管理・プロフィール機能を拡張）
- **Key Findings**:
  - 既存の jobs/manage ページで searchParams + RSC パターンが確立済み。検索・フィルター・ページネーションはこのパターンを踏襲する
  - favorites テーブルはポリモーフィック関連（target_type + target_id）で設計済み。お気に入りのトグル操作は Client Component + Server Action で実装する
  - 応募制限（無料ユーザー: 職種×エリア一致チェック）は RLS ではなく Server Action で制御する方針が steering で確定済み

## Research Log

### 既存コードパターンの分析
- **Context**: job-search で再利用可能な既存パターンの特定
- **Sources Consulted**: src/app/(authenticated)/jobs/, src/lib/validations/, src/lib/types/
- **Findings**:
  - Server Action は `ActionResult<T>` 型で統一（`src/lib/types/action-result.ts`）
  - Zod バリデーションは `src/lib/validations/` に集約
  - 定数（TRADE_TYPES, PREFECTURES）は `src/lib/constants/options.ts` に定義済み
  - 一覧ページは Server Component で searchParams を受け取り、Client Component でフィルター操作を行うパターン
  - Supabase クエリは `.select()` でリレーションを JOIN し、`.range()` でページネーション
- **Implications**: 新規ライブラリ不要。既存パターンの踏襲で一貫性を維持できる

### ページネーション・フィルターの実装方針
- **Context**: 8画面で検索・フィルター・ページネーションが必要
- **Sources Consulted**: 既存の jobs/manage 実装、Next.js App Router ドキュメント
- **Findings**:
  - searchParams で全フィルター状態を URL に保持する方式が既存で採用済み
  - Server Component で `searchParams` を `Promise<{...}>` 型で受け取るパターン
  - ページネーションは offset/limit 方式（20件ずつ）
  - 検索ポップアップ（モーダル）は shadcn/ui の Sheet コンポーネントで実装可能
- **Implications**: URL ベースのフィルター管理により、ブックマーク・共有・ブラウザバックが自然に動作する

### お気に入り（favorites）の実装方針
- **Context**: 複数画面でお気に入りトグルが必要（案件一覧、案件詳細、発注者一覧等）
- **Sources Consulted**: database-schema.md の favorites テーブル定義
- **Findings**:
  - favorites テーブルはポリモーフィック関連: `target_type` ('job' | 'client' | 'user') + `target_id`
  - トグル操作は楽観的 UI 更新が望ましい（♡ボタンの即時フィードバック）
  - Server Action で INSERT/DELETE を切り替え、revalidatePath で再検証
- **Implications**: 共有の FavoriteButton コンポーネントを作成し、target_type を props で受け取る設計が効率的

### 応募制限のビジネスロジック
- **Context**: 無料ユーザーの応募制限ロジックの実装方針
- **Sources Consulted**: security.md, roles-and-permissions.md, database-schema.md
- **Findings**:
  - フロントエンド: 案件の trade_type と prefecture をユーザーの user_skills/user_available_areas と照合し、不一致なら応募ボタン非活性
  - サーバーサイド: Server Action で同じ検証を再実行（バイパス対策）
  - RLS は使わない（INSERT 制御に複雑な JOIN が必要になるため）
  - 有料ユーザー判定: subscriptions.status IN ('active', 'past_due') で判定
- **Implications**: フロントとサーバーの両方で同一ロジックを実装する必要がある。Zod スキーマとは別に、ビジネスルールチェック関数を用意する

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| RSC + searchParams | Server Component でデータ取得、URL パラメータでフィルター管理 | 既存パターンと一致、SSR で高速初期表示 | フィルター数が多い画面で URL が長くなる | 採用。既存の jobs/manage と同一パターン |
| Client-side fetch + state | クライアントで全データ取得・フィルタリング | インタラクション高速 | 初期ロード重い、SEO不利 | 不採用 |

## Design Decisions

### Decision: 検索フィルターの UI パターン
- **Context**: CON-002, CON-005, CLI-005 で検索ポップアップが必要
- **Alternatives Considered**:
  1. Sheet（ボトムシート/サイドシート）でフィルターを表示
  2. インラインでフィルターを展開
- **Selected Approach**: Sheet コンポーネント（モバイル: ボトムシート、PC: サイドシート）
- **Rationale**: デザインカンプのポップアップ UI と合致。shadcn/ui Sheet で実装可能
- **Trade-offs**: モーダル内のフォーム操作が増えるが、一覧表示領域を最大化できる
- **Follow-up**: Sheet 内のフォーム送信時に searchParams を更新し、Sheet を閉じる

### Decision: お気に入りトグルの共有コンポーネント化
- **Context**: 6画面以上でお気に入りボタンが登場
- **Alternatives Considered**:
  1. 各画面で個別実装
  2. 共有コンポーネントで一元化
- **Selected Approach**: `FavoriteButton` 共有コンポーネント（Client Component）
- **Rationale**: DRY 原則。target_type と target_id を props で受け取り、Server Action でトグル
- **Trade-offs**: 共有コンポーネントの抽象度が上がるが、保守性が向上
- **Follow-up**: 楽観的 UI 更新の実装

### Decision: 応募確認のポップアップ実装
- **Context**: CON-004 で応募確認→完了をポップアップで処理（独立画面なし）
- **Selected Approach**: shadcn/ui Dialog で確認→完了の2段階ポップアップ
- **Rationale**: screen-navigation.md のポップアップ一覧と整合。独立した確認/完了画面は存在しない
- **Trade-offs**: Dialog 内で Server Action を実行するため、ローディング状態の管理が必要

## Risks & Mitigations
- **リスク: 検索パフォーマンス** — キーワード検索で PostgreSQL 全文検索が必要 → 初期は ILIKE で実装し、パフォーマンス問題が出たら tsvector インデックスを追加
- **リスク: 応募制限のフロント/サーバー不整合** — 同一ロジックを2箇所で実装 → 共通のユーティリティ関数で判定ロジックを共有
- **リスク: お気に入りの楽観的 UI と実際の状態の乖離** — ネットワークエラー時に UI がずれる → エラー時にトーストで通知し、状態をロールバック

## References
- steering/database-schema.md — jobs, applications, favorites, client_profiles テーブル定義
- steering/security.md — 応募制限のビジネスロジックバリデーション方針
- steering/roles-and-permissions.md — 無料/有料ユーザーの機能制限
- 既存実装: src/app/(authenticated)/jobs/manage/ — 一覧ページの searchParams パターン
