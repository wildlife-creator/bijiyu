# Implementation Plan — email-recycle-on-delete

本 spec を 13 タスクに分解する。Phase 1（ライブラリ）と Phase 2（DB 更新）は並行実行可能、Phase 3（呼び出し元統合）も互いに独立した 3 ファイルを触るため並行実行可能。バックフィルは Phase 2 のトリガー v2 投入後であれば Phase 3 と並行可。最終 E2E と回帰確認は全工程後の直列実行とする。

`(P)` マーカーは「他の `(P)` マーカー付きタスクと並行実行可能」を意味する。並行可能の根拠：(1) 異なるファイル / migration を編集する、(2) 互いの戻り値・状態に依存しない、(3) 共通シードに対する破壊的変更を行わない。

## Migration timestamp 配置ルール（必須）

末尾固定 migration `20260617120000_grant_public_schema_to_supabase_roles.sql`（`project_supabase_db_reset_grant_loss` 対策）を末尾に保つため、新規 migration は **すべて `20260617120000` より前**（具体的には `20260617110000`〜`20260617110300` 系列）に配置する。直近の既存 migration は `20260616140000_lifecycle_v2_data_migration.sql` なので、その後ろの空白帯（6/17 11:xx）を本 spec が利用する。

| Task | Migration ファイル名 |
|---|---|
| Task 3 | `20260617110000_auth_email_sync_trigger_v2.sql` |
| Task 4 | `20260617110100_delete_staff_member_v3.sql` |
| Task 5 | `20260617110200_handle_subscription_lifecycle_deleted_v3.sql` |
| Task 10 | `20260617110300_email_recycle_backfill.sql` |

## SUFFIX_PATTERN（共通定数）

3 経路（applyDeletedSuffix / restoreDeletedSuffix / handle_user_email_change v2）と Task 10（バックフィル）の **すべてが共通の検出パターン** を使う：

```
^deleted-\d{8}-[a-z0-9]{4,}-
```

`{4}` ではなく **`{4,}`**（4 文字以上）にする理由：forward 経路は 4 文字、バックフィルは 8 文字を使うため、両方を検出できる必要がある。元 email 復元時のキャプチャは `^deleted-\d{8}-[a-z0-9]+-(.+@.+)$` のように貪欲マッチで両長さに対応する。

---

- [x] 0. ベースライン回帰確認（全タスク着手前の必須ステップ）
  - `npm run test`（Vitest）/ `supabase test db`（pgTAP）/ `npm run test:e2e`（Playwright）を順に実行し、全てが PASS することを確認する
  - 失敗があれば、本 spec のタスクに着手せず、まず失敗の原因を調査・修正する
  - 着手前と着手後の差分が「本 spec 由来のテスト変更のみ」であることを確認するためのスナップショット
  - _Requirements: 12.1, 12.2, 12.3_

- [x] 1. (P) `applyDeletedSuffix` ライブラリ関数を実装
- [x] 1.1 (P) 印付け本体ロジックを実装
  - `src/lib/email-recycle/apply-deleted-suffix.ts` を新規作成
  - 引数で受け取った admin client を使い、対象 user の auth email を取得して印付け形式に書き換える
  - 印付け形式：`deleted-{YYYYMMDD UTC}-{ランダム4文字 [a-z0-9]}-{元のローカル部}@{元のドメイン}`（forward 経路は **4 文字**）
  - 既に印付き形式に該当する場合は `already_suffixed` で no-op を返す（冪等性）。判定パターンは `^deleted-\d{8}-[a-z0-9]{4,}-` （`{4,}` 必須、バックフィルの 8 文字も検出するため）
  - 元 email が `@` を含まない不正形式の場合は `skipped/invalid_format` を返す
  - 衝突時は別ランダム値で最大 3 回までリトライ、それでも失敗なら `skipped/max_retries_exceeded`
  - admin API 例外時は `failed/api_error` を返す（throw しない）
  - **admin API 呼び出しは `admin.auth.admin.updateUserById(userId, { email: suffixedEmail, email_confirm: true })` 形式とし、`email_confirm: true` を必ず付与する**（印付き email は実在しない架空アドレスのため確認メール送信を抑止、bounce による配信信頼度低下を防止）
  - 戻り値型は discriminated union（`applied` / `already_suffixed` / `skipped` / `failed`）
  - _Requirements: 1.1, 1.3, 1.6, 2.2, 3.1, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 10.1_
