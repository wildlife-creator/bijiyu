# Research & Design Decisions — email-recycle-on-delete

## Summary

- **Feature**: `email-recycle-on-delete`
- **Discovery Scope**: Extension（既存の `delete_staff_member` / `handle_subscription_lifecycle_deleted` / `executeWithdrawal` フローへの追加処理。新しいライブラリ関数 + RPC 戻り値拡張 + 1 回限りのバックフィル migration）
- **Key Findings**:
  - `public.users.email` は **非 UNIQUE インデックス**（`20260419100200_users_password_set_at_and_email_index.sql:17`）。重複は許容済み。詰まりは `auth.users` の UNIQUE 制約のみ
  - `audit_logs.action` は **`text NOT NULL`（CHECK / ENUM なし）**（`20260324160600_002_core_tables.sql:442`）。新しい action 値（`auth_email_recycled` / `auth_email_recycle_failed` / `auth_email_restored`）を追加するのに migration 不要
  - `handle_subscription_lifecycle_deleted` v2 RPC は `RETURNS jsonb` で `{ subscription_id, user_id }` を返す。**配下メンバーの user_id 配列を返していない**ため、Webhook ハンドラ側で「どの user に印付けすべきか」を知る術がなく、戻り値拡張が必要
  - `delete_staff_member` v2 RPC は `RETURNS void`。**グローバル削除されたか否かを呼び出し元 Server Action に返していない**ため、戻り値型を `jsonb` に拡張する必要あり
  - Webhook handler は `src/lib/billing/webhook/handle-subscription-lifecycle.ts:191` で RPC を呼んだ後 `sendCancelledEmail` を実行している。印付け処理はこの間に差し込む
  - **🔴 (validate-design 第 1 ラウンドで発見) `on_auth_user_email_changed` トリガー**（`20260415100000_auth_email_sync_trigger.sql`）は `auth.users.email` の UPDATE を検知して `public.users.email` を自動同期する。本機能で印付け UPDATE を行うと **このトリガーが起動して `public.users.email` も印付き形式に書き換わる** → Req 1.6 / 6.1 違反。`handle_user_email_change` 関数本体を「印付きパターンへの変更はスキップ」するよう更新する必要あり
  - **🔴 (validate-design 第 1 ラウンドで発見) `resolveExistingProxyReuse` の `.maybeSingle()`** は 1 行前提。本機能で「同 email の deleted 行 + active 行が並存」が可能になるため multi-row エラーで `data=null` 返却 → `new_user` 誤判定 → `inviteUserByEmail` 失敗で UX 崩壊。検索クエリに `.is("deleted_at", null)` 1 行追加で解決
  - **🟠 (validate-design 第 2 ラウンドで発見) `handle_user_email_change` v1 に `SET search_path = public` が欠落**。CLAUDE.md SECURITY DEFINER ルール違反。過去 `handle_new_user` で同種の欠落により招待フロー全体が「Database error saving new user」で停止した経緯あり。v2 化のタイミングで同時補修
  - **🟡 (validate-design 第 2 ラウンドで発見) バックフィル migration vs forward 経路の race**: 同一ユーザーへの並行 UPDATE で row-level lock 競合 → 稀に timeout。投入を低トラフィック帯に推奨する運用注を spec に明記
  - **🟡 (validate-design 第 2 ラウンドで発見) `restoreDeletedSuffix` の失敗ケースが audit_logs に残らない非対称**: `applyDeletedSuffix` 側は `auth_email_recycle_failed` で失敗記録するのに対し、復活側は成功のみ記録していた。`auth_email_restore_failed` を 4 番目の action として追加
  - **🔴 (tasks レビュー第 1 ラウンドで発見) バックフィル SQL の md5 4 文字（16^4=65,536）で 1000 件規模衝突確実**: `auth.users.email` UNIQUE 制約により migration 全体が rollback。8 文字（16^8≈43 億）に拡張して衝突確率を実質ゼロに。SUFFIX_PATTERN は `{4,}` で forward 4 文字 / バックフィル 8 文字を両対応
  - **🟠 (tasks レビュー第 1 ラウンドで発見) 新規 migration の timestamp が末尾固定 grant migration `20260617120000` より後ろに来る**: `project_supabase_db_reset_grant_loss` 対策が無効化される。新規 4 件は `20260617110000`〜`20260617110300` 系列（6/17 11:xx）に配置して grant migration を末尾に維持
  - **🟡 (tasks レビュー第 1 ラウンドで発見) admin API 呼び出しに `email_confirm: true` 明示が tasks に未記載**: design には記載済みだが tasks の detail bullet から漏れていた。デフォルト動作だと印付き架空アドレスに確認メールが飛び bounce 発生 → 配信信頼度低下。Task 1.1 に明示
  - **🔴 (tasks レビュー第 2 ラウンドで発見) Task 6 が内部矛盾**: 「SELECT から deleted_at 除去」と「Step 3 で deleted_at をチェック」が同時指示されており、TS コンパイル失敗確実。SELECT 列を既存維持に変更（フィルタ追加のみ、Step 3 は防御コードとして維持）
  - **🔴 (tasks レビュー第 2 ラウンドで発見) Task 2.1 / restoreDeletedSuffix の email_collision 検出方法が未指定**: 実装者が listUsers 全列挙 / auth スキーマ直接 SQL を選ぶと性能・権限で破綻。`updateUserById` 試行 + `email_exists` エラー catch パターンを明示
  - **🟠 (tasks レビュー第 2 ラウンドで発見) Task 7 で TypeScript 型キャスト未言及**: `supabase gen types` 後の `data` は `Json | null` 型のため `.globally_deleted` プロパティアクセスが型エラー。Task 8 では `as string[]` で明示されているのに Task 7 だけ漏れていた非対称。Task 7 にもキャスト例を明示
  - **🔴 (最終確認レビューで発見) requirements.md Req 7.5 が `{4}` 厳密一致のまま**: 他全ての箇所が `{4,}` に更新されたのに Req 7.5 のみ未更新で、バックフィル経路で印付けされた 8 文字 suffix ユーザーの復活が永遠に拒否される実バグ。`{4,}` に統一
  - **🟠 (最終確認レビューで発見) design.md 内に `{4}` 表記が 3 箇所残存**: L452 (Intent セル), L457 (条件説明), L467 (API Contract 表) が `{4}` で、同 design.md L476 の Function Signature の `{4,}` と矛盾。実装に直接影響しないが文書信頼性を下げるため統一
  - **🟡 (最終確認レビューで発見) EmailRestoredMetadata だけ date フィールド欠落**: 他 3 種 metadata (recycled / recycle_failed / restore_failed) が `date` を持つのに restored だけ持たず非対称。運営の SQL 集計時に `metadata->>'date'` が NULL になる行が発生。`{ invoked_by, date }` に統一

