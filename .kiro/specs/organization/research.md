# Research & Design Decisions — organization

---
**Purpose**: Discovery notes, architectural trade-offs, and supporting investigations that inform `design.md`.
**Scope**: 組織管理機能（CLI-016〜025、AUTH-008）の技術設計に必要な前提情報を記録する。
---

## Summary
- **Feature**: `organization`
- **Discovery Scope**: Extension（既存 Next.js + Supabase アプリへの追加）+ 横断リファクタリング
- **Key Findings**:
  1. 本機能は新規 11 画面（CLI-016〜025 + AUTH-008）の追加だが、先行して「発注者表示名の `client_profiles.display_name` 一本化」「`organizations.name` カラム廃止」の**横断リファクタ**（約 25 ファイル）が必須。設計上はリファクタと新機能を**別フェーズ**として扱う。
  2. 担当者招待は **Supabase Auth 標準の `inviteUserByEmail`**（24 時間 TTL、`redirectTo` に既存 `/auth/callback?type=invite` を指定）で完結する。独自トークン管理は不要。
  3. 法人プランの人数制限は **DB の RPC トランザクション**（`create_staff_account(...)`）＋ **Server Action の事前/事後チェック二段構え** で担保する。auth.users の作成だけは RPC 外（Supabase Auth の admin API）なので、RPC 失敗時のクリーンアップは Server Action 側で `auth.admin.deleteUser()` を呼ぶ。**※ 2026-04-19 更新**: RPC 名は `insert_staff_member_with_limit` に変更、事前/事後チェック二段構えは「`FOR UPDATE` ロック + 事前 COUNT」の単段に統合（事後 COUNT 不要、TOCTOU 構造排除）。最新は Decisions Confirmed 1-C/D/G + design.md「担当者作成・削除は RPC に集約する」参照。
  4. `client_profiles` を CLI-021 で編集する際の Storage 書き込みは既存 `avatars` バケット（public）を流用し、パスは `{user_id}/client-profile.{ext}`（Owner の user_id）に固定する。新バケットは作らない。
  5. メール変更は Supabase の **Secure email change**（`double_confirm_changes=true`、`config.toml` 設定済み）を使う。本人→本人の変更はユーザーセッション経由、Owner/Admin → 他メンバーは admin API で即時強制変更（旧新両方へ通知メール送信）。
  6. `organization-setup` 暫定画面は CLI-021 の `?setup=true` モードに統合し、全プラン共通の初回セットアップ UX に揃える。Next.js App Router の Router Cache を避けるため、課金直後の遷移は **ハードナビゲーション**（`window.location.href`）で行う（`CLAUDE.md` の既知事項）。

## Research Log

### 1. 発注者表示名のデータソース
- **Context**: 既存コードは `organizations.name` → `users.company_name` → `last_name+first_name` の 3 段階で発注者名を解決しており、`getActiveCorporateOrgNames()` は admin client で RLS をバイパスしていた。仕様変更で `client_profiles.display_name` に一本化する方針（CLI-021 が唯一の編集画面）。
- **Sources Consulted**:
  - `src/lib/utils/display-name.ts:37-59`（現行 `resolveParticipantName`）
  - `src/lib/utils/resolve-org-names.ts:24-58`（admin client でのクロス組織取得）
  - `.kiro/steering/database-schema.md`「発注者表示名のルール」
  - `requirements.md` REQ-ORG-005 / REQ-ORG-006 / 付録 A Step 2-3
- **Findings**:
  - `client_profiles` の RLS SELECT は全員 true（公開プロフィール）のため、admin client なしで他ユーザーの `display_name` を取得できる。
  - Staff は `client_profiles` を持たない → 所属組織の Owner の `display_name` を辿る（`organization_members → organizations.owner_id → client_profiles WHERE user_id = owner_id`）。
  - 既存 `organizations` / `organization_members` の `is_same_org` RLS では他組織のレコードが取れない。`client_profiles` に切り替えることで admin client を排除できる。
- **Implications**:
  - `resolveParticipantName()` のシグネチャを `{ displayName, lastName, firstName, deletedAt }` に変更。`companyName` / `organizationName` 引数は廃止。
  - `getActiveCorporateOrgNames()` を完全に削除し、該当 14 ファイルを `client_profiles.display_name` を直接 SELECT するパターンへ移行。
  - `getUserDisplayName()` L24 の姓名結合がスペース入り（`${last} ${first}`）になっている不整合を、スペース無し（`${last}${first}`）に統一。

### 2. `organizations.name` カラムの段階的廃止
- **Context**: `organizations.name` は `NOT NULL`。既存コード・マイグレーション・seed が参照しており、一度の DROP ではデプロイ順序が崩れる。
- **Sources Consulted**:
  - 既存 migration `20260324160600_002_core_tables.sql`（NOT NULL + デフォルト無し）
  - `supabase/migrations/20260411100100_billing_rpc_functions.sql:37-50`（`ensure_organization_exists` が `INSERT ... VALUES (uid, '')`）
  - `supabase/seed.sql:453, 911, 974` の `INSERT INTO organizations (id, name, owner_id)`
  - requirements.md 付録 A Step 1-A
