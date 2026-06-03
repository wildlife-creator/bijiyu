# Gap Analysis — client-review-completion

対象: `.kiro/specs/client-review-completion/requirements.md`（2026-06-02 改訂版）
作成: 2026-06-02

## サマリー
- 規模は **S（1〜3日）/ リスク Low**。DB マイグレーション・新ページ・RLS 変更がいずれも不要
- 集計は既存 `src/lib/rating/aggregate.ts` が完全な手本。同型の薄いモジュールを新設するのが素直（Option B）
- **CON-013 フォームは既に lucide `ThumbsUp`/`ThumbsDown` を使用済み**。アイコン案Aの実質作業は「CLI-020 の 👍 絵文字を lucide サムアップに合わせる」＋「フォームに必須表示を足す」だけ
- **`client_reviews` の書き込みは1か所のみ**（`submitContractorReportAction`）。他は全て存在チェック等の読み取りで、スキーマ不変なので非回帰リスクは小さい
- 最大の注意点は **seed.sql に client_reviews が1件も無い**こと。CLI-020 評判表示の E2E 検証用にデータ追加が必要（FK 整合に注意）

## Requirement → 既存資産マップ

| Req | 必要なこと | 既存資産 | ギャップ | 種別 |
|---|---|---|---|---|
| 1 必須表示是正 | 「また仕事を受けたいか」に必須ラベル | `contractor-report-form.tsx`（稼働状況に必須ラベル実装済の体裁あり L59-61） | 同体裁の `<span>` を1つ追加するだけ | 軽微追加 |
| 1-3 サーバ検証 | 未入力を Zod で拒否 | `contractorReportSchema`（`ratingAgain: ratingEnum` 必須・L48） | 既に必須。変更不要 | 充足済 |
| 2 サムアップ統一 | 刷新前の thumbs マークに統一 | フォームは既に lucide `ThumbsUp`/`ThumbsDown` 使用（L5, L103, L113） | フォーム側は実質充足。CLI-020 の絵文字を lucide に変更する側が主作業 | 充足済＋軽微 |
| 3 集計関数 | good件数・合計件数の集計、純粋関数 | `lib/rating/aggregate.ts`（`summarize` + `fetch*`、テスト `__tests__/rating/aggregate.test.ts`） | client_reviews 用モジュールが無い → 新設 | Missing（手本あり） |
| 4 CLI-020 表示 | 「また受けたい [thumbs]（good／合計）」 | `mypage/client-profile/page.tsx` 評判セクション（L130-139 集計, L240-257 表示） | インライン集計を関数呼び出しに置換＋表示文言/アイコン変更 | 改修 |
| 5 保留・据え置き | RLS 緩めない / 補足・コメント非表示 / clients/[id] 不変 | 現状 SELECT RLS は本人・同組織・投稿者のみ | 「何もしない」ことの保証。コードを足さない | Constraint |
| 6 非回帰 | 存在チェック5画面＋二者完了判定を壊さない | `mypage`, `applications/history`(+[id]), `applications/orders`(+[id]), `jobs/[id]/applicants`、`actions.ts` L587（発注者側の二者完了判定の読み取り） | スキーマ不変なので自動的に維持。確認のみ | 充足済 |
| 7 テスト | Vitest集計 / Playwright提出・表示 / seed | `__tests__/rating/aggregate.test.ts`, `e2e/matching.spec.ts`, `__tests__/matching/actions.test.ts` | 集計テスト新設、CLI-020 表示 E2E 新設、**seed に client_reviews 追加** | Missing |
| 8 steering 整合 | screen-map に CLI-020 評判追記 | `.kiro/steering/screen-map.md` | 文言追記のみ | 軽微 |

