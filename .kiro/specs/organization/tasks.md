# Implementation Plan — organization

> **注**: 本 spec は既存コードの広範なリファクタリング（発注者表示名を `client_profiles.display_name` に一本化、`organizations.name` カラム廃止）+ 新規 11 画面の実装 + 課金フロー統合を含む。タスクは大きく 3 段階に分かれる:
>
> - **リファクタ段階（Task 1〜8）**: Phase 1 マイグレーション + 共通ヘルパー + クエリ書き換え + organization-setup 統合。CLI-016〜025 画面実装より**先に完了させる**（CLAUDE.md ルール準拠）
> - **新規実装段階（Task 9〜17）**: CLI-016〜025 + AUTH-008 の画面・Server Action・テスト追加
> - **最終統合と破壊的マイグレーション（Task 18〜19）**: 全テスト緑化後、観察期間を経て Phase 3 の DROP COLUMN を別 PR で投入
>
> Migration 戦略の詳細は `design.md` の「Migration Strategy」セクション、リファクタの具体ファイルは `requirements.md` の「付録 A」を参照。

---

## Task 1: 既存テストのベースライン確認（CLAUDE.md「タスク0」相当）

- [x] 1. 着手前に全テストが緑であることを確認する（CLAUDE.md の spec-impl 開始時ルール「タスク0 = 既存テストの全実行とデグレ確認」を満たすタスク）
  - `npm run test` で Vitest（単体・統合）が全件パスすることを確認
  - `supabase start` + `supabase db reset` 実行後、`supabase test db` で既存 pgTAP テストが全件パスすることを確認
  - `supabase start` + `npm run dev` 起動中に `npm run test:e2e` で Playwright E2E テストが全件パスすることを確認
  - いずれかが赤の場合、原因を調査・修正してから次タスクへ進む。本 spec の実装に着手しない
  - _Requirements: 5.2_

---

## Task 2: Phase 1 マイグレーション（9 ファイル、既存コードを壊さない先行配布）

- [ ] 2. Group 1 の 9 つの migration ファイルを作成し `supabase db reset` で適用確認する

- [x] 2.1 (P) organizations.name の NOT NULL 制約解除
  - `ALTER TABLE organizations ALTER COLUMN name DROP NOT NULL;` のみの小さな migration を作成
  - 既存データ（`name = ''` を含む）に影響なく適用できることを `supabase db reset` で確認
  - _Requirements: 6.5_

- [x] 2.2 (P) client_profiles への新規カラム追加
  - `address text NULL`（200 字上限は Zod で制御）を追加
  - `sns_x` / `sns_instagram` / `sns_tiktok` / `sns_youtube` / `sns_facebook` の boolean 列を `NOT NULL DEFAULT false` で追加
  - 既存の `client_profiles` 行にデフォルト値が正しく入ることを確認
  - _Requirements: 2.1, 2.2_

- [ ] 2.3 (P) users への password_set_at カラム追加 + email インデックス追加（R2 対応）
  - `public.users.password_set_at timestamptz NULL` を追加
  - 招待完了前（NULL）と完了後（timestamptz）を区別するために使用
  - **同 migration で `CREATE INDEX idx_users_email ON public.users(email)` を追加**（R2 対応）。CLI-025 のメール重複チェックを `public.users.email` 経由で O(log N) で実行するため。`auth.users.email` は UNIQUE のため `public.users.email` も実質ユニークだが、トリガー反映の race を許容するため**非 UNIQUE** インデックスとする
  - _Requirements: 3.1, 3.2, 3.4, 4.1_

- [ ] 2.4 organizations の SELECT RLS ポリシー刷新
  - 旧ポリシー `organizations_select`（is_same_org ベース）と `organizations_select_thread_participant`（messaging spec で追加）を DROP
  - 新ポリシー `organizations_select_public` を `USING (deleted_at IS NULL)` で CREATE（認証済みユーザー全員が生存組織を SELECT 可）
  - `organizations_select_admin` は維持（ソフト削除済みも admin は閲覧可）
  - _Requirements: 5.1, 6.2_

- [ ] 2.5 (P) avatars バケットの Storage RLS 追加
  - 既存の「自分のフォルダに INSERT/UPDATE/DELETE 可」ポリシーはそのまま残す（書き換えない）
  - **SECURITY DEFINER 関数 `is_org_admin_or_owner_of(uid uuid, target_owner_user_id uuid)` を本 migration 内で先に CREATE**（RLS 再帰回避。既存 `is_same_org()` と同じパターン。詳細シグネチャは design.md「Storage RLS」セクション参照）。`REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated`
  - 新ポリシー名 `avatars_client_profile_write` を追加: 組織 Owner/Admin が所属組織 Owner の user_id フォルダに画像をアップロード可能にする
  - INSERT/UPDATE/DELETE の WITH CHECK 条件は上記関数呼び出しで簡潔に書く: `is_org_admin_or_owner_of(auth.uid(), ((storage.foldername(name))[1])::uuid)`
  - ポリシー内で `organization_members` / `organizations` を直接サブクエリすることは**禁止**（RLS 再帰で PostgreSQL エラー）。既存マイグレーション `20260402100000_fix_org_members_rls_recursion.sql` の教訓に従う
  - **PERMISSIVE による OR 結合**: PostgreSQL の PERMISSIVE ポリシーは複数あれば自動 OR されるため、結果として「自分のフォルダ OR 同一組織 Owner のフォルダ」のいずれかにマッチすれば許可される
  - _Requirements: 2.2, 5.1_

- [ ] 2.6 (P) 担当者管理用の 2 つの SECURITY DEFINER 関数を作成
  - `insert_staff_member_with_limit(p_user_id, p_organization_id, p_org_role, p_is_proxy_account, p_max_staff)` を CREATE（D 採用により `p_last_name`/`p_first_name` は**渡さない**。氏名・ロールは Task 2.9 のトリガーが INSERT 時にメタデータから直接設定する）
  - 関数内で組織行 `FOR UPDATE` ロック → `organization_members` の非 owner 数を COUNT → `p_max_staff` 未満か検証 → `STAFF_LIMIT_EXCEEDED` 例外なら ROLLBACK → **R4 対応: `p_is_proxy_account = true` の場合は組織内に既存の代理がいないか EXISTS 確認、いれば `PROXY_ACCOUNT_ALREADY_EXISTS` 例外** → `public.users` 行存在確認（無ければ `USER_NOT_FOUND`）→ `organization_members` INSERT を atomic 実行
  - **role UPDATE および name UPDATE は行わない**（D 採用により handle_new_user トリガーが INSERT 時に正しい値で作成済み。RPC で UPDATE すると既存ユーザーのデータを破壊する R3 リスクが発生するため、構造的に UPDATE しない設計とする）
  - `delete_staff_member(p_target_user_id, p_organization_id, p_owner_user_id)` を CREATE（`scout_templates.owner_id` 移譲 → `organization_members` 物理削除 → `users.deleted_at` セットを atomic 実行）
  - どちらも `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO service_role`
  - _Requirements: 3.2, 3.4, 5.1_

- [ ] 2.7 organizations.name から client_profiles.display_name へのデータ移行
  - 既存の `organizations.name` 値を、対応する Owner の `client_profiles.display_name` に UPDATE でコピー
  - 該当 Owner に `client_profiles` が無ければ INSERT で新規作成（`user_id` + `display_name` のみ、他列はデフォルトまたは NULL）
  - 空文字（`name = ''`）の組織は UPDATE 対象外（display_name 空のままにする）
  - **初期化の 2 パスが衝突しないこと**: 本 migration（既存組織の Task 2.7 バックフィル）と、Webhook 経由の `client_profiles` 初期化（新規課金時に `users.last_name + first_name` をデフォルト格納）の 2 つで初期化が走る。本 migration が先に完了しているため、Webhook 側は `INSERT ... ON CONFLICT (user_id) DO NOTHING` 相当で保護し、既存 `display_name` を上書きしないこと（billing 仕様書 REQ-BL-005 / organization 仕様書 REQ-ORG-006-B に準拠）
  - _Requirements: 6.2_

- [ ] 2.8 ensure_organization_exists RPC の本体書き換え（シグネチャ不変）
  - `CREATE OR REPLACE FUNCTION ensure_organization_exists(uid uuid)` で現行定義を置換
  - 関数本体の `INSERT INTO organizations (owner_id, name) VALUES (uid, '')` を `INSERT INTO organizations (owner_id) VALUES (uid)` に変更
  - シグネチャは `(uid uuid)` のまま変更しないため、呼び出し側（`plan-actions.ts` / `handle_checkout_completed.ts` / `handle_checkout_completed_plan`）は無変更で継続動作
  - _Requirements: 6.4_

- [ ] 2.9 (P) handle_new_user トリガーの拡張（D 対応: contractor 経由の廃止 + 氏名同時保存）
  - `CREATE OR REPLACE FUNCTION handle_new_user()` で現行定義を置換
  - 旧: `INSERT INTO public.users (id, role, email) VALUES (NEW.id, 'contractor', NEW.email)`
  - 新: `INSERT INTO public.users (id, role, email, last_name, first_name) VALUES (...)`
    - `role` は `CASE WHEN NEW.raw_user_meta_data->>'invited_role' = 'staff' THEN 'staff'::user_role ELSE 'contractor'::user_role END`（メタデータ汚染防止のため `'staff'` のみ受理）
    - `last_name` = `NEW.raw_user_meta_data->>'invited_last_name'`
    - `first_name` = `NEW.raw_user_meta_data->>'invited_first_name'`
  - **目的**:
    - CLI-025 招待で作成される Admin/Staff が contractor を経由せず、最初から `role='staff'` + 氏名入りで作成される
    - 孤児 auth.users が「無料受注者」として bijiyu に居座るリスクが消滅（孤児になっても staff のため受注者機能は Middleware でブロック済み）
    - B1 で導入した RPC 引数 `p_last_name`/`p_first_name` が不要になる（Task 2.6 で削除済み）
  - **AUTH-001 への影響**: メタデータ無しの場合は COALESCE で `'contractor'` フォールバック + 氏名 NULL → 既存挙動と完全互換
  - _Requirements: 3.4, 4.1_

