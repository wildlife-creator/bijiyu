# Implementation Plan

## 概要

本実装計画は `master-area` 仕様（住所粒度の市区町村化 + 既存スキーマからの一気移行 + 7 画面入力 / 3 画面検索 popup / 12+ 表示箇所の刷新）の作業を 9 フェーズに分割する。`master_municipalities` 1,898 件マスタ投入と新 3 テーブル化（`job_areas` / `client_recruit_areas` / `user_available_areas.municipality` 追加）を一気に切り替え、後方互換コードは持ち込まない。各フェーズは前フェーズの完了を前提とし、フェーズ内の独立タスクには `(P)` を付与して並列実行可能であることを示す。

`design.md` の Migration Strategy（Phase 1〜8）とフェーズ番号を一致させ、最後に手動テスト確認フェーズ（Phase 9）を追加する。マッチング判定（`src/lib/matching.ts`）は都道府県のまま据え置く（Req 7）。個人住所 `users.prefecture` は据え置く（Req 9）。

新規依存: なし（`cmdk` / shadcn / Radix UI は master-skills で導入済み）。

---

- [x] 0. 既存テストの全実行とデグレード確認
  - 着手前に `npm run test` / `supabase test db` / `npm run test:e2e` を順に実行し、すべて pass することを確認する
  - 失敗があれば原因を調査・修正してから Phase 1 に進む。修正の根本原因が「他機能でも再発しうる」場合は CLAUDE.md の「過去のバグから学んだルール」セクションに学びを追記する
  - E2E 起動前提: `supabase start` + `supabase db reset` + `npm run dev`
  - _Requirements: 12.5_

- [x] 1. DB スキーマ整備 + マスタ投入 + 既存データ DML 移行（Migrations 1〜3）
  - 本仕様では **マスタ管理専用の admin UI は作成しない**（Req 1.6）。マスタの追加・廃止は SQL マイグレーションで手動管理する。総務省データの定期自動同期も提供しない（Req 1.9、必要時に手動マイグレーション）
- [x] 1.1 マスタ素材から SQL INSERT 文を生成するスクリプト
  - `scripts/build-master-municipalities-inserts.ts` を新規実装し、`tmp/master-area-research/municipalities.xlsx` または `municipalities.csv` を読み込み `INSERT INTO master_municipalities (prefecture, municipality, sort_order) VALUES ...` を生成する
  - **sort_order の算出（必ず守ること）**: `municipalities.csv` の実体は Unicode コードポイント順にソートされた 1,898 行（先頭は「三重県, いなべ市」）であり、**総務省団体コード順ではない**。Req 1.5 を満たすため、以下のいずれかの方式で並べ替えてから sort_order を付与する:
    - 方式 A（推奨）: 元データ `municipalities.xlsx`（総務省「全国地方公共団体コード」の団体コード列を含む）を `xlsx` (SheetJS) パッケージで読み込み、団体コード昇順でソートしてから sort_order を 1〜1,898 で連番付与する
    - 方式 B（フォールバック）: CSV を読み込んだ後、`src/lib/constants/options.ts` の `PREFECTURES` 定数（既存・47 都道府県を総務省コード順で定義）の index で主ソート、市区町村は xlsx の団体コード or 五十音順で副ソート（厳密な団体コード順ではないが UI 表示上の許容範囲）
  - 都道府県・市区町村ともに trim 済み・空除外済みである前提で読み込み、政令指定都市本体 20 件（横浜市・大阪市・名古屋市・札幌市・京都市・神戸市・福岡市・北九州市・広島市・仙台市・千葉市・さいたま市・静岡市・浜松市・新潟市・岡山市・熊本市・相模原市・堺市・川崎市）が含まれていないこと（行政区 171 件のみ）を assertion で確認する
  - 東京都の島嶼部の村（青ヶ島村・小笠原村・利島村等 8 村）を含むことを assertion で確認する
  - 都道府県別件数の assertion: 北海道 194 / 富山県 15 / 東京都 62（research.md 既知値、ローダ正常性確認）
  - 末尾に `ON CONFLICT (prefecture, municipality) DO NOTHING` を付与し再投入時の衝突を無視する
  - 素材ファイル自体はリポジトリに保全し、生成 SQL は migration ファイルに直接埋め込む（DB 自己完結性）
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.9_

- [x] 1.2 master_municipalities テーブル作成 + RLS + 1,897 件投入（Migration 1）
  - 最小スキーマ `(id uuid PK, prefecture text NOT NULL, municipality text NOT NULL, sort_order integer NOT NULL, deprecated_at timestamptz NULL, created_at, updated_at, UNIQUE(prefecture, municipality))` で作成する
  - `(sort_order)` 単独 B-tree、`(prefecture, municipality) WHERE deprecated_at IS NULL` の部分 B-tree インデックスを張る
  - 既存 `update_updated_at()` トリガーを付与する
  - RLS を有効化し「anon + authenticated は SELECT 全開、INSERT/UPDATE/DELETE はマイグレーション（service_role）のみ」のポリシーを設定する
  - 1.1 の生成 SQL を埋め込み **1,897 行** を `deprecated_at = NULL` で投入する（CSV 1,898 行から `(北海道, 泊村)` 重複 1 ペア除外、詳細は research.md §5.1）
  - 末尾に `RAISE NOTICE` で件数を出力し、1,897 を確認可能にする
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 11.1_

