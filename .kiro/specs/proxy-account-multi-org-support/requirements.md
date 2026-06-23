# Requirements Document

## Introduction

本 spec は、ビジ友運営スタッフ 1 名が複数法人の代理アカウント（`organization_members.is_proxy_account = true`）として在籍できるようにするための機能要件を定義する。現状の実装は「1 ビジ友運営スタッフ = 1 法人の代理アカウント」を前提としており、想定運用「1 スタッフが N 法人の代理を兼任」が成立しない。DB schema（`organization_members` の (user_id, organization_id) 複合キー）は既に N:N をサポートしているが、招待・削除・凍結・権限制約・氏名突合・UI コンテキスト等の主要な実装ギャップを修正する必要がある。

設計判断として、ビジ友運営スタッフ自身が `role='admin'`（システム管理者）と `role='staff'`（代理アカウント）の両方を担う場合は **別アカウント** で運用する（案イ採用）。`/admin/login` と `/login` の出し分けは現状を維持する。admin 関連のアカウント追加は引き続き SQL/seed 運用とし、招待 UI は本 spec の対象外とする。

本 spec の実装完了後、`.kiro/specs/notifications/email-decisions-wip.md` §5.6 / §5.7（代理アカウント設定通知・担当者削除通知）の文面確定作業に戻る。

## Requirements

### Requirement 1: 代理アカウントの N 法人兼任サポート

**Objective:** As ビジ友運営チーム, I want 1 名の運営スタッフが複数法人の代理アカウントを同一の `users` 行で兼任できる, so that 1 名で 5〜10 社を担当する現実的な運用が可能になり、法人ごとに別メールアドレスを発行する管理コストを回避できる。

#### Acceptance Criteria

1. The 代理アカウント機能 shall 同一の `users.id` が複数の `organization_members` 行（異なる `organization_id`）を持つことを許容する。
2. The 代理アカウント機能 shall 各 `organization_members` 行の `is_proxy_account = true` を独立に判定し、組織ごとに代理として機能させる。
3. When 1 名の代理スタッフが N 組織に在籍している, the 各組織内の権限判定 shall 当該組織の `organization_members` 行のみを参照し、他組織の在籍状況に影響されない。
4. Where 既存の単一組織在籍データ（N=1）が存在する, the 代理アカウント機能 shall 既存挙動を変更せず、データ移行（migration）を不要とする。

### Requirement 2: 招待時のメール重複ハンドリング（既存ユーザー再利用）

**Objective:** As 法人 Owner / Org Admin, I want CLI-022 で既にビジ友の代理を担っているスタッフのメールアドレスを入力したときに、別組織への代理として追加できる, so that メール変更や別アドレス発行を強いられず、現実的なオペレーションが成立する。

#### Acceptance Criteria

1. When 担当者招待 Server Action（`createMemberAction`）が呼ばれ、入力された email が既存の `users` 行と一致し、かつ既存ユーザーが他組織で代理在籍中（少なくとも 1 件の `organization_members` 行で `is_proxy_account = true`）であり、かつ招待リクエストも `isProxyAccount = true` の場合, the 招待 Server Action shall 新規 `auth.users` を作成せず、既存 `user_id` を再利用して当該組織の `organization_members` 行のみを追加する。
2. If 入力された email が既存ユーザーと一致し、かつ既存ユーザーが代理在籍していない（一般受注者・発注者・通常スタッフ・システム管理者等）, then the 招待 Server Action shall 招待を拒否し、「このメールアドレスは既に登録されています」相当のエラーを返す。
3. If 入力された email が既存ユーザーと一致し、既存ユーザーが代理在籍中でも、招待リクエストが `isProxyAccount = false`（通常スタッフ招待）の場合, then the 招待 Server Action shall 招待を拒否し、同じエラーを返す（通常スタッフは 1 組織制限を維持）。
4. When 既存ユーザー再利用パスで招待が成立した場合, the 招待 Server Action shall Supabase Auth の `inviteUserByEmail`（パスワード設定リンク付き招待メール）を**呼び出さない**。
5. The 招待 Server Action shall 既存ユーザー再利用パスでも `insert_staff_member_with_limit` RPC を呼び、組織内代理一意性および担当者上限のチェックを通過させる。
6. While 入力された email が新規（既存 `users` 行が無い）の場合, the 招待 Server Action shall 現状通り `inviteUserByEmail` を呼び、新規 `auth.users` を作成して招待メールを送信する。
7. If 既存ユーザー再利用パスで招待 Server Action が呼ばれ、入力された (`lastName`, `firstName`) が既存 `users.last_name` / `users.first_name` と完全一致しない場合, then the 招待 Server Action shall 招待を拒否し、「このメールアドレスは既に違うお名前で登録されています。お名前をご確認の上、再度お試しください」相当のエラーを返す（人違い招待の防止）。
8. The 招待 Server Action shall エラー応答に既存ユーザーの氏名情報を含めない（プライバシー保護: 既存ユーザーが他組織で別名として登録されていることを露呈しない）。

