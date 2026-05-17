# Implementation Plan

## 概要

本実装計画は `master-skills` 仕様（受注者プロフィール 3 マスタ整備 + 周辺 27 画面 / 約 50 ファイルの新マスタ参照化）の作業を 12 フェーズに分割する。`label 保存方式（denormalization）` により表示系は基本的に既存クエリを保ち、表示部品（`SummaryWithOthers` / `CollapsibleList`）の差し込みのみで済む。各フェーズは前フェーズの完了を前提とするが、フェーズ内の独立タスクには `(P)` マーカーを付与して並列実行可能であることを示す。

新規依存: `cmdk@^1`（オーナー承認済）。新規 PG 拡張: なし（`pg_trgm` 採用せず、クライアント側 `String.includes()` 方式）。

---

- [x] 0. 既存テストの全実行とデグレード確認
  - 着手前に `npm run test` / `supabase test db` / `npm run test:e2e` を順に実行し、すべて pass することを確認する
  - 失敗があれば原因を調査・修正してから Phase 1 に進む。修正の根本原因が「他機能でも再発しうる」場合は CLAUDE.md の「過去のバグから学んだルール」セクションに学びを追記する
  - E2E 起動前提: `supabase start` + `supabase db reset` + `npm run dev`
  - _Requirements: 11.7_

- [x] 1. マスタ DB 基盤と jobs.trade_types 配列化のマイグレーション
- [x] 1.1 マスタ素材から SQL INSERT 文を生成するスクリプト
  - `scripts/build-master-inserts.ts` を新規実装し、`raw-data/cleaned/{trade-types,qualifications,skill-tags}.txt` を読んで `INSERT INTO master_xxx (label) VALUES ...` を生成する
  - 空行と `#` で始まるコメント行をスキップし、前後空白の trim 以外の正規化を行わない
  - `ON CONFLICT (label) DO NOTHING` を末尾に付与し再投入時の衝突を無視する
  - 素材ファイル自体はリポジトリに保全し、生成 SQL は migration ファイルに直接埋め込む（DB 自己完結性）
  - _Requirements: 2.4, 2.5, 2.8, 2.9_

- [x] 1.2 マスタ 3 テーブル + RLS + インデックスを新規 Migration A で作成
  - `master_trade_types` / `master_qualifications` / `master_skill_tags` を最小スキーマ `(id uuid PK, label text NOT NULL UNIQUE, deprecated_at timestamptz, created_at, updated_at)` で作成する
  - 階層・親子・カテゴリの追加カラムは持たず、trade-types の階層は label 内 prefix（`大カテ/中カテ｜末端`）のみで表現する
  - 既存 `update_updated_at()` トリガーを各テーブルに付与する
  - RLS を有効化し「anon + authenticated は SELECT 可、INSERT/UPDATE/DELETE は service_role のみ」のポリシー（`master_xxx_select_all_anon`）を設定する
  - `WHERE deprecated_at IS NULL` の部分 B-tree インデックスを `label` に張る
  - 1.1 の生成 SQL を埋め込み 113 / 599 / 244 行を `deprecated_at = NULL` で投入する
  - 末尾に `RAISE NOTICE` で件数を出力し、`(113, 599, 244)` を確認可能にする
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.6, 2.7, 2.8, 9.1_

- [x] 1.3 jobs.trade_type → trade_types text[] への Migration B (P)
  - `jobs.trade_type text` を `jobs.trade_types text[] NOT NULL DEFAULT '{}'` に置換する。既存値は `ARRAY[trade_type]` で配列化（プレリリース前提）
  - 旧複合インデックス `idx_jobs_search` を DROP し、`(status, prefecture)` の複合 B-tree + `trade_types` への GIN インデックス `idx_jobs_trade_types_gin` として再作成する
  - DROP COLUMN は依存インデックス削除の後に実施する（順序重要）
  - migration 直後に Task 1.4 で型再生成を実行する前提とする（Phase 4 の画面改修が新しい型を必要とする）
  - 1.1 / 1.2 とは別テーブル（jobs vs master_*）への変更なので並列実行可能
  - _Requirements: 12.5, 12.6_