- [x] 1.3 (P) job_areas / client_recruit_areas 作成 + user_available_areas 拡張 + RPC + トリガー + RLS（Migration 2）
  - `job_areas (id, job_id FK → jobs ON DELETE CASCADE, prefecture NOT NULL, municipality NULL, created_at)` を作成する
  - `client_recruit_areas (id, client_id FK → client_profiles(user_id) ON DELETE CASCADE, prefecture NOT NULL, municipality NULL, created_at)` を作成する
  - `user_available_areas` の既存重複行（`(user_id, prefecture)` 重複）を最古行（最小 id）のみ残して dedupe してから `municipality text NULL` カラムを追加し、`UNIQUE NULLS NOT DISTINCT (user_id, prefecture, municipality)` 制約を付ける
  - 3 テーブルに `(prefecture, municipality)` 複合 B-tree、`job_areas (job_id)` / `client_recruit_areas (client_id)` の親 ID B-tree を張る
  - RLS を有効化し、`job_areas` は親 `jobs.owner_id = auth.uid()` OR `is_same_org(auth.uid(), jobs.organization_id)` 経由、`client_recruit_areas` は `client_id = auth.uid()` のみ書き込み可、`user_available_areas` は既存ポリシー維持で書き込み可とする
  - SELECT は 3 テーブルとも認証ユーザー全員可（マッチング・検索のため）
  - `enforce_job_areas_max` トリガー（AFTER INSERT、`SET search_path = public`）で `job_id` あたり 10 件超を `RAISE EXCEPTION` でブロックする
  - `replace_user_areas(p_user_id, p_areas jsonb)` / `replace_job_areas(p_job_id, p_areas jsonb)` / `replace_client_recruit_areas(p_client_id, p_areas jsonb)` の 3 RPC を SECURITY INVOKER + `SET search_path = public` で定義し、DELETE old + INSERT new を 1 トランザクションで行う
  - **既存 all-in-one RPC `complete_registration` / `update_profile` のシグネチャは Migration 2 では変更しない**。シグネチャ変更は Server Action 書き換えと密結合のため、Phase 4.5 で Server Action 修正と同時に行う想定（Task 4.5 参照）。Phase 1.3 単独で RPC を破壊的変更すると Phase 1〜3 間で既存 `completeRegistrationAction` が型エラーで停止する中間状態を作るため避ける
  - 1.2 とは別テーブル変更のため並列実行可能（依存関係は Migration 1 完了のみ）
  - _Requirements: 2.1, 2.2, 3.2, 4.2, 4.4, 4.5, 8.1, 8.8, 8.9, 11.2, 11.3, 11.4_

- [x] 1.4 既存データの DML 移行（Migration 3）
  - **移行前の prefecture 表記揺れ検出**: Migration 3 の冒頭で `DO $$` ブロックで以下を実行し、規定外の prefecture 値があれば `RAISE NOTICE` で警告する（CLAUDE.md メモリ「マスタ移行時は DB 全件 NOT IN クエリで検証」既存ルール）:
    - `SELECT DISTINCT prefecture FROM jobs WHERE prefecture IS NOT NULL AND prefecture NOT IN ('北海道','青森県',...,'沖縄県')` で typo 検出
    - 同様に `client_profiles.recruit_area`（unnest して各要素）と `user_available_areas.prefecture` でも検証
    - 規定外の値があった場合は手動修正 or `WHERE prefecture IN (...)` で除外して移行する判断を `RAISE NOTICE` で促す
  - `INSERT INTO job_areas (job_id, prefecture, municipality) SELECT id, prefecture, NULL FROM jobs WHERE prefecture IS NOT NULL AND length(trim(prefecture)) > 0` で既存案件を `municipality = NULL` の県全域 1 行として移行する
  - `INSERT INTO client_recruit_areas (client_id, prefecture, municipality) SELECT user_id, area, NULL FROM client_profiles, unnest(recruit_area) AS area WHERE recruit_area IS NOT NULL AND array_length(recruit_area, 1) > 0` で配列を 1 行ずつに展開して移行する
  - `user_available_areas.municipality` は 1.3 の ADD COLUMN で全行 NULL になっているため追加 DML 不要
  - 末尾の `DO $$ ... RAISE NOTICE` で `job_areas` / `client_recruit_areas` / `user_available_areas` 件数を出力し、移行前の `jobs.prefecture` / `client_profiles.recruit_area` 件数と一致することを確認可能にする
  - 旧カラム `jobs.prefecture` / `client_profiles.recruit_area` は Migration 3 の段階では残す（Migration 4 で DROP）
  - 移行後の既存案件・ユーザー（市区町村未指定状態）は Phase 2 の `buildAreaFilterIds` 上位包含ルールで取りこぼしなく検索ヒットする前提
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6_

- [x] 1.5 Database 型再生成と型エラーの解消
  - `supabase gen types typescript --local > src/types/database.ts` を実行し、`master_municipalities` / `job_areas` / `client_recruit_areas` の新テーブルと `user_available_areas.municipality` を反映する
  - Task 1.2 / 1.3 / 1.4 の完了後に実施する
  - この時点ではアプリコードはまだ旧スキーマを参照しているため、`jobs.prefecture` / `client_profiles.recruit_area` の型は残っており TS エラーは発生しない（Phase 4 の書き換え時に gen types を再実行）
  - _Requirements: 8.1_

- [x] 2. Lib 層実装（マスタ取得・検証・表示・検索・マッチング拡張）
- [x] 2.1 マスタ取得 API 拡張 + `master-area` キャッシュタグ
  - `src/lib/master/fetch.ts` に `getActiveMunicipalities()`（全件 active のみ）、`getActiveMunicipalitiesByPrefecture(prefecture)`（in-memory フィルタの薄ラッパー）、`getAllMunicipalityRows()`（deprecated 含む全件、廃止判定用）の 3 関数を追加する
  - すべて `unstable_cache` で TTL 3600s、tag `'master-area'` でキャッシュする（master-skills の `'master-skills'` タグとは独立）
  - 内部は cookieless anon client（`supabase/anon.ts` の `createAnonClient`）を使用し、`createServerClient` は使わない
  - SELECT 失敗時は空配列フォールバックで返す（呼び出し側 UI で Combobox を disabled 表示）
  - マスタ更新 SQL マイグレーション後に `revalidateTag('master-area')` を手動実行する手順をマイグレーションファイルの末尾コメントに明記する
  - **dev 環境での手動テスト時の注意**: `unstable_cache` はファイル永続化されるため、マスタ更新後に開発サーバを再起動するだけではキャッシュが残る。手動テスト時は `.next/dev/cache/fetch-cache` を削除してから動作確認すること（CLAUDE.md 既存ルール）
  - 並び順は `sort_order` 昇順（総務省団体コード順、Req 1.5）を保証する
  - _Requirements: 1.5, 10.1, 10.2, 10.3_

