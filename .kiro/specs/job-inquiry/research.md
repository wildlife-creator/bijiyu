# Research & Design Decisions — job-inquiry

## Summary
- **Feature**: `job-inquiry`
- **Discovery Scope**: Extension（既存 support + messaging + scout-notification パターンの拡張）
- **Key Findings**:
  - フォーム／テーブル／RLS／レート制限／メール通知の全パターンが直近の `support` spec と `scout-send` 経由で実証済みで、コピー＋差し替えで成立する
  - 受信箱が「読むだけ」に簡素化された結果、新規アーキ要素は SELECT RLS の `is_same_org()` 利用のみ（messaging 流用）
  - 送信者の RLS SELECT を許可しないため、レート制限・admin の閲覧は admin client（service_role）経由になる。これは `trouble-report` で実証済み

## Research Log

### 既存フォーム実装パターン
- **Context**: フォーム3点セット（SSR ページ + Client コンポーネント + Server Action）の既存形を確認し、本機能に流用可能か判定する
- **Sources Consulted**:
  - `src/app/(authenticated)/trouble-report/page.tsx`（39行）
  - `src/app/(authenticated)/trouble-report/trouble-report-form.tsx`（289行）
  - `src/app/(authenticated)/trouble-report/actions.ts`（113行）
- **Findings**:
  - SSR ページが `users.last_name + first_name`（スペース無し連結）と email を取得して props 渡し
  - Form は react-hook-form + Zod + sonner で構成。`defaultValues` で初期値を流し込み editable に
  - Action は auth→Zod→admin client COUNT→INSERT→（添付）→update の流れ。`ActionResult` 型で返却
  - 成功時の表示は in-page `submitted` 状態に切替（本機能では redirect + SuccessToast を採用）
- **Implications**: ファイル名と項目を差し替えるだけで雛形完成。差分は「複数選択チェックボックス」「対象 client ID をパスで持つ」「成功時 redirect」の3点

### 既存テーブル + RLS パターン
- **Context**: `trouble_reports` の RLS と整合させつつ、宛先 client + 同一組織メンバーの SELECT を追加する方法を確認
- **Sources Consulted**:
  - `supabase/migrations/20260525130000_support_contacts_trouble_reports.sql`（trouble_reports）
  - `supabase/migrations/20260406100000_messaging_scout_status.sql`（messages の `is_same_org()` 利用）
  - `supabase/migrations/20260402100000_fix_org_members_rls_recursion.sql`（`is_same_org` 定義）
- **Findings**:
  - PostgreSQL の PERMISSIVE ポリシーは OR で結合される。SELECT を複数ポリシーで定義しても OR となり問題なし
  - UPDATE は messaging が「PERMISSIVE OR 結合問題」のため admin client に統一しているが、本機能は UPDATE 機能を持たないため**ポリシー無し（default deny）**で完結する
  - `is_same_org(auth.uid(), organization_id)` は SECURITY DEFINER 関数で `organization_members` を読む。`organization_id` を行に denormalize で持つことで使える
- **Implications**:
  - 行ごとに `target_organization_id` を保存する（INSERT 時にサーバー側で解決）
  - SELECT ポリシーは3つ並列：admin / target_client_id == auth.uid() / `is_same_org(auth.uid(), target_organization_id)`
  - UPDATE/DELETE ポリシーは作らない（default deny）

### メール通知パターン
- **Context**: scout-notification と同等の構造で、宛先発注者（Owner）の email にメールを1通送る実装方法
- **Sources Consulted**:
  - `src/lib/email/templates/scout-notification.ts`
  - `src/lib/email/send-email.ts`
  - `src/app/(authenticated)/messages/scout-send/actions.ts:213`（`await sendEmail({to,subject,html}).catch(...)` の fire-and-forget）
- **Findings**:
  - `sendEmail()` は Resend API キーが無い dev 環境で `/tmp/bijiyu-dev-mail/` に書き出すフォールバックを持つ
  - 失敗してもログ出力のみで本体処理をロールバックしない方針（`.catch((err) => console.error(...))` パターン）。security.md「メール送信失敗時の共通方針」と整合
  - 宛先 client の email は cross-user 参照のため admin client で取得する