## Research Log

### Topic 1: 既存削除フローの仕組み確認

- **Context**: 3 経路（個別 staff 削除 / 解約連鎖 / 本人退会）すべてで `public.users.deleted_at` がセットされる場所を把握し、印付け呼び出しを差し込む位置を確定する。
- **Sources Consulted**:
  - `supabase/migrations/20260616130000_delete_staff_member_v2.sql`
  - `supabase/migrations/20260616130100_handle_subscription_lifecycle_deleted_v2.sql`
  - `src/lib/withdrawal/execute.ts`
  - `src/lib/billing/webhook/handle-subscription-lifecycle.ts`
  - `src/app/(authenticated)/mypage/members/actions.ts`
- **Findings**:
  - 経路 1（`delete_staff_member` v2）: RPC 内部で `FOR UPDATE` ロック → org 行削除 → `count` 判定 → `deleted_at` セット。呼び出し元 = `deleteMemberAction` (Server Action)
  - 経路 2（`handle_subscription_lifecycle_deleted` v2）: RPC 内部でループ → 各メンバー行削除 → `count` 判定 → `deleted_at` セット。呼び出し元 = `handleSubscriptionDeleted`（Webhook handler）
  - 経路 3（`executeWithdrawal`）: TypeScript 内で `users.update({ deleted_at })` 直叩き（RPC ではない）。配下 Admin / Staff も同 TypeScript 内で一括更新
