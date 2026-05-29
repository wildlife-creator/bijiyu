# Research & Gap Analysis — rating-redesign

## Summary

- **Feature**: `rating-redesign`
- **Discovery Scope**: **Extension + Refactor**（既存テーブル/フォーム/集計画面の作り直し。新規ファイルは星評価コンポーネントと閾値定数のみ）
- **Key Findings**:
  - 既存 `user_reviews` テーブルは text 型6カラム（'good'/'bad'）。完全置換が必要だがデータはテストのみ
  - 星評価入力/表示コンポーネントは **未実装**（lucide-react の `ThumbsUp/Down` は使用中だが Star は未使用）
  - DB に **集計キャッシュカラム・AVG() 利用箇所は前例なし**。集計戦略は design 段階で確定する重要決定
  - CLI-006 に **既に user_reviews fetch があるが broken**（`rating_again === "yes" || "true"` で常に 0 — 実値は `'good'/'bad'`）。新仕様で書き直して機能化される
  - user_reviews 関連 fetch は **6+ 画面に分散**（mypage, applications/history, applications/orders, jobs/[id]/applicants 等）。ただし全て `user_reviews(id)` の NULL チェックだけで、カラム選択は CLI-006 と CLI-028 だけ — スキーマ変更の波及範囲は限定的
  - 既存テスト（Vitest 2ファイル + pgTAP 1ファイル + seed.sql）が旧カラムを参照しており、書き換え必須

## Requirement-to-Asset Map

| Req | 要求 | 既存資産 | 状態 |
|---|---|---|---|
| 1 (CLI-012 フォーム7項目★×5) | 入力フォーム | `applications/orders/[id]/report/client-report-form.tsx`（Good/Bad の `ThumbsUp/Down`） | **Missing**: 星評価入力 UI / **Constraint**: 既存フォーム構造は流用可、UI部品だけ差し替え |
| 1.5 (稼働状況6択維持) | 稼働状況プルダウン | `lib/validations/matching.ts` の `CONTRACTOR_OPERATING_STATUS_OPTIONS` | ✅ そのまま流用 |
| 2 (DB スキーマ) | user_reviews テーブル | `migrations/20260324160600_002_core_tables.sql` L189-204（text 型6カラム） | **Constraint**: DROP/ADD のマイグレーションで置換。TRUNCATE 必要 |
| 2.6/2.7 (status 連動) | applications.status 更新 | `applications/actions.ts` L572-591（条件付き UPDATE。client_reviews が既存の場合のみ） | ✅ 現行ロジックを維持。Server Action 内の rating 部分のみ差し替え |
| 3 (CLI-006 総合評価サマリー) | CLI-006 ページ | `users/contractors/[id]/page.tsx` L123-137（user_reviews fetch あり、ただし againCount は broken dead code） | **Missing**: ★平均/件数の集計と表示 / dead code を撤去し正しい集計に |
| 4 (CLI-028 7項目集計) | CLI-028 ページ | `users/[id]/reviews/page.tsx`（6項目 Good 集計 + 補足一覧 + ページネーション） | **Constraint**: `RATING_ITEMS` 配列の置換 + `countGood` を `avgRating` に変更。補足ページネーションは流用 |
| 5 (CLI-005 高評価バッジ) | CLI-005 ページ | `users/contractors/page.tsx` L259-268（ハードコード Badge + テキスト） | **Missing**: 受注者別の集計フェッチ。バッジ判定純粋関数 |
| 5.3 (閾値定数) | 定数ファイル | `src/lib/constants/`（options.ts, plans.ts 等は既存。`rating.ts` は **不在**） | **Missing**: `rating.ts` 新規作成 |
| 5.6 (バッジ判定純粋関数) | 純粋関数 + Vitest | 同種パターンの先例: `lib/utils/calculate-age.ts`, `lib/billing/options.ts` 等 | ✅ プロジェクト規約に従い `lib/rating/` 配下に配置可能 |
| 6 (集計性能) | 集計クエリ | DB に **AVG() 利用箇所なし**、denormalized counter カラムも前例なし | **Research Needed**: 集計戦略（A: リアルタイム vs B: キャッシュカラム vs C: ハイブリッド） |
| 7 (RLS / UNIQUE) | RLS ポリシー | `migrations/20260324161543_003_rls_policies.sql` L274-283（select + insert のみ。update/delete はデフォルト拒否） | ✅ 現行と同等ポリシーで新スキーマに合わせて再作成。pgTAP も合わせて書き換え |
| 8 (旧データ撤去) | マイグレーション | 旧スキーマ + 関連テスト/seed | **Constraint**: TRUNCATE が必要。pgTAP テスト `matching_rls.test.sql:166`、seed.sql L783/L799、Vitest `actions.test.ts` / `validations.test.ts` をすべて書き換え |
| 8.6 (型再生成) | Supabase 型 | `supabase gen types typescript --local > src/types/database.ts` | ✅ 既存コマンド |
| 9 (matching spec / steering 整合) | 仕様書更新 | `.kiro/specs/matching/requirements.md` REQ-MT-009/010, `.kiro/steering/screen-map.md` CLI-005/006/012/028 行 | **Constraint**: 4画面+1スペックの記述更新 |

