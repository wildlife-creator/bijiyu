# Gap Analysis — master-area-multi-select

実施日: 2026-05-20
対象 spec: `.kiro/specs/master-area-multi-select/requirements.md`(全 14 Requirements + Non-Goals + 関連ファイル一覧)

---

## 1. 現状コードベース調査

### 1.1 既存エリア関連コンポーネント

| ファイル | 行数 | 役割 | 本仕様での扱い |
|---|---|---|---|
| `src/components/area/area-list-editor.tsx` | 143 | 動的行リスト(各行は `AreaPicker`、minItems / maxItems / softCapWarning 制御) | **全面書き換え**(新 UI モデルへ) |
| `src/components/area/area-picker.tsx` | 106 | 都道府県 Select + 市区町村 MasterCombobox (single mode) | **全面書き換え**(チェックボックス群へ) |
| `src/components/area/area-list.tsx` | 33 | 詳細画面の全件展開表示(`formatAreasLong` に委譲) | **変更なし** |
| `src/components/area/area-summary.tsx` | (未読) | カードの「他 N エリア」省略表示 | **変更なし** |

### 1.2 既存型定義(全体で同じ shape)

```ts
// area-picker.tsx 内
export interface AreaDraft {
  prefecture: string | null;
  municipality: string | null;
}
```

→ 1 行 = 1 (県, 市区町村) ペア。`null` は「未選択」または「県全域」を意味する曖昧型。

### 1.3 既存 Zod スキーマ(4 ファイルで同じパターンが**コピペ**されている)

| ファイル(スキーマ本体) | 該当行 | スキーマ名 / フィールド | 使用側(Server Action) |
|---|---|---|---|
| `src/lib/validations/auth.ts` | L84-109 | `registerProfileSchema.availableAreas` | `src/app/(auth)/register/profile/actions.ts` |
| `src/lib/validations/profile.ts` | L65-89 | `profileEditSchema.availableAreas` | `src/app/(authenticated)/profile/edit/actions.ts` |
| `src/lib/validations/client-profile.ts` | L60-83 | `clientProfileSchema.recruitArea` | `src/app/(authenticated)/mypage/client-profile/edit/actions.ts` |
| `src/lib/validations/job.ts` | L28-54 / L117〜 | `jobSchema.areas` / `updateJobSchema.areas`(`.refine(arr.length <= 10)` の上限あり) | `src/app/(authenticated)/jobs/actions.ts` |

**重要**: Zod スキーマ本体は `src/lib/validations/*.ts` 側にある。`actions.ts` は schema を `import` するだけ。本仕様で書き換えるのは **schema 本体側**(Issue 3 修正で明示化)。

共通の現行パターン:
- `array(object({ prefecture: string, municipality: string.nullable }))`
- `.refine(arr.every(prefecture not empty))` — 空行ブロック
- `.refine(arr.length >= 1)` — 1 件以上必須
- (jobs のみ)`.refine(arr.length <= 10)` — 10 件上限
- `.transform(dedupe (prefecture, municipality) ペア)` — 末尾で重複除去

### 1.4 検証ヘルパー

- `src/lib/master/validate-area.ts:46` — `validateAreaChanges(newAreas, previousAreas)`: マスタ整合性検証(active label + 既存 deprecated 保持)。**無変更**。ただし新変換後の `AreaTuple[]` を受ける呼び出し位置は調整必要

### 1.5 検索フォーム 3 つ(同じパターンがコピペ)

| ファイル | URL params 読み取り | UI |
|---|---|---|
| `src/app/(authenticated)/jobs/search/job-search-filter.tsx` | L53-54 | `<AreaPicker>` 単一行 |
| `src/app/(authenticated)/clients/client-search-form.tsx` | L57-58 | `<AreaPicker>` 単一行 |
| `src/app/(authenticated)/users/contractors/contractor-search-filter.tsx` | L65-66 | `<AreaPicker>` 単一行 |

すべて `searchParams.get("prefecture")` / `searchParams.get("municipality")` の単数形読取り。「適用」で `params.set("prefecture", x); if (x && y) params.set("municipality", y)`。

### 1.6 サーバーページ 3 つ(URL → クエリ消費)

| ファイル | 該当行 |
|---|---|
| `src/app/(authenticated)/jobs/search/page.tsx` | L70-71 → `buildAreaFilterIds({ prefecture, municipality })` |
| `src/app/(authenticated)/clients/page.tsx` | L42-43 → 同上 |
| `src/app/(authenticated)/users/contractors/page.tsx` | L46-47 + L112-115 → 同上 |