- **Findings**:
  - 4 段階マイグレーションが必要: ①NOT NULL 解除 → ②値移行（`organizations.name` → `client_profiles.display_name`） → ③コード書き換え → ④カラム DROP。
  - Webhook RPC `ensure_organization_exists(uid)` は現在 `name = ''` で INSERT しているので、カラム削除前に RPC 本体から `name` を除去する差分 migration を挟む（コード書き換えの一部）。
  - seed.sql の `organizations` INSERT は 3 箇所、既存組織名は対応する `client_profiles` レコードに表示名として移す。
- **Implications**:
  - 設計文書では migration を 4 つの `*.sql` に分ける。SQL ファイルは `tasks.md` に章立てで列挙し、1 ファイル 1 目的の原則を守る。
  - `organizations` はメンバーシップ・Owner 特定・Soft delete のみに役割を縮退する。

### 3. 招待メールと AUTH-008 のルーティング
- **Context**: 担当者（Admin/Staff）を CLI-025 から作成した後、招待メールでパスワードを設定してもらう必要がある。
- **Sources Consulted**:
  - `src/app/auth/callback/route.ts:60-66`（既存 recovery 分岐の隣に invite を追加）
  - `src/app/(auth)/reset-password/confirm/page.tsx`（AUTH-008 の UI テンプレート元）
  - `.kiro/steering/authentication.md` L118-157「担当者招待フロー」
  - requirements.md REQ-ORG-010 / 共通仕様「担当者招待メール」
  - Supabase Docs: `auth.admin.inviteUserByEmail(email, { redirectTo })` — magic-link ベースの招待 API、TTL は Supabase 全体設定（デフォルト 24h）を使用。
- **Findings**:
  - `inviteUserByEmail` は「auth.users 作成 + 招待メール送信」を 1 コールで行う。`redirectTo` に `/auth/callback?type=invite` を指定すれば既存コールバックに乗せられる。
  - 既存 `/auth/callback` は `type === 'recovery'` → `/reset-password/confirm`、それ以外 → `/register/profile` の 2 分岐。3 つ目の分岐を足して `type === 'invite'` → `/accept-invite/confirm` に振り分ける。
  - 「招待中」バッジと「パスワード設定済み」判定は `auth.users.raw_user_meta_data->>'password_set_at'` の有無で行う。`last_sign_in_at` は `/auth/callback` でのセッション確立で更新されうるため NG。**※ 2026-04-18 撤回**: `auth.users.raw_user_meta_data` は一覧 SELECT で N+1 になるため `public.users.password_set_at` 列に変更（下記「Decisions Confirmed」1-B 参照）。
  - 未認証でのアクセスを考慮して `/accept-invite/confirm` は `(auth)` route group に配置（`(authenticated)` ではない）。
- **Implications**:
  - `acceptInviteAction` は `supabase.auth.updateUser({ password, data: { password_set_at } })` の 1 コールで完結。期限切れエラー（有効期限超過のセッションで `updateUser` が失敗）は日本語メッセージに変換してクライアントへ返す。**※ 2026-04-18 撤回**: 保存先を `public.users.password_set_at` 列に変更したため、`updateUser({ password })` + `UPDATE public.users` の 2 段階実行に変更（下記「Decisions Confirmed」1-B 参照）。
  - 設計書上で AUTH-008 は AUTH-004 を流用するためコンポーネントブロックは「Summary-only」にとどめ、差分（タイトル・説明・遷移先）を表で示す。

### 4. 法人プラン人数制限の原子性
- **Context**: CLI-025 で担当者を作成する際、同時リクエストが走ると `PLAN_LIMITS.maxStaff` を超える可能性がある。
- **Sources Consulted**:
  - `src/lib/constants/plans.ts:16-52`（maxStaff: corporate=10, corporate_premium=30）
  - PostgreSQL `SECURITY DEFINER` 関数によるトランザクション境界のパターン（既存 `handle_checkout_completed_plan` が採用している）
  - requirements.md REQ-ORG-010「フロー 2b〜2e」および 2a-0 / 2e-1
  - Supabase Docs: `auth.admin.createUser` / `inviteUserByEmail` はトランザクションの外側にあるため、RPC 内で扱えない。
