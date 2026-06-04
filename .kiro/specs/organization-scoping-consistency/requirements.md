# Requirements Document

## Project Description (Input)
organization-scoping-consistency — 法人プランで「会社単位で扱うべきデータ／操作」を個人(owner_id / user.id)単位で引いているために、担当者(staff)・管理者(admin)が立てた案件ぶんが社長・他メンバーの視点から漏れる横断バグを一括で塞ぐ。

### 方針
読み取り側を会社単位に統一する。owner_id（案件を作った人）の意味はそのまま据え置き、RLS（DB権限ルール）は変更しない。既存データは原則据え置くが、**昇格時の組織ID自動付与（Req 11）のみ、昇格処理の中でその発注者の既存行に会社IDを設定する**。既に正しく動いている `jobs/manage/page.tsx` の正準パターン（organization_members を引いて orgMember があれば `.eq("organization_id", org)`、なければ `.eq("owner_id", user.id)`）に各画面を揃える。書き込み側を正規化する案（owner_id を常に組織Ownerに固定し created_by を分離）は owner_id の意味がアプリ全体に波及しリスク大のため採用しない。

### 修正対象 6件
1. **CON-006 発注者詳細の案件一覧** `src/app/(authenticated)/clients/[id]/page.tsx:122` — 現状 `.eq("owner_id", id)`。見られている発注者(id)が法人Ownerのとき担当者作成案件が「掲載中の案件」に出ない。同ファイルに `resolveTargetOrganizationId` で `targetOrgId` を既に計算済みなので、それが非nullなら `.eq("organization_id", targetOrgId)` に切替（個人発注者は従来どおり owner_id）。
2. **CLI-007 応募インボックス** `src/app/(authenticated)/applications/received/page.tsx:43,53` — 現状 `.eq("jobs.owner_id", user.id)`。閲覧者が組織メンバーなら `.eq("jobs.organization_id", org)` に。count と data の両クエリを揃える。
3. **CLI-010 発注履歴一覧** `src/app/(authenticated)/applications/orders/page.tsx:60` — 現状 `.eq("jobs.owner_id", user.id)`。同上。
4. **CLI-020 評判集計 ＋ 発注者評価の会社単位化（案C：列新設で対応）** `src/app/(authenticated)/mypage/client-profile/page.tsx` + `src/lib/client-review/aggregate.ts` の `fetchClientReputation` — 現状 reviewee_id=Owner本人のみ集計。評価は `reviewee_id=案件作成者(owner/admin/staff)` に散らばり、**評価行（`client_reviews`）に会社の鍵が無い**ため会社としてまとまらない。
   - **対応（案C・他6件と違いここだけ DB 変更あり）**: `client_reviews` に **`organization_id uuid`（nullable, REFERENCES organizations）列を新設**（＋index）。評価作成時（`submitContractorReportAction`）に案件の `jobs.organization_id` を保存（個人発注者の案件は NULL）。既存行は `client_reviews → application → job` 経由で `jobs.organization_id` を **backfill**（個人発注者ぶんは NULL のまま）。
   - **集計の変更**: `fetchClientReputation` を「会社なら `organization_id` 軸、個人発注者なら `reviewee_id` 軸」で合算するよう変更。`organization_id` は案件作成者が誰でも・メンバーが辞めても固定のため、**辞めた担当者（CLI-023 で物理削除される）のぶんも会社に残り、メンバー増減に非依存**。CLI-020 自分用サマリーで使用。
   - **将来の土台**: これは将来の「発注者ごと評価ページ」（職人の `users/[id]/reviews` 相当。自分専用か受注者公開かは未定）の**データ土台**であり、ページ自体は本spec対象外。土台を会社単位にしておけば公開/非公開どちらにも対応可能。
   - **対象外**: `user_reviews`（受注者への評価）は相手が個人のため列追加不要。
   - 既存ユニットテスト(`src/__tests__/client-review/aggregate.test.ts`)を更新。RLS `can_view_client_review` は既に(reviewer/reviewee本人/同一組織)にSELECT許可済み。`organization_id` 軸の SELECT を許可するか（公開ページ可否）は将来ページ実装時に別途検討、本specでは自分用サマリーの範囲に留める。
