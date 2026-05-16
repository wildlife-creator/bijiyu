# Gap Analysis — master-skills

実施日: 2026-05-14

requirements.md（15 要件、約 25 画面 / 50 ファイル影響）と既存コードの差分を体系化し、設計フェーズへの判断材料を整理する。

---

## Analysis Summary

- **既存スキーマと denormalization 方式は親和性が高い**: `user_skills.trade_type` / `users.skill_tags` / `user_qualifications.qualification_name` / `jobs.trade_type` / `client_profiles.recruit_job_types` はすべて `text` または `text[]`。label 保存方式と既存スキーマがそのまま整合し、**スキーマ変更は不要**
- **マスタ 3 テーブル（master_trade_types / master_qualifications / master_skill_tags）は新規追加**。既存に同種のマスタテーブルは無く、本仕様が初導入
- **インクリメンタル検索 UI が既存に無い**: `src/components/ui/` には `multi-select.tsx`（自前 dropdown、検索なし）のみ。113 / 244 / 599 件規模に耐える combobox は新規作成が必要
- **応募制限ロジックは既に共通化済み**: `src/lib/utils/can-apply-job.ts` の `canApplyJob()` 関数に 1 箇所集約され、3 画面（CON-002 検索 Server Action / CON-003 案件詳細 / CON-004 応募フォーム）から呼ばれる。label 厳密一致の現行ロジックは新マスタ仕様と整合済みのため、**本仕様では修正不要**
- **マスタフェッチのキャッシュ戦略は前例なし**: 既存コードに `unstable_cache` / `SWR` / `revalidate` の使用例なし。マスタは更新頻度が低いので新規導入価値は高い

---

## 1. Current State Investigation

### 1-1. ディレクトリ・既存資産

| 資産 | 場所 | 役割 | 本仕様への関係 |
|------|------|------|---------------|
| `TRADE_TYPES` 定数 | `src/lib/constants/options.ts` | 13 値の固定リスト | **削除対象** |
| `multi-select.tsx` | `src/components/ui/` | 自前実装の複数選択 dropdown（検索機能なし） | 113 件に拡張するか、新規 combobox を作るか |
| `Select` / `SelectItem` | `src/components/ui/select.tsx`（shadcn） | 既存の単一選択プルダウン | 検索枠なし。新規候補から外す |
| `update_profile` RPC | `supabase/migrations/...007_update_profile.sql` / `...update_profile_rpc_skill_tags.sql` | プロフィール保存処理 | `p_skill_tags text[]` / `p_qualifications text[]` を受ける形。**現行のまま使える** |
| `profile-edit-form.tsx` の skills | react-hook-form の `useFieldArray` で行ベース UI | `tradeType` + `experienceYears` のペア配列 | 行ごとの combobox に置換 + 「関連候補サジェスト」追加 |
| `client-profile-edit-form.tsx` の recruitJobTypes | `multi-select.tsx` で 13 値から複数選択 | テキスト配列 | combobox + 「カテゴリ一括選択」に置換 |
| 検索ポップアップ（CLI-005 / CON-002 / CON-005） | `Select` で単一選択 | プルダウン | combobox に置換 + 3 マスタ参照 |
| `validateProfile` 系 Zod スキーマ | `src/lib/validations/profile.ts` / `client-profile.ts` | `.array(z.string())` 形式（label 想定） | **denormalization 方式のため大きく変更不要**。max 制約のみ削除 |

### 1-2. 既存パターン・規約

- **DB スキーマ**: `text` / `text[]` カラムが主流。enum 型は限定的に使用（`user_role` 等）
- **マイグレーション命名**: `YYYYMMDDhhmmss_NNN_<scope>.sql` 形式。最新は `20260419100000_organizations_name_drop_not_null.sql` 等
- **RPC パターン**: 複数テーブル更新は `update_profile` のように 1 つの SECURITY DEFINER 関数にまとめる慣習。`SET search_path = public` を必ず付与
- **RLS**: 公開 SELECT + 自分の行のみ INSERT/UPDATE/DELETE が定型。マスタテーブルは「全員 SELECT 可、service_role のみ書き込み」になる
- **検索フィルター**: URL `searchParams` を Single Source of Truth として保持。`useSearchParams()` から直接値取得（メモリ「フィルター付き一覧画面と router.back()」ルール参照）
- **配列カラムの検索**: `.overlaps()` 演算子 + `!inner` ジョインで親行絞り込み（既存 `client_profiles.recruit_job_types` の検索パターン）

### 1-3. PostgreSQL 拡張の現状

