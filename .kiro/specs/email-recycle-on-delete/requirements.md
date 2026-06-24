# Requirements Document

## Project Description (Input)

### 目的
ビジ友のユーザーが「削除」または「退会」で `public.users.deleted_at` がセットされたとき、その人の `auth.users.email` に「印」を付けて元のメールアドレスを解放する。これにより、**同じメールで再び登録・招待される経路が常に開通している** 状態を保つ。運営の DB 直叩き手作業をゼロにする。

### 背景
代理アカウント N 法人兼任サポート spec の Phase 4-5（2026-06-24 完了）で、subscription 解約・担当者削除の挙動が「凍結（`is_active=false`）」から「物理削除（`organization_members` 行削除 + `users.deleted_at` セット）」に切り替わった。その副作用として、削除されたユーザーの `auth.users.email` は元のまま残り続け、同じメールでの再招待・再登録が `auth.users` の UNIQUE 制約で詰まるようになった。手動オペレーション（運営側で DB 直接操作）でしか解消できず、操作ミスのリスクが高い。

詳細経緯は `.kiro/specs/notifications/email-decisions-wip.md` の「将来 spec 候補 S-01」を参照。

### 設計判断：fresh start（合意済み）
削除されたユーザーが同じメールで戻ってきても、**真っ新なアカウントとしてスタート** する。前のアカウント（id 違い）のメッセージ・評価・お気に入り・プロフィール等は引き継がない。
- 引き継ぐ仕組み（旧凍結方式の復活）は、Phase 5 で削除済みアーキテクチャの後戻りになるため採用しない
- 旧データは旧 user id 紐づきで DB に残り、admin の監査・履歴目的でのみ参照される

### スコープ（3 経路すべて対象）

`public.users.deleted_at` が NULL → now() に遷移する **全ての経路** で `auth.users.email` を印付け書き換えする。

| # | 経路 | 該当箇所 |
|---|---|---|
| 1 | 代理 staff が全組織から外れた瞬間 | `delete_staff_member` v2（残存メンバーシップ 0 件で deleted_at セット） |
| 2 | 通常 staff の削除（個別 / プラン解約による連鎖） | 同上 + `handle_subscription_lifecycle_deleted` v2 のループ内 |
| 3 | 本人退会（受注者・発注者） | `src/lib/withdrawal/execute.ts` の `executeWithdrawal` |

### 印の形式（確定事項）
- 元のアドレス：`tanaka@bijiyu.jp`
- 印付きアドレス：`deleted-20260624-a3f2-tanaka@bijiyu.jp`
- 仕様：`deleted-{YYYYMMDD}-{ランダム4文字}-{元のローカル部}@{元のドメイン}`
- 同じ人を同日に 2 回削除（経路 1/2 で削除 → 救済で復活 → 再削除 等）してもランダム 4 文字（小文字英数）で衝突しない
- `public.users.email` は原本のまま（履歴用）。`auth.users.email` のみ書き換え

### 誤削除の救済（確定事項）
- 復活処理（印を剥がして `deleted_at = NULL` に戻す）を実装する
- **本 spec の成果物は `src/lib/email-recycle/` 配下のライブラリ関数のみ**。Next.js Server Action としては export しない
- 管理画面 UI / admin ロール向け Server Action route / CLI コマンドは本 spec の対象外（運営も含めて UI からは呼び出さない方針）
- 緊急時は開発者が一回限りのスクリプトまたは Node REPL から本関数を直接呼ぶ運用
- 救済対象は 3 経路すべて（本人退会の `auth.users` ban 解除も含むかは design.md で精査）

### 再招待・再登録時の挙動
- 既存の `resolveExistingProxyReuse` ロジック（同じ代理運営員が N 法人兼任で再利用）はそのまま機能する
- 印付きで「席が空いた」`auth.users` に対し、新しい招待・新規登録で新規 `auth.users` 行が作られる
- `public.users` 上に「原本 email + deleted_at != NULL」「原本 email + deleted_at = NULL」の 2 行が並ぶ状態になる（`public.users.email` は非 UNIQUE なので OK）
- 新しいアカウントは fresh start：プロフィール・メッセージ・評価・お気に入り・通知設定すべてゼロから