---

## Task 3: 共通ヘルパーの書き換え（付録 A Step 2）

- [ ] 3. 発注者表示名解決とアバター解決の共通関数を新仕様に書き換える

- [ ] 3.1 resolveParticipantName の再設計 + B3 対応ヘルパー追加
  - **resolveParticipantName 改修**:
    - 引数を `organizationName` から `displayName`（`client_profiles.display_name` の値）に変更
    - 優先順位を新方針「displayName → last_name + first_name」の 2 段階に書き換え
    - 姓名結合は **スペース無し**（`${last}${first}`）で統一（同ファイルの `getUserDisplayName` L24 のスペース有り不整合も同時修正）
    - 退会済みは「退会済みユーザー」、全空は「未設定」を返す
    - ユニットテスト（通常 / 退会済み / 未設定 / 姓名のみ の 4 シナリオ）
  - **resolveClientProfileForRow 新規追加（B3 対応）**:
    - シグネチャ: `resolveClientProfileForRow(row: { organization_id, owner?, organization? })` → `{ displayName, imageUrl, lastName, firstName, deletedAt }`
    - ロジック: `row.organization_id` が NULL → `row.owner` 経由 / NOT NULL → `row.organization.owner_user` 経由（Staff 作案件で社長の profile に到達できるようにする）
    - 詳細仕様（型定義・ロジック・適用範囲）は design.md「ClientProfileResolutionForRow（B3 対応）」セクション参照
    - ユニットテスト 4 シナリオ（個人プラン / 法人プラン Owner 作 / 法人プラン Staff 作で社長 profile / Owner 退会済み）
  - **getUserDisplayName に `'prefer-company'` モード追加（受注者屋号維持のため、追加発見対応）**:
    - 既存 mode union を `"full" | "company" | "prefer-company"` に拡張（デフォルト `"full"` 不変、既存 caller への影響なし）
    - `"prefer-company"` の挙動: `companyName` があれば `companyName` を返す、無ければ `${lastName}${firstName}` を返す、両方無ければ "未設定"。退会済みは "退会済みユーザー"
    - 既存 `"company"` モード（`companyName` 無いと "未設定"）はそのまま温存（破壊変更しない）
    - 用途: `resolveParticipantName` から `companyName` 引数が削除されるため、Task 4.3 / 4.4 で受注者表示用呼び出し（applicant / 受注者側 participant）はこのモード経由に移行する
    - ユニットテスト 4 シナリオ（屋号あり / 屋号なし＋姓名あり / 全空 / 退会済み）
  - 旧ヘルパー案 `resolveClientDisplayNameForOrgMember(userId)`（DB 問い合わせ型）は採用しない。代わりに上記ピュア関数 + 各クエリ側のネスト埋め込みで解決する
  - _Requirements: 6.1, 6.2_

- [ ] 3.2 (P) resolve-org-names.ts の廃止
  - `getActiveCorporateOrgNames()` 関数を削除
  - 呼び出し側（付録 A Step 3-A の 14 ファイル）では design.md「ClientProfileResolutionForRow（B3 対応）」の **standard query pattern**（`owner:users!owner_id(...)` + `organization:organizations(owner_user:users!owner_id(...))` のネスト埋め込み）+ `resolveClientProfileForRow()` ヘルパーで解決する方針に統一する。`client_profiles!inner(display_name)` の単純 embed は Staff 作成案件で NULL になるため使わない
  - bulk 取得ヘルパーは追加不要（ネスト埋め込みで N+1 が発生しないため）
  - 既存ユニットテスト `src/__tests__/utils/resolve-org-names.test.ts` は Task 16 で削除する（本タスクでは残しておく）
  - _Requirements: 6.2_

---

## Task 4: 受注者側 14 画面のクエリ書き換え（付録 A Step 3-A）+ Webhook 1 ファイルの宛先名修正（Task 4.5、追加発見）

- [ ] 4. `organizations.name` / `getActiveCorporateOrgNames()` 参照を `client_profiles.display_name` 経由に置き換える
  - **共通方針（4.1〜4.4 すべてに適用、B3 対応）**: design.md「ClientProfileResolutionForRow（B3 対応）」セクションの **standard query pattern** を使う。各クエリの `.select(...)` に `owner:users!owner_id(last_name, first_name, deleted_at, client_profiles(...))` と `organization:organizations(owner_user:users!owner_id(last_name, first_name, deleted_at, client_profiles(...)))` をネスト埋め込みし、TypeScript 側で `resolveClientProfileForRow(row)` → `resolveParticipantName(...)` の順で呼ぶ。これにより Staff 作成案件でも社長の display_name に到達できる
  - **作業着手前**: `supabase gen types` を再実行して型を最新化する（ネスト 3 層の型推論を効かせるため）

- [ ] 4.1 (P) 発注者一覧系画面のクエリ書き換え（CON-005/006/007 + CON-001）
  - `src/app/(authenticated)/clients/page.tsx`（CON-005 発注者一覧）
  - `src/app/(authenticated)/clients/[id]/page.tsx`（CON-006 発注者詳細）
  - `src/app/(authenticated)/favorites/page.tsx`（CON-007 マイリスト）
  - `src/app/(authenticated)/mypage/page.tsx`（CON-001 マイページ）
  - いずれも発注者名表示箇所を `client_profiles.display_name` 経由に統一、`resolveParticipantName({ displayName, lastName, firstName, deletedAt })` 呼び出し形式に更新
  - _Requirements: 6.2_

- [ ] 4.2 (P) 案件系画面のクエリ書き換え（CON-002/003/004 + CLI-002）
  - `src/app/(authenticated)/jobs/search/page.tsx`（CON-002 案件検索）
  - `src/app/(authenticated)/jobs/[id]/page.tsx`（CON-003 案件詳細）
  - `src/app/(authenticated)/jobs/[id]/apply/page.tsx`（CON-004 応募情報入力）
  - `src/app/(authenticated)/jobs/manage/page.tsx`（CLI-002 案件管理）
  - 案件カード・詳細に表示する発注者名を `client_profiles.display_name` に統一
  - _Requirements: 6.2_

- [ ] 4.3 (P) 応募系画面とアクションのクエリ書き換え（CON-011/012 + applications/actions.ts）
  - `src/app/(authenticated)/applications/history/page.tsx`（CON-011 応募履歴一覧）
  - `src/app/(authenticated)/applications/history/[id]/page.tsx`（CON-012 応募詳細）
  - `src/app/(authenticated)/applications/actions.ts`（マッチング通知メールの sender/recipient 名解決）
  - **発注者名（clientName, L434）**: ハードコード排除し共通方針の standard query pattern + `resolveParticipantName({ displayName, ... })` で動的解決
  - **受注者名（applicantName, L423）**: 旧 `resolveParticipantName({ companyName, ... })` は新シグネチャから companyName 引数が消えるため、`getUserDisplayName(applicant, 'prefer-company')` に置換（受注者の屋号表示を維持。Task 3.1 で追加した新モードを使用）
  - _Requirements: 6.2_

- [ ] 4.4 (P) メッセージ系画面とアクションのクエリ書き換え（メッセージ一覧・スレッド詳細・スカウト送信）
  - `src/app/(authenticated)/messages/page.tsx`
    - **発注者側を見るブランチ（L80-85 付近、participant1）**: standard query pattern + `resolveParticipantName({ displayName, ... })` に置換
    - **受注者側を見るブランチ（L89-93 付近、participant2）**: `resolveParticipantName({ companyName, ... })` を `getUserDisplayName(participant2, 'prefer-company')` に置換（受注者の屋号表示を維持）
  - `src/app/(authenticated)/messages/[threadId]/page.tsx`
    - スレッド詳細 L31 の `organizations(id, name)` embed を standard query pattern で置き換え、L55 の `organizationName` 参照を `resolveClientProfileForRow(thread)` 経由に更新
    - 受注者側ブランチ（L62-65 付近）も `getUserDisplayName(participant2, 'prefer-company')` に置換
  - `src/app/(authenticated)/messages/scout-send/actions.ts`（L179 付近の `organizationName` 利用も同様に `resolveClientProfileForRow` 経由の displayName 解決に更新）
  - **B3 注意**: `client_profiles!inner(display_name, image_url)` の単純 embed は使わない（Staff が送信側にいるスレッドで NULL になる）
  - _Requirements: 6.2_

- [ ] 4.5 (P) サブスクリプション通知メールの宛先名解決を `client_profiles.display_name` に切替（追加発見、新仕様準拠）
  - `src/lib/billing/webhook/handle-subscription-lifecycle.ts` L601-615 の `fetchRecipient()` 関数を修正
  - **背景**: 現コードは `users.company_name`（受注者向け屋号フィールド）を見て名前決定しているが、新仕様では「発注者の表示名は `client_profiles.display_name` に一本化」と決めたため不整合。法人プラン Owner が CLI-021 で正式社名を登録していても、サブスク通知メールでは古い屋号 or 個人名が表示される潜在バグ
  - **影響メール**: `subscriptionChangedEmail`（プラン変更通知）/ `subscriptionCancelledEmail`（プラン解約通知）/ `paymentFailedEmail`（支払い失敗通知）の3種類すべて。宛先はサブスク購入者本人（= `users.role = 'client'`）
  - **修正内容**:
    - SELECT を `email, last_name, first_name, client_profiles(display_name)` に変更（`company_name` を外す）
    - 名前決定ロジックを `display_name → 姓名 → "お客様"` の優先順位に変更
    - `organization_id` 分岐は不要（userId が常に `client_profiles.user_id` と一致するため B3 の resolveClientProfileForRow ヘルパーは不使用、直接 JOIN で十分）
  - 修正後のコードイメージ:
    ```typescript
    .select("email, last_name, first_name, client_profiles(display_name)")
    // ...
    const displayName = result.data.client_profiles?.[0]?.display_name?.trim();
    const personalName = `${result.data.last_name ?? ""}${result.data.first_name ?? ""}`;
    const name = displayName || personalName || "お客様";
    ```
  - _Requirements: 6.2_

