# Research / Gap Analysis (Light Version)

> 軽量版ギャップ分析。要件 1〜13 すべてを網羅する詳細な Requirement-to-Asset Map は省略し、設計時に決断が必要な A/B/C 選択肢、工数見積もり、Research Needed を中心に整理する。
> 影響範囲の棚卸し・master-skills パターンの確認は spec-requirements 段階で実施済み(`requirements.md` 末尾の「関連ファイル」セクション参照)。

---

## 1. 設計時に決断すべき A/B/C 選択肢

### 決断 1: 階層プルダウン UI コンポーネントの実装方針

要件: Req 10-4 / Req 10-5(7 画面で共通利用)

| 案 | 概要 | メリット | デメリット |
|---|------|---------|----------|
| **A. `MasterCombobox` 拡張** | 既存単階層 Combobox に階層オプションを追加 | ファイル数最少、API 統一 | 既存マスタ(skill_tags等)と AreaPicker の関心が混ざる |
| **B. 新規 `AreaPicker` 作成**(推奨) | 都道府県プルダウン + 市区町村プルダウンの 2 段構成専用コンポーネント | 関心分離、テスト容易、既存 MasterCombobox に影響なし | 新規ファイル 1〜2 個 |
| **C. ハイブリッド** | `AreaPicker` の内部で `MasterCombobox` を 2 つ並べる | 表面的に分離、内部は再利用 | 内部実装が複雑、デバッグしづらい |

**推奨: B**。階層概念が単階層マスタと意味的に違うため、独立コンポーネントが妥当。

### 決断 2: マスタキャッシュの粒度

要件: Req 10-1 / Req 10-2

| 案 | 概要 | メリット | デメリット |
|---|------|---------|----------|
| **A. 全件 1 キャッシュ**(推奨) | `getActiveMunicipalities()` で 1,898 件全部を 1 度に取得・キャッシュ、UI 側で都道府県別フィルタ | リクエスト 1 回、シンプル | 初回 fetch が重い(数百 KB)、未使用の県のデータも持つ |
| **B. 都道府県別キャッシュ** | `getActiveMunicipalitiesByPrefecture(prefecture)` で 47 エントリの個別キャッシュ | 必要な県だけメモリに載る | キャッシュタグ管理が 47 倍に増える |
| **C. ハイブリッド** | サーバー側は B、クライアント側は A | 過剰 | 過剰 |

**推奨: A**。1,898 件 × text 数十 byte ≒ 200 KB 程度なので 1 度の fetch で問題なし。`unstable_cache` + `'master-area'` タグ無効化もシンプル。

### 決断 3: 案件動的エリア追加 UI のフォーム実装

要件: Req 4-6

| 案 | 概要 | メリット | デメリット |
|---|------|---------|----------|
| **A. `useFieldArray` (react-hook-form)**(推奨) | 既存プロジェクト標準パターンを継承 | バリデーション統合、既存 job-form と整合 | useFieldArray の学習コスト(軽微) |
| **B. 自前 useState で配列管理** | シンプル実装 | 自由度高い | Form 統合が手間、バリデーションを自作 |
| **C. 外部ライブラリ** (react-sortable-hoc 等) | ドラッグ並び替えできる | 過剰機能 | 依存追加 |

**推奨: A**。既存の `profile-edit-form.tsx` 等で react-hook-form を多用しており、整合性が高い。

### 決断 4: マイグレーション分割戦略

要件: Req 8-1

| 案 | 概要 | メリット | デメリット |
|---|------|---------|----------|
| **A. 1 ファイル巨大マイグレーション** | 全変更を 1 トランザクションで実施 | atomic、ロールバック確実 | 失敗時の原因特定が難しい、レビューしづらい |
| **B. 3〜4 ファイル段階分割**(推奨) | (i) マスタ作成 + シード → (ii) 新テーブル + データ移行 → (iii) 旧カラム削除 → (iv) インデックス再構築 | レビューしやすい、トラブルシュート容易、master-skills と同じ進め方 | 順序ミスのリスク |
| **C. B + ロールバック専用 SQL** | B に加えて移行戻し用スクリプトを用意 | 保守的 | 運用負荷増、ローカル開発では不要 |

**推奨: B**。master-skills が Phase A / Phase B 分割をしていたので踏襲。

### 決断 5: マスタの初期シードの投入方法

要件: Req 1-2