- **Findings**:
  - auth.users を含む完全原子性は実現不可。`create_staff_account(p_user_id, p_organization_id, p_org_role, p_is_proxy_account)` RPC で **public.users.role UPDATE + organization_members INSERT + 事後カウント** を BEGIN/COMMIT 境界内に閉じ込める。**※ 2026-04-19 撤回**: RPC 名は `insert_staff_member_with_limit` に変更（Decisions Confirmed 1-C/D/G 参照）。さらに D 採用後は「事前 `FOR UPDATE` ロック + COUNT」「`role` UPDATE 廃止（トリガー側で初期化）」「事後カウント不要（FOR UPDATE で直列化）」「引数 5 個（`p_max_staff` 追加）」「R4 対応の proxy 事前 EXISTS チェック追加」を実施。最新仕様は design.md「担当者作成・削除は RPC に集約する」セクション参照。
  - 事前チェック（2a-0）は Server Action 側で実施し race window を最小化。事後チェック（2e-1）は RPC 内で `EXCEPTION` を発生させて全巻き戻し。Server Action が例外を検知したら `auth.admin.deleteUser` で auth.users を削除する（幽霊アカウント防止）。
  - 代理アカウントの `UNIQUE (organization_id) WHERE is_proxy_account = true` 部分 UNIQUE は RPC 内 INSERT で `unique_violation` を捕捉してハンドル可能。**※ 2026-04-19 更新（R4 対応）**: 23505 の汎用捕捉だと `(organization_id, user_id)` UNIQUE 違反と区別できないため、RPC 内に事前 EXISTS チェックを追加し `PROXY_ACCOUNT_ALREADY_EXISTS` 専用例外を raise する方式に変更（DB の部分 UNIQUE 制約は最終ガードとして残す 2 段防御）。
- **Implications**:
  - RPC を新規 migration で追加する。戻り値は `jsonb` で `organization_member_id` を返却し、Server Action 側のログに使う。
  - 失敗時のクリーンアップ順序を設計書にシーケンス図で明示する。

### 5. CLI-024 のメール変更フロー
- **Context**: メール変更は Supabase の "Secure email change"（双方向確認）を使う。Owner/Admin が他者のメールを強制変更する場面（退職者対応）もある。
- **Sources Consulted**:
  - `supabase/config.toml [auth.email] double_confirm_changes = true` (設定済み)
  - `supabase/migrations/20260415100000_auth_email_sync_trigger.sql`（`handle_user_email_change` AFTER UPDATE トリガー、`auth.users.email` → `public.users.email` 同期）
  - requirements.md REQ-ORG-009「メール変更フロー」
  - Supabase Docs: `auth.updateUser({ email })` はダブルオプトイン、`auth.admin.updateUserById(id, { email, email_confirm: true })` は即時反映。
- **Findings**:
  - パターン A（本人）: クライアント/サーバーいずれも通常 Supabase クライアントで `updateUser({ email })`。旧新両方にマジックリンク。両方クリックで初めて実反映。
  - パターン B（管理者）: `admin.updateUserById(target, { email, email_confirm: true })`。即時反映。双方向確認がないため、旧新両方へ **独自通知メール**（Resend、React Email）を送る。
- **Implications**:
  - 設計書では「本人変更」と「管理者変更」の 2 つの Server Action パス（同一 Server Action 内で分岐）を明記。
  - 通知メールは新規テンプレート `email-changed-by-admin.tsx` を作成し、Resend で送る（既存の送信ヘルパー `src/lib/email/send-email.ts` を再利用）。

### 6. プロフィール画像アップロード先
- **Context**: CLI-021 の会社ロゴ/プロフィール画像アップロード先を決める。
- **Sources Consulted**:
  - `.kiro/steering/database-schema.md`「Storage バケット」セクション（既存 `avatars` は public）
  - requirements.md 共通仕様「プロフィール画像アップロード」
  - 既存 `avatars` の RLS ポリシー: `(storage.foldername(name))[1] = auth.uid()::text`
- **Findings**:
  - 新バケットを切らず、既存 `avatars` を流用してパスで区別する（`{user_id}/client-profile.{ext}`）。
  - Staff が CLI-021 の画像を更新することはない（編集権限なし）。Admin が Owner 代理で更新する場合、パスを **Owner の user_id で始める** 必要があり、RLS でのガードを追加する（「自分のフォルダ」または「同一組織の Owner のフォルダ」）。
- **Implications**:
  - Storage RLS に INSERT/UPDATE/DELETE 用のポリシーを 1 本追加する（SELECT は既存 public のまま）。migration は `avatars_client_profile_policy.sql` 等の別ファイルで追加。

### 7. `/mypage/organization-setup` 廃止と Router Cache 回避
- **Context**: 既存 `/mypage/organization-setup` は法人プラン専用の暫定組織名入力画面。本仕様で CLI-021 に統合し、個人・小規模プランも `?setup=true` で同じ UI を使う。
- **Sources Consulted**:
  - `src/app/(authenticated)/billing/actions.ts:95-113`（`buildSuccessUrl` の現行分岐）
  - `src/app/(authenticated)/mypage/organization-setup/`（削除対象 3 ファイル）
  - `.kiro/specs/billing/design.md`（buildSuccessUrl の既存仕様）
  - `CLAUDE.md`「Next.js Router Cache とリダイレクトキャッシュ」