- **Implications**: `job-inquiry-notification.ts` テンプレートを新規作成し、`subject` + `html` を返す関数として scout-notification と同形で実装する

### `/clients/[id]` 配下のルーティング
- **Context**: フォームを CON-006（`/clients/[id]`）の子ルートとして配置するかクエリパラメータ方式にするか
- **Sources Consulted**:
  - `src/app/(authenticated)/clients/[id]/page.tsx`（CON-006）
  - `src/app/(authenticated)/messages/new/page.tsx`（`?to={userId}` 方式の例）
- **Findings**:
  - メッセージ作成は `/messages/new?to={userId}` のクエリ方式
  - 一方で `/applications/received/[id]` のような子ルートも多用されている
  - URL から「誰宛か」が一目で分かるのは子ルートの方
- **Implications**: フォームは `/clients/[id]/inquiry` の子ルートに配置（URL 意味論が明確）

### 受信箱画面のパターン
- **Context**: 一覧と詳細を SSR で実装する最小構成
- **Sources Consulted**:
  - `src/app/(authenticated)/applications/received/page.tsx`（CLI-007）
  - `src/app/(authenticated)/applications/received/[id]/page.tsx`
- **Findings**:
  - 20件ページングは `ITEMS_PER_PAGE = 20` + `from = (page-1)*20` + `to = from + 19` + `range(from, to)` + 別 query で `{ count: 'exact', head: true }` を取る2クエリ構成
  - 詳細は SSR 単発 query で表示。actions.ts は対応操作がある場合のみ追加
- **Implications**: 本機能は対応操作無しのため、受信箱は SSR の page.tsx 2 本のみ。詳細用 `actions.ts` 不要

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| **既存パターン拡張（採用）** | trouble-report + scout-notification + messaging の流儀を組み合わせる | コピー＋差し替えで成立／既存 pgTAP・Vitest・E2E 流儀をそのまま使える | RLS SELECT の `is_same_org` 利用が新規組合せ（ただし messaging に既存実例あり） | 推奨 |
| 通知センター集約 | 受信箱を「通知（notifications）」テーブル＋通知センター画面として作る | 将来の admin 通知や複数種の inbox と統合可 | 現在 notifications テーブルも通知センターも未実装。スコープを大幅超過 | 不採用 |
| 独立コンポーネント | 受信箱だけ `src/components/inquiry-inbox/` に切り出す | 単体テストしやすい | 1機能のために構造を分ける費用対効果が低い | 不採用 |

## Design Decisions

### Decision: 受信箱は「読むだけ」に限定する
- **Context**: ユーザー要望「お問い合わせ・トラブル報告と同じく状態管理を持たない最小構成にしたい」
- **Alternatives Considered**:
  1. 対応済フラグ（`handled_at` + `handled_by`）の完全実装
  2. `handled_at` のみ保存して画面では出さない（中案）
  3. 何も保存しない・画面も対応済表示なし（最終採用）
- **Selected Approach**: 対応済関連のデータも UI も持たない。受信箱は読むだけ
- **Rationale**: 橋渡しコンセプトと完全一致／お問い合わせ・トラブル報告と作りが揃う／コードと RLS が最小化／将来必要になったらカラム追加で後付け可能（YAGNI）
- **Trade-offs**: 件数が増えた時の発注者側の管理は当事者側のメール/メッセージで行う前提となる
- **Follow-up**: 運用後に件数が増え「やっぱり管理機能が欲しい」となれば、カラム追加 migration で対応する

### Decision: `target_organization_id` を行に denormalize する
- **Context**: SELECT RLS で `is_same_org(auth.uid(), target_organization_id)` を使うため、行から組織 ID を直接参照したい
- **Alternatives Considered**:
  1. RLS 内で `target_client_id` から `organization_members.organization_id` を join して解決
  2. 行に `target_organization_id` カラムを持ち denormalize（採用）
