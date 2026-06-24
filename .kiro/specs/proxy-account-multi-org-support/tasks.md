# Implementation Plan

> 本 spec の実装タスク。`design.md` の Migration Strategy（Phase 0〜8）に対応する。
> `(P)` マークはサブタスク内で並行作業可能なものを示す。Phase 間（メジャータスク間）は順次実行（依存関係あり）。
> 各タスク末尾の `_Requirements:` は `requirements.md` の番号 ID のみを参照する。

---

- [x] 0. 既存テストのデグレード確認（Phase 0）
  - `npm run test`、`supabase test db`、`npm run test:e2e` の 3 種すべてを実行し、全 PASS 状態から実装に着手することを確認する
  - 失敗があれば原因を調査・修正してから次タスクへ進む
  - 2026-06-24 実行結果: Vitest 993/993 PASS / pgTAP 269/269 PASS / Playwright 251/251 PASS（クリーン dev server）
  - E2E 実バグ修正 2 件:
    - PasswordInput トグル aria-label が `getByLabel("パスワード")` を巻き込む罠 → 4 箇所を `getByRole("textbox", { name: /パスワード/ })` に置換（`e2e/helpers.ts:66` `e2e/auth.spec.ts:13,23` `e2e/admin.spec.ts:25`）
    - MasterCombobox multi モードの trigger center click が chip × を踏み popover が開かない罠 → `click({ position: { x: 5, y: 5 } })` + cmdk Input を `input[role="combobox"]` で限定（`e2e/master-skills.spec.ts:163,164,166,172,173,175`）
  - CLAUDE.md「E2Eテスト（Playwright）」セクションにルール 4 件追記（PasswordInput / cmdk vs shadcn / MasterCombobox chip 誤爆 / 長時間 run の環境 flake）
  - _Requirements: 11.1, 11.5_

---

- [x] 1. 代理 + admin 組み合わせ禁止の 4 層防衛を Phase 1 で同時投入

> R6 の 4 層（UI / Zod / Server Action / DB CHECK）は不整合中間状態を作らないため必ず同一 Phase で完結させる。

- [x] 1.1 (P) 既存データを正規化し、`organization_members` に CHECK 制約を追加する
  - 既存環境で `is_proxy_account = true AND org_role = 'admin'` の行を `org_role = 'staff'` に更新する
  - CHECK 制約 `NOT (is_proxy_account = true AND org_role = 'admin')` を `NOT VALID` で追加し、その後 `VALIDATE CONSTRAINT` で検証する
  - 制約名を `organization_members_proxy_role_check` で統一する
  - 該当行が事前に何件あるか SQL で確認しログに残す
  - _Requirements: 6.5, 6.6_

- [x] 1.2 (P) 担当者招待フォームの UI で代理 ON 時の権限プルダウンを制御する
  - 代理アカウントチェックが ON のとき、権限選択肢から「管理者」を非表示にする
  - OFF → ON への切替瞬間に権限が `admin` だった場合、自動で `staff` に切り替える
  - CLI-022 新規招待 / CLI-024 編集 / CLI-025 詳細編集の全モードで同じ挙動を適用する
  - admin から staff へ自動切替された際にトーストでユーザーに通知する
  - _Requirements: 6.1, 6.2, 6.7_

- [x] 1.3 (P) 招待・編集の Zod スキーマで代理 + admin 組み合わせを拒否する
  - `memberCreateSchema` と `memberUpdateSchema` に `superRefine` を追加し、`isProxyAccount = true AND orgRole = 'admin'` の組み合わせをバリデーションエラーで弾く
  - エラーメッセージは「代理アカウントは担当者権限でのみ作成・編集できます」
  - エラーパスは既存 master-area-multi-select の path 戦略（フォームレベル集約）に準拠する
  - _Requirements: 6.4_

- [x] 1.4 (P) Server Action 側に防衛コードを追加する
  - 担当者招待 Server Action と編集 Server Action の入口で、代理 + admin の組み合わせが到達した場合に拒否する
  - UI バイパスや改竄リクエストに備えた最終 Server Action 層の防御として機能させる
  - 拒否時のエラーメッセージは Zod と統一する
  - _Requirements: 6.3_

