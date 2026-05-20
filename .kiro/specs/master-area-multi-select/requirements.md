# Requirements Document

## Introduction

master-area spec(Phase 0〜8 完了 / Phase 9 シナリオ A〜C で中断)の手動テスト中に、エリア入力 UI(`AreaPicker` + `AreaListEditor`)の「1 行 = 1 (都道府県, 市区町村) ペア」モデルが UX として重い問題が顕在化した。1 県内で複数市区町村を扱うたびに行を追加する必要があり、タウンワーク・マイナビ・SUUMO 等の業界標準(「県を選ぶと市区町村が一覧化されチェックボックスで複数選択」)と乖離していた。

本仕様は **DB スキーマ・既存 RPC・マッチング判定・上位包含検索ルールは一切変更せず**、UI 層と Server Action の前段(UI ↔ DB 変換)のみを差し替えることで、「1 行 = 1 都道府県 + その県内の複数市区町村(または県全域)」を表現できる Pattern A 省略版 UI に刷新する。タウンワーク式の業界標準 UX(選んだ県だけツリー展開、未選択県はリストに現れない)を採用する。

### 主要な設計判断(前セッションで合意済み)

- **UI モデル**: `{ prefecture: string, whole: boolean, municipalities: string[] }[]`(1 行 = 1 県)
- **排他制約**: 同一行内で `whole = true` と `municipalities.length > 0` の共存禁止
- **同県重複禁止**: 同一 prefecture を複数行に登録できない
- **既存データ正規化**: DB に「東京都全域(NULL)」と「東京都港区(具体)」が同時存在する場合、UI 読込時に県全域を優先(具体的市区町村群を捨てる)
- **DB 構造保持**: `user_available_areas (prefecture, municipality)` / `job_areas (prefecture, municipality)` / `client_recruit_areas (prefecture, municipality)` の 3 テーブル + 既存 RPC(`replace_user_areas` / `replace_job_areas` / `replace_client_recruit_areas`)はそのまま使う
- **マッチング判定**: 都道府県マッチのまま据え置き(`src/lib/matching.ts` 変更しない、CLAUDE.md ルール準拠)
- **上位包含検索ルールの維持**: `buildAreaFilterIds()` 等の検索クエリは無変更。新 UI の入力結果が同じ「(県, muni)」ペア配列に展開されるため API 互換

### 本仕様の議論で確定した追加方針(spec-requirements での 6 論点)

1. **論点 1(検索フォーム UI)**: 検索系 3 フォーム(CON-002 / CON-005 / CLI-005)も部分的に新 UI に揃える。ただし複数県をまたぐ検索は不可とし、「県 1 つ + その県内の市区町村複数チェック」までに留める
2. **論点 2(既存データ移行)**: ビジ友は本番運用前(実ユーザーなし)のため、一括 SQL マイグレーションは不要。seed.sql の整備のみで対応
3. **論点 3(認証フロー E2E)**: AUTH-001 全通し E2E ではなく、AUTH-006(エリア入力を含む受注者新規登録フォーム)を中心とした E2E に範囲を縮小
4. **論点 4(「全域」ラベル文言)**: チェックボックスのラベルは「全域」(シンプル版)。都道府県名を動的に冠さない
5. **論点 5(件数カウンター)**: 受注者・発注者フォームではカウンター表示なし。案件フォームは保存ボタン押下時のみ「最大 10 件です」エラー表示で対応(常時カウンター UI は出さない)
6. **論点 6(全域 ON 時の市区町村チェック)**: 市区町村チェックボックス群は非表示にせず、グレーアウト(visually disabled)で表示維持

### 完了後の運用

本仕様の実装完了をトリガーに、master-area の `manual-test-report.md` に記録された 10 件のバグのうち UX 起因 4 件(B1〜B4)が解消される前提で Phase 9 シナリオ D〜J の手動テストを新 UI で続行する。並行して AUTH-006 を含む登録フローの E2E を追加し、Phase 9 完了をもって master-area / master-area-multi-select 両方を [x] 化する。

## Project Description (Input)

master-area-multi-select

対応エリア・募集エリア・案件エリアの入力 UX を「1 行 = 1 都道府県 + 複数市区町村」のマルチ選択型に変更する仕様。

【前セッションでの決定事項】
- Pattern A 省略版(タウンワーク/マイナビ等の業界標準を踏襲、選んだ県だけツリー展開)
- 「県全域」と「市区町村複数」は排他(共存させない)
- 既存データ移行: 「県全域 + 具体的市区町村」混在は県全域を優先(市区町村を捨てる)
- DB スキーマは無変更(user_available_areas / job_areas / client_recruit_areas の (prefecture, municipality) 構造保持、UI と DB の間で変換)

【実装範囲】
- AreaPicker / AreaListEditor リライト
- Zod スキーマ 4 本(profile / auth / client-profile / job)書き換え
- 5 フォーム対応
- データ移行ロジック(既存「県全域 + 具体的市区町村」混在の正規化)
- 既存 Vitest テスト期待値更新
- 既存 E2E テスト更新

【完了後の流れ】
master-area Phase 9 シナリオ D〜J を新 UX で実施 → AUTH-001 全通し E2E 追加 → 自動テスト全件 PASS 確認 → tasks.md §9 を [x] → manual-test-report.md 仕上げ

参照:
- 前セッションで作成: .kiro/specs/master-area/manual-test-report.md(10 件のバグ詳細)
- メモリ: project_master_area_progress.md(決定事項一式)