- **Findings**:
  - `buildSuccessUrl` を全プラン `/mypage/client-profile/edit?setup=true` に統一。個人・小規模プランは「スキップして後で設定する」ボタンを表示、法人プランは必須保存。
  - 課金直後は Webhook が未着の可能性があるため `?setup=true` のアクセスガードを緩和（認証済みなら進める）。保存 Server Action 側は Webhook 完了を前提とし、未完了なら「数秒後にもう一度」エラー。
  - `router.push()` では Router Cache により旧 redirect 結果がキャッシュされるリスクがあるため、課金直後の遷移は `window.location.href` でハードナビゲーションする（`CLAUDE.md` の既存ルール）。
- **Implications**:
  - 旧 `/mypage/organization-setup` にアクセスされた場合は CLI-021 にリダイレクトする薄い page.tsx を残す（または完全削除）。設計書では「リダイレクトのみ残す」方針を採用し、他機能からのリンク切れリスクを減らす。

### 8. スカウトテンプレ共有編集
- **Context**: 法人プランでは組織メンバー全員が他メンバー作成のテンプレを編集・削除できる必要がある。
- **Sources Consulted**:
  - `supabase/migrations/20260415100100_scout_templates_org_shared_crud.sql`（UPDATE/DELETE ポリシー追加済み）
  - requirements.md REQ-ORG-001〜004 + 非機能要件「pgTAP テスト要件」
- **Findings**:
  - SELECT / INSERT 既存ポリシーは問題なし。UPDATE / DELETE は本 migration で組織メンバー全員に拡張済み。
  - `organization_members` の自己参照再帰バグ防止のため `is_same_org()` 経由に書き直したいところだが、既存 migration は直接サブクエリを使用している。RLS 再帰テスト（pgTAP シナリオ #10）でリグレッションを検出する。
- **Implications**:
  - pgTAP テストを新規追加。シナリオは requirements.md の表 10 パターンに準拠。
  - 担当者削除時の `owner_id` 移譲（→ Owner）は Server Action で UPDATE 一括実行。`organization_members` 物理削除 + `users.deleted_at` セット + `scout_templates.owner_id` 移譲を 1 RPC にまとめてもよいが、担当者削除は頻度低のためシンプルに Server Action 内で 3 step でも可。

### 9. メッセージ UI での発注者アバター
- **Context**: 現状受注者側スレッドで表示されるアバターは `users.avatar_url`（個人）。法人プランでは複数メンバーが同一スレッドに書き込むため、「送信者によって画像が切り替わる」挙動が UX 上不自然。
- **Sources Consulted**:
  - `src/app/(authenticated)/messages/[threadId]/page.tsx` L29-31 / L55-60
  - `src/app/(authenticated)/messages/page.tsx` の相手アバター取得
  - requirements.md 付録 A Step 3-B
- **Findings**:
  - 受注者 → 発注者方向のみ `client_profiles.image_url` に切り替える。逆方向（発注者 → 受注者）は従来通り `users.avatar_url`。
  - `image_url` が NULL ならデフォルトプレースホルダー（`/assets/icons/icon-avatar.png`）にフォールバック。
- **Implications**:
  - `messages/[threadId]/page.tsx` と `messages/page.tsx` の SELECT に `client_profiles(image_url)` embed を追加。`isContractorSide` 判定で切り替える。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 既存 Server Component + Server Action パターンの踏襲 | RSC でデータ取得、Server Action で書き込み、クライアントコンポーネントは最小化。既存 billing / messaging と同じ | 既存コードベース一貫性、学習コスト無し、SEO / 初回表示良好 | 画像アップロードや複雑な入力補助でクライアント化が必要な箇所は境界を明示する必要あり | 採用 |
| Route Handler + React Server Actions 混在 | 画像アップロード等を Route Handler で受け取り、Server Action で DB 更新 | ファイル処理が RSC から分離できる | 2 つの境界を維持する手間、リクエスト境界が増える | 不採用。既存 Server Action パターンで十分 |
| 組織管理専用 BFF レイヤー導入 | 組織周りの RPC を集約するバックエンド層 | データ整合性の集中管理、クロスドメインの再利用 | YAGNI、1 機能のためのレイヤー追加はオーバーエンジニアリング | 不採用 |

**選択**: 既存パターンの踏襲。トランザクションが必要な処理は **PostgreSQL の `SECURITY DEFINER` 関数** に閉じ込め、Server Action から RPC を 1 回呼ぶ形で原子性を担保する。

## Design Decisions

### Decision: 発注者表示名ロジックのシグネチャ変更
- **Context**: `resolveParticipantName()` は 3 段階（organizationName → companyName → 姓名）だったが、`client_profiles.display_name` 一本化方針で 2 段階に縮退する。
- **Alternatives Considered**:
  1. 既存の 3 引数を保持し、内部で `organizationName`/`companyName` を無視 — API 互換を残せるが、呼び出し側が「何が正か」を誤解する
  2. 引数を `{ displayName, lastName, firstName, deletedAt }` に変更し、呼び出し側 14 ファイルを更新 — 1 度の手間はあるが真実の源が 1 つに