### 影響範囲（design.md で精査）
- `delete_staff_member` RPC の戻り値追加（グローバル削除したかどうか）
- `delete_staff_member` の呼び出し元 Server Action（`/mypage/members/actions.ts` の `deleteMemberAction` 等）で印付け処理を発火
- `handle_subscription_lifecycle_deleted` v2 のループ内で削除確定した user 全員に印付け（PG 内では admin auth API を呼べないので、Webhook ハンドラ Server Action 側で後処理する設計の検討）
- `executeWithdrawal` 内の `auth.admin.updateUserById(..., { ban_duration })` の直前または同タイミングで email 書き換え
- 過去に削除済みで `deleted_at` が立っている user の `auth.users` へのバックフィル要否（旧凍結データ正規化 migration `20260616140000` で `deleted_at` を立てた既存行が対象になる）

### 関連 spec
- `.kiro/specs/proxy-account-multi-org-support/`（前提：物理削除モデルへの切替を行った spec）
- `.kiro/specs/notifications/`（このバグ発見元、§5.7 / §5.7.5 文面と整合）

### 非機能要件
- pgTAP テスト：印付与後の RLS / FK 整合、再削除時の衝突回避（同人 2 回削除のランダム衝突）
- vitest テスト：Server Action の印付け / 復活処理。3 経路すべての fork（個別 staff 削除 / 解約連鎖 / 本人退会）
- E2E テスト：
  - 「代理を削除 → 同じメールで別法人代理に招待 → 成功」
  - 「通常 staff を削除 → 同じメールで同法人 / 別法人に再招待 → 成功」
  - 「受注者本人退会 → 同じメールで新規会員登録 → 成功（fresh start で）」

### 非スコープ（やらないこと）
- 旧「凍結→復活」モデルの復活
- 削除前データの新アカウントへの引き継ぎ（メッセージ・評価・プロフィール等）
- 救済処理の管理画面 UI / admin ロール向け Server Action route / CLI コマンド（運営含む UI からの呼び出し導線は一切作らない）
- `delete_staff_member` / `executeWithdrawal` 等の既存仕様の挙動変更（追加処理として印付けを差し込むのみ）

## Introduction

ビジ友では、代理アカウント N 法人兼任サポート spec（2026-06-24 完了）の Phase 4-5 で、subscription 解約・担当者削除の挙動が「凍結」から「物理削除（`organization_members` 行削除 + `users.deleted_at` セット）」に切り替わった。この変更により、削除されたユーザーの `auth.users.email` は元の値のまま残り続け、`auth.users` の UNIQUE 制約に守られた状態で「席を占有し続ける」状態になっている。

結果として、以下 3 経路で **同じメールアドレスでの再招待・再登録ができない** 問題が発生している：

1. 代理 staff が全組織から外れた後、同じ運営員を別法人の代理として再招待
2. 通常 staff を削除した後（個別 / プラン解約連鎖）、同じ担当者を再招待
3. 受注者・発注者が本人退会した後、同じメールで再登録

現状の運用は「運営が DB に直接コマンドを打って auth.users 行を消す」手作業で吸収しており、操作ミスで関係ないデータを巻き込むリスクがある。

本機能では `public.users.deleted_at` が NULL → now() に遷移する 3 経路すべてで、対象 user の `auth.users.email` を `deleted-{YYYYMMDD}-{ランダム4文字}-{元のlocalpart}@{元のドメイン}` 形式に書き換えて元のメールアドレスを解放する。誤削除に備えて印を剥がして復活させる Server Action も併設する（管理画面 UI は別タスク）。

設計判断として **fresh start** を採用する：同じメールで戻ってきたアカウントは新規 `auth.users` 行として扱い、旧 user に紐づくメッセージ・評価・プロフィール等は新アカウントに引き継がない。旧凍結方式（同じ id を起こして履歴ごと復活させる）は採用しない。

## Requirements

### Requirement 1: 個別担当者削除時の email 印付け
**Objective:** 法人 Owner / Admin として、CLI-023 から担当者を削除した後、同じメールアドレスで別の担当者（または同じ運営員を別法人代理として）招待できる状態にしたい。

