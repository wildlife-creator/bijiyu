# Requirements Document

> **クロスリファレンス (master-area-multi-select)**: 本仕様はエリア機能の DB スキーマ・RPC・マスタ・上位包含検索ロジック・マッチング判定を定義する。**UI 改修** (1 行 = 1 県 + N 市区町村 / または県全域のマルチ選択型 UI への刷新、共通 Zod 統合、`expandAreasForDb` / `collapseAreasFromDb` 純粋関数追加、`area-picker.tsx` 廃止) は別 spec `.kiro/specs/master-area-multi-select/` で実施完了。本 spec の DB / RPC / `buildAreaFilterIds` / `canApplyJob` / `validateAreaChanges` / 表示コンポーネント (`AreaList` / `AreaSummary` / `formatAreas*`) は multi-select 側で**無変更**で踏襲されている。

## Introduction

ビジ友(建設業マッチングサービス)の住所粒度を「都道府県のみ」から「市区町村レベル」に拡張する。既存の `jobs.prefecture` / `user_available_areas.prefecture` / `client_profiles.recruit_area` は都道府県粒度で運用されており、「港区の現場」と「練馬区の現場」を判別できない。本機能により、受注者の対応エリア、発注者の募集エリア、案件の現場住所、検索フィルタすべてを市区町村粒度で扱えるようにし、マッチング精度と検索体験を向上させる。

無料受注者の応募制限ロジックは互換性維持のため都道府県マッチのままとし、市区町村は表示・検索専用とする。個人住所(`users.prefecture`)はプライバシー観点で据え置く。マスタデータは総務省「市町村コード・特別区コード」(令和6年1月1日更新)由来の **1,898 件** を初期値とし、master-skills と同じ `deprecated_at` パターンで廃止管理する。

実装方針(別テーブル正規化、上位包含検索、複数登録対応、最大10件制約 等)は事前合意済み。詳細は本ドキュメント中の各要件を参照。

## Project Description (Input)

詳細は `spec.json` および本ファイル冒頭の Introduction を参照。事前合意事項一覧:

- 適用範囲: 案件・受注者対応エリア・発注者募集エリア・検索フィルタすべて
- 制限判定: 都道府県マッチを維持(`src/lib/matching.ts` は変更しない)
- 個人住所 `users.prefecture`: 据え置き
- 案件エリア: 複数登録 + 県跨ぎOK + 別テーブル `job_areas` で正規化
- マスタ: `master_municipalities (prefecture, municipality, deprecated_at)` 2 カラム
- 政令市の区: 「札幌市中央区」「横浜市港北区」のような結合表記
- 検索: 上位包含ルール
- 受注者対応エリアも `user_available_areas.municipality` カラム追加で対称化
- 既存データ移行: 一気に切り替え(後方互換コード持ち込まず)

## Requirements

### Requirement 1: 市区町村マスタの管理

**Objective:** As a 管理者, I want 市区町村マスタを一元管理する, so that ユーザー入力の表記揺れを防ぎ、市町村合併等による廃止市区町村に対応できる

#### Acceptance Criteria

1. The master-area system shall `master_municipalities (prefecture, municipality, deprecated_at)` の 2 + 1 カラム構成で市区町村マスタを管理する
2. The master-area system shall 総務省「市町村コード・特別区コード」(令和6年1月1日版) 由来の 1,897 件を初期データとして投入する(政令指定都市本体 20 件は除外、行政区 171 件のみ含める。CSV は 1,898 行だが `(北海道, 泊村)` の重複 1 ペアを dedupe して 1,897。詳細は research.md §5.1)
3. The master-area system shall 政令指定都市の行政区を「札幌市中央区」「横浜市港北区」のような単一ラベルの結合表記で保持する
4. The master-area system shall 東京都の島嶼部の村(青ヶ島村・小笠原村・利島村等 8 村)を含める
5. The master-area system shall マスタの並び順を総務省「全国地方公共団体コード」順(団体コード昇順)で保持する。政令市本体の直後に区が連続して並ぶ自然順序となる
6. The master-area system shall マスタの追加・廃止は SQL マイグレーションで手動管理する(専用 admin UI は本仕様では作成しない。将来必要になれば別途追加)
7. Where 市町村合併等で市区町村が廃止される, the master-area system shall `deprecated_at` に廃止日時を記録し、新規登録の選択肢から除外する
8. While 既存登録ユーザー/案件が廃止市区町村を保持している, the master-area system shall データを削除せず保持し、編集画面では「(廃止)」サフィックスを付けて表示する
9. The master-area system shall 総務省データの定期自動同期機能を提供しない(必要時に手動マイグレーション)