---

## Task 5: 発注者アバター表示の統一（付録 A Step 3-B）

- [ ] 5. 受注者が発注者を見る場面のアバターを `client_profiles.image_url` に切り替える

- [ ] 5.1 (P) メッセージ一覧のアバター切替
  - `src/app/(authenticated)/messages/page.tsx`
  - **Task 4.4 と同一ファイル**: Task 4.4 の standard query pattern に既に `client_profiles(display_name, image_url, deleted_at)` が含まれているため、追加 SELECT は不要。本タスクは「**Task 4.4 で取得した image_url をアバター表示に使う**」だけ
  - 相手が発注者側（= スレッドの `organization_id IS NOT NULL` かつ自分が `participant_2_id`）なら `resolveClientProfileForRow(thread).imageUrl` を使用
  - 相手が受注者側の場合は従来通り `users.avatar_url`
  - `imageUrl` が NULL の場合は既存のデフォルト（`/assets/icons/icon-avatar.png`）にフォールバック
  - _Requirements: 6.3_

- [ ] 5.2 (P) スレッド詳細のアバター切替
  - `src/app/(authenticated)/messages/[threadId]/page.tsx`
  - **Task 4.4 と同一ファイル**: Task 4.4 の standard query pattern に既に `client_profiles(display_name, image_url, deleted_at)` が含まれているため、追加 SELECT は不要。本タスクは「**Task 4.4 で取得した `image_url` を、アバター描画箇所で使う**」だけ
  - `isContractorSide === true`（受注者が発注者を見る側）のときのみ `resolveClientProfileForRow(thread).imageUrl` を使用（`/assets/icons/icon-avatar.png` フォールバック）
  - 逆方向（発注者が受注者を見る）は従来通り `users.avatar_url`
  - _Requirements: 6.3_

---

## Task 6: organization-setup の削除と CLI-021 統合（付録 A Step 4-A）

- [ ] 6. 暫定画面 `/mypage/organization-setup` を廃止し、全プラン共通で CLI-021 の setup モードに統一する

- [ ] 6.1 (P) organization-setup 関連ファイルの削除
  - `src/app/(authenticated)/mypage/organization-setup/page.tsx` を削除（URL 直打ちは middleware で `/mypage/client-profile/edit?setup=true` に 308 リダイレクト）
  - `src/app/(authenticated)/mypage/organization-setup/actions.ts` を削除
  - `src/app/(authenticated)/mypage/organization-setup/OrganizationSetupForm.tsx` を削除
  - _Requirements: 6.4_

- [ ] 6.2 (P) billing の buildSuccessUrl 統一
  - `src/app/(authenticated)/billing/actions.ts` L95-100 付近の `buildSuccessUrl()` を全プラン統一
  - 個人 / 小規模 / 法人 / 法人高サポートすべてで `/mypage/client-profile/edit?setup=true` を返すよう変更
  - 既存の法人プランのみ `/mypage/organization-setup` という分岐を廃止
  - _Requirements: 6.4_

- [ ] 6.3 (P) BillingClient のアップグレード後遷移統一
  - `src/app/(authenticated)/billing/BillingClient.tsx` L205 付近の `window.location.href` 呼び出しも全プランで CLI-021?setup=true に遷移
  - `router.push()` ではなくハードナビゲーション（`window.location.href`）を維持（Router Cache 回避）
  - _Requirements: 6.4_

- [ ] 6.4 (P) auth callback に type=invite 分岐追加
  - `src/app/auth/callback/route.ts` L14-L66 付近に `flowType === 'invite'` の分岐を追加
  - `exchangeCodeForSession` 成功後、`/accept-invite/confirm` にリダイレクト
  - セッション確立失敗時は `/login?error=...` の既存動作を維持
  - _Requirements: 4.1_

- [ ] 6.5 (P) scout-send ページの並び順を updated_at 降順に変更
  - `src/app/(authenticated)/messages/scout-send/page.tsx` L78-81 付近の `scout_templates` クエリから `.order("created_at", { ascending: false })` を `.order("updated_at", { ascending: false })` に変更
  - _Requirements: 1.5_

- [ ] 6.6 (P) scout-send フォームの confirm 上書き追加
  - `src/app/(authenticated)/messages/scout-send/scout-send-form.tsx` の `handleTemplateSelect`（L63-70 付近）を修正
  - タイトル・本文のいずれかに入力がある場合、`window.confirm("入力中の内容がテンプレートで上書きされます。よろしいですか？")` を表示し、OK のときのみプリフィルを実行
  - _Requirements: 1.5_

---

## Task 7: seed.sql の更新

- [ ] 7. ローカル開発・E2E テスト用のシードデータをリファクタ後の仕様に整合させる

- [ ] 7.1 organizations.name 削除 + client_profiles.display_name 移行
  - `INSERT INTO organizations (id, name, owner_id) VALUES ...`（現状 L453・L911・L974 の 3 箇所）から `name` フィールドを削除
  - 既存の組織名（例「鈴木工務店株式会社」「山田建設株式会社」「補償テスト建設」）を、対応する Owner の `client_profiles.display_name` に UPDATE/INSERT として同 seed 内で設定
  - 既存 `client_profiles` のうち 1〜2 行に `address` カラムのサンプル値（例「東京都墨田区向島1-2-3」「埼玉県さいたま市大宮区4-5-6」）を追加し、CLI-020/021 の E2E テストで住所表示を検証可能にする
  - `sns_*` カラムは全行 `false` のままで OK
  - _Requirements: 2.1, 2.2, 6.2_

- [ ] 7.2 J1 シナリオ用テストデータ追加（法人プラン完全解約済み + 冷凍保存 Admin/Staff）
  - 新規テストユーザー `corp-cancelled@test.local`（法人プラン Owner、`subscriptions.status='cancelled'`、`users.role='contractor'` に降格済み）を追加
  - 同組織に `frozen-admin@test.local`（`role='staff'`、`org_role='admin'`、`is_active=false`）と `frozen-staff@test.local`（`role='staff'`、`org_role='staff'`、`is_active=false`）を配置
  - `client_profiles.display_name='解約済み建設'` として保持（再アップグレード時の prefill 検証用）
  - `scout_templates` を 1〜2 件 `organization_id=<冷凍保存組織>` で登録（再課金時の継続利用検証用）
  - **用途**: J1 シナリオ E2E（Task 13.45.4）で「冷凍 Admin がログイン試行 → ブロック」「再課金 → is_active=true 復帰 → ログイン再開」「既存 scout_templates がそのまま利用可能」を検証
  - _Requirements: 2.1, 2.2, 6.2_

- [ ] 7.3 C 案シナリオ用テストデータ追加（退会済み Owner + 組織ソフトデリート）
  - 新規テストユーザー `withdrawn-owner@test.local`（`users.role='client'`、`users.deleted_at=now()`）を追加
  - 対応する組織 `organizations.deleted_at=now()` でソフトデリート状態に設定
  - `organization_members` レコードは INSERT しない（物理削除済みを模擬）
  - `client_profiles.display_name='退会済み組織'` は残す（C 案仕様: 履歴として保持）
  - 同組織の受注者との過去メッセージスレッドを 1 件用意（受注者側から発注者名「退会済み組織」が表示されることの検証用）
  - **用途**: Task 13.4.3 の E2E で「退会後、受注者が過去スレッドを開く → 社名表示維持」「発注者一覧・マイリストで非表示」を検証
  - _Requirements: 2.1, 2.2, 6.2_

- [ ] 7.4 招待フロー用テストデータ追加（password_set_at パターン）
  - 既存組織（例 `55555555-...`）に以下 2 名を追加:
    - `invited-admin@test.local`（`password_set_at IS NULL`、`org_role='admin'`、招待中バッジ検証用）
    - `completed-admin@test.local`（`password_set_at=now()`、`org_role='admin'`、招待完了検証用）
  - `auth.users` / `auth.identities` / `public.users` / `organization_members` を一貫して登録
  - **用途**: Task 17.3 の E2E で CLI-022（一覧）の招待中バッジ表示、CLI-023 の招待再送ボタン有効化を検証
  - _Requirements: 3.1, 3.4, 6.2_

- [ ] 7.5 代理アカウント重複拒否テスト用データ追加
  - 既存組織（例 `55555555-...`）に既存代理アカウント `existing-proxy@test.local`（`is_proxy_account=true`）を確実に配置（現在は `staff=33333333` がこの役割を担っているため、そのまま維持 + テスト整合を確認）
  - **用途**: Task 17.3 の E2E で「代理 ON の新規 Admin を CLI-025 で作成しようとすると `PROXY_ACCOUNT_ALREADY_EXISTS` エラー」を検証
  - _Requirements: 3.4, 6.2_

- [ ] 7.6 人数上限近いテストデータ（任意）
  - 法人プラン組織に Staff 8 名程度を配置（`maxStaff=10` のため、あと 2 名追加で上限到達）
  - **用途**: Task 17.3 の E2E で「上限到達時の STAFF_LIMIT_EXCEEDED エラー」を検証。上限に近い状態を用意しておくことで、テスト内で 3 名追加しようとして 3 人目で失敗する流れが自然に組める
  - 時間的コストが大きい場合は人数上限検証は Vitest 統合テスト側で RPC 直接呼び出しで代替可
  - _Requirements: 3.4, 6.2（優先度低）_