#### Acceptance Criteria
1. When `delete_staff_member` v2 の実行結果として対象 user の `public.users.deleted_at` が NULL → now() に遷移した場合, the メール再利用機能 shall その user の `auth.users.email` を `deleted-{YYYYMMDD}-{ランダム4文字}-{元のlocalpart}@{元のドメイン}` 形式に書き換える。
2. While 削除後も対象 user の残存メンバーシップが 1 件以上ある（`deleted_at` がセットされない）場合, the メール再利用機能 shall `auth.users.email` を書き換えない（N 法人兼任の代理は別組織で継続在籍するため）。
3. The メール再利用機能 shall Requirement 1 の印付け挙動を、対象 user の `organization_members.is_proxy_account` フラグ（代理 / 通常担当者）に依らず一律に適用する（引き金は残存メンバーシップ 0 件かどうかのみ）。
4. When 印付け処理が成功した場合, the メール再利用機能 shall `audit_logs` に `action='auth_email_recycled'`, `target_type='user'`, `target_id=対象 user id`, `actor_id=削除を実行した Owner / Admin の user id` を記録する。
5. If `auth.users.email` の書き換え API 呼び出しが失敗した場合, then the メール再利用機能 shall エラーログを残し、上位の削除処理（`organization_members` 削除・`users.deleted_at` セット）の完了状態は維持したまま戻り、呼び出し元には削除自体は成功した旨を返す。
6. The メール再利用機能 shall `public.users.email` の値を変更しない（旧 user の履歴参照用に原本を保持する）。
7. The メール再利用機能 shall 既存の `on_auth_user_email_changed` トリガー（`auth.users.email` の UPDATE を検知して `public.users.email` を自動同期する仕組み、`supabase/migrations/20260415100000_auth_email_sync_trigger.sql`）の関数本体 `handle_user_email_change` を、印付け形式（**`/^deleted-\d{8}-[a-z0-9]{4,}-/`**、`{4,}` で forward 4 文字 / バックフィル 8 文字を両対応）に該当する書き換えについては同期をスキップするよう更新する（AC 6 の不変条件を実装レベルで担保するため）。
8. The メール再利用機能 shall 上記 v2 関数の更新時に **`SET search_path = public`** を明示的に付与する（CLAUDE.md SECURITY DEFINER ルール準拠。既存 v1 では欠落しており、過去 `handle_new_user` で同種の欠落により「Database error saving new user」障害が発生しているため、v2 化のタイミングで同時に修正する）。
9. The メール再利用機能 shall 印付け書き換えの admin API 呼び出しを **`admin.auth.admin.updateUserById(userId, { email: suffixedEmail, email_confirm: true })`** 形式で行い、`email_confirm: true` を必ず付与する（印付き email は実在しない架空アドレスのため、Supabase Auth が確認メールを送信して bounce を発生させると本番メール送信ドメインの配信信頼度が低下する。`email_confirm: true` で確認メール送信を抑止する）。

### Requirement 2: 法人プラン解約連鎖削除時の email 印付け
**Objective:** ビジ友運営として、法人プラン解約により配下 Admin / Staff が一括削除された後、Owner が再契約した際に同じ担当者メールを再招待できる状態にしたい。

#### Acceptance Criteria
1. When `handle_subscription_lifecycle_deleted` v2 のループ内で配下メンバーの `users.deleted_at` を NULL → now() にセットした場合, the メール再利用機能 shall そのメンバーに対しても Requirement 1 と同じ印付け処理を施す。
2. When 同一バッチで複数の配下メンバーに印付けが行われる場合, the メール再利用機能 shall 各メンバーごとに独立してランダム 4 文字を生成し、メンバー間で印付きアドレスが衝突しないことを保証する。
3. Where `handle_subscription_lifecycle_deleted` v2 の SECURITY DEFINER 関数内では PostgreSQL から `auth.admin.updateUserById` を直接呼べないため, the メール再利用機能 shall Webhook ハンドラ（Server Action / API Route）側で RPC 戻り値を受け取り、削除確定した user 全員に対し印付け処理を実行する形を取る。
4. If 解約 Webhook ハンドラが印付け処理の途中でエラーになった場合, then the メール再利用機能 shall 既に印付けが完了した user の状態は維持したまま、残りの user について再試行可能な状態を保つ（部分成功を許容する）。
5. When `handle_subscription_lifecycle_deleted` v2 の Owner 既退会 early-return パスを通った場合, the メール再利用機能 shall 連鎖削除自体が発生しないため印付けも発火させない（既存挙動を変えない）。

### Requirement 3: 本人退会時の email 印付け
**Objective:** 受注者・発注者として、一度退会した後、後日同じメールアドレスで新規会員登録ができる状態にしたい。

