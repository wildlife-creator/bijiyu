# Implementation Plan

- [x] 0. 既存テストの全実行とデグレ確認
  - `npm run test`（Vitest）を実行し、全テストがパスすることを確認する
  - `supabase test db`（pgTAP）を実行し、RLS テストが全パスすることを確認する
  - `npm run test:e2e`（Playwright）を実行し、E2E テストが全パスすることを確認する
  - 失敗がある場合は原因を調査・修正してから実装タスクに着手する

- [x] 1. RLS ポリシーの置き換えと Middleware 更新
- [x] 1.1 applications テーブルの UPDATE 用 RLS ポリシーを置き換えるマイグレーションを作成する
  - 既存の applications_update ポリシーと applications_update_self ポリシーを DROP する（003_rls_policies.sql のポリシー名を確認して合わせること）
  - 受注者キャンセル用ポリシーを作成する: 自分の応募（applicant_id = auth.uid()）かつ status = 'applied' の場合のみ、cancelled への変更を許可（WITH CHECK）
  - 発注者 accept/reject 用ポリシーを作成する: 案件のオーナーまたは同一組織メンバーが、status = 'applied' の応募を accepted / rejected に変更可能（WITH CHECK）
  - 完了報告（accepted → completed/lost）は admin client で実行するため、追加ポリシーは不要
  - _Requirements: 2, 6_

- [x] 1.2 Middleware に発注者系パスの制限を追加する
  - src/middleware.ts の CLIENT_ONLY_PREFIXES に "/applications/received" と "/applications/orders" を追加する
  - 受注者系パス（/applications/history/）は全認証済みユーザーにアクセス開放のままにすること
  - _Requirements: 4, 5, 6, 7, 8, 9_

- [x] 2. Zod バリデーションスキーマとメールテンプレートの実装
- [x] 2.1 (P) マッチング機能の Zod バリデーションスキーマを作成する
  - 受注者完了報告スキーマ: 稼働状況（completed/lost、必須）、稼働補足（任意）、また仕事を受けたいか（good/bad、必須）、コメント（任意）
  - 発注者完了報告スキーマ: 稼働状況（必須）、稼働補足（任意）、評価6項目（各 good/bad、すべて必須）、コメント（任意）
  - 発注承認スキーマ: applicationId（必須）、初回稼働日（有効な日付、必須）
  - キャンセル用のバリデーションは applicationId のみのため、スキーマ不要
  - _Requirements: 2, 3, 6, 9_

- [x] 2.2 (P) 発注/お断り通知のメールテンプレートを作成する
  - マッチング成立通知テンプレート（発注者が応募を承認した際に受注者へ送信）: 案件タイトル、初回稼働日、発注者名を含む
  - お断り通知テンプレート（発注者が応募を拒否した際に受注者へ送信）: 案件タイトル、発注者名を含む
  - ヘッダーにビジ友ロゴ、フッターにサービス URL を含むレイアウトにする（tech.md のテンプレート統一ルール準拠）
  - Resend の sendEmail ヘルパーで送信する前提で設計する
  - _Requirements: 6_

- [x] 3. Server Actions の実装（受注者系）
- [x] 3.1 応募キャンセル Server Action を実装する
  - 認証チェック → 応募の取得と所有者チェック（applicant_id = current_user）→ ステータスチェック（applied のみ）→ 5日前制限チェック（preferred_first_work_date - 5日 > NOW()）→ status を cancelled に更新
  - 5日前を過ぎている場合は日本語エラーメッセージを返す
  - 通常の Supabase クライアントで更新する（RLS ポリシーがキャンセルを許可）
  - _Requirements: 2_

