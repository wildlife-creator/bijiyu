# Implementation Gap Analysis — proxy-account-multi-org-support

このドキュメントは、要件定義（`requirements.md`）と既存コードベースの差分を整理し、設計フェーズの判断材料を提供するものです。**実装方針の確定はしません**。

## サマリ

- **Feature**: `proxy-account-multi-org-support`
- **Discovery Scope**: Extension（既存 Next.js + Supabase + Webhook + Email スタックの修正）+ **広範囲リファクタリング**（後述）
- **規模見積もり**: **L（1〜2 週間）**、規模次第で XL に振れる可能性あり。要素は単純だが影響範囲が広い。
- **リスク**: **High** — 40 ファイル超の `organization_members.maybeSingle()` パターンが「Staff は 1 組織」を暗黙に前提としており、修正漏れがメッセージ・案件管理・応募管理全般の表示バグ・権限事故に直結する
- **主要な発見**:
  1. **R6（組織コンテキスト切替）の影響範囲が最大**: `organization_members` を `.maybeSingle()` で読む箇所が 40 ファイル存在（mypage / messages / jobs / applications / favorites 等の主要画面ほぼ全域）。すべてが「Staff は 1 組織」前提のため、N 組織化には集中リファクタが必須
  2. **DB schema は既に N:N 対応済**: `organization_members.UNIQUE (organization_id, user_id)` 複合キーと部分 UNIQUE INDEX `organization_members_proxy_unique` で「組織内代理 1 個」が既に表現済み。schema 変更は per-membership 凍結方法の選択次第（後述 R4 設計分岐）
  3. **R4（凍結スコープ）が最大の設計分岐点**: 「per-membership 凍結フラグ追加」vs「`organization_members` 行削除」の 2 案が有力。既存の reactivate ロジックとの対称性、middleware の `is_active` 判定との整合性で選択が変わる
  4. **R7（既存ユーザー再利用時の通知メール）は新規テンプレート要**: 既存の `src/lib/email/templates/` に「代理アカウント設定通知」テンプレートは存在しない。`.kiro/specs/notifications/email-decisions-wip.md` §5.6.C / 5.6.D で文面方針は決定済（実装は本 spec 完了後）
  5. **R2 / R3 / R5 は既存 RPC / Server Action の小修正で対応可能**: いずれも 1 ファイル 10〜50 行程度の追加。本 spec のスコープでは小さい

## 1. Requirement-to-Asset Map

