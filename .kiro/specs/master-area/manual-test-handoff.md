# master-area Phase 9 手動テスト 引き継ぎ書

作成日: 2026-05-20
作成者: 前セッション(Claude Opus 4.7)
対象: 新セッションで Phase 9(手動テスト + 発見バグ修正)を実施するエージェント / ユーザー

---

## 0. このドキュメントの読み方

Phase 0〜8 は完了済み。Phase 9 は **機械テストでは取りこぼす UX 観点**を人の目で確認するフェーズ。

本書は次のセクションで構成:

1. 「全体状況」: ここまでの成果と git 状態
2. 「事前準備」: ローカル環境を Phase 9 用に整えるコマンド列
3. 「テストシナリオ」: tasks.md §9 に列挙された 9 シナリオの具体的な手順 + seed UUID/URL
4. 「機械が見落とすもの」: E2E で取りこぼす UX 観点リスト(master-skills Phase 9 の経験を踏襲)
5. 「バグ発見時の対応」: 修正コミットの粒度 / CLAUDE.md ルール追加判断
6. 「最終確認」: 全自動テスト再実行 + manual-test-report.md 作成
7. 「既知の罠 / 注意点」: Phase 4 漏れ / Phase 4.5 周辺漏れ等、過去に踏んだパターンの再発防止メモ

---

## 1. 全体状況

### 完了 Phase

| Phase | 概要 | コミット | テスト結果 |
|---|---|---|---|
| 0 | 既存テスト デグレ無し確認 | — | — |
| 1 | Migrations 1〜3 (master_municipalities 1,897 件 / 新テーブル / RPC / トリガー / DML 移行) | (履歴参照) | — |
| 2 | Lib 層 (fetch / validate-area / format-areas / area-search-clauses / matching 拡張) | (履歴参照) | — |
| 3 | UI 部品 4 種 (AreaPicker / AreaListEditor / AreaList / AreaSummary) | (履歴参照) | — |
| 4 | 入力 7 + Server Actions 5 + 表示 12+ + RPC signature 変更 + Vitest 期待値更新 | (履歴参照) | — |
| 5 | seed.sql 全面更新 | `c6d300b` | — |
| 5.5 | E2E locator 書き換え | `da58325` | E2E 189/189 |
| **6** | Migration 4(旧カラム DROP)+ Phase 4 漏れ 4 ファイル修正 | `4073603` | TS build OK |
| **7** | Migration 検証 SQL / pgTAP 25 件 + 既存 3 ファイル補正 / Vitest 46 件 / E2E 9 シナリオ | `c8321f1` | pgTAP 178 / Vitest 600 / E2E 198 |
| **8** | CLAUDE.md / steering 2 本 / 関連 spec 5 本の波及更新 | `94f509d` | (ドキュメント) |

### git 状態(本書作成時点)

```
main: 94f509d (clean) — origin/main の 24 コミット先
HEAD~2..HEAD: Phase 6 / 7 / 8 のコミット
```

Phase 9 は **clean state から開始**できる。

### 未着手 Phase

- **Phase 9**: 手動テスト + 発見バグ修正 + `manual-test-report.md` 作成(本書の対象)

---

## 2. 事前準備

### 環境起動コマンド(順序固定)

```bash
# 1. Supabase ローカル起動(既に起動済みなら skip)
supabase start

# 2. DB を seed.sql 込みでリセット
supabase db reset

# 3. Migration 検証スクリプトで現状確認(11 アサーション全 PASS を確認)
docker exec -i supabase_db_bijiyu psql -U postgres -d postgres < scripts/verify-master-area-migration.sql

# 4. Next.js dev サーバー起動
npm run dev

# 5. 自動テスト一括実行(デグレ無し確認、新セッション開始時の Task 0 ルール)
npm run test        # Vitest 600/600 PASS 想定
supabase test db    # pgTAP 178/178 PASS 想定
npm run test:e2e    # Playwright 198/198 PASS 想定
```

3 つ全て PASS する前に手動テスト着手しないこと(既存ルール)。

### `.next/dev/cache/fetch-cache` 削除(必要時)

master-area キャッシュタグは `'master-area'`。手動テストで「廃止市区町村が候補に残る」等の挙動を見るときは、`.next/dev/cache/fetch-cache/` を削除して再起動するか、`revalidateTag('master-area')` を別途呼ぶ必要がある(CLAUDE.md「unstable_cache はファイル永続化される」ルール参照)。