| 拡張 | 導入状況 | 本仕様への関係 |
|------|---------|---------------|
| `pg_cron` | 導入済み（billing） | 関係なし |
| `pg_net` | 導入済み（billing） | 関係なし |
| `pg_trgm` | **未導入** | 部分一致 ILIKE 検索を GIN インデックスで高速化する場合に必要 |

### 1-4. キャッシュ戦略の現状

- `unstable_cache` / `cache()` / `SWR` の使用例なし
- データフェッチは Server Component で直接 Supabase クライアントを呼ぶ素朴な実装が中心
- マスタフェッチの最適化は新規導入が必要

---

## 2. Requirement-to-Asset Map

各 Requirement について、既存資産で対応可能か / 新規実装が必要か / 制約があるかをタグ付け。

| Req | 主な必要資産 | ステータス | 補足 |
|-----|------------|----------|------|
| **R1** マスタ DB 基盤 | `master_trade_types` / `master_qualifications` / `master_skill_tags` テーブル | **🆕 Missing** | 完全新規。マイグレーション 1 本で 3 テーブル + RLS + インデックス |
| **R2** 初期データ投入 | 3 マスタテーブルへの INSERT | **🆕 Missing** | `cleaned/*.txt`（113 / 599 / 244 行）を SQL の `INSERT` 文に展開。スクリプトで生成推奨 |
| **R3** 受注者プロフィール入力 UI | combobox 部品 / `profile-edit-form.tsx` / `register/profile/page.tsx` | **⚠️ Partial**: フォーム骨格は流用、入力部品が無い | combobox を新規作成（または cmdk / Radix Command を導入）。**関連候補サジェスト UI（R3 AC-14〜17）も新規** |
| **R4** プロフィール表示「主要 N 件 + 折りたたみ」 | `profile/page.tsx` / `users/contractors/[id]/page.tsx` 等 | **⚠️ Partial**: 表示骨格は流用、折りたたみ UI が無い | 「もっと見る」ボタンの新規実装。React の `useState` でシンプルに実装可 |
| **R5** 検索画面の TRADE_TYPES 誤用バグ修正 | `contractor-search-filter.tsx` / `job-search-filter.tsx` / `client-search-form.tsx` | **⚠️ Partial**: 検索フォーム骨格は流用、フィルター UI を combobox に置換 | URL searchParams ベースのパターンは既存踏襲 |
| **R6** 案件投稿 trade_type | `components/jobs/job-form.tsx` | **⚠️ Partial**: フォーム骨格は流用、Select を combobox に置換 | `jobs.trade_type` は text のまま維持 |
| **R7** 発注者プロフィール recruit_job_types | `client-profile-edit-form.tsx` | **⚠️ Partial**: フォーム骨格は流用、`multi-select.tsx` を combobox に置換 | **「カテゴリ一括選択」ボタン UI（R7 AC-8〜10）は新規**。`recruit_job_types text[]` は維持 |
| **R8** 応募・スカウト・メッセージ表示更新 | 7 + 5 = 12 ファイル | **✅ Existing**: label 保存方式のため、ほぼコード変更不要 | レビュー観点として明示。動作確認のみ |
| **R9** 廃止項目運用 | マスタ migration / 表示クエリ | **⚠️ Partial**: 表示時のサフィックス付与ロジックを新規追加 | 「廃止項目チェック」関数を `src/lib/master/` 配下に作る等 |
| **R10** マスタ追加リクエスト機能なし | — | **✅ Existing**: 既存 contacts テーブルで吸収 | 仕様書記述のみ |
| **R11** バリデーション・型・テスト整合 | `validations/profile.ts` / `validations/client-profile.ts` / Zod / seed.sql / E2E | **⚠️ Partial**: max 制約削除 + label 存在チェック追加 + seed 全面書き換え | Server Action 層に「label が master_xxx に存在し deprecated_at IS NULL」のヘルパー追加 |
| **R12** プレリリースデータ刷新 | `supabase/seed.sql` | **🆕 Missing**: 新マスタ準拠で seed 全面書き換え | テストユーザーの 3 マスタ値 + jobs.trade_type + recruit_job_types を新マスタの label に揃える |
| **R13** マッチング厳密一致 | `src/lib/utils/can-apply-job.ts`（既存共通関数） | **✅ Existing**: 既存 helper が label 厳密一致で動作中 | コード変更なし。seed.sql の値が新マスタ準拠なら自動的に新仕様に適合 |
| **R14** ピン留め MVP 範囲外 | — | **✅ Existing**: 何もしない | 仕様書記述のみ |
| **R15** ステアリング・CLAUDE.md 更新 | `.kiro/steering/database-schema.md` / `CLAUDE.md` / 他 spec | **⚠️ Partial**: 旧記述の grep + 全廃 | grep ベースで漏れチェック |

