# Implementation Plan — 案件掲載機能（job-posting）

- [x] 1. Storage バケットとバリデーション基盤のセットアップ
- [x] 1.1 job-attachments Storage バケットの作成マイグレーション
  - Supabase マイグレーションファイルを作成し、job-attachments バケット（public）を作成する
  - Storage RLS ポリシーを設定: 認証済みユーザーが自分の userId フォルダにのみアップロード・削除可能、読み取りは全員可能
  - `supabase db reset` で適用を確認する
  - _Requirements: REQ-JP-004_

- [x] 1.2 (P) 案件の Zod バリデーションスキーマを作成する
  - 公開用スキーマ（jobSchema）: 案件フォームの全入力項目（タイトル、案件詳細、職種、報酬上限・下限、勤務地、工期、募集期間、募集人数、その他任意項目）に対応するスキーマを定義する。必須項目と任意項目を区別し、各フィールドに日本語のエラーメッセージを設定する。クロスフィールドバリデーション: 報酬上限 >= 下限、工期終了日 >= 開始日、募集終了日 >= 開始日。ステータスは draft / open / closed の3値のみ許可する
  - 下書き用スキーマ（jobDraftSchema）: タイトルのみ必須、その他全フィールドは optional。ステータスは "draft" のみ許可。createJobAction / updateJobAction 内で status === "draft" の場合にこのスキーマを使用する。数値フィールドの NaN は DB 保存時に null に変換する
  - _Requirements: REQ-JP-003, REQ-JP-004_

- [x] 1.3 (P) 画像ファイルバリデーションユーティリティを作成する
  - MIME タイプ（JPEG/PNG のみ）と拡張子の二重チェック関数を作成する
  - ファイルサイズ上限（10MB/枚）のチェック関数を作成する
  - 枚数上限（1案件あたり最大10枚）のチェック関数を作成する
  - エラーメッセージは日本語で返す
  - _Requirements: REQ-JP-003, REQ-JP-004_

- [x] 2. 案件作成 Server Action の実装
- [x] 2.1 createJobAction の基本実装
  - FormData から全フィールドを抽出し、Zod スキーマでサーバーサイドバリデーションを実行する
  - 認証チェック（ユーザーが client または staff ロールであること）を行う
  - サブスクリプションの有効性（active または past_due）を確認する
  - jobs テーブルに INSERT する（初期ステータスは draft）
  - 法人プランの場合は organization_id を自動設定する
  - ActionResult 型で成功時に作成された案件IDを返す
  - _Requirements: REQ-JP-004_

- [x] 2.2 個人プランの掲載制限チェックを実装する
  - createJobAction 内で、個人プランの場合に現在 open の案件数（status = 'open' かつ deleted_at IS NULL）をカウントする
  - open 案件が1件以上存在する場合はエラーを返す（「掲載上限（1件）に達しています。既存の募集中案件を締切にしてから再度お試しください」）
  - created_at には依存せず、現在の open 案件総数のみで判定する（バイパス防止）
  - 法人プランおよびその他有料プランでは制限をスキップする
  - _Requirements: REQ-JP-004_

- [x] 2.3 画像アップロード処理を実装する
  - FormData から画像ファイル（複数）を取得し、ファイルバリデーション（MIME タイプ、サイズ、枚数上限）を実行する
  - 各画像を `${userId}/${jobId}/${crypto.randomUUID()}.${ext}` パスで job-attachments バケットにアップロードする
  - アップロード成功後に getPublicUrl で公開URLを取得し、job_images テーブルに INSERT する（image_type: photo/document、sort_order を設定）
  - 画像アップロード失敗時は作成済みの job レコードは残し、エラーメッセージで再アップロードを促す
  - _Requirements: REQ-JP-004_

- [x] 3. 案件更新 Server Action の実装
- [x] 3.1 updateJobAction の基本実装
  - FormData から全フィールドを抽出し、Zod スキーマでバリデーションする
  - 認証チェック: 対象案件の owner_id が自分、または同一組織のメンバーであることを確認する
  - jobs テーブルを UPDATE する（updated_at は DB トリガーで自動更新）
  - 保存成功時に ActionResult で案件IDを返す
  - _Requirements: REQ-JP-003_

- [x] 3.2 ステータス遷移のホワイトリスト検証を実装する
  - 許可される遷移を定義する: draft → open、open → closed のみ（closed からの遷移は不可）
  - ステータスを変更しない編集（同じステータスのまま内容のみ更新）は常に許可する
  - 不正な遷移リクエストには「この操作は現在のステータスでは実行できません」エラーを返す
  - draft → open への遷移時に個人プランの掲載制限チェック（checkOpenJobLimit）を実行する
  - _Requirements: REQ-JP-003_

