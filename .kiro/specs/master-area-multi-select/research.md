# Research & Design Decisions — master-area-multi-select

## Summary

- **Feature**: `master-area-multi-select`
- **Discovery Scope**: Extension(既存 UI/Server Action のリファクタリング + 検索系の部分拡張、外部依存追加なし)
- **Key Findings**:
  - 既存 `AreaPicker` + `AreaListEditor` は「1 行 = 1 (県, muni) ペア」モデルで、新 UI モデル「1 行 = 1 県 + N muni / 全域」とは型レベルで非互換。リライト + 構造分割が必要
  - Zod スキーマ 4 ファイルでコピペが散在しており、共通化(Z1)が低コストで実現可能
  - 検索クエリ層(`buildAreaFilterIds()`)は API を保持したまま、呼び出し側ループで複数 muni の OR 結合が成立する。検索系の DB 互換性確保
  - 既存 `useFieldArray` + `setValue` ベースの統合パターンが 5 登録フォームで確立済み。新型 `AreaRow` でも同パターン継承可能

## Research Log

### 既存 AreaListEditor / AreaPicker の API

- **Context**: 新 UI モデルへのリライト範囲を特定する
- **Sources Consulted**:
  - `src/components/area/area-list-editor.tsx`(143 行)
  - `src/components/area/area-picker.tsx`(106 行)
  - `src/components/area/area-list.tsx` / `area-summary.tsx`(表示専用、無変更)
- **Findings**:
  - 既存 `AreaDraft = { prefecture: string | null; municipality: string | null }` は 1 ペア表現
  - `AreaListEditor` は `value/onChange` で `AreaDraft[]` を扱う(useFieldArray 親側との連携を `replace()` ベースで吸収)
  - `AreaPicker` は内部に Select(都道府県)+ MasterCombobox(市区町村 single mode)を持つ
  - 旧 docstring に「親が `(廃止)` サフィックスを value に付与、保存時に親で stripDeprecatedSuffix」と記載あり(廃止市区町村ハンドリング、R1 で再設計)
- **Implications**:
  - リライト範囲は area-list-editor.tsx + area-picker.tsx の両方。型 `AreaDraft` を削除して `AreaRow` 型へ置換
  - 「廃止サフィックス」処理を新型 `AreaRow.municipalities: string[]` 内の各要素に適用する設計が必要(R1)

### Zod スキーマの分布

- **Context**: 共通化(Req 6 Z1)の実現性を確認
- **Sources Consulted**:
  - `src/lib/validations/auth.ts` L84-109 (`registerProfileSchema.availableAreas`)
  - `src/lib/validations/profile.ts` L65-89 (`profileEditSchema.availableAreas`)
  - `src/lib/validations/client-profile.ts` L60-83 (`clientProfileSchema.recruitArea`)
  - `src/lib/validations/job.ts` L28-54, L117+ (`jobSchema.areas`)
- **Findings**:
  - 4 ファイルとも完全に同じパターン(array + 空行 refine + min(1) + dedupe transform、jobs のみ max(10))
  - 共通化に対する明白なブロッカーなし(全エンティティで同一の検証ロジックが必要)
- **Implications**:
  - `src/lib/validations/area.ts` を新規追加し、`areaRowsSchema` / `searchAreaRowSchema` をエクスポート。4 ファイル個別定義は削除可能

### 検索フォーム/サーバーページ調査

- **Context**: 検索系 3 フォームを「1 県 + N muni」に部分拡張する際の影響範囲
- **Sources Consulted**:
  - フォーム: `jobs/search/job-search-filter.tsx` L53-54, L72-74 / `clients/client-search-form.tsx` L57-58, L74-76 / `users/contractors/contractor-search-filter.tsx` L65-66, L82-84
  - サーバーページ: `jobs/search/page.tsx` L70-71, L227 / `clients/page.tsx` L42-43, L175 / `users/contractors/page.tsx` L46-47, L112-115
  - クエリ層: `src/lib/utils/area-search-clauses.ts` の `buildAreaFilterIds()`