### タグ凡例

- 🆕 **Missing**: 既存資産なし、完全新規実装
- ⚠️ **Partial**: 骨格は流用可能、一部新規実装
- ⚠️ **Constraint**: 既存制約・既存パターンとの整合が必要
- ✅ **Existing**: 既存資産だけで対応可能

---

## 3. Implementation Approach Options

本仕様の核は「**マスタテーブル基盤 + combobox 入力 UI**」。これをどう実装するかで以下 3 案を比較する。

### Option A: 既存資産を最大限拡張する（最小変更）

**戦略**:
- combobox は `multi-select.tsx` を拡張して「インクリメンタル検索付き」にする
- マスタフェッチは Server Component の素朴な `supabase.from('master_xxx').select('*')` で都度取得
- 関連候補サジェストは `profile-edit-form.tsx` 内にインラインで実装

**Trade-offs**:
- ✅ 新規ファイルが少なく、レビューしやすい
- ✅ 既存パターン踏襲のため、他の開発者が理解しやすい
- ❌ `multi-select.tsx` が肥大化（検索 + 通常モードの両対応で複雑化）
- ❌ マスタフェッチが重複（4 画面で同じ 599 件を fetch するコスト）
- ❌ 関連候補ロジックが個別画面に分散

### Option B: 専用コンポーネントを新規作成する（推奨）

**戦略**:
- `src/components/master/` ディレクトリを新設し、以下を配置:
  - `master-combobox.tsx`: 単一マスタ向けインクリメンタル検索 combobox（汎用部品）
  - `master-multi-combobox.tsx`: 複数選択版（recruit_job_types / skill_tags / qualifications 用）
  - `trade-type-suggester.tsx`: trade-types 専用の関連候補サジェスト
  - `category-bulk-selector.tsx`: 発注者プロフィール用のカテゴリ一括選択
- `src/lib/master/` を新設:
  - `fetch-masters.ts`: `unstable_cache` でマスタ全件取得（1 時間キャッシュ）
  - `validate-label.ts`: label が master_xxx に存在し deprecated_at IS NULL か検証
  - `deprecated-suffix.ts`: 廃止判定 + サフィックス付与
- `src/lib/matching/` を新設:
  - `can-apply.ts`: 応募可否マッチングを 1 箇所に集約（既存 4 箇所を置換）

**Trade-offs**:
- ✅ 関心の分離が明確、テストしやすい
- ✅ 部品の再利用性が高い（受注者・発注者・検索の 3 箇所で共通使用）
- ✅ マスタフェッチのキャッシュを集約しコスト削減
- ✅ 応募制限ロジックの共通化で将来のバグ修正が 1 箇所で済む
- ❌ 新規ファイルが増える（10 ファイル前後）
- ❌ 命名・配置の合意形成が必要

### Option C: ハイブリッド（段階的に Option B へ移行）

**戦略**:
- **Phase 1（本仕様）**: combobox 部品のみ Option B で新規作成、その他は Option A の素朴実装
- **Phase 2（リリース後）**: マスタフェッチのキャッシュ層 + 応募制限の共通化を別 spec で対応

**Trade-offs**:
- ✅ 初期実装の範囲を絞れる
- ✅ MVP リリースが早まる
- ❌ Phase 2 の前提で中途半端なコードが残り、技術負債化のリスク
- ❌ Phase 2 が実施されないまま放置される可能性

### 推奨

**Option B** を推奨する。

理由:
1. 影響範囲が 25 画面と広く、部品の再利用性が重要
2. 応募制限ロジックは既存 helper（`canApplyJob`）で完結しており、本仕様で触る必要なし（追加の負担なし）
3. マスタフェッチは将来も増える性質のもの（管理画面を後日作る前提）。キャッシュ層を最初から作るのが妥当
4. 新規ファイル 10 個程度は妥当な投資

ただし、`master-combobox.tsx` / `master-multi-combobox.tsx` の **UI 詳細（候補リストのキーボード操作、選択済みチップの表示、廃止項目のサフィックス）** は design 段階で詰める必要がある。

---

## 4. Research Needed（設計フェーズに持ち越す調査項目）

### R-1. combobox 部品の実装方式

3 つの候補:

| 候補 | メリット | デメリット |
|------|---------|-----------|
| 自前実装（`multi-select.tsx` の拡張） | 依存追加なし、UI を完全制御 | キーボード操作・アクセシビリティを 1 から実装 |
| `cmdk`（Radix の Command 系ライブラリ） | 業界標準、shadcn/ui 公式が採用 | 新規依存追加、学習コスト |
| `react-aria` の Combobox | アクセシビリティが万全 | 新規依存追加、shadcn と命名が衝突する可能性 |

→ design でユーザー（オーナー）に「依存追加してよいか」確認が必要

### R-2. マスタフェッチのキャッシュ戦略

- 候補 1: Next.js の `unstable_cache` で 1 時間キャッシュ。全件をビルド時に取得する `static` 戦略
- 候補 2: React の `cache()`（リクエスト内重複排除）+ Supabase 側のキャッシュヘッダー
- 候補 3: クライアント側で `localStorage` キャッシュ
- 候補 4: 静的 JSON ファイル（`src/lib/master/data/*.json`）として埋め込む。マスタ更新時のみ再ビルド

→ design で「マスタ更新時の即時反映 vs キャッシュ TTL」のトレードオフを判断

### R-3. 部分一致検索の実装方式

- 候補 1: クライアント側全件キャッシュ + JS で `String.includes()` フィルター
- 候補 2: Server Action で `ILIKE '%query%'` を呼ぶ（599 件なら B-tree でも実用速度）
- 候補 3: `pg_trgm` + GIN インデックスを導入してフルテキスト検索

→ 候補 1 が最有力（マスタ全件は数十 KB なのでクライアント保持で十分）

### R-4. 関連候補サジェストのカテゴリ抽出方式

trade-types の label は `建築/躯体｜大工` 形式。「同じ大カテ/中カテ配下」を判定するには:

- 候補 1: ランタイムで `label.split('｜')[0]` で大カテ/中カテ部分を取り出して比較
- 候補 2: マスタテーブルに `category_path` カラムを追加（R1 AC-3 に反するため不採用）
- 候補 3: ビルド時にカテゴリ別の JSON マップを生成

→ 候補 1 が最有力。「DB 上はフラット、UI でパース」が一貫している

### R-5. カテゴリ一括選択 UI（R7 AC-8）の具体形

- 候補 1: combobox の隣にボタン → クリックでカテゴリ一覧モーダル → カテゴリにチェック
- 候補 2: 専用画面（CLI-021 内のタブ切替）
- 候補 3: combobox 内で「カテゴリ親一致」入力をした際にサジェストとして候補表示

→ design でデザインカンプを確認しつつ判断

### R-6. seed.sql の再構築範囲

- 現状の seed.sql には旧 `TRADE_TYPES`（大工・電気工事士 等）の値が埋まっている
- 新マスタ準拠で 13 ユーザー / 数十案件分を書き直す必要
- 受注者の対応職種・保有資格・保有スキルを「マッチング検証用に良い感じの組み合わせ」で再設計
- 既存 E2E テスト（`profile.spec.ts`, `scout-application.spec.ts`）の期待値も合わせて更新

→ tasks 段階で seed.sql の刷新を 1 タスク化

---

## 5. Implementation Complexity & Risk

### 全体規模

- **影響画面**: 約 25
- **影響ファイル**: 約 50
- **新規ファイル想定**: 10〜15（マスタ部品 + lib + migration + seed 再構築）
- **既存 E2E への影響**: 中程度（profile.spec.ts, scout-application.spec.ts 等を期待値更新）

### Requirement 別 Effort / Risk

| Req | Effort | Risk | 一行根拠 |
|-----|--------|------|---------|
| R1 マスタ DB 基盤 | S | Low | 既存パターン踏襲（テーブル + RLS + インデックス） |
| R2 初期データ投入 | S | Low | INSERT 文の生成スクリプトを書けば即終わる |
| R3 受注者プロフィール入力 UI | M | Medium | combobox + 関連候補サジェストの UX が新規 |
| R4 表示「主要 N 件 + 折りたたみ」 | S | Low | useState による単純な展開 UI |
| R5 検索画面の TRADE_TYPES 修正 | M | Low | 既存パターン踏襲、ただし 3 検索画面 + 6 ファイル |
| R6 案件投稿 trade_type | S | Low | combobox 部品の差し込みのみ |
| R7 発注者プロフィール + カテゴリ一括選択 | M | Medium | カテゴリ一括選択 UI が新規パターン |
| R8 応募・スカウト表示更新 | S | Low | label 保存方式のため、ほぼ動作確認のみ |
| R9 廃止項目運用 | S | Low | サフィックス付与の単純ロジック |
| R10 追加リクエスト機能なし | XS | Low | 仕様書記述のみ |
| R11 バリデーション・テスト整合 | M | Medium | Server Action 層のヘルパー + テスト全面更新 |
| R12 プレリリースデータ刷新 | M | Low | seed.sql の書き直し（手間はあるが定型作業） |
| R13 マッチング厳密一致（既存共通関数を流用） | S | Low | 既存 `canApplyJob` がそのまま使える。動作確認のみ |
| R14 ピン留め | XS | Low | 何もしない |
| R15 ドキュメント更新 | S | Low | grep ベースで全廃 |

