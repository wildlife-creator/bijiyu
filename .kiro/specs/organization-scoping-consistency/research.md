# Research & Design Decisions — organization-scoping-consistency

## Summary
- **Feature**: `organization-scoping-consistency`
- **Discovery Scope**: Extension（既存システムへの統合・横展開）
- **Key Findings**:
  - 会社単位化の正準パターン（`jobs/manage/page.tsx` の orgMember 分岐）と認可フォールバック（`applications/received/[id]`、`acceptApplicationAction`）が既存。6件の読み取り/認可修正は既存パターンのコピーで成立。
  - 評価のみ会社の鍵が無く `client_reviews.organization_id`（nullable）新設が必要。書き込み側 `submitContractorReportAction` は `job.organization_id` を既に取得済みで保存は軽微。
  - メッセージ系 RLS（`message_threads`/`messages`）は `is_same_org` で組織対応済み。bulk-send は client component のクエリ絞りのみが個人単位＝サーバー移譲で解決。

## Research Log

### 正準パターンと認可フォールバックの所在
- **Context**: 6件を最小・低リスクで直すための既存雛形の特定。
- **Sources Consulted**: `jobs/manage/page.tsx:36-72`、`messages/scout-send/page.tsx:67-71`、`billing/page.tsx:136-140`、`applications/received/[id]/page.tsx:63-86`、`jobs/[id]/page.tsx:147-161`、`jobs/[id]/applicants/page.tsx:57-69`、`applications/actions.ts:273-289`。
- **Findings**: 読み取りは「orgMember あれば `organization_id`、無ければ `owner_id`」、認可は「`isOwner || isOrganizationMember`」が統一形。閲覧者自身の `organization_members` はセッションクライアントで取得可（RLS `is_same_org`）。
- **Implications**: Req 2/3/4/6 は読み取り雛形、Req 5/9 は認可雛形を踏襲。新規概念なし。

### 他者組織の解決（CON-006）
- **Context**: CON-006 は閲覧対象（他者発注者 `id`）の組織を引く必要があり、自分の組織解決とは別。
- **Sources Consulted**: `src/lib/job-inquiry/resolve-context.ts`（`resolveTargetOrganizationId`／admin client）、`clients/[id]/page.tsx`。
- **Findings**: 他者の `organization_members`/`organizations` は RLS で読めず admin client 必須。CON-006 は既に `targetOrgId = resolveTargetOrganizationId(adminClient, id)` を算出済み（ただし jobs クエリより後段）。
- **Implications**: 解決を jobs クエリ前へ移動して再利用。新ヘルパー不要。

### 評価データの会社鍵（案C）
- **Context**: `client_reviews` に会社の鍵が無く、評価が `reviewee_id=案件作成者` に分散。
- **Sources Consulted**: `src/types/database.ts:304-355`（client_reviews 型）、`applications/actions.ts`（`submitContractorReportAction`／`getApplicationWithDetails` が jobs に `organization_id` を含む）、`002_core_tables.sql:114`（jobs.organization_id は `ON DELETE SET NULL`）、`src/lib/client-review/aggregate.ts`、`src/__tests__/client-review/aggregate.test.ts`。
- **Findings**: `client_reviews` は `application_id`(UNIQUE)/`reviewer_id`/`reviewee_id`+評価列のみ。`fetchClientReputation` の本番呼び出しは `mypage/client-profile/page.tsx` の1箇所。`client_reviews→applications→jobs.organization_id` で backfill 可能。
- **Implications**: nullable `organization_id` 列＋index、insert で `job.organization_id` 保存、移行で backfill。`summarizeReputation`（純粋関数）は不変。型は `supabase gen types` で再生成。

### bulk-send の構造
- **Context**: 一斉送信の宛先収集が個人単位。
- **Sources Consulted**: `messages/bulk-send/page.tsx`（`"use client"` + ブラウザ `createClient`、`.or(participant_1_id.eq, participant_2_id.eq)`）、`messaging` RLS（`20260406100000`）。
- **Findings**: スレッド RLS は組織対応済みのため見えるが、クエリが participant 個人絞り。`other = participant_1===user?p2:p1` は org スレッドで閲覧者が非当事者だと誤った相手を拾う。
- **Implications**: 宛先収集をサーバーへ移譲（Option B）。org スレッドは `participant_2`(職人) 固定で相手特定。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 読み取り org 解決 inline（採用） | 各ページに `organization_members` lookup を直書き | 周囲コードと一致・最小・低リスク | 4箇所で重複 | jobs/manage 等と統一 |
| 読み取り org 解決 共通ヘルパー | `getViewerOrganizationId` 新設 | 重複排除 | 既存 inline と二系統化 | 不採用（既存に合わせる） |
| 評価 会社鍵: 列新設（案C・採用） | `client_reviews.organization_id` 追加 | 公開ページ/将来に堅牢・メンバー増減非依存 | 移行1本・backfill・型再生成 | ユーザー合意 |
| 評価 会社鍵: 都度 job 結合 | reviewee→job→org を都度結合 | 列追加不要 | 集計が重い・公開ページで不利 | 不採用 |
| bulk-send: サーバー移譲（Option B・採用） | 宛先収集を Server Component 化 | 他画面と一貫・client から org lookup を排除 | client/server 分割の小リファクタ | ユーザーおまかせ→採用 |
| bulk-send: client 側 lookup（Option A） | ブラウザで org 解決 | 改修最小 | client にロジック分散 | 不採用 |