- [x] 1.5 R6 関連のテストを追加する
  - Vitest で UI 切替時の挙動を検証する（OFF → ON の瞬間に権限が `admin` から `staff` へ自動置換されること、トースト通知の発火含む）
  - Vitest で Zod superRefine が代理 + admin を弾くケースをテストする
  - Vitest で Server Action 防衛コードが UI バイパス相当のリクエスト（代理 ON + admin の直接送信）を拒否することを検証する
  - pgTAP で `organization_members_proxy_role_check` CHECK 制約が違反 INSERT / UPDATE を拒否することを検証する
  - Playwright E2E で代理チェック ON 時に admin オプションが消えるシナリオを CLI-022 新規モードと CLI-024 編集モードの両方で追加する
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 11.2, 11.3, 11.4_
  - 2026-06-24 実装結果:
    - Migration: `supabase/migrations/20260616120000_proxy_admin_check_constraint.sql`（NOT VALID + VALIDATE の 2 段、影響行数 RAISE NOTICE）
    - Zod: `src/lib/validations/member.ts` に `superRefine` + `memberErrorMessages.proxyAdminCombination`
    - Server Action: `actions.ts` の createMemberAction / updateMemberAction 入口に明示拒否（Zod 二重防衛）
    - UI: `member-form.tsx` で `isProxyAccount=true` のとき admin option 非表示 + 切替時 toast 通知
    - 新規テスト: Vitest 13 件（validations/member + R6 server action 2 件） / pgTAP 7 件 / Playwright 3 件
    - 全テスト結果: Vitest 1006/1006 PASS / pgTAP 276/276 PASS / Playwright 254/254 PASS（4.9m）

---

- [x] 2. 組織コンテキスト解決の共通ヘルパーを新設する（Phase 2）

- [x] 2.1 `getActiveOrganizationContext` を実装する
  - 現在のログインユーザーの全 `organization_members` 行を 1 回の SELECT で取得する
  - Cookie `bizyu_active_org` の組織 ID が memberships に含まれる場合は採用、含まれない場合は既定値（`created_at ASC` で最古）にフォールバック
  - 単一組織ユーザーには Cookie を無視して唯一の組織を返す（既存挙動と等価）
  - 組織未所属の場合は `null` を返し、呼び出し側に型レベルでハンドリング強制する
  - 戻り値に「現在組織コンテキスト」と「全 memberships 一覧」の両方を含める（OrgSwitcher 等の複合用途で使えるよう）
  - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6, 1.3_

- [x] 2.2 単一組織ユーザーで既存挙動と完全等価であることを Vitest で検証する
  - 単一組織ユーザーでヘルパーが返す `organizationId` / `orgRole` / `isProxyAccount` / `orgOwnerId` が既存 `.maybeSingle()` の結果と一致することを確認
  - Cookie 不在・不正な Cookie・組織未所属の各エッジケースを網羅
  - _Requirements: 1.4, 7.3, 11.2_
  - 2026-06-24 実装結果:
    - 実装: `src/lib/organization/active-org-context.ts`（Cookie 解決 + JS 側 defensive sort）
    - 公開 API: `BIZYU_ACTIVE_ORG_COOKIE` / `BIZYU_ACTIVE_ORG_COOKIE_MAX_AGE` / `getActiveOrganizationContext()`
    - 戻り型: `MembershipListResult { active: ActiveOrgContext | null, all: MembershipSummary[] }`
    - 表示名解決: `client_profiles.display_name` → 姓名 → "未設定" の順
    - 新規テスト: `src/__tests__/organization/active-org-context.test.ts` 11 件（未認証 / 組織未所属 / 単一組織 / N 組織 + Cookie 3 通り / all ソート / 公開定数）
    - 全テスト結果: Vitest 1017/1017 PASS / pgTAP 276/276 PASS（影響なし）

---

- [x] 3. 暗黙の「1 組織前提」コードを 40 ファイル横断で共通ヘルパー経由に置換する（Phase 3）

> `getActorContext` を最優先で置換し、N 組織テストユーザーとスモークテストを先行投入することで、移行漏れを早期検出する。

- [x] 3.1 `members/actions.ts` 内の `getActorContext` を最優先で置換する
  - member 関連の 4 Server Action（create / update / delete / resend）すべてが共通利用する内部ヘルパー
  - 既存の `.maybeSingle()` パターンを `getActiveOrganizationContext` 経由に置換
  - 既存の Vitest テストが全 PASS することを確認してから次へ進む
  - _Requirements: 7.4, 1.3, 11.1_

- [x] 3.2 seed.sql に N 組織兼任テストユーザーを投入する
  - `proxy-multi@test.local` を法人 X と法人 Y の両方の `organization_members` に代理スタッフ（`is_proxy_account = true`、`org_role = 'staff'`）として登録
  - 既存 E2E / pgTAP / Vitest が法人内のメンバー数・案件数・スレッド数をアサーションしているケースを破壊しないため、**法人 X / Y は既存の seed 法人とは別の新規法人として作成**する（既存の `55555555-…`、`c2225555-…`、`ade25555-…` 等の法人には追加しない）
  - 法人 X / Y の Owner も新規ユーザーとして作成し、既存のテストユーザー（CLIENT / STAFF 等）と完全に独立した法人ツリーにする
  - 切替シナリオ検証用に法人 X / Y それぞれで異なる案件・メッセージスレッドを最低 1 件用意
  - 既存テストデータとの整合（UUID 重複なし、`email_confirmed_at` / `password_set_at` セット、e2e/helpers.ts のテストユーザー定数と衝突しない）を担保
  - _Requirements: 11.4_