### 累積見積もり

- **合計 Effort**: 約 **3〜4 週間**（M タスク 6 個 + S タスク 8 個 + XS 2 個）
  - ※「1 案件 複数職種化」を追加で含む（`jobs.trade_type` → `jobs.trade_types text[]`、共通関数 `canApplyJob` の引数を array 化、全案件表示画面の配列対応）
- **合計 Risk**: Medium（個別はほぼ Low、ただし影響画面の広さから「漏れリスク」が中程度）

### 主なリスクポイント

1. **画面の改修漏れ**: 25 画面に影響するため、tasks.md でチェックリスト化必須。E2E でも各ロール別の導線テストを必ず追加
2. **既存 E2E の破壊**: seed.sql 刷新と同時に `profile.spec.ts` / `scout-application.spec.ts` の期待値を更新しないとテストが落ちる
3. **combobox UI の UX 品質**: 113 / 244 / 599 件規模の候補表示は、キーボード操作や日本語 IME の挙動でハマりやすい。design 段階で実機検証必須

---

## 6. Recommendations for Design Phase

### 推奨アプローチ: Option B（専用部品 + ライブラリ分離）

### 設計フェーズで必ず決めること（5 件）

1. **R-1 combobox の実装方式**: 自前 vs cmdk vs react-aria。ユーザー（オーナー）に依存追加可否を確認
2. **R-2 マスタフェッチのキャッシュ戦略**: `unstable_cache` か 静的 JSON 埋め込みか
3. **R-3 部分一致検索**: クライアント側 JS フィルター（最有力）か pg_trgm か
4. **R-5 カテゴリ一括選択 UI のデザイン**: design-assets/screens/ にカンプがあるかを確認
5. **DB マイグレーション順序**: 既存 seed の破棄 → マスタ 3 テーブル作成 → マスタ初期データ投入 → seed 再投入 の依存関係

### 設計フェーズに持ち越す調査項目（research items）

- R-1: combobox 実装方式の調査と依存追加可否の確認
- R-2: キャッシュ戦略のベンチマーク（1 時間 TTL vs 静的埋め込みでマスタ更新時の DX 比較）
- R-3: 候補数 599 件でのクライアント側フィルター性能実測
- R-4: trade-types カテゴリパース関数のテストケース設計
- R-5: カテゴリ一括選択 UI のデザインカンプ確認（`design-assets/screens/CLI-021-*.png` 等の有無）
- R-6: seed.sql 再構築時のマッチング検証用データ設計

### 設計フェーズで作成すべき成果物

1. **マイグレーション計画**:
   - 1 本目: マスタ 3 テーブル + RLS + インデックス
   - 2 本目: マスタ初期データ投入（113 + 599 + 244 行）
   - 3 本目: 既存 seed.sql の再構築（または同 migration 内で実施）

2. **コンポーネント設計**:
   - `master-combobox.tsx` の Props 仕様（候補配列 / 選択値 / 廃止サフィックス / disabled）
   - `trade-type-suggester.tsx` のレンダリング条件と UX
   - `category-bulk-selector.tsx` のモーダル構成

3. **ヘルパー層設計**:
   - `src/lib/master/` の API（fetch / validate / deprecated-check）
   - `src/lib/matching/` の API（canApplyToJob）

4. **テスト計画**:
   - ユニット: バリデーション、ヘルパー関数
   - 統合: Server Action、RPC
   - E2E: ロール別 + マスタ操作 + 検索フィルター + 応募可否

---

## 7. 次のステップ

1. **本ドキュメントをレビュー**してください
2. 上記「設計フェーズで必ず決めること（5 件）」のうち、特に **R-1（combobox 実装方式、依存追加可否）** はユーザー判断が必要なので、design フェーズの初手で確認します
3. 承認後、`/kiro:spec-design master-skills -y` で設計ドキュメントの作成に進みます

