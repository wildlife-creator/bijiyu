# Implementation Plan

- [x] 1. 基盤セットアップ（バリデーション・ユーティリティ・DB関数）
- [x] 1.1 Zod バリデーションスキーマの作成
  - プロフィール編集用スキーマ（姓名必須、性別必須、メール任意、都道府県必須、職種1〜3件×経験年数、保有スキル任意、保有資格任意、対応エリア1件以上）を定義する
    - 保有スキルは `skillTags: z.array(z.string().min(1)).optional().default([])`、保有資格は `qualifications: z.array(z.string()).optional().default([])` の別フィールドとする（意味論が異なるため統合しない）
  - 本人確認書類アップロード用スキーマ（JPEG/PNG/PDF、各最大10MB、2ファイル必須）を定義する
  - CCUS登録申請用スキーマ（JPEG/PNG/PDF、最大10MB、技能者ID必須）を定義する
  - 退会手続き用スキーマ（退会理由必須、詳細任意、同意チェック必須）を定義する
  - お問い合わせ用スキーマ（姓名必須、メール必須、項目1件以上、内容必須）を定義する
  - アバター画像用のファイルバリデーション（JPEG/PNG、最大5MB）を定義する
  - エラーメッセージはすべて日本語で記述する
  - _Requirements: 2.1, 4.1, 5.1, 6.1, 8.1_

- [x] 1.2 (P) 年齢算出ユーティリティの作成
  - 生年月日（birth_date）から現在の年齢を算出する関数を作成する
  - 誕生日前後の境界値を正しく処理する（誕生日当日に年齢が変わる）
  - プロフィール詳細画面（COM-001）で使用する
  - _Requirements: 1.1_

- [x] 1.3 (P) update_profile データベース関数のマイグレーション作成
  - users（skill_tags 含む）, user_skills, user_qualifications, user_available_areas の4テーブルをトランザクション内で一括更新する PostgreSQL 関数を作成する
  - SECURITY DEFINER で実行する（4テーブル跨ぎの RLS バイパスが必要。入力値の検証は Server Action で実施済みの前提）
  - 関数内で auth.uid() との一致を検証し、不正な user_id での呼び出しを拒否する
  - skills は DELETE + INSERT（最大3件制限）、qualifications と areas も DELETE + INSERT で洗い替えする
  - users.skill_tags（text[]）は UPDATE で値ごと置き換える（テーブルではなくカラムなので DELETE+INSERT 不要）
  - マイグレーションファイルを既存の 001〜006 の後に配置する
  - _Requirements: 2.1_

- [x] 2. (P) プロフィール詳細画面の実装（COM-001）
  - users, user_skills, user_qualifications, user_available_areas を JOIN して自分のプロフィール情報を取得・表示する Server Component を作成する
  - 表示項目: アイコン画像、氏名、年齢（birth_date から算出）、本人確認済み / CCUS登録済みバッジ、PR動画（video_url が存在し動画掲載オプションが有効な場合）、性別、都道府県、会社名/屋号、自己紹介、職種×経験年数、保有スキル（users.skill_tags）、保有資格（user_qualifications）、対応可能エリア
  - 「編集する」ボタン（COM-002 へ遷移）と「退会する」リンク（COM-006 へ遷移）をページ下部に配置する
  - _Requirements: 1.1_

- [x] 3. (P) プロフィール編集機能の実装（COM-002）
- [x] 3.1 プロフィール編集 Server Actions の実装
  - updateProfileAction: セッションからユーザーIDを取得し、Zod バリデーション後に update_profile RPC でプロフィール情報を一括更新する。メールアドレス変更がある場合は Supabase Auth の updateUser を呼び出し認証メールを送信する
  - uploadAvatarAction: ファイルの MIME タイプ（JPEG/PNG）とサイズ（最大5MB）を検証し、avatars バケットに UUID ファイル名でアップロードする。users.avatar_url を更新し、旧画像を非同期で削除する（削除失敗時はログ記録のみ）
  - _Requirements: 2.1_