- [ ] 7.7 整合性確認
  - 上記 7.1〜7.6 実行後、`supabase db reset` でエラー無く適用できること
  - 既存の E2E テスト（`display-name.spec.ts` / `billing.spec.ts` 等）が引き続き通ること（seed データの変更で期待値が壊れないこと）
  - _Requirements: 5.2_

---

## Task 8: リファクタリング完了後のテスト検証

- [ ] 8. Task 2〜7 完了後、3 コマンドで全テスト緑化を確認する
  - `supabase db reset`（新規 migration 9 ファイル + 更新 seed.sql を反映）
  - `npm run test` → 書き換えた 14 ファイルが Vitest でコケないことを確認
  - `supabase test db` → 既存 pgTAP（RLS）テストが通ることを確認
  - `supabase start` + `npm run dev` → `npm run test:e2e` で Playwright 既存テストが通ることを確認
  - 赤があれば次タスク（新規画面実装）に進まず、該当リファクタファイルを修正する
  - _Requirements: 5.2_

---

## Task 9: スカウトメッセージテンプレート機能の実装（CLI-016〜019）

- [ ] 9. テンプレート CRUD の Server Action と 4 画面を実装する

- [ ] 9.1 scoutTemplate Server Action の実装
  - `create` / `update` / `delete` の 3 アクションを Server Action として実装
  - Zod スキーマ（title ≤ 50 / body ≤ 2000 / memo ≤ 500）で空白トリム + 日本語エラーメッセージ
  - `owner_id = auth.uid()`、`organization_id` は作成者の所属組織（法人プランなら `organization_members` を参照）を自動設定
  - 成功時 `revalidatePath('/messages/templates')` を呼ぶ
  - 全アクションに対応する Vitest 統合テスト（正常系 + 権限違反 + RLS 違反）を追加
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 9.2 (P) CLI-016 テンプレート一覧画面
  - `/messages/templates/page.tsx`（RSC）で `scout_templates` を `updated_at` 降順で 20 件ずつページネーション
  - 表示項目: タイトル、本文プレビュー（先頭 80 字）、作成日。法人プランは追加で作成者氏名
  - 「新規作成」ボタン → CLI-019、各行クリック → CLI-017 へ遷移
  - 0 件時のメッセージ表示
  - `design-assets/screens/CLI-016.png` に従ったレイアウト
  - _Requirements: 1.1_

- [ ] 9.3 (P) CLI-017 テンプレート詳細画面
  - `/messages/templates/[id]/page.tsx`（RSC）でテンプレートの全内容表示
  - 表示項目: タイトル、本文、メモ、作成日（法人プランは作成者氏名も）
  - 「編集する」ボタン → CLI-018、「削除する」ボタン → 確認ダイアログ → `deleteScoutTemplateAction`
  - `design-assets/screens/CLI-017.png` に従ったレイアウト
  - _Requirements: 1.2_

- [ ] 9.4 (P) CLI-018 テンプレート編集画面
  - `/messages/templates/[id]/edit/page.tsx` + クライアントフォーム
  - `react-hook-form` + Zod で入力検証、`updateScoutTemplateAction` 呼び出し
  - 保存成功時 CLI-017 へ戻る、エラー時は toast で通知
  - `design-assets/screens/CLI-018.png` に従ったレイアウト
  - _Requirements: 1.3_

- [ ] 9.5 (P) CLI-019 テンプレート新規作成画面
  - `/messages/templates/new/page.tsx` + クライアントフォーム
  - `createScoutTemplateAction` 呼び出し、成功時に CLI-016 へ戻る
  - `design-assets/screens/CLI-019.png` に従ったレイアウト
  - _Requirements: 1.4_

---

## Task 10: 発注者プロフィール機能の実装（CLI-020, 021）

- [ ] 10. 発注者情報の表示・編集と setup モード遷移を実装する

- [ ] 10.1 clientProfile Server Action の実装
  - `saveClientProfileAction(input, { mode: 'edit' | 'setup', skip?: boolean })` — `client_profiles` の UPSERT
  - Zod スキーマ 2 バリアント（`clientProfileSchema` / `clientProfileSetupSchema`）で法人プラン必須 vs 非法人任意を分岐
  - setup モード + 法人プランで displayName 必須、非法人プランは skip 可能
  - `subscriptions.plan_type` が未確定（Webhook 未着）なら「プラン情報を反映中です。数秒後にもう一度お試しください」を返却
  - 成功時 `redirectTo = '/mypage'`（setup モード）または `/mypage/client-profile`（edit モード）
  - `uploadClientProfileImageAction(formData)` — MIME `image/jpeg|png`、5MB 以下、Storage パスは `{owner_user_id}/client-profile.{ext}`
  - Vitest 統合テスト: setup モード法人必須、個人任意、Webhook 未着エラー、画像アップロードの MIME / サイズ違反
  - _Requirements: 2.1, 2.2_

- [ ] 10.2 (P) CLI-020 発注者情報詳細画面
  - `/mypage/client-profile/page.tsx`（RSC）で Owner（または Admin の場合は所属組織 Owner）の `client_profiles` を表示
  - 表示項目: 社名・氏名（`display_name`）、住所、画像、勤務スタイル、使用言語、メッセージ、評判、採用職種・エリア、従業員規模
  - Staff の場合は閲覧のみ、Owner/Admin の場合は「編集する」ボタンで CLI-021 へ
  - `design-assets/screens/CLI-020.png` に従ったレイアウト
  - _Requirements: 2.1_

- [ ] 10.3 (P) CLI-021 発注者情報編集画面（setup モード統合）
  - `/mypage/client-profile/edit/page.tsx` + クライアントフォーム
  - URL の `?setup=true` でセットアップモード（Webhook 未着時のガード緩和、「スキップ」ボタン表示）
  - 画像アップロードは別 Server Action で実施、URL を form 側の `hidden` input に反映
  - SNS チェックボックス付近に「※運営上の集計等のみに使用し、webアプリ上に表示はされません」の注記を表示
  - 保存成功後はクライアント側で `window.location.href` によるハードナビゲーション（Router Cache 回避）
  - `design-assets/screens/CLI-021.png` に従ったレイアウト（住所欄はデザインカンプ未描画のため仕様書本文に従う）
  - _Requirements: 2.1, 2.2, 6.4_

---

## Task 11: 担当者管理機能の実装（CLI-022〜025）

- [ ] 11. 担当者 CRUD と招待メール再送の Server Action + 4 画面を実装する

- [ ] 11.1 member Server Action の実装
  - `createMemberAction(input)`: Zod → 権限チェック → **メール重複チェック（R2 対応: `admin.from('users').select('id').eq('email', input.email).maybeSingle()` で O(log N) 確認、ヒットしたら早期リターン。`auth.admin.listUsers()` は使わない）** → plan_type 取得 → `inviteUserByEmail(email, { redirectTo, data: { invited_role: 'staff', invited_last_name: input.lastName, invited_first_name: input.firstName, inviter_name, organization_name } })` を呼ぶ（**D 対応**: メタデータ経由でトリガーが INSERT 時に role='staff' と氏名を設定。孤児 auth.users のフォールバックとしてここでも email 重複エラーを掴む 2 段防御）→ `insert_staff_member_with_limit(new_user_id, org_id, org_role, is_proxy, max_staff)` RPC 呼び出し（D 採用により name/role 引数なし。RPC は人数チェック + organization_members INSERT のみ実行）→ RPC 失敗時 `auth.admin.deleteUser` cleanup + `audit_logs` 記録
  - `updateMemberAction(targetUserId, input)`: 氏名 / メール / 権限 / 代理フラグの更新。メール変更は「本人 = `auth.updateUser`」「管理者 = `auth.admin.updateUserById(email_confirm: true)` + Resend 通知」で分岐。**R4 対応**: `is_proxy_account = true` への切替時は UPDATE 前に `select id from organization_members where organization_id = ? and is_proxy_account = true and user_id != targetUserId` を SELECT して既存代理の有無を確認、ヒットしたら「代理アカウントは既に登録されています。既存の代理アカウントを解除してから再度お試しください」を返す（DB 部分 UNIQUE が最終ガード、race 時は 23505 を catch して同じメッセージへフォールバック）
  - `deleteMemberAction(targetUserId)`: `delete_staff_member` RPC 呼び出し + `audit_logs` 記録
  - `resendInviteAction(targetUserId)`: `auth.admin.inviteUserByEmail` 再送（`password_set_at IS NULL` 時のみ有効）
  - すべて `ActionResult` 形式で返却、エラーは日本語メッセージに変換
  - Vitest 統合テスト（**D 対応: `inviteUserByEmail` 呼び出し時のメタデータに `invited_role='staff'` + `invited_last_name` + `invited_first_name` が含まれることをモックでアサート** / **メール重複チェックで既存 `public.users.email` を早期拒否（R2 対応）** / `STAFF_LIMIT_EXCEEDED` → cleanup 成功 / cleanup 失敗時の audit_log 記録 / inviteUserByEmail 失敗で RPC を呼ばない / メール変更 2 モード / **R4 対応: createMemberAction で代理 ON 時に既存代理あり → RPC が `PROXY_ACCOUNT_ALREADY_EXISTS` を返し日本語化 / updateMemberAction で代理 ON 切替時に既存代理あり → 事前 SELECT でヒット → 同じ日本語メッセージ**）
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 11.2 (P) CLI-022 担当者一覧画面
  - `/mypage/members/page.tsx`（RSC）で所属組織の `organization_members` + `users` を取得し一覧表示
  - 20 件ページネーション + `?q=` 検索（氏名・メール部分一致）
  - Owner は「管理責任者」タグ付きで表示。`password_set_at IS NULL` のメンバーは「招待中」バッジ表示
  - 「新規作成」ボタン（Owner/Admin のみ）→ CLI-025、行クリック → CLI-023
  - `design-assets/screens/CLI-022.png`（PC/SP 両方）に従ったレスポンシブレイアウト
  - _Requirements: 3.1_