| 案 | 概要 | メリット | デメリット |
|---|------|---------|----------|
| **A. SQL ファイルに 1,898 行を直書き**(推奨) | マイグレーションファイル内に `INSERT INTO ... VALUES (...), (...), ...;` を 1,898 行 | 完全自動、再現性◎ | マイグレーションファイルが巨大化(200KB 程度) |
| **B. CSV を読み込む SQL 関数で投入** | `COPY` コマンドで CSV 取り込み | ファイルサイズ抑制 | CSV ファイルの配置場所管理、Supabase 環境での `COPY` 互換性確認必要 |
| **C. アプリ側スクリプトで投入** | Node.js スクリプトで INSERT | ファイル分離可 | マイグレーション外運用、CI でも実行必要 |

**推奨: A**。master-skills も同パターン。マイグレーションファイルの肥大化は許容範囲。CSV は `tmp/master-area-research/municipalities.csv` を SQL 生成スクリプトで変換。

---

## 2. Requirement ごとの工数 / リスク見積もり

| Req | 内容(要約) | Effort | Risk | 根拠 |
|-----|------------|--------|------|------|
| 1 | マスタ管理 | **S** (1〜3日) | Low | master-skills 完全踏襲。シード生成スクリプト + マイグレーション |
| 2 | 受注者対応エリア | **M** (3〜7日) | Low | 4 画面(AUTH-006 / COM-002 / + CLI-005 検索)のフォーム改修、AreaPicker 利用 |
| 3 | 発注者募集エリア | **S** (1〜3日) | Low | 1 画面のみ(CLI-021)、テーブル正規化込み |
| 4 | 案件複数エリア | **M** (3〜7日) | Medium | 動的エリア UI 新パターン、useFieldArray、最大 10 件制約 |
| 5 | 表示統一 | **S** (1〜3日) | Low | `formatAreas()` 1 関数 + 8 箇所更新 |
| 6 | 上位包含検索 | **M** (3〜7日) | Medium | EXISTS クエリ + 3 画面の検索 popup 改修 + URL searchParams |
| 7 | マッチング維持 | **S** (1日) | Low | コード変更なし、E2E テストで動作確認のみ |
| 8 | 既存データ移行 | **M** (3〜7日) | Medium | 段階マイグレーション、旧カラム削除、seed.sql 全面更新 |
| 9 | 個人住所スコープ外 | **S** (0.5日) | Low | 文書化のみ、コード変更なし |
| 10 | マスタ取得・キャッシュ・UI | **M** (3〜5日) | Low | AreaPicker 新規実装 + キャッシュ + 7 画面に組込 |
| 11 | RLS ポリシー | **S** (1〜2日) | Low | 3 テーブル × 各ポリシー、pgTAP テスト |
| 12 | テスト | **M** (3〜5日) | Medium | E2E 7 シナリオ + Vitest + pgTAP の網羅 |
| 13 | ドキュメント波及 | **S** (1〜2日) | Low | CLAUDE.md / steering / 5 spec の文言更新 |
| **合計** | | **L (10〜18 営業日 ≒ 2〜3.5 週間)** | **Medium** | 既存パターン延長中心。影響範囲が広いが新規技術はなし |

**全体 Risk が Medium である理由**:
- 既存データ移行(Req 8)の旧カラム削除のタイミング判断
- 7 画面 × 8 表示箇所と影響範囲が広いため、テストで漏れがあると本番で気づく
- 動的エリア UI(Req 4)の useFieldArray パターンが新規

これらは master-skills の経験(2 週間で完了)で確立できているため、対処可能。

---

## 3. Research Needed(設計フェーズで詰める項目)

| # | 項目 | 何を決める必要があるか |
|---|------|---------------------|
| R1 | 階層プルダウン popup のレイアウト | 都道府県プルダウン + 市区町村プルダウンを縦並びか横並びか、SP(モバイル)での挙動 |
| R2 | 動的エリア追加 UI の SP 表示 | モバイルで「現場 1 / 現場 2 / …」を縦に並べた時の余白・削除ボタン配置 |
| R3 | 「県内全域」と「特定区」混在時の表示優先 | Req 5-6 の「東京都(港区指定あり)」表現の具体形式 |
| R4 | seed.sql のテストユーザー再設計 | 既存 8 テストユーザー(contractor@test.local 等)のうち、どのユーザーが市区町村まで持ち、どのユーザーが県のみか配分 |
| R5 | 政令市本体検索の挙動 | 「横浜市」が選択肢にない(マスタには区しかない)ため、検索フィルタで「横浜市」を入力する手段をどう提供するか(または提供しないか) |
| R6 | 上位包含の例外ルール | 例: 「東京都」で検索した時、神奈川県横浜市港北区案件はヒットしないが、千葉県松戸市案件もヒットしない、を明示 |