3 ページとも `sp.prefecture as string ?? ""` / `sp.municipality as string ?? ""` で読み、ID 集合を `idSets.push(buildAreaFilterIds(...))` で AND マージ。

### 1.7 検索クエリ層

- `src/lib/utils/area-search-clauses.ts:37` — `buildAreaFilterIds({ entity, prefecture, municipality })`:
  - prefecture のみ指定 → 同県内の全レコード ID(NULL・具体混在含む)
  - prefecture + municipality 指定 → 該当 muni + 同県 NULL の 2 query を `Promise.all` で並列実行 + Set 和
  - **本仕様 Req 10-1 で「API 無変更」を確約**

### 1.8 登録系 5 フォーム(useFieldArray / Controller パターン)

| ファイル | エリア欄の親統合方式 |
|---|---|
| `src/app/(auth)/register/profile/register-profile-form.tsx` | L67 / L78 / L103: `useFieldArray("availableAreas")` + `watch("availableAreas")` + `setValue("availableAreas", ...)` で AreaListEditor 連携 |
| `src/app/(authenticated)/profile/edit/profile-edit-form.tsx` | L146 / L155 / L165 / L368-369: 同じパターン + 保存時 `JSON.stringify(parsed.data.availableAreas)` を FormData の文字列フィールドに格納 |
| `src/app/(authenticated)/mypage/client-profile/edit/client-profile-edit-form.tsx` | L284: `<Controller name="recruitArea" ... render={...AreaListEditor...} />` |
| `src/components/jobs/job-form.tsx` | (CLI-003 / CLI-004 共用、同様パターン想定) |

### 1.9 既存テスト

#### Vitest(エリアロジックを触る単体テスト)

| ファイル | エリア data 形式 |
|---|---|
| `src/__tests__/auth/validations.test.ts` | L140-238: `availableAreas: [{ prefecture, municipality }]`(11+ cases) |
| `src/__tests__/profile/validations.test.ts` | L34-175: 同上 |
| `src/__tests__/job/validations.test.ts` | L32 / L64: `areas: [{ prefecture, municipality }]` |
| `src/__tests__/organization/client-profile-actions.test.ts` | 募集エリア mock data あり |
| `src/__tests__/matching/can-apply-job-area.test.ts` | matching ロジック、無変更想定 |
| `src/__tests__/master/format-areas.test.ts` | format helpers、無変更想定 |

#### E2E (Playwright)

| ファイル | エリア operations |
|---|---|
| `e2e/master-area.spec.ts` | 複数箇所(URL `?prefecture=..&municipality=..` 直アクセス、AreaPicker 操作、文字列マッチ等。grep キーワード hit 9 件のうち URL アサーションが何件かは設計フェーズで詳細特定) |
| `e2e/profile.spec.ts` | 3 箇所(AreaListEditor 配置確認等) |
| `e2e/job-posting.spec.ts` | 4 箇所 |
| `e2e/job-search.spec.ts` | 0 直接エリア参照(検索 URL は他箇所と共通だが本ファイルではエリア絞り込み未テストの可能性) |

---

## 2. 要件実現可能性分析

### 2.1 マッピング: 要件 → 既存資産

| 要件 | 既存資産 | 拡張内容 | 難易度 |
|---|---|---|---|
| **Req 1**(UI 状態モデル) | `AreaDraft` 型 + AreaPicker / AreaListEditor | 型 `AreaDraft` を `AreaRow = { prefecture, whole, municipalities[] }` に置換、コンポーネントを書き換え | M |
| **Req 2**(排他制約) | なし | 新規実装(UI 即時切替 + Zod refine) | S |
| **Req 3**(同県重複禁止) | 既存 dedupe `transform` あり(別目的) | 新規 refine 実装、既存 transform は削除 | S |
| **Req 4**(UI→DB 平坦化) | なし | 新関数 `expandAreasForDb` 純粋関数 | S |
| **Req 5**(DB→UI 集約) | なし | 新関数 `collapseAreasFromDb` 純粋関数 | S |
| **Req 6**(Zod 統一) | 4 ファイル個別コピペ | 共通 `areaRowsSchema` 抽出、4 ファイル個別を削除 | M |
| **Req 7**(登録系 5 フォーム) | 5 フォーム既存 | useFieldArray / Controller 配下の AreaListEditor 統合のみ書換 | M |
| **Req 7B**(検索系 3 フォーム) | 3 フォーム既存(AreaPicker 単一行) | UI を新 AreaPicker(複数 muni チェック)に書換 + URL params 複数化 + サーバーページ 3 つの読取・OR 結合追加 | M-L |
| **Req 8**(用語統一) | 各所のラベルバラバラ | エラーメッセージ集約定数化 | S |
| **Req 9**(テスト更新) | Vitest 4 + E2E 4+ | data format 変更で全期待値書換 | M |
| **Req 10**(互換性維持) | `buildAreaFilterIds` / `canApplyJob` / `formatAreas*` | 既存 API 一切無変更 | (確約) |
| **Req 11**(表示無変更) | `AreaList` / `AreaSummary` | 触らない | (確約) |
| **Req 12**(移行不要) | seed.sql 整備のみ | 一括 SQL マイグレーションなし | S |
| **Req 13**(完了運用) | master-area Phase 9 残シナリオ | 手動テスト + AUTH-006 E2E 追加 | M |
| **Req 14**(ドキュメント) | CLAUDE.md / steering | 追記のみ | S |

