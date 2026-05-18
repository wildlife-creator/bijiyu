# master-skills 手動テストレポート

実施日: 2026-05-18 〜 2026-05-19
実施者: nozomi（with Claude Opus 4.7）
所要: 約 2 時間

## 目的

master-skills 仕様の自動テスト全 PASS（Vitest 553 / E2E 188 / pgTAP 153）状態から、**E2E では取りこぼしうる観点**を手動で網羅検証する。

E2E が苦手な領域:

- **視覚的な崩れ**（chip 折り返し、長いラベル）
- **キャッシュ挙動**（unstable_cache の TTL / 永続化）
- **UX 誤解**（ボタンラベルの曖昧さ）
- **大量データ体感**（599 件マスタからの検索キビキビ感）
- **複数画面間の整合**（denormalized label が画面 A と B で同じか）

## 構成

| # | フェーズ | 主対象画面 |
|---|---|---|
| 0 | 環境準備 | — |
| 1 | 入力フォーム触感 | COM-002, AUTH-006, CLI-021 |
| 2 | 検索フィルター | CON-002, CLI-005, CON-005 |
| 3 | 廃止運用シナリオ | COM-002, CLI-006, CLI-005, Supabase Studio |
| 4 | 表示画面の網羅 | COM-001, CLI-006, CON-003 |
| 5 | エッジケース | 大量選択・折りたたみ・キーボード操作 |
| 6 | 仕上げ振り返り | — |

## 発見事項

### #1 BackButton 暗黙 submit（🔴 重大・修正済）

- **場所**: `src/components/shared/back-button.tsx`, `src/components/job-search/back-button.tsx`
- **症状**: フォーム内で chip の × を押してから「もどる」ボタンを押すと、本人の意図に反して `updateProfileAction` が発火し、× で削除した chip が DB から消える
- **原因**: `<Button>` に `type` 属性を指定しないと HTML 仕様で `type="submit"` が既定値。フォーム内では「もどる」のクリックで暗黙的にフォーム送信が走る
- **修正**: 両 BackButton に `type="button"` 明示
- **回帰防止**: `e2e/back-button-regression.spec.ts` 追加（contractor3 で × → もどる → DB 不変を assert）
- **再発防止ルール**: CLAUDE.md「フォーム内の `<button>` には必ず `type` を明示する」追加

### #2 CLI-005 件数表示が pre-filter のまま + ページネーション破綻（🟡 中・修正済）

- **場所**: `src/app/(authenticated)/users/contractors/page.tsx`
- **症状**: 検索フィルタを適用してもカード上の「全 13 件」が変わらず、page 2 以降でマッチユーザーが取りこぼされる
- **原因**: PostgREST `.range(offset, offset+19).select({ count: "exact" })` で 20 件 fetch 後、JS で post-filter していた。count は pre-filter の値、ページネーションも pre-filter 件数で動く
- **修正**: **ID 集合の積で AND** 方式のサーバー側フィルタに書き換え
  1. `user_skills` / `user_qualifications` / `user_available_areas` を事前 query して該当 user_id 集合を取得
  2. 複数カテゴリの結果を Set の intersection で AND 絞り込み
  3. メイン query に `.in("id", candidateIds)` で渡す（nested data は完全に返る）
- **再発防止ルール**: CLAUDE.md「一覧画面の検索フィルタはサーバー側で適用すること」追加

### #3 seed.sql skill_tags 重複（🟢 低・修正済）

- **場所**: `supabase/seed.sql:265, 342`
- **症状**: contractor / contractor2 の skill_tags に重複（`内装仕上工 × 2`、`吹付塗装工 × 2`）
- **修正**: 重複削除
- **追加防御**: 通常フローでは MasterCombobox が重複を防ぐが、seed 直書きは経由しないので **Zod 配列フィールドに dedup transform を追加**（#4 と統合）

### #4 Zod 配列 dedup 欠如（🟢 低・修正済）

- **場所**: `src/lib/validations/{profile,auth,client-profile,job}.ts`
- **対象配列**: `skills`（by tradeType）/ `skillTags` / `qualifications` / `availableAreas` / `recruitJobTypes` / `recruitArea` / `workingWay` / `language` / `tradeTypes`
- **修正**: 各配列 schema に `.transform((arr) => Array.from(new Set(arr)))` を追加（オブジェクト配列は tradeType でユニーク化）