これらは spec-design で具体化する。spec-requirements の範囲では「上位包含ルールに従う」までで十分。

---

## 4. 推奨される設計フェーズの進め方

上記決断 1〜5 を踏まえて、`spec-design` 段階では以下の順序で設計書を組み立てる:

1. **アーキテクチャ概観** — マスタテーブル + 別テーブル正規化 + AreaPicker コンポーネントの全体図
2. **DB スキーマ詳細** — `master_municipalities` / `job_areas` / `client_recruit_areas` のカラム定義、インデックス、RLS ポリシー
3. **マイグレーション分割計画** — Phase A〜D の SQL ファイル構成
4. **`AreaPicker` コンポーネント仕様** — Props、内部状態、SP/PC レスポンシブ
5. **検索クエリビルダー** — `EXISTS` サブクエリの実装パターン、URL searchParams のエンコード
6. **データ移行手順** — 既存 `jobs.prefecture` → `job_areas` の SQL、seed.sql 更新案
7. **Server Action のシグネチャ変更** — 影響範囲の API 仕様
8. **テスト戦略** — E2E 7 シナリオの粒度、Vitest 範囲、pgTAP 範囲
9. **段階リリース戦略**(該当なし) — 後方互換切り替えなしの一気移行のため、段階リリースは不要

---

## 5. 結論

- **総工数**: L (約 2〜3.5 週間)
- **総リスク**: Medium(管理可能)
- **設計時の主要決断**: 5 件(うち推奨案明示)
- **要追加調査**: 6 件(spec-design で詰める)

master-skills の経験を踏襲できるため、難易度は中程度で進められる見込み。

---

## 6. Design Phase Decisions（spec-design 2026-05-19 確定）

spec-design 開始時点で section 1 の A/B/C 推奨案 5 件を確定方針として採用。さらに section 3 の Research Needed R1〜R6 を以下のとおり決着させる。

### 6.1 Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 別テーブル正規化（採用） | `job_areas` / `client_recruit_areas` / `user_available_areas (municipality 追加)` の 3 テーブルで `(prefecture, municipality)` を 1 行ずつ持つ | 1 案件複数現場・県跨ぎ・全域 NULL を素直に表現。`EXISTS` で上位包含クエリが書きやすい。RLS は親リソースに連動 | テーブル数増、結合クエリのオーバーヘッド | requirements.md 事前合意 |
| `text[]` 配列継続 | `jobs.prefecture` を `jobs.areas text[]` 化、要素は `"東京都|港区"` の合成文字列 | テーブル追加なし、`overlaps` で検索可 | NULL municipality の表現が崩れる、配列要素のスキーマレス、上位包含クエリが複雑 | 不採用（事前合意で否定） |
| JSONB | `jobs.areas jsonb` で `[{prefecture, municipality}]` | スキーマ柔軟 | インデックス・検索効率が落ちる、Supabase RLS との相性悪 | 不採用 |

**選択理由**: 別テーブル正規化は master-skills の `user_skills` / `user_qualifications` の正規化パターンと同型で、検索・整合性・移行のいずれも既存パターンの延長で実装できる。

### 6.2 Design Decisions

#### Decision 1: AreaPicker 専用コンポーネントを新設（決断 1 = B 案確定）

- **Context**: 7 画面で都道府県+市区町村の連動入力が必要。`MasterCombobox` を流用すると階層概念とフラットマスタの関心が混ざる
- **Selected Approach**: `src/components/master/area-picker.tsx` 新設。内部で都道府県 `<Select>`（47 件固定）+ 市区町村 `MasterCombobox`（選択された都道府県でフィルタした候補）を縦並びで配置
- **Rationale**: master-skills の `MasterCombobox` には変更を加えず、階層プルダウンの責務を `AreaPicker` に閉じ込めることでテスト・保守が容易
- **Trade-offs**: 新規ファイル 2 個（`AreaPicker` + `AreaListEditor`）増えるが、47 件の都道府県プルダウンと 1,898 件の市区町村 combobox を組み合わせる UX 上の最適点を確保
- **Follow-up**: cmdk の市区町村側で日本語 IME 確定前 Enter による誤確定が起きないことを Playwright で検証する

