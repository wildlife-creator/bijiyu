# Research & Design Decisions — 案件掲載機能（job-posting）

## Summary
- **Feature**: job-posting（案件掲載機能）
- **Discovery Scope**: Extension（既存システムの拡張 — CRUD + プラン制限ロジック）
- **Key Findings**:
  - jobs / job_images テーブルは既にマイグレーション済み。RLS ポリシーも基本定義済み
  - Server Actions の ActionResult パターン、Zod バリデーション、Storage アップロードの既存パターンが確立済み
  - 個人プランの月次掲載制限は Server Action 側で JST カレンダー月基準のカウントが必要

## Research Log

### 既存テーブルスキーマの確認
- **Context**: jobs / job_images テーブルの定義を確認し、設計との整合性を検証
- **Sources**: `supabase/migrations/20260324160600_002_core_tables.sql`
- **Findings**:
  - jobs テーブルは全必要カラムを持つ（title, description, prefecture, address, trade_type, headcount, reward_upper/lower, work/recruit dates, status, is_urgent, owner_id, organization_id, deleted_at）
  - job_images テーブルは job_id, image_url, image_type, sort_order を持つ。ON DELETE CASCADE 設定済み
  - set_updated_at トリガーが両テーブルに設定済み
- **Implications**: 新規マイグレーション不要。既存スキーマをそのまま利用可能

### RLS ポリシーの確認
- **Context**: jobs / job_images の RLS ポリシー設計
- **Sources**: `supabase/migrations/20260324161000_003_rls_policies.sql`
- **Findings**:
  - RLS ヘルパー関数: `is_admin()`, `is_paid_user()`, `is_same_org()` が定義済み
  - jobs: owner_id ベースの CRUD + 組織メンバーの読み取り + 公開案件の一般読み取り
  - job_images: job の owner_id に基づくアクセス制御
- **Implications**: 既存 RLS で基本要件を満たす。組織内全案件の表示は `is_same_org()` で対応可能

### プラン制限ロジック
- **Context**: 個人プラン（¥3,800）の月次1件制限の実装方針
- **Sources**: requirements.md REQ-JP-004、roles-and-permissions.md
- **Findings**:
  - 「当月」= JST カレンダー月（毎月1日 0:00 リセット）
  - カウント対象: status = 'open' かつ deleted_at IS NULL の案件数
  - Supabase は UTC 保存のため、JSTへの変換が必要
  - 参考SQL: `WHERE created_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo'`
  - プラン判定: subscriptions テーブルの plan_id と status で判定
- **Implications**: Server Action 内で Supabase RPC または raw SQL でカウント。フロントのみでの制御は不可

### Storage バケット設計
- **Context**: 案件画像・書類のアップロード先
- **Sources**: security.md、既存アップロードパターン（profile/edit/actions.ts）
- **Findings**:
  - バケット名: `job-attachments`（public）
  - ファイルパス: `${user.id}/${crypto.randomUUID()}.${ext}` の既存パターンに従う
  - 制限: JPEG/PNG のみ、最大10MB/枚
  - RLS: `(storage.foldername(name))[1] = auth.uid()::text` パターン
- **Implications**: バケット作成 + Storage RLS ポリシーのマイグレーションが必要

### 既存フォームパターン
- **Context**: フォーム実装の既存パターン確認
- **Sources**: profile/edit/page.tsx、validations/profile.ts
- **Findings**:
  - react-hook-form + zodResolver + useFieldArray（動的フィールド）
  - useTransition で submit pending 管理
  - Server Action は FormData で受け取り、Zod でバリデーション
  - ActionResult<T> 型で統一的なレスポンス
- **Implications**: 同一パターンを踏襲。案件フォームは項目が多いためセクション分割を検討

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Server Actions + RSC | Next.js App Router の標準パターン | 既存パターンと一致、型安全、シンプル | 大量ファイルアップロード時のタイムアウト | 既存実装と同一アプローチ |
| API Routes + Client fetch | Route Handlers で REST API | アップロード進捗表示が可能 | 既存パターンから逸脱、実装コスト増 | 不採用 |

## Design Decisions

### Decision: Server Actions + FormData パターンの踏襲
- **Context**: 案件の CRUD 操作の実装方式
- **Alternatives Considered**:
  1. Server Actions（既存パターン）
  2. API Route Handlers（REST API）
- **Selected Approach**: Server Actions + FormData
- **Rationale**: プロフィール編集で確立済みのパターンと一致。型安全で実装コストが低い
- **Trade-offs**: ファイルアップロードの進捗表示は不可だが、要件に含まれていない
- **Follow-up**: 画像の複数同時アップロード時のパフォーマンスを実装時に検証

### Decision: プラン制限チェックの実装箇所
- **Context**: 個人プランの月次掲載制限をどこでチェックするか
- **Alternatives Considered**:
  1. Server Action 内で SQL クエリ
  2. Supabase RPC（DB関数）
  3. RLS ポリシー内で制限
- **Selected Approach**: Server Action 内で Supabase クエリ
- **Rationale**: RLS は行単位のアクセス制御に適しており、ビジネスロジック（月次カウント）には不向き。Server Action なら明確なエラーメッセージを返せる
- **Trade-offs**: DB 関数に比べてラウンドトリップが1回増えるが、可読性とテスト容易性を優先
- **Follow-up**: なし

### Decision: 画像アップロードのタイミング
- **Context**: 案件画像をフォーム送信時に一括アップロードするか、選択時に即時アップロードするか
- **Alternatives Considered**:
  1. フォーム送信時に一括アップロード
  2. 画像選択時に即時アップロード（プレビュー付き）
- **Selected Approach**: フォーム送信時に一括アップロード
- **Rationale**: 既存の avatars アップロードパターンと一致。下書き保存前に不要ファイルが Storage に残るリスクを回避
- **Trade-offs**: 送信時の処理時間が長くなる可能性があるが、案件画像の枚数は限定的
- **Follow-up**: 大量画像アップロード時のタイムアウト対策を実装時に検討

## Risks & Mitigations
- JST 月次カウントの境界ケース（月末深夜） — UTC/JST 変換を SQL レベルで正確に実施
- 画像の複数同時アップロードによるタイムアウト — 1枚ずつ順次アップロードで安定性を優先
- 組織案件の権限管理の複雑さ — 既存 `is_same_org()` ヘルパーを活用

## References
- Supabase Storage RLS: パスベースのポリシー設計は既存 avatars バケットのパターンに準拠
- Next.js Server Actions: FormData パターンは既存 profile/edit/actions.ts に準拠