5. **発注内容詳細** `src/app/(authenticated)/applications/orders/[id]/page.tsx:70-72` — 現状 `if (job.owner_id !== user.id) notFound()` で組織メンバーが teammate の発注詳細を開くと404。姉妹画面 `src/app/(authenticated)/applications/received/[id]/page.tsx:63-86` の組織メンバーチェックをそのまま移植。
6. **一斉送信の宛先リスト** `src/app/(authenticated)/messages/bulk-send/page.tsx:42-44` — 現状 `.or(participant_1_id.eq.user.id, participant_2_id.eq.user.id)` で個人が当事者のスレッドだけ収集 → 法人で teammate のスレッド相手が宛先に出ない。閲覧者が組織メンバーならスレッドを organization_id 単位で収集し、「相手＝職人(participant_2)」の判定も会社スレッド向けに調整。メッセージのRLSは既に `is_same_org` で組織対応済みなので、このクエリの絞りだけを直す。

### 任意の追加1件（認可ハードニング・別種）
7. `src/app/(authenticated)/jobs/[id]/edit/page.tsx` — 所有者/組織チェックが無く SELECT RLS 任せ。公開中(open)案件なら無関係ユーザーも編集フォームを開けてしまう（保存はUPDATE RLSで不可）。CLI-002/CLI-007B と同じ `isOwner || isOrganizationMember` ガードをページ先頭に追加して塞ぐ。今回の「個人で絞りすぎ」とは逆向き(開きすぎ)の軽微な指摘だが、テーマが認可整合で揃うため同梱を推奨。

### テスト・seed
現状 seed は鈴木工務店の staff(33333333)が案件2件(888…885/886)を自分名義で所有するが応募ゼロのため、直しても画面で会社全体表示を検証できない。staff作成案件に応募1件＋発注成立＋client_review(reviewee_id=staff)を1件追加し、社長アカウントで CON-006/CLI-007/CLI-010/CLI-020/発注内容詳細 が会社全体ぶんを集約表示することを手動＋E2Eで確認する。各段階で `npm run test` / `supabase test db` / `npm run test:e2e` を実行しデグレ無しを確認。複数ロール(Owner/Admin/Staff/受注者)視点でユーザーストーリーを洗い出す。

### スコープ外（今回直さない・別軸として記録のみ）
- `scout-send/actions.ts` sendScoutAction の job_id 所有チェック欠如（セキュリティ寄りの別論点）
- `client_profiles.is_urgent_option` フラグ（vestigial の疑い、実ゲートは option_subscriptions.job_id）
- スカウト送信上限・video_workplace past_due 扱い（ビジネス仕様の確認事項）
これらは組織スコープの穴ではないため本specには含めない。

### 成果物
1つの spec、1本のPRにまとめる。

### 関連
- `client-review-completion`（PR#8 e73daf2 でCLI-020のowner単位集計の既知制約をPR本文に明記済 = 本specで対応）
- `staff-no-billing`
- organization spec REQ-ORG-011

## Introduction

ビジ友の法人プランでは、1つの発注者アカウント（管理責任者＝Owner）の下に組織管理者（Admin）・担当者（Staff）が所属し、誰でも案件を作成できる。案件には作成者を表す `jobs.owner_id`（個人）と、所属組織を表す `jobs.organization_id`（会社）の両方が保存される。

ところが一部の画面・集計が「会社単位で扱うべきデータ／操作」を `owner_id` / `user.id`（個人）単独で引いているため、**担当者・管理者が立てた案件ぶんが Owner や他メンバーの視点から漏れる**。例: 担当者が作った案件への応募が Owner の応募一覧に出ない、発注者の評判が作成者ごとに分散して会社としてまとまらない、等。本機能はこの横断バグを一括で塞ぐ。

**方針**: 読み取り側を会社単位に統一する。`jobs.owner_id` の意味（＝案件作成者）は据え置き、既存の RLS は変更しない。既に正しく動いている `jobs/manage/page.tsx` の正準パターン（`organization_members` を引いて `orgMember` があれば `.eq("organization_id", org)`、なければ `.eq("owner_id", user.id)`）に各画面を揃える。DB 変更は2つ: ①評価テーブルに会社の鍵 `client_reviews.organization_id` 列を新設（案C）②昇格処理 `ensure_organization_exists` に「その発注者の既存データへの組織ID自動付与」を追加（Req 11・全4対象＝jobs/scout_templates/job_inquiries/client_reviews・冪等・不可逆操作なし。message_threads は対象外）。