- [x] 3.2 受注者 完了報告 + 発注者評価 Server Action を実装する
  - 認証チェック → 通常クライアントで応募を取得し、applicant_id = current_user かつ status = accepted であることを検証 → Zod バリデーション → admin client で applications.status 更新と client_reviews INSERT を原子的に実行
  - reviewer_id = current_user、reviewee_id = 案件のオーナー、application_id を設定する
  - UNIQUE 制約違反（二重登録）をキャッチして「既に評価を登録済みです」エラーを返す
  - _Requirements: 3_

- [x] 4. Server Actions の実装（発注者系）
- [x] 4.1 発注承認 Server Action を実装する
  - 認証チェック → 案件の owner_id が current_user（or 同一組織メンバー）であることを検証 → ステータスチェック（applied のみ）→ Zod バリデーション → applications.status を accepted に更新し、first_work_date を設定 → 受注者へメール通知
  - メール送信失敗は catch してログ記録のみ。本体処理はロールバックしない
  - 通常の Supabase クライアントで更新する（RLS ポリシーが accept を許可）
  - _Requirements: 6_

- [x] 4.2 お断り Server Action を実装する
  - 認証チェック → 案件の owner_id が current_user（or 同一組織メンバー）であることを検証 → ステータスチェック（applied のみ）→ applications.status を rejected に更新 → 受注者へメール通知
  - メール送信失敗は catch してログ記録のみ
  - _Requirements: 6_

- [x] 4.3 発注者 完了報告 + 受注者評価 Server Action を実装する
  - 認証チェック → 通常クライアントで応募を取得し、案件の owner_id = current_user（or 同一組織メンバー）かつ status = accepted であることを検証 → Zod バリデーション（6つの評価項目すべて必須）→ admin client で applications.status 更新と user_reviews INSERT を原子的に実行
  - reviewer_id = current_user、reviewee_id = applicant_id、application_id を設定する
  - UNIQUE 制約違反をキャッチして日本語エラーメッセージを返す
  - _Requirements: 9_

- [x] 5. 受注者系画面の実装
- [x] 5.0 マイページ（CON-001）にマッチング機能への導線を追加する
  - 受注者マイページの「仕事を探す」セクションに「応募履歴」リンク（/applications/history/）を追加する
  - 発注者マイページの「発注先を探す」セクションに「応募管理」リンク（/applications/received/）と「発注履歴」リンク（/applications/orders/）を追加する
  - screen-navigation.md の遷移定義に従い、リンク先 URL が正しいことを確認する
  - CLAUDE.md のルール: メニューリスト項目にはアイコンを付けない。テキスト + 右矢印（>）のみで構成する
  - _Requirements: 1, 4, 7_

- [x] 5.1 (P) 応募履歴一覧画面（CON-011）を実装する
  - Server Component で自分の応募一覧を取得する（applicant_id = current_user、created_at DESC、20件ページネーション）
  - jobs リレーション JOIN で案件タイトル・発注者名を取得し、各行に表示する
  - ステータスバッジを色分け表示する（応募結果待ち/稼働予定/評価登録未入力/評価登録済み/落選・キャンセル/取引完了）
  - 各行クリックで応募詳細画面に遷移する
  - 戻るボタン（router.back()）を設置する
  - デザインカンプ: design-assets/screens/CON-011.png
  - _Requirements: 1_

- [x] 5.2 応募詳細画面（CON-012）を実装する
  - 案件情報（タイトル、職種、報酬、勤務地、工期）と応募情報（人数、日程、初回稼働希望日、申し送り）を表示する
  - ステータスが applied の場合: キャンセルボタンを表示する。5日前を過ぎている場合はボタンを非活性にし、注意文言を表示する。キャンセル実行時は確認ダイアログを表示し、成功後に一覧画面に遷移する
  - ステータスが accepted の場合: 「作業完了/失注報告」ボタンを表示する。キャンセルボタンは非表示にする
  - ステータスが rejected/completed/cancelled/lost の場合: 操作ボタンなし（閲覧のみ）
  - ステータスが rejected または cancelled の場合: ステータスバッジ直下に注意書きテキストを赤文字で表示する（rejected:「この応募はお断りとなりました。稼働は行われていません。」、cancelled:「この応募はキャンセルしました。稼働は行われていません。」）
  - 初回稼働日（first_work_date）は確定後に表示する
  - 戻るボタン（router.back()）を設置する
  - デザインカンプ: design-assets/screens/CON-012.png
  - _Requirements: 2_