- [x] 1.4 Database 型再生成と型エラーの解消
  - `supabase gen types typescript --local > src/types/database.ts` を実行し、新マスタ 3 テーブル（master_trade_types / master_qualifications / master_skill_tags）と `jobs.trade_types text[]` への変更を `src/types/database.ts` に反映する
  - Task 1.2 と 1.3 の両方が完了したあとに実施する
  - 影響を受ける呼び出し側のコンパイルエラーを解消する（Phase 4 以降の画面実装が新しい型を必要とするため、Phase 1 内で完了させる）
  - `git grep "jobs.trade_type\b"` で旧カラム名の参照を洗い出し、修正対象を Phase 4 のチェックリストに渡す
  - _Requirements: 11.4_

- [x] 2. マスタ参照ライブラリ層の実装
- [x] 2.1 cookieless な公開読取専用 Supabase クライアントを追加
  - `src/lib/supabase/anon.ts` を新規実装し、`createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` のみを export する
  - `unstable_cache` 内部で安全に呼べるよう、`cookies()` / `headers()` / `auth.getUser()` 等のリクエスト依存 API を一切使わない最小実装にする
  - `master/fetch.ts` 以外からは原則使わないことを JSDoc で明記する
  - _Requirements: 1.5_

- [x] 2.2 マスタ取得とサーバキャッシュの実装
  - `src/lib/master/fetch.ts` を新規実装し、`getActiveTradeTypes()` / `getActiveQualifications()` / `getActiveSkillTags()` を `unstable_cache(fn, ['master-skills', kind, 'active'], { revalidate: 3600, tags: ['master-skills'] })` でラップする
  - 廃止判定用の `getAllMasterRows(kind)` を別キー（`['master-skills', kind, 'all']`）で同パターン提供する
  - 取得失敗時は空配列にフォールバックし、UI は「候補を取得できませんでした」を表示できるようにする
  - 内部では 2.1 の anon client のみを使い、`@supabase/ssr` の `createServerClient` を import しない
  - 将来の admin 画面で `revalidateTag('master-skills')` を呼べば全画面が即時反映される設計
  - `getActiveXxx` 系の内部クエリには必ず `WHERE deprecated_at IS NULL` を付与し、廃止項目を新規候補から除外する
  - _Requirements: 1.1, 1.4, 1.5, 9.2_

- [x] 2.3 trade-types のカテゴリパースと siblings 抽出 (P)
  - `src/lib/master/category.ts` に `parseTradeTypeCategory(label)` / `listBigCategories()` / `listMidCategories()` / `siblingsInSameMidCategory()` を実装する
  - `(<big>/<mid>)?<leaf>` 形式（`｜` 区切り）に対応し、1 階層 label（例: `撮影・クリエイティブ｜カメラマン`）も正しく扱う（big === mid とする）
  - DB スキーマには階層情報を持たず、label の prefix だけで完結する。`RelatedSuggestions` と `CategoryBulkSelector` の双方が利用する
  - _Requirements: 1.3, 3.14, 3.17, 7.8_

- [x] 2.4 ラベル変更検証ヘルパー（delta validate） (P)
  - `src/lib/master/validate.ts` を新規実装し、`validateLabelChanges(newLabels, previousLabels, kind)` の 3 引数版に統合する
  - delta = `Array.from(new Set(newLabels)).filter(l => !previousLabels.includes(l))` で計算し、added のみを「master 存在 + `deprecated_at IS NULL`」で検証する
  - 既存保有の deprecated は保持を許可する（R3 AC-13 / R9 AC-3 の要件）
  - 内部は 2.2 の `getAllMasterRows(kind)` キャッシュを使った in-memory 判定で、追加 DB ラウンドトリップを発生させない
  - 戻り値は `{ valid: true } | { valid: false; unknownLabels[]; deprecatedLabels[] }` の判別共用体で、UI メッセージは Server Action 側で組み立てる
  - _Requirements: 1.8, 1.9, 3.13, 9.3, 11.1_

- [x] 2.5 廃止サフィックス付与のヘルパー (P)
  - `src/lib/master/deprecated.ts` を新規実装し、`applyDeprecatedSuffix(labels, deprecatedSet)` / `isDeprecated(label)` / `stripDeprecatedSuffix(label)` を提供する
  - 編集画面でのみ使用される想定とし、表示専用画面では呼ばない（R9 AC-9）
  - 保存時は `stripDeprecatedSuffix` で素の label に戻してから 2.4 の `validateLabelChanges` に渡す
  - _Requirements: 9.3, 9.9_

