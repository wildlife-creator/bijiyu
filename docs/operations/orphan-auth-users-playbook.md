# 孤児 auth.users 対応 Playbook

## 背景

CLI-025（担当者新規作成）や通常サインアップのフローでは、`auth.users`
行の作成と `public.users` 行の作成が 2 段階で行われる。
`handle_new_user` トリガーか `insert_staff_member_with_limit` RPC の
後続処理が失敗した場合、`auth.users` だけが残り `public.users` が
存在しない「孤児」レコードが発生する可能性がある。

本 Playbook は孤児を検出した場合の対応手順を運用担当者向けにまとめる。

## 検出方法

### 週次 SQL チェック（推奨）

`docs/operations/orphan-auth-users-check.sql` を Supabase Dashboard の
SQL Editor で実行、または cron で自動化する。
1 時間以上前の孤児のみが対象。

### 運営通知メール

`member_create_failed_cleanup_failed` が `audit_logs` に記録された
タイミングで、運営宛（`OPS_NOTIFICATION_EMAIL`）に即時通知される
（Task 14.2 実装、`src/app/(authenticated)/mypage/members/actions.ts`）。
この通知を受け取った場合は本 Playbook を参照。

## 機能面のリスク評価

- 孤児は `public.users` に行が無いため Middleware でログイン不可
  （`role` が引けず認証コンテキストが成立しない）
- 本人がアプリを使うことはできない状態なので、即時削除は必須ではない
- 放置すると `auth.users.email` が占有されたままになるため、同じ
  メールで招待を再送できない

## 対応手順

### 1. 調査

該当 `auth.users.id` について、`audit_logs` で失敗の根本原因を確認:

```sql
SELECT action, metadata, created_at
FROM audit_logs
WHERE target_id = '{orphan_id}'
   OR metadata->>'target_user_id' = '{orphan_id}'
ORDER BY created_at DESC;
```

よくある原因:

- `STAFF_LIMIT_EXCEEDED`: 人数上限到達（`insert_staff_member_with_limit`
  例外）+ `deleteUser` の通信エラー
- `PROXY_ACCOUNT_ALREADY_EXISTS`: 代理重複（同上）
- ネットワークエラー: Supabase Auth API の一時的失敗

### 2. 削除判断

次のどちらかを選択する:

#### (A) 再招待が予定されている

- 運営 or 組織 Admin がリトライする予定 → **削除して email を解放**
- 削除手順: `auth.admin.deleteUser({orphan_id})` を実行（Dashboard の
  Auth 管理画面、または service_role キー経由）

#### (B) 再招待予定なし

- 招待ミス、組織解約等 → **削除**（同上）

### 3. 削除実行

Supabase Dashboard の Auth 管理画面で該当ユーザーを削除する、または
Node.js で:

```ts
import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
await admin.auth.admin.deleteUser("{orphan_id}");
```

`ON DELETE CASCADE` により `auth.identities` / `auth.sessions` は
連動削除される。

### 4. 監査記録

削除実行後、`audit_logs` に `orphan_auth_user_cleaned_up` を手動 INSERT:

```sql
INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
VALUES (
  '{operator_user_id}',
  'orphan_auth_user_cleaned_up',
  'user',
  '{orphan_id}',
  jsonb_build_object(
    'email', '{orphan_email}',
    'reason', 'cleanup after member_create_failed_cleanup_failed'
  )
);
```

## 禁止事項

**孤児を `public.users` に手動 INSERT して蘇生させるのは禁止。**
メタデータ・`handle_new_user` トリガーを経由しない直接 INSERT は
organization_members 側の整合性やメール通知の発火順序が崩れる。
原則「再招待 or 削除」の 2 択のみ。
