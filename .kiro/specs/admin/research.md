# Research & Design Decisions — admin

## Summary
- **Feature**: `admin`
- **Discovery Scope**: Extension（既存 admin シェル＋全ドメインの既存資産への水平展開。新規外部依存なし）
- **Key Findings**:
  - `handle_new_user` トリガーは `raw_user_meta_data` の `invited_last_name` / `invited_first_name` を読んで `public.users` に氏名をセットする（`invited_role` は `'staff'` のみホワイトリスト、それ以外は contractor フォールバック）。ADM-006/007 の招待は **metadata だけで氏名セットが完結**し、会社名も `invited_company_name` キーで metadata 保持できる
  - 両者の評価が揃うと `applications.status` は `completed` / `lost` へ自動遷移する（`src/app/(authenticated)/applications/actions.ts:199` / `:588`）。したがって **ADM-013 の 8分類は status＋初回稼働日＋cancelled_by のみで決定でき、評価テーブルの join なしに完全サーバー側フィルタが可能**（CLAUDE.md「検索フィルタはサーバー側で適用」ルールに適合）
  - 代理メッセージスレッドの抽出（`messages.is_proxy = true` を含む thread の distinct）は PostgREST 1000件上限を踏みうるため、**DB ビュー（集約済み）を新設**して `.range()` ページングする

## Research Log

### 既存 admin 実装（users パターン）の現状
- **Context**: ADM-008/009/010/010B は video-display spec で「最小サーフェス」実装済み。新画面はこのパターンを踏襲する方針（requirements 既定）
- **Sources Consulted**: `src/app/admin/layout.tsx` / `users/page.tsx` / `users/filters.tsx` / `users/[id]/page.tsx` / `actions.ts`
- **Findings**:
  - layout.tsx:32 で `role !== 'admin'` → `/login` redirect の二重ガード（middleware + layout）
  - users/page.tsx: `PAGE_SIZE = 20`、ilike キーワード検索、option_subscriptions → user_ids → `.in("id", ...)` の ID 集合パターン、searchParams SSOT の `pageHref()`
  - 現実装の ADM-008 は role 無絞り（staff/admin も出る）＋オプションフィルタ4択 → 本 spec で `role IN ('contractor','client')`＋3択に修正（requirements 確定済み）
  - Server Action は role 再チェック → Zod 検証 → admin client 更新 → revalidate の順（`updateVideoColumn()` ヘルパー）
- **Implications**: 全一覧画面（ADM-003/011/013/016/018/020/023）はこのパターンの複製で設計する。新規アーキテクチャ要素は不要

### 招待フローの実現方法（ADM-006/007）
- **Context**: requirements REQ-ADM-007 で「会社名の一時保持方法は design で決定（保留レコード or user_metadata）」と委譲されていた
- **Sources Consulted**: `supabase/migrations/20260419100800_handle_new_user_invite_metadata.sql`、`src/app/(auth)/accept-invite/confirm/actions.ts`、`src/lib/billing/webhook/handle-checkout-completed.ts`、`.kiro/steering/authentication.md`（招待・password_set_at）
- **Findings**:
  - トリガーは `invited_role` / `invited_last_name` / `invited_first_name` の3キーのみ参照。`invited_role` は `'staff'` のみ受理（ホワイトリスト）。未知キーは無害
  - `inviteUserByEmail(email, { data: {...}, redirectTo })` の `data` が `raw_user_meta_data` になる → 氏名セット（middleware の登録完了判定対策）はトリガー任せにできる
  - `acceptInviteAction` がパスワード保存成功時に `users.password_set_at = now()` をセット（招待中バッジ判定に使用）。完了後のリダイレクト先はここで分岐可能
  - plan checkout の Webhook は TS ラッパー（`handle-checkout-completed.ts`）→ RPC `handle_checkout_completed_plan` の構造。TS 側に後処理を足せる
- **Implications**: 新テーブル不要。`invited_company_name` を user_metadata に保持 → Webhook TS 側で `auth.admin.getUserById()` から読んで `client_profiles.display_name` に反映（display_name 未設定時のみ＝冪等）。招待の監査は audit_logs（action='admin_client_invite'）で担保