### #5 「確認する」ボタンの誤解招くラベル（🟢 低・修正済）

- **場所**: `profile-edit-form.tsx`, `client-profile-edit-form.tsx`
- **症状**: 押下で直接 Server Action を呼んで保存するのに、ラベルが「**確認する**」（プレビュー画面があると誤解する）
- **修正**: 両画面で「**保存する**」に統一。CLI-021 の `isSetup` 分岐も削除
- **関連 E2E**: 5 ファイル合計 11 箇所の `name: "確認する"` を `name: "保存する"` に更新

### #6 `unstable_cache` のファイル永続化（🟡 中・未対応）

- **場所**: `src/lib/master/fetch.ts`（`getActiveTradeTypes` 等）
- **症状**: Supabase Studio で deprecated を変更 → dev サーバー再起動 → 候補が**まだ古い**
- **原因**: Next.js 15 の `unstable_cache` は `.next/dev/cache/fetch-cache/` にハッシュファイルとして永続化される。プロセス再起動だけではキャッシュは消えない
- **手動テスト対応**: `pkill -f "next dev" && rm -rf .next/dev/cache/fetch-cache && npm run dev` の手順
- **本番運用課題**: admin が SQL で deprecate しても**最大 1 時間ラグ**。`revalidateTag('master-skills')` を呼ぶ管理 UI が必要だが、master-skills spec の責務外（ADM-マスタ管理 spec で扱う）
- **memory**: `feedback_unstable_cache_file_persistence.md` に記録

### #7 MasterCombobox 既選択分の候補非表示（仕様維持）

- **場所**: `src/components/master/master-combobox.tsx:62-65`
- **挙動**: multi モードで既に選択済みの chip は候補リストから完全に除外される
- **判断**: 同じ項目を二重押下する事故を構造的に防ぐ意図。仕様維持
- **将来案**: 「✓ 選択済み」マーカー付きで候補に残す UI に変える手はある。優先度低

## 反映先

### コミット

| ハッシュ | タイトル |
|---|---|
| `1d580cf` | fix(master-skills): 手動テストで発見した 4 件のバグ修正 |
| `66b24c3` | ux(profile): 「確認する」→「保存する」+ BackButton 回帰防止 E2E |

### CLAUDE.md 追記

「実装時の必須チェック項目」セクションに 2 ルール追加:

- フォーム内の `<button>` には必ず `type` を明示する
- 一覧画面の検索フィルタはサーバー側で適用すること

### memory

- `feedback_unstable_cache_file_persistence.md`

## 最終テスト状態

| テスト | 結果 |
|---|---|
| Vitest | 553 / 553 PASS |
| Playwright E2E | 189 / 189 PASS（前回 188 + 新規 1）|
| pgTAP | 今回未実施（マイグレーション・seed は不変のため期待 PASS）|

## 残課題 / 次セッション以降

| 課題 | 対応先 |
|---|---|
| `revalidateTag('master-skills')` を呼ぶ admin UI | ADM-マスタ管理 spec の spec-init で扱う |
| 他機能（billing / organization / scout）の同方式 手動テスト | 都度実施 |
| 同種バグの予防テスト拡大（他フォームの BackButton 回帰） | E2E 増強 |

## 教訓

1. **E2E PASS は十分条件ではない**: 自動テストが網羅できるのは「assert で形式化できる挙動」のみ。視覚・体感・UX 誤解・キャッシュ挙動は手動でしか掴めない
2. **「もどる」操作の安全性は構造的に保証する**: HTML 仕様の「button 既定 type=submit」は罠が深い。共通コンポーネントレベルで `type="button"` を強制する
3. **post-filter は規模問題**: 小規模 seed では機能するが、本番スケールで count・pagination が壊れる構造。最初からサーバー側フィルタで実装する
4. **キャッシュ層は admin UI と一体で設計する**: `unstable_cache` + 管理操作 = `revalidateTag` の呼び出し経路が必須。後付けは難しい