### Requirement 2: 受注者の対応可能エリアの市区町村化

**Objective:** As a 受注者, I want 都道府県だけでなく市区町村レベルで対応可能エリアを登録できる, so that 発注者により細かい希望範囲を伝えられ、スカウト精度が上がる

#### Acceptance Criteria

1. The master-area system shall `user_available_areas` テーブルに `municipality TEXT NULL` カラムを追加する
2. The master-area system shall `user_available_areas.prefecture` を NOT NULL のまま維持する
3. When 受注者が AUTH-006(新規会員登録情報入力)または COM-002(プロフィール編集)でエリアを編集する, the master-area system shall 都道府県プルダウンと連動した市区町村複数選択 popup を表示する
4. While 都道府県が未選択, the master-area system shall 市区町村の選択肢を非活性または非表示にする
5. When 受注者が市区町村を未指定で都道府県のみを登録する, the master-area system shall `municipality = NULL` で保存し、「県内全域(市区町村未指定)」を意味するレコードとして扱う
6. The master-area system shall 受注者の対応可能エリア登録件数に DB 制約を設けない(都道府県・市区町村ともに無制限)
7. While 受注者の対応可能エリア登録総数が 30 件を超える, the master-area system shall UI 上に「対応エリアが多すぎると絞り込み効果が薄れます」等の警告を表示する(保存は許可する soft cap)
8. The master-area system shall AUTH-006 の現状 Checkbox 47件グリッド UI を ▶ Popup 形式(COM-002 と同形式)に統一する
9. When 受注者が「東京都全域」と「東京都港区」を同時に登録する, the master-area system shall 両方のレコード保持を許可する(重複排除は表示ロジックで吸収)
10. When 受注者が対応エリアを保存する, the master-area system shall Server Action 内で受信した全 `(prefecture, municipality)` ペアが `master_municipalities` に存在することを検証し、不在のペアがあればエラーを返す(`deprecated_at IS NOT NULL` の既存登録は例外的に保持を許可)

### Requirement 3: 発注者の募集エリアの市区町村化

**Objective:** As a 発注者, I want 都道府県だけでなく市区町村レベルで募集エリアを登録できる, so that 受注者により正確な募集範囲を伝えられる

#### Acceptance Criteria

1. The master-area system shall 既存 `client_profiles.recruit_area TEXT[]` カラムを削除する
2. The master-area system shall 新テーブル `client_recruit_areas (client_id, prefecture, municipality NULL)` に正規化する
3. When 発注者が CLI-021(発注者情報編集)で募集エリアを編集する, the master-area system shall 都道府県プルダウンと連動した市区町村複数選択 popup を表示する
4. When 発注者が市区町村を未指定で都道府県のみを登録する, the master-area system shall `municipality = NULL` で保存する
5. The master-area system shall 発注者の募集エリア登録件数に DB 制約を設けない
6. While 発注者の募集エリア登録総数が 30 件を超える, the master-area system shall UI 上に警告を表示する(soft cap)
7. When 発注者が募集エリアを保存する, the master-area system shall Server Action 内でマスタ整合性検証を行う(Requirement 2-10 と同様)

### Requirement 4: 案件エリアの市区町村化と複数登録

**Objective:** As a 発注者, I want 1 案件で複数の市区町村(県跨ぎを含む)を登録できる, so that 複数現場・巡回点検等の実務ケースを正確に表現できる

#### Acceptance Criteria

