# Implementation Plan — admin（管理者機能）

> 管理者機能 全24画面（ADM-001〜024）の実装。基盤（DB 2点＋共有ユーティリティ）→ 認証・シェル → ドメイン別画面 → seed → E2E → 最終ゲートの順に進める。
> 並列実行可能なタスクには `(P)` を付与（独立ファイル・データ依存なし）。
> デザインカンプが存在する画面は `design-assets/screens/ADM-XXX.png` を実装前に必ず確認する（カンプなし: ADM-007 / 015 / 016〜024 → 同機能グループの他画面スタイルに合わせる）。
> 仕様変更⑤（CLI-021 法人 setup の「社名のみ必須」緩和）は billing spec 側で別管理のため本タスクには含まない（requirements の前方参照どおり）。

- [x] 1. 着手前デグレ防止ゲート（既存テスト全実行）
  - `npm run test`（Vitest）/ `supabase test db`（pgTAP）/ `npm run test:e2e`（Playwright）を順に実行し、全てパスすることを確認する
  - 失敗がある場合は原因を調査・修正してから以降の実装に着手する。修正した場合は原因と対策を CLAUDE.md の「実装時の必須チェック項目」に追記する
  - _Requirements: 001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 010B, 011, 012, 013, 014, 015, 016, 017, 018, 019, 020, 021, 022, 023, 024_

- [x] 2. DB 変更（マイグレーション2点＋pgTAP）
- [x] 2.1 (P) applications にキャンセル実行者カラムを新設する
  - `applications.cancelled_by`（text、CHECK で 'contractor' / 'admin' のみ）を追加するマイグレーションを作成する。NULL 許容・インデックス不要
  - 既存の cancelled 行を 'contractor' でバックフィルする（現状キャンセルは受注者のみ可能なため矛盾なし）
  - 受注者の自力キャンセル Server Action（cancelApplicationAction）の UPDATE に `cancelled_by: 'contractor'` の記録を追加する
  - pgTAP: CHECK 制約の値域・バックフィル結果（cancelled 行が 'contractor' になっていること）を検証する
  - `supabase gen types` で型を再生成する
  - _Requirements: 013, 014_

- [x] 2.2 (P) 代理メッセージ監督用の admin_proxy_threads ビューを新設する
  - `is_proxy = true` のメッセージを1件以上含むスレッドのみを集約するビュー（thread_id / organization_id / contractor_id / last_message_at / proxy_count、`HAVING bool_or(is_proxy)`）を作成する
  - anon / authenticated からのアクセスを REVOKE し、service_role（admin client）専用にする
  - pgTAP: anon / authenticated から SELECT 不可であること・is_proxy を含まないスレッドがビューに現れないことを検証する
  - 集約コスト増大時は materialized view 化を検討する旨をモジュールコメントに記載する
  - _Requirements: 023, 024_

- [x] 3. 共有ユーティリティ（横断部品）
- [x] 3.1 (P) 日時表示の統一フォーマット関数を追加する
  - ISO 文字列を「2026/06/10 14:30」形式に変換する `formatDateTime` を `src/lib/utils/format-date.ts` に追記する
  - **タイムゾーンは Asia/Tokyo を明示**して変換する（本番サーバーは UTC のため、明示しないと全画面の日時が9時間ズレる）
  - null / 不正入力は fallback（既定「—」）を返す
  - Vitest: UTC 入力で9時間ズレないこと・null / 不正入力の fallback を検証する
  - 全 admin 画面の日時表示はこの関数を必ず使用する（生 ISO 表示禁止の共通ルール）
  - _Requirements: 016, 017, 018, 019, 020, 021, 023, 024_

- [x] 3.2 (P) 監査ログの共有化と既存バグ修正・動画 Action への監査追記
  - login/actions.ts の writeAuditLog を `src/lib/audit/log.ts` に抽出し、AuditAction 型（identity_access / identity_approve / identity_reject / account_delete / admin_client_invite / application_cancel_admin / admin_password_change / admin_memo_update / video_url_update ＋既存の auth.login.success / failure）を単一情報源として定義する
  - **INSERT を createAdminClient()（service_role）に変更する**: audit_logs は INSERT ポリシーが無くセッションクライアントからの INSERT は全件サイレント失敗する既存バグを本抽出で同時修正する
  - writeAuditLog 自体の失敗は throw しない（監査の失敗で業務を止めない。ログには残す）
  - 既存の動画更新 Server Action 2本（updateVideoUrlAction / updateWorkplaceVideoUrlAction）に audit log（video_url_update）を追記する（「管理者の全操作を監査ログに記録」要件）
  - audit 追記に伴い、既存の `src/__tests__/admin/video-actions.test.ts` のモック・期待値を更新する
  - pgTAP: authenticated からの audit_logs INSERT が拒否されること（service_role のみ書ける現行設計の固定）を検証する
  - _Requirements: 001, 004, 005, 007, 009, 010, 010B, 012, 013, 014, 015_