| Req | 必要な能力 | 既存資産 | 状態 |
|---|---|---|---|
| R1 N法人兼任サポート | `organization_members` N:N | `UNIQUE (organization_id, user_id)` 複合キー | ✅ schema 完備 |
| R1 | 「組織内代理 1 個」制約 | 部分 UNIQUE INDEX `organization_members_proxy_unique` | ✅ 完備 |
| R2 招待時の既存ユーザー再利用 | `createMemberAction` 分岐 | `src/app/(authenticated)/mypage/members/actions.ts:107-118` | ⚠️ Missing（要追加） |
| R2 | 既存 user の代理在籍判定 | なし | ⚠️ Missing（ヘルパー要） |
| R2 | `inviteUserByEmail` を呼び分け | 同 actions.ts:144-152（無条件呼び出し） | ⚠️ Constraint（分岐要） |
| R2 | 通常スタッフは現状拒否を維持 | 同 actions.ts:113-118 | ✅ ロジック既存（流用） |
| R3 削除のスコープ限定 | `delete_staff_member` RPC | `supabase/migrations/20260419100500_*.sql:113-140` | ⚠️ Missing（残存判定要） |
| R3 | 残存メンバーシップ判定 | なし | ⚠️ Missing（RPC 内で追加） |
| R4 凍結のスコープ限定 | `handle_subscription_lifecycle_deleted` の `is_active=false` | `supabase/migrations/20260420100000_*.sql:78-95` | ⚠️ Missing（per-membership 化要） |
| R4 | per-membership 凍結フラグ | なし | 🔍 **Research Needed**（後述 Option 比較） |
| R4 | 法人プラン再加入時の対称復活 | `reactivateCorporateMembers` (`src/lib/billing/webhook/handle-subscription-lifecycle.ts:651-680`) | ⚠️ Missing（R4-2 と整合要） |
| R4 | `users.is_active` の global ログインゲート維持 | `src/middleware.ts:315-322` | ✅ 維持（変更不要） |
| R5 組織内代理一意性 | `insert_staff_member_with_limit` の P0001 / `PROXY_ACCOUNT_ALREADY_EXISTS` | 既存 RPC + `organization_members_proxy_unique` 部分 UNIQUE | ✅ 既存維持（変更不要） |
| R6 組織コンテキスト切替 | 1 組織想定の `.maybeSingle()` パターン | **40 ファイル**（後述リスト） | ⚠️ **Missing（最大の Gap）** |
| R6 | 現在組織を解決するヘルパー関数 | なし | ⚠️ Missing（共通ヘルパー新規） |
| R6 | 組織切替 UI（ヘッダー等） | なし | ⚠️ Missing（新規コンポーネント） |
| R6 | 切替永続化（Cookie / セッション / URL） | なし | 🔍 Research Needed |
| R7 既存ユーザー再利用時のメール | 「代理アカウント設定通知」テンプレート | なし（既存 12 テンプレに該当無し） | ⚠️ Missing（新規） |
| R7 | テンプレート文面 | `.kiro/specs/notifications/email-decisions-wip.md` §5.6.C / 5.6.D で方針確定済 | ✅ 文面決定済（実装のみ） |
| R8 通常スタッフの単一組織制限 | 既存の拒否ロジック | `createMemberAction:113-118` の現状 | ✅ 既存維持（R2 の分岐で条件付き化） |
| R9 admin 関連は対象外 | 既存 admin 認可 | `src/lib/admin/require-admin.ts`、`/admin/(protected)/` | ✅ 変更なし |
| R10 テスト網羅 | 既存 pgTAP / Vitest / E2E | `delete_staff_member.test.sql`(94L) / `insert_staff_member_with_limit.test.sql`(137L) / `member-actions.test.ts` / `e2e/members.spec.ts` | ⚠️ Constraint（拡張要） |
| R11 メール spec への戻し作業 | §5.6 / §5.7 の確定可能化 | `.kiro/specs/notifications/email-decisions-wip.md` | ✅ 本 spec 完了で解除 |

### R6 影響範囲: `organization_members.maybeSingle()` を使う 40 ファイル（暗黙の 1 組織前提）

**該当パス**（mypage 系・messages 系・jobs 系・applications 系の主要画面全域）:

```
src/app/(authenticated)/mypage/page.tsx           ← マイページのプラン解決
src/app/(authenticated)/mypage/members/...        ← 担当者管理（5 ファイル）
src/app/(authenticated)/mypage/client-profile/... ← 発注者情報（4 ファイル）
src/app/(authenticated)/messages/...              ← メッセージ全体（10 ファイル）
src/app/(authenticated)/jobs/...                  ← 案件管理（5 ファイル）
src/app/(authenticated)/applications/...          ← 応募管理（6 ファイル）
src/app/admin/(protected)/clients/[id]/...        ← admin の発注者詳細（2 ファイル）
他、`src/lib/` 配下のヘルパー（7+ ファイル）
```

これらは「`organization_members WHERE user_id = current_user LIMIT 1` で組織を 1 つ取れる」前提でクエリを組んでいる。N 組織化すると:
- どの組織のコンテキストで動作するかが曖昧
- 案件一覧が法人 A の案件と法人 B の案件を混ぜて表示
- メッセージスレッドの所属組織が不定

→ **集中リファクタ**（共通ヘルパー `getActiveOrganizationContext()` の新規追加 + 全 caller 移行）が R6 の中核。

## 2. Implementation Approach Options

要件群を「修正クラスタ」ごとに分け、それぞれに A/B/C オプションを評価する。

### クラスタ 1: R2 招待時の既存ユーザー再利用

#### Option 1A: `createMemberAction` 内に分岐を追加（推奨）
- **アプローチ**: 現状 `.maybeSingle()` で `existingUser` 取得済 → そこに「代理 + 既存ユーザーが代理在籍中」分岐を追加
- **変更**: 1 ファイル `src/app/(authenticated)/mypage/members/actions.ts`、~50 行追加
- **新規ヘルパー**: 「既存 user が他組織で代理在籍中か」判定の小関数（同ファイル内 or `src/lib/organization/` 新設）
- **既存 `inviteUserByEmail` 呼び出し**: 分岐の中で「呼ばない」を選択
- **トレードオフ**: ✅ 既存パターンに自然に乗る / ❌ `createMemberAction` 内のロジックが少し複雑になる（既に長め）