- [x] 1.2 (P) 監査ログの成功・失敗記録を実装
  - 成功（`applied`）時に `audit_logs` に `action='auth_email_recycled'`, `target_type='user'`, `target_id=対象 user id`, `actor_id=options.actorId`, `metadata = { path, date }` を 1 件 insert
  - 失敗・スキップ（`failed` / `skipped`）時に `audit_logs` に `action='auth_email_recycle_failed'`, `target_id=対象 user id`, `actor_id=options.actorId`, `metadata = { path, reason, date }` を 1 件 insert
  - 元 email の値は metadata に含めない（個人情報二重保存回避）
  - _Requirements: 1.4, 9.1, 9.2, 9.3, 9.4, 10.5_
- [x] 1.3 (P) Vitest ユニットテストを追加
  - 正常系：印付け成功 + audit_logs insert を mock で検証
  - 冪等性：既印付き user 入力で no-op + audit_logs insert なし
  - リトライ：1 回目衝突 → 2 回目成功
  - リトライ上限：3 回連続衝突 → `skipped/max_retries_exceeded` + audit_logs に失敗記録
  - admin API 例外：`failed/api_error` + audit_logs に失敗記録
  - Supabase mock は `{ data, error }` 形を正確に再現する（CLAUDE.md ルール準拠）
  - 各テスト前に `mockReset` で once queue をクリア（CLAUDE.md ルール準拠）
  - _Requirements: 12.2_

- [x] 2. (P) `restoreDeletedSuffix` ライブラリ関数を実装
- [x] 2.1 (P) 復活本体ロジックを実装
  - `src/lib/email-recycle/restore-deleted-suffix.ts` を新規作成
  - 対象 user の auth email を取得 → 印付き形式かを判定 → 原本 email に戻す
  - 印付き形式の検出パターンは applyDeletedSuffix と共通：`^deleted-\d{8}-[a-z0-9]{4,}-`（`{4,}` でバックフィルの 8 文字も対応）
  - 元 email の抽出は `^deleted-\d{8}-[a-z0-9]+-(.+@.+)$` の貪欲マッチで 4 / 8 文字両対応
  - 原本 email が現在 auth.users 上で別 active user に取られている場合は `rejected/email_collision`
  - **email_collision の検出方法（明示）**：`admin.auth.admin.updateUserById(userId, { email: originalEmail, email_confirm: true })` を直接試行し、戻り値の `error` が UNIQUE 違反（Supabase Auth では code `'email_exists'`、HTTP 422 相当）の場合のみ `rejected/email_collision` を返す。事前検索（`listUsers()` で全 user 列挙、`auth` スキーマへの直接 SQL 等）は **採用しない**（性能・権限の観点で不適切）
  - 対象 user の auth email が印付き形式に合致しない場合は `rejected/not_suffixed`
  - 対象 user が auth.users に存在しない場合は `rejected/user_not_found`
  - `public.users.deleted_at` を NULL に戻す
  - `auth.users.ban_duration` が設定されていれば `'none'` 相当で解除
  - 戻り値型は discriminated union（`restored` / `rejected` / `failed`）
  - 関数 TSDoc に「危険・運用注意」「fresh start を巻き戻す」「呼び出し前に対象 user の状態確認」を明記
  - Next.js Server Action として export しない（`'use server'` を付けない）
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7, 7.8, 7.9_
- [x] 2.2 (P) 監査ログの成功・失敗記録を実装
  - 成功時に `audit_logs` に `action='auth_email_restored'`, `target_type='user'`, `target_id=対象 user id`, `actor_id=NULL`, `metadata = { invoked_by: 'developer', date: 'YYYY-MM-DD' }` を 1 件 insert（**date は他 3 種 metadata との対称性のため必須**、運営の SQL 集計を簡素化）
  - 失敗時に `audit_logs` に `action='auth_email_restore_failed'`, `target_type='user'`, `target_id=対象 user id`, `actor_id=NULL`, `metadata = { invoked_by: 'developer', reason, date: 'YYYY-MM-DD' }` を 1 件 insert（applyDeletedSuffix の失敗ログと対称）
  - _Requirements: 7.6, 7.10, 9.1, 9.2, 9.3_
- [x] 2.3 (P) Vitest ユニットテストを追加
  - 正常系：印剥がし成功 + deleted_at クリア + ban 解除 + audit_logs に `auth_email_restored` 記録
  - email_collision：原本 email が別 active user に取られている → `rejected/email_collision` + 失敗 audit
  - not_suffixed：印付き形式でない user → `rejected/not_suffixed` + 失敗 audit
  - user_not_found：存在しない user_id → `rejected/user_not_found` + 失敗 audit
  - admin API 例外：`failed/api_error` + 失敗 audit
  - _Requirements: 12.2_

