# 実装ギャップ分析 — organization-scoping-consistency

要件（requirements.md Req 1〜10）と既存コードベースの差分を分析し、設計フェーズへの示唆をまとめる。

## Analysis Summary

- **ほぼ既存パターンの横展開**。会社単位化の正準パターン（`jobs/manage/page.tsx` の orgMember 分岐）と、認可の組織フォールバック（`acceptApplicationAction` / `applications/received/[id]`）が**すでに存在**するため、6件の読み取り/認可修正は「既存パターンのコピー＝拡張」で対応可能。新規概念はほぼ無い。
- **唯一の新規スキーマは `client_reviews.organization_id`（案C）**。書き込み（`submitContractorReportAction`）は `job.organization_id` を既に取得済みのため値は手元にあり、追加は軽微。backfill は `client_reviews→applications→jobs` の単純結合。
- **注意点は2つ**: ①`bulk-send` が **client component**（ブラウザ `createClient`）で、閲覧者の組織IDをどう解決するか（クライアント側 lookup か server 移譲か）が設計判断。②`bulk-send` の「相手＝職人」判定は組織スレッドでは `participant_2` 固定に直さないと誤った相手を拾う（要件 6.3 の核心）。
- **org 解決の非対称**: 「閲覧者自身の組織」はセッションクライアントで取れる（RLS `is_same_org` が自分の membership を許可）。「他者（CON-006 の対象発注者）の組織」は admin client が必要で、既に `resolveTargetOrganizationId` が存在・CON-006 で算出済み。
- **影響範囲は限定的**: `fetchClientReputation` の本番呼び出し元は1箇所、RLS 変更なし、`owner_id`/`reviewee_id` 不変。Effort 合計 **M**、Risk **Low〜Medium**。

## 1. 現状調査（Current State）

### 再利用できる既存資産（正準パターン）
| 資産 | 場所 | 用途 |
|---|---|---|
| 読み取りの orgMember 分岐 | `jobs/manage/page.tsx:36-72`、`messages/scout-send/page.tsx:67-71`、`billing/page.tsx:136-140` | 「組織なら organization_id、無ければ owner_id」。Req 2/3/4/6 の雛形 |
| 認可の組織フォールバック | `applications/received/[id]/page.tsx:63-86`、`jobs/[id]/page.tsx:147-161`(CLI-002)、`jobs/[id]/applicants/page.tsx`(CLI-007B)、`applications/actions.ts:273-289`(accept) | `isOwner \|\| isOrganizationMember`。Req 5/9 の雛形 |
| 他者組織の解決ヘルパー | `src/lib/job-inquiry/resolve-context.ts` `resolveTargetOrganizationId` / `resolveViewerOrganizationId`（admin client） | Req 2（CON-006）で既に `targetOrgId` 算出済み・再利用 |
| 評判集計関数 | `src/lib/client-review/aggregate.ts` `fetchClientReputation` / `summarizeReputation`(純粋関数) | Req 8 の拡張対象。本番呼び出しは `mypage/client-profile/page.tsx` の1箇所のみ |
| 書き込み時の job 取得 | `applications/actions.ts` `getApplicationWithDetails`（jobs に `owner_id, organization_id` を含む） | Req 7 で `submitContractorReportAction` が `job.organization_id` を即保存可能 |

### 規約・統合面
- ページは Server Component で `createClient()`（セッション）／変更は Server Action。`bulk-send` のみ `"use client"` + ブラウザ `createClient()`。
- 移行命名は `YYYYMMDDHHMMSS_name.sql`（最新 `20260602100000`）。新規は `20260603xxxxxx_client_reviews_organization_id.sql` 相当。
- RLS: jobs UPDATE/SELECT・message_threads/messages は既に `is_same_org` 組織対応済み（変更不要）。`client_reviews` の SELECT は `can_view_client_review`（reviewer/reviewee本人/同一組織）で、組織メンバーは閲覧可＝自分用集計に追加RLS不要。
- テスト配置: Vitest `src/__tests__/`、pgTAP `supabase/tests/`、E2E `e2e/`。client_reviews は `supabase/tests/matching_rls.test.sql` で参照。
- seed: org 55555555（鈴木工務店）owner=22222222 / staff=33333333 / admin=ee111111。既存 `client_reviews` 4件は**全て reviewee=22222222（Owner）**。staff案件 885/886 は**応募ゼロ**。