#### Option 1B: 専用 Server Action を新設（`addExistingProxyToOrganization`）
- **アプローチ**: 既存ユーザー再利用専用の Server Action を切り出し、UI 側で email 入力後にどちらを呼ぶか分岐
- **変更**: 2 ファイル、フォーム側にも分岐
- **トレードオフ**: ✅ 役割分離が明確 / ❌ UI 側で「既存ユーザーか」を事前判定する必要があり、E2E フローが複雑化

**推奨**: 1A。UI からは「メール入力で招待」のままに見せ、内部分岐に閉じる方が UX シンプル

### クラスタ 2: R3 削除のスコープ限定

#### Option 2A: `delete_staff_member` RPC 内で残存判定（推奨）
- **アプローチ**: 既存 RPC の `UPDATE users SET deleted_at` を「他組織にも在籍する場合スキップ」に変更
- **変更**: 1 ファイル `supabase/migrations/<新規>` で `CREATE OR REPLACE FUNCTION`、~10 行追加
- **トレードオフ**: ✅ RPC の atomicity を保てる / ✅ Server Action 側の変更不要 / ❌ なし

#### Option 2B: Server Action 側で残存判定して `deleted_at` セットを呼び分け
- **アプローチ**: RPC の最後の `UPDATE users` を削除し、Server Action 側で残存 0 件時のみ別 UPDATE
- **変更**: 1 RPC + 1 Server Action
- **トレードオフ**: ❌ atomicity が崩れる（DELETE と UPDATE が別トランザクション） / ❌ メリット薄い

**推奨**: 2A

### クラスタ 3: R4 凍結のスコープ限定（**最重要設計分岐**）

「当該組織内での権限失効」をどう表現するかで 3 案。

#### Option 3A: `organization_members.is_active` カラム新設（per-membership 凍結フラグ）
- **アプローチ**: `organization_members` に `is_active boolean DEFAULT true` を追加。Owner 解約時は配下 `organization_members.is_active = false`（`users.is_active` は変えない）
- **変更**:
  - migration 1 件（カラム追加 + デフォルト埋め）
  - `handle_subscription_lifecycle_deleted` RPC: `users.is_active=false` を `organization_members.is_active=false` に置換
  - `reactivateCorporateMembers`: 対称的に `organization_members.is_active=true`
  - 40 ファイルの `.maybeSingle()` クエリ: `.eq("is_active", true)` フィルタ追加（または `getActiveOrganizationContext()` ヘルパー側で吸収）
  - RLS ポリシー見直し: 凍結中メンバーは当該組織データへの SELECT/UPDATE を拒否
  - 個別の凍結中メンバー復活時の整合（解約 → 別組織で代理として復活、等）
- **トレードオフ**:
  - ✅ 「凍結履歴」「再加入で復活」のロジックがクリーン
  - ✅ 案件・応募データの「組織所属としての痕跡」が残るので過去ログ追跡可
  - ❌ RLS 修正の影響範囲が大きい
  - ❌ 40 ファイルのクエリ全てに `is_active=true` フィルタが必要

#### Option 3B: `organization_members` 行を物理削除し、再加入時に再 INSERT
- **アプローチ**: Owner 解約時は配下 `organization_members` 行を DELETE。再加入時は ... ❌ どのメンバーを復活させるか分からない（履歴喪失）
- **トレードオフ**: ❌ 再加入時の復活が不可能 → 採用不可

#### Option 3C: `organization_members` を物理削除 + 別テーブル `organization_membership_archive` に履歴保存
- **アプローチ**: Owner 解約時は配下 organization_members を archive テーブルに移動。再加入時は archive から復活
- **変更**: 新テーブル + RPC 修正 + archive 系 RLS + 40 ファイルは影響少（行が無いので自然に他組織のみ見える）
- **トレードオフ**:
  - ✅ 40 ファイルのクエリは無変更で済む
  - ✅ 「組織内のアクティブメンバーシップ = `organization_members` 行が存在」と意味が明確
  - ❌ archive テーブルという新概念が増える
  - ❌ scout_templates 等の外部参照（FK）の扱いが複雑化

**推奨**: 3A を本命、3C を比較案として残す。design フェーズで両者を 1 段深く比較する（3A の RLS 影響 vs 3C の archive 設計コスト）。

### クラスタ 4: R5 組織内代理一意性

