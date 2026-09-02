# P6「一覧改修」実装メモ（引き継ぎ・ユーザー承認済み）

作成: 2026-09-02。承認: 同日ユーザー「承認します」（受け入れ条件・設計方針に加え、確認事項 2 点 = 職人一覧と募集現場一覧にも「新着順 / 古い順」のプルダウンを付ける（デザインカンプ CLI-005.png / CLI-001.png に ⇅ アイコンが描かれているため）、案件検索の「新着順」は従来どおり急募 → 新着のまま、を含めて承認）。
**実装は次のセッションで開始する**（このセッションでは調査・設計・承認まで）。→ **2026-09-02 実装完了**（migration `20260902140000_list_plan_rank.sql` / 共通 `SortSelect` + `sort-options.ts` / 8 画面置換 / pgTAP `list_plan_rank.test.sql` / vitest `sort-options.test.ts` / E2E `list-sorting.spec.ts`。seed に `highend-client@test.local` を追加）。
親ドキュメント: `docs/requirements/spec-changes-202608.md` §2.5 / §3 項目 4 / §5（P6 行）。

## 0. ブランチ・進行状況

- 3 層ブランチ運用: ① `staging`（触らない）→ ② `feature/spec-changes-202608`（P1〜P5 マージ済み、origin push 済み）→ ③ フェーズ作業ブランチ
- **P6 の作業ブランチ `p6-list-sorting` は作成済み**（feature から分岐、先頭 = P5 マージコミット `4e79e0e`）。本メモの docs コミットのみ入っている。実装はこれから（新セッションで開始）
- 実装の着手順（推奨）: ① migration（ランク列 + トリガー + 索引 + バックフィル）→ `db reset` → `gen types` → pgTAP ② CON-005 / CON-002 の既定順 ③ 共通 `SortSelect` + `sort-options.ts` ④ 8 画面の置き換え（旧部品削除）⑤ vitest / E2E（既存の並び替え E2E を書き換え）⑥ steering / CLAUDE.md
- P6 のうち「非表示の除外」は P5 で完了済み。残りは (1) プラン順のデフォルト並び、(2) 並び替え UI のプルダウン化

## 1. 受け入れ条件（承認済み）

### A. プラン順の並び（仕様 §2.5(1)）
1. **発注者一覧（CON-005）の既定順**: ハイエンド → プレミアム → その他。各グループ内は新着順
2. **案件一覧（CON-002）の既定順「おすすめ順」**: ①急募オプション ②発注者がハイエンド ③プレミアム → その他。各グループ内は新着順。担当者が作成した案件は**会社（契約主体）のプラン**で判定する
3. プラン変更・解約・銀行振込の有効化・管理運営アカウントの設定など、**契約が変わったら並びも自動で追従する**（手動更新や cron に頼らない）

### B. 並び替え UI のプルダウン化（仕様 §2.5(2)）
4. 共通の並び替えプルダウン部品を 1 つ作り、下表の画面で使う。選択すると即座に並び替わり、ページ番号は 1 に戻る。検索条件（キーワード・エリア等）は保持する。並び順は URL（`?sort=`）を正とする
5. 既存の並び替え軸はそのまま残す。新しく並び替えを持つ画面は下表のとおり最小の軸を定義する

| 画面 | 現状 | プルダウンの選択肢（先頭 = 既定） |
|---|---|---|
| CON-002 案件検索 | ⇅ アイコンで 3 値を順送り（新着 → 報酬高 → 報酬低） | **おすすめ順** / 新着順 / 報酬が高い順 / 報酬が低い順 |
| CON-005 発注者一覧 | 並び替えなし（新着固定） | **おすすめ順**（プラン順） / 新着順 |
| CLI-005 職人一覧 | 並び替えなし（デザインには ⇅ あり） | **新着順** / 登録が古い順 |
| CON-007 マイリスト（案件タブ） | ボタン切替（締切が近い順 / 遠い順） | **応募締め切りが近い順** / 遠い順 |
| CON-011 応募履歴 | ボタン切替 | **新しい順** / 古い順 |
| CLI-007 応募一覧 | ⇅ アイコンのみ（ラベル無し。他の検索条件が消えるバグあり） | **新しい順** / 古い順（バグも修正） |
| CLI-010 発注履歴 / CLI-007B 案件応募者 | ボタン切替（共有部品） | **新しい順** / 古い順 |
| CLI-001 募集現場一覧 | ⇅ アイコンが飾り（押せない） | **新着順** / 古い順（機能として追加） |

6. 対象外: メッセージ一覧（更新順固定・ページングなし）、管理画面の一覧（運営用。ADM-013 の順送りボタンはそのまま）