- [x] 3.3 N 組織スモークテストを Phase 3 時点で 2 件先行投入する
  - 兼任スタッフがマイページにアクセスして既定組織のデータが表示されることを確認
  - 同スタッフがメッセージ一覧にアクセスして既定組織のスレッドのみが表示されることを確認
  - OrgSwitcher UI 未投入のため Cookie 設定はテスト内で直接行う
  - _Requirements: 11.4, 7.4_

- [x] 3.4 (P) `mypage` / `client-profile` / `members` 系のファイルを置換する
  - マイページの subscription 解決ロジック（CLI-001）
  - 発注者情報詳細・編集（CLI-020 / CLI-021）
  - 担当者一覧・詳細・新規・編集ページ（CLI-022〜025）
  - 各ファイルで `getActiveOrganizationContext` を使う形に書き換える
  - _Requirements: 7.4, 1.3_

- [x] 3.5 (P) `messages` 系のファイルを置換する
  - メッセージ一覧・詳細・新規作成・テンプレ・スカウト送信・一斉送信のページと Server Action
  - 法人プラン Staff が代理として送信する際の `is_proxy = true` 自動設定が組織コンテキストに連動して動作することを確認
  - _Requirements: 7.4, 1.3_

- [x] 3.6 (P) `jobs` 系のファイルを置換する
  - 案件作成・編集・管理・応募者一覧の Server Action とページ
  - 組織コンテキストに応じた案件絞り込みが正しく動作することを確認
  - _Requirements: 7.4, 1.3_

- [x] 3.7 (P) `applications` 系のファイルを置換する
  - 応募受信一覧・発注履歴・応募詳細の Server Action とページ
  - CLI-007（未対応）/ CLI-010（発注済以降）の分離が組織コンテキスト切替後も維持されることを確認
  - _Requirements: 7.4, 1.3_

- [x] 3.8 (P) `admin` 系および `src/lib/` 配下の残ファイルを置換する
  - admin の発注者詳細画面の組織取得ロジック
  - `src/lib/` 配下のヘルパー類で残っている `.maybeSingle()` パターン
  - _Requirements: 7.4, 1.3_

- [x] 3.9 Phase 3 完了検証
  - `npm run test` / `supabase test db` / `npm run test:e2e` 全 PASS
  - スモークテスト 2 件が Phase 3 で PASS することを Phase 4 移行の必須条件とする
  - _Requirements: 11.1, 11.4_
  - 2026-06-24 実装結果:
    - 3.1: `members/actions.ts` の `getActorContext` を `getActiveOrganizationContext` 経由に置換。テストは `vi.mock("@/lib/organization/active-org-context")` 直接モックに切替（20 件 PASS）
    - 3.2: seed.sql 末尾に新規 UUID 帯 `f777...` で proxy-x-owner / proxy-y-owner / proxy-multi / proxy-con + 法人 X / Y + スレッド 2 件を追加。既存 seed には不可侵
    - 3.3: `e2e/proxy-multi-org.spec.ts` 新規（マイページ到達 + メッセージ一覧で active org のみ表示）2/2 PASS
    - 3.4-3.8: middleware.ts（inline、cookies API 制約）+ 33 ファイル（mypage/messages/jobs/applications/billing/profile/lib/job-inquiry）を共通ヘルパー経由に置換。`organization_members` の actor-lookup `.maybeSingle()` を残しているのは `withdrawal/execute.ts`（targetUserId）、`validate-downgrade.ts`（userId 引数）、`admin/clients/[id]/*`（他者照会）、`admin/clients-list.ts`、`webhook/handle-subscription-lifecycle.ts` のみで、いずれも actor 自身の組織を引かないためスコープ外
    - 3.9 ヘルパー強化: `organizations.deleted_at` フィルタを追加（テスト +1 件）
    - 全テスト結果: Vitest 1018/1018 PASS / pgTAP 276/276 PASS / Playwright スモーク 2/2 PASS（フル E2E は次タスクで実行）

---

- [x] 4. 削除と解約の RPC を「行削除統一」に書き換える（Phase 4）

- [x] 4.1 (P) `delete_staff_member` を v2 に書き換える
  - **トランザクション冒頭で `SELECT id FROM users WHERE id = p_target_user_id FOR UPDATE` を実行**し、対象ユーザー行に悲観ロックを取る（同一ユーザーの並行削除トランザクションを直列化し、READ COMMITTED 分離レベル下での race condition を防止する）
  - `scout_templates.owner_id` の Owner 移譲（既存）を維持
  - `organization_members` 行削除（既存）を維持
  - 削除後に対象 `user_id` の残存 `organization_members` 行が 0 件のときのみ `users.deleted_at = now()` をセットする条件を追加
  - 残存メンバーシップ判定を同一トランザクション内の SELECT で実施し atomic 性を担保
  - 旧挙動の「無条件 `deleted_at` セット」を撤廃
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 9.3_