- [x] 2.2 マスタ整合性検証ユーティリティ `validate-area.ts`
  - `src/lib/master/validate-area.ts` を新規追加し、`(prefecture, municipality)` のタプルで delta 検証する `validateAreaChanges(newAreas, previousAreas)` を実装する
  - `municipality === null` は「県全域」として常に valid（マスタ照合不要、prefecture が 47 都道府県のいずれかであることだけ別途 `isKnownPrefecture()` で軽量チェック）
  - `added = newAreas - previousAreas` の差分のみを active 必須でチェックし、`previousAreas` に含まれていた deprecated は保持を許可する（master-skills の `validateLabelChanges` と同セマンティクス）
  - 戻り値は `{ valid: true } | { valid: false, unknownPairs, deprecatedPairs }` の判別ユニオン型
  - 内部は `getAllMunicipalityRows()` の `unstable_cache` を使った in-memory チェック（追加 DB ラウンドトリップなし）
  - Server Action 4 件（COM-002 / register profile / CLI-021 / job 編集）で「保存直前 SELECT → validateAreaChanges → 結果反映」を強制する想定
  - _Requirements: 2.10, 3.7, 4.9_

- [x] 2.3 (P) エリア表示ヘルパー `format-areas.ts`
  - `src/lib/utils/format-areas.ts` を新規追加し、`formatAreas(areas, options)` でエリア配列を表示文字列に整形する
  - 単一エリアの表示ルール: `municipality === null` → `「{prefecture}（市区町村未指定）」`、`municipality !== null` → `「{prefecture}{municipality}」`（連結、Req 5.1）
  - 同県の県全域 + 市区町村混在（例: 「東京都」+「東京都港区」）→ `「東京都（港区ほか）」` のような混在吸収表現（Req 5.6、列挙は max 2 件まで + 「ほか」）
  - `maxVisible` を超える場合は末尾に `「他 N エリア」`（Req 5.3、カードは default 3）
  - `formatAreasShort(areas)`（カード用、maxVisible=3）と `formatAreasLong(areas)`（詳細画面用、全件展開）の 2 ショートカットを export する
  - 入力 0 件で空文字 `""` を返し、fallback 文言は呼び出し側の責務とする
  - 重複（同一 prefecture + municipality）は内部で dedupe する
  - 2.4 / 2.5 とは別ファイルで独立しているため並列実行可能
  - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_

- [x] 2.4 (P) 検索クエリビルダー `area-search-clauses.ts`
  - `src/lib/utils/area-search-clauses.ts` を新規追加し、`buildAreaFilterIds({ entity, prefecture, municipality, supabase })` で上位包含ルール適用済みの parent_id 集合を返す
  - `entity` は `"job" | "client" | "user"` のいずれかで、それぞれ `job_areas` / `client_recruit_areas` / `user_available_areas` を対象とする
  - 「prefecture のみ指定（municipality = null）」は同県内の全レコードを返す（市区町村未指定・指定済みすべて、Req 6.1）
  - 「prefecture + municipality 指定」は `prefecture = ? AND (municipality = ? OR municipality IS NULL)` で上位包含する（Req 6.2）
  - 「prefecture = null」は無絞り込みとして `null` を返し、呼び出し側で `.in('id', ids)` をスキップする合図とする
  - クエリは `SELECT DISTINCT parent_id FROM <area_table> WHERE ...` で実装し、`count: 'exact'` とページネーションの破綻を回避する（CLI-005 の ID-intersection パターン準拠、post-filter は使わない）
  - 異なる都道府県のレコードを絶対にヒットさせないこと（R6 ガード）
  - 2.3 / 2.5 とは別ファイルで独立しているため並列実行可能
  - _Requirements: 6.1, 6.2, 6.5, 6.6_

- [x] 2.5 `matching.ts` 拡張 + 既存テスト並行更新
  - `src/lib/matching.ts` の `canApplyJob` の入力シグネチャを `jobPrefecture: string` から `jobPrefectures: string[]` に拡張し、配列 OR 一致で判定する（`jobPrefectures.some(p => userAvailableAreas.some(a => a.prefecture === p))`）
  - **判定ロジックは都道府県マッチのまま据え置き**（Req 7）、`municipality` フィールドは入力に含めず、`userAvailableAreas` でも `municipality` カラムが追加されても prefecture のみ参照する
  - `isPaidUser === true` は無条件 canApply（既存挙動維持）、staff ロールの拒否も維持する
  - `jobPrefectures.length === 0` は拒否（Req 4.5 で 1 案件最低 1 件のため通常発生しないが防御）
  - **同コミットで `src/__tests__/job-search/can-apply-job.test.ts` の `jobPrefecture: ...` 4 箇所（line 9 / 27 / 78 / 88、実測）を `jobPrefectures: [...]` に置換する**（シグネチャ変更直後に CI が失敗するのを防ぐ）
  - **アプリ層の呼び出し元 3 ファイル**（`src/app/(authenticated)/jobs/search-actions.ts:118` / `src/app/(authenticated)/jobs/[id]/page.tsx:423` / `src/app/(authenticated)/jobs/[id]/apply/page.tsx:83`、実測値。`grep -rn "jobPrefecture\s*:" src/` で再確認）は Phase 4 で本格書き換え（`job_areas.prefecture` 配列 SELECT に置換）するため、Phase 2 では `[job.prefecture]` で配列化する暫定パッチを当てて型エラーを回避する
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.9_

- [ ] 3. UI 共通部品 4 種実装（AreaPicker / AreaListEditor / AreaList / AreaSummary）
- [ ] 3.1 AreaPicker（都道府県 + 市区町村の 2 段プルダウン、単一行）
  - 都道府県は 47 件固定の shadcn `<Select>`（cmdk 不要）、市区町村は選択都道府県でフィルタした候補を `MasterCombobox`（master-skills 既存）に渡す
  - 都道府県未選択時は市区町村側を `disabled` にする（Req 2.4 / 6.4）
  - 市区町村は任意（未選択 = `null` = 「県全域」のセマンティクス、Req 2.5 / 3.4 / 4.7）
  - 都道府県を変更すると `municipality` を `null` にリセットして不整合を防ぐ
  - props で受け取る `municipalitiesByPrefecture: Record<string, string[]>` は Server Component で取得して JSON シリアライズで注入する
  - 検索ポップアップと入力フォームの両方で共用する
  - 値の型は `AreaDraft = { prefecture: string | null; municipality: string | null }`（「未選択ドラフト」状態を表現）
  - placeholder に「市区町村は任意（県全域でも検索可）」と明示する
  - _Requirements: 2.3, 2.4, 3.3, 6.3, 6.4, 10.4_