## Implementation Approach Options

### Option A: リアルタイム SQL 集計（推奨）

- **方針**: CLI-005 一覧では bulk 集計クエリ（`SELECT reviewee_id, AVG(rating_overall), COUNT(*) FROM user_reviews WHERE reviewee_id IN (page_ids) GROUP BY reviewee_id`）を 1回発行。CLI-006/CLI-028 は単一ユーザーの SELECT で取得
- **対応 Req**: 6（性能・一貫性）、5（バッジ表示）
- **変更ファイル**: 既存3画面（CLI-005/006/028）のクエリに集計を追加するのみ。スキーマには集計キャッシュカラムを追加しない
- **トレードオフ**:
  - ✅ users テーブルに余計なカラムを足さない（denormalization なし）
  - ✅ 評価追加時のキャッシュ更新トリガー不要（バグ発生源を1つ減らす）
  - ✅ 集計値は常に最新（cache invalidation 問題なし）
  - ❌ ページ表示ごとに集計クエリ実行（contractor 数が 10,000人規模になるまで実害は出にくい）
  - ❌ `users.rating_overall_avg >= 4.0` のような WHERE 句で「高評価のみ表示」フィルタを CLI-005 に追加したくなった場合に書きにくい（**現スコープ外**）

### Option B: 集計キャッシュカラムを users テーブルに追加

- **方針**: `users.rating_overall_avg numeric(3,2)`, `users.rating_overall_count int` を追加。DB トリガー（user_reviews への INSERT で更新）で同期
- **対応 Req**: 6（性能）、将来の「高評価のみフィルタ」想定
- **変更ファイル**: users マイグレーション、user_reviews トリガー、CLI-005/006/028 全画面のクエリ（cached columns を読むだけ）
- **トレードオフ**:
  - ✅ 一覧表示が高速（join 不要、users 単独 SELECT）
  - ✅ 将来「高評価のみ表示フィルタ」を追加しやすい
  - ❌ 集計カラムとマスターデータ（user_reviews）の整合性を保つ責任が増える（プロジェクトに前例なし → バグ発生リスク）
  - ❌ users テーブルに評価以外の関心事（特に集計）を持ち込む = 単一責任原則違反気味
  - ❌ ダウングレード時のキャッシュ初期化、評価削除（→ 現スキーマでは UPDATE/DELETE 不可なので発生しない）への対応

### Option C: ハイブリッド（CLI-005 のみキャッシュ、CLI-006/028 はリアルタイム）

- **方針**: 一覧画面（CLI-005）はキャッシュ、詳細画面（CLI-006/028）はリアルタイム
- **トレードオフ**:
  - ✅ 高負荷ページのみ最適化
  - ❌ 2つのパターンを保守 → CLI-005 と CLI-006 で値が乖離するバグの温床（Req 6.4 の一貫性に反するリスク）
  - ❌ 早期最適化（YAGNI）

## Effort & Risk

| 領域 | 効力 | リスク | 一行根拠 |
|---|---|---|---|
| DB マイグレーション + RLS 再定義 | **S-M** | Medium | DROP/ADD + TRUNCATE。テストデータのみのため変換不要だが pgTAP/seed の同期書き換えが必要 |
| 星評価コンポーネント新規作成（input + display） | S | Low | 単純な useState ベース。lucide `Star` icon + Tailwind |
| バッジ閾値定数 + 判定純粋関数 | S | Low | `src/lib/rating/` 配下に純粋関数。Vitest で境界値検証 |
| 評価フォーム書き換え（CLI-012） | S | Low | 既存の clienteport-form 構造を流用し UI 部品だけ差し替え |
| CLI-005 / CLI-006 / CLI-028 表示変更 | M | Low-Medium | 3画面の集計クエリ追加と表示書き換え。CLI-005 は bulk 集計、CLI-006/028 は単一 |
| 既存テスト書き換え（Vitest 2 + pgTAP 1 + seed.sql） | M | Medium | 4ファイルにまたがる旧スキーマ参照を全て書き換え。サイレント失敗（テスト名は通るが内容が古い）に注意 |
| E2E 追加（CLI-005 バッジ表示 / CLI-006 サマリー / CLI-012 7項目入力 + 任意項目スキップ） | M | Low | seed.sql に「3件以上+★4以上」のテスト受注者を新規追加する必要あり |
| spec/steering 更新（matching/requirements.md + screen-map.md） | S | Low | ドキュメント更新のみ |