#### Option 4A: 現状維持（推奨）
- **アプローチ**: `organization_members_proxy_unique` 部分 UNIQUE INDEX + RPC の事前チェックを変更しない
- **トレードオフ**: ✅ 変更不要、要件と既存実装が完全一致

**推奨**: 4A（要件 R5 が「現状維持」を明示している）

### クラスタ 5: R6 組織コンテキスト切替（**最大の影響範囲**）

#### Option 5A: 共通ヘルパー `getActiveOrganizationContext(supabase)` の新設 + 40 ファイル移行
- **アプローチ**:
  - `src/lib/organization/active-context.ts` を新設、Cookie / Header / URL パラメータから「現在組織 ID」を解決
  - 40 ファイルの `.maybeSingle()` パターンを `getActiveOrganizationContext()` 呼び出しに置換
  - 切替 UI（`OrgSwitcher` コンポーネント）をヘッダー / マイページに配置
- **変更**: 40+ ファイル touch、新規ヘルパー 2-3 個、新規 UI コンポーネント 1 個
- **トレードオフ**:
  - ✅ 後でロジック変更しやすい（ヘルパー 1 個の修正で済む）
  - ✅ 単一組織ユーザーには透明（ヘルパーが自動的に唯一の組織を返す）
  - ❌ 移行工数が大きい
  - ❌ 移行漏れがあると当該画面でバグ

#### Option 5B: URL ベースの組織スコープ（`/org/[orgId]/...`）
- **アプローチ**: Next.js ルーティングで `/org/[orgId]/mypage` のようにパスに組織を埋め込む
- **トレードオフ**:
  - ✅ URL から組織コンテキストが自明
  - ❌ Next.js のルーティング再設計が必要（既存 URL 全体への破壊的変更）
  - ❌ Owner / 単一組織ユーザーにも URL 変更が波及

#### Option 5C: Cookie / セッションベース（暗黙の状態）
- **アプローチ**: 現在組織を Cookie に保存、API 側で読む
- **トレードオフ**:
  - ✅ 既存 URL 維持
  - ❌ ブラウザ複数タブ時の挙動（タブ A 法人 A / タブ B 法人 B の同時操作で混乱）
  - ❌ デバッグしづらい

**推奨**: 5A + Cookie 永続化（5C との組合せ）。URL 変更は破壊が大きすぎて却下。Cookie の複数タブ問題は仕様上「最後に切り替えた組織を採用」で割り切る or タブ別 sessionStorage 検討。

### クラスタ 6: R7 既存ユーザー再利用時の通知メール

#### Option 6A: 新規テンプレート `proxy-account-assigned.ts` を作成
- **アプローチ**: `src/lib/email/templates/proxy-account-assigned.ts` を新規追加（§5.6.C / 5.6.D 仕様準拠）
- **変更**: 新規 1 ファイル + Server Action から呼び出し
- **トレードオフ**: ✅ §5.6 議論で文面方針確定済 / ❌ 微細な文面確定はメール spec 完了後に持ち越し

**推奨**: 6A、ただし**文面は仮版で実装**し、メール spec §5.6 確定時に最終調整

## 3. 規模と Risk

| クラスタ | Effort | Risk | 根拠 |
|---|---|---|---|
| 1 (R2) | S | Low | 1 ファイル分岐追加。既存テスト枠の延長 |
| 2 (R3) | S | Low | RPC ~10 行追加 + pgTAP 追加 |
| 3 (R4) | M | **High** | per-membership 凍結の設計分岐次第。RLS 修正 + Webhook テスト + 再加入対称性 |
| 4 (R5) | XS | None | 現状維持 |
| 5 (R6) | **L〜XL** | **High** | 40 ファイルの集中リファクタ。漏れがあると主要画面の表示・権限事故 |
| 6 (R7) | S | Low | 新規テンプレ 1 個 + 呼び出し追加 |
| 7 (R10 テスト) | M | Medium | Vitest / pgTAP / E2E の各層で N 組織シナリオ追加。seed.sql の N 組織テストユーザー設計が要 |

**全体**: L〜XL（1〜3 週間）。R5 リファクタの工数が支配的。

**全体 Risk**: High。理由は (a) 40 ファイル touch の漏れリスク、(b) R4 の per-membership 凍結 vs row 削除の選択ミスが Webhook の non-idempotency に直結、(c) 既存 E2E がほぼ全フローを 1 組織前提で書かれており、N 組織テストの追加が広範囲。