### Requirement 3: 代理アカウント削除のスコープ限定

**Objective:** As 法人 Owner / Org Admin, I want 担当者削除を実行したとき、削除対象が他組織でも在籍中であれば他組織の業務に影響しないようにする, so that 1 組織から代理を外しても、その人物が担当する他社業務が停止しない。

#### Acceptance Criteria

1. When `delete_staff_member` RPC が呼ばれた時点で、対象 `user_id` が他組織にも在籍している（削除対象組織以外で `organization_members` 行が 1 件以上残る）場合, the 削除 RPC shall 当該組織の `organization_members` 行と当該組織内の `scout_templates.owner_id` 移譲のみ実行し、`users.deleted_at` をセットしない。
2. When `delete_staff_member` RPC が呼ばれ、削除完了後に対象 `user_id` の `organization_members` 行が 1 件も残らない場合, the 削除 RPC shall 現状通り `users.deleted_at = now()` をセットし、global ソフト削除を行う。
3. The 削除 RPC shall `users.deleted_at` をセットするかどうかを「当該組織を削除した結果として残存メンバーシップが 0 件か」だけで判定し、対象ユーザーの `role` や別組織の状態を判定材料に含めない。
4. While `users.deleted_at` がセットされていない状態, the 認証ミドルウェア shall 当該ユーザーのログインを許可し、残存する他組織の代理として通常通り操作できる。

### Requirement 4: 法人プラン解約時のスコープ限定（行削除統一）

**Objective:** As ビジ友システム, I want 法人プラン解約時に配下のスタッフを当該組織から「行削除」で外し、他組織にも在籍中の代理スタッフは他組織の業務を継続できるようにする, so that 1 法人の解約が他社の代理業務を巻き添えに停止させず、かつ R3（CLI 経由の削除）と挙動が統一されて仕組みが単純になる。

#### Acceptance Criteria

1. When `handle_subscription_lifecycle_deleted` が呼ばれて法人プラン Owner の解約を処理する場合, the 解約処理 shall 配下の `organization_members` 行（`org_role IN ('admin', 'staff')` の全件）を **当該組織分すべて削除** する。
2. When 上記の行削除を実行した結果、対象ユーザーの `organization_members` 行が 1 件も残らない（他組織にも在籍していない）場合, the 解約処理 shall そのユーザーに `users.deleted_at = now()` をセットして global 退会扱いとする（R3 と同一ロジック）。
3. When 上記の行削除を実行した結果、対象ユーザーが他組織にも在籍中の場合, the 解約処理 shall `users.deleted_at` をセットせず、ユーザーは他組織で引き続き代理として動作可能とする。
4. The 解約処理 shall 旧挙動の `users.is_active = false` セットを廃止する（行削除と `deleted_at` セットで意味を表現する）。
5. The 解約処理 shall 代理スタッフ（`is_proxy_account = true`）と通常スタッフ（`is_proxy_account = false`）の両方に同一のスコープ判定を適用する（挙動分岐しない）。
6. While middleware が `users.is_active = false` のユーザーをログイン拒否する挙動, the 認証ミドルウェア shall 維持する（不正利用ブロック等の別用途のため `is_active` 列自体は残す）。
7. The `reactivateCorporateMembers` ヘルパー shall 廃止する。法人プラン再加入時に配下メンバーを復活させる場合は、Owner が CLI-022 から再度招待を行う運用とする（代理スタッフは Requirement 2 の既存ユーザー再利用パスで簡単に再追加できる）。
8. The 解約処理 shall R3 の `delete_staff_member` RPC との共通ロジック化を設計フェーズで検討する（同一処理を 2 箇所に重複実装しないため）。
9. While 既存環境に旧挙動の `is_active = false` セット済みユーザーが残存する場合, the 移行 migration shall それらを `deleted_at` セット + `organization_members` 行削除の新方式に正規化する（具体手順は設計フェーズで決定）。