- [x] 3. (P) `handle_user_email_change` v2 トリガー関数を更新
  - 新規 migration `20260617110000_auth_email_sync_trigger_v2.sql` を作成（grant migration `20260617120000` より前）
  - `CREATE OR REPLACE FUNCTION handle_user_email_change()` で関数本体を更新
  - 印付きパターン **`^deleted-\d{8}-[a-z0-9]{4,}-`**（`{4,}` で forward 4 文字 / バックフィル 8 文字を両対応）への変更時は `public.users.email` の同期を skip
  - **`SET search_path = public` を必ず付与**（CLAUDE.md SECURITY DEFINER ルール準拠、v1 では欠落していたため同時補修）
  - pgTAP テスト：印付き email（4 文字）への UPDATE で `public.users.email` が変更されない / 印付き email（8 文字、バックフィル形式）への UPDATE でも同期スキップされる / 通常メール変更では従来通り同期される / `pg_proc.prosecdef = true` かつ `proconfig` に `search_path=public` 含まれることを assert
  - **本 migration は Task 10（バックフィル）より timestamp 早く配置する**（バックフィルが先に走ると `public.users.email` が壊れる）
  - _Requirements: 1.6, 1.7, 1.8, 6.1, 6.2_

- [x] 4. (P) `delete_staff_member` v3 RPC を実装
  - 新規 migration `20260617110100_delete_staff_member_v3.sql` を作成（grant migration `20260617120000` より前）
  - 戻り値型を `void` → `jsonb` に変更（`DROP FUNCTION` + `CREATE FUNCTION` の順、戻り値型変更のため `CREATE OR REPLACE` 不可）
  - 戻り値：`jsonb_build_object('user_id', p_target_user_id, 'globally_deleted', v_globally_deleted)`
  - `v_globally_deleted` は本 RPC 呼び出しで `users.deleted_at` を NULL → now() に遷移させた場合のみ `true`
  - v2 の `FOR UPDATE` 悲観ロック / 残存メンバーシップ判定 / 条件付き `deleted_at` セットの挙動は完全維持
  - 既存 `GRANT/REVOKE`（`REVOKE EXECUTE ... FROM PUBLIC`, `GRANT EXECUTE ... TO service_role`, `REVOKE EXECUTE ... FROM anon, authenticated`）を migration 内で再付与
  - pgTAP テスト：戻り値 jsonb に `globally_deleted: true/false` が含まれる / v2 と同じ条件分岐挙動
  - `supabase gen types` を再生成して TypeScript 型を更新
  - _Requirements: 1.1, 1.2, 1.3, 11.1_

- [x] 5. (P) `handle_subscription_lifecycle_deleted` v3 RPC を実装
  - 新規 migration `20260617110200_handle_subscription_lifecycle_deleted_v3.sql` を作成（grant migration `20260617120000` より前）
  - 戻り値型は既存 `jsonb` のまま（`CREATE OR REPLACE` で互換更新可、DROP 不要）
  - 戻り値 jsonb に `globally_deleted_user_ids: uuid[]` フィールドを追加
  - ループ内で `deleted_at` セット成功時に `v_globally_deleted_ids := array_append(v_globally_deleted_ids, v_member_user_id)`
  - Owner 既退会 early-return パスでは `globally_deleted_user_ids` は空配列で返す
  - v2 の Owner role downgrade / 案件 closed 化 / audit_logs 記録の挙動は完全維持
  - pgTAP テスト：戻り値 jsonb に `globally_deleted_user_ids` 配列が含まれる / Owner 既退会 early-return で空配列 / 通常パスで配下メンバー全員の user_id が並ぶ
  - 既存 `billing_rpc_permissions.test.sql` の戻り値 assertion を確認（authenticated role でブロックされる挙動は維持）
  - _Requirements: 2.1, 2.5, 11.2_

- [x] 6. (P) `resolveExistingProxyReuse` に `deleted_at IS NULL` フィルタを追加
  - `src/lib/organization/resolve-existing-proxy-reuse.ts` を編集
  - Step 1 の SELECT クエリに `.is("deleted_at", null)` を 1 行追加し、検索結果を active 行に限定する
  - **SELECT 列は既存のまま維持**（`id, last_name, first_name, deleted_at` の 4 項目を SELECT）。理由：フィルタにより `deleted_at` は常に NULL になるが、Step 3 の防御コードが TypeScript の型整合性を保ったまま残せるようにするため
  - Step 3 の「論理削除済みユーザー → `new_user`」分岐はフィルタにより dead code 化するが、防御として残しコメント追加：「Step 1 のフィルタにより到達しない / 万一 RLS 等で漏れた場合の二重防御」
  - discriminated union の 4 種戻り値・氏名突合ロジック・proxy membership 判定は変更しない
  - Vitest テスト追加：同 email で deleted + active が並存する状況で active 行が `.maybeSingle()` で正しく拾われる / 全行 deleted な状態で `new_user` を返す
  - 既存テスト（Phase 6 で追加された 4 種 discriminated union テスト）が変わらず PASS することを確認
  - _Requirements: 5.3, 5.6, 11.3_