- [x] 3.3 (P) 署名付きURL生成と監査記録の一体化ヘルパーを新設する
  - 非公開バケット（identity-documents / ccus-documents / support-attachments / message-attachments）のパス群から署名付きURL（有効期限1時間）を一括生成する `getSignedDocumentUrls` を `src/lib/admin/signed-urls.ts` に新設する
  - audit オプション指定時は audit_logs に identity_access（metadata に document_type）を INSERT する（書類アクセスの記録漏れを構造的に防止）
  - _Requirements: 012, 017, 019, 024_

- [x] 3.4 退会カスケードの共有関数抽出と Stripe 解約の新規実装
  - withdrawAction から C案カスケード退会（対象のソフトデリート＋auth ban＋Owner の場合の配下メンバー連動凍結・org ソフトデリート・members 削除＋Stripe 解約）を `executeWithdrawal` として抽出する（recordSurvey / cancelledBy パラメータ付き）
  - 退会前ガード（applied / accepted 応募あり・受注者作業中の案件あり → 拒否）は本人退会・admin 削除の両方で適用する（エラー文言は admin 画面にそのまま表示）
  - DB 書き込みはすべて createAdminClient()（service_role）に書き換える（現実装はセッションクライアント＝本人前提）
  - カスケード内で cancelled にする応募に cancelledBy を記録する（タスク2.1 のカラムを使用）
  - **Stripe 解約（stripe.subscriptions.cancel）を新規実装する**: subscriptions / option_subscriptions の stripe id を参照して解約。現 withdrawAction の解約処理は TODO スタブで本人退会でも解約されていない既存ギャップを同時解消する。解約失敗は削除をブロックしない（ログのみ）
  - セッション signOut・退会完了メールは共有関数に含めず呼び出し側の責務とする（本人退会: 両方実行／admin 削除: どちらも行わない）
  - withdrawAction を `executeWithdrawal({ recordSurvey: true, cancelledBy: "contractor" })` ＋ signOut ＋退会完了メールの薄いラッパーに書き換える
  - Vitest: Stripe 解約が正しい id で呼ばれること・失敗しても削除が完了すること。**抽出後に既存の退会系 Vitest / E2E を必ず全実行**する（リファクタ回帰の担保）
  - 依存: タスク2.1（cancelled_by カラム）・タスク3.2（writeAuditLog）完了後に着手
  - _Requirements: 004, 009_

- [x] 3.5 admin 専用8分類モジュールを新設する
  - `src/lib/admin/application-status.ts` に、status＋初回稼働日＋cancelled_by から導出する8分類（応募中／発注済み・初回稼働日前／評価未入力／取引完了／取引不成立／ユーザー側からのキャンセル／運営によるキャンセル／発注側からのお断り）の判定とラベルを実装する
  - 行バッジ用の純粋関数 `classifyAdminApplication`（today は呼び出し側から注入）、フィルタ用の WHERE 変換 `applyCategoryFilter`、発注取消可否 `canAdminCancel` を同一モジュールに置き、判定のズレを構造的に防ぐ
  - `first_work_date IS NULL` の accepted は「発注済み・初回稼働日前」に含める。当日判定は JST 日付文字列比較で統一する
  - 前提（両者の評価が揃うと status が completed / lost に自動遷移する既存実装）をモジュール先頭コメントに明記する
  - Vitest: 8分類×境界値（当日・前日・null・cancelled_by null）を網羅する
  - 依存: タスク2.1（cancelled_by カラム・型再生成）完了後に着手
  - _Requirements: 013, 014_

- [x] 4. 管理者認証・シェル（ADM-001 / 002 / 015＋Middleware）
- [x] 4.1 (P) ADM-001 管理者専用ログイン画面を新規実装する
  - デザインカンプ: `design-assets/screens/ADM-001.png`
  - `/admin/login` にメール＋パスワードのログイン画面と adminLoginAction を実装する。成功時は `/admin/dashboard` へ
  - **ルート構成の罠（必ず守ること）**: 既存 `src/app/admin/layout.tsx` は未認証・非 admin を redirect する認可ガードを持つため、`/admin/login` をこのレイアウト配下に置くと**ログイン画面自体が表示できない**（開いた瞬間にリダイレクトされる）。ガード付きレイアウトを route group（例: `src/app/admin/(protected)/layout.tsx`）へ移し、既存ページ（dashboard / users 配下）をその中に移動して、`/admin/login` はガードの外に置くこと（route group は URL に影響しないため既存 URL・既存 E2E はすべて不変）。あわせてガードの redirect 先を `/login` → `/admin/login` に変更する
  - 非 admin が正しい資格情報でログインした場合も signOut() してから**資格情報エラーと同一文言**（「メールアドレスまたはパスワードが正しくありません」1種類のみ）を返す（アカウント存在・権限の推測を防止）
  - 成功 / 失敗とも audit log を記録する（失敗時メールはマスク）。「パスワードを忘れた方はこちら」リンク → 既存 `/reset-password` フロー流用
  - 一般 `/login` の「admin → /admin/dashboard」分岐は現状維持（回帰リスク回避）
  - Vitest: 非 admin 拒否が資格情報エラーと同一文言であること・signOut されること・audit log 記録を検証する
  - _Requirements: 001_