1. The master-area system shall 既存 `jobs.prefecture` カラムを削除する
2. The master-area system shall 新テーブル `job_areas (job_id, prefecture, municipality NULL)` に正規化する
3. The master-area system shall 1 案件で複数の都道府県にまたがるエリア登録を許可する(県跨ぎOK)
4. The master-area system shall 1 案件あたり最大 10 件までのエリア登録を許可する(DB 制約)
5. The master-area system shall 1 案件に最低 1 件以上のエリア登録を必須とする
6. When 発注者が CLI-003(募集現場編集)または CLI-004(募集現場新規登録)で案件を作成・編集する, the master-area system shall 動的にエリア行を追加・削除できる UI を提供する
7. When 発注者が案件作成時に「市区町村未指定」を選択する, the master-area system shall `municipality = NULL` で保存し、「現場未定」「複数現場(詳細別途連絡)」等の意味を持たせる
8. The master-area system shall CLI-004 の既存「勤務地」自由入力テキストフィールドを維持し、番地以下の詳細住所入力用フィールドとして共存させる(エリアフィールドとは別管理)
9. When 発注者が案件を保存する, the master-area system shall Server Action 内でマスタ整合性検証を行う(Requirement 2-10 と同様)

### Requirement 5: エリア表示の統一ルール

**Objective:** As a ユーザー(全ロール), I want 案件カード・プロフィール詳細等で市区町村レベルのエリアを統一フォーマットで見られる, so that 視認性と理解しやすさが向上する

#### Acceptance Criteria

1. The master-area system shall 単一エリアの表示を「{都道府県}{市区町村}」の結合形式で行う(例: 「東京都港区」)
2. While 市区町村が未指定(NULL), the master-area system shall 「{都道府県}(市区町村未指定)」の形式で表示する
3. While 案件カード・ユーザーカード・発注者カード等の限定スペース表示, the master-area system shall 最初の 3 件まで表示し、4 件以上は末尾に「他 N エリア」と省略表示する
4. While 詳細画面(案件詳細 CON-003 / CLI-002、ユーザー詳細 CLI-006 / COM-001、発注者詳細 CON-006 / CLI-020), the master-area system shall 全エリアを省略せず展開表示する
5. The master-area system shall ヘルパー関数 `formatAreas()` を共通化し、全表示箇所で同一ロジックを使用する
6. The master-area system shall 受注者の対応エリアで「東京都全域」と「東京都港区」が両方登録されている場合、表示時に「東京都(港区指定あり)」のような重複吸収表現を採用する

### Requirement 6: 検索フィルタの上位包含

**Objective:** As a ユーザー, I want 市区町村で絞り込み検索しても、その県全域を対象に登録したユーザー/案件も結果に含まれる, so that 移行直後でも結果の取りこぼしがない

#### Acceptance Criteria

1. When ユーザーが検索条件として都道府県のみ指定する, the master-area system shall その都道府県を含む全案件/全ユーザーを結果に含める(市区町村未指定レコードも含む)
2. When ユーザーが「都道府県 + 市区町村」で検索する, the master-area system shall 以下の両方を結果に含める: (a) 該当市区町村が登録されたレコード、(b) 同一都道府県で `municipality IS NULL` のレコード(全域指定)
3. The master-area system shall CON-002(案件検索 popup)、CON-005(発注者検索 popup)、CLI-005(職人検索 popup)の検索条件に都道府県プルダウン + 市区町村プルダウン(任意)の階層フィルタを提供する
4. While 都道府県が未選択, the master-area system shall 市区町村プルダウンを非活性化する
5. The master-area system shall 検索クエリを `EXISTS` サブクエリで実装し、`count` とページネーションが正しく動作することを保証する
6. The master-area system shall 既存の post-filter(JS 側 fetch 後絞り込み)パターンを使わない
7. The master-area system shall 検索条件を URL searchParams(例: `?prefecture=東京都&municipality=港区`)で表現し、ブラウザ戻る・共有・ブックマークに対応する

### Requirement 7: 無料受注者の応募制限の維持

**Objective:** As a プロダクトオーナー, I want 無料受注者の応募制限を都道府県マッチのまま維持する, so that 既存無料ユーザーの応募可能案件数が急減せず、課金ハードルが意図せず上がらない

#### Acceptance Criteria