---

## 3. テストシナリオ(tasks.md §9 を実体化)

各シナリオに **テストユーザー / URL / 確認観点** を埋め込み、手戻り無くテスト可能な形に仕上げてある。

### シナリオ A: 受注者新規登録(AUTH-006)→ COM-001 表示

- **テストユーザー**: 新規アカウントを作成
- **手順**:
  1. `/register` で新規メールアドレス登録 → メール認証完了 → `/register/profile` 到達
  2. 対応エリアセクションで AreaPicker / AreaListEditor を使い
     - 1 行目: 東京都 + 港区
     - 2 行目: 神奈川県 + (市区町村未指定)
  3. 必須項目を埋めて保存
  4. COM-001(`/profile`)で対応エリアが `東京都港区、神奈川県（市区町村未指定）` で表示されること
- **観点**:
  - AreaPicker の都道府県を選んだ瞬間に市区町村候補が変わるか(候補リストの動的フィルタ)
  - 候補リストのソート順(総務省コード順)が直感的か
  - 候補が大量(東京都=62 件、北海道=170+件)あっても検索キビキビ感があるか

### シナリオ B: 既存受注者の対応エリア編集(COM-002)+ soft cap

- **テストユーザー**: `contractor@test.local` / `testpass123`
- **既存 seed**: 東京都(全域) / 神奈川県(全域) / 千葉県(全域)
- **手順**:
  1. ログイン → `/profile/edit` 到達
  2. 既存 3 件 + 新規 28 件を追加 → 計 31 件にする
  3. 31 件目を追加した瞬間に 「対応エリアが多すぎると…」 警告が出ること(soft cap = 30)
  4. 保存 → COM-001 で全件保存されていること(DB 制約は無いので 31 件 OK)
  5. `/profile/edit` を再オープン → 各行を「×」で削除して 1 件まで減らせること、最後の 1 件で × が disabled
- **観点**:
  - 31 件目で警告が出るタイミング(31 件入力後 → 表示、それとも入力中?)
  - 警告の文言の自然さ
  - 削除時の UX(誤クリック防止 / 確認ダイアログ無しで即削除)
  - 30 件を超えると入力フォームが縦に長すぎないか(スクロール感)

### シナリオ C: 発注者の募集エリア編集(CLI-021)→ CLI-020 表示

- **テストユーザー**: `client@test.local` / `testpass123`
- **既存 seed**: 東京都港区 / 大阪府大阪市北区
- **手順**:
  1. ログイン → `/mypage/client-profile/edit` 到達
  2. 募集エリアを 5 件追加(東京都全域 / 神奈川県横浜市港北区 / 千葉県 / 埼玉県 / 大阪府)
  3. 保存 → `/mypage/client-profile` で表示確認
  4. `/clients/22222222-2222-2222-2222-222222222222` (CLI-020 / CON-006) で受注者から見た募集エリアの見た目を確認
- **観点**:
  - 「東京都全域指定」と「東京都港区」が混在した時のグルーピング表示
    (`東京都（港区）`+`東京都（市区町村未指定）` は formatAreas が `東京都（港区ほか）` 風に統合する想定 — 期待通りか?)
  - CLI-020 の「基本情報」表での折り返し方
  - SP 表示(レスポンシブ)

### シナリオ D: 県跨ぎ案件(CLI-003 / CLI-004)→ CON-002 検索ヒット

- **テストユーザー**: `client@test.local`
- **手順**:
  1. `/jobs/create` (CLI-003) で新規案件
  2. エリアを 「東京都品川区」+「神奈川県横浜市港北区」の 2 件登録
  3. 必須項目埋めて公開
  4. 別タブで contractor1 ログイン → `/jobs/search?prefecture=神奈川県` で当該案件がヒットすること
  5. `/jobs/search?prefecture=東京都` でも同じ案件がヒットすること(県跨ぎ → どちら検索でもヒット)
- **観点**:
  - エリアを 2 件入力する UI の自然さ
  - 公開後、検索結果カードでエリアが `東京都品川区、神奈川県横浜市港北区` 風に表示されるか
  - カードの幅 vs エリア文字列の長さ(折り返し見栄え)

### シナリオ E: 上位包含検索(CON-002)— 東京都のみ検索