- **Implications**:
  - 経路 1: RPC 戻り値拡張 + 呼び出し元 Server Action で印付け呼び出し
  - 経路 2: RPC 戻り値拡張（user_id[] 返却）+ Webhook handler で印付け呼び出し
  - 経路 3: RPC 不要。`executeWithdrawal` 内に印付け呼び出しを差し込むだけ

### Topic 2: Supabase Auth Admin API での email 更新挙動

- **Context**: `admin.auth.admin.updateUserById(userId, { email: ... })` で `auth.users.email` を書き換える挙動と副作用を確認する。
- **Sources Consulted**: `src/lib/withdrawal/execute.ts:271`（既存 ban 設定で `updateUserById` を使用）、`.kiro/steering/authentication.md`（メール変更フロー）
- **Findings**:
  - 既存コードでも `admin.auth.admin.updateUserById(..., { ban_duration })` を使用しており、admin API 経由の更新は確立されたパターン
  - `email_confirm` フラグ無指定だと「未確認状態」になりうる。印付け email は実在しないアドレスで送信先にもならないため `email_confirm: true` を明示する（確認メール送信を抑止）
  - `auth.users.email` の UNIQUE 制約は admin API 呼び出しでも有効。新メール（印付き）が他行と衝突すれば admin API が 422 エラーを返す
- **Implications**:
  - 印付けは `updateUserById(targetUserId, { email: suffixedEmail, email_confirm: true })` の形で実装
  - 衝突時のリトライは admin API レベルで例外をキャッチして別 random 値を試す形

### Topic 3: ランダム 4 文字の衝突確率

- **Context**: 同一 user を 2 回削除（救済で復活 → 再削除）した際の suffix 衝突を避けるための乱数長を検証する。
- **Findings**:
  - 4 文字（小文字英数 36^4 = 約 168 万通り）。同日の同人物再削除でも衝突確率は 1/168 万
  - Birthday paradox: 100 人を同日に削除して衝突する確率 ≈ 0.3%。実運用では十分余裕
  - リトライ最大 3 回まで実装すれば実質衝突 0 に近い
- **Implications**: 4 文字 + 最大 3 回リトライを採用

### Topic 4: バックフィル方式の選択

- **Context**: 本機能投入前にすでに `public.users.deleted_at IS NOT NULL` の user について、`auth.users.email` の印付けをどう一括処理するか。
- **Alternatives Considered**:
  1. SQL migration で `auth.users` を直接 UPDATE
  2. Node.js スクリプトで admin API 経由ループ
- **Findings**:
  - `auth.users` は通常の PostgreSQL テーブルで直接 UPDATE 可能。`auth.identities` / `auth.audit_log_entries` 等の関連テーブルへの副作用は本ケース（削除済み user に対する email 書き換え）ではほぼない（削除済み user は既にログイン不可で identities への影響なし）
  - SQL migration なら atomic + 件数 NOTICE 出力 + 冪等性が容易
  - Node.js スクリプトは「forward 経路と同じ admin API を使う」一貫性メリットがあるが、本番投入時に別途実行が必要で運用負荷増
- **Selected Approach**: SQL migration を採用。`auth.users.email LIKE 'deleted-________-____-%'` の NOT 条件で既に suffix 済みを除外、`substring(md5(random()::text || id::text), 1, 4)` で行ごとに独立した乱数を生成
- **Rationale**: 削除済み user は認証セッションを持たない（GoTrue 経由の認証フローに影響しない）ため、直接 UPDATE で問題ない。実装・運用ともに最小
- **Trade-offs**: 万一 auth.users の内部仕様変更（将来 Supabase Auth がメール変更に追加トリガを要求等）があった場合は forward 経路と挙動が分かれる可能性。リスクは低く、回避できれば SQL migration の方が望ましい

### Topic 5: 印付け関数の呼び出し位置とエラー隔離