1. The master-area system shall `src/lib/matching.ts` の応募可否判定ロジックを都道府県マッチのまま維持する
2. When 無料受注者が案件の応募ボタン活性化判定を受ける, the master-area system shall 受注者の対応都道府県の集合と案件の現場都道府県の集合に共通要素があれば応募可能と判定する
3. The master-area system shall 市区町村レベルでの応募可否判定を行わない(将来の機能拡張余地として保持)
4. If 開発者が将来このロジックを市区町村マッチに変更しようとする, the master-area system shall CLAUDE.md の「マッチング判定は都道府県のまま」ルールに従って当該変更を実施しない

### Requirement 8: 既存データの移行とスキーマ変更

**Objective:** As a 運用者, I want 既存データを後方互換コードなしで一気に新スキーマへ移行する, so that 運用負荷を最小化し、コードを単純に保つ

#### Acceptance Criteria

1. When マイグレーションが実行される, the master-area system shall 以下の順序で実施する: (a) `master_municipalities` テーブル作成 + シード投入、(b) `job_areas` / `client_recruit_areas` テーブル作成、(c) 既存データ移行、(d) 旧カラム削除、(e) インデックス再構築
2. When マイグレーションが実行される, the master-area system shall 既存 `jobs.prefecture` の値を `job_areas` の 1 行 (`municipality = NULL`) として移行する
3. When マイグレーションが実行される, the master-area system shall 既存 `client_profiles.recruit_area TEXT[]` の各要素を `client_recruit_areas` の 1 行ずつ (`municipality = NULL`) に展開して移行する
4. When マイグレーションが実行される, the master-area system shall 既存 `user_available_areas` の各行を保持し、`municipality` カラムを追加して NULL で初期化する
5. The master-area system shall マイグレーション完了後、`jobs.prefecture` と `client_profiles.recruit_area` の旧カラムを削除する
6. While 移行後の既存案件・ユーザー(市区町村未指定状態), the master-area system shall Requirement 6 の上位包含ルールにより、市区町村絞り込み検索でも結果に含める
7. The master-area system shall seed.sql のテストデータを新スキーマに合わせて更新する(都道府県のみのレコードと市区町村まで指定したレコードを両方含める)
8. The master-area system shall 既存 `idx_jobs_search (status, prefecture)` を `(status)` ベースに再構築し、`job_areas (prefecture, municipality)` 複合インデックスを追加する
9. The master-area system shall `client_recruit_areas (prefecture, municipality)` および `user_available_areas (prefecture, municipality)` に検索用複合インデックスを追加する

### Requirement 9: 個人住所のスコープ外維持

**Objective:** As a 受注者, I want 個人住所(`users.prefecture`)はプライバシー観点で都道府県のままにする, so that プロフィール表示で過度に詳細な住所が公開されない

#### Acceptance Criteria

1. The master-area system shall `users.prefecture` カラムを変更せず、市区町村レベルへの拡張を行わない
2. The master-area system shall AUTH-006 / COM-002 の「お住まい」フィールドを単一プルダウン(都道府県のみ)のまま維持する
3. The master-area system shall COM-001(プロフィール詳細)/ CLI-006(ユーザー詳細)等の表示で「お住まい: {都道府県}」のフォーマットを維持する

### Requirement 10: マスタ取得・キャッシュ・UI コンポーネント

**Objective:** As a 開発者, I want マスタデータを効率的に取得・キャッシュし、再利用可能な連動 UI を提供する, so that 全画面で一貫した実装と高速なレスポンスを実現する

#### Acceptance Criteria

1. The master-area system shall 都道府県別の市区町村リスト取得関数 `getActiveMunicipalitiesByPrefecture(prefecture)` を `src/lib/master/fetch.ts` に提供する
2. The master-area system shall マスタ取得関数を `unstable_cache` でキャッシュし、`'master-area'` タグで一括無効化可能にする
3. When 開発者がマスタを更新する SQL マイグレーションを実行する, the master-area system shall キャッシュタグ `'master-area'` を `revalidateTag` で無効化する手順をドキュメント化する
4. The master-area system shall master-skills の `MasterCombobox` パターンを拡張または流用し、都道府県+市区町村の連動プルダウン UI コンポーネント(例: `AreaPicker`)を提供する
5. The master-area system shall 連動プルダウン UI を 7 つの入力画面(AUTH-006 / COM-002 / CLI-003 / CLI-004 / CLI-021 / CON-002 popup / CON-005 popup / CLI-005 popup)で共通利用する