## 4. Research Needed（design 段階に持ち越し）

設計フェーズで深掘りすべき未決項目:

1. **R4-2 per-membership 凍結の具体手段**: 3A（`organization_members.is_active` 追加 + RLS 修正）vs 3C（archive テーブル）の比較。RLS 影響範囲の試算が必要
2. **R6 組織コンテキスト永続化方式**: Cookie / sessionStorage / URL のいずれを採用するか。ブラウザ複数タブ運用が現実的に発生するか調査
3. **R6 切替 UI の配置**: ヘッダー固定 / マイページ固有 / モーダル切替 のどれか。design-assets/screens/ に該当画面の PNG が無いため、新規デザインカンプ追加が必要かも
4. **R6 既定値選定ロジック**: 初回ログイン時 / セッション切れ後復帰時にどの組織を既定にするか（最終操作組織 / 最初に参加した組織 / 表示順）
5. **既存ユーザー再利用パスの「同一 email だが既存が個人受注者」エラーメッセージ**: 単純な「既に登録されています」だと混乱を招くため、operations 用のメッセージ詳細化が要るか
6. **`scout_templates` の owner_id 移譲ロジック（R3 削除時）**: N 組織化で「組織 A から削除されたが組織 B では代理続行」のとき、組織 A の scout_templates を組織 A の Owner に移譲（既存挙動でも妥当）で OK か確認
7. **法人プラン再加入時の `organization_members.is_active=true` 復活が当該組織のみで動くか**: 3A 採用時に「同一スタッフが組織 B でも凍結中」というケースの分離挙動を Webhook で安全に処理できるか
8. **N 組織兼任スタッフのデータ表示順**: マイページの担当者一覧、案件一覧、応募一覧で「兼任先で混在表示するか / 組織コンテキストで絞るか」（要件 R6-4 で「再フェッチ」と書いたが、UI 層の責務分担詳細を design で詰める）

## 5. design フェーズへの推奨

### 推奨アプローチ（暫定）

**Hybrid（Option C）**:
- クラスタ 1 / 2 / 6: A 案（既存コンポーネント拡張）
- クラスタ 3: 3A（`organization_members.is_active` 追加）を本命、design で 3C と比較確定
- クラスタ 4: 現状維持
- クラスタ 5: 5A（共通ヘルパー + 40 ファイル移行）+ Cookie 永続化

### 実装フェーズ分割の提案

phase 数が多いので、design フェーズで分割設計してから tasks.md を組む。提案:

1. **Phase 0**: 既存テスト全 PASS 確認（CLAUDE.md 必須ルール）
2. **Phase 1**: schema 拡張（`organization_members.is_active` カラム追加 + migration）
3. **Phase 2**: 共通ヘルパー `getActiveOrganizationContext()` 新設 + 単一組織ユーザーで透明に動くことを E2E で確認（既存挙動の温存）
4. **Phase 3**: 40 ファイルの `.maybeSingle()` パターン移行（既存挙動と等価のまま）
5. **Phase 4**: `delete_staff_member` / `handle_subscription_lifecycle_*` / `reactivateCorporateMembers` の per-membership 化（R3 + R4）
6. **Phase 5**: `createMemberAction` 既存ユーザー再利用パス追加（R2）+ 新規メールテンプレ（R7）
7. **Phase 6**: 組織切替 UI（R6 UI）+ Cookie 永続化
8. **Phase 7**: N 組織テストユーザーを seed.sql に追加 + 全テスト網羅（Vitest / pgTAP / E2E）

### 主要決定

- **`users.is_active` の役割**: 「global ログインゲート」維持
- **`organization_members.is_active`（新設候補）**: 「当該組織での権限」
- **`users.deleted_at`**: 「最後の組織から抜けた完全退会」のみ
- **「現在組織」の永続化**: Cookie + 既定値ロジック

### 持ち越し研究項目

design.md の「Decision Rationale」セクションで、上記「4. Research Needed」全 8 項目を 1 件ずつ確定する。

## 6. 参照

- 要件: `.kiro/specs/proxy-account-multi-org-support/requirements.md`
- 引き継ぎ資料: `.kiro/specs/notifications/proxy-account-multi-org-handoff.md`
- メール通知 WIP: `.kiro/specs/notifications/email-decisions-wip.md` §5.6 / §5.7
- 関連 spec: `.kiro/specs/organization/`（research.md・design.md は本 spec 設計時にも参照価値あり）