## Design Decisions

### Decision: 評価の会社単位化は列新設（案C）
- **Context**: 将来「発注者ごと評価ページ」を会社単位で正しく作る土台が必要。Req 7/8。
- **Alternatives Considered**: 1) 現メンバー列挙して `reviewee_id IN (ids)` 2) 都度 job 結合 3) `organization_id` 列新設。
- **Selected Approach**: `client_reviews.organization_id`（nullable, `ON DELETE SET NULL`）を新設、作成時に `job.organization_id` を保存、既存は backfill。集計は org/個人で分岐。
- **Rationale**: `organization_id` は案件固定でメンバー増減・担当者削除（CLI-023 物理削除）に非依存。1) は辞めた担当者の評価が抜ける。公開ページでも単純・高速。
- **Trade-offs**: 移行・backfill・型再生成のコスト ↔ 将来の堅牢性。
- **Follow-up**: 個人発注者（`organization_id IS NULL`）が `reviewee_id` 軸で正しく集計されることを seed/テストで確認。

### Decision: bulk-send をサーバー移譲（Option B）
- **Context**: Req 6。client component が個人単位でスレッド収集。
- **Selected Approach**: `bulk-send/page.tsx` を Server Component 化して org 解決＋宛先収集し、既存フォームを client 子コンポーネントへ分離して `recipients`/`currentUserId` を props 伝播。
- **Rationale**: サーバーの正準パターンと一貫。RLS は既に組織対応のためデータ取得は安全。
- **Trade-offs**: client/server 分割の小リファクタ ↔ ロジック集約・保守性。
- **Follow-up**: org スレッドの相手は `participant_2` 固定。重複排除を維持。

## 決定済み（網羅レビューで検出 → 2026-06-03 ユーザー決定: 全4カラム backfill）
### 旧案件（`jobs.organization_id IS NULL`）の扱い
- **事実**: 昇格（個人→法人）時に `jobs.organization_id` を backfill する処理は存在しない（`jobs SET organization_id` の更新なし）。個人プラン時に作成した案件は昇格後も `organization_id = NULL` のまま残る。
- **影響**: CON-006 / CLI-007 / CLI-010 を純 `organization_id` フィルタにすると、昇格した Owner の旧案件（とその応募）が漏れる。CLI-007/010 は現状 `owner_id` 基準で旧案件も拾えているため、Owner にとっては「旧案件の応募が一覧から消える」回帰になりうる。
- **整合**: 既存の正準パターン `jobs/manage` も純 org フィルタで同じ挙動（旧案件は既に非表示）。本 spec は同パターンに揃える前提。
- **選択肢**: (i) 純 org フィルタ＝jobs/manage と一貫・旧案件は引き続き非表示（実装最小） / (ii) `jobs.organization_id` を「現メンバーが owner の NULL 案件」に backfill する移行を追加＝全画面で旧案件も正しく会社に含まれ jobs/manage も改善（スコープ微増） / (iii) 画面ごとに `org_id = org OR owner_id = viewer` で OR 絞り（移行不要だが jobs/manage と不一致）。
- **seed/テストには非該当**（seed の案件は org_id 設定済み）。本番データのみの edge。
- **推奨**: (ii) jobs backfill（テーマ「組織スコープ整合」に最も忠実・回帰なし）。ユーザーは (ii) を選択（2026-06-03）。