### Requirement 11: RLS ポリシー

**Objective:** As a セキュリティ担当者, I want 新規 3 テーブルに適切な RLS ポリシーを設定する, so that 不正な読み書きを防ぐ

#### Acceptance Criteria

1. The master-area system shall `master_municipalities` に対し、全認証ユーザー SELECT 可、INSERT/UPDATE/DELETE は不可(マイグレーションでのみ更新)の RLS ポリシーを設定する
2. The master-area system shall `job_areas` に対し、SELECT は全認証ユーザー可、INSERT/UPDATE/DELETE は親案件(`jobs.owner_id` または同一組織メンバー)のみ可の RLS ポリシーを設定する
3. The master-area system shall `client_recruit_areas` に対し、SELECT は全認証ユーザー可、INSERT/UPDATE/DELETE は所有発注者本人のみ可の RLS ポリシーを設定する
4. The master-area system shall RLS ポリシー内で自テーブル SELECT サブクエリを使わない(無限再帰回避、CLAUDE.md 既存ルール準拠)
5. The master-area system shall pgTAP テストで上記 RLS ポリシーを検証する(SELECT 可否、INSERT/UPDATE/DELETE のサイレントブロック含む)

### Requirement 12: テスト

**Objective:** As a 開発者, I want 全レイヤーで網羅的なテストを書く, so that 移行・新規機能・既存機能のデグレを早期に検出できる

#### Acceptance Criteria

1. The master-area system shall pgTAP テストで `master_municipalities` / `job_areas` / `client_recruit_areas` の RLS ポリシーを検証する
2. The master-area system shall Vitest で `getActiveMunicipalitiesByPrefecture` / `formatAreas` / `validateLabelChanges` 拡張 / 検索クエリビルダー等のユニットテストを実装する
3. The master-area system shall Vitest で Server Action の正常系・異常系(マスタ整合性違反、上限超過、必須欠落)を実装する
4. The master-area system shall Playwright E2E で以下のユーザーストーリーを網羅する:
   - 受注者が COM-002 で市区町村まで対応エリアを登録 → 検索結果に反映
   - 発注者が CLI-004 で複数エリア + 県跨ぎの案件を作成 → CON-002 検索でヒット
   - 受注者が CON-002 で「都道府県のみ」検索 → 「都道府県のみ登録」「市区町村まで登録」の両案件がヒット(上位包含)
   - 受注者が CON-002 で「都道府県 + 市区町村」検索 → 市区町村マッチ + 同県全域指定の両案件がヒット
   - 無料受注者が「東京都対応」のみ登録 → 「東京都港区」案件にも応募ボタン活性化(都道府県マッチ維持の確認)
   - 案件カードでエリア 4 件以上のとき「他 N エリア」省略表示が出る
   - 対応エリア 30 件超で UI 警告が出る(soft cap 確認)
5. The master-area system shall 新機能の spec-impl 開始時に既存全テスト(`npm run test` / `supabase test db` / `npm run test:e2e`)が通ることを確認する

### Requirement 13: ドキュメントと周辺 spec の波及更新

**Objective:** As a 開発者, I want CLAUDE.md / steering / 関連 spec を更新して、本仕様の設計判断を将来の改修者に伝える, so that 「マッチング判定は都道府県のまま」等のルールが守られ続け、spec と実装の乖離を防ぐ

#### Acceptance Criteria

1. The master-area system shall CLAUDE.md の「実装時の必須チェック項目」セクションに以下のルールを追加する:
   - マッチング判定は都道府県のまま。`src/lib/matching.ts` を市区町村レベルに引き上げてはならない
   - 検索クエリは上位包含ルールに従う(市区町村絞り込みでも同県全域指定を含める)
   - 個人住所 `users.prefecture` は市区町村化しない
   - 新規エリア入力 UI は `AreaPicker` 等の共通コンポーネントを利用すること