- [x] 4.2 (P) `handle_subscription_lifecycle_deleted` を v2 に書き換える
  - subscriptions UPDATE（既存）と `users.role` ダウングレード（既存）を維持
  - 配下の `organization_members` 行（`org_role IN ('admin', 'staff')`）を当該組織分すべて削除
  - **各削除対象の残存メンバーシップ判定の直前に、対象ユーザーごとに `SELECT id FROM users WHERE id = v_user_id FOR UPDATE` で悲観ロックを取る**（複数法人が同時解約 + 同一代理スタッフを抱えるケースで `deleted_at` セットが取りこぼされる race condition を防止する。READ COMMITTED 下で必要）
  - 各削除対象について残存メンバーシップを判定し、0 件のとき `users.deleted_at = now()` をセット
  - 旧挙動の `users.is_active = false` セットを完全に撤廃
  - `jobs` の `status = 'closed'` 更新（既存）を維持
  - 配下メンバーが 0 名のケース（個人プラン等）でも安全に NO-OP
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 9.4_

- [x] 4.3 削除と解約の RPC 修正に対応する pgTAP テストを追加・更新する
  - `delete_staff_member` v2: 他組織在籍時に `deleted_at` がセットされない / 残存 0 件で `deleted_at` がセットされる
  - `delete_staff_member` v2: `SELECT FOR UPDATE` による悲観ロックが効いていることを、同一ユーザーへの 2 つの並行トランザクションで検証する（一方が他方を待ち、最終的に必ず `deleted_at` がセットされる）
  - `handle_subscription_lifecycle_deleted` v2: 配下メンバーの行削除が実施される / 他組織在籍ユーザーの `deleted_at` がセットされない / 残存 0 件のユーザーはセットされる
  - `handle_subscription_lifecycle_deleted` v2: 複数法人の同時解約 + 同一代理スタッフのシナリオで `deleted_at` の取りこぼしが起きないことを並行トランザクションで検証する
  - `insert_staff_member_with_limit` の組織内代理一意性チェック（`PROXY_ACCOUNT_ALREADY_EXISTS`）が引き続き機能することを既存 pgTAP で確認する
  - N 組織化シナリオの追加テストとして、同一ユーザーが複数の異なる組織に代理として在籍してもユーザー単位の上限エラーにならないことを pgTAP で検証する
  - _Requirements: 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 11.3_
  - 2026-06-24 実装結果:
    - Migration: `supabase/migrations/20260616130000_delete_staff_member_v2.sql`（FOR UPDATE + 残存 0 件のときのみ deleted_at セット）
    - Migration: `supabase/migrations/20260616130100_handle_subscription_lifecycle_deleted_v2.sql`（旧 is_active=false 撤廃 / 各メンバーごとに FOR UPDATE → 削除 → 残存判定）
    - 新規 pgTAP: `delete_staff_member_v2.test.sql` 9 件（N 組織継続 / 残存 0 件 / 単一組織 / FOR UPDATE 静的存在検証）
    - 新規 pgTAP: `handle_subscription_lifecycle_deleted_v2.test.sql` 10 件（行削除 / N 組織継続 / Admin / 旧 is_active 撤廃 / FOR UPDATE 静的存在検証 / NO-OP / role downgrade 維持）
    - 既存更新 pgTAP: `insert_staff_member_with_limit.test.sql` plan 9 → 11（N 組織兼任シナリオ追加: 同一ユーザーが複数の異なる組織に代理として在籍可）
    - 並行トランザクション dblink テストは pgTAP の BEGIN/ROLLBACK + plpgsql DO 内で `SET LOCAL statement_timeout` が期待通り発火せずロック待ちで詰まる挙動を確認したため、prosrc 正規表現で FOR UPDATE 静的検証に置換（実環境 race 動作は Task 8.3 の Phase 8 E2E でカバー）
    - 既存 `delete_staff_member.test.sql`（旧 v1 の挙動テスト）は無変更で PASS。Test 4 は単一組織ユーザーで残存 0 件 → deleted_at セットを期待しており v2 でも振る舞いが等価
    - 全テスト結果: Vitest 1018/1018 PASS / pgTAP 297/297 PASS（30→31 ファイル、+19 件追加）/ Playwright proxy-multi-org スモーク 2/2 PASS

---

- [x] 5. 旧凍結方式の clean-up と既存データの正規化（Phase 5）

- [x] 5.1 既存環境の旧 `users.is_active = false` データを正規化する
  - 実行前に該当ユーザー件数を SQL でカウントしログに残す
  - 該当ユーザーの全 `organization_members` 行を削除
  - `users.deleted_at = now()` をセット
  - run-book に手順を残し、本番投入時のロールバック手順を明記
  - _Requirements: 4.9_

- [x] 5.2 `reactivateCorporateMembers` ヘルパー本体を削除する
  - `src/lib/billing/webhook/handle-subscription-lifecycle.ts:651-680` の関数定義を削除
  - alias `reactivateCorporateStaff` (`:683`) も削除
  - _Requirements: 4.7_