### 同クラスの横断調査結果（denormalized organization_id の全カラム）
昇格時に backfill されない denormalized `organization_id` は計4カラム。すべて「作成時に当時の所属で値を入れる→昇格後の旧データは NULL→組織絞りで漏れる」同じ構造:
1. **jobs.organization_id**（本specで対応）。backfill: owner が現メンバーの NULL 案件に owner の org を付与。clean。
2. **scout_templates.organization_id**（CLI-016〜019、本spec非対象）。昇格前テンプレは org NULL→**担当者に見えない**（owner は owner_id で見える）。backfill: owner が現メンバーの NULL テンプレに org 付与。clean。
3. **job_inquiries.target_organization_id**（COM-014、本spec非対象）。受信箱は RLS 依存で target_organization_id 同一組織を共有。昇格前受信分は NULL→**組織で共有されず元の受信者しか見えない**。backfill: `target_client_id = uid` の NULL 行に org 付与（列は `target_client_id`。`target_user_id` は存在しない）。clean。
4. **message_threads.organization_id**（CON-008/一斉送信、本spec の bulk-send が関係）。昇格前スレは org NULL→**組織共有されない**＋昇格後に同じ職人へ再送すると別スレが立ち**重複スレッド**化（UNIQUE (org, participant_2) WHERE org NOT NULL）。backfill: 「org メンバー側参加者の org」を付与だが、**legacy NULL スレと既存 org スレが同一(org, 職人)で並存すると UNIQUE 衝突**→マージ/スキップ等の丁寧な処理が必要（リスク中）。 → **【2026-06-04 決定】backfill 対象から外す**: 個人スレッドは participant の位置が役割（発注者/受注者）を表さず「発注者側スレッドだけ」を安全に選別できないと判明（発注者・受注者の双方が `messages/new` からスレッドを開始できる）。昇格後の新規スレッドは作成時に org 付与され会社共有されるため実害なし。チャットは Req 11 の付与対象外（4対象＝jobs/scout_templates/job_inquiries/client_reviews）。

**確定スコープ（2026-06-03 ユーザー決定）**:
- jobs/scout_templates/job_inquiries＋client_reviews を会社IDで紐付ける（Req 11・**4対象**）。message_threads は付与対象外（2026-06-04 決定。上記4参照）。
- **【重要・2026-06-03 方式変更】当初は「1回限りの一括 backfill 移行」だったが、(a) 将来の昇格で同じ NULL が再発し恒久解決にならない (b) message_threads の統合＋削除が最大リスク（不可逆）(c) dev-only で既存レガシーデータが無く一括移行は空振り、の3点から → 『昇格処理 `ensure_organization_exists` に組織ID自動付与を組み込む』方式に変更**（ユーザー合意）。冪等・恒久・将来のどの昇格でも自動で正しくなる。
- **message_threads は付与対象外**（2026-06-04 決定。位置≠役割で選別不可・昇格後の新規スレは自動付与）。client_reviews 付与は jobs 付与の後。一括 backfill 移行は不要。昇格時付与（4対象）の正しさは pgTAP で自動回帰検証する。
- bulk-send は会社スレッド（`organization_id = org`）絞りで収集。昇格前の個人スレッドは付与対象外のため含まれないが、昇格後の新規スレッドは作成時に org 付与され収集に含まれる（dev/seed は会社設定済みデータのため影響なし）。
- **横断再チェック完了（2026-06-03）**: 全マイグレーションで `REFERENCES organizations` を機械的に列挙→ denormalized 組織ID列は jobs/scout_templates/message_threads/job_inquiries の**4つのみ**（列の存在監査）。organization_members は台帳本体（対象外）、`p_organization_id` は関数引数。applications/option_subscriptions/通知/favorites/user_reviews/messages に org 参照なし。**同クラスはこの4つで全数**。※ただし昇格時付与の対象は message_threads を除き client_reviews を加えた jobs/scout_templates/job_inquiries/client_reviews の4対象（2026-06-04 決定。「存在する4列」と「付与する4対象」はメンバーが異なる点に注意）。

## 降格・解約・退会の影響調査（2026-06-03）
- **降格/解約（CLI-026 系・cancel RPC）**: 組織も組織メンバーも**削除しない**。owner→`role=contractor`、admin/staff→`is_active=false`、掲載中案件→`closed` のみ（`handle_subscription_lifecycle_deleted` / billing RPC で確認）。
  - owner は受注者に降格→Middleware で CLI 系（発注者画面）ブロック→組織スコープ読み取り(CLI-007/010/020/011)は発火しない。
  - 有料降格（corporate→small/individual で client 維持）の場合、owner は単一メンバーの組織membershipを保持→org scope=自分のデータのみ＝個人と同挙動。回帰なし。
  - 評判は org_id + admin 読みのため、staff 削除後も会社合計に残る（Req 8.3 の堅牢性がそのまま効く＝むしろ利点）。
- **退会（COM-006）**: `organization_members` を全削除（Owner 含む）＋ `organizations.deleted_at` セット（withdrawal/actions.ts:222-232）。memberが消えるため backfill 対象にならず、ソフト削除組織には `deleted_at IS NULL` 条件で紐付かない。
- **結論**: 降格・解約・退会いずれも本spec の org-scoped 読み取り／backfill に新たな破綻を生まない。backfill は防御として **有効組織（deleted_at IS NULL）** のみ対象とする。