【背景】
master-area spec の Phase 9 手動テスト中に「1 行 = 1 (県, 市区町村) ペア」入力 UI の負荷が顕在化。1 県に複数市区町村を登録するたびに行を追加する必要があり、業界標準(タウンワーク / マイナビ等)と乖離。Pattern A 省略版で「都道府県を選ぶと市区町村ツリーが展開、複数チェック可能」に変更する。

【UI 仕様要点】
- 1 行のリストアイテム: 都道府県 Select(1 つ) + 市区町村複数チェックボックス(その県の muni 一覧から)
- 「県全域」チェックボックス独立。ON → 市区町村チェックボックス群を disable + クリア
- 1 県につき 1 行のみ(同一県を複数行追加できないバリデーション)
- 複数県を扱う場合は「県を追加」で行追加
- 件数表示: 都道府県数と総市区町村数の両方を表示(「3 県・12 市区町村」のような UX)

【DB 変換】
- 保存時: UI の「県 X + muni [a, b, c]」を `[(X,a), (X,b), (X,c)]` の 3 行に展開して既存 RPC へ
- 「県全域 ON」の場合は `[(X, NULL)]` の 1 行
- 読込時: DB の (県, muni) ペア群を県ごとに group by して UI 表示に戻す。同一県内に `(X, NULL)` と `(X, 具体的 muni)` が混在していれば `(X, NULL)` 優先で muni 群を捨てる正規化を行う

## Requirements

### Requirement 1: 新 UI 状態モデル(1 行 = 1 県 + N 市区町村)

**Objective:** As a 受注者/発注者, I want 1 県につき 1 行で複数の市区町村をまとめてチェックできる, so that 業界標準(タウンワーク/マイナビ等)と同等の操作感で対応エリアを登録できる

#### Acceptance Criteria

1. The master-area-multi-select system shall フォーム内部の UI 状態を `Array<{ prefecture: string; whole: boolean; municipalities: string[] }>` 型で保持する
2. The master-area-multi-select system shall この型を共通エクスポート(`src/components/area/types.ts` 等)で提供し、登録系 5 フォーム + 検索系 3 フォーム + AreaPicker / AreaListEditor / Zod スキーマ / DB 変換ヘルパー間で同一の型を使う(検索系は配列長 1 に制約)
3. When ユーザーがフォーム表示で対応エリア欄を開く, the master-area-multi-select system shall 1 県につき 1 行(prefecture Select + 「全域」Checkbox + 市区町村 Checkbox 群)を表示する
4. The master-area-multi-select system shall 県全域チェックボックスのラベルを「全域」(都道府県名を冠さないシンプル表記)で統一する
5. While ユーザーが prefecture を未選択(`prefecture === ""`), the master-area-multi-select system shall 「全域」Checkbox および市区町村 Checkbox 群を **非表示** にする(県を選択するまで何も表示されない)
6. When ユーザーが prefecture を選択する, the master-area-multi-select system shall 当該 prefecture に属する `master_municipalities` の active な行(`deprecated_at IS NULL`)を `sort_order` 昇順で Checkbox 群として展開表示する
7. The master-area-multi-select system shall 市区町村 Checkbox 群を 1 列または 2 列のグリッドで表示し、スマホ幅では縦 1 列、タブレット以上では 2 列でレスポンシブに切り替える
8. When ユーザーが「県を追加」ボタンを押す, the master-area-multi-select system shall `{ prefecture: "", whole: false, municipalities: [] }` の新規空行をリスト末尾に追加する
9. When ユーザーが行のゴミ箱(削除)ボタンを押す, the master-area-multi-select system shall 当該行をリストから即時削除する(確認ダイアログなし、保存ボタンが最終 commit)
10. Where 表示順序が問題になる場合, the master-area-multi-select system shall リスト内の行を追加順(末尾追加)で保持し、DB 保存時の順序は問わない
11. The master-area-multi-select system shall 登録系フォーム(AUTH-006 / COM-002 / CLI-021 / CLI-003 / CLI-004)では件数カウンター(「N 県・M 市区町村」等)を表示しない

### Requirement 2: 「全域」と「市区町村複数」の排他制約

**Objective:** As a プロダクトオーナー, I want 同一県内で「全域」と「具体的市区町村」が共存しない状態を保証する, so that 「東京都全域 + 東京都港区」のような重複登録による表示崩れ・検索ノイズを根絶できる

#### Acceptance Criteria

1. The master-area-multi-select system shall 1 つの行内で `whole = true` かつ `municipalities.length > 0` の状態を発生させない
2. When ユーザーが「全域」Checkbox を ON にする, the master-area-multi-select system shall 同行の `municipalities` を即座に空配列にクリアし、市区町村 Checkbox 群を全 OFF + visually disabled(グレーアウト)にする
3. While 「全域」が ON の行, the master-area-multi-select system shall 市区町村 Checkbox 群を **非表示にせず、グレーアウト状態で表示維持** する(ユーザーに「全域を外せば市区町村を選べる」と視覚的に予測させるため)
4. When ユーザーが「全域」が ON の行で市区町村 Checkbox を ON にしようとする, the master-area-multi-select system shall 当該 Checkbox 群を disabled にしてクリック自体を防ぐ
5. When ユーザーが市区町村 Checkbox を 1 つ以上選択した状態で「全域」を ON にしようとする, the master-area-multi-select system shall 確認なしに `municipalities` をクリアして `whole = true` に切り替える(ユーザー操作のシンプルさを優先)
6. While 行の `prefecture` が未選択, the master-area-multi-select system shall 「全域」Checkbox も disabled にする
7. If Server Action 受信時の payload に `whole = true` と `municipalities.length > 0` が同時存在する行が含まれる, the master-area-multi-select system shall Zod バリデーションでエラーとし `"エリア入力に矛盾があります(全域と市区町村は同時指定不可)"` を返す
8. The master-area-multi-select system shall この排他制約を Zod スキーマの `refine` で全エンティティ(profile / auth / client-profile / job + search filter 用)について共通実装する