- [x] 5.3 受注者 完了報告・評価登録画面（CON-013）を実装する
  - Client Component でフォームを実装する。入力項目: 稼働状況（completed/lost、必須）、稼働補足（任意）、また仕事を受けたいか（good/bad、必須）、評価コメント（任意）
  - 事前チェック: 応募の applicant_id が current_user と一致し、status が accepted であること。条件を満たさない場合は 404 またはリダイレクト
  - フォーム送信で受注者完了報告 Server Action を呼び出し、成功後にマイページトップへ遷移する
  - 戻るボタン（router.back()）を設置する
  - デザインカンプ: design-assets/screens/CON-013.png
  - _Requirements: 3_

- [x] 6. 発注者系画面の実装（応募管理）
- [x] 6.1 (P) 応募一覧画面（CLI-007）を実装する
  - Server Component で自社案件への応募一覧を取得する（jobs.owner_id = current_user or 同一組織、20件ページネーション）
  - searchParams の jobId パラメータで案件ごとにフィルタリングできるようにする
  - 表示項目: 応募者名、職種、応募日、ステータス
  - 各行クリックで応募詳細画面に遷移する
  - 戻るボタン（router.back()）を設置する
  - デザインカンプ: design-assets/screens/CLI-007.png
  - _Requirements: 4_

- [x] 6.2 応募詳細画面（CLI-008）を実装する
  - 応募者のプロフィール情報（アイコン、氏名、職種、経験年数、スキル、本人確認バッジ、CCUSバッジ）を表示する
  - 応募情報（応募人数、日程、初回稼働希望日、申し送り）を表示する
  - 応募者の評価履歴を user_reviews から集計して表示する（good/bad のカウント）
  - 「発注する/お断りする」ボタンで発注可否画面に遷移する
  - 退会済みユーザーは getUserDisplayName() で「退会済みユーザー」と表示する
  - 戻るボタン（router.back()）を設置する
  - デザインカンプ: design-assets/screens/CLI-008.png
  - _Requirements: 5_

- [x] 6.3 発注可否画面（CLI-009）を実装する
  - Client Component で「発注する」「お断りする」の2ボタンを配置する
  - 「発注する」選択時: 初回稼働日の日付入力フィールドを表示し、発注承認 Server Action を呼び出す
  - 「お断りする」選択時: お断り Server Action を呼び出す
  - 処理完了後にポップアップ「ユーザーへ結果を送信しました」を表示し、応募一覧画面（CLI-007）へ遷移する
  - 戻るボタン（router.back()）を設置する
  - デザインカンプ: design-assets/screens/CLI-009.png（バリエーション: CLI-009-b.png, CLI-009-c.png も参照）
  - _Requirements: 6_

- [x] 7. 発注者系画面の実装（発注履歴・評価）
- [x] 7.1 (P) 発注履歴一覧画面（CLI-010）を実装する
  - Server Component で発注済み案件を取得する（status IN accepted/completed/lost/cancelled/rejected、自社案件に限定、updated_at DESC、20件ページネーション）
  - ステータスフィルター: プルダウン即時反映（検索ボタンなし、CON-011 と同じ方式）。選択肢: すべて/応募あり（未対応）/発注済み/評価登録未入力/評価登録済み/キャンセル・お断り/取引完了
  - 並び替え: icon-sort.png クリックで DESC↔ASC トグル
  - カード表示: ステータスバッジ、受注者情報（氏名・年齢・職種タグ・本人確認/CCUSバッジ・エリア・経験年数）、応募済み案件情報、アクションボタン
  - 戻るボタン（router.back()）を設置する
  - デザインカンプ: design-assets/screens/CLI-010.png
  - _Requirements: 7_

