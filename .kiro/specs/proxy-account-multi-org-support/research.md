# Research & Design Decisions — proxy-account-multi-org-support

---
**Purpose**: ディスカバリ結果・アーキテクチャ判断・トレードオフを記録し、`design.md` の根拠を残す。
**Scope**: 代理アカウント N 法人兼任化の技術設計に必要な前提情報と決定事項。
---

## Summary

- **Feature**: `proxy-account-multi-org-support`
- **Discovery Scope**: Extension（既存 Next.js + Supabase アプリへの修正）+ **広範囲リファクタリング**（40 ファイル超に分散する暗黙の「1 組織前提」コードへの集中介入）
- **Key Findings**:
  1. DB schema は N:N 対応済（`organization_members` 複合 PK、`organization_members_proxy_unique` 部分 UNIQUE INDEX）。新規テーブル・カラム追加は **CHECK 制約 1 つだけ** で済む（R6 用）
  2. 「組織内権限失効」は **「行削除」案** で R3 と R4 を統一できる（user 決定: 自動復活機能 `reactivateCorporateMembers` 廃止）。`organization_members.is_active` 等の per-membership フラグ追加は **不要**
  3. 「現在組織」コンテキストは **Cookie ベース** + サーバー側ヘルパー `getActiveOrganizationContext(supabase)` で解決。40 ファイル touch が必要だが、ヘルパー集中化でロジック分散を防ぐ
  4. 招待時の既存ユーザー再利用パスは `createMemberAction` 内の分岐で対応可能。**4 段防衛**（UI / Zod / Server Action / DB CHECK）で代理 + admin 組み合わせ禁止を担保
  5. 新規メールテンプレ `proxy-assigned-existing-user` 1 個だけ追加。文面方針は notifications spec §5.6.C で確定済（実装のみ持ち越し）

## Research Log

### 1. DB schema の N:N サポート確認

- **Context**: 「1 ユーザーが N 組織の代理を兼任できる」を成立させる schema が既存か確認
- **Sources Consulted**:
  - `supabase/migrations/20260324160600_002_core_tables.sql:85-105`
  - `supabase/migrations/20260419100500_staff_management_rpc_functions.sql`
- **Findings**:
  - `organization_members`: `(organization_id, user_id)` の複合 UNIQUE 制約。同一 user_id が異なる organization_id で複数行を持てる
  - 部分 UNIQUE INDEX `organization_members_proxy_unique ON (organization_id) WHERE is_proxy_account = true`: 「組織内代理 1 個」を物理的に保証（R5 が既に成立）
  - `org_role` enum: `'owner' | 'admin' | 'staff'`、`users.role` enum: `'contractor' | 'client' | 'staff' | 'admin'`（別概念）
- **Implications**:
  - schema 変更は CHECK 制約 1 つ（代理 + admin 禁止）のみ
  - per-membership 凍結フラグ（`organization_members.is_active`）は不要（行削除案採用のため）

### 2. 「組織内権限失効」: 行削除 vs 凍結フラグ

- **Context**: R3（CLI 削除）と R4（解約）の挙動を統一する案を検討
- **Decision**: **行削除案を採用**（user 確認済）
- **Trade-offs**:
  | 観点 | 凍結フラグ案 | 行削除案 |
  |---|---|---|
  | schema 変更 | 新カラム `organization_members.is_active` 追加 | なし |
  | RLS 修正 | 凍結中メンバーを SELECT/UPDATE から除外する RLS 修正が必要 | 不要（行が無いので自然に見えない） |
  | 40 ファイルクエリ | `.eq("is_active", true)` フィルタ追加が必要 | 既存 `maybeSingle()` を `getActiveOrganizationContext` 経由に置換するのみ |
  | 自動復活 | サポート可（凍結解除で復活） | 不可（再招待運用） |
  | 監査履歴 | 「いつ凍結された」を残せる | `audit_logs` のみ |
  | 実装の単純さ | △ | ◎ |
- **Implications**:
  - `reactivateCorporateMembers`（`src/lib/billing/webhook/handle-subscription-lifecycle.ts:651`）を削除
  - `handle_subscription_lifecycle_deleted` / `handle_subscription_lifecycle_updated`（再加入処理）の Webhook 経路を簡素化
  - 旧挙動の `users.is_active = false` セット済みデータは移行 migration で `deleted_at` セット + 行削除に正規化（R4-9）

### 3. 「現在組織」コンテキストの永続化方式

- **Context**: N 組織兼任スタッフの「今どの組織で操作中か」を解決する方式を比較
- **Options**:
  - **A. Cookie + サーバーヘルパー**（採用）: HTTP-only Cookie `bizyu_active_org` に組織 ID 保持、サーバー側ヘルパー `getActiveOrganizationContext(supabase)` で解決
  - B. URL パス組み込み（`/org/[orgId]/...`）: 既存 URL 全体への破壊的変更（却下）
  - C. sessionStorage: タブごとに独立可能だが SSR からアクセス不可（却下）