**スコープ内（7件 ＋ データ基盤 ＋ テスト整備）**:
- 読み取り/認可の会社単位化: CON-006 発注者詳細の掲載案件 / CLI-007 応募一覧 / CLI-010 発注履歴一覧 / CLI-011 発注内容詳細の認可 / CLI-014 一斉送信の宛先 / jobs/[id]/edit の認可ハードニング
- 発注者評価の会社単位化（案C・データ基盤）と CLI-020 評判集計
- **昇格時の組織ID自動付与（Req 11）**: 個人→法人昇格の処理（`ensure_organization_exists`）の中で、その発注者の組織ID未設定の既存データ（jobs / scout_templates / job_inquiries / client_reviews の**4対象**）に会社の組織IDを設定する。冪等・恒久（将来の昇格でも自動で正しくなる）・**不可逆操作なし**。1回限りの一括 backfill 移行は不要（新規ローンチは既存レガシーデータ無し）。**message_threads（チャット）は本付与の対象外**: 個人スレッドは participant_1/participant_2 の位置が役割（発注者/受注者）を表さず「発注者側スレッドだけ」を安全に選別できないため。昇格後に作成される新規スレッドは作成時点で会社IDが付与され会社共有されるため実害なし（2026-06-04 決定）

**スコープ外（本specでは扱わない）**:
- 「発注者ごと評価ページ」（職人の `users/[id]/reviews` 相当）の新規画面。本specはそのデータ基盤のみ用意し、公開/自分専用の別とRLS緩和は将来の画面実装時に決める
- `scout-send/actions.ts` sendScoutAction の job_id 所有チェック欠如（セキュリティ寄りの別論点）
- `client_profiles.is_urgent_option` フラグの整理（vestigial の疑い）
- スカウト送信上限・video_workplace の past_due 扱い（ビジネス仕様の確認事項）
- 案件作成者を組織Ownerに正規化する書き込み側の大改修（`owner_id` の意味変更はリスク大のため不採用）
- お気に入り「見込みユーザー」（発注者がお気に入りした職人）の会社共有化。favorites は個人設計（`user_id` 単位・組織ID無し）のため、整合バグではなく新機能扱い。UX 判断（誰のお気に入りか／担当者が外せるか等）が要る。**個人のまま据え置き**とし、会社共有の要望が実際に出た場合のみ別機能として再検討する（ロードマップ確定の予定機能ではない。2026-06-03 ユーザー決定: B、2026-06-04 再確認）。受注者側のお気に入り（案件・発注者）も個人のまま据え置き

## Requirements

### Requirement 1: 横断方針と不変条件（非回帰の保証）
**Objective:** As a 開発チーム, I want 会社単位化の修正が既存の個人プラン挙動や作成者情報・権限ルールを壊さないことを保証したい, so that 法人の漏れを塞ぎつつ既存ユーザーに副作用を出さない

#### Acceptance Criteria
1. The system shall `jobs.owner_id`（案件作成者）と `client_reviews.reviewee_id`（評価の被評価者＝案件作成者）を変更せず保持し、案件・評価を作成者ごとに識別可能な状態を維持する。
2. While 閲覧者が組織に所属しない個人発注者（individual / small プラン、`organization_members` に行なし）, the system shall 従来どおり `owner_id` / `reviewee_id` 基準で絞り込み、現行と同一の表示・件数を返す。
3. The system shall jobs / applications / message_threads / messages の既存 RLS ポリシーを変更しない。
4. While 同一画面の表示クエリと件数（count）クエリの両方が存在する場合, the system shall 両クエリに同一のスコープ条件（会社単位 or 個人単位）を適用し、件数とページネーションを表示内容と一致させる。
5. Where 法人プランで権限判定とUI表示範囲の両方を持つ画面, the system shall 「Owner（owner_id一致）OR 同一組織メンバー」の共通ロジックで判定し、UIに出る範囲と操作可能範囲を一致させる。
6. The system shall 担当者（Staff）の受注者アクション制限・課金主体ルール等、既存のロール制約に影響を与えない。