- **テストユーザー**: `contractor@test.local`
- **手順**:
  1. ログイン → 「仕事を探す」(`/jobs/search`)
  2. 検索 popup で「東京都」のみ選択(市区町村は未選択)
  3. 結果に以下が **全て** ヒットすること:
     - 県全域指定の案件(seed: 「応募フォームテスト用案件」「スカウトテスト用案件」)
     - 東京都+市区町村指定の案件(seed: 「店舗改装工事の大工作業」=渋谷区、「東京都内マンション内装仕上げ工事」=品川区)
  4. 「大阪府のみ」の案件(seed: 「大阪市商業施設 電気工事」)は **絶対にヒットしない**(R6 異県除外)
- **観点**:
  - 検索 popup の AreaPicker での選択感
  - 検索ボタンを押した時のロード体感
  - 結果カードの「他Nエリア」省略表示が出る案件があるか(「東京都 大型マンション新築 大工工事」は 4 件 → 「他1エリア」になる)

### シナリオ F: 上位包含検索 — 東京都+港区(細かい絞り込み)

- **テストユーザー**: `contractor@test.local`
- **手順**:
  1. `/jobs/search` で 「東京都+港区」検索
  2. ヒットすべき: 「東京都 大型マンション新築 大工工事」(港区を含む) + 県全域指定の案件
  3. **ヒットしてはいけない**: 「店舗改装工事の大工作業」(渋谷区のみ)、「東京都内マンション内装仕上げ工事」(品川区のみ)
- **観点**:
  - 「同県別市区町村のみ」案件が確実に弾かれるか
  - 検索結果数の体感(港区 + 県全域でほどよく絞れるか)

### シナリオ G: 受注者検索(CLI-005)/ 発注者検索(CON-005)

- **CLI-005**: `client@test.local` でログイン → `/users/contractors?prefecture=東京都&municipality=港区`
  - ヒット: contractor2(東京都港区を直接登録) + contractor1(東京都全域) + contractor3(東京都全域) + contractor4(東京都全域)
  - **ヒットしない**: 大阪府のみ・北海道のみ等の受注者
- **CON-005**: `contractor@test.local` でログイン → `/clients?prefecture=神奈川県`
  - ヒット: 神奈川県を募集エリアに含む発注者
- **観点**:
  - 受注者カードのアバター + エリア表示の見た目
  - 検索 popup → 結果反映 → popup を閉じる動作

### シナリオ H: 無料受注者の応募ボタン活性化(都道府県マッチ維持)

- **テストユーザー**: `contractor4@test.local` / `testpass123` (subscriptions レコード無し = 無料)
- **既存 seed**: 対応エリア = 東京都(全域) + 千葉県(全域)、skills = 建築/内装｜木工
- **手順**:
  1. ログイン → `/jobs/88888888-8888-8888-8888-888888888882` (「東京都内マンション内装仕上げ工事」、東京都品川区、内装木工) を開く
  2. 「応募する」ボタンが **活性化** していること(品川区を contractor4 が登録していなくても、東京都全域が登録されているので都道府県マッチで応募可)
  3. 比較: `/jobs/88888888-8888-8888-8888-888888888881` (大阪府の案件があれば) では応募ボタンが非活性化されること
- **観点**:
  - 応募ボタンのテキスト/色/位置(活性 vs 非活性の見え方)
  - 非活性時のツールチップ or 説明文(課金導線が明確か)

### シナリオ I: 案件エリア 10 件上限(クライアント + サーバ両方)

- **テストユーザー**: `client@test.local`
- **手順**:
  1. `/jobs/create` で新規案件
  2. 「+ エリアを追加」を連打して 10 件まで増やす
  3. 10 件目で `+ エリアを追加` ボタンが **disabled** になること
  4. (オプション)DevTools で disabled を外して 11 件目をサーバ送信 → サーバ側で `enforce_job_areas_max` トリガーが拒否すること(エラートースト or バリデーション表示)
- **観点**:
  - disabled 時の見た目(色 / カーソル)
  - サーバ側拒否時のエラーメッセージのユーザーフレンドリー度
  - 10 件入力後のフォームの縦長スクロール感

### シナリオ J: 廃止市区町村 — admin で deprecated_at 設定