- [x] 7.2 発注履歴詳細画面（CLI-011）を実装する
  - CON-012 と同一のレイアウト・アイコンパターンで実装する（Card ラッパーなし、フラットレイアウト）
  - 案件情報セクション: タイトル、募集職種・人数、報酬/エリア/募集期間/稼働時間をアイコン付きで表示。「募集案件詳細」ボタン → CON-003
  - ユーザー情報セクション: アバター、氏名（年齢）、職種一覧、本人確認/CCUSバッジ、対応可能エリア、経験年数、保有スキル、保有資格を表示。user_skills, user_available_areas, user_qualifications から並列取得。「ユーザー詳細」ボタン → /users/contractors/[id]
  - 応募内容セクション: 人数、日程、希望初回稼働日、申し送りを CheckCircle2 アイコン付きで表示
  - ステータスが rejected または cancelled の場合: ステータスバッジ直下に注意書きボックスを表示する（rejected:「この応募はお断りしています。稼働は行われていません。」、cancelled:「この応募は応募者によりキャンセルされました。稼働は行われていません。」）
  - ステータスが accepted かつ評価未登録の場合は「評価入力」ボタンを表示し、CLI-012 へ遷移する
  - 退会済みユーザーは getUserDisplayName() で表示名を処理する
  - 戻るボタン（BackButton コンポーネント）を設置する
  - デザインカンプ: design-assets/screens/CLI-011.png
  - _Requirements: 8_

- [x] 7.3 発注者 完了報告・評価登録画面（CLI-012）を実装する
  - Client Component でフォームを実装する。入力項目: 稼働状況（必須、受注者側 CON-013 と同じ6選択肢）、稼働補足（任意）、評価6項目（また依頼したいか/指示通りに動けるか/稼働予定日にちゃんと来たか/作業は速いか/作業は丁寧か/工具を持っているか、各 good/bad を lucide-react ThumbsUp/ThumbsDown アイコンで表示、すべて必須）、評価コメント（任意）
  - 事前チェック: 案件の owner_id が current_user（or 同一組織メンバー）かつ status = accepted
  - フォーム送信で発注者完了報告 Server Action を呼び出し、成功後に発注履歴一覧へ遷移する
  - 戻るボタン（router.back()）を設置する
  - デザインカンプ: design-assets/screens/CLI-012.png
  - _Requirements: 9_

- [x] 7.4 (P) 発注者評価表示画面（CLI-028）を実装する
  - Server Component で対象受注者への user_reviews を取得する（reviewee_id = 対象受注者）
  - ユーザープロフィールセクション: アバター、氏名（年齢）、本人確認/CCUSバッジ、お気に入りハートアイコンを表示
  - 6項目（また依頼したい / 稼働予定日に来る / 指示通りに動ける / 作業が速い / 作業が丁寧 / 道具を持っている）の Good 集計を `good数/総件数案件中` の形式で表示する
  - 「稼働状況の補足」セクション: user_reviews.status_supplement の一覧を薄紫ヘッダー付きカードで表示（20件ごとにページネーション）
  - 「評価の補足」セクション: user_reviews.comment の一覧を薄紫ヘッダー付きカードで表示（20件ごとにページネーション）
  - CLI-006（ユーザー詳細）からの遷移先として users/[id]/reviews/ に配置する
  - 戻るボタン（BackButton コンポーネント）を設置する
  - デザインカンプ: design-assets/screens/CLI-028.png
  - _Requirements: 10_