- [ ] 3.2 AreaListEditor（`useFieldArray` ベースの動的エリア行管理）
  - 行ごとに `AreaPicker` を表示、右上「×」で行削除、最下部に「+ エリアを追加」ボタンを配置する
  - props で `minItems` / `maxItems` / `softCapWarning` を受け取り、削除ボタンは `minItems` 件数到達時 disabled、追加ボタンは `maxItems` 到達時 disabled + tooltip「最大 N 件まで」とする
  - **`<form>` 内に配置されるため、削除ボタン・追加ボタンは必ず `type="button"` を明示する**（CLAUDE.md「フォーム内の `<button>` には必ず `type` を明示する」既存ルール準拠。type 無指定だと暗黙的に submit となり、意図せずフォーム送信が発火する）
  - `softCapWarning` を超えた時点で「対応エリアが多すぎると絞り込み効果が薄れます」等の警告メッセージを inline 表示する（受注者対応 / 発注者募集の soft cap、Req 2.7 / 3.6）
  - 初期 `value.length === 0` のときは内部で空 1 行を自動追加する（minItems = 1 を満たす）
  - 値の型は `AreaDraft[]`（prefecture が null の行を許容）、保存時に Zod の `.refine` または `.filter` で prefecture 空行を除外して `AreaTuple[]` に絞り込む
  - SP / PC 共に縦並び（`flex flex-col gap-3`、行内も `flex flex-col gap-2`）で実装する
  - 親フォームは react-hook-form の `useFieldArray` で AreaDraft[] を直接管理する
  - **廃止市区町村の編集表示**: 既存登録に含まれる廃止市区町村（`master_municipalities.deprecated_at IS NOT NULL`）は行として保持を許可し、市区町村ラベルに「（廃止）」サフィックスを付与表示する。保存時はサフィックスを除去して素のラベルで `validateAreaChanges` に渡す（master-skills の `applyDeprecatedSuffix` / `stripDeprecatedSuffix` パターン準拠、Req 1.8）
  - 検索画面では使わない（検索は単発 AreaPicker のみ）
  - _Requirements: 1.8, 2.7, 3.6, 4.4, 4.5, 4.6, 10.5_

- [ ] 3.3 (P) AreaList（詳細画面の全件展開表示）
  - `AreaList` を新規実装し、`AreaForDisplay[]` を `formatAreasLong(areas)` で `<p>` に表示する
  - 0 件で `emptyLabel`（default `「エリア未設定」`）を表示する
  - 詳細画面 6 種（CON-003 / CLI-002 / CLI-006 / COM-001 / CON-006 / CLI-020）+ メッセージスレッド等で使用する想定
  - 3.4 とは別コンポーネントで独立しているため並列実行可能（共通依存は Phase 2 の `format-areas.ts` のみ）
  - _Requirements: 5.4_

- [ ] 3.4 (P) AreaSummary（カード共通の「主要 3 件 + 他 N エリア」省略表示）
  - `AreaSummary` を新規実装し、`AreaForDisplay[]` を `formatAreasShort(areas)` で `<span>` に表示する
  - default `maxVisible = 3`、4 件以上で末尾「他 N エリア」省略表記、0 件で `emptyLabel` を表示する
  - 案件カード（CON-002 等）、職人カード、発注者カード、マイリスト、スカウト情報カード等で使用する想定
  - 3.3 とは別コンポーネントで独立しているため並列実行可能
  - _Requirements: 5.3, 5.5_

- [ ] 4. 入力 7 画面・Server Actions 5 個・表示 12+ 箇所の一斉書き換え
  - **dev 環境での動作確認の前提（必ず守ること）**: dev 環境では `supabase db reset` 時に Migration 3（DML 移行）が空の jobs / client_profiles に対して実行されるため 0 件移行となる。さらに Phase 5（seed.sql 新スキーマ対応）完了まで seed は旧スキーマのまま `jobs.prefecture` に値を入れ続けるため、Phase 4 完了時点では `job_areas` / `client_recruit_areas` / `user_available_areas.municipality` がすべて空。**Phase 4 単独では「検索 0 件 / 応募ボタン disabled / エリア表示空」が正常な中間状態**であり、コード不具合と誤診断しないこと。E2E / 手動動作確認は Phase 5 完了後に行う。本フェーズは Vitest 単体 + 型チェック（`npm run test` / `npm run build`）の通過を完了基準とする
- [ ] 4.1 受注者プロフィール入力（AUTH-006 / COM-002）
  - AUTH-006（新規会員登録情報入力）の現状 Checkbox 47 件グリッド UI を `AreaListEditor` Popup 形式に統一して COM-002 と同形式に揃える（Req 2.8）
  - COM-002（プロフィール編集）の対応エリア入力を `AreaListEditor` ベースに差し替える
  - `useFieldArray` で `availableAreas: AreaDraft[]` を管理し、Zod スキーマは `z.array(z.object({prefecture: z.string().min(1, "都道府県を選択してください"), municipality: z.string().nullable()})).min(1)` で空行を弾く
  - Server Component 側で `getActiveMunicipalitiesByPrefecture` を都道府県ごとに取得して `municipalitiesByPrefecture` を構築し props で渡す
  - 「東京都全域」と「東京都港区」の同時登録を許可する（Req 2.9、UNIQUE NULLS NOT DISTINCT 制約と整合）
  - **AUTH-006 / COM-002 の「お住まい」フィールドは単一プルダウン（都道府県のみ）のまま維持する**（個人住所、Req 9）
  - `users.prefecture` を変更しないこと（Req 9.1、コード変更ゼロ）
  - soft cap = 30 件を超えた場合の警告表示を有効化する
  - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 9.1, 9.2, 9.3, 10.5_

- [ ] 4.2 (P) 発注者情報編集入力（CLI-021）
  - CLI-021（発注者情報編集）の募集エリア入力を `AreaListEditor` ベースに差し替える
  - フォーム state は `recruitArea: AreaDraft[]` で管理し、submit 時に Zod refine で `AreaTuple[]` に絞り込む
  - 4.1 / 4.3 / 4.4 とは異なる入力フォームのため並列実行可能（共通依存は Phase 3 の UI 部品と Phase 2 の lib のみ）
  - soft cap = 30 件警告を有効化する
  - 都道府県プルダウンと連動した市区町村複数選択 popup を提供する
  - _Requirements: 3.3, 3.4, 3.5, 3.6, 10.5_