- [x] 7. (P) `deleteMemberAction` に `applyDeletedSuffix` 呼び出しを統合（Path 1）
  - `src/app/(authenticated)/mypage/members/actions.ts` の `deleteMemberAction` を編集
  - `delete_staff_member` RPC 呼び出しを `const { data, error } = await admin.rpc(...)` に変更（v3 戻り値を受け取る）
  - **戻り値の TypeScript 型キャストを明示**：`supabase gen types` で生成される `data` の型は `Json | null`（汎用型）なので、そのままでは `.globally_deleted` プロパティアクセスが TS 型エラー。以下のパターンで narrowing する（Task 8 の `as string[]` パターンと整合）：
    ```ts
    const { data, error } = await admin.rpc("delete_staff_member", {...});
    if (error) { return { success: false, error: "..." }; }
    const result = data as { user_id: string; globally_deleted: boolean } | null;
    if (result?.globally_deleted === true) {
      try { await applyDeletedSuffix(admin, targetUserId, { path: 'staff_delete', actorId: actor.userId }); }
      catch (e) { console.error("[deleteMemberAction] applyDeletedSuffix failed", e); }
    }
    ```
  - 呼び出しは `try { ... } catch (e) { console.error(...) }` でラップし、印付け失敗時も削除自体は成功扱いで返す
  - 既存の `member_deleted` audit_logs 記録、`revalidatePath` 等の挙動は変更しない
  - Vitest 統合テスト：`globally_deleted=true` → `applyDeletedSuffix` 呼び出し検証 / `globally_deleted=false` → 呼び出されない（兼任継続）/ 印付け失敗時も削除は成功
  - _Requirements: 1.1, 1.5_

- [x] 8. (P) `handleSubscriptionDeleted` に `applyDeletedSuffix` loop を統合（Path 2）
  - `src/lib/billing/webhook/handle-subscription-lifecycle.ts` の `handleSubscriptionDeleted` を編集
  - `handle_subscription_lifecycle_deleted` RPC 呼び出しの戻り値を `const { data, error } = await admin.rpc(...)` で受け取る
  - `(data?.globally_deleted_user_ids as string[]) ?? []` で配列を取り出し、各 user_id に対して `applyDeletedSuffix(admin, userId, { path: 'subscription_deleted', actorId: null })` を呼ぶ
  - 各呼び出しは `try { ... } catch (e) { console.error(...) }` で隔離。1 件失敗しても他は継続（部分成功許容）
  - Owner 既退会 early-return では空配列が返るため loop が回らない（自然な挙動）
  - 既存の `sendCancelledEmail` 呼び出し、補償オプション処理等は変更しない
  - Webhook 全体は印付け失敗で throw しない（Stripe 再送を抑制し、後追いは `audit_logs.auth_email_recycle_failed` から）
  - Vitest 統合テスト：配列 1 件 / 複数件 / 空配列の各ケース / 1 件失敗で他は成功する partial-success ケース
  - _Requirements: 2.1, 2.3, 2.4_