- **Selected Approach**: 選択肢 2（破壊的変更 + 全呼び出し元更新）
- **Rationale**: 互換性維持のために旧引数を残すと、Staff の親組織 Owner 解決ロジック（新ロジックの特徴）と旧呼び出し側の期待が食い違う。今のうちに完全に切り替えるほうが事故が少ない。
- **Trade-offs**: リファクタ範囲が広く PR が大きくなるが、`tasks.md` で「付録 A フェーズ」として独立させることで事故を抑える。
- **Follow-up**: 全 14 ファイルのクエリが `client_profiles!inner` の `inner join` を正しく使っているか、および E2E `display-name.spec.ts` の期待値更新を task 化。**※ 2026-04-19 更新（B3 対応）**: `client_profiles!inner` 単純 embed は Staff 作成案件で NULL になるため不採用。代わりに design.md「ClientProfileResolutionForRow（B3 対応）」の standard query pattern + `resolveClientProfileForRow()` ヘルパーを使用。

### Decision: 担当者作成のトランザクション境界
- **Context**: REQ-ORG-010 のフローは (a) 事前人数チェック (b) auth.users 作成 (c) public.users.role UPDATE (d) organization_members INSERT (e) 事後人数チェック からなる。**※ 2026-04-19 更新**: D 採用後は (c) public.users.role UPDATE は廃止（migration file 9 のトリガーが INSERT 時にメタデータから設定）、(e) 事後人数チェックも廃止（FOR UPDATE で TOCTOU 構造排除）。最新フローは Decisions Confirmed 1-C/D/G 参照。
- **Alternatives Considered**:
  1. Server Action 内 try/catch で全手動ロールバック — auth.users の失敗クリーンアップは必要だが、DB 側の部分失敗が残る
  2. PostgreSQL `SECURITY DEFINER` RPC `create_staff_account(...)` に DB 操作を集約、auth 部分のみ Server Action — DB 操作の原子性は RPC が保証
- **Selected Approach**: 選択肢 2。RPC に `public.users.role` UPDATE と `organization_members` INSERT と事後カウントをまとめ、Server Action は auth.admin.createUser → RPC 呼び出し → 失敗時 auth.admin.deleteUser のみを担当。**※ 2026-04-19 更新**: RPC 集約方針は維持されたが、内容が変化。RPC は `organization_members` INSERT のみ（role UPDATE は migration file 9 のトリガーに移譲、事後カウントは事前 FOR UPDATE で代替）。Server Action は `auth.admin.createUser` ではなく `inviteUserByEmail` を使用（メタデータ経由でトリガーへロール伝達）。
- **Rationale**: auth.users は Supabase 側の管理下にあり RPC 内で扱えない。DB 操作だけでも原子性を保てれば「public.users と organization_members が片方だけ残る」事故を消せる。
- **Trade-offs**: RPC 追加で migration が 1 本増える。運用時の監査ログも RPC が INSERT する設計にする。
- **Follow-up**: 人数超過エラー時のメッセージ文言を RPC の `RAISE EXCEPTION` で返し、Server Action でパターンマッチして UI メッセージに変換する。

### Decision: CLI-021 の保存 Server Action と画像パスの整合
- **Context**: 既存 `avatars` バケットの Storage RLS はパスの先頭セグメントが `auth.uid()::text` と一致することを要求する。Admin が Owner 代理で CLI-021 を編集する場合、Owner の user_id をパスに使う必要がある。
- **Alternatives Considered**:
  1. パスを常に `auth.uid()` で始め、アップロード主体が誰でも OK にする — Staff が画像アップロードして Storage 上は Staff の user_id で保存される。表示時に「どのユーザー ID のファイル？」が分からなくなる
  2. Owner の user_id でパスを固定し、Storage RLS を「自分のフォルダ OR 同一組織の Owner/Admin の Owner フォルダ」に拡張 — RLS が複雑になるが、1 法人 1 画像で整合
- **Selected Approach**: 選択肢 2。`client_profiles.image_url` は「法人プランでは Owner 1 人分の会社ロゴ」「個人・小規模では本人の画像」の意味で統一。
- **Rationale**: `client_profiles` は `user_id` で Owner 1:1 に紐付くテーブルであり、1 ユーザー 1 画像でよい。Admin が更新時も論理的な所有者は Owner。
- **Trade-offs**: Storage RLS ポリシーが 1 本増える（`is_same_org_owner_path()` のようなヘルパー判定）。設計書で SQL 例を明示する。
- **Follow-up**: Admin が更新した場合でも Owner 退会時に `client_profiles` は保持するため画像は残る。Storage ファイルは Owner 退会時にどうするか → 仕様上も退会後に `client_profiles` を保持するので Storage も保持でよい（再加入時に再利用）。

### Decision: `?setup=true` モードのガード緩和
- **Context**: 課金直後は Stripe Webhook が未着で `users.role` / `subscriptions.plan_type` がまだ更新前の可能性がある。従来 Middleware が `/mypage/organization-setup` を認証済みに許可していた例外扱いと同じ緩和が必要。
- **Selected Approach**: Middleware は `/mypage/client-profile/edit?setup=true` を認証済みユーザーに許可。保存 Server Action は DB 状態を検証し、Webhook 未着ならエラー（日本語文言）を返す。
- **Rationale**: UX 上 Webhook 遅延で画面に到達できないのは致命的。ガードを Server Action 側に倒すことで race の発生を吸収できる。
- **Follow-up**: E2E で「checkout.session.completed → 即 CLI-021?setup=true → 一瞬後に保存成功」のシナリオを担保。