- **Findings**:
  - 3 フォームすべてが `searchParams.get("prefecture")` / `.get("municipality")` の単数取得 + 「適用」で `params.set` の同じパターン
  - サーバーページは `(sp.prefecture as string) ?? ""` / `(sp.municipality as string) ?? ""` で受け取り、`buildAreaFilterIds` を 1 回呼ぶ
  - 既存 `getArrayParam(sp.tradeType)` ヘルパーが `tradeType` / `skillTag` / `qualification` で同名キー繰返し配列取得に使われている(`users/contractors/page.tsx` L49-51)
- **Implications**:
  - 検索 URL の muni を同名キー繰返し(`?municipality=A&municipality=B`)に変更すれば、`getArrayParam(sp.municipality)` で配列取得できる
  - `buildAreaFilterIds()` API は無変更で、呼び出し側で muni ごとにループ + Set 和の OR 結合を組む

### 既存テストの DOM 操作パターン

- **Context**: E2E 書き換えのコスト見積もりと衝突回避
- **Sources Consulted**:
  - `e2e/master-area.spec.ts`(エリア関連参照 9 件)
  - `e2e/profile.spec.ts`(3 件)
  - `e2e/job-posting.spec.ts`(4 件)
  - Vitest: `auth/validations.test.ts` / `profile/validations.test.ts` / `job/validations.test.ts` / `organization/client-profile-actions.test.ts`
- **Findings**:
  - E2E は `page.goto("/jobs/search?prefecture=...&municipality=...")` の URL 直アクセスパターンが主(shadcn Select 操作の落とし穴を避けるため)
  - Vitest は `availableAreas: [{ prefecture, municipality }]` 形式の mock data で 11+ ケース
- **Implications**:
  - 古い `AreaDraft` 形式の mock を新型 `AreaRow` に書き換える必要(全 Vitest テスト + E2E)
  - URL 形式の単数 → 複数化により E2E の URL アサーション全箇所書き換え
  - CLAUDE.md「テストファイル内で本体ロジックの定数を『コピー』してはならない」ルール準拠のため、本体型を import で受ける

### React Hook Form での AreaRow 型の扱い

- **Context**: `useFieldArray` で新型(`prefecture` / `whole` / `municipalities`)を扱う際の挙動確認(gap-analysis R2)
- **Sources Consulted**:
  - React Hook Form 公式 docs(`useFieldArray` セクション)
  - 既存実装: `register-profile-form.tsx` L67 / L78 / L103 の useFieldArray + watch + setValue パターン
- **Findings**:
  - `useFieldArray` は `{ id: string, ...fields }` 形式の配列を扱う。`AreaRow = { prefecture, whole, municipalities }` でも問題なし
  - `whole: boolean` フィールドの dirty 検知は通常の field と同じ扱い(`Controller` 経由なら確実)
  - 既存実装は `setValue("availableAreas", next)` で全置換するパターンを使っており、新型でも同様
- **Implications**:
  - R2(gap-analysis)は実装上の懸念なしと結論。設計フェーズでパターンを確定

### 廃止市区町村サフィックスの新 UI 表示(R1)

- **Context**: 既存登録の deprecated muni に「（廃止）」サフィックスを付ける UI 表現を新 UI で再設計
- **Sources Consulted**:
  - `src/lib/master/deprecated.ts`(`applyDeprecatedSuffix` / `stripDeprecatedSuffix`)
  - 既存 area-list-editor.tsx の docstring
- **Findings**:
  - 旧 UI: combobox プルダウン内に「○○区（廃止）」表示 + 既存 value のみ受理(新規追加禁止)
  - 新 UI(Checkbox 群):
    - **既存登録の deprecated muni** = チェック済み Checkbox にラベル「○○区（廃止）」付与、チェック解除可能
    - **新規追加** = `master_municipalities.deprecated_at IS NULL` の active 候補のみ Checkbox として表示。deprecated は候補から除外
  - 既存 `validateAreaChanges` が delta validate で「既存保有の deprecated は保持を許可、added は active 必須」を実装済み。本仕様で無変更
- **Implications**:
  - 新 UI コンポーネント `AreaRow` に「既存保有 muni の集合(prefecture ごとに deprecated を含む)」と「active 候補 muni 集合」を分けて props で受ける必要
  - Checkbox 群の生成ロジック: `union(activeMunis, currentlyChecked && deprecatedMunis)`。deprecated muni はチェック済みのみ表示