### ADM-013 8分類のサーバー側判定可能性
- **Context**: CLAUDE.md は一覧フィルタの post-filter を禁止。8分類のうち「評価未入力」が評価テーブル join を要するなら ID 集合積が必要になるところだった
- **Sources Consulted**: `src/app/(authenticated)/applications/actions.ts:180-230`（`mapOperatingStatusToApplicationStatus` による completed/lost 遷移）、CLI-010 の表示カテゴリ実装
- **Findings**: 両者（user_reviews + client_reviews）の評価が揃った時点で status が `completed` / `lost` に UPDATE される。よって `status = 'accepted'` で残存する行は定義上「評価が揃っていない」
- **Implications**: 8分類は `status` ＋ `first_work_date`（当日比較）＋ `cancelled_by` の純粋関数。全分類が PostgREST の WHERE 句で表現でき、count・ページネーションが正確に出る

### contacts テーブルの実カラム（email の有無）
- **Context**: 調査エージェントが「email は 20260525130000 で DROP された」と報告し、requirements（ADM-016 検索・ADM-017 表示にメールアドレスあり）と矛盾した
- **Sources Consulted**: `supabase/migrations/20260525130000_support_contacts_trouble_reports.sql` を直読み
- **Findings**: L65 に `email text NOT NULL` が存在。**email カラムはある**（エージェント報告が誤り）。現カラム: id, user_id(nullable), company_name, name, phone, email, address, inquiry_type, purpose, industry, project_description, project_area, video_consultation, detail, attachments[], created_at
- **Implications**: requirements 記載どおりに設計可能。修正不要

### 代理メッセージスレッドの抽出方法（ADM-023）
- **Context**: 「`is_proxy = true` を1件以上含むスレッドのみ」の抽出。messages から distinct thread_id を引く素朴な実装は、メッセージ件数増で PostgREST 1000件上限（CLAUDE.md 必守ルール）を踏む
- **Sources Consulted**: `supabase/migrations/20260406100000_messaging_scout_status.sql`（message_threads.organization_id 追加＋部分 UNIQUE）、`20260409100000_remove_proxy_sender_id.sql`（proxy_sender_id 廃止確認）
- **Findings**:
  - `message_threads.organization_id` が存在し、組織スレッドは `(organization_id, participant_2_id)` で一意 → participant_2 が受注者
  - `messages.proxy_sender_id` は廃止済み。残るのは `is_proxy boolean` のみ（CLAUDE.md 記載と一致）
- **Implications**: スレッド単位に集約した DB ビュー `admin_proxy_threads`（thread_id, organization_id, contractor_id, last_message_at）を新設し、admin client から `.range()` ページング＋ `.eq('organization_id', ...)` 絞り込みする。authenticated/anon からの SELECT は REVOKE（service_role のみ）

### アカウント削除（ADM-004 / ADM-009）の既存資産
- **Context**: 管理責任者削除＝配下スタッフ連動削除＋Stripe 解約。退会機能（C案）と同一のカスケードが必要
- **Sources Consulted**: `src/app/(authenticated)/profile/withdrawal/actions.ts`（withdrawAction）
- **Findings**: withdrawAction に owner ソフトデリート＋配下メンバー deleted_at 連動＋auth 側ログイン不可化（ban）＋organization ソフトデリート＋organization_members 削除＋DB 上の subscriptions/option_subscriptions の cancelled 化が実装済み。ただし「自分自身の退会」前提で auth.uid()・セッションクライアントに結合している。**Stripe 解約（L243-248）は `// TODO: billing spec 実装後に有効化` の空スタブで未実装**（当初「実装済み」と誤認していたが、設計レビューでコード本体を確認して訂正。2026-06-11）
- **Implications**: 本体カスケードを `executeWithdrawal(targetUserId, opts)` として `src/lib/withdrawal/` に抽出し、退会（本人）と admin 削除（ADM-004/009）の両方が同じ関数を呼ぶ。削除処理の二重実装を避ける（requirements の「削除は ADM-004 に一本化」とも整合）