#### Decision 2: マスタは全件 1 キャッシュ、API は per-prefecture 関数で抽象化（決断 2 = A 案確定）

- **Context**: requirements.md Req 10-1 で `getActiveMunicipalitiesByPrefecture(prefecture)` を要求。研究結果（section 1 決断 2）では全件 1 キャッシュが推奨
- **Selected Approach**: 内部実装は `getActiveMunicipalities()` の 1 キャッシュエントリ（全 1,898 件）+ `getActiveMunicipalitiesByPrefecture(prefecture)` は in-memory フィルタの薄いラッパー。両方を `src/lib/master/fetch.ts` の `unstable_cache` パターンに統合
- **Rationale**: 全 1,898 件 × ~30 byte ≒ 60 KB（gzip 数 KB）で初回 fetch のペナルティは無視可能。47 個のキャッシュエントリ管理コストを回避
- **Trade-offs**: 未使用都道府県の市区町村もメモリに載るが許容範囲
- **Follow-up**: キャッシュタグは `'master-area'`（master-skills の `'master-skills'` と分離）

#### Decision 3: 案件動的エリア UI は `useFieldArray`（決断 3 = A 案確定）

- **Context**: CLI-003 / CLI-004 で 1 案件 1〜10 件のエリアを動的追加・削除
- **Selected Approach**: react-hook-form の `useFieldArray<{prefecture: string; municipality: string | null}>` で配列を管理。`AreaListEditor` コンポーネントが行ごとに `AreaPicker` をレンダリング
- **Rationale**: `job-form.tsx` ですでに react-hook-form を使用中。バリデーション統合とサーバ送信時の FormData 構築が一貫
- **Follow-up**: 1 件目を必須・10 件目で「これ以上追加できません」表示・行削除時の最低 1 件保証ロジックは `AreaListEditor` 内に閉じ込める

#### Decision 4: マイグレーションは 4 ファイル段階分割（決断 4 = B 案確定）

- **Context**: スキーマ変更 + 1,898 件シード + 既存データ移行 + 旧カラム削除を 1 ファイルにまとめるとレビュー困難
- **Selected Approach**: 以下の 4 段階分割
  1. `YYYYMMDDhhmmss_master_area_table.sql` — `master_municipalities` 作成 + RLS + index + 1,898 件 INSERT
  2. `YYYYMMDDhhmmss_master_area_new_tables.sql` — `job_areas` / `client_recruit_areas` 作成 + `user_available_areas.municipality` カラム追加 + RLS + index + `enforce_job_areas_max` トリガー
  3. `YYYYMMDDhhmmss_master_area_data_migration.sql` — 既存 `jobs.prefecture` → `job_areas`、`client_profiles.recruit_area` → `client_recruit_areas` の DML 移行
  4. `YYYYMMDDhhmmss_master_area_drop_legacy.sql` — `jobs.prefecture` / `client_profiles.recruit_area` の DROP COLUMN + `idx_jobs_search` 再構築
- **Rationale**: master-skills の Migration A / B 分割と同型。各ファイル単体でロールバック判断が可能
- **Follow-up**: ファイル 3 と 4 の間に手動検証ステップ（`SELECT count(*)` で件数一致確認）を挟む手順を tasks.md に明記

#### Decision 5: 1,898 件のシードは SQL 直書き、生成は Node.js スクリプト経由（決断 5 = A 案確定）

- **Context**: 総務省 CSV から SQL `INSERT` を生成し、マイグレーションファイルに同梱
- **Selected Approach**: `tmp/master-area-research/municipalities.csv` を入力に、`scripts/build-master-municipalities-inserts.ts` で `INSERT INTO master_municipalities (prefecture, municipality) VALUES (...), (...);` の 1 SQL ファイルを生成し、Migration 1 に同梱
- **Rationale**: master-skills `scripts/build-master-inserts.ts` と同パターンで、運用整合性◎。再生成可能なので将来の手動追加にも対応
- **Trade-offs**: マイグレーションファイル ~200 KB に肥大化するが許容

### 6.3 Research Needed 解消（R1〜R6）