### AUTH-006 E2E のメール認証 fixture(R4)

- **Context**: AUTH-006 を含む登録フロー E2E で「メール認証済 + プロフィール未設定」状態の仮ユーザーを seed 投入
- **Sources Consulted**:
  - CLAUDE.md「招待フロー seed の `email_confirmed_at`」セクション
  - CLAUDE.md「middleware の signup 完了判定」セクション(`last_name IS NULL` 判定で `/register/*` 系のパスを許可)
  - 既存 seed.sql の auth.users INSERT パターン
- **Findings**:
  - 「メール認証済 + プロフィール未設定」状態は seed.sql で実現可能:
    - `auth.users` に `email_confirmed_at = now()` でユーザー作成(メール確認済)
    - `handle_new_user` トリガーで `public.users` 行が自動作成される
    - **`public.users.last_name` は NULL のまま**(プロフィール未設定状態)
    - middleware が `last_name IS NULL` を検知し `/register/profile` へのアクセス許可
  - Playwright テスト側で `loginAs(page, "new-contractor@test.local")` で認証セッション確立 → `page.goto("/register/profile")` で AUTH-006 到達
- **Implications**:
  - seed.sql に「メール認証済 + プロフィール未設定」の仮ユーザーを 1 件追加。E2E では実メール送受信なしで AUTH-006 から開始可能
  - R4 は実装可能と結論、設計で「seed 仮ユーザー方式」を採用

### 検索系の「全域」概念表現(R5)

- **Context**: 検索系で「全域チェック」を置かない設計上、ユーザーが「県全域」を意図的に指定したいケースをどう表現するか
- **Sources Consulted**:
  - Req 7B-3 / 7B-5 / 7B-7 の上位包含ルール
  - master-area Req 6 の検索仕様
- **Findings**:
  - 検索系の「県のみ指定(=その県の全レコード)」は **市区町村 Checkbox を 0 個チェック** で表現
  - 上位包含ルールにより、「東京都」のみ検索 → 東京都の全レコード(全域 NULL + 港区 + 渋谷区 等すべて)がヒット
  - 「県のみ指定」と「全域」は **検索結果として等価**(検索クエリビルダーで同じ動作)
  - UI 上は「市区町村未選択 = 県内すべて」をプレースホルダーで明示(「市区町村を選ぶと絞り込まれます(未選択時は県内すべて)」等)
- **Implications**:
  - `SearchAreaPicker` 内に「全域」チェックボックスは不要。「未選択 = 県のみ」の挙動をプレースホルダーで明示

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Approach A: 既存ファイル名のままリライト | area-list-editor / area-picker の中身を書き換え、import パス維持 | 親フォームの import 文不要変更 | 検索系と登録系のモード分岐で内部複雑化、検索特有制約を 1 ファイルに閉じ込めにくい | **不採用** |
| Approach B: V2 別ファイル追加 + 段階移行 | 旧 UI 残しつつ新 UI を別ファイルで追加 | 並行テスト可能、ロールバック容易 | 撤去管理コスト、認知負荷高 | **不採用** |
| **Approach C: ハイブリッド + 構造的分離** | `AreaRow`(共通) + `AreaListEditor`(登録系) + `SearchAreaPicker`(検索系)の 3 分割、旧 `AreaPicker` 廃止 | 検索系と登録系を構造的に分離、UI 部品は AreaRow で共有、検索特有制約を `SearchAreaPicker` に閉じ込め | ファイル数増加(1 → 3) | **採用**(Issue 2 修正で確定) |

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Variant U1: URL カンマ区切り | `?municipalities=A,B,C` | URL 短い | カンマ含有時のエスケープリスク、既存パターンと不整合 | **不採用** |
| **Variant U2: URL 同名キー繰返し** | `?municipality=A&municipality=B&municipality=C` | 既存パターン整合(`getArrayParam`)、エスケープ問題なし | URL やや長い | **採用**(Issue 1 修正で確定) |

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Variant Z1: Zod スキーマ共通化 | `src/lib/validations/area.ts` 新規 + 4 ファイル個別を削除 | コピペコード除去、ロジック 1 箇所 | 4 ファイル個別を書き換え | **採用** |
| Variant Z2: 各ファイル個別実装 | 既存パターン維持 | 影響範囲ローカル | Req 6「一元化」未充足、将来のメンテ負荷 | **不採用** |