- **Context**: 印付けが失敗した場合に、上位の削除処理（既に commit 済み）の整合性をどう保つか。
- **Findings**:
  - 経路 1（RPC 後 Server Action）: RPC は別 transaction で commit 済み。印付け失敗時は `console.error` + 削除自体は成功扱いで返す。後追いリトライは Requirement 10.4 のライブラリ関数経由
  - 経路 2（Webhook handler 後）: Webhook 全体は `withWebhookIdempotency` でラップ済み。印付け失敗時は throw すると Webhook 全体が再試行される → 既に RPC が commit 済みなので冪等性的に安全。ただし `sendCancelledEmail` を二重送信しないようロジック調整が必要。**簡潔さ優先で、印付けは `try { ... } catch { console.error }` で隔離し、Webhook は成功扱いで返す**（後追いリトライ可）
  - 経路 3（`executeWithdrawal` 後）: 既存の Stripe 解約も `try / catch` で「失敗してもブロックしない」パターン。これに合わせる
- **Implications**: 全 3 経路で印付けは「ベストエフォート」（失敗してもデータ整合性は維持、運営に通知して後追いで再実行）

### Topic 6: 復活処理の admin context 不在

- **Context**: 救済処理を Server Action ではなく `src/lib/email-recycle/` 配下のライブラリ関数として実装すると決まったが、認可ロジックはどうするか。
- **Findings**:
  - ライブラリ関数は引数で `admin: SupabaseClient<Database>` を受け取る形にする
  - 呼び出し側（一回限りスクリプト / Node REPL）が `createAdminClient()`（Service Role Key 使用）を渡すことで暗黙的に「Service Role 権限で実行」される
  - 関数自体に `users.role = 'admin'` の DB チェックは入れない（DB ロールが session を持たない直接実行のため判定不能。スクリプトの呼び出し制御で代替）
  - 関数の TSDoc に「危険・運用注意」を明記し、ファイル冒頭にも警告コメント
- **Selected Approach**: 認可は呼び出し側に委ねる（Service Role Key を持つ環境からのみ実行可能であるという制約で代替）。関数本体は idempotent / validation を厳格化（既に印付きでない / 別 user と衝突しない等）

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 案 A: auth.users 物理削除 + CASCADE | `auth.users` 行を消す | DB が綺麗 | `public.users` も連鎖削除 → messages.sender_id 等の参照が全て切れて履歴消失 | **不採用**（Phase 5 の soft-delete 設計と矛盾） |
| 案 B: suffix リネーム | `auth.users.email` を `deleted-YYYYMMDD-rand-orig` に書き換え | 履歴維持、空き席解放、可逆 | suffix 衝突対策が必要（4 文字乱数で十分） | **採用** |
| 案 C: 運営手動 SQL | 手順書 + 運営作業 | コード変更不要 | スケールしない、操作ミスで CASCADE 巻き込み事故あり | **不採用**（過渡的にも併用不要、本 spec で B を投入） |
| 案 D: 凍結方式の復活 | `is_active = false` で凍結、再アップグレードで復活 | 履歴ごと復活する親切体験 | Phase 5 で削除済み。代理 N 法人兼任モデルと両立しない | **不採用** |

## Design Decisions

### Decision: 印付けは「ライブラリ関数 + 各呼び出し元での明示呼び出し」方式

- **Context**: 印付け処理を「RPC 内部に埋め込む」「DB トリガで自動発火」「呼び出し元で明示呼び出し」のどれにするか。
- **Alternatives Considered**:
  1. RPC（`delete_staff_member` v3）内部に印付けを埋め込む → PostgreSQL から `auth.admin.updateUserById` を直接呼べないため不可能
  2. DB トリガで `public.users.deleted_at` の UPDATE を検知して自動発火 → 同じ理由で auth admin API を呼べない
  3. 呼び出し元 Server Action / Webhook handler / `executeWithdrawal` から明示的にライブラリ関数を呼ぶ → 採用
- **Selected Approach**: ライブラリ関数 `applyDeletedSuffix(admin, userId)` を `src/lib/email-recycle/` に実装し、3 経路の呼び出し元から RPC / 既存処理の完了後に明示呼び出し
- **Rationale**: PostgreSQL の SECURITY DEFINER 関数からは Supabase Auth Admin API（HTTP / JS SDK 経由）を呼べない。TS 層で実行する以外の選択肢がない
- **Trade-offs**: 呼び出し元 3 箇所に処理が分散する。テストで 3 経路すべての呼び出しを検証する必要あり
- **Follow-up**: 将来「全削除イベントを 1 箇所で受ける Event Bus」を導入した場合、ライブラリ関数を 1 つのリスナーに集約できる