- **Findings**:
  - 既存 `src/lib/supabase/server.ts:11` で `cookies()` を使用しており、Next.js App Router + Supabase の cookie 操作パターンは確立済
  - Cookie 名は `__Host-` prefix を付けないと sub-domain で漏れるリスクがあるが、本サービスは単一ドメインのため不要
  - 複数タブ同時操作（タブ A 法人 A / タブ B 法人 B）は最後に切り替えた組織が全タブで採用される（割り切り）
- **Implications**:
  - `setActiveOrganizationContext(orgId)` Server Action で Cookie を更新
  - `getActiveOrganizationContext(supabase)` SSR ヘルパー:
    1. ユーザーの `organization_members` を全件取得
    2. Cookie の組織 ID が含まれていれば採用
    3. Cookie 無し / 含まれない場合は既定値（最初の行、`created_at ASC` で安定化）
    4. 単一組織ユーザーには Cookie 不要で唯一の組織を返す
  - 切替時は Router Cache 回避のため `window.location.href` でハードナビゲーション（`CLAUDE.md` 既知パターン）

### 4. 既存ユーザー再利用パスの判定ロジック

- **Context**: `createMemberAction` で「既存 user の email 検出時の分岐」設計
- **判定フロー**（R2 / R8 / R9 集約）:
  ```
  email 既存？
    No → 新規ユーザー作成（現状通り、inviteUserByEmail 呼び出し）
    Yes →
      既存ユーザーが他組織で代理在籍中（is_proxy_account=true 行が 1 件以上）？
        No → エラー「このメールアドレスは既に登録されています」
        Yes →
          招待リクエストが代理（isProxyAccount=true）？
            No → エラー「このメールアドレスは既に登録されています」（通常スタッフは単一組織制限）
            Yes →
              入力氏名（lastName, firstName）が既存氏名と完全一致？
                No → エラー「このメールアドレスは既に違うお名前で登録されています」
                Yes → 既存 user_id 再利用パス
                  - inviteUserByEmail スキップ
                  - insert_staff_member_with_limit RPC 呼び出し
                  - proxy-assigned-existing-user メール送信
  ```
- **エラーメッセージ統一指針**:
  - 「既存が代理在籍してない / 招待が通常スタッフ」→ 同一の汎用メッセージ（既存ユーザーの role 露呈防止）
  - 「氏名不一致」→ 専用メッセージ（具体的なヒントを与えず、既存氏名を含まない）

### 5. 代理 + admin 組み合わせ禁止の 4 段防衛

- **Context**: UI バリデーション漏れ + Server Action での後付け改竄 + 既存データ汚染 すべてに対応
- **Layers**:
  | 層 | 実装 | 役割 |
  |---|---|---|
  | UI | `member-form.tsx` の権限 select で `admin` を非表示化 | ユーザー体験上の正常導線 |
  | クライアントバリデーション | `memberCreateSchema` / `memberUpdateSchema` に `superRefine` 追加 | RHF の submit 前バリデーション |
  | Server Action | `createMemberAction` / `updateMemberAction` で組み合わせ拒否 | 改竄リクエスト遮断 |
  | DB | `organization_members` に CHECK 制約追加 | 最終防衛（migration / SQL 直接操作も含む） |
- **既存データ正規化**: migration の最初に `UPDATE organization_members SET org_role = 'staff' WHERE is_proxy_account = true AND org_role = 'admin'`、その後 `ALTER TABLE ... ADD CONSTRAINT ... NOT VALID; VALIDATE CONSTRAINT ...` の 2 段で投入（ロック時間最小化）

### 6. 「氏名突合」の実装位置

- **Decision**: Server Action 内で実施（Zod では実施しない）
- **Rationale**:
  - 突合に既存 `users` 行へのアクセスが必要 → Zod の純関数バリデーション範囲外
  - Server Action 内で `email` ベースのフェッチ後、`last_name` / `first_name` を比較
  - 突合失敗時はエラー応答に既存氏名を含めない（プライバシー）
- **比較方法**: 完全一致（正規化なし。全角・半角・スペース差異は別名扱い）。理由は「typo を確実に検出する」目的のため、緩めると誤承認リスク

### 7. 40 ファイルリファクタの戦略

- **Pattern**: `.from("organization_members").select("organization_id").eq("user_id", user.id).maybeSingle()` → `getActiveOrganizationContext(supabase)`
- **影響範囲**:
  - mypage 系（5 ファイル）
  - messages 系（10 ファイル）
  - jobs 系（5 ファイル）
  - applications 系（6 ファイル）
  - client-profile 系（4 ファイル）
  - members 系（5 ファイル）
  - admin の clients 系（2 ファイル）
  - `src/lib/` 配下（7+ ファイル）