- [x] 2.6 応募可否マッチングを配列 OR 一致に拡張 (P)
  - 既存 `src/lib/utils/can-apply-job.ts` を `src/lib/matching.ts` にリネーム + 移動し、`canApplyJob` の `jobTradeType: string` を `jobTradeTypes: string[]` に拡張する
  - 内部判定を `jobTradeTypes.some(j => userSkills.some(s => s.tradeType === j))` の OR 一致に書き換える（`isPaidUser === true` は無条件 canApply、`role === 'staff'` は別途 UI 側で応募ボタン非表示）
  - 階層構造を利用したあいまいマッチング（親一致等）は行わない（厳密一致のみ）
  - 呼び出し元 3 箇所（CON-002 検索 Server Action / CON-003 案件詳細 / CON-004 応募 Server Action）の引数を同時更新する
  - _Requirements: 8.9, 13.1, 13.2_

- [x] 3. 共通 UI 部品の実装
- [x] 3.1 cmdk 依存の追加
  - `cmdk@^1` を本番依存に追加し、React 18+ peer 要件を確認する
  - `package.json` / lock ファイルを更新し、Tailwind v4 の `@theme inline` トークンと cmdk の CSS 変数の整合を確認する
  - `radix-ui` の Popover / Dialog が既存依存にあることを再確認する
  - _Requirements: 3.1, 5.1, 6.1, 7.1_

- [x] 3.2 MasterCombobox（cmdk + Radix Popover） (P)
  - 単一/複数選択 combobox を 1 部品に集約し、`mode: "single" | "multi"`、`options: string[]`、`value: string[]`、`onChange` を Props に持つ
  - クライアント側は `toLowerCase()` 後の `String.includes()` で絞り込み、既選択分は候補から除外する
  - multi モードでは chip 表示 + Backspace で末尾 chip 削除、single モードでは値ピック後に「append + clear」を親に委ねる
  - 日本語 IME の確定前 Enter で誤確定しないことを実装で担保する
  - 候補 0 件時のメッセージ（`emptyLabel`）と disabled 状態を提供する
  - design-rule.md（`bg-background` / `rounded-[8px]`）に揃え、`design-assets/screens/ユーザープロフィール編集.png` を参照
  - 入力系（COM-002 / AUTH-006 / CLI-021 / job-form）と検索系（CLI-005 / CON-002 / CON-005）の 7 画面で共用する
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.9, 3.12, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 7.1_

- [x] 3.3 CategoryBulkSelector（CLI-021 専用） (P)
  - 「カテゴリで一括選択」ボタンと、押下で開くダイアログ（大カテ / 中カテの 2 段ネストツリー + チェックボックス）を実装する
  - 「追加する」操作で対象カテゴリ配下の全 trade-types を `value` に push（既選択分はスキップ、`deprecated_at IS NULL` のみ）
  - 1 大カテで件数が一気に増えるため、確認時に「○件追加」を明示する
  - design-assets/screens/発注者情報編集.png を参照。受注者プロフィールには載せない
  - _Requirements: 7.8, 7.9, 7.10_

- [x] 3.4 RelatedSuggestions（受注者プロフィール用） (P)
  - 直前に選んだ trade_type と同じ中カテ配下の他 trade-types を「関連候補」として下方に表示する
  - 「閉じる/スキップ」操作で非表示にできる任意 UI とする
  - ピック時は親側で「既選択リストへの append + 経験年数欄の同時表示」を実行する
  - qualifications / skill_tags には載せない（フラット構造で系統がないため）
  - _Requirements: 3.14, 3.15, 3.16, 3.17_

- [x] 3.5 CollapsibleList（プロフィール表示の「主要 N 件 + もっと見る」） (P)
  - `items: string[]` と `initialLimit: number` を Props に取り、最初の N 件のみ表示し残りを「もっと見る」操作で展開する
  - `items.length === 0` のとき null を返す
  - N の既定値は呼び出し側で「対応職種=5 / 保有資格=5 / 保有スキル=8」を渡す（DB 制約は持たない）
  - 廃止判定 / サフィックス付与は行わず、保存値をそのまま表示する
  - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7_

- [x] 3.6 SummaryWithOthers（リストカード等の「主要 M 件 + 他」） (P)
  - `items: string[]` と `maxVisible: number` を Props に取り、`items.length <= maxVisible` のときは「他」を出さず全件表示する
  - 件数の数値表示は行わない（「他 5 件」ではなく「他」のみ）
  - 区切り文字は `、` を既定とする
  - 表示画面が 20 ファイル以上あるため、必ずこの部品に統一する（手書きの `slice(0,2).join('、')` を散らさない）
  - _Requirements: 4.4, 4.8, 4.9, 4.10_

