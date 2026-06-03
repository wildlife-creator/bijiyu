# Research & Design Decisions — client-review-completion

## Summary
- **Feature**: `client-review-completion`
- **Discovery Scope**: Simple Addition / Extension（既存 client_reviews への「出口」整備。DB・RLS・ルーティング不変）
- **Key Findings**:
  - 集計は `src/lib/rating/aggregate.ts` が完全な手本。`summarize()` 純粋関数 + `fetch*()` の構造を good/合計向けに縮小して再利用できる
  - CON-013 フォーム（`contractor-report-form.tsx`）は既に lucide `ThumbsUp`/`ThumbsDown` を使用。案A（thumbs 統一）のフォーム側追加作業はほぼ無く、必須ラベル追加が主。アイコン差し替えの実体は CLI-020 の 👍 絵文字 → lucide サムアップ
  - **既存 E2E `e2e/matching.spec.ts` L187 が `getByLabel("Good")` に依存**。`aria-label="Good"/"Bad"` を維持すれば非回帰
  - **seed.sql に client_reviews が1件も無い**。CLI-020 評判表示 E2E のためデータ追加が必要
  - `client_reviews` の書き込みは `submitContractorReportAction`（actions.ts L177）の1か所のみ。他参照は存在チェック等の読み取り。スキーマ不変で非回帰リスクは小さい

## Research Log

### 集計パターンの踏襲
- **Context**: Req3「good件数・合計件数を1か所のテスト可能な関数に集約」をどう実装するか
- **Sources Consulted**: `src/lib/rating/aggregate.ts`、`src/__tests__/rating/aggregate.test.ts`
- **Findings**: rating 側は (1) `summarize(values)` 純粋関数（NULL 除外・平均・件数）、(2) `fetchOverallSummary(supabase, userId)`（`{data,error}` ガード、error 時は安全な既定値）、(3) bulk 版（N+1 回避）の3層。テストは純粋関数中心
- **Implications**: client_reviews 版は good/合計のみなので (1)(2) の2関数で十分。bulk 版は不要（CLI-020 は単一被評価者）。テストは純粋関数 `summarizeReputation` を中心に置く

### CON-013 フォームの現状アイコン
- **Context**: Req2「刷新前の受注者評価フォームのサムアップに統一」の実作業範囲
- **Sources Consulted**: `contractor-report-form.tsx` L5/L96-115、git `b1d211e:.../client-report-form.tsx`
- **Findings**: 現フォームは lucide `ThumbsUp`/`ThumbsDown`（size-6、選択中 fill=currentColor + text-primary、未選択 fill=none + 灰色、ボタンは `type="button"` 明示済、aria-label "Good"/"Bad"）。刷新前の受注者評価フォームと同一表現
- **Implications**: 案A ではフォーム側のマークは現状維持でよい。差し替え対象は CLI-020 の 👍 絵文字。aria-label は E2E 依存のため変更禁止

### 既存 E2E の Good 選択依存
- **Context**: 必須ラベル追加・アイコン周りの変更が既存 E2E を壊さないか
- **Sources Consulted**: `e2e/matching.spec.ts` L179-200
- **Findings**: 受注者完了報告フローは `/applications/history/<id>/report` に goto → 稼働状況選択 → `getByLabel("Good").click()` → 送信。必須ラベルは表示文言追加のみで selector に影響しない
- **Implications**: `aria-label` を維持。CLI-020 表示 E2E は別 describe として追加

### seed の client_reviews 欠落
- **Context**: Req7「CLI-020 評判表示の検証データ」を用意する
- **Sources Consulted**: `supabase/seed.sql`（client_reviews 行ゼロ）、`actions.ts` の INSERT 形状
- **Findings**: client_reviews は (application_id UNIQUE, reviewer_id=受注者, reviewee_id=発注者, operating_status, status_supplement, rating_again, comment)。FK は applications/users。E2E では「ログイン中の発注者本人が自分の評判を見る」ため、reviewee_id = seed の発注者テストユーザーに good/bad 混在の複数行が必要
- **Implications**: 既存の accepted/completed 応募（その発注者がオーナー、applicant が受注者）に紐付けて複数行投入。application_id UNIQUE のため1応募1行。good 複数 + bad 1件で「good/合計」分母を検証可能にする。具体 UUID は実装時に既存 seed 行から選定

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 集計 B: 新規モジュール | `lib/client-review/aggregate.ts` を新設し page から呼ぶ | Req3 充足、テスト容易、将来の評判ページと共有 | ファイル1増 | **採用**。rating の確立パターン踏襲 |
| 集計 A: page インライン | 現状の手書き count を維持 | 追加ファイル0 | Req3「集約・テスト可能」に反する | 却下 |
| 表示/フォーム A: 既存最小拡張 | 既存 form と CLI-020 評判セクションを改修 | 影響局所、低リスク | — | **採用** |