## Design Decisions

### Decision: 新 UI 状態モデル `AreaRow` の型定義

- **Context**: 旧 `AreaDraft = { prefecture, municipality }` を「1 行 = 1 県 + N muni / 全域」モデルに置換する必要
- **Alternatives Considered**:
  1. Tagged union `{ kind: "whole"; prefecture: string } | { kind: "muni"; prefecture: string; municipalities: string[] }` — 排他制約を型レベルで強制
  2. **`{ prefecture: string; whole: boolean; municipalities: string[] }` フラット型** — UI/Zod でランタイム refine
- **Selected Approach**: フラット型 `AreaRow`
- **Rationale**:
  - React Hook Form の `useFieldArray` は tagged union が扱いづらい(`fields[i].kind === "whole"` の discriminated narrowing が非対応)
  - Zod refine で排他制約を 1 箇所(`areaRowsSchema.superRefine`)に集約できる
  - シリアライズ(`JSON.stringify` 経由で FormData に渡す)がフラット型のほうが扱いやすい
- **Trade-offs**:
  - ✅ React Hook Form と整合、Zod で集約検証
  - ⚠️ 排他制約が型レベルで強制されない(refine 漏れリスク)→ 中央集約スキーマで refine することで回避
- **Follow-up**: `areaRowsSchema` の refine カバレッジを Vitest で証明する

### Decision: UI ↔ DB 変換層は純粋関数 2 本

- **Context**: 既存 RPC を保持しつつ、UI 状態モデルと DB 形式を変換する必要
- **Alternatives Considered**:
  1. クラスベース変換層(`AreaConverter` 等)
  2. **純粋関数 2 本(`expandAreasForDb` / `collapseAreasFromDb`)**
- **Selected Approach**: 純粋関数 2 本
- **Rationale**:
  - 状態を持たないため、テストが書きやすく副作用がない
  - Server Action 側で `expandAreasForDb(parsed.data.areas)` の 1 行で組み込める
  - サーバー側 page.tsx で `collapseAreasFromDb(dbRows)` の 1 行で defaultValues 整形できる
- **Trade-offs**:
  - ✅ シンプル、テスト容易、副作用なし
  - ⚠️ 「廃止サフィックス」処理は別関数(`applyDeprecatedSuffix` / `stripDeprecatedSuffix`、既存)と組み合わせて使う必要 → ドキュメントで使い分けを明示

### Decision: 検索 URL は同名キー繰返し方式(Variant U2)

- **Context**: 検索系で muni 複数指定を URL で表現
- **Alternatives Considered**: カンマ区切り(U1) vs 同名キー繰返し(U2)
- **Selected Approach**: U2 同名キー繰返し
- **Rationale**:
  - 既存パターン(`tradeType` / `skillTag` / `qualification`)と整合
  - `getArrayParam()` ヘルパー再利用可能
  - 市区町村名にカンマ含有(将来追加)があってもエスケープ不要
- **Trade-offs**:
  - ✅ 既存パターン継承
  - ⚠️ URL がやや長くなる(許容)

### Decision: `SearchAreaPicker` には「全域」チェックを置かない(R5)

- **Context**: 検索系の「県のみ指定」表現
- **Alternatives Considered**:
  1. 全域チェック有り(登録系と同じ UI)
  2. **全域チェック無し + 「未選択 = 県のみ指定」と解釈**
- **Selected Approach**: 全域チェック無し
- **Rationale**:
  - 上位包含ルールにより「県のみ指定」と「県全域」は検索結果として等価
  - 検索系では「県内のどこか」が目的なので、UI を単純化
  - 登録系の「県全域 vs 市区町村複数」排他制約が検索系には不要(検索はそもそも 1 県限定)
- **Trade-offs**:
  - ✅ UI シンプル
  - ⚠️ 登録系と検索系で操作が微妙に違う → プレースホルダーで明示的にカバー

### Decision: 廃止市区町村サフィックスの新 UI 表示(R1)