- [x] 3.3 (P) deleteJobImage Server Action を実装する
  - 対象画像の案件オーナー、または同一組織のメンバーであることを認可チェックする
  - 個人プラン（本人アップロード分）: 通常の Supabase クライアントで Storage から削除する
  - 法人プランで他メンバーがアップロードした画像の場合: is_same_org() で組織所属を検証後、service_role クライアントで Storage から削除する
  - job_images テーブルからレコードを削除する
  - _Requirements: REQ-JP-003_

- [x] 4. 案件一覧画面（CLI-001）の実装
  - デザインカンプ: `design-assets/screens/CLI-001.png`
- [x] 4.1 一覧ページの Server Component を実装する
  - Supabase から自分の案件一覧を取得する（deleted_at IS NULL、作成日時の降順）
  - 法人プランの場合は組織内全案件を取得し、作成者名を付記する
  - ページネーション（20件/ページ）をクエリパラメータで制御する
  - 「新規登録」ボタンを配置し、CLI-004（/jobs/create）へ遷移する
  - _Requirements: REQ-JP-001_

- [x] 4.2 一覧テーブルの Client Component を実装する
  - 各案件をカード形式で表示する: タイトル、職種、エリア、報酬、ステータスバッジ、募集期間
  - ステータスバッジの色分け: draft（グレー）/ open（緑）/ closed（赤）
  - 各案件クリックで CLI-002（詳細画面）へ遷移する
  - ページネーションUI（前へ/次へ）を実装する
  - デザインカンプに合わせたレイアウト・余白・カードスタイルを適用する
  - _Requirements: REQ-JP-001_

- [x] 5. 案件詳細画面（CLI-002）の実装
  - デザインカンプ: `design-assets/screens/CLI-002.png`
- [x] 5.1 詳細ページの Server Component を実装する
  - Supabase から案件の全情報と関連画像（job_images）を取得する
  - 認可チェック: 自分の案件、または同一組織の案件のみ表示可能（RLS で制御）
  - _Requirements: REQ-JP-002_

- [x] 5.2 詳細表示コンポーネントを実装する（CON-003 スタイル採用）
  - CON-003 と同じ DetailRow スタイル + セクション分割（条件 / 業務内容 / 発注者からのメッセージ）を採用する
  - 全フィールドに `alwaysShow` を適用し、値が空でも項目名と「—」を表示する
  - レイアウト順: ヘッダー → ステータスバッジ → 画像 → タイトル+会社名 → 案件詳細（description） → ボタン上部 → 条件セクション → 業務内容セクション → 発注者メッセージ → ボタン下部 → コピーボタン → 戻るリンク
  - 条件セクション表示項目: 報酬、エリア、住所、募集職種、募集人数、現場工期、募集期間、稼働時間、締め切り、経験年数、必須スキル、国籍・言語、持ち物
  - ステータスバッジ + 急募バッジ（option_subscriptions 参照）を表示する
  - 画像がない場合はプレースホルダーを表示する
  - 「応募者をみる」「編集する」ボタンを上下2箇所に同幅・中央配置する
  - 「掲載を終了する」ボタン（CloseJobButton）: 確認ダイアログ付き、closeJobAction で open → closed に更新
  - 「コピーして新規作成する」ボタンと「もどる」ボタンを同幅・縦並び中央配置する
  - _Requirements: REQ-JP-002_

- [x] 6. 案件フォーム共通コンポーネントの実装
  - デザインカンプ: `design-assets/screens/CLI-003.png`（編集）、`design-assets/screens/CLI-004.png`（新規登録）
- [x] 6.1 JobForm コンポーネントを実装する
  - react-hook-form + zodResolver で案件入力フォームを構築する（"use client"）
  - create / edit モードを props で切り替え可能にする
  - セクション分割: 基本情報（タイトル、案件詳細、職種）/ 報酬・勤務条件（報酬、勤務地、工期、募集期間、人数）/ 詳細情報（稼働時間、経験年数、スキル等の任意項目）/ 画像
  - 職種と都道府県は既存の OptionSets（constants/options.ts）からセレクトボックスで選択する
  - 日付入力はカレンダーピッカーを使用する
  - useTransition で送信中の pending 状態を管理し、送信ボタンを無効化する
  - 編集モードでは既存データをデフォルト値としてプリフィルする
  - ボタン構成: create → 「公開する」+「下書き保存」、edit+draft → 「公開する」+「下書き保存」、edit+非draft → 「更新する」
  - 「公開する」ボタンはバリデーション失敗時にトーストでエラーフィールドを通知し、shouldFocusError でエラー箇所に自動スクロールする
  - 「下書き保存」ボタンはクライアント側バリデーションをスキップし、サーバー側で jobDraftSchema（タイトルのみ必須）を使用する
  - デザインカンプに合わせたレイアウト・フォームスタイルを適用する
  - _Requirements: REQ-JP-003, REQ-JP-004_