## 2. Requirement-to-Asset Map（ギャップタグ: Constraint / Missing / Decision）

| Req | 既存資産 | ギャップ | タグ |
|---|---|---|---|
| 1 不変条件/非回帰 | 正準パターン群 | owner_id/reviewee_id 不変・個人プラン非回帰・count/data 同一スコープを全修正で順守 | Constraint |
| 2 CON-006 掲載案件 | `clients/[id]/page.tsx` + 既算出 `targetOrgId` | `.eq("owner_id",id)`→ org 分岐。`targetOrgId` を jobs クエリ前へ移動（現在は後段で算出） | Constraint |
| 3 CLI-007 応募一覧 | `applications/received/page.tsx`（org未解決） | 閲覧者 org の inline lookup を追加 → `jobs.organization_id` 分岐。**count/data 両クエリ**に適用 | Missing(小) |
| 4 CLI-010 発注履歴 | `applications/orders/page.tsx`（org未解決） | 同上（JS側ページングだが WHERE 切替のみ） | Missing(小) |
| 5 CLI-011 発注内容詳細 | 姉妹 `received/[id]:63-86` | org フォールバックを移植 | Missing(小) |
| 6 CLI-014 一斉送信 | `bulk-send/page.tsx`(client) | ①閲覧者 org 解決手段 ②org スレッド収集 ③相手=participant_2 固定 | **Decision** |
| 7 評価データ基盤(案C) | `client_reviews`型 / `submitContractorReportAction` / 移行 | 列新設＋index、insert で `job.organization_id` 保存、backfill 移行 | Missing |
| 8 CLI-020 評判集計 | `fetchClientReputation` / `client-profile/page.tsx`(org既解決) | 引数を org/個人で分岐（`organization_id` or `reviewee_id`）。ページは既に `organizationId/orgRole` を保持 | Constraint |
| 9 jobs/[id]/edit 認可 | CLI-002/CLI-007B パターン | ページ先頭に `isOwner\|\|isOrganizationMember` ガード追加 | Missing(小) |
| 10 seed/テスト | seed staff案件885/886・client_reviews 12.6 | staff案件へ応募1件→accepted→`reviewee=33333333`評価1件を追加。aggregate.test 更新。多ロールE2E | Missing |

## 3. 実装アプローチの選択肢

### org 解決ロジックの持ち方（Req 3/4/9 と bulk-send が反復）
- **Option A（拡張・inline）**: 各ページで `jobs/manage` と同じ inline `organization_members` lookup を書く。既存コードと一致（CLAUDE.md「周囲のコードに合わせる」）。✅最小・低リスク ❌4箇所で重複
- **Option B（新規ヘルパー）**: `getViewerOrganizationId(supabase, userId)` を server util として新設し各ページが呼ぶ。✅重複排除・テスト容易 ❌新ファイル、既存 inline と二系統になりうる
- **推奨**: 読み取り3件（Req 3/4）と認可（Req 5/9）は **Option A（inline）** で周囲と統一。横展開が多く可読性のため小ヘルパーを足すなら server 限定で1つに留める（bulk-send の client 側とは別物）。

### bulk-send（Req 6）の org 解決
- **Option A（client 側で解決）**: ブラウザクライアントで自分の `organization_members` を引き（RLS で自分の行は読める）、org があれば `.eq("organization_id", org)` でスレッド収集。✅client component のまま最小改修 ❌クライアントに分岐ロジックが乗る
- **Option B（server 移譲）**: 宛先候補の取得を Server Component/Server Action 化し、サーバの正準パターンで解決して props/返り値で渡す。✅ロジックをサーバに集約・他画面と一貫 ❌`bulk-send` の client 構造をリファクタ
- **共通の必須修正**: 「相手＝職人」を **`participant_2` 固定**にする（org スレッドでは閲覧者が participant でないため、現在の `participant_1===user?p2:p1` は誤った相手を拾う）。
- **推奨**: 設計フェーズで A/B を確定。最小なら A、整合重視なら B。いずれも participant_2 固定は必須。