- [x] 4. 入力系 4 画面の MasterCombobox 移行
- [x] 4.1 受注者プロフィール編集（COM-002）+ 新規会員登録情報入力（AUTH-006）の差し替え (P)
  - 対応職種（mode=single + 親の useFieldArray が append+clear、経験年数欄が同時表示）/ 保有スキル（mode=multi）/ 保有資格（mode=multi）を MasterCombobox に置換する
  - 対応職種選択直後に RelatedSuggestions をレンダリングし、選択は任意（閉じる/スキップ可）とする
  - フォーム送信前に `stripDeprecatedSuffix` で素の label に戻し、Server Action では「保存直前に DB から previousLabels を SELECT → `validateLabelChanges` で検証 → 既存 RPC（`update_profile` の `p_skill_tags` / `p_qualifications`）を呼ぶ」シーケンスを実装する
  - 旧 UI（複数プルダウン・3 件まで制限）と `TRADE_TYPES` 参照を完全に廃止する
  - 必須/任意ルール: trade-types 1 件以上必須（保存ボタン非活性で抑止）、skill_tags / qualifications は 0 件保存可
  - 経験年数未入力の保存は該当行にエラーメッセージを表示して拒否する
  - 同じ master label を 2 回以上選択することを抑止する（候補から既選択分を除外）
  - 廃止項目は編集画面のみ「（廃止）」サフィックス付きで表示し、保存時に勝手に削除しない
  - design-assets/screens/{ユーザープロフィール編集.png, 新規会員登録.png} を参照
  - _Requirements: 1.8, 1.9, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.13, 3.14, 3.15, 3.16, 9.3_

- [x] 4.2 発注者情報編集（CLI-021）の差し替え + カテゴリ一括選択 (P)
  - 募集職種を MasterCombobox（multi）+ CategoryBulkSelector に置換し、`recruit_job_types text[]` に label の配列を保存する
  - 「カテゴリ一括選択」と「個別解除」が両立するよう、一括追加分も chip 解除で個別削除可能にする
  - Server Action は「保存直前に SELECT → `validateLabelChanges`」のシーケンスを実装する。Owner / admin のみ実行可（staff は弾く）
  - 廃止項目は編集画面でのみサフィックス付与
  - 個数上限を設けない
  - design-assets/screens/発注者情報編集.png を参照
  - _Requirements: 1.8, 1.9, 7.1, 7.2, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 9.3_

- [x] 4.3 案件投稿/編集フォーム（CLI-003 / CLI-004 共通の job-form）の差し替え (P)
  - 募集職種を MasterCombobox（multi）に置換し、`jobs.trade_types text[]` に保存する
  - 公開時は min(1) 必須（公開ボタンを非活性で抑止）、下書き保存は 0 件可
  - 「カテゴリで一括選択」は提供しない（1 案件は対象を厳選する設計）
  - 編集時は `jobs.trade_types` の現値を初期表示し、廃止項目は編集画面でのみサフィックス付与
  - Server Action は「保存直前に SELECT → `validateLabelChanges`」のシーケンスを実装する
  - design-assets/screens/{募集現場新規登録.png, 募集現場編集.png} を参照
  - _Requirements: 1.8, 1.9, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 9.3_

- [x] 5. 検索系 3 画面の新マスタ参照化（TRADE_TYPES 誤用バグ修正）
- [x] 5.1 CLI-005 ユーザー検索ポップアップ（contractor-search-filter） (P)
  - 対応職種 / 保有スキル / 保有資格の 3 フィルターを MasterCombobox（multi）に置換し、それぞれ正しいマスタを参照する（**TRADE_TYPES 誤用 + ハードコード 10 値の廃止**）
  - 選択 label は URL searchParams に同名キーの繰り返しでエンコードし、Server Component では `Array.isArray(sp.x) ? sp.x : [sp.x]` パターンで復元する
  - 配列カラム（`users.skill_tags` / `user_qualifications.qualification_name`）は `.overlaps()` で OR 検索、関連は `!inner` ジョインで親行を絞り込む
  - 個別 × ボタン / 一括クリア / 検索実行で popup 自動クローズを実装する
  - フィルター状態は URL searchParams を Single Source of Truth とし、`router.back()` の状態不整合を発生させない
  - 上限なし（実用上 10 件程度を想定）
  - design-assets/screens/{募集案件一覧ポップアップ-3.png, 募集案件一覧ポップアップ-4.png} を参照
  - _Requirements: 5.1, 5.2, 5.3, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12_