- [ ] 4.3 (P) 案件編集・新規作成入力（CLI-003 / CLI-004）
  - CLI-003（募集現場編集）/ CLI-004（募集現場新規登録）のエリア入力を `AreaListEditor` ベースに差し替える（minItems=1 / maxItems=10）
  - 県跨ぎを許可する（Req 4.3）。1 案件で「東京都港区」+「神奈川県横浜市港北区」のような複数都道府県登録を可能にする
  - 「+ エリアを追加」ボタンは 10 件到達時 disabled + tooltip 表示（Req 4.4）
  - 「市区町村未指定」（municipality = null）を選択可能にし、`「現場未定」「複数現場（詳細別途連絡）」` 等のセマンティクスを持たせる（Req 4.7）
  - **CLI-004 既存の「勤務地」自由入力テキストフィールド（`jobs.address text(200)`）を維持し、番地以下の詳細住所入力用フィールドとして共存させる**（Req 4.8、Migration 4 で DROP しないこと）
  - 下書き保存時のバリデーション（`jobDraftSchema` / `jobSchema` の使い分け）は既存パターンを踏襲し、下書き時は areas が空でも保存を許可する
  - 4.1 / 4.2 / 4.4 とは異なる入力フォームのため並列実行可能
  - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 10.5_

- [ ] 4.4 (P) 検索 popup 3 画面（CON-002 / CON-005 / CLI-005）
  - CON-002（案件検索 popup）/ CON-005（発注者検索 popup）/ CLI-005（職人検索 popup）の検索条件に都道府県プルダウン + 市区町村プルダウン（任意）の階層フィルタを `AreaPicker` で提供する
  - 検索状態は URL `searchParams` の Single Source of Truth とする（例: `?prefecture=東京都&municipality=港区`）。`useState` は使わない（ブラウザ戻る・共有・ブックマーク対応、Req 6.7）
  - Server Component で `buildAreaFilterIds` を呼び parent_id 候補集合を取得し、メインクエリに `.in('id', candidateIds)` で渡す（CLI-005 の ID-intersection パターン準拠）
  - 既存の post-filter（JS 側 fetch 後絞り込み）パターンを使わない（Req 6.6、`count` とページネーション破綻の防止）
  - 複数フィルタ（職種 × エリア × 言語等）と組み合わせる場合は各フィルタの ID 集合の積を取って `.in('id', intersect)` で渡す
  - 都道府県未選択時は市区町村プルダウンを disabled とする（Req 6.4）
  - 4.1 / 4.2 / 4.3 とは異なるファイル群のため並列実行可能
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 10.5_

- [ ] 4.5 Server Actions 5 個の書き換え（profile / register profile / client-profile / jobs / search-actions）+ 既存 RPC の signature 更新マイグレーション
  - **追加マイグレーション**: 本タスク冒頭で新規マイグレーション（例: `YYYYMMDDhhmmss_master_area_update_complete_registration_signature.sql`）を作成し、`complete_registration` RPC の `p_areas text[]` を `p_areas jsonb` に変更する。内部 `INSERT INTO user_available_areas SELECT gen_random_uuid(), p_user_id, unnest(p_areas)` を `INSERT ... SELECT gen_random_uuid(), p_user_id, (elem->>'prefecture')::text, NULLIF(elem->>'municipality', '') FROM jsonb_array_elements(p_areas) AS elem` に置き換える。`DROP FUNCTION ... text[] ...; CREATE OR REPLACE FUNCTION ... jsonb ...` の順で実行する。SECURITY DEFINER + auth.uid() チェックは維持。**この migration を本タスクと同じコミットで landing させる**ことで Phase 1〜3 中の中間状態を回避する
  - **追加マイグレーション適用後の型再生成（必ず実施）**: 上記マイグレーション landing 後に `supabase db reset` + `supabase gen types typescript --local > src/types/database.ts` を再実行する。これで `Database['public']['Functions']['complete_registration']['Args']` の `p_areas` 型が `string[]` から `Json`（jsonb）に更新され、Server Action 側で `AreaTuple[]` を `p_areas` にそのまま渡す際の TS 型チェックが通る（Supabase JS SDK が JS array → jsonb 変換を自動で行う）
  - **register profile（all-in-one RPC 経由）**: `(auth)/register/profile/actions.ts` の `completeRegistrationAction` は更新後の `complete_registration` RPC に `availableAreas: AreaTuple[]` を**そのまま JS array として** `p_areas: areaTuples` の形で渡す（Supabase JS SDK が jsonb への変換を自動で行う。既存 `p_skills: skillsJsonb` と同じパターン。`JSON.stringify` は不要）。1 トランザクション内で users + skills + qualifications + user_available_areas（新スキーマ municipality 付き）を一括更新する。新規登録ルートなので previousAreas は空配列、`validateAreaChanges` は新規追加分のみ active 必須チェック
  - **profile（direct query + `replace_user_areas` RPC の 2 段）**: `profile/edit/actions.ts` の `updateProfileAction` は既存実装が **direct query** で `user_available_areas` を更新しているため（all-in-one RPC は使っていない）、area 部分のみ `replace_user_areas(p_user_id, p_areas jsonb)` RPC 呼び出しに置き換える。保存直前に `user_available_areas` を SELECT → `validateAreaChanges` → `replace_user_areas` 呼び出しの順序。それ以外のフィールド（users / user_skills / user_qualifications）は既存の direct query パターンを継続
  - **client-profile（direct upsert + `replace_client_recruit_areas` RPC の 2 段）**: `mypage/client-profile/actions.ts` の `saveClientProfileAction` は all-in-one RPC を持たないため、(1) `client_profiles` の通常カラムを direct upsert、(2) `replace_client_recruit_areas(p_client_id, p_areas jsonb)` を別途呼ぶ。`p_client_id` は `client_profiles.user_id`（UNIQUE 制約付き、billing migration で追加済み）を渡す
  - **jobs（direct upsert + `replace_job_areas` RPC の 2 段）**: `jobs/actions.ts` の `createJobAction` / `updateJobAction` を `prefecture: string` から `areas: AreaTuple[]` に変更（Zod で `min(1) max(10)`）、(1) `jobs` 通常カラムを upsert、(2) `replace_job_areas(p_job_id, p_areas jsonb)` を呼ぶ。`enforce_job_areas_max` トリガー違反は catch して `「案件のエリアは最大 10 件までです」` を返す
  - `jobs/search-actions.ts` の `applyJobAction` を `job.prefecture` 単一 SELECT から `job_areas.prefecture` の DISTINCT 配列 SELECT に変更し、`canApplyJob({ jobPrefectures: [...] })` に渡す。**ロール許可は `'contractor'` / `'client'` のみ（`'staff'` は拒否）**を維持する（CLAUDE.md「Staff の受注者アクション制限」既存ルール）
  - **RPC 第 1 引数の安全性**: `p_user_id` は `(await supabase.auth.getUser()).data.user.id` 由来のみ渡す。`p_job_id` / `p_client_id` は Server Action 内で所有確認済み（`owner_id = auth.uid()` OR `is_same_org`）の ID のみ渡す。FormData / URL params 由来の値は信頼しない
  - エラー戻り値は既存の `{ success: false, error: <日本語> }` パターンに合わせる
  - **トランザクション境界の注意**: profile / client-profile / jobs の「direct upsert + replace_*_areas RPC の 2 段」は 1 トランザクションではない（Supabase JS の制約）。最悪ケースでは「ユーザー基本情報は保存されたがエリアは未保存」状態になる可能性があるが、master-area の area 編集系では area 単独再保存で回復可能なため許容する
  - _Requirements: 2.1, 2.10, 3.1, 3.2, 3.7, 4.1, 4.2, 4.4, 4.9, 7.1, 8.1, 8.5_