### Requirement 3: 同一県の重複行禁止

**Objective:** As a プロダクトオーナー, I want 「東京都」を複数行に追加することを禁止する, so that 「東京都+港区」と「東京都+渋谷区」を別行で登録する誤用を防ぎ、1 県につき 1 行のシンプルなメンタルモデルを維持できる

#### Acceptance Criteria

1. The master-area-multi-select system shall 「県を追加」ボタンを押したときに、既にリスト内で選択済みの prefecture を新規行の prefecture Select の選択肢から除外する
2. When 行の prefecture Select を開く, the master-area-multi-select system shall 他行で既に選択されている prefecture をリスト先頭で disabled + 「(他の行で選択済み)」サフィックス付きで表示する(完全に隠さないことで誤操作の理由をユーザーに伝える)
3. If Server Action 受信時の payload に同一 prefecture を持つ行が 2 つ以上含まれる, the master-area-multi-select system shall Zod バリデーションでエラーとし `"同じ都道府県を複数登録することはできません"` を返す
4. When 既存データ読込時に DB 上の同一県ペア群を行に集約する, the master-area-multi-select system shall その県のすべての (prefecture, municipality) 行を 1 行にまとめて `municipalities` 配列に格納する
5. The master-area-multi-select system shall 同一県重複禁止チェックを登録系・検索系共通の Zod refine で実装する(ただし検索系は配列長 1 制約があるため自動的に充足)

### Requirement 4: UI → DB 変換層(保存時の平坦化)

**Objective:** As a 開発者, I want UI の集約型を既存 RPC が期待する `(prefecture, municipality)` ペア配列にロスレスで展開する, so that DB スキーマと既存 RPC を一切変更せずに新 UI を導入できる

#### Acceptance Criteria

1. The master-area-multi-select system shall `src/lib/master/area-conversion.ts` に純粋関数 `expandAreasForDb(rows: AreaRow[]): Array<{ prefecture: string; municipality: string | null }>` を提供する
2. When 行が `{ prefecture: "東京都", whole: true, municipalities: [] }`, `expandAreasForDb` shall `[{ prefecture: "東京都", municipality: null }]` を返す
3. When 行が `{ prefecture: "東京都", whole: false, municipalities: ["港区", "渋谷区", "新宿区"] }`, `expandAreasForDb` shall `[{ prefecture: "東京都", municipality: "港区" }, { prefecture: "東京都", municipality: "渋谷区" }, { prefecture: "東京都", municipality: "新宿区" }]` を返す
4. When 行が `{ prefecture: "東京都", whole: false, municipalities: [] }`(空行), `expandAreasForDb` shall 当該行を出力に含めない(空行は無視する)
5. When 行が複数県にまたがる, `expandAreasForDb` shall 各県を独立に展開し、全行の展開結果を 1 つの配列に連結する
6. The master-area-multi-select system shall Server Action(`updateProfileAction` / `registerProfileAction` / `updateClientProfileAction` / `createJob` / `updateJob`)で、Zod バリデーション通過後・既存 RPC 呼び出し直前に `expandAreasForDb` を必ず通す
7. The master-area-multi-select system shall 既存 RPC(`replace_user_areas` / `replace_job_areas` / `replace_client_recruit_areas`)の引数・戻り値を一切変更しない
8. The master-area-multi-select system shall 既存 `validateAreaChanges(newAreas, previousAreas)` の呼び出しは平坦化後の `(prefecture, municipality)` 配列に対して行う(マスタ整合性検証ロジックは無変更)

### Requirement 5: DB → UI 変換層(読込時の集約と正規化)

**Objective:** As a ユーザー, I want 既存の DB 上に登録された「県全域 + 具体市区町村」混在データを開いたときに、UI 上は矛盾のない状態(1 県 1 行、排他成立)で見られる, so that 既存ユーザーがフォームを開いた瞬間にエラーや破綻状態を見ることなく自然に再編集できる

#### Acceptance Criteria

1. The master-area-multi-select system shall 純粋関数 `collapseAreasFromDb(pairs: Array<{ prefecture: string; municipality: string | null }>): AreaRow[]` を提供する
2. When DB ペア配列に同一 prefecture が複数含まれ、その中に 1 つでも `municipality === null` が含まれる, `collapseAreasFromDb` shall 当該県を `{ prefecture, whole: true, municipalities: [] }` の 1 行に正規化し、具体的市区町村は捨てる
3. When DB ペア配列に同一 prefecture が複数含まれ、すべてが `municipality !== null`, `collapseAreasFromDb` shall 当該県を `{ prefecture, whole: false, municipalities: [<全 muni を sort_order 昇順>] }` の 1 行に集約する
4. When DB ペア配列に同一 prefecture が 1 つだけ含まれ、`municipality === null`, `collapseAreasFromDb` shall `{ prefecture, whole: true, municipalities: [] }` を返す
5. When DB ペア配列に同一 prefecture が 1 つだけ含まれ、`municipality !== null`, `collapseAreasFromDb` shall `{ prefecture, whole: false, municipalities: [municipality] }` を返す
6. The master-area-multi-select system shall 戻り値の行配列を `PREFECTURES` 定数の順序で安定ソートする
7. While ユーザーがフォームを開いた直後で「県全域 + 具体市区町村」混在による正規化が発生した, the master-area-multi-select system shall フォームの「変更があります」警告表示は **出さない**(ユーザー視点では何も変わっていないように見せる)。フォーム内部の状態は整形後の値を保持しているため、ユーザーが他の項目を編集して保存ボタンを押した際は、整形後のエリアが DB に保存される(自動 save は行わない、整形は静かに裏側で行う)
8. The master-area-multi-select system shall `collapseAreasFromDb` の単体ユニットテストを Vitest で書き、`expandAreasForDb` との往復(expand → collapse → expand)が冪等であることを検証する(ただし「県全域 + 具体 muni」混在 input は片道のみ)