- [x] 5.2 CON-002 案件検索ポップアップ（job-search-filter） (P)
  - 募集職種フィルターを MasterCombobox（multi）に置換し、`jobs.trade_types` に対して `.overlaps()` で OR 検索を行う
  - URL searchParams を Single Source of Truth とし、`router.back()` の状態不整合を発生させない
  - 全ロール・全プランで同一データ・同一 UI を維持する
  - design-assets/screens/募集案件一覧ポップアップ.png を参照
  - _Requirements: 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 13.4_

- [x] 5.3 CON-005 発注者検索ポップアップ（client-search-form） (P)
  - 募集職種フィルターを MasterCombobox（multi）に置換し、`client_profiles.recruit_job_types` に対して `.overlaps()` + `!inner` ジョインで OR 検索を行う
  - `!inner` ジョインで親行（client_profiles 経由の users）絞り込みが効くことを確認する
  - design-assets/screens/募集案件一覧ポップアップ-2.png を参照
  - _Requirements: 5.4, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 7.4_

- [x] 6. 表示系画面への部品注入（label 保存方式により基本的に既存クエリのまま）
- [x] 6.1 受注者プロフィール詳細・ユーザー詳細の N 件表示 (P)
  - COM-001 と CLI-006 で対応職種・保有資格・保有スキルを CollapsibleList で「主要 N 件 + もっと見る」表示に置換する
  - 0 件のセクションは非表示
  - 表示画面では廃止サフィックスを付与せず、保存値をそのまま表示する
  - マイページ（CON-001）の受注者プロフィールサマリーの trade_type 表示も新マスタ準拠（label 保存のため自動的に整合）
  - design-assets/screens/{ユーザープロフィール詳細.png, ユーザー詳細.png, マイページ.png} を参照
  - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7, 8.1, 8.7, 9.9_

- [x] 6.2 リストカード系（マイリスト / 募集現場一覧）の M 件 + 他 表示 (P)
  - CON-007 マイリスト（案件カード / 発注者カード）と CLI-001 募集現場一覧で `jobs.trade_types` / `client_profiles.recruit_job_types` を SummaryWithOthers で「主要 M 件 + 他」表示に置換する
  - 件数の数値表示は行わず、登録 M 件以下のときは「他」を出さない
  - design-assets/screens/{マイリスト.png, マイリスト-2.png, 募集現場一覧.png} を参照
  - _Requirements: 4.4, 4.8, 4.9, 4.10, 8.8_

- [x] 6.3 発注者の応募・発注管理系 6 画面の M 件 + 他 表示 (P)
  - CLI-007 応募一覧（mypage 導線、status='applied' のみ）/ CLI-007B 案件応募者一覧（jobs/[id]/applicants、全ステータス）で応募者の `user_skills.trade_type` を SummaryWithOthers（M=2）で表示する
  - CLI-008 応募詳細 / CLI-009 発注可否 / CLI-010 発注履歴一覧 / CLI-011 発注履歴詳細で応募者の 3 マスタ項目（対応職種・保有スキル・保有資格）と案件の `jobs.trade_types` を SummaryWithOthers（M=2）で表示する
  - 完全な詳細は「ユーザー詳細」「募集案件詳細」遷移リンクで補完する
  - design-assets/screens/{応募一覧.png, 応募詳細-2.png, 発注可否.png, 発注可否-2.png, 発注可否-3.png, 発注履歴一覧.png, 発注内容詳細.png} を参照
  - _Requirements: 4.4, 4.8, 4.9, 4.10, 8.1, 8.2, 8.3_

- [x] 6.4 スカウト・メッセージ・応募履歴系 5 画面の M 件 + 他 表示 (P)
  - CLI-015 スカウト送信、CON-009 受注者側スカウト詳細 / CLI-013 発注者側メッセージ詳細（共通の `scout-info-card.tsx`）で案件の `jobs.trade_types` を SummaryWithOthers（M=2）で表示する
  - CON-011 応募履歴一覧 / CON-012 応募詳細で案件の `jobs.trade_types` を表示する（受注者側の応募管理）
  - 完全な詳細は「募集案件詳細」遷移リンク（既存の `Link href={/jobs/${jobId}}`）で補完する
  - design-assets/screens/{スカウト送信.png, スカウト詳細.png, 応募履歴.png, 応募詳細.png} を参照
  - _Requirements: 4.4, 4.8, 4.9, 4.10, 8.4, 8.5, 8.6_