- **Context**: deprecated muni を既存登録ユーザーが保持していた場合の Checkbox 表示
- **Alternatives Considered**:
  1. **Checkbox ラベルに「（廃止）」サフィックス付与 + チェック済み表示**(既存保持時のみ表示)
  2. 別セクション「廃止された市区町村」で別表示
- **Selected Approach**: Checkbox ラベルにサフィックス
- **Rationale**:
  - 既存 `applyDeprecatedSuffix` / `stripDeprecatedSuffix` パターン継承
  - UI 上の連続性(同じ Checkbox 群内で表示)
  - ユーザーが「これは廃止」と理解しやすい
- **Trade-offs**:
  - ✅ 既存パターン整合、シンプル
  - ⚠️ Checkbox 群の生成ロジックで `active` と `currentlyChecked deprecated` を Union する追加処理が必要

### Decision: AUTH-006 E2E の seed 仮ユーザー方式(R4)

- **Context**: メール認証フローを再現せず AUTH-006 のフォーム入力をテストする
- **Alternatives Considered**:
  1. 実メール送受信を含む全通し E2E(別 spec の auth で実施想定)
  2. **seed.sql で「メール認証済 + プロフィール未設定」仮ユーザーを投入し、E2E で `loginAs` 後に `/register/profile` 直接アクセス**
- **Selected Approach**: seed 仮ユーザー方式
- **Rationale**:
  - middleware が `last_name IS NULL` で `/register/profile` アクセスを許可する設計が既存
  - 実メール送受信を E2E に含めると環境依存・実行時間増の問題
  - Phase 9 完了の最終確認として AUTH-006 のフォーム動作確認が本質
- **Trade-offs**:
  - ✅ E2E がシンプル・高速
  - ⚠️ AUTH-001〜005 のメール認証フローは別 spec(auth)でカバー
- **Follow-up**: seed.sql の auth.users INSERT で `email_confirmed_at = now()` 必須(CLAUDE.md ルール準拠)

## Risks & Mitigations

- **R-1: 古い `AreaDraft` 形式の mock が残ったテストが CI 緑のまま壊れた本番**
  - 緩和策: 旧型 `AreaDraft` を TypeScript レベルで完全削除し、grep `AreaDraft` で参照ゼロを確認する。tasks.md に「最終 grep 確認」を含める

- **R-2: useFieldArray の whole boolean 検知不具合**
  - 緩和策: 既存 `Controller` パターンを継承(`register-profile-form.tsx` L355 周辺の踏襲)。Vitest 単体テストで dirty 検知を assert

- **R-3: 検索 URL の単数 → 複数化でブラウザブックマーク互換性が壊れる**
  - 緩和策: 本番運用前のため不要(Non-Goals に明記、Issue 6 修正で追加済)

- **R-4: 廃止市区町村サフィックスの新 UI 対応漏れ**
  - 緩和策: 設計で `AreaRow` props に `existingMunicipalities`(deprecated 含む)と `activeMunicipalities` を分離。Vitest テストで「既存 deprecated を保持できる + 新規 deprecated は追加不可」を証明

- **R-5: 検索系の「全域」概念欠落でユーザー混乱**
  - 緩和策: プレースホルダーで「市区町村未選択 = 県のすべて」を明示。E2E でユーザーストーリーをカバー

- **R-6: AUTH-006 seed 仮ユーザーが既存テストと衝突**
  - 緩和策: seed.sql に専用メアド(例: `new-contractor-e2e@test.local`)で 1 件追加。他テストへの影響を Vitest / E2E グローバル grep で確認

## References

- 親仕様: `.kiro/specs/master-area/requirements.md`(エリア検索の上位包含ルール、案件 10 件上限、マスタ管理パターン)
- 親仕様: `.kiro/specs/master-skills/`(`MasterCombobox` / `validateLabelChanges` / `unstable_cache` パターン)
- CLAUDE.md: フォーム内 `<button type>` ルール、テストファイル定数コピー禁止、Storage RLS パターン
- 関連メモリ: `project_master_area_progress.md`, `feedback_master_design_principles.md`
- React Hook Form: `useFieldArray` 仕様(internal docs を Web 確認、外部依存追加なし)