### Requirement 6: Zod スキーマの書き換え(4 本 + 検索系)

**Objective:** As a 開発者, I want 全エンティティの area 入力 Server Action で同じ Zod スキーマ + refine セットを使う, so that 排他制約・同県重複禁止・件数上限のチェックが一元化されメンテナンスしやすい

#### Acceptance Criteria

1. The master-area-multi-select system shall 共通 Zod スキーマ `areaRowSchema = z.object({ prefecture: z.string().min(1), whole: z.boolean(), municipalities: z.array(z.string()) })` を `src/lib/validations/area.ts` で提供する
2. The master-area-multi-select system shall 共通 refine `areaRowsSchema = z.array(areaRowSchema).superRefine(...)` を提供し、以下を一括検証する:
   - 各行で `whole === true && municipalities.length > 0` の場合エラー(Req 2-7)
   - 各行で `whole === false && municipalities.length === 0` の場合エラー(「市区町村を 1 つ以上選択するか、全域にチェックしてください」)
   - prefecture の重複(Req 3-3)の場合エラー
3. The master-area-multi-select system shall 以下 4 ファイルの該当 Zod スキーマ定義を `areaRowsSchema` ベースに書き換える(`actions.ts` 側は schema を import するだけで、スキーマ本体は `src/lib/validations/*.ts` に存在する):
   - `src/lib/validations/auth.ts`(`registerProfileSchema.availableAreas`、L84-109)
   - `src/lib/validations/profile.ts`(`profileEditSchema.availableAreas`、L65-89)
   - `src/lib/validations/client-profile.ts`(`clientProfileSchema.recruitArea`、L60-83)
   - `src/lib/validations/job.ts`(`jobSchema.areas` / `updateJobSchema.areas`、L28-54 / L117〜)
4. The master-area-multi-select system shall 検索系フォーム(CON-002 / CON-005 / CLI-005)の URL searchParams パース層では `areaRowsSchema` を配列長 1 に制約した派生スキーマ `searchAreaRowSchema` を使う
5. The master-area-multi-select system shall 各エンティティ固有の件数上限を schema 末尾の `.refine` で追加する:
   - 案件: `expandAreasForDb` 出力長を 10 件以下に制限(既存 DB トリガー `enforce_job_areas_max` と整合)
   - 受注者・発注者: 上限なし(UI 側のソフト警告も本仕様では実装しない、master-area Req 2-7 / 3-6 の 30 件 soft cap は別検討)
6. The master-area-multi-select system shall Zod エラーメッセージを UI テキストルール(日本語、自然な語彙)に従って記述する
7. The master-area-multi-select system shall 既存テスト(`src/__tests__/master/validate-area.test.ts` 等)の期待値を新スキーマに合わせて更新する

### Requirement 7: 登録系 5 フォーム対応

**Objective:** As a ユーザー, I want 受注者対応エリア・発注者募集エリア・案件エリアのすべての入力フォームで同じ新 UI を使える, so that 画面ごとの操作感のばらつきがなくなる

#### Acceptance Criteria

1. The master-area-multi-select system shall 以下 5 フォームで `AreaListEditor`(新 UI)を組み込み、旧 1 行 1 ペア入力を完全に置き換える:
   - AUTH-006(`src/app/(auth)/register/profile/register-profile-form.tsx`、受注者新規登録の対応エリア)
   - COM-002(`src/app/(authenticated)/profile/edit/profile-edit-form.tsx`、受注者プロフィール編集の対応エリア)
   - CLI-021(`src/app/(authenticated)/mypage/client-profile/edit/client-profile-edit-form.tsx`、発注者情報の募集エリア)
   - CLI-003 / CLI-004(`src/components/jobs/job-form.tsx`、案件作成・編集の案件エリア)
2. While ユーザーが既存登録データを持つフォームを開く, the master-area-multi-select system shall サーバー側で `collapseAreasFromDb` を通した結果を defaultValues に渡し、UI に矛盾のない状態で表示する
3. The master-area-multi-select system shall フォーム内のすべての追加・削除・チェックボックス操作ボタンに `type="button"` を明示する(CLAUDE.md 「フォーム内の `<button>` には必ず `type` を明示する」ルール準拠)
4. The master-area-multi-select system shall 受注者対応エリア・発注者募集エリアのフォームでは件数カウンターも上限警告も表示しない(上限自体がない)
5. When 案件フォーム(CLI-003 / CLI-004)でユーザーが保存ボタンを押し、`expandAreasForDb` 出力長が 10 件を超える, the master-area-multi-select system shall 「エリアは最大 10 件までです。1 つ以上削除してください」エラーメッセージをトースト等で表示し、保存処理を中断する(常時カウンター UI は表示しない、事前警告も出さない)
6. The master-area-multi-select system shall 案件フォームの保存ボタンを 10 件超で disabled にしない(押した瞬間にエラーフィードバックする方式)

### Requirement 7B: 検索系 3 フォーム対応(部分的に新 UI)

**Objective:** As a ユーザー, I want 検索フォームでも登録フォームに近い操作感で複数市区町村を絞り込める, so that 登録と検索の操作モデルの乖離が減る