- [x] 4.2 Middleware を変更する（4点のみ・他のルーティング不変更）
  - `/admin/login` を未認証許可パスに追加（auth ページ扱い）
  - 未認証の `/admin/*`（login 以外）→ `/admin/login` へ redirect（現状の `/login` 行きから変更）
  - 認証済み admin の `/admin/login` → `/admin/dashboard` へ redirect。認証済み非 admin の `/admin/*` ブロック（→ /mypage）は現状維持
  - Vitest: middleware ルーティングのテストは**本体定数を import** する（テスト内コピー禁止ルール）。既存の `src/__tests__/auth/middleware-routing.test.ts` の期待値を新ルーティング（未認証 /admin/* → /admin/login）に合わせて更新する
  - 依存: タスク4.1（/admin/login ページ）完了後に着手（redirect 先が 404 にならないように）
  - _Requirements: 001_

- [x] 4.3 (P) AdminShell のログアウト導線と ADM-002 ダッシュボードを実装する
  - デザインカンプ: `design-assets/screens/ADM-002.png`
  - `src/app/admin/layout.tsx` のヘッダーバーに ①ダッシュボードへ戻るリンク ②ログアウトボタン（`<form action={adminLogoutAction}>`、`type="submit"` 明示）を追加し、全 admin 画面からログアウト導線に到達できるようにする
  - adminLogoutAction（signOut → `/admin/login` へ redirect）を admin 専用に新設する（既存の `src/app/admin/actions.ts`〔動画 Action あり〕に追記。一般ユーザー用 logoutAction は流用しない）
  - ADM-002（`/admin/dashboard`）は video-display spec の最小実装（「ユーザーアカウント一覧」1メニューのみ）が**既に存在する**ため、既存ページを9メニュー（発注者一覧／ユーザー一覧／本人確認／応募履歴／お問い合わせ／トラブル報告／求人問い合わせ／メッセージ一覧＝全社／パスワード変更）＋ログアウトの縦並びリンク構成に置き換える。件数表示・ダッシュボード数値は付けない
  - 既存 E2E（`e2e/video-display.spec.ts`）がダッシュボードの「ユーザーアカウント一覧」リンクをクリックで辿るため、このリンク文言は変えない（変える場合は E2E も同時更新）
  - _Requirements: 002_

- [x] 4.4 (P) ADM-015 管理者パスワード変更を実装する
  - デザインカンプなし（同機能グループのスタイルに合わせる）
  - `/admin/password` に 現在のパスワード（必須）／新パスワード（8文字以上）／確認（一致）の3項目フォームを実装する
  - Server Action: admin role 再チェック → signInWithPassword で現在値照合 → updateUser で更新 → audit log（admin_password_change）→ 成功メッセージをインライン表示（遷移しない）
  - _Requirements: 015_

- [x] 5. 発注者アカウント管理（ADM-003 / 004 / 005）
- [x] 5.1 (P) 発注者一覧のクエリロジックと区分・プラン導出を実装する
  - `src/lib/admin/clients-list.ts` に一覧取得（fetchClientListPage）を新設し、page から分離して Vitest 可能にする
  - 対象: `role IN ('client','staff')` を人単位1行で表示。退会済みも含める（「退会済み」表示）。代理アカウントも担当者行として含める
  - 契約主体の解決: client → 本人、staff → organization_members → organizations.owner_id。行クリック遷移先は常に契約主体の userId
  - 区分の導出（管理責任者／組織管理者／担当者／個人発注者／小規模発注者。判定不能は「—」）・プラン列・オプションバッジ（契約主体の active な urgent / video_workplace）を純粋関数に切り出す
  - フィルタは ID 集合の積パターン（CLI-005 基準実装と同型）でサーバー側完結: keyword（氏名・メール・会社名）× 区分（単一選択）× オプション（単一選択）
  - 行の付加情報（会社名・プラン・バッジ）は20行分の契約主体 id をまとめてバッチ取得（N+1 禁止）
  - Vitest: 区分／プラン導出関数を role × org_role × plan の組合せで網羅する
  - _Requirements: 003_

- [x] 5.2 ADM-003 発注者アカウント一覧画面を実装する
  - デザインカンプ: `design-assets/screens/ADM-003.png`
  - `/admin/clients` に一覧（氏名・会社名・メール・区分・プラン・オプションバッジ・退会済み表示）＋キーワード検索＋2枠フィルタ（区分／オプション・各単一選択）＋20件ページングを実装する（searchParams を Single Source of Truth に）
  - 並び順は登録日時の新しい順。「管理責任者 新規登録」ボタン → `/admin/clients/new`
  - 行クリック → `/admin/clients/{契約主体userId}`（スタッフ行は所属組織 Owner のページへ解決）
  - 依存: タスク5.1 完了後に着手
  - _Requirements: 003_

- [x] 5.3 ADM-004 発注者アカウント詳細（会社単位1ページ）と削除を実装する
  - デザインカンプ: `design-assets/screens/ADM-004.png`（ヘッダーは admin 共通レイアウトを使用。カンプの LOGO／ハンバーガー／＜ は使わない）
  - `/admin/clients/[id]` に requirements の13セクション（編集ボタン／管理者メモ／オプション加入状況／発注者情報＋プラン／職場紹介動画＋投稿ボタン→ADM-010B／基本情報／メッセージ閲覧／評判／担当者一覧／募集現場一覧＋集計／代理メッセージを見る／アカウント削除／もどる）を順に実装する
  - `role='client'` 以外は notFound()。退会済みの契約主体も表示する（「退会済み」表示＋削除・編集・動画投稿ボタンは非表示）
  - 集計スコープは org-scoping 準拠（法人= organization_id 単位、個人・小規模= owner_id 単位）。評判は fetchClientReputation、表示名は resolveParticipantName / client_profiles.display_name を流用する
  - 募集現場一覧: jobs（全ステータス・バッジ付き）＋案件ごとの応募数（job_id 集合で1クエリ count → JS 集計）＋会社合計。各現場 → ADM-022、応募数 → `/admin/applications?jobId=`
  - 担当者一覧（法人のみ）: 氏名／メール／区分／招待中バッジ（password_set_at IS NULL）。閲覧のみ
  - 代理メッセージを見る（法人かつ admin_proxy_threads に当該 org の行がある場合のみ）→ `/admin/messages?organizationId={orgId}`
  - アカウント削除: 確認ダイアログ（配下スタッフ連動削除の警告文）→ deleteClientAccountAction → `executeWithdrawal({ recordSurvey: false, cancelledBy: "admin" })` ＋ audit log（account_delete、metadata に cascade 対象数）→ `/admin/clients` へ。進行中取引ガードのエラー文言はそのまま表示する
  - ADM-010B（職場紹介動画投稿）の「もどる」を ADM-004 へ向ける
  - 募集現場一覧から ADM-022（募集現場詳細）への導線はタスク7実装後に疎通する（タスク7は並行実装可。それまでリンク先は一時404でよく、最終ゲートで遷移確認する）
  - 依存: タスク3.2 / 3.3 / 3.4 / 5.1 完了後に着手
  - _Requirements: 004, 010B, 022, 023_

- [x] 5.4 (P) ADM-005 発注者アカウント編集（管理者メモ）を実装する
  - デザインカンプ: `design-assets/screens/ADM-005.png`
  - `/admin/clients/[id]/edit` に admin_memo テキストエリア1項目のみの編集フォームと updateAdminMemoAction を実装する（max 2000 文字程度の上限のみ）
  - 保存成功で ADM-004 へ遷移＋audit log（admin_memo_update）を記録する
  - 急募オプションの編集は持たない（加入状態の確認は ADM-004 の閲覧表示で行う）
  - _Requirements: 005_

- [x] 6. 管理責任者 招待フロー（ADM-006 / 007＋横断変更）
- [x] 6.1 (P) ADM-006/007 招待フォームと作成 Server Action を実装する
  - デザインカンプ: `design-assets/screens/ADM-006.png`（ADM-007 はカンプなし・確認画面）
  - `/admin/clients/new` の1ルート内で「入力（会社名・姓・名・メール、全て必須）→ 確認」を useState の段階的表示で実装する。「作成する」`type="submit"`、「修正する」「もどる」は `type="button"`
  - createClientInviteAction: admin role 再チェック → Zod → public.users で email 重複事前チェック（重複時「このメールアドレスは既に登録されています」）→ `inviteUserByEmail(email, { data: { invited_last_name, invited_first_name, invited_company_name }, redirectTo })` → audit log（admin_client_invite）→ ADM-003 へ redirect
  - **metadata に invited_role は付けない**（handle_new_user トリガーの staff 化防止。role は contractor のまま）。redirectTo は既存スタッフ招待と同じ `/accept-invite/confirm`（implicit flow。host header から動的構築）
  - 招待メール送信失敗時は `auth.admin.deleteUser()` でクリーンアップ（幽霊アカウント防止）。その他エラーは「アカウントの作成に失敗しました。時間をおいて再度お試しください」
  - 作成するのは auth アカウント＋招待のみ（role=client・組織・課金レコードは作らない。発注者化は本人の決済時）
  - Vitest: 重複メール拒否／invite 失敗時の deleteUser クリーンアップ／metadata に invited_role が**含まれない**ことを検証する
  - _Requirements: 006, 007_

- [x] 6.2 (P) 招待後の遷移分岐と決済 Webhook の会社名反映を実装する
  - acceptInviteAction 拡張: パスワード保存成功後、`user_metadata.invited_company_name` が存在する場合は遷移先を `/billing/plans`（CLI-026）にする（受注者オンボのスキップ。スタッフ招待は従来どおり）
  - checkout Webhook（plan 分岐）拡張: **RPC 呼び出しの「前」に** getUserById で metadata を読み、invited_company_name があれば client_profiles に `{ user_id, display_name: 会社名 }` を **ignoreDuplicates upsert** してから RPC を呼ぶ（RPC が display_name を姓名で必ず埋めるため「後から未設定なら反映」では成立しない。冪等: Webhook 再実行・本人編集済みでも上書きしない）
  - Vitest: invited_company_name あり → RPC より先に会社名で upsert されること／本人編集済み display_name を上書きしないことを検証する
  - 変更対象の既存テストを同時更新する: `src/__tests__/organization/accept-invite-action.test.ts`（遷移分岐の追加）・`src/__tests__/billing/webhook/handle-checkout-completed.test.ts`（会社名 upsert ステップの追加）
  - CLAUDE.md の CLI-005/006 セクション・seed ルールに「招待ユーザーはスキル・対応エリア未登録の contractor / client という正当な例外がある」旨を追記する（表示が壊れることはなく許容）
  - _Requirements: 007_

- [x] 7. (P) ADM-022 募集現場詳細（admin 閲覧専用）を実装する
  - デザインカンプなし（CON-003 のセクション構成を参考。データ取得は admin client で独立＝既存画面に分岐を足さない・案B）
  - `/admin/jobs/[id]` に閲覧専用 RSC を実装する: 案件内容（タイトル・ステータス・募集職種/人数・報酬レンジ・募集期間・工事期間・エリア=AreaList・詳細・添付）＋発注者名（resolveParticipantName）
  - 発注者操作（編集・発注）は持たない。存在しない id は notFound()
  - 導線: 「応募一覧」→ `/admin/applications?jobId={id}`、「発注者詳細」→ ADM-004、もどる → router.back()
  - _Requirements: 022_

- [x] 8. ユーザーアカウント管理（ADM-008 / 009 / 010）
- [x] 8.1 (P) ADM-008 ユーザーアカウント一覧を改修する
  - デザインカンプ: `design-assets/screens/ADM-008.png`
  - 対象を `role IN ('contractor', 'client')` に絞る（staff / admin 除外。現実装の role 無絞りを修正）
  - オプションフィルタを3択（受注者PR動画 / 補償¥5,000 / 補償¥9,800）に変更し、video_workplace を選択肢から削除する（職場紹介動画は ADM-003 側へ）
  - カンプ準拠のスタイル仕上げ（退会済みは「※退会済み」表示で含める）
  - 既存 E2E（`e2e/video-display.spec.ts`）が「キーワード」検索欄と email の行リンクで対象ユーザーに辿り着くため、これらの UI を維持する（変える場合は E2E も同時更新）
  - _Requirements: 008_

- [x] 8.2 (P) 評価表示の共有部品を抽出する
  - `/users/[id]/reviews/page.tsx` のインライン実装（項目ごとの★平均＋評価件数のサマリー、補足コメント一覧）を `src/components/reviews/` の共有部品に抽出する（コピーしない）
  - 既存の評価詳細ページが抽出後も同一表示で動作することを確認する（既存 E2E 確認）
  - _Requirements: 009_

- [x] 8.3 ADM-009 ユーザーアカウント詳細を改修する
  - デザインカンプ: `design-assets/screens/ADM-009.png`
  - 追加表示: ①発注者からの評価＝fetchPerItemSummary＋StarRatingDisplay（★×5 7項目平均＋件数。評価詳細ページと同表示） ②評価の補足コメント一覧（20件ページング・searchParams commentsPage） ③経験年数＝CLI-006 と同じ「{職種} {N}年」表記（年数未入力の職種は年数を出さない）
  - 職場紹介動画ボタンを撤去する（入口は ADM-004 へ移設済み）。受注者PR動画ボタン（active video のみ表示）→ ADM-010 は現状維持
  - `role='contractor'` のみ「アカウントを削除する」（確認ダイアログ → deleteUserAccountAction → executeWithdrawal＋audit log → `/admin/users` へ）。`role='client'` は削除ボタンを出さず「発注者詳細（ADM-004）」への導線を表示。Server Action 側でも client を拒否する（UI と二重防御。削除は ADM-004 に一本化）
  - ADM-010（`design-assets/screens/ADM-010.png`）は video-display でカンプ準拠済みのため表示確認のみ（監査追記はタスク3.2 で実施済み）
  - カンプ準拠のスタイル仕上げ
  - **既存 E2E の書き換え**: `e2e/video-display.spec.ts` の「ADM-009 で職場紹介動画オプション加入者には職場紹介投稿ボタンが出る」テストは、ボタン撤去によりこのままでは失敗する。ADM-004（発注者詳細）経由の導線（タスク5.3 で実装）に書き換える
  - 依存: タスク3.4（executeWithdrawal）・タスク8.2（共有部品）・タスク5.3（ADM-004 の動画導線）完了後に着手
  - _Requirements: 009, 010_

- [x] 9. 本人確認承認（ADM-011 / 012）
- [x] 9.1 (P) ADM-011 本人確認承認申請一覧を実装する
  - デザインカンプ: `design-assets/screens/ADM-011.png`
  - `/admin/verifications` に `status='pending'` のみを `created_at ASC`（古い順）で20件ページング表示する
  - 各行: 氏名・年齢（calculateAge）・メール・種別ラベル（document_type: identity →「本人確認」/ ccus →「CCUS」）＋「全○○件」表示
  - 行クリック → `/admin/verifications/[id]`
  - _Requirements: 011_

- [x] 9.2 (P) 本人確認の通知メールテンプレート2本を新設する
  - `src/lib/email/templates/verification-approved.ts` / `verification-rejected.ts` を新設する（document_type で「本人確認」/「CCUS」を差し込む共用テンプレ。scout-notification の HTML 構成踏襲）
  - 否認テンプレは再提出依頼の文面＋否認理由を含める
  - _Requirements: 012_

- [x] 9.3 ADM-012 本人確認承認可否を実装する
  - デザインカンプ: `design-assets/screens/ADM-012.png`
  - RSC が getSignedDocumentUrls（1時間・audit 付き）で書類URLを生成して表示する（**画面を開いた時点で audit_logs に identity_access が記録される**）
  - 両セクションの状態は自動決定: identity 審査中 → CCUS 側「未申請」グレーアウト／ccus 審査中 → 本人確認側は画像＋「承認済み」（ボタン非表示）
  - ボタン活性条件を requirements どおり実装: 本人確認＝承認は常時活性・否認は否認理由入力時のみ。CCUS＝承認は identity_verified=true の場合のみ・否認は同条件＋否認理由入力時のみ
  - approveVerificationAction: pending 楽観チェック（審査済みなら「既に審査済みです」）→ status='approved'＋reviewed_by/reviewed_at＋users フラグ更新（ccus は ccus_worker_id も反映）→ audit log（identity_approve）→ 通知メール（fire-and-forget・失敗してもロールバックしない）→ ADM-011 へ
  - rejectVerificationAction: 否認理由（必須・max 1000）→ status='rejected'＋rejection_reason → audit log（identity_reject）→ 再提出依頼メール（同方針）→ ADM-011 へ
  - メールテンプレは Server Action から**実際に import して使用**する（テンプレ未使用バグの再発防止）
  - Vitest: users フラグ更新・ccus_worker_id 反映・メール失敗時に本体処理が維持されること（モックは {data, error} 形状を正確に・異常系も検証）
  - 依存: タスク3.2 / 3.3 / 9.2 完了後に着手
  - _Requirements: 012_

- [x] 10. 応募履歴管理（ADM-013 / 014）
- [x] 10.1 (P) ADM-013 応募履歴一覧を実装する
  - デザインカンプ: `design-assets/screens/ADM-013.png`（CSV出力ボタンはカンプにあるが今回は設置しない・スコープ外）
  - `/admin/applications` に各行（応募者氏名（年齢）・メール・案件タイトル・初回稼働日（未確定「—」）・8分類バッジ）＋20件ページングを実装する
  - キーワード検索: ①users（氏名/メール）→ applicant id 集合 ②jobs（title）→ job id 集合 ③client_profiles（display_name）→ owner →（org の場合 organization_id 経由で）job id 集合 に展開し `.or(...)` で OR 結合。**or 句は空でない id 集合の枝だけで組み立てる**（PostgREST は空の in.() を構文エラーにする）。全集合が空ならクエリを発行せず0件を返す。各 id 集合は上限1000件（超過時は注記表示）
  - ステータス絞込: 8分類セレクト → applyCategoryFilter（全条件サーバー側・post-filter なし・count 正確）
  - ソート: 応募日／初回稼働日の2軸 × 昇降切替。デフォルト応募日の新しい順。first_work_date ソートは NULLS LAST
  - ドリルダウン流用: `?jobId=`（ADM-022 から・現場単位）／`?clientId=`（ADM-004 から・会社単位）で絞り込み、絞り込み中はヘッダーに対象（案件名/会社名）を表示
  - 行クリック → `/admin/applications/[id]`
  - 依存: タスク2.1 / 3.5 完了後に着手
  - _Requirements: 013_

- [x] 10.2 (P) ADM-014 応募履歴詳細と発注取り消しを実装する
  - デザインカンプ: `design-assets/screens/ADM-014.png`
  - ステータスバッジ（8分類表記）＋直下に発注取消ボタン（canAdminCancel が true の場合のみ表示）
  - 案件情報（タイトル・募集職種/人数・締切・募集期間・勤務地・工事代金）→ クリックで ADM-022 へ。ユーザー情報（氏名・年齢・メール）→ ADM-009 へ。初回勤務日
  - 勤務地は job_areas（AreaList 表示）＋ accepted 以降に work_location がある場合は併記（旧 jobs.address は廃止済みのため使わない）
  - 個別評価（集計ではない）を application_id で両方向1件ずつ表示: ユーザー評価（稼働状況・補足・また仕事を受けたい はい/いいえ・評価補足）／発注者評価（稼働状況・補足・★×5 総合＋6項目・任意未入力「—」・評価補足）。未評価側は「未評価」表示。カンプの「はい/いいえ 6項目」は旧仕様のため ★×5 表示に置き換える
  - adminCancelApplicationAction: role 再チェック＋canAdminCancel を Server Action 内で再評価（UI と同一関数）→ status='cancelled'＋cancelled_by='admin' → audit log（application_cancel_admin）→ revalidate。通知メールは送らない
  - 依存: タスク2.1 / 3.5 完了後に着手（ADM-022 への導線はタスク7）
  - _Requirements: 014_

- [x] 11. 問い合わせ閲覧 3ペア（ADM-016〜021）
- [x] 11.1 (P) ADM-016/017 お問い合わせ一覧・詳細を実装する
  - デザインカンプなし（admin 共通スタイルに合わせる）
  - 一覧 `/admin/contacts`: 受信日時降順・20件・絞込なし。各行: 受信日時（formatDateTime）・会社名/屋号・氏名・お問い合わせ内容（inquiry_type）・**「登録ユーザー」バッジ（user_id あり時のみ）**。検索: 会社名/屋号・氏名・メール（ilike）
  - 詳細 `/admin/contacts/[id]`: 全項目表示（基本情報／お問い合わせについて／案件情報／動画掲載の相談／詳細／受信日時）。任意未入力は「—」
  - 添付は getSignedDocumentUrls（support-attachments）で署名付きURL化し、**拡張子判定で画像はインライン表示・PDF はリンク**で開く
  - user_id があれば ADM-009 への導線を設ける。状態変更・返信は持たない（閲覧のみ）
  - _Requirements: 016, 017_

- [x] 11.2 (P) ADM-018/019 トラブル報告一覧・詳細を実装する
  - デザインカンプなし（admin 共通スタイルに合わせる）
  - 一覧 `/admin/trouble-reports`: 受信日時降順・20件・絞込なし。各行: 受信日時・報告者氏名・トラブル相手氏名・トラブル種類。検索: 報告者氏名・相手氏名・メール（ilike）
  - 詳細 `/admin/trouble-reports/[id]`: 全項目表示（報告者→ADM-009 導線・相手氏名・メール・種類・内容・添付・受信日時）。任意未入力は「—」
  - 添付は contacts と同じ統一ルール（画像インライン／PDF リンク）。閲覧のみ
  - _Requirements: 018, 019_

- [x] 11.3 (P) ADM-020/021 求人問い合わせ一覧・詳細を実装する
  - デザインカンプなし（admin 共通スタイルに合わせる）
  - 一覧 `/admin/job-inquiries`: 受信日時降順・20件・絞込なし。各行: 受信日時・送信者氏名・宛先発注者の表示名・お問い合わせ項目（topics）。検索: 送信者氏名・メール（ilike）
  - 宛先発注者表示名はページ20行分の target_client_id をまとめて client_profiles をバッチ取得し resolveParticipantName() で解決（N+1 禁止）
  - 詳細 `/admin/job-inquiries/[id]`: 送信者（sender_id → ADM-009 導線）・宛先発注者（target_client_id → ADM-004 導線）・topics・内容・受信日時
  - 添付なし（job-inquiry は添付非対応）。閲覧のみ
  - _Requirements: 020, 021_

- [x] 12. 代理メッセージ閲覧（ADM-023 / 024）
- [x] 12.1 (P) ADM-023 メッセージ一覧（代理スレッド）を実装する
  - デザインカンプなし（admin 共通スタイルに合わせる）
  - `/admin/messages` に admin_proxy_threads ビューを `last_message_at DESC, thread_id DESC`（タイブレーク付き）で20件ページング表示する
  - 各行: 会社名（display_name）／相手の職人名／最終メッセージ日時（formatDateTime）／代理バッジ
  - 会社絞込: `?organizationId=` で絞り込み（ADM-004 からは絞込済みで開く）。絞込ドロップダウンの選択肢はビューの organization_id を **fetchAllPages パターンで全件取得**してから JS で重複排除し、owner の display_name をバッチ解決（1000件上限の静かな欠落防止）
  - 行クリック → `/admin/messages/[threadId]`
  - 依存: タスク2.2（ビュー）完了後に着手
  - _Requirements: 023_

- [x] 12.2 (P) ADM-024 メッセージ詳細（閲覧専用）を実装する
  - デザインカンプなし（admin 共通スタイルに合わせる）
  - `/admin/messages/[threadId]` に対象スレッドの messages を時系列昇順に全取得（1000件超に備え fetchAllPages パターン）し、発注者側/受注者側の吹き出しで表示する
  - `is_proxy=true` の行に「代理」バッジ。日時は formatDateTime（生 ISO を出さない）。画像添付は getSignedDocumentUrls（message-attachments）で表示
  - **送信入力欄は持たない**。将来の代理送信追加の土台として、メッセージリスト部をコンポーネント分離しておく
  - admin_proxy_threads に存在しないスレッド id は notFound()（is_proxy を含まない個人間スレッドの URL 直叩き閲覧を遮断＝プライバシー境界）
  - 依存: タスク2.2（ビュー）完了後に着手
  - _Requirements: 024_

- [ ] 13. seed テストデータを追加する
  - pending の本人確認申請・CCUS 申請（別ユーザーで各1件以上。CCUS 申請者は identity approved 済みの整合を守る）
  - contacts（user_id あり/なし・添付あり/なし）、trouble_reports（添付あり）、job_inquiries を各数件
  - is_proxy=true のメッセージを含むスレッド（法人発注者×受注者）と、含まない通常スレッド（ビューに現れないことの検証用）
  - 8分類すべてを網羅する応募データ（applied / accepted 稼働日前 / accepted 稼働日経過 / completed / lost / cancelled×両主体 / rejected）
  - ADM-003 の区分・オプションフィルタ検証用に、各区分（管理責任者・組織管理者・担当者・個人・小規模）と急募/職場紹介動画 active の発注者を整合させる
  - 招待フロー系 seed を置く場合は `email_confirmed_at = NULL`・登録完了ユーザーは `password_set_at = now()` のルールを遵守する
  - admin テストユーザー（admin@test.local）が seed に存在することを確認し、ADM-001 専用ログインの E2E で使えることを確かめる（実装現状ギャップ表#1の「seed 調整」。現状 seed に存在済みのため原則は確認のみ）
  - 依存: タスク2.1 / 2.2（スキーマ）完了後に着手
  - _Requirements: 003, 008, 011, 013, 016, 018, 020, 023_

- [ ] 14. E2E テスト（Playwright）
- [ ] 14.1 admin 導線スモークを作成する
  - `/admin/login` ログイン → ダッシュボード → 全9メニューを**クリックで**到達 → ログアウト → `/admin/login` に戻る（page.goto 直行のみで完結させない）
  - 非 admin（contractor / client / staff）が `/admin/*` に到達できないことを検証する
  - 依存: タスク4〜13 完了後に着手
  - _Requirements: 001, 002_

- [ ] 14.2 ドメイン別 E2E を作成する
  - 本人確認: 申請一覧（古い順・種別ラベル）→ 詳細 → 否認理由なしで否認ボタン非活性 → 承認 → 一覧から消える
  - 応募履歴: 8分類フィルタの件数整合・発注取消（accepted＋稼働日前）→ バッジが「運営によるキャンセル」へ変わる
  - 招待: ADM-006/007 作成 → 招待メール（dev fallback）→ パスワード設定 → /billing/plans に着地
  - 発注者管理: ADM-003 区分フィルタ → ADM-004 → 募集現場 → ADM-022 → 応募一覧（絞込済み）→ ADM-014
  - 代理メッセージ: ADM-004 から会社絞込で開く／全社一覧から詳細（代理バッジ表示・送信入力欄なし）
  - shadcn Select は 2 段クリック（getByLabel → getByRole option）で操作する
  - 依存: タスク14.1 と同時着手可（タスク4〜13 完了後）
  - _Requirements: 003, 004, 006, 007, 012, 013, 014, 022, 023, 024_

- [ ] 15. 最終ゲート（非回帰検証・カンプ整合・導線確認）
  - `npm run test` / `supabase test db` / `npm run test:e2e` の3層すべてが既存テストを含めて成功することを確認する（特に退会系・招待系・評価表示・Webhook の既存テスト）
  - カンプが存在する全画面（ADM-001〜006 / 008〜014）について `design-assets/screens/` の PNG と実装結果を目視比較する（配置順序・セクション分割・ボタンスタイル・余白）
  - 全 admin 画面の導線リンク（ダッシュボード9メニュー・詳細画面間の遷移・もどる）の href が実在ルートと一致することを grep ＋クリック確認で検証する
  - 一般ユーザー側の回帰確認: 通常ログイン・退会・スタッフ招待・決済 Webhook・評価詳細ページが従来どおり動作すること
  - _Requirements: 001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 010B, 011, 012, 013, 014, 015, 016, 017, 018, 019, 020, 021, 022, 023, 024_