- **段階的移行戦略**:
  1. Phase A: ヘルパー新設（既存挙動と等価: 単一組織は唯一の組織を返す）
  2. Phase B: 既存呼び出し箇所をヘルパー経由に機械的置換（既存テスト全 PASS で確認）
  3. Phase C: Cookie / 切替 UI の導入（N 組織兼任が初めて成立）
- **回帰防止**: Phase A 完了後の `npm run test` / `supabase test db` / `npm run test:e2e` 全 PASS をフェーズ完了条件にする

### 8. メール通知テンプレ

- **新規追加**: `src/lib/email/templates/proxy-assigned-existing-user.ts`
- **既存テンプレ流用範囲**: なし（新規ユーザー招待は Supabase Auth の標準メール経由のため、独自テンプレ不要）
- **文面方針**: `.kiro/specs/notifications/email-decisions-wip.md` §5.6.C 確定済の本人宛文面に準拠。組織名を可変で埋め込み

## Architecture Pattern Evaluation

採用パターン: **Helper-Centralized Refactor + Layered Defense**

| 観点 | 選択 | 根拠 |
|---|---|---|
| 組織コンテキスト解決 | Cookie + サーバーヘルパー | SSR / RSC で透過的に動作、Next.js App Router の標準パターン |
| 失効表現 | 行削除（R3 と R4 統一） | schema 変更最小、RLS 修正不要、再加入は再招待運用 |
| 代理 + admin 禁止 | UI + Zod + Server Action + DB CHECK | 多層防衛で改竄・データ汚染を遮断 |
| 既存ユーザー再利用 | Server Action 内分岐 | 既存招待 UI 維持、内部分岐に閉じる |
| 40 ファイル移行 | ヘルパー集中化 + 段階移行 | 漏れリスク軽減、テスト駆動で品質担保 |

## Design Decisions

1. **R4 行削除統一**: 法人プラン解約時は `organization_members` 行を削除（凍結フラグ不採用）。`reactivateCorporateMembers` ヘルパーは廃止
2. **Cookie 名**: `bizyu_active_org`（HTTP-only, SameSite=Lax）
3. **既定値選定**: 単一組織ユーザーは唯一の組織。N 組織ユーザーで Cookie 無効時は `organization_members.created_at ASC` で最古の組織
4. **氏名突合は完全一致**: 正規化なし、全角・半角差異も別名扱い
5. **CHECK 制約追加方式**: `NOT VALID` で投入 → `VALIDATE CONSTRAINT` の 2 段で実施（既存トランザクションへの影響最小）
6. **40 ファイル移行は段階分け**: Phase A（ヘルパー追加） → Phase B（呼び出し置換） → Phase C（切替 UI）
7. **既存メールテンプレ流用なし**: 新規 `proxy-assigned-existing-user` を独立追加

## Open Questions / Risks

- **R-1**: 既存環境に `users.is_active = false` で凍結中のユーザーが既に存在する場合の移行手順（R4-9）。`is_active=false` を `deleted_at` に変換 + `organization_members` 行削除する一括 migration が必要。当該レコード数の事前カウントが本番投入前に必要
- **R-2**: 40 ファイル移行時、`getActiveOrganizationContext` が `null` を返すケース（組織未所属の Owner 課金未完了状態 等）の挙動が呼び出し側で漏れなく考慮されるか。型レベルで `null` を強制（`Promise<ActiveOrgContext | null>`）してハンドリング強制化
- **R-3**: Cookie ベースでの複数タブ運用問題。割り切り（最後の切替が優先）で進めるが、運用で問題化したら sessionStorage / URL クエリへの移行を検討
- **R-4**: Webhook 経由の `handle_subscription_lifecycle_deleted` で `organization_members` 行を削除する処理が長時間ロックを取らないか（配下 10〜30 名規模）。SQL の `DELETE` は通常問題ないが、`audit_logs` への記録ログ件数増には注意
- **R-5**: 代理スタッフが N 組織兼任中に法人 A が解約 → 田中さんの法人 A 行が削除される。このとき法人 A 内で田中さんが作成した `scout_templates` の owner_id 移譲先（法人 A の Owner）が、法人 A 解約直後に意味を持つか。`reactivateCorporateMembers` 廃止に伴い、`scout_templates` の整理ロジックも見直しが必要

## 参照

- 引き継ぎ資料: `.kiro/specs/notifications/proxy-account-multi-org-handoff.md`
- ギャップ分析: `.kiro/specs/proxy-account-multi-org-support/gap-analysis.md`
- 関連 spec: `.kiro/specs/organization/`、`.kiro/specs/billing/`、`.kiro/specs/notifications/email-decisions-wip.md`
- 関連コード: `src/app/(authenticated)/mypage/members/actions.ts`, `src/lib/billing/webhook/handle-subscription-lifecycle.ts`, `supabase/migrations/20260419100500_*.sql`, `supabase/migrations/20260420100000_*.sql`