- [x] 6.5 案件詳細（CON-003 / CLI-002）と応募フォーム（CON-004）の表示 + 応募可否ガード (P)
  - `jobs.trade_types` を全件カンマ区切り（または「主要 + 折りたたみ」）で表示する
  - CON-003 / CON-004 で 2.6 の `canApplyJob` を呼び、無料ユーザーが対象案件のいずれの trade_type にも自分の対応職種を登録していない場合は応募ボタンを非活性化し理由を明示する（自分の案件 / 同一組織 / staff の場合は別途非表示）
  - CON-004 の Server Action でもサーバ側ガードを再実行する（多層防御）
  - 全ロール・全プランで CON-003 の表示内容・データを同一に保つ
  - design-assets/screens/{募集案件詳細.png, 応募情報入力.png, 募集現場詳細.png} を参照
  - _Requirements: 8.9, 13.1, 13.3_

- [x] 6.6 発注者情報詳細（CLI-020）と発注者一覧/詳細（CON-005 / CON-006）の表示 (P)
  - CLI-020 で `client_profiles.recruit_job_types` を「主要 N 件 + もっと見る」または「全件カンマ区切り」で表示する（デザインカンプ準拠）
  - CON-006 でも `recruit_job_types` を表示する
  - design-assets/screens/{発注者情報詳細.png, 発注者一覧.png, 発注者詳細.png} を参照
  - _Requirements: 7.3, 7.5_

- [x] 7. バリデーション・型・Server Action の整合更新
- [x] 7.1 Zod スキーマと旧 TRADE_TYPES の全廃
  - `src/lib/validations/profile.ts` / `client-profile.ts` から `.enum(TRADE_TYPES)` と `.max(3)` 等の上限制約を撤廃する
  - 「対応職種 1 件以上」の下限のみ維持する（trade-types のみ必須）
  - `src/lib/constants/options.ts` の `TRADE_TYPES` 定数を削除する
  - 案件 Zod は `tradeType: string` → `tradeTypes: string[]` に変更し、公開時 `min(1)` / 下書き時 0 件可
  - _Requirements: 11.1, 11.2, 11.3_

- [x] 7.2 保存系 Server Action の delta validate 統合
  - `profile/edit/actions.ts` / `(auth)/register/profile/actions.ts` / `mypage/client-profile/actions.ts` / `jobs/actions.ts` を「保存直前に previousLabels を SELECT → 2.4 `validateLabelChanges` → 既存 RPC または UPSERT」のシーケンスに統一する
  - 新規登録ルート（previousLabels=[]）でも動作することを担保する
  - 既存 RPC（`update_profile` の `p_skill_tags` / `p_qualifications`）は引数互換のためそのまま流用する
  - エラー時は `{ success: false, error }` で日本語メッセージを返し、UI で `toast.error()` 表示
  - 7.1 の Zod 変更と整合させる
  - _Requirements: 1.8, 1.9, 3.13, 9.3, 11.1_

- [x] 8. seed.sql の刷新と整合性の確保
- [x] 8.1 4 ロール（contractor / client / staff / admin）の seed 値を新マスタに整合
  - `supabase/seed.sql` のテストユーザーの `user_skills.trade_type` / `users.skill_tags` / `user_qualifications.qualification_name` を新マスタの label に書き換える
  - 受注者（無料）は「登録職種 × 登録県」が合致する案件 / 合致しない案件の双方を持つように構成する（応募制限の動作確認用）
  - 発注者（課金済み）は受注者機能・発注者機能の双方をテスト可能にする
  - admin / staff の `org_role` と `users.role` の整合を維持する
  - 招待フロー seed の `email_confirmed_at` ルール（招待中は NULL、登録済みは `password_set_at = now()`）を踏襲する
  - _Requirements: 11.8, 12.1, 12.4_

- [x] 8.2 jobs.trade_types 配列形と client_profiles.recruit_job_types の seed 整合
  - 既存案件の seed を `trade_types text[]` に書き直し、各案件 1〜複数の label を持たせる
  - 発注者の `recruit_job_types` を新マスタの label 配列で再投入する
  - 旧 `TRADE_TYPES` 13 値の参照を全廃する
  - `supabase db reset` で全環境を再構築可能にする
  - _Requirements: 11.8, 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ] 9. テストの更新と新規追加