**総計**: **M（5-7 日）** — 既存パターン拡張中心、新規アーキテクチャ要素なし
**総合リスク**: **Low-Medium** — 主リスクは「テスト書き換え漏れによるサイレント失敗」と「集計戦略の確定」

## Research Items for Design Phase

1. **集計戦略の確定**: Option A（リアルタイム集計）採用を推奨するが、design 段階で最終確定。Option B を選ぶ場合は users テーブルのスキーマ拡張・トリガー実装の追加コスト
2. **星評価入力 UI の挙動詳細**:
   - クリックで0→★N、再クリックで「未評価」に戻す or 別途「クリア」ボタン
   - ホバープレビュー（★3にマウスホバーで3つ光る）の有無
   - 半星対応の要否（仕様としては整数1〜5なので不要見込み）
   - キーボード操作（矢印キーで星を移動、Enter/Space で確定）のアクセシビリティ
3. **CLI-005 集計クエリの index 確認** ✅ **解決済**: `supabase/migrations/20260324160600_002_core_tables.sql` L189-204 を確認したところ `user_reviews(reviewee_id)` に index 未作成（PostgreSQL は FK に index を自動付与しない）。新マイグレーションで `CREATE INDEX user_reviews_reviewee_id_idx ON user_reviews(reviewee_id)` を追加する
4. **「総合評価のみ表示・他6項目は CLI-028 で詳しく見る」設計の UI 整合**: CLI-006 デザインカンプ（`design-assets/screens/CLI-006*.png`）に新サマリーをどう配置するか
5. **CLI-005 デザインカンプ確認**: `CLI-005.png` に「【高評価】★平均 X.X（N件）」のような表示が描かれているか — 描かれていない場合は現状実装の見た目（黒バッジ + グレー補足）を踏襲
6. **0件評価の受注者の扱い詳細**: CLI-005 ではバッジ非表示で確定（Req 5.2）。CLI-006 では「まだ評価がありません」（Req 3.5）。CLI-028 のリンクをクリックされた場合どう扱うか（404 ではなく空状態を表示する想定）
7. **CLI-028 各任意項目の0件表示**: 「未評価」テキスト（Req 4.4）の具体的なレイアウト

## Recommendations

### Preferred Approach
**Option A（リアルタイム SQL 集計）** を推奨。理由:
- bijiyu はまだスケール課題が顕在化していない段階
- denormalization は cache invalidation バグの温床になりやすい（CLAUDE.md「Stripe 二重課金防止」「subscription mirror」の同種ガイドラインも DB の状態を二重に持つことのリスクを示唆）
- 「高評価のみ表示フィルタ」のような将来要件が明示されていない（必要になった時点で Option B へ移行可能）
- pgTAP・Vitest・E2E で既存パターン上での検証がしやすい

### Key Decisions Carried to Design Phase

1. 集計戦略の最終確定（A 推奨）
2. 星評価入力 UI 詳細（クリック挙動・ホバー・キーボード）
3. CLI-005 デザインカンプとの整合確認
4. seed.sql の新しいテストデータ設計（「3件以上+★4以上」「2件のみ」「★平均3.9」など境界値カバー）

### Implementation Sequence (推奨)

1. DB マイグレーション + RLS 再定義（pgTAP も同時に書き換え）
2. 型再生成
3. `lib/constants/rating.ts` + `lib/rating/judge-high-rating.ts`（純粋関数）+ Vitest
4. 星評価コンポーネント（`components/shared/star-rating-input.tsx` / `star-rating-display.tsx`）
5. バリデーション（`clientReportSchema` 書き換え）+ Vitest
6. Server Action（`submitClientReportAction` 書き換え）+ Vitest
7. CLI-012 フォーム差し替え
8. CLI-006 サマリー追加（旧 broken `againCount` 撤去）
9. CLI-028 集計ロジック書き換え
10. CLI-005 集計フェッチ追加 + バッジ差し替え
11. seed.sql 書き換え
12. E2E 追加（CLI-005/006/012/028 関連）
13. デグレ防止ゲート 3層通過確認（`npm run test` / `supabase test db` / `npm run test:e2e`）
14. matching/requirements.md + screen-map.md の追従更新

