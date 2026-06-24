# Phase 5 本番投入 run-book

> `proxy-account-multi-org-support` Phase 5 (Task 5.1〜5.3) を本番環境に投入する手順。
> 旧 `users.is_active = false` 冷凍保存方式を撤廃し、`organization_members` 行物理削除 + `users.deleted_at` セット モデルに正規化する。

## 投入物

### Migration (1 本)
- `supabase/migrations/20260616140000_lifecycle_v2_data_migration.sql`
  - 旧 `is_active=false` ユーザーの organization_members 行を削除 + `deleted_at` をセット

### コード変更
- `src/lib/billing/webhook/handle-subscription-lifecycle.ts`
  - `reactivateCorporateMembers` 関数本体・alias `reactivateCorporateStaff`・export を削除
  - `handleSubscriptionCreated` 関数本体を削除 (リアクティベーション以外の用途なし)
  - dispatcher の `customer.subscription.created` ケースを no-op に
  - `handleInvoicePaymentSucceeded` 内の `reactivateCorporateMembers` 呼び出しを削除
- `src/lib/billing/webhook/handle-checkout-completed.ts`
  - `reactivateCorporateMembers` import 削除
  - `handlePlanCheckout` 内の呼び出し削除 + 周辺コメント整理
- `src/__tests__/billing/webhook/handle-subscription-lifecycle.test.ts`
  - `recovery from past_due` テストから `is_active=true` UPDATE 期待を削除

### Seed (テスト用)
- `supabase/seed.sql` の J1 シナリオ (frozen-admin / frozen-staff) を Phase 5 正規化済み状態に書き換え

## 前提

- Phase 0〜4 すべて本番投入完了済み
- `users.is_active = false` セットを発生させる経路 (handle_subscription_lifecycle_deleted の旧 v1) が Phase 4 で完全撤廃済み
- 本 migration 投入時点で新規 `is_active=false` 行は発生しない

## 投入前チェック (本番 DB に対して実行)

### 1. 対象ユーザー件数の事前カウント

```sql
SELECT count(*) AS frozen_users
  FROM public.users
 WHERE is_active = false
   AND deleted_at IS NULL;
```

期待値: ローカル開発では 2 件 (frozen-admin, frozen-staff)。本番では 0〜数件のはず。

**判断基準**:
- 0 件 → migration は NO-OP。安全に投入可
- 1〜10 件 → migration は想定通り。投入可
- 10 件超 → **投入中止**。想定外のデータ汚染が疑われるため調査を先行する

### 2. 削除対象 organization_members 件数の事前カウント

```sql
SELECT count(*) AS rows_to_delete
  FROM organization_members om
  JOIN public.users u ON u.id = om.user_id
 WHERE u.is_active = false
   AND u.deleted_at IS NULL;
```

期待値: 上記ユーザー数 × そのユーザーの所属組織数。

### 3. 対象ユーザーの詳細リストを記録

```sql
SELECT u.id, u.email, u.role,
       (SELECT array_agg(om.organization_id::text)
          FROM organization_members om
         WHERE om.user_id = u.id) AS org_memberships
  FROM public.users u
 WHERE u.is_active = false
   AND u.deleted_at IS NULL
 ORDER BY u.id;
```

結果を CSV でエクスポートし、復元用バックアップとして保管する。

## 投入手順

### 1. バックアップ

```bash
# 本番 DB のフルダンプ
pg_dump --clean --create -h <prod_host> -U postgres postgres > backup_pre_phase5_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Migration 投入 (本番 Supabase の場合)

Supabase Dashboard → SQL Editor で `20260616140000_lifecycle_v2_data_migration.sql` の内容を実行する。
NOTICE ログで影響行数を確認:

```
[lifecycle_v2_data_migration] normalizing N users (is_active=false AND deleted_at IS NULL); will delete M organization_members rows
```

### 3. コードデプロイ

通常の Next.js デプロイフロー (Vercel push 等) で `reactivateCorporateMembers` 撤廃版コードをデプロイ。

## 投入後検証

### 1. 残存件数確認

```sql
-- 対象ユーザーがゼロになっていることを確認
SELECT count(*) FROM public.users
 WHERE is_active = false AND deleted_at IS NULL;
-- 期待: 0

-- 全 is_active=false ユーザーに deleted_at がセットされていることを確認
SELECT count(*) FROM public.users
 WHERE is_active = false AND deleted_at IS NULL;
-- 期待: 0

SELECT count(*) FROM public.users
 WHERE is_active = false;
-- 期待: 投入前と同件数 (is_active は触っていない)
```

### 2. organization_members 行削除確認

```sql
-- 対象ユーザーの organization_members 行がゼロになっていることを確認
SELECT count(*) FROM organization_members om
  JOIN public.users u ON u.id = om.user_id
 WHERE u.is_active = false;
-- 期待: 0
```

### 3. 動作確認

- 法人プラン解約 → 再アップグレードのテストを実施し、Admin/Staff の自動復帰が発生しないことを確認 (Phase 4 設計通り)
- Admin/Staff が削除済み法人に所属していた場合の再招待フロー (Phase 6 で実装予定) を待つ

## ロールバック手順

### Migration のみロールバック

`users.deleted_at` のセットと `organization_members` 行削除は、事前にバックアップした CSV / pg_dump から復元する。

```sql
-- 例: バックアップ CSV を一時テーブルに読み込み、deleted_at を NULL に戻す
UPDATE public.users SET deleted_at = NULL
 WHERE id IN (SELECT id FROM backup_frozen_users);

-- organization_members は手動で INSERT 復元
INSERT INTO organization_members (organization_id, user_id, org_role, is_proxy_account)
SELECT organization_id, user_id, org_role, is_proxy_account
  FROM backup_organization_members;
```

### コードのみロールバック

`git revert` で `reactivateCorporateMembers` 復活版に戻す。本 migration を投入していなければ機能上問題なし (旧モデルに戻る)。

### 同時ロールバック

両方を巻き戻すケースは想定しない (本番投入時に一気通貫で実施するため、片方のみロールバックする状況は通常発生しない)。

## 失敗時の連絡

本 migration で対象行数が事前カウントと一致しない、または NOTICE ログが想定外の値を返した場合は、エンジニアリングチームに即報告し投入を中止する。