---

## 8. Design Phase Decisions（2026-05-15 確定）

設計フェーズ着手前にオーナーへの 3 件の事前確認を完了。残りの調査項目（R-3 partial match、R-4 カテゴリ抽出、R-5 一括選択 UI）は本セクションで方針確定。

### Summary（design phase）

- **Discovery Scope**: Extension（既存システムへの追加。新規依存 1 件 cmdk）
- **Key Findings**:
  - 影響は 27 画面 / 約 50 ファイルだが、`label 保存方式（denormalization）` により表示画面はほぼ無修正。書き換えは「入力系 + 検索系」に集中
  - 候補総数 956 件 × 平均 12 char ≒ 約 30 KB（gzip 後 ~10 KB）。クライアントに全件保持しても支障なし → `pg_trgm` 不要
  - 既存 `multi-select.tsx` には検索枠が無く、113/244/599 件規模は cmdk + Popover に統一するのが安全
  - `jobs.trade_type text` → `jobs.trade_types text[]` のスキーマ変更が「1 案件複数職種」要件（R6 AC-2）で必須
  - 既存 `canApplyJob(jobTradeType: string, …)` は string シグネチャ → `string[]` に拡張する必要あり

### 8-1. Architecture Pattern Evaluation

| Option | 概要 | 採否 | 理由 |
|--------|------|------|------|
| 自前 multi-select 拡張 | 既存 `multi-select.tsx` に検索 input を後付け | ✕ | 599 件で IME / キーボード / フォーカス管理を 1 から書き直すコストが高い |
| cmdk + Radix Popover | shadcn 公式 combobox パターン | ✅ | 業界標準。`radix-ui` が既に依存にあり Popover はそのまま使える。新規依存は `cmdk` 1 個のみ |
| react-aria Combobox | アクセシビリティ最強 | ✕ | shadcn 系列との命名/設計衝突。既存パターン（`bg-background` / `rounded-pill` 等）との一貫性が崩れる |

詳細トレードオフはセクション 3 参照。**選定: cmdk + Radix Popover**（オーナー承認 2026-05-15）。

| Option | 概要 | 採否 | 理由 |
|--------|------|------|------|
| `unstable_cache`（TTL 1h） | DB から fetch して Next.js サーバ側キャッシュ。`revalidateTag` で即時破棄可能 | ✅ | 将来の admin 管理画面（別 spec）導入時に write→revalidate の経路がそのまま使える |
| 静的 JSON 埋め込み | ビルド時に `cleaned/*.txt` を JSON 化し import | ✕ | マスタ更新ごとに再デプロイが必要。admin 画面実装後にリファクタが発生 |
| React `cache()` のみ | リクエスト内重複排除のみ | ✕ | 実質キャッシュなし。全リクエストで DB を引く |

**選定: `unstable_cache`（TTL 3600s、`revalidateTag('master-skills')` で破棄）**（オーナー承認 2026-05-15）。

### 8-2. Design Decisions

#### Decision: Combobox は cmdk + Radix Popover で `MasterCombobox` 部品を 1 つに集約

- **Context**: 113 / 244 / 599 件規模のマスタからの単一入力枠 + インクリメンタル検索を、入力系 4 画面（COM-002 / register/profile / job-form / CLI-021）と検索系 3 画面（CLI-005 / CON-002 / CON-005）で共用したい
- **Alternatives Considered**:
  1. 自前 `multi-select.tsx` 拡張 — 依存ゼロ。ただし IME / a11y / virtualization を全て自作
  2. cmdk + Radix Popover — shadcn 系列の公式 combobox 経路。新規依存 `cmdk` 1 個
  3. react-aria — a11y は最強だが既存パターンと毛色が異なる
- **Selected Approach**: cmdk（最新版）+ 既存 `radix-ui` 依存の Popover を組み合わせ、`src/components/ui/master-combobox.tsx` を新規作成。Props は `kind: 'trade_type' | 'qualification' | 'skill_tag'` で 3 マスタを切り替え。複数選択は chip 表示 + Backspace で末尾削除
- **Rationale**: 新規依存が 1 個 / ~10 KB と最小。shadcn の Command パターンは社内エンジニアにも学習コストが低い
- **Trade-offs**: cmdk のバージョン更新追従が必要。virtual-list は本仕様の規模（最大 599 件）では不要
- **Follow-up**: `npm install cmdk@latest` 時の peerDeps（React 18+）確認、Tailwind v4 の `@theme inline` トークンとの整合確認