- [ ] 11.3 (P) CLI-023 担当者詳細画面
  - `/mypage/members/[id]/page.tsx`（RSC）で担当者の詳細情報を表示
  - 「対象ロール」表に従い編集・削除ボタンの表示を分岐（Owner が自分を開いた場合は `/profile/edit` リンク、Admin/Staff が自分を開いた場合は CLI-024 自己編集モード）
  - 招待再送ボタン（Owner/Admin + `password_set_at IS NULL` 時のみ表示）
  - 削除確認ダイアログに「この担当者が作成したテンプレートは管理責任者に引き継がれます」を表示
  - `design-assets/screens/CLI-023.png` に従ったレイアウト
  - _Requirements: 3.2_

- [ ] 11.4 (P) CLI-024 担当者編集画面
  - `/mypage/members/[id]/edit/page.tsx` + クライアントフォーム
  - 「対象ロール」表に従い編集可能項目を動的切り替え（自己編集 / Admin→Staff / Owner→Admin など）
  - 権限（`org_role`）フィールドは Admin が Staff を編集する場合は非表示
  - 「アカウントを別担当者に引き継ぐ場合は…」の注意書きを画面上部に表示
  - メール変更時のトースト文言を自己編集 / 管理者変更で分岐
  - `design-assets/screens/CLI-024.png` に従ったレイアウト
  - _Requirements: 3.3_

- [ ] 11.5 (P) CLI-025 担当者新規作成画面
  - `/mypage/members/new/page.tsx` + クライアントフォーム（入力 → 確認 → 送信の 2 ステップ）
  - `org_role` 選択肢は操作者のロールで動的に制限（Owner は admin/staff、Admin は staff のみ）
  - 法人プラン以外では代理アカウントチェックボックス非表示
  - `createMemberAction` 呼び出し、成功時 CLI-022 へリダイレクト
  - `design-assets/screens/CLI-025.png` に従ったレイアウト
  - _Requirements: 3.4_

---

## Task 12: 招待承諾画面（AUTH-008）の実装

- [ ] 12. 招待リンクからのパスワード初回設定画面を実装する
  - `/accept-invite/confirm/page.tsx`（Client Component）を AUTH-004 を流用して作成
  - AUTH-008 専用のデザインカンプは存在しないため、`design-assets/screens/AUTH-004.png` をベースにレイアウトを踏襲する（本プロジェクトでは AUTH-004 と AUTH-008 を同一ビジュアルで提供する方針）
  - 差分の 5 箇所（タイトル「ビジ友へようこそ」、説明文、ボタン文言、遷移先、期限切れメッセージ）を差し替え
  - 組織名（`client_profiles.display_name`）を RSC で prefill（Server Component でラップ）
  - `acceptInviteAction(input)` — `supabase.auth.updateUser({ password })` + admin client で `UPDATE public.users SET password_set_at = now() WHERE id = auth.uid()`
  - 認証済みかつ `password_set_at` が既セットの場合は無言で `/mypage` にリダイレクト
  - 期限切れリンクは日本語エラー「リンクの有効期限が切れています。招待元に再送を依頼してください」+ 「ログイン画面へ戻る」ボタン
  - Vitest 単体テスト（パスワード強度 + 期限切れエラー）
  - _Requirements: 4.1_

---

## Task 13: Middleware と認可ガードの更新

- [ ] 13. 新規画面と setup モードを Middleware で正しく守る
  - `CLIENT_ONLY_PREFIXES` に `/messages/templates`、`/mypage/client-profile`、`/mypage/members` を追加し、受注者のみのアカウントはブロック
  - ただし `role = 'client'` 持ちのユーザー（発注者 or 担当者）は通過
  - `/mypage/client-profile/edit?setup=true` は認証済みなら plan / role 未確定でも通過（Webhook 未着対策）
  - `/mypage/organization-setup` への GET は `/mypage/client-profile/edit?setup=true` に 308 リダイレクト
  - CLI-024（`/mypage/members/[id]/edit`）で Owner が自分の ID を開いたら `/profile/edit` にリダイレクト
  - `/profile/edit` で `role = 'staff'` がアクセスしたら `/mypage/members/[自分ID]/edit`（CLI-024 自己編集モード）にリダイレクト
  - CON-004 / CON-011〜013 / CON-014〜016 で `role = 'staff'` はブロック（受注者アクション不可）
  - _Requirements: 5.1, 6.4_

---

## Task 13.4: COM-006（退会画面）の C 案対応リファクタ（2026-04-19 C 案採用）

- [ ] 13.4 既存 `src/app/(authenticated)/profile/withdrawal/` を組織ごとソフトデリート方式（C 案）に書き換える

- [ ] 13.4.1 `withdrawal/actions.ts` のロジック変更
  - 現状（旧仕様）: Owner 退会時、admin の有無で分岐（admin あり → 組織維持、admin なし → `organizations.deleted_at` セット）
  - 新仕様（C 案）: **Admin の有無に関わらず、Owner 退会時は以下を連動実行**
    1. 所属メンバー（Admin / Staff 全員）の `user_id` を `organization_members` から抽出
    2. 抽出した `user_id` に対して `UPDATE users SET deleted_at = NOW() WHERE id IN (...)` でログイン不可化
    3. `DELETE FROM organization_members WHERE organization_id = ?`（所属メンバー全員の物理削除。Owner 自身も含む）
    4. `UPDATE organizations SET deleted_at = NOW() WHERE id = ?`（組織ソフトデリート）
    5. `client_profiles` / `scout_templates` は削除しない（履歴として保持）
  - これらを admin client で順次実行（トランザクション保証のため RPC 化を推奨するが、Owner 退会の race condition リスクは低いので Server Action 内で順次実行でも可）
  - 退会理由・改善事項等の既存入力処理はそのまま維持
  - _Requirements: 5.1_ / 関連: profile/requirements.md REQ-PF-006

- [ ] 13.4.2 `withdrawal/page.tsx` に警告ダイアログ追加
  - 対象条件: ログイン中ユーザーが `role = 'client'` かつ `org_role = 'owner'` かつ `subscriptions.plan_type IN ('corporate', 'corporate_premium')` の場合のみ
  - 「退会する」ボタン押下時の確認ダイアログに、profile/requirements.md REQ-PF-006 で定義された警告文言を表示
  - ダイアログ内に「プランを解約する（CLI-026 へ）」リンクと「退会する」ボタンを並べる（プラン解約のほうを優先させる視線誘導）
  - 文言のプレースホルダ `{display_name}` には `client_profiles.display_name` を差し込む
  - 非法人プランの Owner や一般ユーザーでは警告ダイアログは出さない（既存のシンプルな確認ダイアログのまま）
  - _Requirements: 5.1_

- [ ] 13.4.3 Vitest / E2E テスト（C 案対応の網羅的検証）
  - **Vitest 統合テスト** (`src/__tests__/profile/withdrawal-actions.test.ts`):
    - 正常系: 法人プラン Owner 退会時、所属 Admin / Staff の `users.deleted_at` と `organization_members` 物理削除と `organizations.deleted_at` が連動実行されることを順にアサート
    - 権限テスト: Admin / Staff が `withdrawAction` を呼んでも退会処理がブロックされること（`org_role != 'owner'` の拒否）
    - 分岐テスト: Owner 非法人プラン（個人発注者・小規模）の退会 → 組織削除処理が走らない（個人プランは組織なし）
    - エッジケース: `client_profiles` / `scout_templates` が削除されず保持されることを確認
  - **Playwright E2E** (`tests/e2e/organization-withdrawal.spec.ts` 新設):
    - **シナリオ A（C 案の警告ダイアログ）**:
      1. 法人プラン Owner でログイン → COM-006 を開く
      2. 「退会する」ボタン押下 → 警告ダイアログ表示
      3. 警告文言に「会社アカウント『{display_name}』は削除され…」「管理者・担当者のアカウントもまとめて利用停止」「プランを解約」が含まれる
      4. 「プランを解約する」リンク → CLI-026 に遷移することを確認
    - **シナリオ B（実際の退会実行と連動処理）**:
      1. 法人プラン Owner でログイン → COM-006 退会実行
      2. 退会後、別ブラウザで旧 Admin（`frozen-admin` 等の seed データ）にログイン試行 → Middleware でブロック（`users.deleted_at IS NOT NULL` のため認証拒否）
      3. 同様に Staff ログイン試行 → ブロック
    - **シナリオ C（退会後の受注者側表示）**:
      1. `withdrawn-owner@test.local`（seed の Task 7.3 で用意）の過去スレッドに、受注者アカウントでアクセス
      2. 発注者名が「退会済み組織」（`client_profiles.display_name`）として継続表示されることを確認（C 案仕様）
      3. 発注者一覧（CON-005）・マイリスト（CON-007）では `users.deleted_at IS NOT NULL` の発注者が非表示になることを確認
    - **シナリオ D（個人発注者の通常退会）**:
      1. 個人発注者（`individual-client@test.local`）でログイン → COM-006 退会
      2. 警告ダイアログが**表示されない**ことを確認（法人プラン Owner 以外では組織連動がないため）
      3. 通常フローで退会完了
    - **シナリオ E（Admin / Staff の退会不可）**:
      1. Admin または Staff でログイン → マイページから退会リンクをクリック
      2. 「退会できません。管理責任者に依頼してください」のエラー表示（既存の `org_role != 'owner'` ガード）
  - _Requirements: 5.2_

---

## Task 13.45: billing Webhook ハンドラの J1 仕様対応（2026-04-19 C/J1 採用に伴う既存実装リファクタ）

- [ ] 13.45 既存 billing Webhook ハンドラ（`src/lib/billing/webhook/handle-subscription-lifecycle.ts` + 対応 RPC）を J1 仕様に合わせて修正する