- **Selected Approach**: INSERT 時にサーバー側で `target_client_id` から `organizations.id` を解決し、行にコピーする
- **Rationale**: messaging の `messages.organization_id` と同パターン／RLS の SQL がシンプルかつ速い／is_same_org() がそのまま使える
- **Trade-offs**: organization の owner が変更された場合に行の `target_organization_id` が古くなる可能性（実運用上、Owner 交代は稀で運営が手動対応する想定）
- **Follow-up**: 個人プラン client が organization を持たないケースで `target_organization_id` を `NULL` にして、SELECT は `target_client_id = auth.uid()` のみで成立することを pgTAP で確認

### Decision: UPDATE / DELETE は default deny（RLS ポリシー無し）
- **Context**: 対応済フラグ機能を持たないため、一般ユーザーは行を変更する必要がない
- **Alternatives Considered**:
  1. UPDATE ポリシーを書いて将来の拡張性を確保
  2. ポリシー無し＝default deny（採用）
- **Selected Approach**: UPDATE/DELETE ポリシーを設置しない
- **Rationale**: 最小構成に徹する／messaging の PERMISSIVE OR 結合問題を回避できる／将来必要になればその時に追加
- **Trade-offs**: admin client（service_role）経由でなければ UPDATE 不可（admin 操作のみ可能）

### Decision: フォーム URL は `/clients/[id]/inquiry` の子ルート
- **Context**: フォームのルーティングをクエリパラメータ方式か子ルート方式かで選択
- **Selected Approach**: `/clients/[id]/inquiry` の子ルート
- **Rationale**: URL から「誰宛のフォーム」が一目で分かる／CON-006 と同じパスプレフィックスで middleware ルールも自然に継承
- **Trade-offs**: なし

### Decision: 送信成功時は CON-006 へ redirect ＋ SuccessToast
- **Context**: 完了表示の方式
- **Alternatives Considered**:
  1. in-page 完了表示（`submitted` state）— trouble-report の方式
  2. redirect + クエリパラメータ駆動の SuccessToast（採用）
- **Selected Approach**: Server Action 成功時に redirect、CON-006 で `?inquiry=success` を検出して toast 表示後にパラメータをクリア
- **Rationale**: 要件で「送信成功 → CON-006 へ戻す」と明示／URL の意味が一貫（フォーム画面に長居させない）／既存の `success-toast.tsx` パターンを使える
- **Trade-offs**: トースト表示用に SuccessToast 部品の追加 or 既存の reuse が必要

## Risks & Mitigations
- **Risk 1**: `is_same_org()` が個人プラン client（organization 無し）でどう動くか曖昧 — **Mitigation**: pgTAP で「個人プラン client → target_organization_id NULL → 同じユーザー以外は SELECT 不可」のケースを必ずテスト
- **Risk 2**: 法人プランの担当者（staff）が「自社の発注者宛」にボタンを誤って押すと送れる — **Mitigation**: ボタン表示条件と Server Action 双方で同じ「自社判定」を実装（CLAUDE.md「UI と Server Action の許可範囲一致」ルール）
- **Risk 3**: メール通知が遅延・失敗した場合に発注者が受信に気づかない — **Mitigation**: 受信箱を見れば必ず内容を確認できる構造を維持（メールは橋渡しの補助、最終的に受信箱が真実）。失敗はログに記録
- **Risk 4**: rate limit が admin client COUNT に依存し、`sender_id` インデックスが無いと将来遅くなる — **Mitigation**: migration で `CREATE INDEX ON job_inquiries (sender_id, created_at)` を追加（messages テーブルと同じ手段）

## References
- 兄弟仕様（`.kiro/specs/support/requirements.md`）— 同形パターンの参照元
- `CLAUDE.md`「メール送信失敗時の共通方針」「フォーム内ボタン type 明示」「shadcn/ui の Select は selectOption() で操作しない」「page.goto 直接遷移だけで E2E を完結させない」など実装規約
- `.kiro/steering/security.md`「Server Actions の権限チェック」セクション
- `.kiro/steering/tech.md`「メール送信パターン（Resend）」「Supabase Realtime 利用方針」
- `.kiro/steering/database-schema.md`「主要テーブル別ポリシー」セクション（追記対象）
- `.kiro/steering/screen-map.md`（COM-013/COM-014/COM-015 を追記する対象）
- `.kiro/specs/job-inquiry/gap-analysis.md` — 既存資産マップとリスク評価