### 評価データ基盤（Req 7・案C）
- 単一移行で「列追加（nullable）＋index＋backfill（`UPDATE client_reviews SET organization_id = j.organization_id FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.id=client_reviews.application_id`）」。`submitContractorReportAction` の insert に1フィールド追加。`fetchClientReputation` を「`organization_id` 軸（組織）or `reviewee_id` 軸（個人）」の判別ユニオンに拡張し純粋関数 `summarizeReputation` は不変。組織スコープ読み取りは admin クライアント（RLS が削除済み担当者を弾くため。Req 8.3）。
- DB は型自動生成（`supabase gen types`）の再生成が必要（`src/types/database.ts`）。

## 4. Effort & Risk

| クラスタ | Effort | Risk | 理由 |
|---|---|---|---|
| Req 2〜5・9（読み取り/認可の横展開） | **S** | **Low** | 既存パターンのコピー。RLS不変、to-one 結合で nested 取りこぼし無し |
| Req 6（bulk-send） | **S〜M** | **Medium** | client component の org 解決と participant_2 固定。設計判断あり |
| Req 7・8（案C：移行＋書込＋集計＋backfill＋型再生成） | **M** | **Low〜Medium** | 単一移行だが backfill 検証・テスト更新・型再生成が絡む |
| Req 10（seed/テスト/多ロールE2E） | **M** | **Low** | seed 追加と E2E 整備。CLAUDE.md の shadcn Select 等の既知罠に注意 |
| **合計** | **M** | **Low〜Medium** | 単一PR想定 |

## 5. Research Needed（設計で詰める）
- bulk-send の org 解決を **client 側 lookup** か **server 移譲** か（Option A/B 決定）。
- backfill 後、個人発注者の既存 client_reviews が `organization_id IS NULL` のまま `reviewee_id` 軸で正しく集計されることの確認（seed に個人発注者の評価が有るか）。
- `client_reviews.organization_id` に対する pgTAP の追加要否（RLS 不変のため最小。列 NOT NULL 化はしない＝個人は NULL のため nullable 維持）。
- CLI-007/CLI-010 の `!inner` 結合に `jobs.organization_id` フィルタを足す際の count 整合（to-one なので問題無い想定だが手動確認）。

## 確定事項（2026-06-03 ユーザー合意）
- **組織メンバー開放**: 担当者(Staff)・管理者(Admin)も会社全体の応募(CLI-007)・発注履歴(CLI-010)・評判(CLI-020)・発注内容詳細(CLI-011)を閲覧可とする（roles-and-permissions「組織の応募/発注履歴を管理」と整合）。OK確認済み。
- **bulk-send の org 解決 = Option B（サーバー側）**: 宛先候補の取得を Server Component/Server Action 側に寄せ、正準パターンで会社単位に解決して client に渡す。client component 側で organization_members を引かない。`participant_2` 固定の修正は必須。
- **org 解決ロジック（読み取り/認可 Req 3/4/5/9）= Option A（inline）**: 周囲コード（jobs/manage 等）に合わせ各ページに inline で記述。

## 6. 設計フェーズへの推奨
- **基本方針**: Option A（既存パターンの拡張/コピー）を主軸、案Cのみ新規スキーマ。単一PR。
- **重要決定**: ①org 解決を inline で統一するか小ヘルパー化するか ②bulk-send の client/server ③backfill 移行とテスト更新の段取り。
- **持ち越し研究**: 上記 Research Needed の4点。
- 実装順（design/tasks で具体化）: Task0 既存テスト全実行 → 読み取り/認可6件 → 案C（移行→書込→集計→型再生成）→ seed/テスト整備 → 3スイート再実行。
