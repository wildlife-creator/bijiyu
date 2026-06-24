# proxy-account-multi-org-support 引き継ぎ資料

> 別セッションで「代理アカウントの N 法人兼任モデル」spec を立ち上げるための引き継ぎ資料。本ドキュメントは self-contained で、新セッションで読めば全文脈が把握できるよう構成。

## 1. 背景

2026-06-23 のメール通知 spec session（`.kiro/specs/notifications/email-decisions-wip.md`）で §5.7 担当者削除通知を議論中、user の以下の観察から課題が浮上:

> 代理アカウントのビジ友運営スタッフは同じ名前とアドレスで複数の企業の代理アカウントを担うことになる

これを契機にコード確認したところ、現状の実装が **「1 ビジ友運営スタッフ = 1 法人の代理アカウント」前提** になっていて、想定運用 **「1 スタッフが N 法人の代理を兼任」** に対応していないことが判明。

§5.7 メール通知の設計は、この根本問題が解決してからでないと進められないため、別 spec として整理することになった（選択肢 A 採用、2026-06-23 user 決定）。

## 2. ユーザーが述べた想定モデル

具体例:
- ビジ友運営スタッフ「田中 太郎（tanaka@bijiyu.co.jp）」
- 法人 A の代理アカウント = 田中 太郎
- 法人 B の代理アカウント = 同じ田中 太郎
- 法人 C の代理アカウント = 同じ田中 太郎

DB 上は `organization_members` の (user_id, organization_id) 複合キーで N:N 関係をサポート済。**schema は対応可能**。

法人ごとに別アカウント（tanaka+A@bijiyu.co.jp 等）を作る運用は、1 人で 5〜10 社見るケースで管理コスト過大なため非現実的。

## 3. 解決すべき課題（コード確認済）

### Gap ① `createMemberAction` のメール重複チェックが厳しすぎる

**ファイル**: `src/app/(authenticated)/mypage/members/actions.ts:107-118`

```ts
const { data: existingUser } = await admin
  .from("users")
  .select("id")
  .eq("email", parsed.data.email)
  .maybeSingle();

if (existingUser) {
  return { success: false, error: "このメールアドレスは既に登録されています" };
}
```

- **問題**: 全組織まとめて email 重複を判定し、別組織への招待でも弾く
- **期待挙動**: 代理アカウント（`isProxyAccount=true`）の場合は、同じ email でも別組織への招待を許可する

### Gap ② `delete_staff_member` RPC の soft delete が global

**ファイル**: `supabase/migrations/20260419100500_staff_management_rpc_functions.sql:113-140`

```sql
CREATE OR REPLACE FUNCTION delete_staff_member(
  p_target_user_id    uuid,
  p_organization_id   uuid,
  p_owner_user_id     uuid
) RETURNS void
...
BEGIN
  -- 1. scout_templates owner 移譲
  UPDATE scout_templates SET owner_id = p_owner_user_id
   WHERE owner_id = p_target_user_id AND organization_id = p_organization_id;
  -- 2. organization_members 物理削除
  DELETE FROM organization_members
   WHERE user_id = p_target_user_id AND organization_id = p_organization_id;
  -- 3. users をソフト削除（ログイン不可化）
  UPDATE public.users SET deleted_at = now()
   WHERE id = p_target_user_id AND deleted_at IS NULL;
END;
```

- **問題**: `users.deleted_at` が global にセットされ、削除された組織以外でも在籍中ならログイン不可になる
- **期待挙動**: 他の組織にまだ在籍があれば `organization_members` 行だけ削除し、`users.deleted_at` はセットしない。すべての組織から抜けた場合のみ global ソフト削除

### Gap ③（関連）: 法人プラン凍結（`users.is_active`）も同じ問題の可能性

**ファイル**: `supabase/migrations/20260420100000_handle_subscription_lifecycle_deleted_admin.sql:78-88`