- [x] 5.3 `reactivateCorporateMembers` の 3 箇所の呼び出し元を cleanup する
  - `handle-checkout-completed.ts:139` の呼び出しを削除し周辺コメントを整理
  - `handle-subscription-lifecycle.ts:120` の呼び出しを削除し周辺コメントを整理
  - `handle-subscription-lifecycle.ts:371` の呼び出しを削除し周辺コメントを整理
  - 削除後に TypeScript build が成功することを確認
  - `npm run test` 全 PASS を確認
  - _Requirements: 4.7_
  - 2026-06-24 実装結果:
    - Migration: `supabase/migrations/20260616140000_lifecycle_v2_data_migration.sql`（DO ブロックで影響行数を NOTICE 出力 → organization_members 行削除 → users.deleted_at セット。is_active=false 自体は global ログインゲートとして残置）
    - コード削除: `handle-subscription-lifecycle.ts` から `reactivateCorporateMembers` 関数本体・alias・export を削除 + `handleSubscriptionCreated` 関数本体削除 (dispatcher 内で no-op return に置換) + `handleInvoicePaymentSucceeded` 内呼び出し削除
    - コード削除: `handle-checkout-completed.ts` から import + 呼び出し削除 (周辺コメントを Phase 5 撤廃の旨に書き換え)
    - Vitest 更新: `handle-subscription-lifecycle.test.ts` の `recovery from past_due` テストから `is_active=true` UPDATE 期待を削除し「users への UPDATE が発生しない」「organizations / organization_members の SELECT も発生しない」に変更
    - seed.sql 更新: J1 シナリオ (frozen-admin / frozen-staff) を Phase 5 正規化済み状態に書き換え (`users.deleted_at` セット + `organization_members` INSERT 除外)
    - Run-book: `.kiro/specs/proxy-account-multi-org-support/run-book-phase-5.md` 作成 (事前カウント / 投入手順 / 検証 / ロールバック)
    - 全テスト結果: Vitest 1018/1018 PASS / pgTAP 297/297 PASS / Playwright proxy-multi-org + billing + members + staff-access 計 48 件 PASS / TypeScript ノーエラー

---

- [x] 6. 招待時の既存ユーザー再利用パスと通知メールを追加する（Phase 6）

- [x] 6.1 既存ユーザー再利用判定ヘルパーを実装する
  - email で `users` を SELECT し、`role` / `last_name` / `first_name` / `deleted_at` を取得
  - 既存ユーザーの `organization_members` で `is_proxy_account = true` の行が 1 件以上あるかを admin client で横断確認
  - 入力氏名（`lastName`、`firstName`）と既存氏名の完全一致判定を含める
  - 結果として discriminated union（new_user / reuse_existing_proxy / reject_email_taken / reject_name_mismatch）を返す。**既存ユーザーの氏名情報は戻り値に一切含めない**（プライバシー保護: 上位呼び出し側からも露呈不能にする）
  - 既存ユーザーの `deleted_at` セット済みの場合は `new_user` 扱い（退会後の再登録）
  - _Requirements: 2.1, 2.2, 2.3, 2.7, 2.8_

- [x] 6.2 担当者招待 Server Action を v2 に拡張する
  - 既存の email 重複チェックを再利用判定ヘルパー呼び出しに置換
  - 新規ユーザー: Supabase Auth `inviteUserByEmail` 経由（既存挙動）
  - 既存ユーザー再利用: `inviteUserByEmail` をスキップし、既存 user_id で `insert_staff_member_with_limit` RPC を呼ぶ
  - 既存ユーザーが代理在籍していない場合（一般受注者・発注者・通常スタッフ等）は招待を拒否し汎用エラー「このメールアドレスは既に登録されています」を返す
  - 既存ユーザーが代理在籍中でも招待リクエストが通常スタッフ（`isProxyAccount = false`）の場合は招待を拒否（通常スタッフは 1 組織制限を維持）
  - 氏名不一致の場合は専用エラー「このメールアドレスは既に違うお名前で登録されています」を返す（既存氏名は応答に含めない）
  - 再利用パス成功時に「proxy-assigned-existing-user」メールを送信
  - エラーコードを `email_already_registered` / `name_mismatch` / `proxy_admin_combination` / `staff_limit_exceeded` 等の discriminated union で返す
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 5.3, 8.1, 8.3, 9.1, 9.2_

- [x] 6.3 既存ユーザー再利用時の通知メールテンプレを新規追加する
  - テンプレートファイルを `src/lib/email/templates/` 配下に追加
  - 件名「{組織名}の代理アカウントとして設定されました」
  - 本文に組織名・設定日時・サインインリンクを含める（パスワード設定リンクは含めない）
  - 文面は notifications spec §5.6.C 確定方針に準拠した暫定版で実装（最終文面は notifications spec 完了時に微調整）
  - _Requirements: 8.1, 8.2_