### Decision: Webhook 側の `client_profiles` 初期化
- **Context**: `handle_checkout_completed_plan` は既に `client_profiles` を `ON CONFLICT (user_id) DO NOTHING` で INSERT する（初回だけ display_name をセット、既存レコードは温存）。これが「再加入時に編集済み display_name が残る」要件に合致している。
- **Selected Approach**: 既存ロジックを維持。本 spec では RPC 内の `organizations` INSERT から `name` フィールドを外す migration のみを追加する。
- **Rationale**: 冪等性とデータ保持要件の両方を現行挙動が既に満たしている。
- **Follow-up**: RPC から `name` を外した後、`INSERT INTO organizations (owner_id) VALUES (uid)` となる。列順の違いで他箇所に副作用が無いかを migration テストで確認。

## Risks & Mitigations
- **リスク A: リファクタと新機能が混在して PR が巨大化** → `tasks.md` で付録 A リファクタを先行フェーズとして独立させ、全テスト通過後に新画面実装に進むゲートを設ける。
- **リスク B: `organizations.name` DROP 前にコード書き換えが未反映のまま本番に流れる** → migration を 4 本に分割し、Vercel のデプロイ単位と Supabase migration の実行順序を `tasks.md` に明記。`DROP COLUMN` は必ず最後の migration で、先行段階の PR には含めない。
- **リスク C: 担当者作成の race で上限超過** → RPC 内の事後 COUNT チェックで必ず超過を検出し `RAISE EXCEPTION` で全巻き戻し。人数超過のエラーメッセージは UI と RPC で同一文言を使う。
- **リスク D: Router Cache による意図しないリダイレクト** → 課金後の遷移は `window.location.href`（ハードナビゲーション）で実装。該当コード位置はコンポーネント設計に明記。
- **リスク E: 招待メール未着でスタッフがパスワード設定できない** → CLI-022/023 に「招待メールを再送する」ボタンを設置（表示条件: `password_set_at IS NULL`）。Server Action 側で `inviteUserByEmail` を再呼び出し。
- **リスク F: pgTAP テストの UUID 重複** → テスト用 UUID は seed.sql の使用値と被らせない（`CLAUDE.md`「pgTAP テストの UUID は seed.sql と重複させない」）。
- **リスク G: 代理アカウント UNIQUE 違反時の UX** → Server Action で `unique_violation` を捕捉し「代理アカウントは既に登録されています…」トーストを返す。フロント側で事前チェックせず DB 側ガードを正とする。**※ 2026-04-19 更新（R4 対応）**: `(organization_id, user_id)` UNIQUE と `(organization_id) WHERE is_proxy_account = true` UNIQUE が同じ 23505 を返す問題が判明したため、(a) `insert_staff_member_with_limit` RPC 内に proxy 事前 EXISTS チェック → `PROXY_ACCOUNT_ALREADY_EXISTS` 専用例外、(b) `updateMemberAction` 内に proxy 事前 SELECT チェック を追加。DB の部分 UNIQUE は race の最終ガードとして残す 2 段防御。

## Decisions Confirmed (2026-04-18 cross-check review)

requirements.md / design.md を突き合わせた実装前レビューで、設計穴・内部矛盾・不足情報を洗い出し、以下の方針を確定した。本 spec の後続タスク生成時にはこの確定内容を正とする。

### 1-A: 受注者が Staff 経由で作られた案件の発注者名を解決する経路
- **問題**: `jobs.owner_id = Staff の user_id` の場合、受注者は `organization_members` / `organizations` を読めず、Owner の `client_profiles.display_name` に到達できない。既存 `getActiveCorporateOrgNames()` は admin client でバイパスしていたが、本 spec で廃止予定。
- **採用**: `organizations` テーブルを認証済みユーザー全員が SELECT 可能にする（`deleted_at IS NULL` の行のみ。`organizations_select_admin` は全行アクセス用に残す）。既存の `organizations_select`（is_same_org ベース）と `organizations_select_thread_participant` は撤去し、単一の公開ポリシーに統合する。`organization_members` は引き続き非公開。
- **理由**: `jobs.owner_id` と `jobs.organization_id` が既に公開されているため、新たな情報漏洩は実質ゼロ。14 ファイルのリファクタが素直な JOIN で書ける。