2. The master-area system shall `.kiro/steering/database-schema.md` を新スキーマ(`master_municipalities` / `job_areas` / `client_recruit_areas`、`users.prefecture` 据え置き、`client_profiles.recruit_area` 削除)に合わせて更新する
3. The master-area system shall `.kiro/steering/design-system.md` または `.kiro/steering/design-rule.md` に階層プルダウン UI コンポーネントの使用ルールを追記する
4. The master-area system shall 関連 spec(matching / job-search / job-posting / profile / billing 等)の記述で「都道府県」前提の箇所を「都道府県+市区町村」に更新する波及更新を tasks.md の最終フェーズで実施する(master-skills の Phase 10〜11 と同じ進め方)
5. The master-area system shall デザインカンプ(`design-assets/screens/` の PNG)は実装フェーズと並行して更新せず、本仕様の実装完了後にまとめて差し替える(実装中は Claude が ASCII モック等で都度確認する。これは Non-Goals に近い運用方針)

## Non-Goals

本仕様の対象外:

- 個人住所 `users.prefecture` の市区町村化(プライバシー観点で別判断)
- マッチング判定ロジック(`src/lib/matching.ts`)の市区町村レベル拡張
- マスタ管理専用の admin UI(SQL マイグレーションで運用、将来必要なら別途追加)
- 総務省データの自動同期(必要時に手動マイグレーション)
- 市町村合併の自動検知・データ移行(都度手動対応)
- 海外住所対応(国内47都道府県のみ)
- 郵便番号・経緯度等の追加属性管理
- スカウト送信(CLI-014 / CLI-015)へのエリアフィルタ追加(現状実装で使用しておらず影響なし。CLI-005 経由の間接影響のみ)
- PNG デザインカンプの先行更新(実装完了後にまとめて差し替え)

## 関連 spec

- `.kiro/specs/master-skills/` — マスタテーブル設計・`MasterCombobox` パターン・`validateLabelChanges` パターン・`unstable_cache` + タグ無効化の参照元。本仕様は master-skills と同じ運用パターンを踏襲する。
- 波及更新対象(tasks.md の最終フェーズで実施): matching / job-search / job-posting / profile / billing 等の既存 spec

## 関連ファイル

事前棚卸し済み影響範囲:

- DB: `supabase/migrations/`(新規マイグレーション 1〜2 ファイル想定。順序は Requirement 8-1 参照)
- 入力 UI(7 画面): `src/app/(auth)/register/profile/register-profile-form.tsx`(AUTH-006), `src/app/(authenticated)/profile/edit/profile-edit-form.tsx`(COM-002), `src/components/jobs/job-form.tsx`(CLI-003 / CLI-004), `src/app/(authenticated)/mypage/client-profile/edit/client-profile-edit-form.tsx`(CLI-021), `src/app/(authenticated)/jobs/search/job-search-filter.tsx`(CON-002), `src/app/(authenticated)/clients/client-search-form.tsx`(CON-005), `src/app/(authenticated)/users/contractors/page.tsx`(CLI-005)
- 表示(8+ 箇所): 案件詳細(CON-003 / CLI-002)、ユーザー詳細(CLI-006 / COM-001)、発注者詳細(CON-006 / CLI-020)、案件カード(`components/job-search/job-list-card.tsx` 等)、職人カード、発注者カード、スカウト情報カード(`components/messaging/scout-info-card.tsx`)、メッセージスレッド(`applications/orders/[id]/page.tsx`)、マイリスト(CON-007)
- マッチング: `src/lib/matching.ts`(変更しないが、ロジック把握用)
- マスタ取得: `src/lib/master/fetch.ts`(新関数追加)、`src/lib/master/validate.ts`(拡張)
- 定数: `src/lib/constants/options.ts`(`PREFECTURES` 定数は保持)
- 影響なし(確認済み): `src/app/(authenticated)/messages/scout-send/`(CLI-015)、`src/app/(authenticated)/messages/bulk-send/`(CLI-014)

## マスタデータ調達結果(参考)

総務省 CSV 調達結果(タスク 1 で確認済み):

- ダウンロード元: https://www.soumu.go.jp/main_content/000925835.xlsx
- 更新日: 令和6年1月1日
- 整形後の最終マスタ件数: **1,898 件**
- 都道府県別偏り: 北海道 194 件(最多)、富山県 15 件(最少)、東京都 62 件
- ローカル保存: `tmp/master-area-research/municipalities.xlsx` および `municipalities.csv`(seed 投入用に活用)