### Requirement 5: 組織内代理一意性チェックの維持

**Objective:** As 法人 Owner / Org Admin, I want 1 組織内に代理アカウントは 1 名までの制約を維持する, so that 「誰が代理として動いているか」が組織内で曖昧にならない。

#### Acceptance Criteria

1. The `insert_staff_member_with_limit` RPC shall 「組織内で代理アカウント 1 個」ルールを維持し、`is_proxy_account = true` の `organization_members` 行が当該組織で既に存在する場合は `PROXY_ACCOUNT_ALREADY_EXISTS` を返す。
2. The `insert_staff_member_with_limit` RPC shall 一意性チェックを「組織スコープ」で行い、ユーザー単位での代理在籍数（同一ユーザーが何組織の代理を兼任しているか）の上限は **設けない**。
3. When 既存ユーザー再利用パス（Requirement 2）で代理として組織に追加する場合, the 招待 Server Action shall `insert_staff_member_with_limit` RPC を経由し、当該組織の一意性チェックを通過させる。

### Requirement 6: 代理アカウント権限の固定（`admin` との組み合わせ禁止）

**Objective:** As ビジ友運営チーム, I want 代理アカウントの組織内権限を `org_role = 'staff'` に固定し、`org_role = 'admin'`（組織管理者）を選べないようにする, so that ビジ友運営スタッフが法人の社員管理権限（担当者の追加・削除等）を持つ業務上不自然な状態を防ぐ。

#### Acceptance Criteria

1. While 代理アカウントチェックボックス（`isProxyAccount = true`）が ON の状態, the CLI-022 / CLI-025 招待フォーム shall 権限プルダウンを `staff` に固定し、`admin` オプションを非表示にする。
2. When 代理アカウントチェックが OFF → ON に切り替えられた瞬間, the 招待フォーム shall 権限が現在 `admin` だった場合に `staff` へ自動切替する。
3. If 代理アカウント `is_proxy_account = true` かつ `org_role = 'admin'` の組み合わせで招待 Server Action（`createMemberAction`）または編集 Server Action（`updateMemberAction`）に到達した場合, then the 対象 Server Action shall 入力を拒否し、「代理アカウントは担当者権限でのみ作成・編集できます」相当のエラーを返す（UI バリデーション漏れの保険）。
4. The Zod スキーマ（`memberCreateSchema` / `memberUpdateSchema`） shall 同組み合わせをバリデーションエラーで弾く。
5. The DB shall `organization_members` テーブルに CHECK 制約を追加し、`NOT (is_proxy_account = true AND org_role = 'admin')` を強制する（最終防衛線）。
6. While 既存データに `is_proxy_account = true AND org_role = 'admin'` の組み合わせが存在する場合, the migration shall 既存データを `org_role = 'staff'` に統一してから CHECK 制約を有効化する。
7. The CLI-024 編集画面 shall 同じ制約を適用し、代理 ON のメンバーを編集する場合は権限プルダウンを `staff` 固定にする。

### Requirement 7: N 組織兼任スタッフのログイン後 UI（組織コンテキスト切替）

**Objective:** As N 組織兼任スタッフ, I want ログイン後にどの組織の業務を行っているか明示的に把握し、必要に応じて切り替えられる, so that 法人 A のメッセージを法人 B 向けと取り違える事故を防ぐ。

#### Acceptance Criteria