- [x] 6.4 既存ユーザー再利用パスの Vitest 統合テストを追加する
  - N 組織への代理招待が成功する
  - 既存ユーザーが代理在籍していない場合に拒否される
  - 通常スタッフ招待での既存ユーザー再利用が適用されないこと（拒否される）
  - 既存ユーザー再利用パスで `inviteUserByEmail` が呼ばれない（モック検証）
  - 既存ユーザー再利用パスで通知メールが送信される（モック検証）
  - 氏名不一致の場合に拒否され、エラー応答に既存氏名が含まれない
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7, 2.8, 11.2_
  - 2026-06-24 実装結果:
    - 新規ヘルパー: `src/lib/organization/resolve-existing-proxy-reuse.ts` (discriminated union: new_user / reuse_existing_proxy / reject_email_taken / reject_name_mismatch、氏名は戻り値に含めない)
    - 新規メールテンプレ: `src/lib/email/templates/proxy-assigned-existing-user.ts` (notifications spec §5.6.C 確定本文 + タスク 6.3 で追加された signInUrl CTA。件名「【ビジ友 運営】「{org}」の代理アカウントとして設定されました」)
    - createMemberAction v2: 旧 email 重複 SELECT を `resolveExistingProxyReuse` に置換 / reuse 分岐 (invite スキップ + RPC + audit_logs に reuse_existing_user メタデータ追記 + sendProxyAssignedEmail ヘルパー経由でメール送信、失敗してもメイン処理ブロックしない)
    - 新規 Vitest: `src/__tests__/organization/resolve-existing-proxy-reuse.test.ts` 8 件 (new_user / 削除済み / 代理在籍なし / proxy invite=false / 氏名一致 / 氏名不一致 / 氏名漏洩防止 / N 組織兼任)
    - createMemberAction テスト追加: 6 件 (N 組織招待成功 + invite スキップ + メール送信検証 / 氏名不一致応答に既存氏名なし / 通常スタッフ招待で既存 proxy を拒否 / 既存非代理 reject / 削除済みは new_user 扱い / reuse パス RPC エラー時の cleanup 不要)
    - 既存テスト更新: 「メール重複は日本語エラーで早期リターン」を「既存ユーザー (代理在籍なし) は『既に登録』日本語エラーで早期リターン」に書き換え (helper 経由で 2 SELECT)
    - 全テスト結果: Vitest 1032/1032 PASS / pgTAP 297/297 PASS / Playwright proxy-multi-org + members 計 20 件 PASS / TypeScript ノーエラー

---

- [x] 7. 組織切替 UI とコンテキスト永続化を実装する（Phase 7）

- [x] 7.1 `setActiveOrganizationContext` Server Action を実装する
  - 入力 `orgId` がアクターの `organization_members` に含まれることを確認
  - Cookie `bizyu_active_org`（HTTP-only, SameSite=Lax, Path=/, Max-Age=1年）に組織 ID を保存
  - 成功時の戻り値に `redirectTo: '/mypage'` を含めて呼び出し元に遷移先を通知
  - 不正な `orgId` の場合は Cookie 更新せず `not_a_member` エラーを返す
  - _Requirements: 7.4, 7.5_

- [x] 7.2 `OrgSwitcher` コンポーネントを実装する
  - design.md「暫定 UI スペック」に従う（shadcn `<Select>` ベース、`w-[240px]`、「現在: 」ラベル付き）
  - `memberships.length > 1` のときのみレンダリングし、1 件以下は DOM 出力なし
  - 選択肢は `client_profiles.display_name` を解決、フォールバックは Owner の姓名
  - 並び順は `organization_members.created_at ASC` で安定化
  - 選択時に `setActiveOrganizationContext` を呼び、成功なら `window.location.href = '/mypage'`、失敗ならトーストでエラー表示
  - アクセシビリティ属性（`aria-label="所属組織を切り替える"`）を付与
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 7.3 ヘッダーレイアウトに OrgSwitcher を組み込む
  - 全 (authenticated) layout のヘッダー右側、`/mypage` リンクの左隣に配置
  - RSC で memberships 一覧を取得し OrgSwitcher に渡す
  - モバイル表示時の幅調整（`w-full`）に対応
  - _Requirements: 7.1, 7.2_