- [x] 3.2 プロフィール編集フォーム画面の実装
  - 画像アップロード + 全フィールドの編集フォームを Client Component で作成する
  - 職種は最大3つまで選択可能とし、各職種に対して経験年数を設定できるようにする（列見出し「職種」「経験年数（年）」を明示）
  - 対応可能エリアは都道府県の複数選択を実装する
  - 保有スキル（`users.skill_tags`）と保有資格（`user_qualifications`）はそれぞれ独立した chips 入力 UI（自由入力テキスト + 「追加する」ボタン + 削除可能なチップ表示）として実装する。資格とスキルは意味論が異なるため統合しない
  - Zod スキーマによるクライアント側バリデーションを実装する
  - 保存成功時にプロフィール詳細画面（COM-001）へ遷移する
  - _Requirements: 2.1_

- [x] 4. (P) 本人確認・CCUS登録機能の実装（COM-003〜005）
- [x] 4.1 本人確認・CCUS登録トップ画面の実装（COM-003）
  - identity_verifications テーブルから本人確認（document_type='identity'）と CCUS登録（document_type='ccus'）の最新ステータスを取得し、バッジで表示する Server Component を作成する
  - ステータス種別: 未申請 / 申請中 / 承認済み / 否認（再提出可）
  - 否認時は rejection_reason をアラートボックスで表示し「再提出する」ボタンを表示する
  - 「本人確認書類を提出する」ボタンは未申請 / 否認時のみ活性とし、COM-004 へ遷移する
  - 「CCUS登録申請する」ボタンは本人確認が承認済みの場合のみ活性とし、COM-005 へ遷移する
  - _Requirements: 3.1_

- [x] 4.2 (P) 本人確認書類アップロード機能の実装（COM-004）
  - ファイル2点（公的証明書 + 本人顔写真）のアップロードフォームを Client Component で作成する
  - submitIdentityAction: MIME タイプ（JPEG/PNG/PDF）とサイズ（各最大10MB）を検証し、identity-documents バケットに `{userId}/identity_{timestamp}_{N}.ext` のパスで保存する
  - identity_verifications に新規レコードを INSERT する（document_type='identity', status='pending'）。再提出時も新規 INSERT し、既存の rejected レコードは履歴として残す
  - pending 状態の申請が既に存在しないことを事前チェックする
  - audit_logs に action='identity.submit' を記録する
  - アップロード成功時に COM-003 へ遷移する
  - _Requirements: 4.1_

- [x] 4.3 (P) CCUS登録申請機能の実装（COM-005）
  - ファイル1点 + CCUS技能者ID入力のフォームを Client Component で作成する
  - submitCcusAction: 本人確認が承認済みであることを事前チェックする。MIME タイプ（JPEG/PNG/PDF）とサイズ（最大10MB）を検証し、ccus-documents バケットに `{userId}/{ccusWorkerId}_{timestamp}.ext` のパスで保存する
  - identity_verifications に新規レコードを INSERT する（document_type='ccus', status='pending'）。再提出時も新規 INSERT
  - audit_logs に action='ccus.submit' を記録する
  - アップロード成功時に COM-003 へ遷移する
  - _Requirements: 5.1_

- [x] 5. (P) 退会機能の実装（COM-006）
- [x] 5.1 withdrawAction Server Action の実装
  - 退会不可条件の3つのチェックを実装する: (1) 応募者として進行中案件あり（applications WHERE applicant_id = uid AND status IN ('applied', 'accepted')）、(2) 発注者として進行中案件あり（applications JOIN jobs WHERE jobs.owner_id = uid AND applications.status = 'accepted'）、(3) 法人プランの非オーナー（org_role != 'owner'）
  - database-schema.md「ユーザーソフトデリート時の連鎖処理ルール」+ organization/requirements.md「退会（COM-006）」C 案（2026-04-19 採用）に準拠したカスケード処理を実装する: users.deleted_at 設定、jobs を closed に更新（draft/open のみ）、applications を cancelled に更新（applied/accepted）、subscriptions/option_subscriptions を cancelled に更新、**組織オーナーの場合は Admin の有無に関わらず以下を連動実行**: (a) 所属メンバー全員（Admin / Staff）の users.deleted_at セット、(b) organization_members を組織単位で全員物理削除、(c) organizations.deleted_at セット、(d) client_profiles / scout_templates は履歴として保持（削除しない）。組織オーナーでない場合は自身の organization_members のみ物理削除。**本タスクは既に `[x]` 完了表示だが、C 案採用により旧実装と乖離しているため、organization spec の Task 13.4（COM-006 の C 案対応リファクタ）で書き換えを行う**
  - Supabase Admin API で auth.users を ban（ban_duration: '876600h'）してアカウントを無効化する
  - 退会完了メールを Resend で送信する（送信失敗時は非ロールバック）
  - セッションを無効化し、ルートページへリダイレクトする
  - Stripe 解約 API 呼び出し部分は billing spec 実装後に有効化する前提で、try/catch で囲みスキップ可能にする
  - _Requirements: 6.1_