#### Acceptance Criteria

1. The master-area-multi-select system shall 以下 3 フォームの検索エリアフィルタを新 UI に部分的に揃える:
   - CON-002(案件検索ポップアップ): `src/app/(authenticated)/jobs/search/job-search-filter.tsx`
   - CON-005(発注者検索ポップアップ): `src/app/(authenticated)/clients/client-search-form.tsx`
   - CLI-005(受注者検索ポップアップ): `src/app/(authenticated)/users/contractors/contractor-search-filter.tsx`
2. The master-area-multi-select system shall 検索系では「都道府県 1 つ + その県内の市区町村複数チェック」までを許可し、複数県をまたぐ検索は許可しない(配列長 1 制約)
3. The master-area-multi-select system shall 検索系では「全域」チェックボックスを置かず、`municipalities` 空配列(= 該当県のすべてを含む)で「県のみ指定」を表現する
4. When ユーザーが検索系で「都道府県 1 つ + 市区町村複数」を選択する, the master-area-multi-select system shall URL searchParams を `?prefecture=東京都&municipality=港区&municipality=渋谷区&municipality=新宿区` の形式(同名キー繰返し)で表現する(既存の `tradeType` / `skillTag` / `qualification` と同じパターン、`getArrayParam()` ヘルパー再利用可)
5. When ユーザーが検索系で「都道府県のみ」を選択する, the master-area-multi-select system shall URL searchParams を `?prefecture=東京都`(`municipality` パラメータなし)で表現する
6. The master-area-multi-select system shall 既存 `buildAreaFilterIds()` の API を変更しない。代わりに、URL searchParams から取得した複数市区町村を `Array<{prefecture, municipality}>` に展開してから `buildAreaFilterIds()` を muni 個数分ループ呼び出しし、結果 ID 集合を Set 和で OR 結合する呼び出し側ロジックを、3 つの検索サーバーページ(`src/app/(authenticated)/jobs/search/page.tsx` / `src/app/(authenticated)/clients/page.tsx` / `src/app/(authenticated)/users/contractors/page.tsx`)に追加する
7. While ユーザーが検索で「東京都 + 港区・渋谷区」を指定, the master-area-multi-select system shall 結果に以下のすべてを含める: (a) 東京都港区が登録されたレコード、(b) 東京都渋谷区が登録されたレコード、(c) 東京都全域(NULL)が登録されたレコード(上位包含ルール維持。`buildAreaFilterIds()` 内部の上位包含処理を各 muni について行う仕様)
8. The master-area-multi-select system shall 検索系の都道府県プルダウンと市区町村チェックボックス群の UI コンポーネントを新規 `SearchAreaPicker`(`src/components/area/search-area-picker.tsx`、配列長 1 制約)として実装する。検索系には「全域」チェックボックスを置かず、市区町村 0 個チェック = 県のみ指定 と解釈する

### Requirement 8: ドキュメンテーションと UI 用語の統一

**Objective:** As a 開発者, I want UI 上の用語・文言を統一する, so that 画面間のユーザー体験が一貫し、将来の改修者も同じ用語を使えるようになる

#### Acceptance Criteria

1. The master-area-multi-select system shall 「全域」チェックボックスのラベルをすべての画面で「全域」(都道府県名を冠さない)に統一する
2. The master-area-multi-select system shall 「県を追加」ボタンの文言をすべての画面で統一する
3. The master-area-multi-select system shall エラーメッセージ(「同じ都道府県を複数登録することはできません」「エリア入力に矛盾があります(全域と市区町村は同時指定不可)」「市区町村を 1 つ以上選択するか、全域にチェックしてください」「エリアは最大 10 件までです。1 つ以上削除してください」)を `src/lib/validations/area.ts` または同等のメッセージ定数ファイルに集約する

### Requirement 9: 既存テストの更新と新規テスト

**Objective:** As a 開発者, I want 既存 Vitest / Playwright テストを新 UI に対応させ、新規ロジック(変換層・排他制約)に対する単体テストを追加する, so that 旧 UI 起点のテスト期待値が古いまま CI が緑のまま壊れた本番、という事態を防げる

#### Acceptance Criteria

1. The master-area-multi-select system shall `expandAreasForDb` / `collapseAreasFromDb` の Vitest 単体テストを追加する(各 5 件以上のケース: 県全域単独 / 市区町村複数 / 複数県混在 / 空行混入 / 同県重複 input)
2. The master-area-multi-select system shall `areaRowsSchema` superRefine の正常系・異常系 Vitest テストを追加する(排他違反 / 同県重複 / 件数超過 / 未完成行 のエラーパスをすべて覆う)
3. The master-area-multi-select system shall 既存 `src/__tests__/master/validate-area.test.ts` の期待値を新スキーマ(`expandAreasForDb` 後のペア配列に対する `validateAreaChanges` 呼び出し)に合わせて更新する
4. The master-area-multi-select system shall 既存 4 Server Action ユニットテストの FormData / モック入力を新 UI 状態モデル(`{ prefecture, whole, municipalities }[]`)に書き換え、`expandAreasForDb` 通過後に既存 RPC が正しい平坦化結果で呼ばれることを assert する
5. The master-area-multi-select system shall 以下 Playwright E2E ストーリーを追加または既存テストを更新する:
   - **新 UI 基本動作**: 受注者(COM-002)が「東京都全域」+「神奈川県の港区・川崎区」を新 UI で登録 → 保存 → 再表示で同状態で読み戻せる
   - **排他切替**: 受注者(COM-002)が登録済み「東京都全域」の行で「全域」をオフ → 港区・渋谷区をチェック → 保存 → 再表示で具体市区町村のみの状態
   - **発注者**: 発注者(CLI-021)が同様の登録フローで募集エリアを編集できる
   - **案件 10 件上限**: 発注者(CLI-004)で案件作成時に展開後 11 件相当を入力 → 保存ボタン押下 → 「エリアは最大 10 件までです」エラーで save 失敗
   - **既存データ正規化**: seed.sql で「東京都全域 + 東京都港区」混在を持つユーザーがフォームを開くと「東京都全域」の 1 行に正規化されて表示される
   - **検索系の複数市区町村**: 受注者(CON-002)で「東京都 + 港区・渋谷区」検索 → 港区案件・渋谷区案件・東京都全域指定案件のすべてが結果に含まれる(上位包含ルール維持の確認)
   - **AUTH-006 全項目入力 + マイページ到達**: 認証済の仮ユーザーで `/register/profile` を開き、氏名・お住まい・対応職種・対応エリア(新 UI で複数県マルチ選択)・自己紹介を入力 → 保存 → `/mypage` 到達確認