1. When N 組織兼任スタッフがログインしてマイページ（CON-001）にアクセスした場合, the マイページ shall 現在の組織コンテキスト（どの法人の業務を行っているか）を画面上で明示する。
2. While N 組織兼任スタッフがログイン中, the ビジ友システム shall 組織コンテキストを切り替える UI（ヘッダーの組織切替メニュー等）を提供する。
3. Where 単一組織在籍のスタッフ・通常スタッフがログインしている場合, the マイページ shall 組織切替 UI を表示しない（現状の挙動を維持）。
4. When 組織コンテキストが切り替えられた場合, the ビジ友システム shall マイページ・案件管理・応募管理・メッセージ等のスタッフ向け画面が新しい組織のデータを表示するように再フェッチする。
5. The 組織コンテキストの永続化方法（Cookie / セッション / URL パラメータ等）と切替 UI の配置は設計フェーズで決定する。
6. When 組織コンテキスト未選択の状態で兼任スタッフがログインする場合, the ビジ友システム shall 既定値を選択する（例: 最後に操作した組織、または最初に在籍した組織）。既定値選定の方針は設計フェーズで詳細化する。

### Requirement 8: 既存ユーザー再利用時の招待通知メール

**Objective:** As 招待された代理スタッフ, I want 別組織への代理追加時に「パスワード設定して新規登録してください」というノイズメールを受け取らず、「○○法人の代理になりました」という事実だけ通知される, so that 既に持っているアカウントとの混乱を防ぎ、運用メッセージとして実用的な内容になる。

#### Acceptance Criteria

1. When Requirement 2-1 の既存ユーザー再利用パスで招待が成立した場合, the 招待通知メール shall 「○○法人の代理アカウントとして設定されました」相当の通知メール（パスワード設定リンクなし）を 1 通送信する。
2. The 招待通知メール shall 件名・本文ともに対象の組織名を含み、複数組織を兼任していることが分かるようにする。
3. When 新規ユーザー作成パス（既存 `users` 行が無い）で招待が成立した場合, the 招待通知メール shall 現状通り Supabase Auth の招待メール（パスワード設定リンク付き）を送信する。
4. The 招待通知メール の具体文面・送信タイミング・テンプレート設計は `.kiro/specs/notifications/` 側の §5.6 / §5.7 と整合させ、本 spec 完了後に最終確定する。

### Requirement 9: 通常スタッフ（非代理）の単一組織制限の維持

**Objective:** As ビジ友システム, I want 通常スタッフ（社内従業員として法人に所属する `org_role='admin'` / `org_role='staff'`、`is_proxy_account = false`）が同時に複数法人に所属できない既存制約を維持する, so that 「ある法人の社員が同時に別法人の社員になる」という業務上ありえないケースを防ぐ。

#### Acceptance Criteria

1. The 招待 Server Action shall 通常スタッフ招待（`isProxyAccount = false`）に対しては Requirement 2 の既存ユーザー再利用パスを適用しない。
2. If 通常スタッフ招待で入力された email が既存 `users` 行と一致した場合, then the 招待 Server Action shall 「このメールアドレスは既に登録されています」相当のエラーを返し、招待を拒否する。
3. The 削除 RPC（`delete_staff_member`） shall 通常スタッフ削除に対しても Requirement 3 のスコープ判定を適用し、結果として残存メンバーシップが 0 件のときのみ `users.deleted_at` をセットする（仕様上 N=0 or 1 になるため、実害なく同一ロジックで動作する）。
4. The 解約処理 shall Requirement 4 の行削除ロジックを通常スタッフにも適用する。これにより通常スタッフは法人プラン解約時に `organization_members` 行が削除され、他組織にも在籍していなければ `users.deleted_at` がセットされる。**注: これは旧挙動（`users.is_active = false` で凍結し、再加入時に自動復活）からの変更であり、再加入時の自動復活は廃止される（再招待運用で対応）**。

### Requirement 10: admin（システム管理者）アカウント運用の明文化（spec 対象外）

**Objective:** As 設計判断の明示, I want admin アカウントの追加・削除・凍結を SQL/seed 運用に留めて、UI 追加・コード変更を本 spec の対象外とする, so that スコープを「代理スタッフの N 法人兼任」に集中させ、YAGNI を守る。

#### Acceptance Criteria