## 既存コードの確定事実（調査済み）
- **書き込み経路**: `client_reviews` の INSERT は `submitContractorReportAction`（`actions.ts` L177-186）の1か所のみ。`rating_again` / `status_supplement` / `comment` / `operating_status` を保存
- **二者完了判定**: 発注者側 `submitClientReportAction`（L586-590）が `client_reviews` を `operating_status` で存在 SELECT し、両者評価が揃ったら `applications.status` を遷移。今回 rating_again の意味も列も変えないため影響なし
- **CLI-020 現状表示**: `mypage/client-profile/page.tsx` L131-139 で `rating_again='good'` を JS で count、L249-254 で `👍 {good}`（絵文字、good のみ）。`totalReviews` も既に算出済（L139）→ good／合計の分母はすぐ作れる
- **集計手本**: `lib/rating/aggregate.ts` は「pure `summarize()` + `fetch*()`（`{data,error}` ガード付き）」。本件は good/合計だけなので更に単純
- **seed**: `supabase/seed.sql` に `client_reviews` 行は**ゼロ**。E2E で「評価ありの発注者」を出すには追加が必要

## 実装アプローチ

### 集計層（Req3）— 推奨: Option B（新規モジュール）
- `src/lib/client-review/aggregate.ts`（命名は design で確定。`reputation` 案も可）を新設
- 純粋関数: `summarizeReputation(rows: {rating_again}[]) => { goodCount, total }`（0件で `{0,0}`）
- 取得関数: `fetchClientReputation(supabase, clientUserId) => { goodCount, total }`（`{data,error}` ガード、`lib/rating` と同じ書き方）
- テスト: `src/__tests__/client-review/aggregate.test.ts`（rating の test をミニ化）
- **却下**: Option A（page にインライン集計のまま）→ Req3「1か所のテスト可能な関数に集約」に反する
- 引数は被評価者IDのみ（Req3-5 拡張余地）。補足・コメント取得は**作らない**（保留・YAGNI）

### CON-013 フォーム（Req1,2）— 推奨: Option A（既存を最小拡張）
- 「また仕事を受けたいか」見出しに稼働状況と同じ必須 `<span>` を追加
- thumbs は既存のまま（案A＝lucide 維持で追加作業ほぼ無し）。選択中 fill/primary も実装済
- ボタンは既に `type="button"` 明示済（L96, L106）→ ルール準拠済

### CLI-020 表示（Req4）— 推奨: Option A（既存評判セクションを改修）
- L131-139 のインライン集計を `fetchClientReputation` 呼び出しに置換
- L249-254 を「また受けたい ＋ lucide `ThumbsUp` ＋（good／合計件）」へ。`👍` 絵文字 import を lucide に変更
- 0件時の「評判はまだありません」分岐は維持
- 法人プランの被評価者ID解決（`profileUserId`）は現状ロジックをそのまま使用（Req4-4）

## Effort / Risk
- **Effort: S（1〜3日）** — 新規ファイル1、改修2、テスト2、seed/ドキュメント。確立済みパターンの踏襲
- **Risk: Low** — スキーマ・RLS・ルーティング不変。既存挙動への副作用が構造的に小さい

## Research Needed（design へ持ち越し）
1. **seed の client_reviews 接続先**: どの既存 application 行に紐付けるか（reviewer=受注者・reviewee=発注者・status=accepted 前提）。good/bad 混在 + 合計が分母になる組合せを、FK 整合を保って用意する具体行を design で確定
2. **既存 E2E の CON-013 提出フロー**: `e2e/matching.spec.ts` に受注者完了報告フローが既にあるか、Good 選択を aria-label で操作しているかを確認し、必須ラベル追加で壊れないか・CLI-020 表示 E2E をどこに足すかを design で決定
3. **集計モジュールの命名/配置**: `lib/client-review/` か `lib/reputation/` か（design で確定）
4. **CLI-020 のサムアップ表示寸法/色**: 入力フォーム（size-6, primary）と評判表示で違和感ないサイズ・色味の最終調整

## 設計フェーズへの推奨
- 採用方針: 集計＝Option B、フォーム/表示＝Option A（既存最小拡張）
- 主要決定: 集計モジュール名・配置、seed 接続行、E2E 追加位置
- スキーマ・RLS・マイグレーションは**変更しない**前提を design でも明示