### Requirement 2: CON-006 発注者詳細の掲載案件を会社単位で表示
**Objective:** As a 受注者（または閲覧者）, I want 法人発注者の詳細ページで会社として掲載中の案件をすべて見たい, so that 担当者が立てた案件も取りこぼさず把握できる

#### Acceptance Criteria
1. When 閲覧している発注者（`id`）が法人組織の Owner である場合, the 発注者詳細画面 (CON-006) shall その組織（`organization_id`）に属する掲載中（`status='open'`）案件をすべて「掲載中の案件」に表示する。
2. While 閲覧している発注者が個人発注者（組織なし）の場合, the 発注者詳細画面 (CON-006) shall 従来どおり `owner_id = id` の掲載中案件のみを表示する。
3. The 発注者詳細画面 (CON-006) shall 対象組織の解決に既存の `resolveTargetOrganizationId`（既算出の `targetOrgId`）を再利用する。
4. While 担当者が作成した案件をカードに表示する場合, the 発注者詳細画面 (CON-006) shall 会社の表示名（`client_profiles.display_name` 由来の `displayName`）を案件カードの発注者名として表示する。

### Requirement 3: CLI-007 応募一覧（未対応インボックス）を会社単位で表示
**Objective:** As a 発注者（Owner / Admin / Staff）, I want 会社宛の未対応の応募をひとつの一覧で見たい, so that 担当者宛の応募も含めて会社として対応漏れを防げる

#### Acceptance Criteria
1. While 閲覧者が組織に所属する場合, the 応募一覧 (CLI-007) shall 自組織（`jobs.organization_id`）に属する全案件への `status='applied'` の応募を表示する。
2. While 閲覧者が個人発注者の場合, the 応募一覧 (CLI-007) shall 従来どおり `jobs.owner_id = user.id` の `status='applied'` 応募のみを表示する。
3. The 応募一覧 (CLI-007) shall 件数クエリと一覧クエリに同一スコープを適用し、表示件数とページネーションを一致させる。
4. The 応募一覧 (CLI-007) shall `status='applied'` のみを対象とする既存の役割分担（判断済みは CLI-010）を維持する。

### Requirement 4: CLI-010 発注履歴一覧を会社単位で表示
**Objective:** As a 発注者（Owner / Admin / Staff）, I want 会社の発注履歴（発注可否決定後の応募）をまとめて見たい, so that 担当者が進めた取引も会社として一元的に管理できる

#### Acceptance Criteria
1. While 閲覧者が組織に所属する場合, the 発注履歴一覧 (CLI-010) shall 自組織（`jobs.organization_id`）に属する全案件への `status ≠ 'applied'` の応募を表示する。
2. While 閲覧者が個人発注者の場合, the 発注履歴一覧 (CLI-010) shall 従来どおり `jobs.owner_id = user.id` の応募のみを表示する。
3. The 発注履歴一覧 (CLI-010) shall 既存のステータスフィルタ（発注済み / 評価登録済み / 評価登録未入力 / キャンセル・お断り / 取引完了）を会社単位スコープの上で正しく動作させる。

### Requirement 5: CLI-011 発注内容詳細の認可を組織メンバーに拡張
**Objective:** As a 発注者（Owner / Admin / Staff）, I want 同じ会社の担当者が進めた発注の詳細を開きたい, so that 会社のメンバーとして互いの発注内容を確認できる

#### Acceptance Criteria
1. When 閲覧者が対象案件の Owner（`job.owner_id = user.id`）である場合, the 発注内容詳細 (CLI-011) shall 詳細を表示する。
2. When 閲覧者が対象案件の組織（`job.organization_id`）のメンバーである場合, the 発注内容詳細 (CLI-011) shall 詳細を表示する。
3. If 閲覧者が Owner でも組織メンバーでもない場合, then the 発注内容詳細 (CLI-011) shall `notFound()`（404）を返す。
4. The 発注内容詳細 (CLI-011) shall 姉妹画面 CLI-008（応募詳細 `applications/received/[id]`）と同一の認可ロジックを用いる。