#### Acceptance Criteria
1. When `executeWithdrawal` が対象 user の `users.deleted_at` を NULL → now() にセットした場合, the メール再利用機能 shall その user に対し Requirement 1 と同じ印付け処理を施す。
2. When `executeWithdrawal` が Owner 退会のカスケードで配下 Admin / Staff の `users.deleted_at` を一括セットした場合, the メール再利用機能 shall 配下メンバー全員にも印付けを施す。
3. The メール再利用機能 shall `executeWithdrawal` 内の既存の `auth.admin.updateUserById(targetUserId, { ban_duration })` 呼び出し（100 年 ban）の挙動を変更しない（印付けと ban は両立して適用する）。
4. The メール再利用機能 shall `executeWithdrawal` の guard 1（応募中案件）・guard 2（受注作業中案件）・Stripe 解約・各種カスケード処理を変更しない（追加処理として印付けを差し込むのみ）。
5. When 印付け処理が失敗した場合, the メール再利用機能 shall 退会自体は完了済みの状態を維持し、呼び出し元（本人退会フロー / admin によるアカウント削除フロー）には退会成功を返す。

### Requirement 4: 印付きアドレスのフォーマット規約
**Objective:** ビジ友運営として、データベースを見たときに「いつ・どのユーザーが削除されたか」を一目で識別できるようにしたい。

#### Acceptance Criteria
1. The メール再利用機能 shall 印付きアドレスを `deleted-{YYYYMMDD}-{ランダム4文字}-{元のlocalpart}@{元のドメイン}` 形式で生成する。
2. The メール再利用機能 shall `{YYYYMMDD}` を印付け実行時の UTC 日付（年 4 桁・月 2 桁・日 2 桁、区切り無し）として埋め込む。
3. The メール再利用機能 shall `{ランダム4文字}` を小文字英数字（`[a-z0-9]`）から暗号学的に安全な乱数で 4 文字生成する。
4. If 元の email アドレスが `@` を含まない不正な形式である場合, then the メール再利用機能 shall 印付けを skip し、エラーログを残し、上位の削除処理は継続させる。
5. When 印付き email が偶然 `auth.users` の別の既存行と衝突した場合, the メール再利用機能 shall 別のランダム値で最大 3 回まで再試行し、それでも衝突する場合はエラーログを残して印付けを skip する（上位の削除処理は継続）。
6. The メール再利用機能 shall 印付け前に元 email が既に印付きパターン（**`/^deleted-\d{8}-[a-z0-9]{4,}-/`**）に合致するか判定し、合致する場合は二重印付けを行わず成功扱いで返す（冪等性）。`{4,}`（4 文字以上）でマッチさせる理由：forward 経路は 4 文字だがバックフィル経路（Req 8.6）は 8 文字を使うため、両長さを同じパターンで検出可能にする。

### Requirement 5: 再招待・再登録の可能化
**Objective:** Owner / Admin / 一般ユーザーとして、削除済みの相手と同じメールアドレスで再招待・新規登録の操作が成功するようにしたい。

#### Acceptance Criteria
1. When 印付け後の元 email で `supabase.auth.admin.inviteUserByEmail(originalEmail, ...)` が呼ばれた場合, the メール再利用機能 shall `auth.users` の UNIQUE 制約に抵触させず、新しい `auth.users` 行（新規 user id）を作成させる。
2. When 印付け後の元 email で新規会員登録（`supabase.auth.signUp(originalEmail, ...)`）が呼ばれた場合, the メール再利用機能 shall 同様に新しい `auth.users` 行を作成させる。
3. The メール再利用機能 shall 既存の `resolveExistingProxyReuse` ヘルパー（同じ代理運営員を別組織に reuse）のロジック・戻り値を変更しない（N 法人兼任仕様は維持）。
4. While 既存ユーザー再利用パス（`reuse_existing_proxy`）が `public.users.deleted_at IS NULL` を要件としている場合, the メール再利用機能 shall その判定を変更せず、削除済み user は常に新規 user 扱いとして招待が成立する形を維持する。
5. When 新しい user 行が作成された場合, the メール再利用機能 shall 旧 user に紐づく `messages` / `applications` / `scout_templates` / `favorites` / `user_reviews` / `client_profiles` / `user_skills` / `user_qualifications` / `user_available_areas` の所属を変更しない（旧 user id 紐づけのまま、新 user からは見えない fresh start を実現する）。
6. The メール再利用機能 shall `resolveExistingProxyReuse` ヘルパー（`src/lib/organization/resolve-existing-proxy-reuse.ts`）の `public.users` 検索クエリに `.is("deleted_at", null)` フィルタを追加し、同一 email の行が複数（退会済み + active）並んだ状態でも active 行のみを検索対象とすることで `.maybeSingle()` の multi-row エラーを防ぐ。判定の discriminated union 構造（`new_user` / `reuse_existing_proxy` / `reject_email_taken` / `reject_name_mismatch`）は変更しない。

