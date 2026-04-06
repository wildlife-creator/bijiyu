# Research & Design Decisions — matching

## Summary
- **Feature**: matching（マッチング機能）
- **Discovery Scope**: Extension（既存の applications テーブルと応募フローを拡張）
- **Key Findings**:
  - applications, user_reviews, client_reviews テーブルは既にマイグレーション済み（002_core_tables.sql）。RLS ポリシーも 003_rls_policies.sql で定義済み
  - 既存の Server Action パターン（ActionResult<T>、Zod バリデーション、Supabase クライアントモック）を踏襲する
  - メール通知（発注/お断り）は Resend 経由で送信。失敗時はログ記録のみでロールバックしない

## Research Log

### 既存テーブル・RLS の確認
- **Context**: matching 機能で使用する applications, user_reviews, client_reviews テーブルが既に存在するか確認
- **Sources Consulted**: supabase/migrations/20260324160600_002_core_tables.sql, 20260324161543_003_rls_policies.sql
- **Findings**:
  - applications テーブル（L164）、user_reviews テーブル（L189）、client_reviews テーブル（L210）はすべて作成済み
  - RLS ポリシーも定義済み（applications: applicant_id or job.owner_id ベース、reviews: SELECT 全公開、INSERT reviewer_id = auth.uid()）
  - applications の UPDATE は案件作成者のみ（ステータス変更 = 発注可否）
- **Implications**: 新規マイグレーションは不要。ただし applications の UPDATE ポリシーは発注者のステータス変更のみを想定しており、受注者によるキャンセル（applied → cancelled）は別途考慮が必要

### 受注者によるキャンセルの RLS 対応
- **Context**: 現在の applications UPDATE ポリシーは `job.owner_id = auth.uid()` のみ。受注者が自分の応募をキャンセルするには追加ポリシーが必要
- **Findings**:
  - 既存 RLS: UPDATE は案件の作成者のみ（発注者用）
  - 受注者キャンセル: `applicant_id = auth.uid() AND status = 'applied'` の条件で UPDATE を許可する追加ポリシーが必要
  - ビジネスルール（5日前制限）は Server Action で検証（RLS では日付計算が複雑になるため）
- **Implications**: applications テーブルに受注者用の UPDATE ポリシーを追加するマイグレーションが必要

### 完了報告・評価の RLS 対応
- **Context**: 受注者・発注者が applications.status を completed/lost に更新する際の権限
- **Findings**:
  - 完了報告は受注者側（CON-013）と発注者側（CLI-012）の両方から行える
  - applications の UPDATE は現在発注者のみ。受注者からの完了報告にも対応が必要
  - 評価（user_reviews, client_reviews）の INSERT は reviewer_id = auth.uid() かつ completed ステータスが条件
  - ただし、実際の業務フローでは完了報告と評価は同時に行われる。つまり status を completed/lost に変更しつつ同時に reviews を INSERT する
  - トランザクション的な一貫性を確保するため、Server Action 内で service_role キーを使用して一括処理する方が安全
- **Implications**: 完了報告 + 評価登録は Server Action から admin client（service_role）で実行し、RLS バイパスで一括処理する

### 既存の Server Action パターン
- **Context**: 既存のコードベースで確立された Server Action の実装パターンを確認
- **Sources Consulted**: src/app/(authenticated)/jobs/actions.ts, src/lib/types/action-result.ts
- **Findings**:
  - 戻り値: `ActionResult<T>` 型（`{ success: true; data?: T } | { success: false; error: string }`）
  - バリデーション: Zod スキーマ
  - 認証: `supabase.auth.getUser()` で最初にチェック
  - インポート: `createClient` from `@/lib/supabase/server`
  - FormData パースのヘルパー関数を actions.ts 内に定義
- **Implications**: 同一パターンを踏襲する