- **準備**:
  ```sql
  -- Supabase Studio or psql で実行
  UPDATE master_municipalities
     SET deprecated_at = now()
   WHERE prefecture = '東京都' AND municipality = '港区';
  -- 戻すときは deprecated_at = NULL に UPDATE
  ```
  併せて `.next/dev/cache/fetch-cache/` を削除 or `revalidateTag('master-area')`
- **テストユーザー**: `contractor2@test.local` (既存で東京都港区を保有)
- **手順**:
  1. ログイン → `/profile/edit`
  2. 対応エリア一覧で「東京都港区」の chip に **「（廃止）」サフィックス**が表示されること
  3. 新規行で東京都を選択 → 市区町村候補に 「港区」 が **出ないこと**
  4. 既存の港区を保存しなおして問題なく保存できること(deprecated 保持を許可)
- **観点**:
  - 「（廃止）」サフィックスの視覚的な強調
  - 廃止 muni を削除しようとした時の UX(削除はできるべき)
  - 検索 popup の市区町村候補に廃止 muni が混じっていないか
- **後始末**: テスト終了後に必ず `deprecated_at = NULL` に戻す(他テストが壊れる)

---

## 4. 機械が見落とすもの(UX 観点リスト)

E2E は HTML 構造に対してアサートする。以下は人の目でしか判定できないので意識的に確認:

### 視覚

- AreaPicker の **都道府県 Select** と **市区町村 MasterCombobox** の高さが揃っているか
- AreaListEditor の **「×」削除ボタン**の押しやすさ(指 / マウス両方)
- カード内エリア表示が **1 行に収まらず縦に伸びる**ケース(複数県・長い市区町村名)
- 「他Nエリア」の **N が 0 件で空文字** にならないか
- 同県の県全域 + 市区町村混在表示(`東京都（港区・新宿区ほか）`)が冗長すぎないか

### キャッシュ

- 廃止 muni を deprecated に倒した直後、画面リロードしても候補に残る場合がある(unstable_cache、CLAUDE.md ルール)
- AreaListEditor を開きっぱなしのタブを別タブでマスタ変更後に編集続行すると古い候補が出る可能性

### キーボード / アクセシビリティ

- AreaPicker の都道府県 Select を **キーボードのみ** で操作できるか
- 市区町村 MasterCombobox の検索入力 → 候補絞り込み → Enter で確定の流れ
- 削除ボタンに `aria-label` (`エリア N を削除`) があること、SR(VoiceOver)で読まれる順序

### 大量データ体感

- 47 都道府県の Select が縦長になっていないか(スクロール体感)
- 北海道(170+ 市町村) / 東京都(62 市区町村) を選んだ時の市区町村候補の表示速度
- 30 件のエリア入力済みフォーム全体の縦スクロール量

### 複数画面間の整合(denormalization)

- COM-001 と COM-002 で同じ対応エリアが完全に同じ文字列で表示されるか
- CLI-020(受注者から見る発注者ホーム)と CLI-021(自分が編集する画面)で同じ募集エリアか
- 案件カードと案件詳細(CON-003)でエリア表記が一致するか(`AreaSummary` vs `AreaList`)

---

## 5. バグ発見時の対応

### 修正コミットの粒度

- バグ 1 件 = 1 commit を基本(`fix(master-area): ...` プレフィックス)
- 修正と回帰テスト追加(E2E or Vitest)はセットで同コミットに

### CLAUDE.md ルール追加判断

修正の根本原因が **他機能でも再発しうる** 場合は CLAUDE.md「実装時の必須チェック項目」セクションに学びを追記。判断基準:

- 「この罠は master-area 固有」→ CLAUDE.md には追加しない、`project_master_area_progress.md` memory にだけ追加
- 「この罠は同種の正規化テーブルでも踏みうる(例: nested SELECT 文字列のスペルチェック漏れ)」→ CLAUDE.md に汎用ルールを追加
- master-skills Phase 9 の `BackButton 暗黙 submit` バグが汎用化された(CLAUDE.md「フォーム内の `<button>` には必ず `type` を明示する」)が好例

### memory の更新

- 重要な発見は `project_master_area_progress.md` の「Phase 9 で発見した罠」セクションに追記
- 汎用化できる学びは新規 memory ファイル(`feedback_xxx.md` or `project_xxx.md`)を作成し `MEMORY.md` に index 追加

---

## 6. 最終確認

Phase 9 完了の定義:

1. **9 シナリオ全てのテスト実施記録**を `manual-test-report.md` に記録
   - 形式は `.kiro/specs/master-skills/manual-test-report.md` を参考に「目的 / 構成 / 発見事項」の節構成
   - 各バグは「場所 / 症状 / 原因 / 修正 / 回帰防止 / 再発防止ルール」の 6 項目
2. **全自動テスト再実行で全 PASS** を確認
   - `npm run test` (600+ 件)
   - `supabase test db` (178+ 件)
   - `npm run test:e2e` (198+ 件)
3. tasks.md §9 を `[x]` に更新
4. `project_master_area_progress.md` を「Phase 0〜9 完了」に更新、`MEMORY.md` の index 一行も更新

---

## 7. 既知の罠 / 注意点(過去に踏んだパターン)

### Phase 4 漏れパターン

`jobs.prefecture` / `client_profiles.recruit_area` への参照が画面・Server Action 経由で残存していた件は Phase 6 で 4 ファイル分修正済。ただし以下のパターンは TypeScript で検出できない:

- **nested SELECT 文字列**: `.select("users(*, client_profiles(recruit_area, ...))")` のような template literal の中のカラム名は Supabase 型推論で見逃される。Phase 9 で類似が出てきたら手動 grep + 実行時 4xx で初めて気付くケースがあるので、Server Component の SELECT 文字列を丁寧に確認

### Phase 4.5 周辺漏れパターン

`complete_registration` RPC の signature が `p_areas text[]` → `p_areas jsonb` に変わった件は `auth_rls_and_rpc.test.sql` で 2 箇所漏れていた(Phase 7 で修正)。Phase 9 で類似の signature 変更を発見した場合、`supabase test db` を必ず走らせて確認すること。

### shadcn Select の操作(E2E)

E2E で AreaPicker の都道府県側を操作する場合、`<select>` ではなく Radix UI の `<button role="combobox">` のため:

```ts
await page.locator('[data-slot="select-trigger"]').first().click();
await page.getByRole("option", { name: "東京都" }).click();
```

`selectOption()` は使えない。CLAUDE.md ルール参照。

### seed.sql の `email_confirmed_at` ルール

Phase 9 で新規受注者を作る手動テスト(シナリオ A)を実施する際、招待フロー seed の `email_confirmed_at = NULL` ルールは触らないこと(招待再送 E2E が壊れる)。

### `/jobs/new` は存在しない

正解は `/jobs/create`。tasks.md / requirements にも `CLI-003 / CLI-004` の URL が混在しているので、実装ベースで `/jobs/create` (新規) と `/jobs/[id]/edit` (編集) を使うこと。

### Z3 系の disabled 表現

「+ エリアを追加」ボタンが disabled になっていることを目視確認する際、shadcn Button の disabled は `cursor-not-allowed` + opacity 40% で表現される。「クリックしてみたら反応しない」を別途確認。

### 削除順序(廃止市区町村テスト後)

シナリオ J で `deprecated_at` を NOW() に倒した場合、テスト終了後に必ず NULL に戻すこと:

```sql
UPDATE master_municipalities SET deprecated_at = NULL WHERE prefecture = '東京都' AND municipality = '港区';
```

戻し忘れると後続テストで E2E が落ちる可能性がある。`supabase db reset` でも戻せるが seed 再投入のコストがかかる。

---

## 8. 関連ドキュメント

| ドキュメント | 用途 |
|---|---|
| `.kiro/specs/master-area/requirements.md` | 仕様の意図確認 |
| `.kiro/specs/master-area/design.md` | 設計の意図確認、Testing Strategy 12 シナリオの原典 |
| `.kiro/specs/master-area/tasks.md` | Phase 9 タスクの正本 |
| `.kiro/specs/master-skills/manual-test-report.md` | 報告書のテンプレ参考 |
| `CLAUDE.md` 「対応エリア・募集エリアの設計」 | 開発ルールの参照 |
| `.kiro/steering/database-schema.md` | 新スキーマの正本 |
| `project_master_area_progress.md` (memory) | 進捗とこれまでの罠の蓄積 |

---

## 9. 新セッション起動コマンド(コピペ用)

```
/kiro:spec-impl master-area 9 ultrathink
```

このコマンドを発火すると Phase 9 タスクが選択され、上記準備コマンドから始まる手順に自然に流れる想定。