- [ ] 4.6 表示 12+ 箇所を AreaList / AreaSummary に置換
  - 詳細画面（CON-003 案件詳細 / CLI-002 案件管理 / CLI-006 ユーザー詳細 / COM-001 プロフィール詳細 / CON-006 発注者詳細 / CLI-020 発注者ホーム）の `job.prefecture` / `client_profiles.recruit_area` / `user_available_areas` 表示を `<AreaList />` に置換する
  - カード（CON-002 ジョブカード `components/job-search/job-list-card.tsx`、職人カード、発注者カード、マイリスト CON-007、スカウト情報カード `components/messaging/scout-info-card.tsx`、メッセージスレッド `applications/orders/[id]/page.tsx`）を `<AreaSummary />` に置換する
  - **対象ファイル数の実測（着手時に再 grep で再確認）**: `grep -rln "job\.prefecture\b" src/` 約 17 ファイル + `grep -rln "recruit_area" src/` 約 8 ファイル + `user_available_areas` 経由のファイル群を一括で書き換える（手書きで `slice(0, 3).join('、')` を残さない）
  - **廃止市区町村の表示ルール**: 既存登録ユーザー / 案件が廃止市区町村（`master_municipalities.deprecated_at IS NOT NULL` 該当）を保持している場合、`<AreaList />` / `<AreaSummary />` でも素のラベルを表示する（編集画面のみ「（廃止）」サフィックス、Req 1.8）
  - 受注者の対応エリアで「東京都全域」+「東京都港区」が両方登録されている場合は `formatAreas` が「東京都（港区指定あり / ほか）」のような混在吸収表現で表示する（Req 5.6）
  - 該当画面ごとに Server Component で `job_areas` / `client_recruit_areas` / `user_available_areas` を SELECT し、配列を `<AreaList />` / `<AreaSummary />` に渡す
  - _Requirements: 1.8, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [ ] 4.7 Vitest 既存テスト期待値更新
  - 4.1〜4.6 の書き換えに伴い影響を受ける既存 Vitest テストの期待値を `AreaTuple[]` 形式 / `<AreaList />` / `<AreaSummary />` ベースに更新する
  - 既存テストファイルを `npm run test` で全件実行し、緑になるまで修正する
  - **モックの注意**: Server Action 自体を `vi.mock` で差し替えてはならない。Supabase クライアントをモックし、`{ data, error }` の戻り値形状を正確に再現する。`vi.clearAllMocks()` 後の `mockReturnValueOnce` 漏れに注意（CLAUDE.md 既存ルール）
  - Phase 7 の新規テストはこのタスクの対象外（Phase 7 で追加）
  - _Requirements: 12.2, 12.3_

- [ ] 5. seed.sql 全面更新（新スキーマ対応）
  - **書き換え対象を限定する**: 旧 `jobs.prefecture` / `client_profiles.recruit_area` / `user_available_areas` 周辺のみを変更する。`identity_verified` / `ccus_verified` / `email_confirmed_at` / `password_set_at` / 既存テストユーザーの招待状態（CLAUDE.md「招待フロー seed の `email_confirmed_at` は NULL を正とする」ルール）等の他フラグは温存し、関連 E2E をデグレさせない
  - 旧 `INSERT INTO jobs (..., prefecture, ...)` を `INSERT INTO jobs (...)` + `INSERT INTO job_areas (...)` のペアに書き換える
  - 旧 `INSERT INTO client_profiles (..., recruit_area, ...)` を `INSERT INTO client_profiles (...)` + `INSERT INTO client_recruit_areas (...)` に書き換える
  - 既存 `INSERT INTO user_available_areas` を `(user_id, prefecture, municipality)` 3 カラム版に書き換える
  - テストユーザー分配（research.md R4 準拠、実装時に seed.sql 内の **既存ユーザー名**で読み替える）:
    - `contractor@test.local`（実在）: 対応エリア 東京都+神奈川県（県のみ）
    - `contractor2@test.local`（実在）: 対応エリア 東京都港区+東京都新宿区（市区町村あり）
    - `client@test.local`（実在）: 募集エリア 東京都港区+大阪府大阪市北区
    - **法人プラン Owner**（research.md は `client-corp-owner@test.local` と記載しているが seed.sql に未在。実在の `corp-comp@test.local` を法人 Owner の代表として使用する。同 user_id `b1110000-0000-1000-8000-000000000005` の organization に対する `client_recruit_areas`）: 募集エリア 東京都全域+神奈川県横浜市港北区
    - その他既存テストユーザー（`client2@test.local` / `contractor3@test.local` / `contractor4@test.local` / `staff-admin@test.local` 等）は県のみで初期化
  - 案件 seed も「県のみのレコード」と「市区町村まで指定したレコード」「県跨ぎ案件（job_areas 2 件以上）」「エリア 4 件以上の案件（"他 N エリア" 省略表示確認用）」を含める
  - この段階で `supabase db reset` を流し、Phase 1〜4 の状態が新 seed で再現できることを確認する（旧カラムは Phase 6 まで残るため `supabase db reset` は通る前提）
  - _Requirements: 8.7, 12.4_