1. The 本 spec shall 「admin アカウント招待 UI」「admin 一覧画面」「admin 編集画面」を **新規実装しない**。
2. The 本 spec shall 既存の `users.role = 'admin'` の挙動（複数 admin が DB 上は許容される / `/admin/login` 経由でアクセスする / `requireAdmin()` で認可する）を変更しない。
3. While 運営チーム拡張時に admin を追加する場合, the ビジ友運営側 shall 開発側に依頼して migration / seed / 手動 SQL で `auth.users` + `public.users (role='admin')` を作成する運用に従う。
4. Where 本 spec で確定した「admin と代理は別アカウント（案イ）」の方針, the ビジ友運営側 shall 同一人物が両方を担う場合に 2 アカウント（例: `tanaka-admin@bijiyu.co.jp` と `tanaka@bijiyu.co.jp`）を持つ運用に従う。同一パスワードを設定するかは運用判断に委ねる。

### Requirement 11: テスト網羅と既存テストのデグレード防止

**Objective:** As 開発チーム, I want N 法人兼任機能の正常系・異常系・境界条件を網羅したテストを追加し、既存の Vitest / pgTAP / Playwright が全てパスし続けることを保証する, so that 本機能のリリースが他機能の回帰を引き起こさないことを担保する。

#### Acceptance Criteria

1. The 本 spec の実装 shall Vitest（ユニット・統合）, pgTAP（RLS / RPC）, Playwright（E2E）の既存テストを全てパスする状態を維持する。
2. The 本 spec の実装 shall Vitest で以下のシナリオをカバーする: (a) 同一 email で N 組織への代理招待が成功 / (b) 既存ユーザーが代理在籍していない場合の招待拒否 / (c) 通常スタッフ招待での既存ユーザー再利用パスが適用されない / (d) 既存ユーザー再利用パスで `inviteUserByEmail` が呼ばれない（通知メールのみ送信される） / (e) 削除時の残存メンバーシップ判定 / (f) 解約時のスコープ判定 / (g) 既存ユーザー再利用パスで入力氏名と既存氏名が不一致のときに招待が拒否され、エラー応答に既存氏名が含まれない / (h) `is_proxy_account = true` かつ `org_role = 'admin'` の招待・編集が Server Action と Zod の両方で拒否される。
3. The 本 spec の実装 shall pgTAP で以下のシナリオをカバーする: (a) `delete_staff_member` が他組織在籍時に `users.deleted_at` をセットしない / (b) `insert_staff_member_with_limit` の組織内一意性チェックは維持される / (c) `handle_subscription_lifecycle_deleted` で配下メンバーの `organization_members` 行が削除され、他組織に在籍が残るユーザーには `users.deleted_at` がセットされない（残らないユーザーにはセットされる） / (d) `organization_members` の CHECK 制約（`NOT (is_proxy_account = true AND org_role = 'admin')`）が違反 INSERT/UPDATE を拒否する。
4. The 本 spec の実装 shall Playwright で以下のユーザーストーリーをカバーする: (a) 法人 A の Owner が代理スタッフを招待 → 法人 B の Owner が同じ email で代理招待 → スタッフがログインして両組織で代理として動作 / (b) 法人 A が代理を削除 → スタッフが法人 B では引き続き代理として動作 / (c) 法人 A が解約 → スタッフが法人 B では引き続き代理として動作 / (d) N 組織兼任スタッフの組織切替 UI の操作 / (e) CLI-022 招待フォームで代理チェックを ON にすると権限プルダウンが `staff` 固定になり `admin` オプションが消える / (f) 既存ユーザー再利用パスで氏名を間違えて入力した場合に汎用エラー（既存氏名を含まない）が表示される。
5. When 本 spec の `spec-impl` 開始時, the 開発チーム shall `npm run test` / `supabase test db` / `npm run test:e2e` を実行し、全テストがパスする状態から実装に着手する。

### Requirement 12: メール通知 spec（§5.6 / §5.7）への戻し作業の前提整備

**Objective:** As メール通知 spec の議論再開, I want 本 spec の実装完了が §5.6（代理アカウント設定通知）・§5.7（担当者削除通知）の文面確定の前提条件を満たす, so that メール通知 spec を継続できる。

#### Acceptance Criteria