- [x] 9. (P) `executeWithdrawal` に `applyDeletedSuffix` 呼び出しを統合（Path 3）
  - `src/lib/withdrawal/execute.ts` の `executeWithdrawal` を編集
  - 対象本人の `users.update({ deleted_at })`（line 150-153 付近）成功直後に `applyDeletedSuffix(admin, targetUserId, { path: 'self_withdrawal', actorId: cancelledBy === 'contractor' ? targetUserId : null })` を呼ぶ
  - Owner 退会カスケード（line 197-220 付近）で `memberIds` に対して `users.update({ deleted_at }).in("id", memberIds)` 後、各 `memberId` について `applyDeletedSuffix(admin, memberId, { path: 'self_withdrawal', actorId: targetUserId })` を呼ぶ
  - 既存の各種 guard / Stripe 解約 / 補償オプションキャンセル / 100 年 ban / 組織 soft delete / scout_templates Owner 移譲は変更しない
  - 各 `applyDeletedSuffix` 呼び出しは `try { ... } catch (e) { console.error(...) }` で隔離
  - 既存の `admin.auth.admin.updateUserById(..., { ban_duration })` との順序：印付けを先に実行 → その後 ban を適用（順序逆でも機能するが、防御的にこの順序）
  - Vitest 統合テスト：本人退会 / Owner 退会カスケード / 印付け失敗時の退会成功維持
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 10. (P) バックフィル migration を投入
  - 新規 migration `20260617110300_email_recycle_backfill.sql` を作成（**Task 3 のトリガー v2 `20260617110000` より timestamp 後、かつ grant migration `20260617120000` より前**を厳守）
  - `DO $$ ... RAISE NOTICE '対象件数: %', count $$` で事前に件数を出力
  - **乱数は 8 文字（md5 から先頭 8 文字を取得）にする**（forward 経路の 4 文字より長い理由：1 回限りの一括 UPDATE では衝突時のリトライが効かないため、4 文字 16^4=65,536 では 1000 件規模で衝突確実、8 文字 16^8=約 43 億で衝突確率事実上ゼロ）
  - SQL 本体：
    ```sql
    UPDATE auth.users
    SET email = 'deleted-'
              || to_char(now() at time zone 'UTC', 'YYYYMMDD')
              || '-'
              || substring(md5(random()::text || id::text || clock_timestamp()::text), 1, 8)
              || '-'
              || split_part(email, '@', 1)
              || '@'
              || split_part(email, '@', 2)
    WHERE id IN (SELECT id FROM public.users WHERE deleted_at IS NOT NULL)
      AND email !~ '^deleted-\d{8}-[a-z0-9]{4,}-';
    ```
  - WHERE 句の正規表現 `[a-z0-9]{4,}` で forward 4 文字 / バックフィル 8 文字を両方検出して二重印付けを防ぐ（冪等性）
  - migration 冒頭コメントに **「投入は深夜・低トラフィック時間帯を推奨」**「Phase 3 forward 経路との並行 race 回避のため」を明記
  - pgTAP テスト：削除済み user の `auth.users.email` が SUFFIX_PATTERN に変換される / バックフィル後の suffix が 8 文字であることを確認 / `public.users.email` は原本のまま（トリガー v2 が機能）/ 既印付け user は二重印付けされない（冪等性、forward の 4 文字も backfill の 8 文字も skip される）
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 11. E2E テストシナリオを追加（fresh start 含む全 3 経路の動作確認）
- [x] 11.1 代理 staff 削除 → 同メールで別法人代理に招待 → 成功
  - 法人 A の代理として運営員 X を設定 → 法人 A から削除（残り 0 件）→ 別法人 B の代理として同じメールで再招待 → 招待成立を確認
  - 新アカウントから旧アカウントのスカウト履歴・メッセージが見えないこと（fresh start）を assert
  - _Requirements: 12.3_
- [x] 11.2 通常 staff 削除 → 同メールで再招待 → 成功
  - 法人 A の通常 staff として山田さん（メール固定）を招待・承諾 → 法人 A から削除 → 同じメールで法人 A に再招待 → 招待成立を確認
  - _Requirements: 12.3_
- [x] 11.3 受注者本人退会 → 同メールで新規会員登録 → 成功（fresh start 確認）
  - 受注者として登録・プロフィール入力 → 本人退会 → 同じメールで新規会員登録 → 登録成立を確認
  - 新アカウントから旧アカウントのプロフィール / お気に入り / 評価が見えないこと（fresh start）を assert
  - 旧アカウントのデータが DB 上には残っていることを admin 経由で確認（履歴保持）
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 12.3, 12.4_

- [x] 12. 最終回帰テスト + 監査ログ 4 種 action 動作確認
  - `npm run test`（Vitest）/ `supabase test db`（pgTAP）/ `npm run test:e2e`（Playwright）を順に実行し、全てが PASS することを確認する
  - 失敗があれば原因を調査・修正してから再実行
  - 手動確認：ローカル DB で 3 経路を各 1 回ずつ実行し、`audit_logs` に `auth_email_recycled` 行が追加されることを SQL で確認
  - 手動確認：印付け失敗を意図的に起こし（例：admin client を一時的に壊す）、`auth_email_recycle_failed` 行が追加されることを確認
  - 手動確認：`restoreDeletedSuffix` を 1 回呼んで `auth_email_restored` 行を確認、衝突ケースで `auth_email_restore_failed` 行を確認
  - 印付け対象でない受注者 / 発注者・在籍中の代理 staff（兼任継続中）の email が誤って書き換わっていないことを確認
  - _Requirements: 12.1, 12.2, 12.3, 12.4_