### 2.2 識別されたギャップ

#### Gap 1: 新 UI 状態モデル `AreaRow` と既存 `AreaDraft` の非互換
- 既存: `{ prefecture: string|null; municipality: string|null }`(1 ペア)
- 新: `{ prefecture: string; whole: boolean; municipalities: string[] }`(1 県 + N muni)
- 影響: AreaListEditor / AreaPicker 内部実装 + 8 親フォームの useFieldArray 型 + 4 Zod schemas + 4 Server Action FormData 解析 + テスト期待値

#### Gap 2: 既存 4 Zod スキーマがコピペで散在
- 4 ファイルで同じ形を別途定義中。本仕様で `src/lib/validations/area.ts` に共通抽出するが、4 ファイルから個別定義を削除し import に置き換える必要

#### Gap 3: 既存 `transform(dedupe)` の目的が新仕様で変わる
- 旧: (prefecture, municipality) ペア重複除去で「東京都港区を 2 回登録」を吸収
- 新: 同県重複は **エラー**として扱う(Req 3)
- 旧 transform を削除し、refine + 排他チェックに置き換える

#### Gap 4: 検索 URL searchParams スキーマの単数 → 複数化
- 既存: `?prefecture=東京都&municipality=港区`
- 新: `?prefecture=東京都&municipality=港区&municipality=渋谷区&municipality=新宿区`(同名キー繰返し、Variant U2 採用確定)
- 影響: 3 検索フォーム(クライアント書き出し) + 3 サーバーページ(読取、`getArrayParam(sp.municipality)` で配列取得) + e2e/master-area.spec.ts の URL アサーション複数箇所(設計フェーズで詳細特定)

#### Gap 5: `buildAreaFilterIds` 複数 muni OR 結合の呼び出し側追加
- API は無変更だが、複数 muni を OR 結合する呼び出し側ループを 3 サーバーページに追加する必要
- 例: `const sets = await Promise.all(munis.map(m => buildAreaFilterIds({...,municipality:m}))); const merged = setUnion(sets);`

#### Gap 6: 「廃止市区町村」サフィックスロジックの新 UI 対応
- 旧 AreaListEditor docstring: 親が `(廃止)` サフィックスを `value.municipality` に付与、保存時に親で `stripDeprecatedSuffix`
- 新 UI では `AreaRow.municipalities: string[]` 内の各要素にサフィックス処理を施す
- expand/collapse 変換層でサフィックスの保持・剥離タイミングを明確化する必要

#### Gap 7: 検索系 AreaPicker のモード分岐
- 登録系 AreaListEditor の 1 行 ≒ 検索系 AreaPicker そのもの(配列長 1 制約)
- アプローチ選択: (a) AreaListEditor を `maxItems=1` で流用、(b) 検索専用 `SearchAreaPicker` を新設

#### Gap 8: テストデータ整備とテスト書き換え
- seed.sql に「東京都全域 + 東京都港区」混在ケースを Req 9-5 E2E 用に意図的投入
- Vitest 4 ファイルの mock data 全 12+ ケースの型書き換え
- E2E 4 ファイルの DOM 操作シーケンス + URL アサーション書き換え

#### Gap 9: AUTH-006 含む登録フロー E2E が未存在
- 既存 e2e/profile.spec.ts は `/profile/edit` のみで `/register/profile` 通しテストなし
- 新規 `e2e/auth-signup.spec.ts` 作成必要(認証済 seed ユーザーで `/register/profile` → 全項目入力 → /mypage 到達)

### 2.3 「Research Needed」項目(設計フェーズで詰める)