### Requirement 6: fresh start の徹底
**Objective:** 一般ユーザーとして、自分が削除前に持っていた個人情報・履歴が、同じメールで戻ってきた別人（または自分のアカウント再作成）に意図せず引き継がれないようにしたい。

#### Acceptance Criteria
1. The メール再利用機能 shall 削除前 user の `public.users` 行を残し、`email` / `last_name` / `first_name` / `prefecture` / `municipality` / `skill_tags` / 動画 URL 等の公開プロフィール情報を書き換えない。
2. The メール再利用機能 shall 新しく作られた user 行を、削除前 user 行と自動でリンクしない（参照関係を新設しない）。
3. When 同じ original email で複数回の削除と再登録が発生した場合, the メール再利用機能 shall 各回の削除前 user 行を独立した履歴として保持する（`public.users.email` の重複を許容する）。
4. The メール再利用機能 shall 公開クエリ（受注者一覧 CLI-005 / 発注者検索 CON-005 等）から削除済み user 行が漏出しないこと（既存の `deleted_at IS NULL` フィルタが効くこと）を変更せず維持する。

### Requirement 7: 誤削除からの復活処理（開発者直接呼び出し用）
**Objective:** ビジ友開発者として、誤って削除してしまった代理 / 通常 staff / 退会者を、印を剥がして元の状態に戻せる手段を**ライブラリ関数として**用意したい（管理画面 UI は本 spec ではスコープ外で、運営も含めて UI からは呼び出さない）。

#### Acceptance Criteria
1. When 開発者が復活関数を対象 user id 指定で呼んだ場合, the 復活関数 shall 対象 user の `auth.users.email` を印付き形式から元の形（`deleted-YYYYMMDD-rand-` プレフィックスを除去した値）に戻す。
2. When 復活関数が呼ばれた場合, the 復活関数 shall 対象 user の `public.users.deleted_at` を NULL に戻す。
3. Where 本人退会経由で `auth.users` に ban_duration が設定されている場合, the 復活関数 shall ban を解除する（`ban_duration: 'none'` 相当の更新）。
4. If 復活対象の元 email が現在 `auth.users` 上で別の active な user 行（印付きでない）として既に登録されている場合, then the 復活関数 shall 復活を拒否し、`{ success: false, error: "同じメールで別アカウントが既に存在するため復活できません" }` 相当の戻り値を返す。
5. If 復活対象 user の `auth.users.email` が印付き形式（**`/^deleted-\d{8}-[a-z0-9]{4,}-/`**、`{4,}` で forward 4 文字 / バックフィル 8 文字を両対応）に合致しない場合, then the 復活関数 shall 復活を拒否し、`{ success: false, error: "印付け済みのアカウントではありません" }` 相当の戻り値を返す。
6. When 復活処理が成功した場合, the 復活関数 shall `audit_logs` に `action='auth_email_restored'`, `target_id=対象 user id`, `actor_id=NULL`, `metadata = { invoked_by: 'developer', date: YYYY-MM-DD }` を記録する（UI 経由ではなく開発者が直接呼んだ事実を残す。`date` は他 3 種 metadata と対称化し、運営の SQL 集計を簡素化するため必須）。
7. The 復活関数 shall Next.js Server Action として export せず、`src/lib/email-recycle/` 配下のライブラリ関数として実装し、Service Role Key を持つ admin client（`createAdminClient()`）を引数で受け取って動作する（=セッション・認可は呼び出し側の責任）。
8. The 復活関数 shall 専用の管理画面 UI / admin ロール向け Server Action route / CLI コマンドのいずれも本 spec の成果物に含めない。緊急時は開発者が一回限りのスクリプト（`scripts/restore-recycled-email.ts` 等）または Node REPL から本関数を呼ぶ運用とする。
9. The 復活関数 shall 関数の TSDoc コメントで「危険・運用注意」「fresh start を巻き戻すため対象ユーザーの旧 user id が再有効化される」「呼び出し前に対象 user の `public.users` 状態を確認すべき」旨を明記する。
10. If 復活処理が `rejected` / `failed` で終わった場合, the 復活関数 shall `audit_logs` に `action='auth_email_restore_failed'`, `target_type='user'`, `target_id=対象 user id`, `actor_id=NULL`, `metadata.reason` で原因（`not_suffixed` / `email_collision` / `user_not_found` / `api_error`）, `metadata.invoked_by='developer'` を記録する。これにより「誰がいつ救済を試みて失敗したか」を後追い可能にし、`applyDeletedSuffix` の失敗ログ（Req 10.5）と対称性を保つ。