- [x] 9.1 Vitest ユニット / 統合テスト (P)
  - `parseTradeTypeCategory` の 113 件全件パース、`siblingsInSameMidCategory` の自身除外と deprecated 除外
  - `validateLabelChanges` の delta 検証（added のみ active 必須、既存保有 deprecated 保持、空 previousLabels の新規登録、unknown 検出）
  - `canApplyJob`（matching.ts）の配列 OR 一致全パターン、paid bypass、空配列ガード
  - 保存系 Server Action: `jobs` (createJob/updateJob) と `client-profile` (saveClientProfile) について正常系 + 異常系（unknown label、新規追加 deprecated reject、既存保有 deprecated 保持、認証エラー）を網羅。`profile/edit` (updateProfile) と `register/profile` (registerProfile) は内部で同じ `validateLabelChanges` を呼ぶ実装で、判定ロジック自体は `validate.test.ts` で 10 件カバー済みのため直接テストファイル作成は省略
  - MasterCombobox / CategoryBulkSelector の対話挙動は、本プロジェクトに jsdom / testing-library が未導入であることと、cmdk・Radix Dialog が仮想 DOM では正確に再現しにくいことから、9.3 Playwright E2E（実ブラウザでの操作テスト）でカバーする方針に変更。データ層の `validateLabelChanges` 等は別途 `validate.test.ts` で網羅済み
  - **モックルール**: Server Action 自体を `vi.mock` で差し替えない。Supabase クライアントを `{ data, error }` 形状で正確に再現する。`mockReturnValueOnce` キューが他テストに漏れないよう `mockReset()` で明示クリア
  - _Requirements: 11.6, 11.7, 13.1, 13.2_

- [x] 9.2 pgTAP RLS テスト (P)
  - `supabase/tests/` に `master_*` テーブルの RLS テストを追加する
  - anon / authenticated は SELECT 可（113 / 599 / 244 行返る）、INSERT/UPDATE/DELETE は拒否される
  - service_role は INSERT 可
  - 件数 113 / 599 / 244 の確認も含める
  - pgTAP の UUID は seed.sql と重複させない（テスト専用 UUID を使う）
  - _Requirements: 1.5, 2.7, 11.7_

- [ ] 9.3 Playwright E2E — フォーム入力系 5 シナリオ (P)
  - **受注者 SignUp 経路**: register/profile → 対応職種 cmdk 選択 → 関連候補ピック → 経験年数入力 → 保存 → COM-001 表示
  - **COM-002 編集経路**: 対応職種 3 件 / 保有スキル 5 件 / 保有資格 2 件登録 → COM-001 で「主要 N + もっと見る」確認
  - **上限なし大量登録（必須）**: 保有スキル 10 件 + 保有資格 12 件を 1 回の保存で投入 → COM-001 で「もっと見る」展開して全件表示確認（R3 AC-10 / R11 AC-5 の上限なし保証）
  - **CLI-021 経路**: 募集職種 combobox + カテゴリ一括選択「建築」追加 → 保存 → CLI-020 で表示確認
  - **CLI-004 案件作成**: 新規案件で trade_types 2 件登録 → 公開 → CON-002 検索で投稿案件がヒットすることを確認（投稿〜検索ヒットまでの片道フロー）
  - shadcn Select は `selectOption()` を使わない（`getByLabel().click()` → `getByRole("option").click()` の 2 段クリック）
  - マイページ → メニュー click → 画面到達 の導線スモークを受注者・発注者で含める（`page.goto` 直接遷移だけにしない）
  - 起動前提: `supabase start` + `supabase db reset` + `npm run dev`
  - _Requirements: 3.5, 3.7, 3.8, 3.9, 3.10, 3.14, 3.15, 4.1, 4.3, 6.1, 6.2, 6.8, 7.1, 7.8, 7.9, 11.5, 11.7_