- [x] 6.2 JobImageUploader コンポーネントを実装する
  - ファイル選択（複数可、accept="image/jpeg,image/png"）、プレビュー表示（URL.createObjectURL）、削除機能を実装する
  - クライアント側でファイルバリデーション（MIME タイプ、サイズ 10MB/枚、既存 + 新規合計10枚上限）を実行する
  - 10枚上限に達した場合はエラーメッセージを表示し、追加選択を無効化する
  - 編集モードでは既存画像のサムネイルを表示し、既存画像の削除には deleteJobImage Server Action を呼び出す
  - _Requirements: REQ-JP-003, REQ-JP-004_

- [x] 7. 新規登録・編集ページの実装と画面遷移の接続
- [x] 7.1 新規登録ページ（CLI-004）を実装する
  - Server Component で JobForm を create モードで配置する
  - `searchParams` から `copyFrom` クエリパラメータを取得し、指定がある場合はコピー元案件のデータを Supabase から取得して `defaultValues` として JobForm に渡す
  - コピー時: 日付フィールド（工期・募集期間）は空、ステータスは `"draft"`、画像はコピーしない
  - フォーム送信時に createJobAction を呼び出し、成功時に CLI-002（/jobs/[id]?manage=true）へリダイレクトする
  - 送信エラー時はトースト通知でエラーメッセージを表示する
  - _Requirements: REQ-JP-004_

- [x] 7.2 編集ページ（CLI-003）を実装する
  - Server Component で既存の案件データと画像を取得し、JobForm を edit モードで配置する
  - フォーム送信時に updateJobAction を呼び出し、成功時に CLI-002（/jobs/[id]?manage=true）へリダイレクトする
  - ステータス変更UIを実装する: draft → 「公開する」+「下書き保存」、open/closed → 「更新する」。下書き編集時も下書き再保存が可能
  - 送信エラー時はトースト通知でエラーメッセージを表示する
  - _Requirements: REQ-JP-003_

- [x] 7.3 画面遷移の接続を確認する
  - マイページ（CON-001）→ 募集現場一覧（CLI-001）への導線を確認・追加する
  - CLI-001 → CLI-002（各案件クリック）、CLI-001 → CLI-004（新規登録ボタン）の遷移を確認する
  - CLI-002 → CLI-003（編集ボタン）、CLI-004 → CLI-002（保存成功後リダイレクト）の遷移を確認する
  - CLI-003 → CLI-002（保存成功後リダイレクト）の遷移を確認する
  - _Requirements: REQ-JP-001, REQ-JP-002, REQ-JP-003, REQ-JP-004_

- [x] 8. テストの実装
- [x] 8.1 Zod スキーマと Server Action のユニットテストを作成する
  - jobSchema のバリデーション: 正常系（全必須項目入力）と異常系（必須項目不足、報酬上限 < 下限、日付矛盾）
  - createJobAction: Supabase クライアントをモックし、正常系（job 作成成功）と異常系（バリデーションエラー、認証エラー）をテストする
  - createJobAction の個人プラン制限チェック: open 案件0件で作成可能、open 案件1件以上で作成拒否、法人プランでは制限なし
  - updateJobAction のステータス遷移ホワイトリスト: draft→open 許可、open→closed 許可、closed→draft 拒否、closed→open 拒否
  - updateJobAction の draft→open 遷移時の個人プラン掲載制限チェック
  - 画像バリデーション: MIME タイプ不正、サイズ超過、枚数上限超過
  - Supabase クライアントのモックは { data, error } 形状を正確に再現すること
  - _Requirements: REQ-JP-001, REQ-JP-002, REQ-JP-003, REQ-JP-004_

- [x] 8.2 RLS テスト（pgTAP）を作成する
  - 発注者が自分の案件を作成・読み取り・更新・削除できることを確認する
  - 他ユーザーの案件を読み書きできないことを確認する
  - 組織メンバーが同一組織の案件を読み取れることを確認する
  - 受注者（contractor）が案件を作成・編集できないことを確認する
  - Storage RLS: 自分の userId フォルダへのアップロード・削除が可能、他ユーザーのフォルダへのアップロード・削除が不可能なことを確認する
  - _Requirements: REQ-JP-001, REQ-JP-002, REQ-JP-003, REQ-JP-004_

- [x] 8.3 E2E テスト（Playwright）を作成する
  - 案件新規作成フロー: フォーム入力 → 下書き保存 → 詳細画面で内容確認
  - 案件編集フロー: 既存案件のプリフィル確認 → 内容変更 → 保存 → 詳細画面で変更反映を確認
  - 画像アップロード: 画像添付 → 保存 → 詳細画面で画像表示を確認
  - ステータス変更: draft → open → closed の遷移を確認
  - テスト実行前に `supabase start` + `supabase db reset` + `npm run dev` が必要。seed.sql のテストユーザーを使用する
  - _Requirements: REQ-JP-001, REQ-JP-002, REQ-JP-003, REQ-JP-004_