- [x] 5.2 退会手続き画面の実装
  - 退会理由（プルダウン、OptionSets から選択）、詳細・改善事項（テキストエリア、任意）、同意チェックボックスのフォームを Client Component で作成する
  - 「退会する」ボタン押下時に確認ダイアログを表示し、確認OK後に withdrawAction を呼び出す
  - 退会不可条件に該当する場合は日本語のエラーメッセージを表示する（3パターンそれぞれ異なるメッセージ）
  - _Requirements: 6.1_

- [x] 6. (P) 静的・サポートページの実装（COM-007〜011）
- [x] 6.1 (support) ルートグループのセットアップ
  - (support) ルートグループのレイアウトを作成する
  - Middleware のパブリックルート定義に (support) 配下のパスを追加し、未認証ユーザーからのアクセスを許可する
  - _Requirements: 7.1, 8.1, 9.1, 10.1, 11.1_

- [x] 6.2 (P) よくある質問ページの実装（COM-007）
  - カテゴリ別（アカウント、案件、課金、本人確認 等）の Q&A 形式で表示する Server Component を作成する
  - アコーディオン UI（質問クリックで回答を展開）を shadcn/ui の Accordion コンポーネントで実装する
  - _Requirements: 7.1_

- [x] 6.3 (P) お問い合わせ機能の実装（COM-008）
  - お問い合わせフォーム（姓名、メール、項目チェックボックス、内容テキストエリア）を Client Component で作成する
  - submitContactAction: 認証チェックをスキップし、anon key の Supabase クライアントで contacts テーブルに INSERT する
  - 送信成功時に画面上に完了メッセージを表示する
  - IP ベースのレート制限（同一 IP から1時間に5件まで）を実装する
  - _Requirements: 8.1_

- [x] 6.4 (P) 利用規約・プライバシーポリシー・特定商取引法ページの実装（COM-009〜011）
  - 3つの静的ページを Server Component で作成する
  - テキストを直接記述する（CMS 連携は MVP スコープ外）
  - _Requirements: 9.1, 10.1, 11.1_

- [x] 7. テスト
- [x] 7.1 ユニットテスト（Zod スキーマ + ロジック）
  - 全 Zod バリデーションスキーマ（profileEditSchema, identityUploadSchema, ccusUploadSchema, withdrawalSchema, contactSchema）の正常系・異常系をテストする
  - ファイルバリデーション（MIME タイプ判定、サイズ制限超過）のテストを実装する
  - 退会不可条件の判定ロジック（応募者として進行中 / 発注者として進行中 / 法人プラン非オーナーの3パターン）をテストする
  - birth_date からの年齢算出ロジックのテスト（誕生日前後の境界値テスト含む）を実装する
  - _Requirements: 1.1, 2.1, 4.1, 5.1, 6.1, 8.1_

- [ ] 7.2 (P) 統合テスト（RLS + RPC + 退会カスケード）
  - RLS テスト: 自分の identity_verifications のみ INSERT/SELECT 可能であることを検証する
  - RLS テスト: 他ユーザーの users レコードを UPDATE できないことを検証する
  - update_profile RPC のトランザクションテスト: 正常系（4テーブルが正しく更新される）と、他ユーザーの user_id を渡した場合にエラーになることを検証する
  - 退会カスケードの統合テスト: users, jobs, applications, subscriptions, option_subscriptions, organization_members の各テーブルが正しく更新・削除されることを検証する
  - 退会不可条件テスト: 応募者として進行中 / 発注者として進行中 / 法人プランの非オーナーの3パターンで退会が拒否されることを検証する
  - お問い合わせの非認証送信テスト: anon ユーザーが contacts に INSERT できることを検証する
  - メールアドレス変更テスト: Supabase Auth の updateUser が呼び出されることを検証する
  - pgTAP テストとして Supabase テストディレクトリに配置する
  - _Requirements: 2.1, 4.1, 5.1, 6.1, 8.1_