### Requirement 8: 既存削除済みデータのバックフィル
**Objective:** ビジ友運営として、本機能のデプロイ前にすでに `deleted_at` がセットされている user の `auth.users.email` も再利用可能な状態に揃えたい。

#### Acceptance Criteria
1. When 本 spec のバックフィル処理（migration または 1 回限りの開発者用スクリプト）が実行された場合, the バックフィル処理 shall `public.users.deleted_at IS NOT NULL` かつ対応する `auth.users.email` が印付きパターンに合致しない user 全員に対し、Requirement 4 の形式で印付けを施す。
2. The バックフィル処理 shall 実行前に対象件数を NOTICE / log として出力し、件数を事前確認可能な状態を提供する。
3. If バックフィル中に特定 user の印付け失敗が発生した場合, then the バックフィル処理 shall その user id をエラーログに残し、他 user の処理を継続する（all-or-nothing にしない）。
4. The バックフィル処理 shall 冪等性を持ち、複数回実行しても二重印付けが発生しないこと（Requirement 4-6 の二重印付け回避ロジックがバックフィルでも有効であること）を保証する。
5. The バックフィル処理 shall 投入推奨タイミングを **「深夜・低トラフィック時間帯」** とし、運用 doc または migration 冒頭コメントに明記する（Phase 3 の forward 経路と同一ユーザーへの並行更新で row-level lock 競合による稀な時間切れ失敗を回避するため）。
6. The バックフィル処理 shall ランダム部に **8 文字（小文字英数字、md5 ハッシュの先頭 8 文字）** を使用する（forward 経路の 4 文字より長い理由：1 回限りの一括 UPDATE では衝突時のリトライが効かないため、4 文字 16^4=65,536 では 1000 件規模で `auth.users.email` UNIQUE 制約により衝突確実、8 文字 16^8=約 43 億で衝突確率事実上ゼロ）。SUFFIX_PATTERN（Req 4.6）は `{4,}` で 4 文字 / 8 文字を両方検出する。

### Requirement 9: 監査ログとプライバシー保護
**Objective:** ビジ友運営として、メール書き換え / 復活処理がいつ・誰によって行われたかを後から追跡可能な状態で記録したい。

#### Acceptance Criteria
1. The メール再利用機能 shall `auth_email_recycled` / `auth_email_recycle_failed` / `auth_email_restored` / `auth_email_restore_failed` の 4 種の action を `audit_logs.action` 列の値として導入する（`audit_logs.action` は `text NOT NULL` 列で CHECK 制約なし、追加に migration 不要）。
2. When 印付け / 復活処理が完了した場合（成功・失敗ともに）, the メール再利用機能 shall 該当 `audit_logs` 行の `target_type` を `'user'`, `target_id` を対象 user id として記録する。
3. The メール再利用機能 shall `audit_logs.metadata` に印付け / 復活実行日付（YYYY-MM-DD）と発生経路（`'staff_delete'` / `'subscription_deleted'` / `'self_withdrawal'`、復活時は `'developer'`）を記録する。
4. The メール再利用機能 shall `audit_logs.metadata` に元 email アドレスの値（原本文字列）を含めない（既に `public.users.email` で参照可能なため二重保存しない、かつ将来の個人情報削除 spec で metadata まで対応する負荷を増やさない）。

### Requirement 10: 冪等性と並行安全性
**Objective:** 開発者として、同じ削除処理が二重に走っても・並行して走っても、印付けが破綻しないことを保証したい。