## Design Decisions

### Decision: 集計モジュールの配置と返り値形状
- **Context**: Req3。good/合計の集計を再利用可能かつ拡張余地ありにする
- **Alternatives Considered**:
  1. `lib/reputation/aggregate.ts` — ドメイン語「評判」寄り
  2. `lib/client-review/aggregate.ts` — テーブル名 `client_reviews` と対応、`lib/rating` と対称
- **Selected Approach**: `src/lib/client-review/aggregate.ts`。純粋関数 `summarizeReputation(rows)` と取得関数 `fetchClientReputation(supabase, clientUserId)`。返り値は `ClientReputationSummary { goodCount: number; total: number }`
- **Rationale**: `lib/rating`（user_reviews）と `lib/client-review`（client_reviews）が対称になり発見性が高い。オブジェクト返却で将来 `badCount` / `comments` 等を非破壊追加できる（Req3-5）
- **Trade-offs**: bad 件数は `total - goodCount` で導出可能だが今回は表示しないため返さない（YAGNI）。将来必要時に追加
- **Follow-up**: 命名はレビューで最終確認。補足・コメント取得関数は本 spec では作らない

### Decision: スキーマ・RLS を変更しない
- **Context**: Req5。公開範囲を後決めにする
- **Selected Approach**: マイグレーション・RLS ポリシー・型再生成いずれも行わない。status_supplement / comment は保存され続けるが表示しない
- **Rationale**: 段階0（本人が good/合計を見る）は現行 SELECT RLS（本人・同組織・投稿者）で充足。段階1・2は別 spec
- **Trade-offs**: 将来 RLS 緩和時に別マイグレーションが必要だが、それが意思決定ポイントとして適切に分離される
- **Follow-up**: screen-map.md に「評価コメント表示・第三者公開は後決め」を注記（Req8）

### Decision: アイコンを lucide サムアップに統一（案A）
- **Context**: Req2/Req4。入力フォームと評判表示の見た目を揃える
- **Selected Approach**: CON-013 は現状の lucide `ThumbsUp`/`ThumbsDown` を維持。CLI-020 評判の `👍` 絵文字を lucide `ThumbsUp`（text-primary、size 調整）に置換
- **Rationale**: 既存フォーム実装と一致し追加依存ゼロ。CLAUDE.md「lucide は className で薄紫統一」に沿う
- **Trade-offs**: 絵文字の方が彩度は高いが、フォームとの一貫性を優先
- **Follow-up**: CLI-020 のサムアップ size/color を目視調整（Research 残）

## Risks & Mitigations
- **既存 E2E 破壊（aria-label 依存）** — `aria-label="Good"/"Bad"` を変更しない。必須ラベルは見出しテキストにのみ追加
- **seed FK 不整合** — 既存の accepted/completed 応募行に紐付け、reviewer_id=applicant・reviewee_id=job owner を厳守。application_id UNIQUE に注意（1応募1行）
- **非回帰（存在チェック5画面 + 二者完了判定）** — スキーマ・列・rating_again 値を変えないため構造的に維持。3層テストで担保
- **インライン集計の置換漏れ** — CLI-020 の L131-139 を完全に `fetchClientReputation` へ置換し、手書き count を残さない（Req4-2）

## References
- `src/lib/rating/aggregate.ts` — 集計パターンの手本（user_reviews 版）
- `src/__tests__/rating/aggregate.test.ts` — 純粋関数テストの手本
- `e2e/matching.spec.ts` L179-200 — 受注者完了報告フロー E2E（aria-label 依存）
- `src/app/(authenticated)/applications/actions.ts` L126-225 — submitContractorReportAction（client_reviews 唯一の書き込み）
- `.kiro/specs/client-review-completion/gap-analysis.md` — 統合ポイントの全体マップ