### その他の確認事項
- **identity-documents / ccus-documents バケット**: `20260325180000_008_storage_buckets.sql` で `public = false`（private）→ `createSignedUrl(path, 3600)` 方式が成立。admin 側の signedUrl 生成の既存実装は無し（新設）
- **identity_verifications**: `(user_id, document_type) WHERE status='pending'` の部分 UNIQUE あり。document_type で「本人確認/CCUS」のラベル判定可。`reviewed_by` / `reviewed_at` / `rejection_reason` カラム既設
- **audit_logs**: 既設（actor_id, action, target_type, target_id, metadata jsonb, ip_address）。`writeAuditLog` ヘルパーが `src/app/(auth)/login/actions.ts:23` にあるが auth 配下に閉じている → 共有ヘルパーへ抽出
- **評価表示の流用元**: `fetchPerItemSummary` / `fetchOverallSummary`（`src/lib/rating/aggregate.ts`）、`StarRatingDisplay`（`src/components/shared/star-rating-display.tsx`）、コメント20件送りは `/users/[id]/reviews/page.tsx` がインライン実装（COMMENTS_PER_PAGE=20）
- **発注者評判**: `fetchClientReputation(supabase, scope)`（`src/lib/client-review/aggregate.ts`）。scope は `{kind:'organization', organizationId}` | `{kind:'individual', clientUserId}` の判別共用体
- **メール**: Resend ＋ dev フォールバック（`src/lib/email/send-email.ts`）。identity 系テンプレは未存在 → 承認/否認の2本新設。失敗時はロールバックしない（security.md 共通方針）
- **日時フォーマット**: `formatDate`（YYYY/MM/DD）はあるが時刻付き `YYYY/MM/DD HH:mm` は無し → `formatDateTime` 新設
- **middleware**: `isAdminRoute()` = `pathname.startsWith("/admin")`。未認証の /admin/* は `/login` へ。`/admin/login` の未認証許可例外は存在しない → 追加が必要
- **seed**: admin ユーザー既設（`admin@test.local` / `44444444-...`）
- **キャンセル5日前ルール**: `cancelApplicationAction`（`src/app/(authenticated)/applications/actions.ts:92-103`）。cancelled_by の書き込み追加対象
- **CLI-026**: `/billing/plans`（`src/app/(authenticated)/billing/plans/page.tsx`）

### 設計レビュー（adversarial review）での重要発見 3 件（2026-06-11・design.md 反映済み）
- **Context**: design.md 初版に対する敵対的レビュー（別エージェント＋コード直読みの二重チェック）で、初版の前提誤りを3件発見した
- **Findings**:
  1. **Stripe 解約は未実装**: withdrawAction L243-248 は TODO スタブ。本人退会でも実際には Stripe 解約されていない既存ギャップがあり、`executeWithdrawal` で解約 API を新規実装する（design 反映済み）
  2. **RPC が display_name を姓名で必ず埋める**: `handle_checkout_completed_plan`（migration 20260411100100 L177-183）は `ON CONFLICT DO NOTHING` 付きで display_name=姓名を INSERT する。招待の会社名反映は「RPC 後に未設定なら反映」では一度も成立しない → **RPC 前の ignoreDuplicates upsert** 方式に変更（design 反映済み）
  3. **audit_logs は authenticated から INSERT 不可**: RLS は SELECT(admin) のみで INSERT ポリシーなし（service_role 専用設計）。既存 `writeAuditLog`（login/actions.ts）はセッションクライアントで INSERT しており**現在も全件サイレント失敗している既存バグ**。共有ヘルパーは `createAdminClient()` で INSERT する（design 反映済み）
- **Implications**: 3件とも「実装してもテストが通ったように見えるのに要件未達」になる種類の問題だった。spec-impl 時は本セクションの3点を必ず参照すること

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| users パターン水平展開（採用） | createAdminClient + サーバー側フィルタ + 20件ページング + searchParams SSOT を全一覧に複製 | 実績あり・レビュー容易・既存テスト資産流用 | 画面数が多く反復コードが増える | 共有部品（ページング・フィルタバー・日時表示）を抽出して反復を抑える |
| admin 専用 API レイヤ新設 | /api/admin/* に REST を切る | UI/データ分離 | RSC 直接フェッチの既存方針に反する。YAGNI | 不採用 |
| 発注者画面の流用（ADM-022 等） | CLI-001/002/007B に admin 分岐を追加 | 画面実装の節約 | RLS スコープが根本的に別物。有料画面への回帰リスク | requirements で案B（admin 専用 read-only）確定済み・不採用 |

## Design Decisions

### Decision: 招待時の会社名保持は auth user_metadata（保留テーブルは作らない）
- **Context**: ADM-007 で入力された会社名を、本人の決済完了（Webhook）まで保持し `client_profiles.display_name` に反映する必要がある
- **Alternatives Considered**:
  1. 招待保留テーブル（admin_invitations）新設 — 明示的・SQL から参照しやすいが、テーブル・RLS・クリーンアップの管理が増える
  2. auth `user_metadata`（`invited_company_name`）— inviteUserByEmail の `data` で渡すだけ。追加スキーマ不要
- **Selected Approach**: user_metadata。`inviteUserByEmail(email, { data: { invited_last_name, invited_first_name, invited_company_name } })`。氏名はトリガーが users へセット、会社名は Webhook の TS ラッパーが `getUserById()` で読み display_name 未設定時のみ反映
- **Rationale**: `handle_new_user` が既に invited_* メタデータ規約を持ち、ホワイトリスト方式で未知キーに安全。新テーブル＋RLS＋pgTAP の追加コストを回避できる
- **Trade-offs**: SQL だけで「招待済み一覧」を出すのが面倒（auth.users の jsonb 参照になる）。招待の記録・監査は audit_logs（action='admin_client_invite'、metadata に company_name/email）で補完する
- **Follow-up**: Webhook 反映は display_name が NULL/空のときのみ（冪等・上書き防止）。E2E で「招待→決済→CLI-021 に社名事前反映」を通しで検証

### Decision: ADM-006/007 は 1 ルート内の段階的表示（入力→確認）
- **Context**: 画面 ID は 2 つだが「入力 → 確認 → 送信」の典型フロー
- **Alternatives Considered**: 1. 2 ルート（/new と /new/confirm）で入力値を引き渡す 2. 1 ルートで useState による条件レンダリング
- **Selected Approach**: 1 ルート `/admin/clients/new` 内の条件レンダリング
- **Rationale**: CLAUDE.md「段階的フォーム表示」標準パターン（CLI-009 と同型）。入力値の受け渡し（URL/セッション）が不要になり、戻る操作も state 切替で安全
- **Trade-offs**: URL で確認画面を直リンクできないが、確認画面の直リンクはそもそも不要
- **Follow-up**: 確認画面の「作成する」は `type="submit"`、「修正する」は `type="button"` を明示

### Decision: 8分類は派生分類の純粋関数＋全条件 WHERE 句化（DB には cancelled_by のみ追加）
- **Context**: ADM-013/014 のステータス表示・絞り込み。DB の status は不変という requirements 確定
- **Alternatives Considered**: 1. 評価テーブルを join して「評価未入力」を判定 2. status 遷移（completed/lost 自動化）を前提に status＋日付＋主体のみで判定
- **Selected Approach**: 2。`classifyAdminApplication()` 純粋関数＋分類→WHERE 条件のマッピング表を同一モジュールに置く
- **Rationale**: 両評価が揃うと status が completed/lost に遷移する実装が既にあるため、accepted 残存＝評価未完が保証される。post-filter 禁止ルールを満たし count が正確
- **Trade-offs**: status 遷移ロジックが変わると分類の前提が崩れる（モジュールコメント＋Vitest で前提を固定する）
- **Follow-up**: `cancelled_by` 追加 migration で既存 cancelled 行を 'contractor' にバックフィル。`cancelApplicationAction` への書き込み追加を忘れない

### Decision: 代理メッセージスレッドは DB ビューで集約
- **Context**: 「is_proxy を含むスレッド」の一覧化と最終メッセージ降順ソート・会社絞り込み・20件ページング
- **Alternatives Considered**: 1. messages から thread_id を全件取得して JS で distinct 2. 集約ビュー `admin_proxy_threads`
- **Selected Approach**: 2。`GROUP BY thread_id` で last_message_at を持つビューを migration で作成し、admin client から range ページング
- **Rationale**: 1 は PostgREST 1000件上限で静かに欠落する既知の罠。ビューなら count・ソート・絞り込みが全部 DB 側で完結
- **Trade-offs**: ビューという新規 DB オブジェクトが増える。authenticated からの SELECT を REVOKE して service_role 専用にする運用が必要
- **Follow-up**: pgTAP でビューの権限（一般ユーザーから不可視）を検証

### Decision: アカウント削除は withdrawAction のカスケードを共有ヘルパーへ抽出
- **Context**: ADM-004（管理責任者＝配下連動削除＋Stripe 解約）と ADM-009（受注者）の削除。既存の退会（本人操作）と同じ処理
- **Selected Approach**: `executeWithdrawal(admin, targetUserId, opts)` を `src/lib/withdrawal/execute.ts` に抽出し、本人退会・admin 削除の両方が呼ぶ
- **Rationale**: requirements「削除処理を二重に作らない」。C案カスケード（配下凍結・auth ban・org ソフトデリート・Stripe 解約）は検証済みロジックであり再実装はリスク
- **Trade-offs**: 既存 withdrawAction のリファクタが入るため、既存の退会 Vitest/E2E の回帰確認が必須
- **Follow-up**: 抽出後に既存テスト全実行（tasks.md タスク0 ルール）。admin 側は退会理由 survey の INSERT をスキップする opts 設計

### Decision: /admin/login の middleware 取り扱い
- **Context**: ADM-001 専用ログインの新設。現状は未認証 /admin/* → /login
- **Selected Approach**: ① `/admin/login` を未認証許可パスに追加 ② 未認証の /admin/*（login 以外）→ `/admin/login` へ redirect ③ 認証済み admin の /admin/login → /admin/dashboard ④ 認証済み非 admin の /admin/* ブロックは現状維持。一般 `/login` の「admin なら /admin/dashboard へ」分岐も現状維持（無害・削除による回帰リスク回避）
- **Rationale**: 一般ユーザーのログインフローに触れず、追加のみで完全分離を実現
- **Follow-up**: middleware ルーティングの Vitest は本体定数を import する（テスト内コピー禁止ルール）

## Risks & Mitigations
- 招待ユーザーが「スキル・対応エリア未登録の contractor/client」という新しい正当な状態を作る（受注者オンボのスキップによる）— CLI-005 等にスキル欄空で表示されるのは許容。CLAUDE.md の「全ユーザー skills 必有」前提（CLI-005/006・seed ルール）への例外追記を tasks に含める
- `formatDateTime` のタイムゾーン — Asia/Tokyo を明示しないと本番（UTC サーバー）で9時間ズレる。設計の契約に timeZone 指定を明記済み
- withdrawAction リファクタによる退会機能の回帰 — 共有ヘルパー抽出後に既存 Vitest / pgTAP / E2E 全実行をタスク0で必須化
- ADM-003 の派生列（区分・プラン・オプション）が多く N+1 になりやすい — 20行ページ単位で契約主体 ID を集めてバッチ取得（client_profiles / subscriptions / option_subscriptions / organization_members 各1クエリ）
- ADM-013 キーワード検索の ID 集合が巨大化すると `.or(in.(...))` の URL 長制限に当たる — 各 ID 集合に上限（1000件）を設け、超過時は絞り込みを促す注記。admin の運用規模では実質問題にならない
- Webhook の display_name 反映が CLI-021 の本人入力と競合 — 「display_name 未設定時のみ反映」の冪等条件で防止
- 8分類の前提（accepted 残存＝評価未完）が将来の status 遷移変更で崩れる — classify モジュールに前提コメント＋遷移ロジック参照を明記し、Vitest で固定

## References
- `.kiro/specs/admin/requirements.md` — 全24画面・ユーザー承認済み（PR#16 / main 915c392）
- `.kiro/specs/job-inquiry/design.md` — 兄弟仕様の設計様式の参照元
- `.kiro/steering/authentication.md` — 招待 implicit flow / password_set_at / admin 分離
- `.kiro/steering/security.md` — 監査ログ・メール送信失敗時の共通方針
- memory `project_admin_implementation_state` — 2026-06-09〜11 の画面別決定ログ