#### Decision: マスタフェッチは `unstable_cache` + `revalidateTag('master-skills')` でサーバキャッシュ

- **Context**: 各画面で 113/244/599 件の候補を取得する。素朴に毎リクエスト DB を引くと冗長。一方、JSON 埋め込みは admin 管理画面と相性が悪い
- **Alternatives Considered**:
  1. `unstable_cache`（TTL 1h、tag による revalidate）
  2. 静的 JSON ファイル import
  3. React `cache()` のみ
- **Selected Approach**: `src/lib/master/fetch.ts` に `getActiveTradeTypes()` / `getActiveQualifications()` / `getActiveSkillTags()` を実装し、すべて `unstable_cache(fn, ['master', kind], { revalidate: 3600, tags: ['master-skills'] })` でラップ。将来の admin 画面で `revalidateTag('master-skills')` を呼べば全画面が即時反映
- **Rationale**: Server Component から 1 関数呼び出しで取れる。サーバキャッシュなので bundle に乗らず、初回以外は DB を叩かない
- **Trade-offs**: マスタ更新後、最大 1 時間表示が遅れる（admin 画面導入後は `revalidateTag` で即時化）
- **Follow-up**: TTL 値の妥当性は MVP 後に再評価

#### Decision: 部分一致検索はクライアント側 JS フィルター（`pg_trgm` 採用せず）

- **Context**: 入力枠のインクリメンタル検索を 200 ms 以内に返す要件（R3 AC-12）
- **Alternatives Considered**:
  1. クライアントに全件保持して `String.includes()`
  2. Server Action で `ILIKE '%q%'` クエリ
  3. `pg_trgm` + GIN
- **Selected Approach**: マスタ全件（gzip 後 ~10 KB）を Server Component が `unstable_cache` 経由で取得し、初期 HTML に埋め込み。クライアント側は文字列 `includes()` で絞り込み。仮名/カナの大文字小文字差異は `toLowerCase()` で吸収
- **Rationale**: 全件サイズが小さいため、ラウンドトリップ 0 で 200 ms 要件を確実に満たす。新規 PG 拡張なし
- **Trade-offs**: マスタが 10k 件規模に拡大した場合は破綻するが、本仕様の規模では問題なし
- **Follow-up**: 大規模化したら Server Action + `ILIKE` 切り替えを検討

#### Decision: trade-types カテゴリ抽出は `label.split('｜')[0]` でランタイムパース、DB にカテゴリカラム追加なし

- **Context**: R3 AC-14（関連候補サジェスト）と R7 AC-8（カテゴリ一括選択）でカテゴリ単位の判定が必要
- **Alternatives Considered**:
  1. ランタイム string パース
  2. マスタテーブルに `category_path` 等を追加
  3. ビルド時にカテゴリ別 JSON マップを生成
- **Selected Approach**: `src/lib/master/category.ts` に `parseTradeTypeCategory(label: string): { big: string; mid: string }` を実装。`label.split('｜')[0]` を `/` で分割し、`big = parts[0]`、`mid = parts.join('/')` を返す（1 階層しかない `撮影・クリエイティブ` の場合は big === mid）
- **Rationale**: R1 AC-3 で「DB はフラット、階層は label 内 prefix のみ」を要件として固定。ランタイムパースなら DB 変更不要で要件と整合
- **Trade-offs**: label 命名規約（`大カテ/中カテ｜末端`）に依存。今後の追加時もこの規約を守る運用が必要
- **Follow-up**: カテゴリパース関数のユニットテストで 113 件全件パース可能なことを確認

#### Decision: CLI-021 のカテゴリ一括選択は「大カテ / 中カテ」2 段階チェックボックス + 累積追加方式

- **Context**: R7 AC-8〜10。CLI-021 設計カンプに専用 UI 表示なし。仕様で「カテゴリ単位で複数選択を一括追加」を要求
- **Alternatives Considered**:
  1. combobox の隣に「カテゴリで一括選択」ボタン → 開くダイアログに大カテ 5 件 + 中カテ 10 件のツリー型チェックボックス
  2. CLI-021 に専用タブ
  3. combobox 内サジェスト