## 双方向性・網羅性の再検証（2026-06-03）
- **修正は対称**: 各修正は「閲覧者が組織所属なら `organization_id = org` で会社全体」に変えるため、owner↔staff↔他staff の**全方向を同時に解消**する。現状の `owner_id = viewer.id` 絞りは双方向の穴（社長視点で担当者分が抜ける／担当者視点で社長分も抜ける）であり、org 絞りで両方解消。
- **閲覧者ID絞りの全読み取りを棚卸し**（src/app の page.tsx で `.eq("...user.id")` / `.eq("owner_id"/"jobs.owner_id", user.id)` / `participant_*.eq`）→ 分類:
  - 自分の情報取得（profile/favorites/subscription/schedule/membership/own-applications 等）= 個人で正しい。
  - 既に org-aware（jobs/manage, scout-send picker, billing picker, jobs/[id] manage gate, jobs/[id]/applicants, received/[id], **messages/page.tsx スレ一覧=RLS依存で where無し**）。
  - 本spec で修正する6穴（CLI-007/010 received/orders, bulk-send, CON-006, CLI-011, jobs edit）。
  - **新たな穴は発見されず**。CON-008 スレ一覧・スレ詳細は RLS（participant OR is_same_org）でメンバー閲覧可、旧スレ(org_id NULL)は Req 11 backfill で会社に乗る＝別タスク不要。

## 「会社共有が自然だが個人設計」候補の網羅監査（2026-06-03）
全テーブル（約25）棚卸し。本spec の6穴（既に org 共有のデータを個人で読む＝整合バグ）とは別クラス＝「個人設計だが発注者業務として会社共有が自然な機能」を抽出:
- **favorites『見込みユーザー』(target_type='user', 発注者がお気に入りした職人)** = 明確な候補（会社の採用候補リスト）。favorites は user_id 単位・org_id 無し。CON-007 は `.eq("user_id", self)`。**決定: B（別機能として後日・本spec対象外）**。理由=個人設計のため整合バグでなく新機能＋UX判断（誰のお気に入りか/担当者が外せるか/ハート色）が要る。受注者側のお気に入り（案件・発注者）は個人維持。
- favorites 案件/発注者（発注者側）= 弱い候補（個人の下調べ寄り）。
- 通知（メール配信先）= 近いが別枠（notifications テーブル無し＝保存リストでなく配信の話）。
- それ以外は非該当: jobs/job_images/job_areas/message_threads/messages/scout_templates/job_inquiries/client_reviews=既に会社共有（本spec/backfill）、client_profiles/client_recruit_areas=会社情報、applications.client_notes=応募行に付き会社可視、subscriptions/option_subscriptions=課金owner単位、available_schedules/user_skills/user_qualifications/user_available_areas/identity_verifications=受注者個人、contacts/trouble_reports/withdrawal_surveys=個人サポート、master_*/audit_logs/stripe_webhook_events=システム。
- 保存検索・発注者私的メモ機能は存在しない（あれば候補だった）。
→ **この class の実質候補は『見込みユーザーの会社共有』のみ**。

## Risks & Mitigations
- **RLS が辞めた担当者の評価を弾く（設計レビューで検出）** — `can_view_client_review(reviewee_id)` は被評価者の現在の `organization_members` 所属で同一組織判定するため、CLI-023 で物理削除された担当者の評価行は `organization_id = org` で引いてもセッションクライアントでは RLS に弾かれ、Req 8.3 を満たせない。対策: 組織スコープの読み取りのみ admin（service-role）クライアントを使う（自組織評判の自己参照で漏洩なし）。RLS は変更しない。書き込み側 `submitContractorReportAction` は既に admin 使用済み。
- 件数（count）と一覧のスコープ不一致 — 両クエリに同一スコープを必ず適用（Req 1.4）。`!inner` 結合は applications↔jobs が to-one のため nested 取りこぼし無し。
- backfill 漏れ/誤り — 移行後に「会社の評価＝メンバー全員ぶん」を seed（staff 評価追加）で検証。個人発注者は NULL のままを確認。
- 個人プラン非回帰 — 各修正の else 分岐（owner_id/reviewee_id）で現行同一を担保。Vitest/E2E で確認。
- 型ドリフト — `supabase gen types` 再生成を移行とセットで実施。

## References
- 既存 RLS: `supabase/migrations/20260406100000_messaging_scout_status.sql`（messages org 対応）、`20260324161543_003_rls_policies.sql`（jobs update org 対応）。
- 正準パターン: `src/app/(authenticated)/jobs/manage/page.tsx`。
- 認可フォールバック: `src/app/(authenticated)/applications/received/[id]/page.tsx`。
- 集計: `src/lib/client-review/aggregate.ts`。