### Requirement 6: CLI-014 一斉送信の宛先を会社単位で収集
**Objective:** As a 発注者（Owner / Admin / Staff）, I want 会社としてやり取り中のすべての職人を一斉送信の宛先候補に出したい, so that 担当者が始めた会話の相手にも会社として一斉送信できる

#### Acceptance Criteria
1. While 閲覧者が組織に所属する場合, the 一斉送信 (CLI-014) shall 自組織（`message_threads.organization_id`）に属する全スレッドの相手（職人）を宛先候補として収集する。
2. While 閲覧者が個人発注者の場合, the 一斉送信 (CLI-014) shall 従来どおり自分が当事者であるスレッドの相手のみを宛先候補とする。
3. When 組織スレッドから宛先を決定する場合, the 一斉送信 (CLI-014) shall 相手（職人）を `participant_2` として特定する。
4. The 一斉送信 (CLI-014) shall 同一の職人を宛先候補に重複表示しない。
5. The 一斉送信 (CLI-014) shall メッセージ系の既存 RLS（`is_same_org` で組織対応済み）を前提とし、クエリの絞り込みのみを会社単位に変更する。

### Requirement 7: 発注者評価の会社単位化（データ基盤・案C）
**Objective:** As a 発注者（会社）, I want 誰が作った案件への評価でも会社としてまとまる土台がほしい, so that 将来の発注者評価ページを会社単位で正しく作れる

#### Acceptance Criteria
1. The system shall `client_reviews` テーブルに nullable な `organization_id`（`organizations` への参照）列を新設し、索引を付与する。
2. When 受注者→発注者評価が作成される（`submitContractorReportAction`）場合, the system shall 対象応募の案件の `jobs.organization_id` を `client_reviews.organization_id` に保存する。
3. While 評価対象の案件が個人発注者の案件（`organization_id` が NULL）の場合, the system shall `client_reviews.organization_id` を NULL のまま保存する。
4. The system shall 既存の `client_reviews` 行の `organization_id` を、`client_reviews → applications → jobs.organization_id` を辿る移行（backfill）で埋める。
5. The system shall `client_reviews.reviewee_id`（案件作成者）を変更せず保持し、会社集計を作成者ごとに内訳分解できる状態を維持する。
6. The system shall `user_reviews`（受注者への評価）には `organization_id` 列を追加しない（被評価者が常に個人のため）。
7. The system shall 本specの範囲では `client_reviews` の既存 RLS を変更せず、`organization_id` 軸の第三者公開（公開評価ページ）は将来の画面実装時に別途検討する。

### Requirement 8: CLI-020 評判集計を会社単位に
**Objective:** As a 発注者（Owner / Admin / Staff）, I want 自社の評判（また仕事を受けたい：good／合計）が会社全体で集計されてほしい, so that 担当者の案件への評価も含めた正しい評判を確認できる

#### Acceptance Criteria
1. While 閲覧者が組織に所属する場合, the 評判集計 (`fetchClientReputation`) shall `client_reviews.organization_id = 閲覧者の組織` の評価を会社全体で合算する。
2. While 閲覧者が個人発注者の場合, the 評判集計 (`fetchClientReputation`) shall 従来どおり `reviewee_id = 閲覧者` の評価を合算する。
3. When 評価に寄与した担当者が組織から削除（CLI-023）された後でも, the 評判集計 (`fetchClientReputation`) shall その担当者の案件への評価を会社の合計に含め続ける（`organization_id` が案件固定のため）。
4. The 発注者情報詳細 (CLI-020) shall 集計結果（good 件数／合計件数）を従来どおりの表示形式で表示する。
5. The system shall `fetchClientReputation` の引数・分岐に合わせて既存ユニットテスト（`src/__tests__/client-review/aggregate.test.ts`）を更新する。

### Requirement 9: jobs/[id]/edit の認可ハードニング
**Objective:** As a 発注者（Owner / Admin / Staff）, I want 案件編集フォームを権限のある会社メンバーだけが開ける状態にしたい, so that 無関係なユーザーが他者の案件編集フォームを開けないようにする