### 1-B: 「招待中」バッジのデータ取得元
- **問題**: `auth.users.raw_user_meta_data` は一般ユーザーから直接 SELECT 不可。20 件ずつの一覧表示を admin API で回すと N+1 で非現実的。
- **採用**: `public.users` に `password_set_at timestamptz NULL` 列を追加する。招待作成時は NULL のまま、AUTH-008 の `acceptInviteAction` でパスワード保存と同時に `now()` を UPDATE する。CLI-022/023 の「招待中」バッジ・再送ボタン表示条件は `public.users.password_set_at IS NULL` で判定する。
- **副作用**: requirements.md の「`auth.users.raw_user_meta_data->>'password_set_at'`」記述を「`public.users.password_set_at`」へ書き換え。

### 1-C/D/G: 担当者追加・削除のトランザクション境界

> **⚠️ 2026-04-18 再決定**: 本節の「RPC を追加しない」結論は**覆された**。design.md レビューで「部分失敗による幽霊ユーザー」リスクが UX 上無視できず、CLAUDE.md の Stripe 二重課金防止ルール（DB レースを運用でごまかさない）との方針不整合が指摘されたため、2 つの `SECURITY DEFINER` 関数（`insert_staff_member_with_limit` / `delete_staff_member`）を導入する方針に変更。最新仕様は `design.md` の「担当者作成・削除は RPC に集約する」セクション参照。以下は初期調査時点の記録として残す。

- **問題**: Admin は `subscriptions` RLS（user_id = auth.uid()）で Owner のプランを読めない / 上限超過 race condition / 削除時 3 操作の原子性。
- **採用（※ 2026-04-18 に撤回）**: DB 関数（`create_staff_account` / `delete_staff_account` / `get_user_plan_type`）は追加しない。Server Action 内で admin client を使って順次処理する。
  - 追加: Server Action は事前チェックのみ（事後チェックなし）。同時クリック等による稀な上限超過は運用でカバー
  - 削除: `scout_templates.owner_id` 移譲 / `organization_members` 物理削除 / `users.deleted_at` セット を admin client で順次実行、try/catch でエラーハンドリング
- **理由（※ 再検討済み）**: Bijiyu の規模感（組織あたり 10〜30 人、担当者追加は月数回）で同時リクエストによる上限超過は極めて稀。admin client は billing/profile-withdrawal で既に使われている確立パターン。RPC 追加のコストがメリットを上回らない。

### 1-E/2-A: 招待メールの送信手段とテンプレート
- **問題**: requirements 内で `auth.admin.createUser()` と `auth.admin.inviteUserByEmail()` の 2 通りの記述が混在 / 標準テンプレに `{招待者氏名}` 等のカスタム変数が無い。
- **採用**: `auth.admin.inviteUserByEmail(email, { redirectTo, data: { inviter_name, organization_name } })` に統一する。`createUser` は使わない。テンプレは `supabase/config.toml` の `[auth.email.template.invite]` に設定し、`{{ .Data.inviter_name }}` / `{{ .Data.organization_name }}` / `{{ .ConfirmationURL }}` を参照する。本番は Supabase Dashboard にも同じ内容を設定する（ダブル作業）。
- **判定**: 認証系メール（招待含む）は Supabase 標準機能、通知系メールは Resend ── という steering `tech.md` L340-346 の既存方針に一致。

### 2-B: AUTH-008 で既設定ユーザーの扱い
- **問題**: 「エラー返却 + 成功時リダイレクト」の論理矛盾。
- **採用**: `public.users.password_set_at IS NOT NULL` の場合、AUTH-008 の page.tsx 冒頭で `/mypage` にリダイレクト（画面表示も赤いエラーも出さない）。Server Action 側でも同じ判定を入れ、万が一呼ばれた場合は `{ success: true }` を返してクライアント側で `/mypage` に遷移させる。

### 2-D/2-E/3-B: URL 体系と Middleware のガード分担
- **URL 体系**（Next.js 階層規約に従う）:

| 画面ID | 画面名 | URL |
|---|---|---|
| CLI-016 | スカウトテンプレ一覧 | `/messages/templates` |
| CLI-017 | テンプレ詳細 | `/messages/templates/[id]` |
| CLI-018 | テンプレ編集 | `/messages/templates/[id]/edit` |
| CLI-019 | テンプレ新規作成 | `/messages/templates/new` |
| CLI-020 | 発注者情報詳細 | `/mypage/client-profile` |
| CLI-021 | 発注者情報編集 | `/mypage/client-profile/edit` |
| CLI-021 (setup) | 初回セットアップ | `/mypage/client-profile/edit?setup=true` |
| CLI-022 | 担当者一覧 | `/mypage/members` |
| CLI-023 | 担当者詳細 | `/mypage/members/[id]` |
| CLI-024 | 担当者編集 | `/mypage/members/[id]/edit` |
| CLI-025 | 担当者新規作成 | `/mypage/members/new` |
| AUTH-008 | 招待承諾 | `/accept-invite/confirm` |