### C. 品質・その他
7. ページング（18 件 / 20 件・件数表示）と検索条件の絞り込みは現状どおり動く
8. vitest（並び替え部品・URL 生成・ランク計算）/ pgTAP（ランク列の自動更新: 契約作成 / 変更 / 解約 / 担当者作成案件 / 組織作成順）/ E2E（既定順の検証・プルダウン操作・既存の並び替え E2E の書き換え）全通過
9. steering（database-schema / screen-map）・CLAUDE.md 更新

### 意図的な除外
- 評価順など新しい並び替え軸の追加（要望なし）
- メッセージ一覧・管理画面のプルダウン化
- デザインカンプの更新（プルダウンはカンプに無い新 UI。マイリストの「種別」プルダウンと同じ見た目に揃える）

## 2. 設計方針（調査結果に基づく確定事項）

### 2.1 プランランクの持ち方 = 「ランク列 + トリガー」（A 案）
- **`users.list_plan_rank smallint`（0 = その他 / 1 = プレミアム / 2 = ハイエンド）** と **`jobs.owner_plan_rank smallint`** を追加。並び替えは `.order("list_plan_rank", desc)` / `.order("owner_plan_rank", desc)` を既存クエリに 1 行足すだけ
- ランクは `list_plan_rank_of(uid)`（SECURITY DEFINER、`is_paid_user` と同じ構造）で計算: `subscriptions.status IN ('active','past_due')` の `plan_type` が corporate_premium → 2、corporate → 1、それ以外 → 0。**`PLAN_LIMITS.rank`（0〜4）とは別物**（仕様はライト / スタンダード / 無料を同じ「その他」に置くため）
- トリガー: ① `subscriptions` の INSERT / UPDATE(plan_type, status) / DELETE → 契約者の `users.list_plan_rank` と、その契約者の案件（本人名義 + 所属組織の案件）の `owner_plan_rank` を再計算 ② `jobs` の BEFORE INSERT / UPDATE(owner_id, organization_id) → `owner_plan_rank` を設定 ③ `organizations` の INSERT（契約付与の直後に組織が作られるため）→ その組織の案件を再計算。migration 末尾で全件バックフィル
- 契約を書き換える経路は SQL RPC 4 系統 + 管理画面 2 + Webhook + 退会 + cron 由来の計 9 か所あるが、**すべて `subscriptions` への SQL 書き込み**なのでトリガーで漏れなく追従する（TS 側で都度更新する方式は採らない）
- 索引: `jobs (status, is_urgent DESC, owner_plan_rank DESC, created_at DESC) WHERE deleted_at IS NULL`、`users (list_plan_rank DESC, created_at DESC) WHERE deleted_at IS NULL AND is_hidden = false AND role = 'client'`
- **不採用**: ビュー（B）は `subscriptions` の RLS が本人行のみのため invoker 権限では他人のランクが常に 0 になり、definer 権限にすると `users` / `jobs` の RLS を素通りする。RPC（C）は 2 画面分のフィルタ・埋込を SQL に書き直す大改修になる
- 公開される情報: `users.list_plan_rank` は誰でも読める列になるが、並び順とプランバッジから既に推測できる情報なので許容

### 2.2 既定順の適用箇所
- CON-005: `src/app/(authenticated)/clients/page.tsx:188-190` の `.order` を `list_plan_rank desc → created_at desc`（おすすめ順）/ `created_at desc`（新着順）に分岐
- CON-002: `src/app/(authenticated)/jobs/search/page.tsx:231-241` に `recommended`（既定）= `is_urgent desc → owner_plan_rank desc → created_at desc` を追加。既存の `newest`（急募 → 新着）/ `reward_high` / `reward_low` はそのまま

### 2.3 プルダウン部品
- 新規 `src/components/shared/sort-select.tsx`（"use client"）: props = `options: {value,label}[]`、`paramName`（既定 "sort"）、`basePath?`、`ariaLabel`。`useSearchParams` を正として現在値を表示し、`onValueChange` で `router.push`（`page` を削除、他の条件は保持）+ `useTransition` + `PendingOverlay`。見た目はマイリストの `FavoriteTypeSelect`（`h-10 w-40`、shadcn Select）に揃える。`aria-label="並び替え"` を付け E2E は `getByLabel("並び替え")` → `getByRole("option")` で操作
- 各画面の並び順定義は `src/lib/constants/sort-options.ts` に集約（値・ラベル・既定値）。サーバー側は同じ定数で `sort` パラメータを検証（未知の値は既定に倒す）
- 置き換えで不要になる部品を削除: `applications/history/sort-button.tsx`、`applications/orders/sort-button.tsx`、`favorites/favorite-sort-button.tsx`、CON-002 の inline Link、CLI-007 の Link、CLI-001 の飾りアイコン。`src/lib/utils/build-sort-link.ts` は CON-002 でしか使っていないため削除（テストも）