## Risks & Mitigations

- **R1: テスト書き換え漏れによるサイレント失敗** — 旧スキーマ参照（特に `rating_again`/`rating_punctual` 等）を grep で全件洗い出し、Req 8.7 のリスト（actions.test.ts / validations.test.ts / matching_rls.test.sql / seed.sql）を漏れなく更新。デグレ防止ゲート（Req 8.8）で確実に検出される
- **R2: 集計クエリの N+1** — CLI-005 で contractor ごとに集計を呼ぶ実装をしてしまう恐れ。bulk 集計（`reviewee_id IN (...) GROUP BY reviewee_id`）1クエリで取得するパターンを design.md で明示
- **R3: マイグレーションの TRUNCATE が誤って本番で実行される** — 本 spec は dev 環境前提（プロジェクトメモリに「本番運用前」と明記）。マイグレーション冒頭にコメントで「テストデータのみ。本番投入前なら問題なし」を明記し、安全性を文書化
- **R4: CLI-006 既存の broken `againCount` 削除漏れ** — `againCount` が他箇所で参照されていないか grep で確認してから削除
- **R5: 既存6画面の `user_reviews(id)` NULL チェック互換** — id カラムは新スキーマでも残るので影響なし。スキーマ変更後も `user_reviews(id)` 形式は引き続き動作する点を確認済

## 既知の問題（本 spec のスコープ外、将来 follow-up）

### K1: 発注者・受注者の同時評価送信時のステータス遷移レース

- **概要**: applications.status の `accepted` → `completed`/`lost` 遷移は「両方の評価（user_reviews + client_reviews）が揃った時点」で行われる。発注者（CLI-012）と受注者（CON-013）が**ほぼ同時に**評価を送信した場合、両方の Server Action が「相手の評価はまだ存在しない」と判定し、結果として **両評価レコードは記録されるが status は `accepted` のまま固着**する TOCTOU レースが理論上発生しうる
- **影響**: 発生確率は低い（同一トランザクション枠内での同時 commit が必要）。発生時はデータ不整合（評価2件あるのに status=accepted）となり、手動修正が必要
- **由来**: 本 spec で導入したものではなく、現行 `submitClientReportAction`（`src/app/(authenticated)/applications/actions.ts` L572-591）および matching spec REQ-MT-009 から引き継いだ既存挙動。rating-redesign は **status 連動部分の挙動を不変** に維持する（Req 2.6 / 2.7）
- **対応方針**: 本 spec ではスコープ外として **修正しない**。将来 matching spec を改修するタイミングで以下のいずれかで解決:
  - (a) Server Action で `SELECT ... FOR UPDATE` ロックを取る（applications 行をロックしてから両評価の存在チェック → 必要なら status 更新）
  - (b) 評価 INSERT 後に PostgreSQL トリガーで status 自動遷移を行う（user_reviews / client_reviews 両方の AFTER INSERT トリガー）
  - (c) 定期的な reconciliation バッチで「両評価あるのに status=accepted」を検出して修復
- **トラッキング**: matching spec の follow-up 項目として記録する

## References

- 既存実装ファイル:
  - `src/app/(authenticated)/applications/orders/[id]/report/client-report-form.tsx`
  - `src/app/(authenticated)/applications/actions.ts` L473-591
  - `src/app/(authenticated)/users/contractors/page.tsx`（CLI-005）
  - `src/app/(authenticated)/users/contractors/[id]/page.tsx`（CLI-006）
  - `src/app/(authenticated)/users/[id]/reviews/page.tsx`（CLI-028）
  - `src/lib/validations/matching.ts` L43-50
- マイグレーション: `supabase/migrations/20260324160600_002_core_tables.sql` L189-204, `20260324161543_003_rls_policies.sql` L274-283
- 既存テスト: `src/__tests__/matching/{actions,validations}.test.ts`, `supabase/tests/matching_rls.test.sql:166`, `supabase/seed.sql:783,799`
- 関連 spec: `.kiro/specs/matching/requirements.md` REQ-MT-009 / REQ-MT-010
- steering: `.kiro/steering/screen-map.md`（CLI-005/006/012/028 行）, `database-schema.md`, `design-rule.md`