- 法人プラン解約時に配下 staff/admin の `users.is_active = false` がセットされる（CLAUDE.md「Staff ユーザーの subscription 参照」セクション参照）
- 同じく `users.is_active` を global にセットするため、N 法人兼任 staff だと他の組織でも凍結されてしまう可能性
- → N 法人兼任 spec で `is_active` の挙動も合わせて見直すべき

### Gap ④（関連）: `insert_staff_member_with_limit` の代理一意性チェック

**ファイル**: `supabase/migrations/20260419100500_staff_management_rpc_functions.sql`（同 migration 内）

- 「組織内で代理アカウント 1 個」ルールはこの RPC でチェック
- N 法人兼任モデルで「ユーザー単位での代理在籍数の上限」ルールが追加で必要になるか、現状の「組織内 1 個」だけで十分か要設計

## 4. 新 spec で扱うべき設計事項

### 機能要件

1. **代理アカウント（`is_proxy_account=true`）の N 法人兼任を許可**
   - 同じ ビジ友運営スタッフ `user_id` が複数の `organization_members` 行を持てる
   - 各組織で個別に「代理アカウント」として機能
2. **通常スタッフは引き続き 1 組織制限**
   - 法人組織の一般 staff/admin は 1 人 1 組織に紐づく前提を維持
   - 「代理かどうか」で分岐ルール

### 必須コード修正

1. **`createMemberAction` のメール重複チェック修正**
   - 代理アカウント招待時は同じ email を許可（既存ユーザーの user_id を取得して `organization_members` 行のみ追加するパス）
   - 通常スタッフ招待時は現状通り弾く
2. **`delete_staff_member` RPC 修正**
   - 削除対象が他の組織にも在籍があれば `users.deleted_at` をセットしない
   - すべての組織から抜けた場合のみ global ソフト削除
3. **`handle_subscription_lifecycle_*` の `users.is_active` セット修正**
   - 法人プラン解約時、staff/admin が他の組織にも在籍があれば `is_active` を変更しない
   - 該当組織内での凍結を `organization_members` の何らかのフラグで表現する設計に変更が必要かも（要設計）
4. **`insert_staff_member_with_limit` RPC の代理一意性チェック**
   - 「組織内で代理アカウント 1 個」ルールは維持
   - ただし「ユーザー単位で他組織にも代理在籍 OK」と整合させる

### UI 影響

- CLI-022 担当者管理画面で「既存の ビジ友運営スタッフを別組織の代理に追加する」UI が必要か検討
- もしくは現状の「メール入力で招待」のままで、内部処理として既存ユーザーを再利用する設計

### テスト観点

- 同じ email で N 組織への代理アカウント招待が成功する
- 1 組織で代理を削除しても他の組織での代理が無事
- 法人プラン解約時、配下 staff が他の組織で代理として在籍していれば該当組織以外への影響なし
- 既存の「組織内で代理 1 個」ルールは引き続き機能

## 5. §5.6 / §5.7 への影響（メール spec への戻し作業）

N 法人兼任モデルが確立されると、メール spec WIP の §5.6 / §5.7 を再検討する必要あり。

### §5.6.C / 5.6.D 代理アカウント設定通知（既に確定済）

- **5.6.D 配信先**（Owner+admin）: 組織単位なので変わらない見込み
- **5.6.C 配信先**（本人 = 運営スタッフ）: N 法人で兼任していても本人 1 名で OK
- **件名「『○○建設』の代理アカウントとして設定されました」**: 組織別表現なので問題なし
- → 大きな修正は不要の見込み、確認のみ

### §5.7.A / 5.7.B 担当者削除通知（保留中）

- **5.7.A 本人通知文面**「今後、本アカウントから「△△建設」の業務にアクセスできなくなります」: 組織別表現なので適切
- ただし「ビジ友運営スタッフが他組織でも代理続けている」ケース → 本人にとって「A 社だけね、B 社はそのまま」のニュアンス調整が要検討
- **5.7 削除ブロックの判断**: N 法人兼任実装後は「削除しても他組織への影響なし」となり、削除ブロックの必要性が薄れる可能性
- 「最後の 1 組織から削除する場合は確認ダイアログ」のような UX 案も検討余地