- [ ] 9.4 Playwright E2E — 検索・閲覧・制限系 4 シナリオ (P)
  - **CON-002 案件検索**: 募集職種 2 件選択 → URL searchParams 反映 → `jobs.trade_types` への `.overlaps()` で OR 一致確認
  - **CLI-005 ユーザー検索**: 対応職種 + 保有スキル + 保有資格を複数選択 → URL searchParams 反映 → 3 マスタへの OR 一致確認（TRADE_TYPES 誤用バグの非再発確認）
  - **CON-005 発注者検索**: 募集職種 2 件選択 → `client_profiles.recruit_job_types` への `.overlaps()` + `!inner` で OR 一致確認
  - **廃止項目の表示と除外**: admin で 1 件 deprecated_at を設定 → 受注者編集画面で「（廃止）」サフィックス表示 → 各検索ポップアップ候補から消える → 表示専用画面（プロフィール詳細等）ではサフィックスを出さない
  - **Staff 制限**: Staff の CON-003 応募ボタン非表示確認、Staff が応募 Server Action を呼ぼうとした際の拒否（多層防御確認）
  - フィルター状態は URL searchParams を Single Source of Truth として保持し、`router.back()` 後も検索結果と UI が一致することを検証する
  - shadcn Select は `selectOption()` を使わない（9.3 と同じ規約）
  - 起動前提: `supabase start` + `supabase db reset` + `npm run dev`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8, 5.9, 5.11, 9.2, 9.3, 11.5, 11.7, 13.1, 13.3_

- [ ] 10. ステアリング・CLAUDE.md・周辺 spec の波及更新
- [ ] 10.1 `.kiro/steering/database-schema.md` の更新 (P)
  - `user_skills` / `users.skill_tags` / `user_qualifications` / `client_profiles.recruit_job_types` 関連記述を新マスタ前提に書き換える
  - 「選択肢データ（OptionSets）の方針」セクションで `user_skills.trade_type` / `user_qualifications.qualification_name` を「マスタテーブル参照（label 保存方式）」に移動する
  - `jobs.trade_types text[]` のスキーマ変更とインデックス改修（GIN）を反映する
  - 廃止項目の運用ルール（マスタ廃止は `UPDATE deprecated_at` で行い `DELETE` しない、label 書き換え時の denormalization 整合維持の `UPDATE`、事前移行運用、動的検索候補復活なし）を追記する
  - _Requirements: 9.1, 9.4, 9.5, 9.6, 9.7, 9.8, 15.1, 15.2_

- [ ] 10.2 CLAUDE.md と他 spec の旧記述の全廃 (P)
  - CLAUDE.md 内の「最大 3 件」「`TRADE_TYPES` から選択」関連記述を新マスタ前提の運用ルールに置き換える
  - `.kiro/specs/{matching,profile,job-posting,job-search}/requirements.md` 等の関連記述を更新する
  - `grep "TRADE_TYPES" .kiro/ src/` で本仕様外の参照が残らないことを確認できる状態にする
  - `git grep "jobs.trade_type\b"` で旧カラム名の参照が残らないことも確認する
  - _Requirements: 15.3, 15.4, 15.5_

- [ ] 10.3 スコープ外記述の明示と運用方針記載 (P)
  - ユーザー側「マスタ追加リクエスト」UI を一切置かないことを spec ドキュメントで明示する
  - マスタ管理画面（ADM 系）が本仕様の範囲外であることを明示し、Supabase ダッシュボードでの直接操作で運用することを記載する
  - 「マスタに該当項目がないユーザーの希望」は `contacts` テーブルで受け付ける運用方針を明記する
  - ピン留め・人気度ベースの並び替えは MVP 範囲外で、運用 3〜6 ヶ月後にマスタ採用頻度集計を取って再評価することを記載する
  - _Requirements: 10.1, 10.2, 10.3, 14.1, 14.2, 14.3, 14.4, 13.5_

- [ ] 11. 最終統合確認とリグレッション
  - `npm run test` / `supabase test db` / `npm run test:e2e` を順に再実行し、全 pass を確認する
  - `git grep "TRADE_TYPES"` / `git grep "jobs.trade_type\b"` で旧記述の残存ゼロを確認する
  - 27 改修画面のチェックリストを目視確認し、デザインカンプ（`design-assets/screens/`）との整合を最終チェックする
  - アイコン・ロゴが `assets/icons/` / `assets/images/` のプロジェクト専用ファイルを使用していることを確認する
  - CTA ボタン（`bg-primary`）の文字色が白であること、フォーム要素の背景が `bg-background`（白）であることを確認する
  - 受注者の応募可否ガード（無料ユーザー）が新マスタ配列対応で正しく動作することをブラウザで確認する
  - _Requirements: 11.7, 15.5_