#### Acceptance Criteria
1. When 同じ user に対して印付け処理が二重に呼ばれた場合（既に印付き済み、Requirement 4-6 で検出）, the メール再利用機能 shall 何もせず成功扱いで返す。
2. While 同一 user の削除トランザクションが並行して 2 つ走った場合, the メール再利用機能 shall `delete_staff_member` v2 の `FOR UPDATE` 悲観ロックに後続処理が連結する形で直列化され、印付けも 1 回だけ発火する（重複印付けが発生しない）。
3. While 同じ original email を持つ複数の `public.users` 行（旧削除済み + 新登録済み）が存在する場合, the メール再利用機能 shall 新規登録時の `auth.users` UNIQUE 制約を新登録 user id についてのみ判定し、旧削除済み user の印付きアドレスは衝突しないものとして扱う。
4. If `auth.users.updateUserById` API 呼び出しがネットワーク等で失敗した場合, then the メール再利用機能 shall 削除済み user に対し後追いで印付けを再実行できるリトライ経路を、Requirement 7 と同じ「`src/lib/email-recycle/` 配下のライブラリ関数（開発者直接呼び出し用）」として提供する（UI なし）。
5. If 印付け処理が `failed` / `skipped` で終わった場合, the メール再利用機能 shall `audit_logs` に `action='auth_email_recycle_failed'`, `target_type='user'`, `target_id=対象 user id`, `metadata.reason` に原因（`api_error` / `invalid_format` / `max_retries_exceeded` / `user_not_found`）, `metadata.path` に発生経路を記録し、運営が `SELECT * FROM audit_logs WHERE action = 'auth_email_recycle_failed' AND created_at >= ...` で失敗 user 一覧を集計できる状態にする（コンソールログだけに頼らない）。

### Requirement 11: 既存仕様への非介入
**Objective:** 開発者として、本機能の追加によって既存の代理 N 法人兼任 / 担当者招待 / 本人退会の挙動が変わらないことを保証したい。

#### Acceptance Criteria
1. The メール再利用機能 shall `delete_staff_member` v2 の残存メンバーシップ判定ロジック（`FOR UPDATE` + count による条件付きソフト削除）を変更しない。
2. The メール再利用機能 shall `handle_subscription_lifecycle_deleted` v2 の Owner 既退会 early-return / 案件 `closed` 化 / `audit_logs` 記録 / Owner ロールダウングレードを変更しない。
3. The メール再利用機能 shall `resolveExistingProxyReuse` の判定ロジック（4 種 discriminated union: `new_user` / `reuse_existing_proxy` / `reject_email_taken` / `reject_name_mismatch`）の構造・分岐条件を変更しない（Req 5.6 で追加する `.is("deleted_at", null)` 検索フィルタは判定ロジックの変更ではなく検索範囲の補正であり例外的に許容する）。
4. The メール再利用機能 shall `executeWithdrawal` の各種 guard / Stripe 解約 / 組織カスケード / 100 年 ban の挙動を変更しない（印付けを追加処理として差し込むのみ）。
5. The メール再利用機能 shall `createMemberAction` / `acceptInviteAction` / `signupAction` の挙動を変更しない（招待・再招待・新規登録は既存のままで、`auth.users` の空き席に依拠して動作する）。

### Requirement 12: テスト戦略
**Objective:** 開発者として、本機能が 3 経路で正しく動作し、回帰せず、再削除等のエッジケースでも破綻しないことを自動テストで保証したい。

#### Acceptance Criteria
1. The メール再利用機能 shall pgTAP テストで以下を検証する: (a) `auth.users.email` 印付け後の RLS / FK 整合, (b) `public.users.email` が書き換えられていないこと, (c) 同一 user 2 回削除（復活経由）のランダム 4 文字非衝突, (d) `audit_logs` への記録。
2. The メール再利用機能 shall Vitest テストで以下を検証する: (a) 個別 staff 削除での印付け呼び出し, (b) 解約連鎖削除での印付け呼び出し, (c) 本人退会での印付け呼び出し, (d) 復活 Server Action の正常系・エラー系（権限・衝突・形式不一致）, (e) admin auth API モックでの失敗時のフォールバック。
3. The メール再利用機能 shall Playwright E2E テストで以下シナリオを検証する: (a) 代理 staff を全組織から削除 → 同じメールで別法人代理に招待 → 成功, (b) 通常 staff を削除 → 同じメールで同法人に再招待 → 成功, (c) 受注者本人退会 → 同じメールで新規会員登録 → 成功し fresh start プロフィールが表示される。
4. The メール再利用機能 shall E2E テストで「再登録後の新アカウントから旧アカウントのメッセージ / 評価 / お気に入りが見えないこと」を assertion し、fresh start が壊れないことを保証する。