### メール通知テンプレート
- **Context**: 発注/お断り時のメール通知
- **Sources Consulted**: .kiro/steering/tech.md, .kiro/steering/security.md
- **Findings**:
  - メール送信: Resend + React Email テンプレート
  - テンプレート配置: src/lib/email/templates/
  - 送信失敗時: ログ記録のみ、本体処理はロールバックしない
  - 通知種別: マッチング成立通知（発注時）、お断り通知（拒否時）
- **Implications**: 2つの React Email テンプレートを作成。sendEmail ヘルパーを使用

### ルーティング構造
- **Context**: applications ディレクトリの URL 設計
- **Sources Consulted**: .kiro/steering/structure.md
- **Findings**:
  - structure.md で `applications/` は `CON-011〜013, CLI-007〜012` を含むと定義
  - 受注者系（応募履歴）と発注者系（応募管理・発注履歴）を同一ディレクトリ内でサブパスで分離
  - CLI-028（発注者評価）は users/ 配下が自然（CLI-006 からの遷移のため）
- **Implications**: `/applications/history/` (受注者), `/applications/received/` (発注者応募管理), `/applications/orders/` (発注者発注履歴) の3サブパス + `/clients/[id]/reviews` (CLI-028)

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Server Action + service_role | 完了報告+評価を service_role で一括実行 | トランザクション一貫性、RLS の複雑化を回避 | service_role の過剰使用リスク | 評価+ステータス更新の原子性が重要 |
| Server Action + RLS 拡張 | RLS ポリシーを追加して通常クライアントで実行 | セキュリティモデルが一貫 | RLS ポリシーが複雑化、完了報告+評価の原子性が保証しにくい | applications の UPDATE に受注者用ポリシーは追加必要 |

## Design Decisions

### Decision: 完了報告 + 評価の処理方式
- **Context**: 完了報告（applications.status 更新）と評価登録（reviews INSERT）を同時に行う必要がある
- **Alternatives Considered**:
  1. 通常クライアント + RLS 拡張 — applications の UPDATE ポリシーを拡張し、reviews の INSERT は既存 RLS で対応
  2. service_role（admin client）で一括処理 — Server Action 内で権限チェック後、admin client で原子的に実行
- **Selected Approach**: ハイブリッド方式
  - 単純なキャンセル（CON-012）: RLS ポリシー追加 + 通常クライアント
  - 発注/お断り（CLI-009）: 通常クライアント（既存 RLS で対応可能）
  - 完了報告 + 評価（CON-013, CLI-012）: Server Action 内で権限チェック後、admin client で原子的に実行
- **Rationale**: 単純な操作は RLS に任せ、複合操作のみ admin client を使用することでセキュリティと一貫性を両立
- **Trade-offs**: admin client 使用箇所では Server Action 内の権限チェックが唯一の防御線になる
- **Follow-up**: admin client の使用箇所をコードレビューで重点確認

### Decision: 受注者キャンセルの RLS ポリシー追加
- **Context**: 既存の applications UPDATE ポリシーは発注者のみ。受注者キャンセルに対応が必要
- **Selected Approach**: 新規 RLS ポリシーを追加
  - 条件: `applicant_id = auth.uid() AND status = 'applied'`
  - 更新対象カラム: status のみ（'cancelled' への変更のみ許可）
  - 5日前制限は Server Action で検証（RLS では日付計算が複雑）
- **Rationale**: キャンセルは単純な操作で、RLS で制御するのが自然
- **Follow-up**: マイグレーションファイルを作成

## Risks & Mitigations
- 完了報告と評価の原子性 — admin client + try-catch でエラー時はどちらも保存しない
- 受注者キャンセルの5日前制限バイパス — Server Action で必ず検証（RLS では日付制限を設けない）
- メール送信失敗 — 本体処理をロールバックしない。ログ記録のみ
- 評価の二重登録防止 — UNIQUE (application_id) 制約が DB レベルで保証

## References
- database-schema.md — applications, user_reviews, client_reviews テーブル定義
- security.md — メール送信失敗時の共通方針、Server Action の権限チェック
- tech.md — Resend メール送信パターン、Server Action パターン
- structure.md — applications ディレクトリ構成