- [x] 8. テスト
- [x] 8.1 Server Actions のユニット・統合テストを作成する
  - cancelApplicationAction: 本人のみキャンセル可能、5日前制限の検証、applied 以外のステータスでのエラー、他人の応募へのアクセス拒否
  - acceptApplicationAction: 案件所有者のみ発注可能、ステータス遷移の検証、メール送信関数の呼び出し確認
  - rejectApplicationAction: 案件所有者のみお断り可能、ステータス遷移の検証、メール送信関数の呼び出し確認
  - submitContractorReportAction: 応募者のみ完了報告可能、accepted ステータスチェック、client_reviews INSERT の検証、二重登録エラー
  - submitClientReportAction: 案件所有者のみ完了報告可能、6項目バリデーション、user_reviews INSERT の検証、二重登録エラー
  - Zod バリデーションスキーマの正常系・異常系テスト
  - Supabase クライアントをモックし、Server Action の内部ロジックが実際に動くテストにする（Server Action 自体を vi.mock しない）
  - _Requirements: 2, 3, 6, 9_

- [x] 8.2 RLS テスト（pgTAP）を作成する
  - 受注者が自分の応募のみ閲覧できること（他人の応募は見えない）
  - 発注者が自社案件への応募のみ閲覧できること
  - 受注者が自分の applied 応募を cancelled に変更できること
  - 受注者が applied 以外のステータスの応募をキャンセルできないこと
  - 受注者が他人の応募をキャンセルできないこと
  - 発注者が applied 応募を accepted/rejected に変更できること
  - 発注者が applied 以外のステータスの応募を変更できないこと
  - 評価（user_reviews, client_reviews）は全ユーザーが SELECT 可能なこと
  - 評価の UPDATE/DELETE が不可能なこと
  - テスト用 UUID は seed.sql と重複しない値を使用する
  - _Requirements: 2, 6_

- [x] 8.3 E2E テスト（Playwright）を作成する
  - 受注者フロー: 応募履歴一覧 → 応募詳細 → キャンセル実行 → ステータスがキャンセルに変わることを確認
  - 発注者フロー（発注）: 応募一覧 → 応募詳細 → 発注可否画面で発注 → 発注履歴一覧に表示されることを確認
  - 発注者フロー（お断り）: 応募一覧 → 応募詳細 → 発注可否画面でお断り → ステータスがお断りに変わることを確認
  - 受注者フロー（完了報告）: 応募詳細（accepted 状態）→ 完了報告・評価画面（CON-013）→ 稼働状況・評価入力 → 送信成功 → マイページトップに戻ることを確認
  - 発注者フロー（完了報告）: 発注履歴詳細 → 完了報告 + 評価6項目入力 → 送信成功 → 発注履歴一覧に戻ることを確認
  - テスト実行前に supabase start + supabase db reset + npm run dev が起動していること。seed.sql のテストユーザーを使用する
  - 必要な seed データ:
    - status = 'applied' の応募レコード（受注者キャンセルテスト用）: preferred_first_work_date が6日以上先であること（5日前制限テスト用）
    - status = 'accepted' の応募レコード（受注者完了報告テスト用、発注者完了報告テスト用）: それぞれ異なる応募レコードを用意する
    - status = 'applied' の応募レコード（発注者の発注/お断りテスト用）
    - 上記の応募レコードに対応する jobs レコード、users レコードが seed.sql に存在すること
    - 不足するデータがある場合は seed.sql に追加してから E2E テストを作成する
  - _Requirements: 1, 2, 3, 4, 6, 7, 9_

## ラウンド2修正タスク（CLI-007〜009 デザインカンプ準拠修正）