### Decision: RPC 戻り値の拡張

- **Context**: 呼び出し元が「印付けすべき user_id」を知る手段を提供する。
- **Selected Approach**:
  - `delete_staff_member` v3（`v2` を `CREATE OR REPLACE` で更新）: `RETURNS void` → `RETURNS jsonb` に変更し `{ "globally_deleted": boolean, "user_id": uuid }` を返す
  - `handle_subscription_lifecycle_deleted` v3: 既存戻り値 jsonb に `"globally_deleted_user_ids": uuid[]` フィールドを追加
- **Rationale**: 既存テスト・型定義への影響を最小化（戻り値 jsonb 化は v2 と互換、新フィールドは追加のみ）
- **Trade-offs**: PostgreSQL の RPC 戻り値拡張は型生成（`supabase gen types`）の再実行が必要

### Decision: バックフィルは SQL migration で実施

- **Context**: 本機能投入前にすでに削除済みの user の auth.users.email を一括で印付ける必要がある。
- **Selected Approach**: 新規 migration `XXX_email_recycle_backfill.sql` で `UPDATE auth.users SET email = ...` を実行（詳細は Topic 4 参照）
- **Rationale**: 削除済み user は認証フローに乗らないため、admin API 経由でなく直接 SQL UPDATE で安全。1 回限り migration として完結する
- **Trade-offs**: 将来 Supabase Auth の内部仕様変更で直接 UPDATE が非推奨化する可能性。リスクは低い

### Decision: 復活関数は Server Action として export しない

- **Context**: ユーザー要望「運営含めて UI で実装する予定はない」を反映する。
- **Selected Approach**: `src/lib/email-recycle/restore-deleted-suffix.ts` にライブラリ関数として実装。Next.js Server Action（`'use server'`）としては export しない
- **Rationale**: UI 経由の経路を作らないことで「誤って admin が呼んでしまう」事故を防ぐ。Service Role Key を持つ環境からのみ呼び出し可能
- **Trade-offs**: 将来 UI が必要になった際は薄い Server Action ラッパーを別途追加すれば対応可（本体ロジックはそのまま再利用）

## Risks & Mitigations

- **Risk 1**: 印付け失敗時に削除自体は成功している状態が残り、再招待が詰まる
  - **Mitigation**: ライブラリ関数を 1 引数（user_id）で再実行可能な形で公開。運営に「印付け失敗 user 一覧」を ADM 画面（既存）で確認できる導線を残す（本 spec では Server Action 化しないが、`audit_logs` の失敗ログから admin が判別可能）
- **Risk 2**: 同一 user の並行削除トランザクションで印付けが二重発火する
  - **Mitigation**: ライブラリ関数の冒頭で「既に印付き済みなら no-op」判定（`SUFFIX_PATTERN` での前方一致チェック）。`delete_staff_member` v2 の `FOR UPDATE` ロックでさらに直列化される
- **Risk 3**: ランダム 4 文字が他の有効 email と衝突
  - **Mitigation**: API 呼び出しが 422 エラーで返ったら別乱数で最大 3 回リトライ。失敗時はログ + skip（運営の手動対応）
- **Risk 4**: `auth.users.email` の直接 UPDATE（バックフィル）が将来の Supabase 仕様変更で破壊される
  - **Mitigation**: バックフィル migration は 1 回限り。投入後は forward 経路（admin API 経由）のみで運用するため将来影響は最小

## References

- `.kiro/specs/proxy-account-multi-org-support/requirements.md` — 物理削除モデルへの切替経緯
- `.kiro/specs/notifications/email-decisions-wip.md` — 将来 spec 候補 S-01 元発見メモ
- `supabase/migrations/20260616130000_delete_staff_member_v2.sql` — 経路 1 / 2 の RPC v2 実装
- `supabase/migrations/20260616130100_handle_subscription_lifecycle_deleted_v2.sql` — 経路 2 の解約連鎖実装
- `src/lib/withdrawal/execute.ts` — 経路 3 の本人退会実装
- `src/lib/organization/resolve-existing-proxy-reuse.ts` — N 法人兼任の判定ヘルパー（変更しない既存実装）