### §5.7 を再開する条件

新 spec の以下が確定すれば §5.7 を再開可能:
- Gap ② 解消（`delete_staff_member` の挙動修正）
- Gap ③ 解消（`is_active` の挙動修正）
- Gap ① 解消（メール重複チェック修正）

## 6. 推奨次のステップ

新 spec を作成する手順:

1. `.kiro/specs/proxy-account-multi-org-support/` ディレクトリ作成
2. `kiro:spec-init` で初期化（説明文に「§5 メール通知 spec の §5.7 議論中に発見された代理アカウント N 法人兼任の課題」と記載）
3. `kiro:spec-requirements` で要件定義（本ドキュメントの「3. 解決すべき課題」「4. 設計事項」をベースに）
4. `kiro:spec-design` で技術設計（コード修正・RPC 修正・migration の設計）
5. `kiro:spec-tasks` で実装タスク分解
6. `kiro:spec-impl` で実装

新 spec の **実装完了後** に:

7. メール spec WIP（`.kiro/specs/notifications/email-decisions-wip.md`）に戻り、§5.6 / §5.7 を必要に応じて見直し
8. §5.7 の本記述を完成させる（前回提案案の 5.7.A / 5.7.B を確定）
9. §5.8 PW リセット日本語化 + §6 以降に進む

## 7. 参照すべき関連ファイル

### コード

| ファイル | 関連箇所 |
|---|---|
| `src/app/(authenticated)/mypage/members/actions.ts` | createMemberAction (line 77〜)、updateMemberAction (line 254〜)、deleteMemberAction (line 454〜) |
| `supabase/migrations/20260419100500_staff_management_rpc_functions.sql` | delete_staff_member (line 113〜)、insert_staff_member_with_limit |
| `supabase/migrations/20260420100000_handle_subscription_lifecycle_deleted_admin.sql` | 法人プラン凍結ロジック (line 78〜88 等) |
| `supabase/migrations/20260324160600_002_core_tables.sql` | `users.is_active` 列定義 (line 22) |

### Spec / Steering

| ドキュメント | 関連性 |
|---|---|
| `.kiro/specs/notifications/email-decisions-wip.md` | 本セッションの WIP。§5.6 まで確定、§5.7 保留中 |
| CLAUDE.md「Staff ユーザーの subscription 参照（必ず守ること）」セクション | staff の subscription / billing 制限ルール |
| CLAUDE.md「ロール設計と画面アクセス（必ず守ること）」セクション | role 設計の前提 |
| CLAUDE.md「代理メッセージ（`is_proxy`）の仕組み」セクション | 代理アカウントの設計意図 |
| CLAUDE.md「Supabase Auth の session cookie とリダイレクトループ対策（必ず守ること）」セクション | `deleted_at` / `is_active` セット時の挙動への注意 |

### Memory

| ファイル | 関連性 |
|---|---|
| `project_staff_no_billing.md` | staff の billing 不参加ルール |
| `project_org_scoping_consistency.md` | 組織スコープ統一の横断課題 |

## 8. 議論の歴史（参考）

- 2026-06-22 〜 06-23: メール通知 spec session（§1 〜 §5.6 完了）
- 2026-06-23: §5.7 議論中に user が代理アカウント N 法人兼任を指摘
- 2026-06-23: 課題確認 → §5.7 保留決定 → 本引き継ぎ資料作成（user 選択肢 A 採用）

## 9. メール spec WIP 側の現状（参考）

- §5.6 までは全項目確定済
- §5.7 は保留中、本 spec 完了後に再開
- §5.7 前回案: 5.7.A 削除された本人宛通知 + 5.7.B 組織管理層宛 control mail（代理時は分岐文面）の 2 構造
- 詳細は `email-decisions-wip.md` の「§5.7 で議論中の論点」セクション参照