- [x] FIX-1. CLI-007: ステータスバッジをカード左上に移動
- [x] FIX-2. CLI-007: ソートアイコン（icon-sort.png）追加 + sort searchParam トグル
- [x] FIX-3. CLI-007: カードリストに max-w-2xl mx-auto 適用
- [x] FIX-4. CLI-007: 対応可能エリア（icon-globe）・経験年数（icon-briefcase）アイコン付き表示
- [x] FIX-5. CLI-008: 案件情報セクションをアイコン付きレイアウトに変更（icon-coin, icon-pin, icon-calendar, Clock）
- [x] FIX-6. CLI-008: 「募集案件詳細」ボタン追加（primary 塗りつぶし、CON-003 遷移）
- [x] FIX-7. CLI-008: 「以下の内容で応募があります。」テキスト + 区切り線追加
- [x] FIX-8. CLI-008: ユーザー情報セクション拡充（年齢、エリア、経験年数、スキル、資格を CheckCircle2 アイコンで統一）
- [x] FIX-9. CLI-008: 「ユーザー詳細」ボタン追加（primary 塗りつぶし、ユーザー詳細遷移）
- [x] FIX-10. CLI-008: 応募内容に申し送り追加 + 全項目 CheckCircle2 アイコン付き
- [x] FIX-11. CLI-008: 「発注可否」ボタン追加（status='applied' のみ表示）
- [x] FIX-14. CLI-009: 段階的フォーム表示（プルダウンで state 更新 → 条件レンダリング）
- [x] FIX-15. CLI-009-B: 勤務地・書類・その他・初回稼働日フォーム実装
- [x] FIX-16. CLI-009-C: お断り理由フォーム実装
- [x] FIX-17. CLI-009: 送信後ポップアップ → CLI-007 遷移

## ラウンド2追加修正タスク

- [x] R2-1. CLI-007: ソートアイコンのクリック機能（Link で sort searchParam トグル）
- [x] R2-2. CLI-007: カードレイアウト確認（1列縦並び、max-w-2xl で適切）
- [x] R2-3. CLI-008: 「募集案件詳細」「ユーザー詳細」ボタンを primary 塗りつぶし + text-white に変更
- [x] R2-4. CLI-008: 全ボタン幅を w-full max-w-xs で統一
- [x] R2-5. CLI-008: ユーザー情報セクションのアイコンを全て CheckCircle2 に統一
- [x] R2-6. CLI-008: max-w-2xl mx-auto 適用
- [x] R2-7. CLI-009-B: 業務書類アップロード機能（マイグレーション + Storage バケット + UI + Server Action）
- [x] R2-8. CON-012: 業務書類表示に applications.document_urls を追加
- [x] R2-9. CLI-009: max-w-2xl mx-auto 適用

## ラウンド3修正タスク

- [x] R3-1. CLI-007: レスポンシブグリッド実装（SP: 1列、MD: 2列、LG: 3列）
- [x] R3-2. CLI-008: 佐藤健太の seed データ追加 + ユーザー詳細画面の role フィルター削除
- [x] R3-3. CLI-009-B: 書類アップロード後のカメラアイコン占有領域を非表示にする

## スカウト経由応募の連携（REQ-MT-011）

- [x] S-1. applications テーブルに scout_message_id カラムを追加するマイグレーションを作成する
  - マイグレーション: `supabase/migrations/20260408100000_applications_scout_message_id.sql`
  - `ALTER TABLE applications ADD COLUMN scout_message_id uuid REFERENCES messages(id)`
  - 部分インデックス: `idx_applications_scout_message_id` WHERE scout_message_id IS NOT NULL
  - `src/types/database.ts` に型反映済み
  - _Requirements: 11_

- [x] S-2. 応募フォーム（CON-004）で scout_message_id を受け渡し・保存する
  - `src/lib/validations/application.ts:19`: applicationSchema に `scoutMessageId: z.string().uuid().optional()` を追加
  - `src/app/(authenticated)/jobs/[id]/apply/page.tsx:9,14,105`: searchParams から `scout_message_id` を取得し ApplicationForm に伝搬
  - `src/app/(authenticated)/jobs/[id]/apply/application-form.tsx:23,71,92-96`: prop を受け取り FormData に含める。スカウト経由の場合は「スカウト経由の応募です」バナーを表示
  - `src/app/(authenticated)/jobs/search-actions.ts:50,135-164`: applyJobAction で `is_scout=true` 検証後、INSERT に scout_message_id を含める
  - _Requirements: 11_