1. When 本 spec の Requirement 2 / 7 が確定する, the §5.6.C / 5.6.D 代理アカウント設定通知の配信先・件名・文面 shall 「N 組織兼任あり / 既存ユーザー再利用パス」を前提として再検討可能になる。
2. When 本 spec の Requirement 3 / 4 が確定する, the §5.7.A / 5.7.B 担当者削除通知（および「最後の組織から削除する場合の確認ダイアログ」案）の文面確定 shall 開始可能になる。
3. The 本 spec の実装完了 shall `.kiro/specs/notifications/email-decisions-wip.md` の §5.7 保留ブロックの解除条件を満たす。

## Out of Scope（明示的に対象外）

以下は本 spec の対象外とし、別 spec または運用で対応する。

- **admin（システム管理者）アカウント追加 UI / 一覧 UI / 編集 UI**: Requirement 10 参照。SQL/seed 運用を維持する。
- **admin と代理（staff）を 1 アカウントで兼任する仕組み（案ア）**: ログイン画面出し分けの設計を増やしたくないため案イ（別アカウント）を採用済。本 spec では実装しない。
- **メール通知の最終文面確定**: `.kiro/specs/notifications/` 側の §5.6 / §5.7 で本 spec 完了後に決定する。本 spec はその前提となるロジックを整備するに留める。
- **代理メッセージ通数上限（年36通 / 年300通）のシステム制御**: 引き続き運用管理。本 spec では扱わない。
- **`users.role` enum の再設計 / マルチロールモデル化**: 1 ユーザー 1 ロールの現行モデルを維持する。N 法人兼任は `organization_members` の N:N で表現する。
- **退会済み代理スタッフの「復活」UI**: 退会フローは現状通り。N 法人兼任時の global 退会判定だけ Requirement 3 でスコープ調整する。
- **ビジ友運営スタッフの退職時に全組織から一括削除する UI / Server Action**: レアケースのため運営側で SQL 運用（`users.deleted_at` をセット + 全 `organization_members` 行を削除する手動 SQL）。Requirement 10 と同様の YAGNI 方針。
- **CLI-022 担当者一覧で「他組織でも代理在籍中」バッジを表示する機能**: プライバシー優先のため不採用。法人 B の Owner が見たとき、田中さんが法人 A / C でも代理在籍中かどうかは表示しない（情報露呈を防ぐ）。
- **代理アカウントの Owner 強制メールアドレス変更時の他組織への波及警告ダイアログ**: 代理スタッフのメールアドレス変更は本人実施が前提で、Owner からの強制変更は実運用で発生しない想定のため不採用。
- **代理スタッフ引き継ぎ用の名前 / メールアドレス上書き機能**: 不採用。代理担当者が田中太郎 → 鈴木次郎へ引き継がれる場合は、`users` 行を上書きするのではなく **「旧担当者を全組織から削除 → 新担当者を各組織に新規招待」** で実現する（既存の R3 削除フロー + R2 既存ユーザー再利用パスで成立）。理由:
  - `users` 行の名前 / メアドを直接書き換えると、過去メッセージの送信者表示が新担当者の名前に変わってしまい **履歴改竄に相当する**
  - `audit_logs.actor_id` も同じ user_id を参照しているため、過去操作が新担当者のものとして記録されてしまう
  - 法人 Owner に予告なく担当者名が変わるため信頼性を損ねる
  - 受注者側には代理スタッフの個人名は元々見えない（送信者表示は企業名のみ）ため、引き継ぎは受注者から見て透明化される。発注者側にとっても「田中太郎（退会済み）」→「鈴木次郎」の履歴が残るほうが業務記録として正しい

## 参照

- 引き継ぎ資料: `.kiro/specs/notifications/proxy-account-multi-org-handoff.md`
- メール通知 WIP: `.kiro/specs/notifications/email-decisions-wip.md`
- 関連 CLAUDE.md セクション: 「Staff ユーザーの subscription 参照」「ロール設計と画面アクセス」「代理メッセージ（`is_proxy`）の仕組み」「Supabase Auth の session cookie とリダイレクトループ対策」
- 関連 spec: `.kiro/specs/organization/`（組織モデル全般）、`.kiro/specs/billing/`（subscription lifecycle）