- [ ] 13.45.1 `handle_subscription_lifecycle_deleted` RPC の対象ロール拡張
  - 現状: 法人プラン完全解約時、`organization_members WHERE org_role = 'staff'` のみ `is_active=false` に設定
  - 新仕様: `org_role IN ('admin', 'staff')` に拡張（Admin も Owner の契約に連動するため対象）
  - `supabase/migrations/` に新 migration を追加（既存 `20260411100100_billing_rpc_functions.sql` の `handle_subscription_lifecycle_deleted` を `CREATE OR REPLACE` で置換）
  - _Requirements: 6.3（billing 連携）_

- [ ] 13.45.2 `reactivateCorporateStaff()` 関数（past_due → active 復帰用）の対象ロール拡張
  - 現状: `org_role = 'staff'` のみ `is_active=true` に復帰
  - 新仕様: `org_role IN ('admin', 'staff')` に拡張
  - 関数名も `reactivateCorporateMembers()` にリネーム推奨（意味を正確に反映）
  - _Requirements: 6.3_

- [ ] 13.45.3 `customer.subscription.created` Webhook ハンドラの新設
  - 現状: このイベントは未処理（impl-memo.md の記述と実装コードを確認）
  - 新仕様: `handleSubscriptionLifecycle` に `customer.subscription.created` 分岐を追加
    - `stripe_subscription_id` で subscriptions を検索し、未登録なら INSERT（`checkout.session.completed` のバックアップ）
    - 法人プラン（corporate / corporate_premium）で既存 `organizations` レコードが見つかる場合、`reactivateCorporateMembers()` を呼び出して Admin / Staff の `is_active=true` に復帰
    - これにより「法人プラン完全解約 → Admin/Staff 冷凍保存 → 再アップグレード → 冷凍解除」のライフサイクルが成立
  - _Requirements: 6.3_ / organization/requirements.md REQ-ORG-006-B J1 と整合

- [ ] 13.45.4 Vitest 統合テスト + E2E テストの追加 / 更新
  - **Vitest 統合テスト** (`src/__tests__/billing/webhook/handle-subscription-lifecycle.test.ts` に追加):
    - `customer.subscription.deleted` の法人プランケースで **Admin も Staff も両方** `is_active=false` にされることのアサート
    - `customer.subscription.created` の法人プラン（既存組織あり）ケースで **Admin も Staff も両方** `is_active=true` 復帰されることのアサート
    - `invoice.payment_succeeded` で past_due 復帰時も Admin / Staff 両方復帰されることのアサート
    - **Webhook 冪等性テスト**:
      - `customer.subscription.deleted` が 2 回連続で到達したとき、`stripe_webhook_events` の冪等性ガードで 2 回目がスキップされ、is_active の UPDATE が 1 回だけ実行されることをモック検証
      - `customer.subscription.created` も同様の冪等性を確認
    - **C 案 race condition テスト**:
      - Owner が退会済み（`users.deleted_at IS NOT NULL`）の状態で `customer.subscription.deleted` Webhook が到達した場合、`users.role` の再降格や `is_active` 再設定がスキップされることをアサート（design.md の Key Decisions 準拠）
      - `organizations.deleted_at` が既にセット済みの組織に Webhook が到達しても冪等に動作（二重 UPDATE しても問題なし）
  - **Playwright E2E** (`tests/e2e/billing-reactivation.spec.ts` 新設、J1 シナリオ網羅):
    - **シナリオ A（解約 → 冷凍保存）**:
      1. 法人プラン Owner でログイン → CLI-026 から解約実行
      2. 別ブラウザで同組織の Admin / Staff がログイン試行 → Middleware でブロック（`is_active=false`）
      3. 旧 Admin / Staff の `users.deleted_at` は NULL のまま（退会ではない）を確認
    - **シナリオ B（再課金 → 全員復活）**:
      1. seed の `corp-cancelled@test.local`（Task 7.2 で用意）でログイン
      2. CLI-026 から法人プランに再課金
      3. Webhook `customer.subscription.created` 到達 → 配下の Admin / Staff の `is_active=true` に復帰
      4. 別ブラウザで旧 Admin / Staff がログイン成功
      5. 既存の scout_templates 一覧が CLI-016 で引き続き見えること
      6. `client_profiles.display_name='解約済み建設'` が CLI-021 で prefill されていること（再入力不要）
    - **シナリオ C（past_due → active 復帰）**:
      1. past_due 状態の法人プラン Owner（`pastdue@test.local` 等）でログイン
      2. 支払い方法を更新 → Webhook `invoice.payment_succeeded` 到達
      3. 配下の Admin / Staff の `is_active=true` 復帰を確認
  - _Requirements: 5.2_

---

## Task 13.5: /profile/edit に法人プラン Owner 向け注意書きを追加（R1 対応）

- [ ] 13.5 法人プラン Owner が `/profile/edit` を開いたとき、画面上部に契約者引き継ぎに関する注意バナーを表示する
  - **背景**: requirements.md L708 の要件（法人プラン Owner にだけ Pattern 2「別人へのアカウント移譲」を運営経由に誘導する案内）。**編集機能自体は一切制限しない**（同一人物の改姓・メール変更などは通常通り保存可）
  - **実装パターン**: 既存 `src/app/(authenticated)/profile/edit/page.tsx` は Client Component（`"use client"`）のため、Server Component ラッパーを新設してプラン判定を行う:
    1. 既存 `page.tsx` の中身を `ProfileEditForm.tsx`（Client Component）にリネーム/分離
    2. 新しい `page.tsx`（Server Component）で `auth.uid()` から以下を SELECT:
       - `subscriptions.plan_type IN ('corporate', 'corporate_premium')`
       - `organization_members.org_role = 'owner'`
    3. 両方が真の場合のみ `<OwnerTransferNoticeBanner />` を form の上に描画し、その下に `<ProfileEditForm />` を配置
    4. それ以外（個人発注者プラン・小規模・無料受注者・staff・admin）はバナー非表示で `<ProfileEditForm />` のみ
  - **文言**（requirements.md L708 そのまま）:
    > 「氏名・メールアドレスの変更は同一人物の情報更新のみです。契約者（管理責任者）を別の方に引き継ぐ場合は、お問い合わせからご依頼ください」
  - **UI**: shadcn/ui の `Alert`（または既存のバナーコンポーネント）で画面上部に配置。COM-008（お問い合わせ）への遷移リンクをバナー内に含める
  - **インポート影響**: `ProfileEditForm` への分離により、テストファイル（`src/__tests__/profile/...` 等が存在する場合）の import パスを更新する必要があるか実装時に確認
  - **Playwright E2E テスト**:
    - 法人プラン Owner で `/profile/edit` を開いたときバナーが見える
    - 法人プラン Admin / Staff（`/profile/edit` への到達は Task 13 でブロックされる前提）でないことを確認するため、Middleware リダイレクトと併せて検証
    - 個人発注者プラン client では同画面でバナーが見えない
    - バナー表示有無に関わらず、Owner が氏名 / メール更新を保存できる（Pattern 1 の正常動作確認）
  - _Requirements: 6.4（画面外運用 / Owner の交代）_

---

## Task 14: Error Handling / Monitoring の実装

- [ ] 14. audit_logs イベントと孤児 auth.users 検出フローを実装する

- [ ] 14.1 audit_logs エントリの追加と Server Action 内 INSERT
  - `member_created` / `member_deleted` / `email_changed_by_admin` / `member_create_failed_cleanup_pending` / `member_create_failed_cleanup_failed` / `orphan_cleaned_up` の各イベント
  - Server Action の catch ブロック（RPC の外）で INSERT することで、RPC ロールバック時にも失敗記録が残るようにする
  - イベント付随データ（`user_id`, `organization_id`, `error_message`, etc.）を `details` jsonb に格納
  - _Requirements: 3.4, 5.1_

- [ ] 14.2 孤児 auth.users 検出と運営通知
  - `member_create_failed_cleanup_failed` イベント INSERT 時、Resend で運営宛（`OPS_NOTIFICATION_EMAIL` 環境変数）に即時通知メール送信
  - 件名「【要対応】担当者作成のクリーンアップ失敗」、本文に該当 user_id / email / organization_id / エラーメッセージを記載
  - 通知送信失敗時は audit_logs に追加記録のみ（本体処理をブロックしない）
  - `.env.local.example` に `OPS_NOTIFICATION_EMAIL` を追記
  - 定期検出クエリ（週次実行想定）を `docs/operations/orphan-auth-users-check.sql` 等に保存 — `SELECT au.id, au.email, au.created_at FROM auth.users au LEFT JOIN public.users pu ON pu.id = au.id WHERE pu.id IS NULL AND au.created_at < now() - interval '1 hour'`
  - **孤児検出後の巻き取り手順**（運用マニュアルとして `docs/operations/orphan-auth-users-playbook.md` に明記。本 spec のスコープは手順ファイルの作成まで、運用担当者向けの平文ドキュメント）:
    1. **調査**: 該当 `auth.users.id` について、`audit_logs` で `member_create_failed_cleanup_failed` の `details` を確認し、失敗の根本原因を特定（STAFF_LIMIT_EXCEEDED / PROXY_ACCOUNT_ALREADY_EXISTS / 通信エラー等）
    2. **機能面のリスク評価**: 孤児は `public.users` に行が無いため Middleware でログイン不可（`role` が引けず認証コンテキストが成立しない）→ 本人が使うことはできない状態。すぐの削除は必須ではない
    3. **削除判断**:
       - 再招待が予定されている（運営 or 組織 Admin がリトライする）→ 削除して `auth.users.email` を解放。次回招待で正常フローに乗せる
       - 再招待予定なし（招待ミス、組織解約等）→ 削除（`auth.admin.deleteUser()` を運営コンソール経由で実行）
    4. **削除実行**: Supabase Dashboard の Auth 管理画面 または service_role キーで `DELETE FROM auth.users WHERE id = '{orphan_id}'` を実行（`ON DELETE CASCADE` により auth.identities / auth.sessions も連動削除される）
    5. **監査記録**: 削除実行後、`audit_logs` に `action = 'orphan_auth_user_cleaned_up'` + `details = { auth_user_id, email, reason, operator_id }` を手動 INSERT して追跡可能にする
    6. **原則「再招待 or 削除」の 2 択**: 孤児を `public.users` に手動 INSERT して蘇生させるのは**禁止**（メタデータ・`handle_new_user` トリガーを経由しない直接 INSERT は、organization_members 側の整合性やメール通知の発火順序が崩れる）
  - _Requirements: 3.4, 5.1_