- [x] S-3. 各画面に「スカウト経由」バッジを表示する
  - CON-011（応募履歴一覧）: `applications/history/page.tsx:47,178-181`
  - CON-012（応募詳細）: `applications/history/[id]/page.tsx:166-169`
  - CLI-007（応募一覧）: `applications/received/page.tsx:45,164-167`
  - CLI-008（応募詳細）: `applications/received/[id]/page.tsx:32,158-161`
  - CLI-010（発注履歴一覧）: `applications/orders/page.tsx` の SELECT に `scout_message_id` を追加し、カードのステータスバッジ横にバッジ表示
  - CLI-011（発注履歴詳細）: `applications/orders/[id]/page.tsx` の SELECT に `scout_message_id` を追加し、ヘッダー下のステータスバッジ横にバッジ表示
  - バッジスタイル: `bg-[rgba(146,7,131,0.08)] text-primary/70 text-xs rounded-full px-2 py-0.5`
  - _Requirements: 11_

- [x] S-4. テスト実行と動作確認
  - `npm run test` で 265 テスト全パス確認済み（messaging 機能完了時に確認）
  - _Requirements: 11_

## メール通知の名前表示修正

- [x] NAME-1. acceptApplicationAction の clientName 修正
  - `src/app/(authenticated)/applications/actions.ts:30` — `getApplicationWithDetails()` の SELECT に `client_profiles(display_name)` の JOIN を追加（旧: `organizations(name)` + `owner.company_name` → 新: `client_profiles.display_name` に一本化）
  - `actions.ts:304-316` — `resolveParticipantName()` で clientName を解決（新方式: `client_profiles.display_name → users.last_name + first_name` の 2 段階。旧 3 段階解決は廃止）
  - applicantName にも `company_name` フォールバック適用（`:304-308`）
  - ハードコード `"発注者"` は撤去済み
  - ⚠️ **要リファクタ**: organization spec 実装時に `resolveParticipantName()` のロジック変更に合わせて、SELECT の JOIN 先を `organizations(name)` から `client_profiles(display_name)` に変更すること
  - _Requirements: 6_

- [x] NAME-2. rejectApplicationAction の clientName 修正
  - `src/app/(authenticated)/applications/actions.ts:416-428` — NAME-1 と同じ名前解決パターンを適用
  - ⚠️ **要リファクタ**: NAME-1 と同様に organization spec 実装時にリファクタ
  - _Requirements: 6_

## Requirements Coverage

| Requirement | Tasks |
|-------------|-------|
| 1 (REQ-MT-001) 応募履歴一覧 | 5.0, 5.1 |
| 2 (REQ-MT-002) 応募詳細 + キャンセル | 1.1, 2.1, 3.1, 5.2, 8.1, 8.2, 8.3 |
| 3 (REQ-MT-003) 受注者 完了報告・評価 | 2.1, 3.2, 5.3, 8.1, 8.3 |
| 4 (REQ-MT-004) 応募一覧（発注者） | 1.2, 5.0, 6.1, 8.3 |
| 5 (REQ-MT-005) 応募詳細（発注者） | 1.2, 6.2 |
| 6 (REQ-MT-006) 発注可否 | 1.1, 1.2, 2.1, 2.2, 4.1, 4.2, 6.3, 8.1, 8.2, 8.3 |
| 7 (REQ-MT-007) 発注履歴一覧 | 1.2, 5.0, 7.1, 8.3 |
| 8 (REQ-MT-008) 発注履歴詳細 | 1.2, 7.2 |
| 9 (REQ-MT-009) 発注者 完了報告・評価 | 1.2, 2.1, 4.3, 7.3, 8.1, 8.3 |
| 10 (REQ-MT-010) 発注者評価表示 | 7.4 |
| 11 (REQ-MT-011) スカウト経由応募の連携 | S-1, S-2, S-3, S-4 |