- **Middleware の役割**: ロール（`public.users.role`）による粗いブロックのみ。`role='staff'` は通過させ、`org_role` に基づく細かい判定は各 page.tsx の Server Component で実施。
- **`?setup=true` 例外**: `/mypage/client-profile/edit?setup=true` は認証済みユーザーなら通過させる（通常の `CLIENT_ONLY_PREFIXES` チェックより**前**に分岐を置く）。
- **相互リダイレクト**:
  - `/profile/edit` に `role='staff'` がアクセス → `/mypage/members/[自分ID]/edit` に redirect
  - `/mypage/members/[id]/edit` で `id === auth.uid() && org_role === 'owner'` → `/profile/edit` に redirect
- **CLI-021 編集権限（全プラン共通）**: 個人・小規模プランは本人（`role='client'`）、法人プランは Owner（`role='client'` + `org_role='owner'`）と Admin（`role='staff'` + `org_role='admin'`）。Staff（`role='staff'` + `org_role='staff'`）は閲覧のみ。

### 3-H: Owner 退会時の組織挙動（2026-04-19 C 案採用で再決定）
- **問題**: Owner が COM-006 で退会した場合の組織・Admin・Staff の扱い。旧案では「Admin あり → 運営が新 Owner 指名するまで組織維持」としていたが、Admin は正規の新規登録フロー（AUTH-001）・本人確認・独立した Stripe 契約を経ておらず、退会と同時に法人プラン契約も終了するため、継続運営は構造的に矛盾していた。
- **採用（C 案）**: Owner 退会時は Admin の有無に関わらず、**組織ごとソフトデリート**する。具体的には:
  - `organizations.deleted_at` をセット
  - 所属メンバー全員の `organization_members` を物理削除
  - Admin / Staff の `users.deleted_at` をセット（組織と連動してログイン不可化）
  - `client_profiles` は過去メッセージの表示整合性のため保持（新組織での利用はない）
  - `scout_templates` は履歴データとして保持（RLS でアクセス不能）
- **旧案での「空白期間」「`client_profiles.user_id` 移譲」は廃止**。空白期間自体が存在しなくなる。
- **事業継続を希望する場合**: 元 Admin / Staff が新規に法人アカウントを作成 → CLI-026 でプラン契約 → CLI-025 で元メンバーを再招待、の正規ルートに誘導する（COM-006 画面の確認ダイアログで案内）。
- **退会 vs プラン解約の使い分け**: 事業を一時停止したいだけなら、退会ではなく **プラン解約（CLI-026）** を選べば、Admin / Staff を冷凍保存したまま再課金で復活できる（billing/requirements.md REQ-BL-005 + organization/requirements.md REQ-ORG-006-B 参照）。退会は「完全にビジ友から離れる」意思表示のみに使う。

### 細かい論点（tasks.md で具体化）

以下は実装時に迷う余地が小さいため、個別決定ではなく tasks.md 生成時にまとめて反映する:
- **2-C**: `/profile/edit` に Owner 向け注意書き（文言は requirements.md L709 既出）を表示
- **2-F**: `scout_templates.owner_id` の ON DELETE CASCADE は `users` 物理削除時のみ発動。通常フロー（ソフトデリート）では発動しないので移譲ロジックと両立
- **2-G**: `organization_members` への INSERT/UPDATE/DELETE は RLS で全拒否なので admin client を使う（1-C/D/G の決定と一致）
- **3-A**: seed.sql の具体的な `name → display_name` 移行は実装時に実データと突き合わせて組む
- **3-C**: AUTH-008 のパスワード Zod スキーマは `.max(16)` を追加（既存 `updatePasswordSchema` のバグを継承しない）
- **3-E**: Storage RLS（`avatars` バケット）への追加ポリシー SQL は migration で具体化
- **3-F**: Admin が Owner 代理で `client_profiles` を更新した場合の監査ログは `audit_logs.actor_id = 実操作者` で記録
- **3-I**: Secure email change 中の CLI-022 は `public.users.email`（確認前は旧）を表示

## References
- [Supabase Auth Admin API — `inviteUserByEmail`](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail) — 招待メール送信と auth.users 自動作成
- [Supabase Auth — Email confirmation / Secure email change](https://supabase.com/docs/guides/auth/auth-email#secure-email-change) — `double_confirm_changes` の挙動
- [PostgreSQL SECURITY DEFINER functions](https://www.postgresql.org/docs/current/sql-createfunction.html) — RPC の権限境界とトランザクション
- [Next.js App Router — Router Cache](https://nextjs.org/docs/app/building-your-application/caching#router-cache) — `router.push` によるキャッシュの影響
- `.kiro/specs/billing/design.md` — buildSuccessUrl / Webhook RPC / Stripe 二重課金防止の既存仕様
- `.kiro/specs/messaging/design.md` — メッセージ UI の sender 名前解決・代理メッセージ仕様
- `.kiro/steering/database-schema.md` — `client_profiles` 定義、発注者表示名ルール、RLS 設計指針
- `.kiro/steering/authentication.md` — 担当者招待フロー、メールアドレス変更フロー
- `.kiro/steering/roles-and-permissions.md` — 法人プランの組織権限マトリクス
- `CLAUDE.md` — Router Cache, Zod UUID, pgTAP UUID 重複、代理メッセージ設計など過去事例