- **Selected Approach**: 1（モーダル + ツリー型チェックボックス）。モーダル内では「建築（大カテ）」配下に「建築/躯体（中カテ）」「建築/内装」… の 2 段ネストツリーを表示。チェック時は「対象カテゴリ配下の全 trade-types で、未選択かつ deprecated_at IS NULL のもの」を一括 push。既選択分はスキップ
- **Rationale**: 受注者の R3「関連候補サジェスト」は 1 件ベースの「同じ系統」推奨だが、発注者は会社で対応する複数領域を一括登録したい。UI は別ロジック分離
- **Trade-offs**: モーダル UI が COM-002 と異なる新規パターンになる
- **Follow-up**: 実装後にデザインレビュー（コンパクトに収まるか、選択件数表示が必要か等）

#### Decision: マイグレーションは 5 ステップ順序で実施。`jobs.trade_type` → `trade_types text[]` を seed 投入より先に

- **Context**: オーナー提示 4 ステップ案では新 seed 投入後に jobs スキーマ変更となり、新 seed の `trade_types` 配列形が古いスキーマに入らない問題があった
- **Alternatives Considered**:
  1. ユーザー初期案（マスタ → 既存 seed 破棄 → 新 seed → jobs schema 変更）
  2. **修正案（マスタ → jobs schema → コード → 新 seed → tests）**
- **Selected Approach**:
  1. **Migration A**: `master_trade_types` / `master_qualifications` / `master_skill_tags` テーブル作成 + RLS + インデックス + 113/599/244 件初期データ INSERT（`ON CONFLICT DO NOTHING`）
  2. **Migration B**: `jobs.trade_type TEXT` → `jobs.trade_types TEXT[] NOT NULL DEFAULT '{}'` への列改名 + 型変更。既存値は `ARRAY[trade_type]` で配列化。`idx_jobs_search` を `(status, prefecture)` + GIN(`trade_types`) に再作成
  3. **コード書き換え**: 約 50 ファイル（バリデーション / 入力 / 検索 / 表示 / Server Action）
  4. **`supabase/seed.sql` 書き直し**: 新マスタ準拠の label と新 `trade_types` 配列形に整合
  5. **テスト更新**: pgTAP / Vitest / Playwright の期待値刷新
- **Rationale**: 「既存 seed 破棄」は `supabase db reset` が自動で行うため明示ステップ不要。本番には seed が走らないため、本番マイグレーションは Migration A + B の 2 本のみ
- **Trade-offs**: 既存案件の `trade_type` データはプレリリースのため移行不要。本番投入時にユーザーデータが空であることが前提（R12 AC-3）
- **Follow-up**: Migration B 適用時に `idx_jobs_search` の DROP / CREATE 順序を分けて DDL ロック時間を短縮できるか検討

### 8-3. Risks & Mitigations

- **Risk**: cmdk の virtual-list を使わない実装で 599 件描画時に <200ms を割り込む可能性 → 200ms 計測で問題が出た場合のみ `@tanstack/react-virtual` 導入を検討（MVP では見送り）
- **Risk**: `unstable_cache` は Next.js の experimental API。Next 15+ で deprecation 時に置き換えが必要 → Vercel リリースノートを定期チェック。当面は API シグネチャ互換のため大きな書き換えは不要
- **Risk**: マスタ 956 件を Server Component の初期 HTML に埋め込むと、HTML サイズが +30 KB（gzip ~10 KB）増える → 影響範囲は入力系 4 画面のみ。許容範囲
- **Risk**: `jobs.trade_type` → `trade_types text[]` 移行中の orphan な参照 → コード書き換え step で `git grep "jobs.trade_type\b"` を実行し、`trade_types\[\]?` 以外の参照を漏れなく駆逐
- **Risk**: 法人プラン Staff が `client_profiles` を直接編集できないことを忘れて Staff 用 UI を作ってしまう → CLI-021 は Owner 限定のため、Server Action のロールチェックで `'staff'` を弾く（既存パターン踏襲）

### 8-4. References

- [cmdk 公式ドキュメント](https://cmdk.paco.me) — Command コンポーネントの API
- [shadcn/ui Combobox パターン](https://ui.shadcn.com/docs/components/combobox) — cmdk + Popover の標準実装
- [Next.js `unstable_cache`](https://nextjs.org/docs/app/api-reference/functions/unstable_cache) — TTL + tag-based revalidation
- `.kiro/specs/master-skills/raw-data/cleaned/cleaning-notes.md` — マスタ素材整理の判断記録
- `.kiro/steering/database-schema.md` — RLS / インデックス / マイグレーション規約
- `.kiro/specs/master-skills/raw-data/cleaned/{trade-types,qualifications,skill-tags}.txt` — 投入対象データ正本

設計フェーズでは、本ドキュメントの「Option B」を前提に、コンポーネント構成・DB マイグレーション・キャッシュ戦略の詳細を確定させます。