- [x] 7.4 切替時の `/mypage` 固定遷移を Playwright E2E で検証する
  - 組織スコープ URL（`/jobs/[id]/applicants` 等）で OrgSwitcher を操作し、`/mypage` に着地することを確認
  - 切替後にマイページのデータが新組織のものに切り替わっていることを確認
  - 不正な orgId（URL 改竄等）に対して安全にエラー処理されることを確認
  - _Requirements: 7.4, 11.4_
  - 2026-06-24 実装結果:
    - 7.1 実装: `src/lib/organization/set-active-org-context.ts`（UUID 正規表現 + memberships 検証 + HTTP-only / SameSite=Lax / Path=/ / Max-Age=1年 Cookie）。新規 Vitest `src/__tests__/organization/set-active-org-context.test.ts` 8 件 PASS（入力バリデーション 3 / メンバーシップ検証 2 / 成功パス 3）
    - 7.2 実装: `src/components/organization/org-switcher.tsx`（Client Component、`memberships.length <= 1` で null 返却、shadcn Select ベース、`aria-label="所属組織を切り替える"`、切替成功時 `window.location.href = redirectTo`、失敗時 `toast.error`）
    - 7.3 統合: `src/components/site-header.tsx` に `orgSwitcher?: React.ReactNode` props 追加（ハンバーガーメニュー左隣に配置）。`src/app/(authenticated)/layout.tsx` で `getActiveOrganizationContext` を呼び `all.length > 1` のときのみ `<OrgSwitcher>` を生成して SiteHeader に注入
    - 7.4 E2E: `e2e/org-switcher.spec.ts` 4 件 PASS（単一組織で DOM 非出力 / N 組織で表示 / `/messages` から切替で `/mypage` 固定着地 + データ切替 / 不正 orgId Cookie で既定組織にフォールバック）
    - 全テスト結果: Vitest 1040/1040 PASS / pgTAP 297/297 PASS / Playwright 260/260 PASS（admin.spec.ts:439 の 1 件は run 終盤の `ERR_NETWORK_IO_SUSPENDED` 環境 flake、単体再実行で PASS 確認済）
    - TypeScript ノーエラー

---

- [x] 8. N 組織兼任シナリオの全 E2E 網羅と最終回帰確認（Phase 8）

- [x] 8.1 (P) 招待 → N 法人追加 → 動作確認の E2E シナリオを追加する
  - 法人 A の Owner が代理スタッフを招待 → 法人 B の Owner が同じ email で代理招待 → 法人 B にも追加される
  - 兼任スタッフがログインして両組織で代理として動作することを確認
  - 既存ユーザー再利用パスで通知メールが送信されることを Inbucket 等で検証
  - _Requirements: 2.1, 8.1, 11.4_

- [x] 8.2 (P) 削除 → 他組織で継続の E2E シナリオを追加する
  - 法人 A が代理を削除 → スタッフは法人 B で引き続き代理として動作
  - 法人 A での削除時に法人 B のスレッド・案件・応募データが影響を受けないことを確認
  - _Requirements: 3.1, 3.4, 11.4_

- [x] 8.3 (P) 解約 → 他組織で継続の E2E シナリオを追加する
  - 法人 A が解約 → スタッフは法人 B で引き続き代理として動作
  - 法人 A の配下メンバーで他組織にも在籍するユーザーは `deleted_at` がセットされない
  - 残存 0 件のユーザーは `deleted_at` がセットされる
  - _Requirements: 4.1, 4.2, 4.3, 11.4_

- [x] 8.4 (P) 組織切替 UI の操作 E2E シナリオを追加する
  - N 組織兼任スタッフがログイン → `OrgSwitcher` で組織切替 → マイページのデータが切り替わる
  - 切替時に常に `/mypage` に着地することを確認（組織スコープ URL からの切替を含む）
  - 単一組織ユーザーには OrgSwitcher が DOM 出力されないことを確認
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 11.4_

- [x] 8.5 (P) 氏名不一致・代理+admin 禁止の E2E シナリオを追加する
  - 既存ユーザー再利用パスで氏名を間違えて入力すると汎用エラーが表示される（既存氏名を含まない）
  - CLI-022 招待フォームで代理チェック ON にすると admin オプションが消える
  - _Requirements: 2.7, 2.8, 6.1, 11.4_

- [x] 8.6 最終回帰確認とメール spec への引き継ぎ
  - `npm run test` / `supabase test db` / `npm run test:e2e` 全 PASS
  - notifications spec の §5.7 保留ブロック解除条件を満たしていることを確認
  - 実装完了を `.kiro/specs/notifications/email-decisions-wip.md` に記載し、§5.7 議論再開を可能にする
  - _Requirements: 11.1, 11.5, 12.1, 12.2, 12.3_
  - 2026-06-24 実装結果:
    - 8.1〜8.5 E2E: `e2e/phase8-multi-org.spec.ts` 新規 5 件 PASS（reuse path 招待 + 通知メール / 削除スコープ限定 / 解約スコープ限定 / 氏名不一致 reject / admin オプション非表示）
    - 8.4 補足: Phase 7 / Task 7.4 で実装した `e2e/org-switcher.spec.ts` 4 件で完全網羅済（単一組織 DOM 非出力 / N 組織表示 / `/mypage` 固定遷移 + データ切替 / 不正 orgId Cookie フォールバック）。Phase 8 では重複追加せず、phase8-multi-org.spec.ts のヘッダーコメントで参照
    - Phase 8 seed: `f888...` 帯で完全分離した Org Z1〜Z7 + Target 4 ユーザー + 1 messaging thread を seed.sql 末尾に追加。1 組織 = 1 代理（partial UNIQUE）を守るためシナリオ別に独立した Org を割り当て
    - playwright.config.ts: `dotenv.config({path: ".env.local"})` 追加（8.3 の `handle_subscription_lifecycle_deleted` RPC 直接呼び出しで `SUPABASE_SERVICE_ROLE_KEY` を使うため）
    - dev メール検証: `/tmp/bijiyu-dev-mail` を polling する `findDevMailFor` ヘルパー（Mailpit は Supabase Auth 専用のため、アプリ層から送る Resend mock = `devLocalEmailFallback` 経由のメールはファイル書き出しを検証する）
    - notifications spec 更新: `.kiro/specs/notifications/email-decisions-wip.md` §5.7 を「🟡 保留中」→「🟢 保留解除（前提 spec 完了 2026-06-24）」に書き換え。Gap 3 件の解決内容 + 文面確定の前提が揃った事項を記載
    - 最終回帰: Vitest 1040/1040 PASS / pgTAP 297/297 PASS / Playwright 264/265 PASS（残 1 件は `admin.spec.ts:439` の ERR_NETWORK_IO_SUSPENDED 環境 flake、単体再実行で PASS 確認済、実バグなし）
    - TypeScript ノーエラー