#### Acceptance Criteria
1. When 閲覧者が対象案件の Owner または組織メンバーである場合, the 案件編集画面 (jobs/[id]/edit) shall 編集フォームを表示する。
2. If 閲覧者が Owner でも組織メンバーでもない場合, then the 案件編集画面 (jobs/[id]/edit) shall `notFound()`（404）を返す。
3. The 案件編集画面 (jobs/[id]/edit) shall CLI-002 / CLI-007B と同一の認可ロジック（`isOwner || isOrganizationMember`）を用いる。

### Requirement 10: seed 整備・テスト・複数ロール検証
**Objective:** As a 開発チーム, I want 会社単位表示を実データで検証できる seed とテストを整えたい, so that 修正が確実に効いていることとデグレが無いことを確認できる

#### Acceptance Criteria
1. The system shall seed に「担当者（staff）が作成した案件への応募 → 発注成立（accepted）→ `reviewee_id=staff` の `client_review`」を最低1件用意する。
2. When Owner アカウントで CON-006 / CLI-007 / CLI-010 / CLI-011 / CLI-020 を表示した場合, the テスト shall 担当者ぶんを含む会社全体のデータが集約表示されることを検証する。
3. The テスト shall Owner / Admin / Staff / 受注者 の各視点でユーザーストーリー（正常系・境界）を洗い出してカバーする。
4. The 開発チーム shall 各段階で `npm run test` / `supabase test db` / `npm run test:e2e` を実行し、全テストがパス（デグレ無し）することを確認する。
5. The system shall 個人発注者の seed/テストで従来挙動（会社単位化されないこと）を検証する。
6. The system shall `seed.sql` の `client_reviews` 各行に対応案件の会社（法人案件は `organization_id`、個人発注者案件は NULL）を明示設定する。理由: 昇格時の組織ID自動付与は live の昇格経路でのみ走り、seed の会社（既に法人設定済み）には走らないため、seed 行は org_id を明示しないと組織スコープ集計に現れない。
7. The system shall 個人発注者（`organization_id` NULL）の `client_review` を seed に最低1件用意し、Req 10.5 の非回帰検証（`reviewee_id` 軸集計）に用いる。

### Requirement 11: 昇格時の組織ID自動付与（既存データの会社紐付け）
**Objective:** As a 発注者（会社）, I want 個人→法人に昇格したその時点で自分の既存データが会社に紐付いてほしい, so that 昇格前データも会社単位の表示・共有から漏れず、かつ将来どの昇格でも自動で正しくなる（後から手当てが要らない）

#### Acceptance Criteria
1. When 個人→法人昇格で組織が用意される（`ensure_organization_exists`）場合, the system shall その発注者が所有する `organization_id` 未設定（NULL）の `jobs` / `scout_templates` / `job_inquiries`（`target_organization_id`）に当該組織IDを設定する。
2. The system shall 昇格時の組織ID自動付与の対象に `message_threads`（チャット）を**含めない**。理由: 個人スレッドは participant_1/participant_2 の位置が役割（発注者/受注者）を表さず（発注者・受注者の双方が `messages/new` からスレッドを開始できる）、「発注者側スレッドだけ」を安全に選別できないため。昇格後に作成される新規スレッドは作成時点で `organization_id` が付与され会社共有されるため、実運用上の欠落は生じない（2026-06-04 決定）。
3. The system shall `client_reviews` を `jobs` の紐付け後に処理し、当該発注者の案件（紐付け済み）に対応する評価の `organization_id` を設定する。
4. While 対象が組織を持たない個人発注者の場合, the system shall いずれの組織IDも設定しない（NULL 維持・誤紐付け防止）。
5. The system shall 紐付けを冪等（`organization_id IS NULL` の行のみ対象）に実装し、昇格処理の中で実行する（再呼び出し・再昇格でも安全）。
6. The system shall 一括の1回限りバックフィル移行を必須要件としない（新規ローンチは既存レガシーデータが無く、昇格時付与で全ケースを恒久対応するため）。昇格時付与（4対象）の正しさは pgTAP（`BEGIN/ROLLBACK`・専用UUID）で自動回帰検証し、加えて代表データで「昇格→既存データ紐付け」を手動検証する。