### 2.4 テスト
- pgTAP `supabase/tests/list_plan_rank.test.sql`: 契約作成で 0→2 / プラン変更で 2→1 / 解約で →0 / past_due は維持 / 担当者作成案件が組織オーナーのランクを引き継ぐ / 契約付与 → 組織作成の順でも案件のランクが付く
- vitest: `sort-options` の検証関数、`SortSelect` の URL 生成（既存 `favorite-type-select` の作法に合わせる）
- E2E: seed の発注者（ハイエンド = client@test / プレミアム = 法人四郎 等）で CON-005 の先頭グループ順、急募 + ハイエンド案件が CON-002 の先頭に来ること、各画面のプルダウン操作で URL と並びが変わること。既存の並び替え E2E（job-search / favorites / applications 系）はプルダウン操作に書き換え

## 3. 調査で確定した現状（file:line）

### 3.1 並び替え UI の現状
| 画面 | 並び替え UI | サーバー側 order | ページング |
|---|---|---|---|
| CON-002 `/jobs/search` | inline `<Link>` + icon-sort（`page.tsx:309-325`、`buildSortLinkHref` `:284-293`） | `:232-241`（reward_high / reward_low / 既定 = is_urgent desc → created_at desc） | `.range` 18 件 + count exact |
| CON-005 `/clients` | なし | `:188-190` created_at desc | 18 件 |
| CLI-005 `/users/contractors` | なし（デザインには ⇅） | `:239-241` created_at desc | 18 件 |
| CON-007 `/favorites` | `favorite-sort-button.tsx`（案件タブのみ） | `:96-98, 206-207` recruit_end_date | 18 件 |
| CON-011 `/applications/history` | `history/sort-button.tsx` | `:76` created_at | 全件 → JS slice 18 件 |
| CLI-010 `/applications/orders` / CLI-007B | `orders/sort-button.tsx`（basePath） | `:67` / `:90` updated_at | 全件 → slice 20 件 |
| CLI-007 `/applications/received` | 生の Link + icon のみ（`page.tsx:120-121, 132-134`。jobId 以外の param を落とす） | `:61` created_at | 18 件 |
| CLI-001 `/jobs/manage` | 飾りの `<img>`（`job-list-client.tsx:137-141`） | `:63` created_at desc | 18 件 |
- Select → router.push の既存例: `favorites/favorite-type-select.tsx:30-58`、`applications/history/status-filter.tsx:28-60`、`applications/orders/status-filter.tsx:30-71`
- 無限スクロールは無し（全て `PaginationControls` か独自ページャ）

### 3.2 プラン情報の持ち方
- 契約は契約主体のみが持つ（`subscriptions_unique_active`）。RLS は本人行のみ（`20260324161543_003_rls_policies.sql:363-365`）
- 契約主体の解決: TS `resolve-effective-subscription.ts:38-60`、SQL `20260707120000_is_paid_user_org_aware.sql:33-66`（本人 OR 組織オーナー）
- CON-005 の行は `role='client'` = 契約主体そのもの（担当者は `staff`）→ 本人の契約でよい。案件は `organization_id` があれば `organizations.owner_id`、無ければ `owner_id`（`jobs/actions.ts:262-265`）
- 契約の書き込み経路（トリガーが拾う対象）: `handle_checkout_completed_plan` / `handle_subscription_lifecycle_updated` / `_deleted`（v4）/ `grant-plan.ts` / `bank-subscription-actions.ts` / `handle-subscription-lifecycle.ts`（past_due ↔ active）/ `withdrawal/execute.ts`
- 既存ビューは `admin_proxy_threads` のみ（service_role 専用）。`security_invoker` の前例なし。索引の前例 `20260327100000_010_job_search_indexes.sql`

## 4. 進め方の注意
- 実装後の検証: `npx tsc --noEmit` → `npx vitest run` → `supabase db reset` + `supabase test db` → `npm run dev` + Playwright（一時 config で chromium を指定。コミットしない）
- migration を書いたら `supabase db reset` → `supabase gen types typescript --local > src/types/database.ts`
- E2E のメッセージ送信は `waitForResponse` + 送信制限リトライ（P5 の `e2e/ops-account.spec.ts` 参照）
- コミットはユーザー承認後。完了 → 承認 → ③にコミット → ②へ `--no-ff` マージ → push