| ID | 質問 | 確定方針 |
|----|------|---------|
| R1 | 階層プルダウン popup のレイアウト | PC・SP とも縦並び（都道府県 → 市区町村）。`AreaPicker` 内部で `flex flex-col gap-2`。市区町村側は都道府県未選択時 `disabled`。Popover 幅は親要素フル幅 |
| R2 | 動的エリア追加 UI の SP 表示 | `AreaListEditor` が `flex flex-col gap-3` で行を縦に並べる。1 行 = `AreaPicker` + 右上「×」削除ボタン。最下部に「+ エリアを追加」ボタン（10 件上限到達で disabled） |
| R3 | 「県内全域」と「特定区」混在時の表示 | `formatAreas(areas)` ヘルパで「県全域 + 同県市区町村あり」のケースを `東京都（港区ほか）` 形式に圧縮。同県内の市区町村が 2 件以上ある場合は `東京都（港区・新宿区ほか）`。仕様詳細は design.md の `formatAreas` セクション参照 |
| R4 | seed.sql テストユーザー再設計 | `contractor@test.local`: 東京都 + 神奈川県（市区町村なし＝全域）/ `contractor2@test.local`: 東京都港区 + 東京都新宿区（市区町村あり）/ `client@test.local`: 東京都港区 + 大阪府大阪市北区 / `client-corp-owner@test.local`: 法人募集エリア 東京都全域 + 神奈川県横浜市港北区 / その他は県のみ。job seed も同様に分配 |
| R5 | 政令市本体検索の挙動 | マスタには行政区のみ存在（横浜市・大阪市等の本体は除外）。「横浜市全体」を検索したいユーザーは「神奈川県」のみで検索し、上位包含ルールで横浜市配下の区案件もヒットする。FAQ 等のユーザー教育は本仕様外、CLI-005 等の placeholder で「都道府県のみで広く検索可能」と明示 |
| R6 | 上位包含の例外ルール | 上位包含は **同一都道府県内のみ** 有効。例: 「東京都港区」検索 → 「東京都全域」「東京都港区」「東京都新宿区」は無関係（new 市区町村が異なる）を除き「東京都港区」「東京都全域 (`municipality IS NULL`)」のみヒット。他県データ（神奈川県横浜市港北区など）は絶対にヒットしない。E2E でガード |

### 6.4 Risks & Mitigations（spec-design で再評価）

- **R-A: マイグレーション 3 → 4 の順序ミスで旧カラム参照のコードが残るリスク** — `tasks.md` で「コード書き換え完了 → 4 を実行」を明記。各 Phase 完了時に `npm run test && supabase test db && npm run test:e2e` を必須化
- **R-B: 1,898 件 INSERT の SQL ファイル肥大** — 1 マイグレーションあたり 200 KB 程度。`supabase db reset` で実測 30 秒以内を確認したら許容。CI でも同じ秒数で完了
- **R-C: `EXISTS` サブクエリ + `count: 'exact'` のページネーション破綻** — Supabase JS の `.range()` と `count: 'exact'` の組み合わせで `EXISTS` を `or` 化する書き方が必要。CLI-005 の ID-intersection パターンを準用し、エリア絞り込みは「親 ID 候補集合 → 親クエリ `.in('id', ids)`」に揃える。設計詳細は design.md 「検索クエリビルダー」参照
- **R-D: `user_available_areas` の同一行（prefecture, municipality）重複** — UNIQUE 制約 `(user_id, prefecture, municipality)` を貼る。`municipality IS NULL` は別行として許可（NULLS NOT DISTINCT で扱う Postgres 15+ 構文）
- **R-E: 政令市本体検索の UX 期待値ずれ** — R5 のとおり「県だけで検索すれば配下区が全件ヒット」をユーザーに教育する。検索ポップアップ内のヘルプテキストで明示

### 6.5 References

- [総務省 全国地方公共団体コード（令和6年1月1日）](https://www.soumu.go.jp/main_content/000925835.xlsx) — マスタ素材一次ソース
- `.kiro/specs/master-skills/design.md` — マスタテーブル + denormalization + `unstable_cache` + `validateLabelChanges` パターンの参照元
- `tmp/master-area-research/municipalities.csv` — 整形済み 1,898 件
- `.kiro/steering/database-schema.md` セクション「マスタテーブル参照」 — マスタ運用ルール
- `src/lib/master/fetch.ts` / `src/lib/master/validate.ts` — 拡張対象の既存実装