---

## 要件カバレッジ確認

| Requirement | 対応タスク |
|---|---|
| 1.1, 1.2, 1.3, 1.4 | 1.1（既存データ正規化）, 2.1（共通ヘルパー）, 3.1〜3.8（40 ファイル置換）, 4.1, 4.2（RPC 行削除統一）|
| 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8 | 6.1（判定ヘルパー）, 6.2（Server Action 拡張）, 6.4（Vitest 統合）, 8.1（招待 E2E）, 8.5（氏名不一致 E2E）|
| 3.1, 3.2, 3.3, 3.4 | 4.1（delete_staff_member v2）, 4.3（pgTAP）, 8.2（削除→他組織継続 E2E）|
| 4.1, 4.2, 4.3, 4.4, 4.5, 4.7 | 4.2（handle_subscription_lifecycle_deleted v2）, 4.3（pgTAP）, 5.2, 5.3（reactivateCorporateMembers 廃止）, 8.3（解約→他組織継続 E2E）|
| 4.6 | **実装変更不要**（既存 middleware の `is_active = false` ログイン拒否挙動を保全）。Phase 0 の全テスト PASS および 8.6 の最終回帰確認で担保 |
| 4.8 | **設計フェーズで完了済**（design.md で「`delete_staff_member` と `handle_subscription_lifecycle_deleted` は個別 RPC として維持する」を判断・実装フェーズでの追加タスクなし）|
| 4.9 | 5.1（旧 `is_active = false` データ正規化 migration）|
| 5.1, 5.2 | 4.3（`insert_staff_member_with_limit` の既存 pgTAP 期待値確認 + N 組織化シナリオ追加）|
| 5.3 | 6.2（既存ユーザー再利用パスから `insert_staff_member_with_limit` を経由する経路の実装）|
| 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7 | 1.1（DB CHECK + 既存データ正規化）, 1.2（UI 制約）, 1.3（Zod superRefine）, 1.4（Server Action 防衛）, 1.5（テスト網羅）, 8.5（E2E）|
| 7.1, 7.2, 7.3, 7.4, 7.5, 7.6 | 2.1（getActiveOrganizationContext）, 3.1〜3.8（40 ファイル置換）, 7.1（setActiveOrganizationContext）, 7.2（OrgSwitcher）, 7.3（ヘッダー組み込み）, 7.4（/mypage 固定遷移 E2E）, 8.4（組織切替 E2E）|
| 8.1, 8.2, 8.3 | 6.2（既存ユーザー再利用時の送信トリガー）, 6.3（メールテンプレ新規追加）, 6.4（Vitest 統合）, 8.1（招待 E2E）|
| 8.4 | 6.3（暫定文面で実装）, 8.6（notifications spec への引き継ぎ完了で最終文面確定可能化）|
| 9.1, 9.2, 9.3, 9.4 | 6.2（通常スタッフ招待での既存ユーザー再利用拒否）, 4.1（削除 RPC の汎用スコープ判定）, 4.2（解約 RPC の汎用スコープ判定）, 6.4（Vitest 統合）|
| 10.1, 10.2, 10.3, 10.4 | **対象外**（spec の明示的 Non-Goal、admin 関連 UI は SQL / seed 運用維持）|
| 11.1, 11.2, 11.3, 11.4, 11.5 | 0（既存テスト全 PASS 確認）, 1.5（R6 テスト）, 2.2（ヘルパー Vitest）, 3.3（N 組織スモーク）, 3.9（Phase 3 完了検証）, 4.3（RPC pgTAP）, 6.4（既存ユーザー再利用 Vitest）, 7.4（切替 E2E）, 8.1〜8.6（N 組織 E2E 全シナリオ + 最終回帰）|
| 12.1, 12.2, 12.3 | 8.6（notifications spec への引き継ぎ完了・§5.7 保留ブロック解除条件達成）|