- [ ] 6. Migration 4（旧カラム DROP）+ supabase gen types
  - Migration 4 ファイルを新規追加: `jobs.prefecture` / `client_profiles.recruit_area` の `DROP COLUMN`、旧 `idx_jobs_search (status, prefecture)` を DROP して `(status)` のみで再作成
  - **`jobs.address text(200)` は DROP しないこと**（CLI-004 番地以下の詳細住所用、Req 4.8）
  - **`users.prefecture` は DROP しないこと**（個人住所、Req 9.1）
  - `supabase db reset` で全 migrations を流し、Phase 5 の seed.sql が新スキーマで通ることを確認する
  - `supabase gen types typescript --local > src/types/database.ts` を再実行し、旧カラム参照のコードが残っていれば **TypeScript ビルドエラー** で即検知する
  - `npm run build` が通ることを Phase 4 の書き換え完全性の証明とする
  - 移行後の既存案件・ユーザー（市区町村未指定状態）は Phase 2 の上位包含ルールで市区町村絞り込み検索でも結果に含まれる（Req 8.6）
  - _Requirements: 8.5, 8.6, 8.8_

- [ ] 7. テスト網羅（Migration 検証 + pgTAP RLS + Vitest 単体・統合 + Playwright E2E）
- [ ] 7.0 Migration 検証クエリ
  - `SELECT count(*) FROM master_municipalities` が 1,897 を返すこと（Migration 1 投入確認、research.md §5.1 参照）
  - `SELECT count(*) FROM master_municipalities WHERE municipality IN ('横浜市','大阪市','名古屋市','札幌市','京都市','神戸市','福岡市','北九州市','広島市','仙台市','千葉市','さいたま市','静岡市','浜松市','新潟市','岡山市','熊本市','相模原市','堺市','川崎市')` が 0 を返すこと（政令指定都市本体 20 件不在の確認、Req 1.2）
  - Migration 3 後の `job_areas` / `client_recruit_areas` 件数が seed 案件・発注者の旧カラム件数と一致すること（DML 移行の対称性確認、Req 8.2 / 8.3）
  - Migration 4 後に `\d jobs` / `\d client_profiles` で `prefecture` / `recruit_area` カラムが存在しないこと
  - `\di idx_jobs_search` が `(status)` 単独で再構築されていること（Req 8.8）
  - これらは `supabase test db` 内のヘルパー SQL もしくは `scripts/verify-master-area-migration.sql` として保存し、CI で実行可能にする
  - _Requirements: 1.2, 8.1, 8.2, 8.3, 8.5, 8.8_

- [ ] 7.1 (P) pgTAP RLS テスト 3 テーブル
  - `supabase/tests/` 配下に `master_area_rls.sql` を新規追加し、`master_municipalities` / `job_areas` / `client_recruit_areas` / `user_available_areas` の RLS を検証する
  - 検証項目:
    - anon が `SELECT master_municipalities` 可能（1,898 行返る）
    - authenticated が `INSERT/UPDATE/DELETE master_municipalities` 拒否（throws_ok ではなく実データ不変を `is()` で検証、CLAUDE.md ルール）
    - owner 自身が `INSERT job_areas` 成功
    - 他人が `INSERT job_areas` 拒否（サイレントブロック、件数不変を `is()` で確認）
    - owner 自身が 11 件目 `INSERT job_areas` でトリガー違反（`RAISE EXCEPTION` を `throws_ok` で確認）
    - 法人組織メンバーが組織所有 job の `job_areas` 書き込み可（`is_same_org` 経由）
    - owner 自身が `INSERT client_recruit_areas` 成功 / 他人は拒否
    - user 自身が `INSERT user_available_areas (municipality)` 成功 / UNIQUE NULLS NOT DISTINCT 違反で `unique_violation`
  - **pgTAP テスト内の UUID は seed.sql と重複させない**（CLAUDE.md 既存ルール）
  - 7.2 / 7.3 と独立しているため並列実行可能
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 12.1_

- [ ] 7.2 (P) Vitest 単体・統合テスト
  - `formatAreas`: 0 件 / 県のみ / 県+市 / 同県混在（「東京都港区」+「東京都」）/ 異県複数 / 4 件超省略 / NULL municipality 表示の各ケース
  - `validateAreaChanges`: added のみ active 必須、既存保有 deprecated 保持、unknown 検出、空 previousAreas（新規登録）、`municipality: null` 常 valid の各ケース
  - `canApplyJob`（拡張）: `jobPrefectures` 配列 OR 一致、paid bypass、空配列拒否、staff 拒否、`municipality` 無視の各ケース
  - `AreaPicker`: 都道府県変更で municipality リセット、disabled 状態、候補絞り込み
  - `AreaListEditor`: min=1 で最後の 1 件削除不可、max=10 で追加不可、30 件 soft cap 警告表示、空配列で初期 1 行追加
  - `buildAreaFilterIds`: prefecture のみ / prefecture+municipality / null 返却（無絞り込み）/ 空配列（マッチなし）/ NULL municipality を含むレコード対応
  - 統合テスト: `updateProfileAction` / `completeRegistrationAction` / `saveClientProfileAction` / `createJobAction` / `updateJobAction` / `applyJobAction` の正常系 + 異常系（マスタ整合性違反、上限超過、必須欠落）
  - **モックのルール**: Server Action 自体を `vi.mock` で差し替えない。Supabase クライアントをモックし `{ data, error }` 形状を正確に再現する。`mockReset()` を明示し `clearAllMocks` の `mockReturnValueOnce` 漏れを防ぐ（CLAUDE.md 既存ルール）
  - 7.1 / 7.3 と独立しているため並列実行可能
  - _Requirements: 12.2, 12.3_