- **R1**: 廃止市区町村サフィックスの新 UI チェックボックスでの見せ方(チェック済 + 「(廃止)」表示は技術的にできるが UX 的にどう見せるか)
- **R2**: `useFieldArray` で新 `AreaRow` 型を使う際、`whole: boolean` フィールドの dirty 検知が react-hook-form の規定で正しく動くか
- **R3**: 検索 URL の `municipalities=A,B,C` のカンマ区切りで、`A` 自体にカンマが含まれる市区町村名があるか(マスタを確認)
- **R4**: AUTH-006 E2E で「認証済仮ユーザー」を seed 投入する方法(`auth.users` 直接 INSERT vs 別 fixture)
- **R5**: 検索ポップアップで「全域」概念をどう表現するか(本仕様では「muni 空配列 = 県のみ」だが、UI 上「全域」チェックを置かないと明示的に意思表示できない可能性)

---

## 3. 実装アプローチ案

### Approach C(採用確定): ハイブリッド + 構造的分離

Issue 2 修正で **採用確定**。コンポーネント構成は以下:

- **登録系**: `AreaListEditor` を同名リライト(内部に新型 `AreaRow` ベースの行 UI を複数並べる)
- **検索系**: 新コンポーネント `SearchAreaPicker`(配列長 1 制約、UI は登録系の 1 行と同じ部品を共有、全域チェックなし)
- **共通**: `src/components/area/area-row.tsx` を新規追加して 1 県分の UI 部品(prefecture Select + 全域 Checkbox + muni Checkbox 群)を抽出
- 旧 `area-picker.tsx` は **廃止**(8 親フォームの import 全置換 + ファイル削除)

**確定理由**:
- ✅ 検索系と登録系を構造的に分離しつつ UI 部品共有で重複排除
- ✅ 「検索系で全域チェックを置かない / 配列長 1 強制」のような検索特有制約を `SearchAreaPicker` 内に閉じ込められる
- ✅ 後の改修(検索系だけ変えたい等)が楽
- ❌ コンポーネント階層がやや複雑(1 ファイル → 3 ファイル)→ ただし 1 ファイルあたりがシンプルになるので可読性は向上

### Approach A(不採用): 既存ファイル名のままリライト

検索系と登録系で本来不要なモード分岐が 1 ファイル内に必要になり、検索特有制約(全域なし/配列長 1)の表現が複雑化するため不採用。

### Approach B(不採用): 別ファイルで V2 追加 + 段階移行

段階移行の管理コストに見合うメリットなし(本質的には A と同じ作業 + 移行管理コスト)。期間中の認知負荷も高い。

### Variant: Zod スキーマ統合のアプローチ

#### 案 Z1: 完全共通化(推奨)
- `src/lib/validations/area.ts` を新規作成し、`areaRowSchema` / `areaRowsSchema` / `searchAreaRowSchema` を全 export
- 既存 4 ファイル個別の area スキーマ部を **削除**し、`areaRowsSchema` を import
- ✅ コピペコード除去
- ✅ 排他制約・同県重複禁止のロジックが 1 箇所
- ❌ 4 ファイルの修正(削除 + import 追加)が必要

#### 案 Z2: 各ファイル個別実装(現状維持)
- ✅ 影響範囲ローカル
- ❌ Req 6 の「一元化」要件を満たせない
- ❌ 将来の改修で 4 ファイル個別メンテナンス

→ **推奨: Z1**

### Variant: 検索 URL params の表現 ✅ 確定済

#### 案 U2(採用): 同名キー繰返し `municipality=A&municipality=B&municipality=C`
- ✅ エスケープ問題なし(市区町村名にカンマが含まれても安全)
- ✅ `getArrayParam(sp.municipality)` 既存ヘルパー再利用可能
- ✅ 既存パターンと整合(`tradeType` / `skillTag` / `qualification` が同じ形式)
- ⚠️ URL がやや長い(許容)

→ **採用確定**: U2(spec-requirements の 6 論点 + Issue 1 修正で確定)

#### 案 U1(不採用): カンマ区切り `municipalities=A,B,C`
- カンマ含有市区町村名でのエスケープ問題、既存パターンと不整合のため不採用

---

## 4. Out-of-Scope(設計フェーズに先送り)

- 既存 `validateAreaChanges` 内部実装の最適化(本仕様で触らない)
- `formatAreasShort` / `formatAreasLong` の「東京都(港区指定あり)」融合表現の挙動詳細(現行ロジック維持)
- master-area Phase 9 シナリオ D〜J の各シナリオ詳細(完了後の運用、tasks.md に組み込み)
- AUTH-006 E2E のメール認証 fixture 方式(R4 として研究、設計で決定)
- ロールバック方針(本仕様で旧 UI を完全削除するため、ロールバックは別タスク)

---