6. The master-area-multi-select system shall `e2e/profile.spec.ts` / `e2e/job-form.spec.ts` / `e2e/job-search.spec.ts` / その他エリア操作を含むテストの Playwright 操作シーケンス(チェックボックス操作 / 行追加 / 行削除)を新 UI の DOM 構造に合わせて書き換える
7. The master-area-multi-select system shall 新機能の spec-impl 開始時に既存全テスト(`npm run test` / `supabase test db` / `npm run test:e2e`)を実行し、全 PASS から着手する(CLAUDE.md 「テスト失敗時のルール」準拠)

### Requirement 10: 上位包含検索ルール・マッチング判定との互換性維持

**Objective:** As a プロダクトオーナー, I want 検索結果・マッチング判定が本仕様の前後で意味的に同じ挙動になることを保証する, so that 「UI 変更によって検索結果が変わってしまった」という回帰を防ぐ

#### Acceptance Criteria

1. The master-area-multi-select system shall `src/lib/utils/area-search-clauses.ts` の `buildAreaFilterIds()` の API(引数・戻り値)を変更しない
2. The master-area-multi-select system shall `src/lib/matching.ts` の `canApplyJob()` を変更しない(都道府県マッチのまま)
3. While 受注者が「東京都全域」を新 UI で登録, the master-area-multi-select system shall DB 上は `(東京都, NULL)` の 1 行として保存され、検索クエリの上位包含ルール(同一県の NULL レコードも県絞り込み検索結果に含める)が引き続き機能する
4. While 受注者が「東京都の港区・渋谷区」を新 UI で登録, the master-area-multi-select system shall DB 上は `(東京都, 港区)` `(東京都, 渋谷区)` の 2 行として保存され、市区町村絞り込み検索でヒットする
5. The master-area-multi-select system shall カード表示・詳細表示の各コンポーネント(`AreaList` / `AreaSummary` / `formatAreas*`)を一切変更しない
6. While ユーザーが検索系で「東京都 + 港区・渋谷区」のように複数市区町村を指定, the master-area-multi-select system shall 検索フォーム実装側で各 (prefecture, municipality) ペアを OR 結合して結果を取得する(検索ロジックの新規追加は許可、ただし上位包含ルールは各ペアについて同様に適用)

### Requirement 11: 表示コンポーネントへの影響範囲

**Objective:** As a 開発者, I want エリア表示用の共通コンポーネント(`AreaList` / `AreaSummary` / `formatAreasShort` / `formatAreasLong`)を本仕様の対象外とする, so that リファクタの blast radius を入力フォームと検索フィルタに限定できる

#### Acceptance Criteria

1. The master-area-multi-select system shall `src/components/area/area-list.tsx`(全件展開表示)を変更しない
2. The master-area-multi-select system shall `src/components/area/area-summary.tsx`(「他 N エリア」省略表示)を変更しない
3. The master-area-multi-select system shall `formatAreasShort` / `formatAreasLong` ヘルパー関数を変更しない
4. The master-area-multi-select system shall master-area Req 5-6 の「東京都全域と東京都港区が両方登録されている場合は『東京都(港区指定あり)』表示」ロジックは、DB レベルで両者が共存しなくなる(Req 2 排他制約)ため不要となるが、表示ヘルパー自体は防御的に残す
5. The master-area-multi-select system shall 表示結果が見た目上変わる箇所は「既存データで両者混在していたユーザーがフォーム保存し直したタイミング以降」に限定され、それ以外のユーザーには影響を与えない

### Requirement 12: 既存データの正規化方針(本番運用前なので一括マイグレーション不要)

**Objective:** As a 運用者, I want ビジ友が本番運用前の状態であることを利用して、既存データの一括マイグレーションを実施せず、seed.sql の整備だけで対応する, so that マイグレーション設計・テスト・実行のコストを 0 に抑える

#### Acceptance Criteria

1. The master-area-multi-select system shall 既存データに対する一括 SQL マイグレーションを実施しない
2. The master-area-multi-select system shall seed.sql のテストデータから「県全域 + 具体的市区町村」混在ケースを排除する(Req 9 で検証する「既存データ正規化」テストケースを除く。当該テスト用 seed は意図的に混在状態を仕込む)
3. While `collapseAreasFromDb` が混在データを検出した場合, the master-area-multi-select system shall 県全域優先の正規化を行った状態で UI に表示する(防御コード、本番運用後に admin が直接 INSERT 等で混在を作った場合の保険)
4. When ユーザーが正規化後フォームを保存(他項目変更含む)する, the master-area-multi-select system shall 正規化後の状態を `expandAreasForDb` 経由で既存 RPC に投げ、DB を県全域 1 行のみに上書きする
5. The master-area-multi-select system shall 本番運用開始後に混在データが発生した場合の集計クエリ例を `.kiro/specs/master-area-multi-select/design.md` に記載する(必要時に admin が手動実行できるようにする)