- [ ] 14.3 (P) 管理者強制メール変更の通知メールテンプレ
  - `src/lib/email/templates/email-changed-by-admin.tsx` を React Email で作成
  - 件名「メールアドレスが変更されました」、本文「組織の管理者によりメールアドレスが変更されました。身に覚えがない場合は運営までご連絡ください」+ COM-008 リンク
  - 旧メール・新メール両方に送信、送信失敗時は `audit_logs` 記録のみで本体処理はロールバックしない
  - `updateMemberAction` の admin メール変更分岐から呼び出す
  - _Requirements: 3.3_

---

## Task 15: pgTAP RLS テストの追加

- [ ] 15. 新規 RLS と新規 RPC のテストを pgTAP で追加する

- [ ] 15.1 (P) scout_templates RLS テスト
  - `supabase/tests/scout_templates_rls.test.sql` に requirements.md の 10 シナリオを追加
  - 本人作成 / 組織メンバーによる CRUD / 他組織からの拒否 / Staff が Owner 作成を編集できる / 削除後 is_same_org で見えなくなる などをカバー
  - _Requirements: 5.2_

- [ ] 15.2 (P) organizations RLS テスト（刷新）
  - `supabase/tests/organizations_rls.test.sql` を新規作成または既存刷新
  - (1) `organizations_select_public` で認証済みが生存組織を SELECT 可 (2) 同ポリシーでソフト削除済み組織は非表示 (3) admin がソフト削除済みを含む全組織を SELECT 可 (4) 旧ポリシー `organizations_select` / `organizations_select_thread_participant` が DROP 済み（`pg_policies` 確認） (5) `is_same_org()` 関数が他テーブル RLS から継続利用可能 の 5 シナリオ
  - _Requirements: 5.2_

- [ ] 15.3 (P) insert_staff_member_with_limit RPC テスト
  - `supabase/tests/insert_staff_member_with_limit.test.sql` を新規作成
  - (1) 上限内 INSERT 成功 (2) 上限到達で `STAFF_LIMIT_EXCEEDED` 例外 (3) 並行呼び出しで `FOR UPDATE` が直列化し count がずれない (4) `INVALID_ORG_ROLE` / `USER_NOT_FOUND` 例外 (5) `authenticated` ロールからの EXECUTE 拒否 (6) **既存ユーザーのロール・氏名を変更しないこと**（D 採用: RPC は organization_members INSERT のみ実行。auth.users 経由でメタデータから初期化された `role`/`last_name`/`first_name` は変えない） (7) **R4 対応: 既存代理がある組織で `p_is_proxy_account = true` を渡すと `PROXY_ACCOUNT_ALREADY_EXISTS` 例外** (8) `p_is_proxy_account = false` なら既存代理の有無に関わらず INSERT 成功（代理チェックは `false` 時にスキップされる）
  - **追加 pgTAP テスト** `supabase/tests/handle_new_user_invite_metadata.test.sql`（D 対応の新規テスト、4 シナリオ）:
    - (1) `raw_user_meta_data->>'invited_role' = 'staff'` で `auth.users` INSERT すると `public.users.role = 'staff'` で作成される
    - (2) `invited_last_name` / `invited_first_name` メタデータが `public.users.last_name` / `first_name` 列に保存される
    - (3) メタデータ無し（AUTH-001 経路）では `role = 'contractor'`、姓名 NULL で作成される（既存挙動の互換性確認）
    - (4) `invited_role` に `'admin'` や `'client'` 等の不正値が入っていても `'contractor'` フォールバックで作成される（メタデータ汚染防止）
  - _Requirements: 5.2_

- [ ] 15.4 (P) delete_staff_member RPC テスト
  - `supabase/tests/delete_staff_member.test.sql` を新規作成
  - (1) テンプレ移譲 + 所属削除 + ソフト削除が atomic に実行される
  - (2) 存在しない user_id でも例外を返さず冪等
  - (3) `authenticated` ロールからの EXECUTE 拒否
  - (4) **部分失敗ロールバック検証**: 意図的に scout_templates UPDATE を失敗させて（例: 存在しない owner_id 指定）、`organization_members` DELETE と `users.deleted_at` セットも巻き戻される（トランザクション全体のロールバック）
  - _Requirements: 5.2_

- [ ] 15.5 (P) avatars Storage RLS テスト
  - `supabase/tests/avatars_storage_rls.test.sql` を新規作成
  - (1) 自分のフォルダへの INSERT/UPDATE/DELETE が既存ポリシー（`(storage.foldername(name))[1] = auth.uid()::text`）で通る
  - (2) 組織 Owner のフォルダへ Admin が INSERT/UPDATE/DELETE できる（`avatars_client_profile_write` ポリシー経由）
  - (3) 同じく Owner のフォルダへ Staff（`org_role='staff'`）が書き込もうとすると拒否される（`org_role IN ('owner','admin')` の制約）
  - (4) 他組織 Owner のフォルダへは Admin でも書き込み拒否
  - (5) SELECT（画像閲覧）は既存の public SELECT ポリシーで全認証済みユーザーが可能
  - _Requirements: 5.2_

- [ ] 15.6 (P) is_org_admin_or_owner_of 関数の直接テスト（RLS 再帰回避の動作検証）
  - `supabase/tests/is_org_admin_or_owner_of.test.sql` を新規作成
  - (1) 関数単体呼び出し: Owner の user_id を渡すと true、Admin の user_id を渡すと true、Staff の user_id を渡すと false
  - (2) 他組織 Owner の target_owner_user_id を渡すと false
  - (3) 存在しない user_id / target_owner_user_id で false
  - (4) **再帰回避の動作確認**: RLS policy 内から本関数を呼び出しても、内部の `organization_members` SELECT が SECURITY DEFINER で RLS をバイパスするため無限再帰にならない（既存の `is_same_org()` と同じパターン）
  - (5) `authenticated` ロールが EXECUTE 可能（RLS policy 評価コンテキストで呼べる）
  - _Requirements: 5.2_

- [ ] 15.7 (P) C 案シナリオの RLS 挙動テスト
  - `supabase/tests/organization_soft_delete_rls.test.sql` を新規作成
  - Owner 退会相当の状態（`organizations.deleted_at IS NOT NULL` + `organization_members` 全削除済み + Admin/Staff の `users.deleted_at` セット）を準備し、以下を検証:
    - (1) `organizations_select_public` で該当組織が SELECT 結果から除外される
    - (2) 受注者（退会の影響を受けない別ユーザー）が過去スレッドの `messages` を引き続き SELECT できる
    - (3) 受注者が `client_profiles` を SELECT して display_name を取得できる（client_profiles は削除せず保持のため）
    - (4) 退会組織の scout_templates は RLS でアクセス不能（`organization_members` 全削除 + Owner `users.deleted_at` で SELECT 条件を満たす人が誰もいない）
    - (5) 退会済み Admin の `users` row は `.is('deleted_at', null)` フィルタで除外される
  - _Requirements: 5.2_

---

## Task 16: リファクタ由来の既存テスト修正（付録 A Step 5）

- [ ] 16. 発注者表示名一本化に伴い、既存のユニット・統合・E2E テストを新仕様に合わせる
  - Vitest: `src/__tests__/utils/resolve-org-names.test.ts` を全削除（約 155 行、`getActiveCorporateOrgNames` 廃止に伴う）
  - Vitest: `src/__tests__/billing/save-org-name-action.test.ts` を全削除（organization-setup 暫定画面廃止に伴う）
  - Vitest: `src/__tests__/billing/start-checkout-action.test.ts` を書き換え、全プランで success_url が `CLI-021?setup=true` になることをアサート
  - Vitest: `src/__tests__/billing/plan-actions.test.ts` L228 付近のコメントを CLI-021 基準に更新（ロジックは影響なし）
  - Vitest: `src/__tests__/job-search/display-name.test.ts` のアサーションを姓名スペース無し（`${last}${first}`）に揃える（display-name.ts L24 のスペース修正に伴う期待値更新。追加発見）
  - Vitest: `src/__tests__/billing/webhook/handle-subscription-lifecycle.test.ts` の Supabase クライアントモックの `.select` 文字列と期待値を更新（Task 4.5 で `company_name` → `client_profiles(display_name)` に変更したため。サブスク通知 3 種すべての宛先名アサーションを `client_profiles.display_name` 基準に置換）
  - Playwright: `e2e/billing.spec.ts` の organization-setup 関連シナリオを CLI-021?setup=true に書き換え + 個人/小規模プランの「スキップ」シナリオ追加
  - Playwright: `e2e/display-name.spec.ts` のコメント・アサーションを `client_profiles.display_name` 基準に置換
  - **pgTAP: `supabase/tests/messaging_rls.test.sql` L41 の `INSERT INTO organizations (id, name, owner_id)` から `name` 列を削除し、対応する `client_profiles (user_id, display_name)` INSERT を追加する（付録 A Step 5 pgTAP サブセクション）。Group 3 の `organizations.name` DROP migration（Task 19）より**前に**完了させないと `supabase test db` が落ちる**
  - _Requirements: 5.2, 6.2, 6.4_

---

## Task 16.1: 周辺スクリプトの処理（付録 A Step 5.5）