## 5. 実装複雑性とリスク

### 5.1 コードベース変更量(目安)

| 種別 | ファイル数 | 推定行数 |
|---|---|---|
| **新規追加** | 8 | 〜800 行(types / area-row / search-area-picker / area-conversion / area validations / area-conversion test / area validations test / e2e-signup) |
| **全面書き換え** | 1 | 143 行相当(area-list-editor のみ) |
| **削除** | 1 | 106 行(area-picker、import 全置換後にファイル削除) |
| **部分修正(Zod 削除 + import)** | 4 | 〜100 行(validations 4 ファイル) |
| **部分修正(Server Action)** | 4 | 〜80 行(actions.ts 4 ファイル、FormData 解析 + expand 通過) |
| **フォーム調整** | 5 | 〜150 行(useFieldArray 型変更 / Controller render 書換) |
| **検索フォーム書換** | 3 | 〜200 行(URL params 複数化 + UI 入れ替え) |
| **サーバーページ調整** | 3 | 〜80 行(URL params 読取 + buildAreaFilterIds OR ループ) |
| **テスト更新(Vitest)** | 4+ | 〜200 行 |
| **テスト更新(E2E)** | 4+ | 〜250 行(DOM 操作・URL アサーション全書換) |
| **テスト新規(Vitest)** | 2 | 〜200 行(area-conversion / area validations) |
| **テスト新規(E2E)** | 1 | 〜200 行(auth-signup) |
| **seed.sql 整備** | 1 | 〜30 行 |
| **CLAUDE.md / steering 更新** | 1-2 | 〜60 行 |

**合計**: 約 30 ファイル / 約 2,400 行

### 5.2 工数見積もり

- **Effort: L(7-10 日)** — 新ロジック自体は中規模だが、影響範囲(8 フォーム + テスト多数)が広い
- **Risk: 中** — 既存 RPC / マッチング / 検索クエリの API を触らないので core ロジックは安全。リスクは主に「テスト全書換」での見落とし(古い data format での mock が残り CI 緑のまま壊れた本番、CLAUDE.md ルール再発)

### 5.3 主要リスク

| リスク | 緩和策 |
|---|---|
| **R-1**: 古い `AreaDraft` 形式での mock が残ったテストが CI 緑のまま壊れた本番(CLAUDE.md 「テストファイル内で本体ロジックの定数を『コピー』してはならない」のパターン再発) | 旧型 `AreaDraft` を TypeScript レベルで削除(grep で旧形式参照を全消去) |
| **R-2**: useFieldArray の `whole: boolean` フィールド dirty 検知不具合 | 設計フェーズで React Hook Form 公式パターン確認(R2 として研究) |
| **R-3**: 検索 URL の単数 → 複数化でブラウザブックマーク互換性が壊れる | 本番運用前なので互換性不要、Non-Goals に「検索 URL のブックマーク互換性は維持しない」を明記済(Issue 6 修正で追加) |
| **R-4**: AUTH-006 E2E のメール認証 fixture が複雑 | seed.sql で「メール認証済 + プロフィール未設定」状態の仮ユーザーを意図投入(R4 として設計で詰める) |
| **R-5**: 廃止市区町村サフィックスの新 UI 対応漏れ | 設計フェーズで R1 として検討、Vitest テストでカバー |
| **R-6**: 検索系の「全域」概念欠落でユーザーが「県のみ指定」と「全域指定」を区別できない | 設計で「muni 未チェック = 県のみ指定」をプレースホルダ等で明示 |

### 5.4 段階的着手の提案(設計フェーズに渡す情報)

設計フェーズで tasks.md に展開する際の自然な順序:

1. **Phase A**: 純粋関数 + 型(`area-conversion.ts` / `types.ts` / `validations/area.ts`)+ Vitest
2. **Phase B**: UI 部品(`area-row.tsx`)+ `AreaListEditor` リライト + `SearchAreaPicker` 新設
3. **Phase C**: 登録系 5 フォーム書換 + 4 Server Action + 既存 Zod 4 ファイル削除/置換
4. **Phase D**: 検索系 3 フォーム書換 + 3 サーバーページ URL params 対応
5. **Phase E**: 既存テスト(Vitest 4 + E2E 4)書換 + seed.sql 整備
6. **Phase F**: 新規 E2E(AUTH-006 含む登録フロー)+ CLAUDE.md / steering 更新
7. **Phase G**: master-area Phase 9 シナリオ D〜J 手動テスト + manual-test-report.md 仕上げ

各 Phase ごとに `npm run test` / `supabase test db` / `npm run test:e2e` のグリーン確認を挟む。