### Requirement 13: 完了後の運用フロー(master-area Phase 9 続行)

**Objective:** As a 開発者, I want 本仕様の実装完了をトリガーに、停止していた master-area Phase 9 手動テストの残シナリオ(D〜J)を新 UI で再開し、Phase 9 全体を完了させる, so that master-area / master-area-multi-select の両 spec が同時に [x] 化される

#### Acceptance Criteria

1. The master-area-multi-select system shall 実装完了後に `npm run test` / `supabase test db` / `npm run test:e2e` の全 3 コマンドが PASS することを確認する
2. When 自動テスト全 PASS が確認される, the master-area-multi-select system shall `.kiro/specs/master-area/manual-test-report.md` に記録された UX 起因バグ 4 件(B1〜B4)が新 UI で解消されていることを目視で確認し、`manual-test-report.md` に「解消(master-area-multi-select Phase X で対応)」を追記する
3. When 残バグ確認が完了する, the master-area-multi-select system shall master-area Phase 9 シナリオ D〜J(残 7 シナリオ)を新 UI で手動実行し、結果を `manual-test-report.md` に追記する
4. The master-area-multi-select system shall AUTH-006(エリア入力を含む受注者新規登録フォーム)を中心とした Playwright E2E を追加する(`e2e/auth-signup.spec.ts` または既存 auth テストへの追加)。範囲は「認証済仮ユーザーで `/register/profile` を開く → 全項目入力(エリアは新 UI で複数県マルチ選択を含む) → 保存 → `/mypage` 到達確認」までとし、AUTH-001〜005 のメール認証フローは含まない
5. When Phase 9 全シナリオ完了 + AUTH-006 E2E 追加が完了する, the master-area-multi-select system shall `.kiro/specs/master-area/tasks.md` の §9 を `[x]` にチェックし、`.kiro/specs/master-area-multi-select/tasks.md` の全タスクも `[x]` にする
6. The master-area-multi-select system shall 完了確認後にメモリ `project_master_area_progress.md` を「Phase 9 完了」状態に更新する

### Requirement 14: ドキュメント・周辺 spec の更新

**Objective:** As a 開発者, I want CLAUDE.md と関連 steering の記述を新 UI 仕様に合わせて更新する, so that 将来の改修者が「1 行 = 1 ペア」だった旧仕様のメンタルモデルで新 UI を破壊するのを防げる

#### Acceptance Criteria

1. The master-area-multi-select system shall CLAUDE.md の「対応エリア・募集エリアの設計(master-area)」セクションを以下のポイントで更新する:
   - 入力 UI は `AreaListEditor` の「1 行 = 1 県 + N 市区町村 / または県全域」モデル
   - 検索 UI は `SearchAreaPicker`(配列長 1 制約)の「1 県 + その県内 muni 複数チェック」モデル
   - 共通 UI 部品として `AreaRow`(`src/components/area/area-row.tsx`)を経由する
   - DB 構造は変わらず `(prefecture, municipality)` ペアの集合
   - UI ↔ DB 間に `expandAreasForDb` / `collapseAreasFromDb` の純粋関数を必ず通す
   - 同県重複・排他制約・件数上限のチェックは共通 Zod スキーマ `areaRowsSchema` で実装
   - 「全域」チェックのラベルは「全域」で統一(都道府県名を冠さない、登録系のみ。検索系には全域チェックなし)
   - 案件フォームの 10 件上限は保存時のみエラー表示(常時カウンター UI なし)
   - 検索 URL の muni は同名キー繰返し形式(`?municipality=A&municipality=B`)
2. The master-area-multi-select system shall `.kiro/steering/design-rule.md` または `.kiro/steering/design-system.md` に新 UI コンポーネント(`AreaListEditor` / `SearchAreaPicker` / `AreaRow`)の利用ルールを追記する
3. The master-area-multi-select system shall master-area の関連 spec(`.kiro/specs/master-area/requirements.md` / `design.md` / `tasks.md`)に「UI 改修(別 spec master-area-multi-select で実施完了)」のクロスリファレンスを追加する(過去形ではなく完了済み記述。phase 番号は当該 spec の現状に合わせる)
4. The master-area-multi-select system shall 本仕様完了後にメモリ `project_master_area_progress.md` を更新し、`AreaListEditor` / `SearchAreaPicker` / `AreaRow` の新モデルを次セッション以降の作業者が把握できる状態にする

## Non-Goals

本仕様の対象外:

- **DB スキーマ変更**: `user_available_areas` / `job_areas` / `client_recruit_areas` のカラム構成は変えない。`(prefecture, municipality)` ペア構造を保持
- **既存 RPC 変更**: `replace_user_areas` / `replace_job_areas` / `replace_client_recruit_areas` の API を一切変更しない
- **マッチング判定の市区町村化**: 都道府県マッチのまま据え置き(`src/lib/matching.ts` 変更しない)
- **`buildAreaFilterIds()` の API 変更**: 既存検索クエリビルダーは無変更。複数市区町村 OR 検索は呼び出し側でループする
- **表示コンポーネント変更**: `AreaList` / `AreaSummary` / `formatAreas*` は無変更
- **複数県をまたぐ検索 UI**: 検索系は「県 1 つ + その県内 muni 複数」までに限定。複数県またぐ検索は対応しない
- **既存データの一括 SQL マイグレーション**: 本番運用前のため不要。seed.sql 整備で対応
- **マスタデータ(`master_municipalities`)変更**: master-skills と同じ運用パターンを踏襲、追加・廃止は別途
- **AUTH-001〜005 全通し E2E**: メール認証・パスワード設定等の認証フロー全体テストは別 spec(auth)の責任範囲。本仕様では AUTH-006 を中心とした登録フォーム E2E のみ追加
- **件数カウンター UI**: 受注者・発注者・案件すべてのフォームでカウンター表示なし。案件のみ保存時にエラー
- **30 件 soft cap 警告**: master-area Req 2-7 / 3-6 で実装済みの 30 件 soft cap 警告 UI(`area-list-editor.tsx` の `softCapWarning` props)は、本仕様の新 UI で **削除する**(警告メッセージ自体を新 UI に持ち越さない。業界事例的にも少数派の機能、上位包含検索ルールで実害も小さい。必要時は別タスクで再導入)
- **検索 URL のブックマーク互換性**: 本仕様で検索 URL の searchParams 形式が変わる(`?municipality=A` → `?municipality=A&municipality=B` の同名キー繰返し)が、本番運用前のため旧 URL の互換性は維持しない

## 関連 spec

- `.kiro/specs/master-area/` — 親仕様。DB スキーマ・RPC・検索クエリ・マッチング判定・表示コンポーネントの定義元。本仕様は **UI 層と Server Action 前段の変換ロジック + 検索フォームの部分的 UI 改修** を差し替える派生 spec
- `.kiro/specs/master-skills/` — マスタテーブル設計・`MasterCombobox` パターンの参照元(master-area 経由)

## 関連ファイル

実装影響範囲(事前棚卸し済み):

### 新規追加
- `src/components/area/types.ts`(新規、`AreaRow` 型の共通エクスポート)
- `src/components/area/area-row.tsx`(新規、1 県分の UI 部品: prefecture Select + 全域 Checkbox + muni Checkbox 群。登録系の 1 行と検索系の単独行で共有)
- `src/components/area/search-area-picker.tsx`(新規、検索系 3 フォーム用。配列長 1 制約、全域 Checkbox なし、muni 0 個チェック = 県のみ指定)
- `src/lib/master/area-conversion.ts`(新規、`expandAreasForDb` / `collapseAreasFromDb`)
- `src/lib/validations/area.ts`(新規、`areaRowSchema` / `areaRowsSchema` / `searchAreaRowSchema`)
- `src/__tests__/master/area-conversion.test.ts`(新規)
- `src/__tests__/validations/area.test.ts`(新規)
- `e2e/auth-signup.spec.ts`(新規、AUTH-006 を含む登録フロー E2E)

### 全面書き換え
- `src/components/area/area-list-editor.tsx`(143 行、新 UI モデルへリライト。内部で `AreaRow` 部品を複数並べる構成)

### 削除
- `src/components/area/area-picker.tsx`(106 行、`AreaRow` + `SearchAreaPicker` 新設で役割が分割されるため廃止。既存 import 全 8 箇所を置き換えてから削除)

### 部分変更(Zod スキーマ + Server Action 内変換差し込み)
- `src/app/(auth)/register/profile/actions.ts`
- `src/app/(authenticated)/profile/edit/actions.ts`
- `src/app/(authenticated)/mypage/client-profile/edit/actions.ts`
- `src/app/(authenticated)/jobs/actions.ts`

### フォーム側の defaultValues + UI 組み込み調整
- `src/app/(auth)/register/profile/register-profile-form.tsx`
- `src/app/(authenticated)/profile/edit/profile-edit-form.tsx`
- `src/app/(authenticated)/mypage/client-profile/edit/client-profile-edit-form.tsx`
- `src/components/jobs/job-form.tsx`

### 検索フォーム書き換え(新規スコープ)
- `src/app/(authenticated)/jobs/search/job-search-filter.tsx`(CON-002)
- `src/app/(authenticated)/clients/client-search-form.tsx`(CON-005)
- `src/app/(authenticated)/users/contractors/contractor-search-filter.tsx`(CLI-005)

### テスト期待値更新
- `src/__tests__/master/validate-area.test.ts`
- 既存 Vitest テスト(各 Server Action 単体テスト)
- 既存 Playwright テスト(`e2e/profile.spec.ts` / `e2e/job-form.spec.ts` / `e2e/job-search.spec.ts` / その他エリア操作を含むテスト)

### サーバーページ調整(URL searchParams 読み取り + buildAreaFilterIds OR ループ追加)
- `src/app/(authenticated)/jobs/search/page.tsx`(L70-71、`sp.municipality` を `getArrayParam` で複数取得)
- `src/app/(authenticated)/clients/page.tsx`(L42-43、同様)
- `src/app/(authenticated)/users/contractors/page.tsx`(L46-47 / L112-115、同様)

### 変更しないファイル
- `src/components/area/area-list.tsx`(詳細画面の全件展開表示)
- `src/components/area/area-summary.tsx`(カード省略表示)
- `src/lib/utils/area-search-clauses.ts`(`buildAreaFilterIds()` 本体は無変更、呼び出し側ループ実装は上記サーバーページ側に追加)
- `src/lib/matching.ts`(都道府県マッチのまま)
- `src/lib/master/validate-area.ts`(validateAreaChanges は無変更、ただし平坦化後の `AreaTuple[]` で呼び出すよう Server Action 側を調整)
- `src/lib/master/fetch.ts`(getActiveMunicipalities 等は無変更)
- すべての DB マイグレーション