- [ ] 7.3 Playwright E2E 12 シナリオ
  - 既存全 spec の検索フォーム操作を `AreaPicker` 用 2 段クリックパターン（`getByLabel().click()` → `getByRole('option').click()`）に書き換える（shadcn Select 操作、CLAUDE.md 既存ルール）
  - E2E シナリオ（design.md Testing Strategy 12 シナリオ）:
    - 受注者が COM-002 で「東京都港区」「神奈川県全域」を登録 → 保存 → COM-001 で表示確認
    - 発注者が CLI-021 で募集エリア 3 件登録 → CLI-020 で表示確認
    - 発注者が CLI-004 で県跨ぎ 2 件登録 → 公開 → CON-002 で検索ヒット
    - 受注者が CON-002 で「東京都のみ」検索 → 「東京都港区」案件と「東京都全域指定」案件の両方ヒット（上位包含）
    - 受注者が CON-002 で「東京都 + 港区」検索 → 「東京都港区」+「東京都全域」案件ヒット、「東京都新宿区」案件はヒットしない
    - 受注者が CON-005 で「神奈川県」検索 → 神奈川県募集の発注者ヒット
    - 発注者が CLI-005 で「東京都港区」検索 → 東京都対応の受注者ヒット（上位包含）
    - 無料受注者が「東京都対応」のみ登録 → 「東京都港区」案件にも応募ボタン活性化（都道府県マッチ維持確認）
    - 案件カードでエリア 4 件以上のとき「他 N エリア」省略表示
    - 対応エリア 30 件超で UI 警告表示（soft cap 確認）
    - 案件エリア 10 件超で「+ エリアを追加」ボタン disabled
    - 廃止市区町村: admin で 1 件 `deprecated_at` 設定 → 既存保有ユーザーの編集画面で「（廃止）」表示、新規登録時に候補から消える
  - 直接 `page.goto` だけでなく、主要ストーリーは「ログイン → マイページ → メニュー → 画面到達」まで click で繋ぐ（CLAUDE.md 既存ルール）
  - 7.1 / 7.2 完了後に実施（shadcn Select 操作の変更が広範囲に及ぶため、ユニットテストの安定を確認してから着手）
  - _Requirements: 12.4_

- [ ] 8. ドキュメント波及更新
- [ ] 8.1 CLAUDE.md「実装時の必須チェック項目」に追記
  - マッチング判定は都道府県のまま。`src/lib/matching.ts` を市区町村レベルに引き上げてはならない（Req 7.4）
  - 検索クエリは上位包含ルールに従う（市区町村絞り込みでも同県全域指定を含める）
  - 個人住所 `users.prefecture` は市区町村化しない（プライバシー）
  - 新規エリア入力 UI は `AreaPicker` / `AreaListEditor` 共通コンポーネントを利用すること
  - エリア表示は `<AreaList />` / `<AreaSummary />` 経由で行い、手書きで `slice(0, 3).join('、')` を散らさない
  - `jobs.address`（番地以下の詳細住所）は `job_areas`（エリア）と別管理。DROP しないこと
  - _Requirements: 13.1_

- [ ] 8.2 (P) steering 更新（database-schema.md / design-system.md）
  - `.kiro/steering/database-schema.md` を新スキーマに合わせて更新する: `master_municipalities` / `job_areas` / `client_recruit_areas` の説明追加、`users.prefecture` 据え置きの注記、`client_profiles.recruit_area` カラム削除の反映、`jobs.prefecture` カラム削除の反映、`jobs.address` 保持の注記
  - `.kiro/steering/design-system.md` または `.kiro/steering/design-rule.md` に階層プルダウン UI コンポーネント（`AreaPicker` / `AreaListEditor`）の使用ルールを追記する
  - 8.1 / 8.3 と独立しているため並列実行可能
  - _Requirements: 13.2, 13.3_

- [ ] 8.3 (P) 関連 spec の波及更新（matching / job-search / job-posting / profile / billing / organization）
  - `.kiro/specs/matching/` の記述で「都道府県」前提の箇所を「都道府県+市区町村」に更新し、応募制限は都道府県のまま据え置きである旨を明記する
  - `.kiro/specs/job-search/` の検索フィルタ仕様を `AreaPicker` 階層フィルタ + 上位包含ルールに更新する
  - `.kiro/specs/job-posting/` の案件エリア入力を「1 案件最大 10 件・県跨ぎ可能・全域 NULL 表現」に更新する
  - `.kiro/specs/profile/` の受注者対応エリア入力を市区町村対応に更新する
  - `.kiro/specs/billing/`（または該当する spec）で発注者情報・募集エリアの記述を `client_recruit_areas` 正規化に合わせて更新する
  - `.kiro/specs/organization/` の `client_profiles` 関連記述で `recruit_area` カラム削除に言及する箇所があれば追記更新する（CLI-021 発注者情報編集の input は `client_recruit_areas` 経由になった旨）
  - master-skills の Phase 10〜11 と同じ進め方（過去形・歴史的記録として残す部分との区別）に従う
  - 8.1 / 8.2 と独立しているため並列実行可能
  - **デザインカンプ（`design-assets/screens/` の PNG）はこのフェーズで更新せず、本仕様の実装完了後にまとめて差し替える**（Req 13.5、実装中は ASCII モック等で都度確認）
  - _Requirements: 13.4, 13.5_

- [ ] 9. 手動テスト + 発見バグ修正
  - `supabase start` + `supabase db reset` + `npm run dev` でローカル環境を起動し、ブラウザで以下を手動確認する:
    - AUTH-006 で受注者新規登録 → 対応エリアを「東京都港区」+「神奈川県全域」で登録 → COM-001 で表示確認
    - COM-002 で対応エリアを編集・追加・削除 → 30 件超で警告表示が出ること
    - CLI-021 で発注者募集エリアを編集 → CLI-020 で表示確認
    - CLI-003 / CLI-004 で案件作成 → 県跨ぎ 2 件登録 → 公開 → CON-002 検索でヒット
    - CON-002 で「東京都のみ」検索・「東京都 + 港区」検索の両ケースで上位包含が効くこと
    - CON-005 / CLI-005 検索 popup の階層フィルタが機能すること
    - 無料受注者で「東京都港区」案件の応募ボタンが活性化すること（都道府県マッチ維持）
    - 案件エリア 11 件目の追加が disabled になること、サーバ側もトリガーで拒否されること
    - 廃止市区町村のユーザー編集画面で「（廃止）」サフィックス表示、新規登録候補から除外されること
  - 発見したバグを修正し、修正の根本原因が「他機能でも再発しうる」場合は CLAUDE.md の「過去のバグから学んだルール」セクションに学びを追記する
  - 手動テストレポート（バグ一覧 + 修正内容）を `.kiro/specs/master-area/manual-test-report.md` に記録する（master-skills と同形式）
  - 最後に `npm run test` / `supabase test db` / `npm run test:e2e` を全件実行し、全 pass を確認する
  - _Requirements: 12.5_