- [ ] 16.1. organization-setup 廃止で動作不能になる検証スクリプトを削除または更新する
  - `scripts/task16-integration.mjs`（**billing spec の旧 Task 16 として作成された** Stripe CLI 自動化テストスクリプト。本 organization spec の Task 16 とは別物、命名の偶然による混同に注意）は L11 コメント・L128 / L129 / L138 / L139 で `organizations.name` の INSERT / SELECT に依存している
  - 以下のいずれかを選択:
    - **(a) 削除（推奨）**: billing spec の旧 Task 16 は完了済みで、本検証スクリプトは一回限りの用途だったため削除する
    - **(b) 更新**: `organizations.name` 参照を `client_profiles.display_name` に書き換え、遷移先を `/mypage/organization-setup` から `/mypage/client-profile/edit?setup=true` に変更して保守する
  - いずれを選択したか決定した上で commit メッセージに明記する
  - _Requirements: 6.4_

---

## Task 16.2: billing spec ドキュメントの記述更新（付録 A Step 5.6）

- [ ] 16.2. organization 実装で `organizations.name` カラムが廃止されるため、billing spec 配下の記述を過去形に更新する
  - `.kiro/specs/billing/tasks.md`: 同ファイル L423-L433 の自己メモに従い、L436 / L519 / L520 / L657-L661 / L673 / L744 / L745 の `organizations.name` 参照行を `client_profiles.display_name` 基準に書き換え。Task 8.7（暫定画面）の記述は「organization spec で CLI-021 に統合済み」の注記付き完了扱いに変更
  - `.kiro/specs/billing/requirements.md`: L491 / L521 の「`organizations.name` カラムは organization spec で廃止される」を過去形（「廃止された」「削除済み」）に書き換え、発注者表示名一本化の旨を明示
  - `.kiro/specs/billing/design.md`: L248 / L556 / L571 / L590 / L597 / L1419 の `organizations.name` 参照を確認。Phase 1 暫定画面の記述は「organization spec で置き換え済み」の注記に変更
  - `.kiro/specs/billing/research.md`: L12 の「organization spec で廃止予定」を「廃止済み」に更新
  - `.kiro/specs/billing/impl-memo.md`: **更新しない**（billing/tasks.md L433 の指示通り、L254 / L294 の `organizations.name` 参照は歴史的記録として保持。過去の仕様変遷が追えなくなるため削除禁止）
  - 基本方針: 「organizations.name は廃止済み、発注者表示名は `client_profiles.display_name` に一本化済み」を繰り返し書かず、過去形で簡潔に示す。詳細は steering / organization spec 側を参照する形で DRY に保つ
  - _Requirements: 6.4_

---

## Task 17: 新規画面の Playwright E2E テスト追加

- [ ] 17. CLI-016〜025 + AUTH-008 のユーザーストーリーを Playwright で網羅する

- [ ] 17.1 (P) スカウトテンプレート CRUD の通しフロー
  - 個人プラン発注者によるテンプレ CRUD（作成 → 一覧 → 詳細 → 編集 → 削除）
  - 法人プランの組織メンバー共有シナリオ（Owner 作成 → Admin 編集 → Staff 削除）
  - 上限・空白・改行の入力バリデーション
  - スカウト送信画面（CLI-014/015）でテンプレート選択 → タイトル・本文に入力がある場合の confirm ダイアログ挙動
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 17.2 (P) 発注者プロフィール編集と setup モード
  - 個人プラン購入 → 自動的に CLI-021?setup=true へ遷移 → 「スキップ」ボタンで CON-001 到達、表示名フォールバック（姓名）動作確認
  - 法人プラン購入 → CLI-021?setup=true へ遷移 → 社名必須バリデーション → 保存成功で CON-001 到達
  - 受注者から発注者詳細（CLI-020 経由）で会社情報が表示されるシナリオ
  - 画像アップロード（MIME / サイズ違反 + 正常系）
  - _Requirements: 2.1, 2.2, 2.3, 6.4_

- [ ] 17.3 担当者招待から利用開始までの通しフロー
  - Owner が CLI-025 で Staff 招待 → Inbucket で招待メール取得 → リンククリック → AUTH-008 でパスワード設定 → CON-001 到達
  - **D 対応の検証**: AUTH-008 通過後の招待者が `users.role = 'staff'` で作成されていること（contractor を経由しない）。受注者アクション（CON-004 応募ボタン等）が staff ブロックで非表示/非活性になることを確認
  - **B1 対応の検証**: 招待者の `users.last_name` / `first_name` が CLI-025 入力フォームの値で保存され、CLI-022 担当者一覧で正しく表示される
  - 担当者上限到達時のエラー表示（`STAFF_LIMIT_EXCEEDED`）
  - **R4 対応の検証**: 代理アカウント既存組織で 2 つ目の代理を作ろうとすると「代理アカウントは既に登録されています。既存の代理アカウントを解除してから再度お試しください」のトースト表示（CLI-025 経由 RPC 例外、CLI-024 編集経由 事前 SELECT の両方）
  - 管理者による強制メール変更 → 旧新両方に通知メールが送られることを Inbucket で確認
  - 担当者削除後、該当ユーザーの scout_templates の owner_id が Owner に移譲されていることを確認
  - Owner が `CLI-024?id=自分` にアクセスして `/profile/edit` にリダイレクトされる
  - **R1 関連検証**: 法人プラン Owner が `/profile/edit` を開くと注意バナーが表示される / 同画面で氏名・メール変更が問題なく保存できる（Pattern 1 正常動作）
  - **R2 対応の検証**: 既存メールアドレスで CLI-025 を送信すると「このメールアドレスは既に登録されています」トーストが即時表示される（事前 SELECT で早期拒否）
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 5.1, 6.4_

- [ ] 17.3.5 招待フローのエッジケース / 権限外アクセス検証（17.3 の下位タスク）
  - **招待中バッジ表示**: seed の `invited-admin@test.local`（`password_set_at IS NULL`）が CLI-022 一覧で「招待中」バッジ付きで表示される。`completed-admin@test.local`（`password_set_at` セット済み）はバッジ非表示
  - **招待再送ボタン**: CLI-023 で `password_set_at IS NULL` のメンバーに対してのみ「招待を再送」ボタンが有効化される
  - **AUTH-008 期限切れ**: 期限切れリンク（Supabase の 24h TTL 超過）を踏んだ場合、日本語エラー「リンクの有効期限が切れています。招待元に再送を依頼してください」が表示される
  - **AUTH-008 既設定済みユーザー**: `password_set_at IS NOT NULL` のユーザーが招待リンクを再踏破した場合、無言で `/mypage` にリダイレクト（エラー表示せず）
  - **権限外 CLI-024 アクセス（403）**:
    - Admin A が別の Admin B の `CLI-024?id=B` を開く → 403 相当の拒否画面
    - Staff A が別メンバー `CLI-024?id=他` を開く → 403 相当の拒否画面
  - **Staff の /profile/edit リダイレクト**: Staff が URL 直打ちで `/profile/edit` にアクセス → CLI-024 自己編集モード（`/mypage/members/{自分のID}/edit`）にリダイレクト
  - **代理アカウントの並行 race（負荷テスト相当、E2E では単純化）**:
    - 事前に同組織に代理アカウントが 1 人いる状態で、CLI-024 経由で別メンバーの代理フラグを ON に切り替え → 事前 SELECT で `PROXY_ACCOUNT_ALREADY_EXISTS` エラー相当のトースト表示
  - _Requirements: 3.2, 3.3, 3.4, 4.1, 5.1_

---

## Task 18: 最終統合検証と Phase 2 デプロイ

- [ ] 18. Task 2〜17 完了後の通しテストを実施し、Group 1+2 の本番デプロイを行う
  - `supabase db reset` で Group 1 の 9 migration + seed.sql 更新を反映
  - `npm run test` / `supabase test db` / `npm run test:e2e` の 3 コマンドすべて緑であることを確認
  - 手動動作確認: 課金 → CLI-021 setup → CON-001 の通しフロー、CLI-025 で招待 → 招待メール受領 → AUTH-008 → CON-001、組織メンバー全員で 1 テンプレを共有 CRUD
  - 単一 PR を作成し、以下すべてを含めてレビュー → 本番デプロイ:
    - **コード**: Task 3〜6, Task 9〜17, Task 13.4 / 13.45 / 13.5 のコード変更一式
    - **Migration**: Task 2 の migration 9 ファイル（Group 1）
    - **Seed**: Task 7 の seed.sql 更新
    - **Script**: Task 16.1 の `scripts/task16-integration.mjs` 削除または更新
    - **Spec ドキュメント**: Task 16.2 の billing spec 4 ドキュメント記述更新（tasks.md / requirements.md / design.md / research.md。impl-memo.md は歴史的記録として保持）
  - デプロイ後、本番ログを 24〜48 時間監視し、`organizations.name` 参照エラーがゼロであることを確認
  - _Requirements: 5.1, 5.2_

---

## Task 19: Phase 3 破壊的マイグレーション（別 PR、観察期間後）

- [ ] 19. 本番安定後に `organizations.name` 列を物理削除する（Group 3 の唯一のファイル、通算 file 10）
  - Task 18 の観察期間（24〜48 時間）を完了し、`organizations.name` 参照エラーがゼロであることを確認してから本タスクに着手
  - migration ファイル `{timestamp}_organizations_drop_name_column.sql`（Migration Strategy 表の通算 file 10）を作成: `ALTER TABLE organizations DROP COLUMN name;`
  - Task 2〜18 とは**別 PR** で投入（同一 PR にまとめてはならない）
  - デプロイ後、`SELECT column_name FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'name'` が 0 行であることを確認
  - 万一本番で参照エラーが再発した場合、`ALTER TABLE organizations ADD COLUMN name text` で緊急復旧 + 該当コードを hotfix
  - _Requirements: 6.2, 6.5_
