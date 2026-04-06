# Implementation Plan

- [x] 0. 既存テストの全実行とデグレ確認
  - `npm run test`（Vitest）を実行し、全テストがパスすることを確認する
  - `supabase test db`（pgTAP）を実行し、RLS テストが全パスすることを確認する
  - `npm run test:e2e`（Playwright）を実行し、E2E テストが全パスすることを確認する
  - 失敗がある場合は原因を調査・修正してから実装タスクに着手する

- [x] 1. 共通ユーティリティとサーバーアクションの実装
- [x] 1.1 応募可否判定ユーティリティの実装
  - 無料ユーザーの応募可否を判定する共通関数を作成する
  - 有料ユーザーの判定: subscriptions テーブルで status IN ('active', 'past_due') のレコード存在チェック。staff ロールも有料扱い
  - 無料ユーザー: 案件の職種がユーザーの登録職種に含まれ、かつ案件の都道府県がユーザーの対応エリアに含まれる場合のみ応募可
  - DB の is_paid_user() ヘルパー関数と同等のロジックをサーバーサイドで再現する
  - フロントエンド（CON-003）とサーバーサイド（applyJobAction）の両方から呼び出せる設計にする
  - _Requirements: 2, 3_

- [x] 1.2 応募登録サーバーアクションの実装
  - security.md 準拠のチェック順序で実装: 認証→ロール→Zod バリデーション→案件ステータス（open + deleted_at IS NULL）→重複応募チェック（cancelled のみ除外、rejected 後の再応募は不可）→応募制限チェック（無料ユーザーのみ）→INSERT
  - FormData から応募情報を抽出し、Zod スキーマ（jobId, headcount, workingType, preferredFirstWorkDate, message）でバリデーション
  - 成功時は ActionResult<{ applicationId: string }> を返す
  - エラーメッセージは日本語で返す（重複応募、応募制限違反、案件終了等）
  - _Requirements: 3_

- [x] 1.3 お気に入りトグルサーバーアクションの実装
  - security.md 準拠のチェック順序で実装: 認証→ロール×target_type バリデーション→target_id 存在チェック→SELECT/INSERT/DELETE
  - 受注者は 'job' / 'client' のみ許可、発注者・担当者は 'job' / 'client' / 'user' の3種を許可
  - 存在しない target_id でのお気に入り登録を防止する
  - 楽観的 UI 用に isFavorited を ActionResult で返す
  - _Requirements: 1, 4, 5, 6, 7, 8_

- [x] 1.4 退会済みユーザー表示名ユーティリティの実装
  - deleted_at IS NOT NULL のユーザーの氏名・会社名を「退会済みユーザー」と表示する共通関数を作成する
  - 該当画面: CON-005, CON-006, CLI-005, CLI-006
  - 既存の getUserDisplayName() があれば利用、なければ新規作成する
  - _Requirements: 4, 5, 7, 8_

- [x] 2. 共通 UI コンポーネントの実装
- [x] 2.1 (P) お気に入りボタンコンポーネントの実装
  - Client Component で楽観的 UI を実現する（クリック時に即座にトグル、Server Action 完了を待たない）
  - Server Action 失敗時は状態をロールバックし、トーストでエラー通知する
  - `assets/icons/icon-heart.png` のプロジェクト専用アイコンを使用する（グレー: 未登録、塗りつぶし: 登録済み）
  - targetType ('job' / 'client' / 'user')、targetId、initialIsFavorited を props として受け取る
  - 6画面以上で再利用する共通コンポーネントとして設計する
  - _Requirements: 1, 2, 4, 5, 6, 7, 8_

- [x] 2.2 (P) 検索フィルターシートコンポーネントの実装
  - shadcn/ui Sheet コンポーネントで検索フィルターモーダルを実装する
  - 画面ごとに異なるフィルター項目を柔軟に構成できる設計にする（children または設定 props）
  - 「検索する」ボタンで searchParams を更新し、Sheet を閉じる
  - CON-002: キーワード、エリア、希望日程、募集職種、経験年数、国籍・言語
  - CON-005: キーワード、募集エリア、募集職種、従業員規模、求める働き方、言語
  - CLI-005: 対応職種、対応エリア、希望日程、経験年数、保有スキル、保有資格、お気に入り登録
  - _Requirements: 1, 4, 7_

- [x] 2.3 (P) ページネーションコンポーネント（PaginationControls）の実装
  - searchParams ベースのページネーションを実装する（20件ずつ）
  - コンポーネント名は PaginationControls とする（design.md のアーキテクチャ図と一致させる）
  - Server Component でのデータ取得に対応し、ページ番号を searchParams で管理する
  - CON-002, CON-005, CON-007, CLI-005 の4画面で再利用する
  - _Requirements: 1, 4, 6, 7_

- [x] 2.4 (P) 案件カードコンポーネントの実装
  - デザインカンプ（CON-002）に準拠した案件カードを実装する
  - SP: grid-cols-1、PC: md:grid-cols-2 lg:grid-cols-3
  - サムネイル画像は `<img>` タグで表示する（next/image は使用しない）
  - 画像左上に急募バッジ（is_urgent = true の場合）を absolute 配置
  - タイトル、会社名、職種、報酬、エリア、募集期間を表示する
  - アイコン: icon-briefcase.png（職種）、icon-pin.png（エリア）、icon-sort.png（日程）
  - お気に入りボタン（FavoriteButton）と「詳細をみる」リンクを含める
  - _Requirements: 1, 6_

- [x] 3. RLS ポリシー・インデックス・テーブル制約のマイグレーション作成
- [x] 3.1 RLS ポリシーの作成
  - jobs（SELECT）: 一般ユーザーは status = 'open' AND deleted_at IS NULL のみ。案件作成者は自分の案件を draft/closed・削除済み含めて閲覧可。同一組織メンバーは draft/closed 含めて閲覧可（deleted_at IS NULL のみ）。管理者は全件閲覧可
  - applications（INSERT）: applicant_id = auth.uid() のみ。（SELECT）: applicant_id = auth.uid() OR job.owner_id = auth.uid()
  - favorites（SELECT/INSERT/DELETE）: user_id = auth.uid() のみ
  - client_profiles, user_skills, user_available_areas, user_qualifications, user_reviews, available_schedules, job_images: 全ユーザー閲覧可
  - _Requirements: 1, 2, 3, 4, 5, 6, 7, 8_

- [x] 3.2 インデックスとテーブル制約のマイグレーション作成
  - 案件検索ソート用インデックス: jobs (status, is_urgent DESC, created_at DESC) WHERE deleted_at IS NULL
  - applications の UNIQUE 制約: (job_id, applicant_id) WHERE status NOT IN ('cancelled')（既存確認の上で追加）
  - favorites の UNIQUE 制約: (user_id, target_type, target_id)（既存確認の上で追加）
  - favorites と applications の既存インデックスは database-schema.md で定義済みのため、重複作成しない
  - _Requirements: 1, 3, 6_

- [x] 4. 案件一覧・詳細画面の実装（CON-002, CON-003）
- [x] 4.1 募集案件一覧画面の実装（CON-002）
  - デザインカンプ（CON-002-design-sp.png, CON-002-design-pc.png）に準拠してレイアウトを実装する
  - Server Component で案件データを取得する。クエリに recruit_end_date フィルター（今日以降）を含める
  - searchParams: q（キーワード）、prefecture（エリア）、tradeType（職種）、sort（newest/reward_high/reward_low）、page
  - 上位表示ロジック: 急募案件を最上位に表示（ORDER BY is_urgent DESC, created_at DESC）。報酬順ソート選択時は上位表示ロジックを適用しない
  - ヘッダー: ロゴ + ハンバーガーメニュー、ページタイトル「募集案件一覧」、件数表示 + ソートアイコン（icon-sort.png）
  - 検索ボタン（icon-search.png）から SearchFilterSheet を開く
  - ページ背景: bg-muted
  - _Requirements: 1_
  - _デザインカンプ: CON-002-design-sp.png, CON-002-design-pc.png, CON-002-popup.png_
  - _デザイン要件CSS: design-assets/specs/CON-002-sp.css, design-assets/specs/CON-002-pc.css_
  - ⚠️ CSS spec の色・余白・フォントの値を優先してデザインを再現すること

- [x] 4.2 募集案件詳細画面の実装（CON-003）
  - デザインカンプ（CON-003.png）に準拠してレイアウトを実装する
  - Server Component で案件の全情報を取得する（jobs + job_images + users JOIN）
  - 案件画像は `<img>` タグで表示する（Supabase Storage）
  - 応募制限判定: canApplyJob ユーティリティを使用し、無料ユーザーの応募可否をフロントで判定する
  - 応募不可の場合: ボタン非活性 + 「有料プランに加入するか、プロフィールの職種・エリアを更新してください」メッセージ
  - 情報セクション: 報酬、エリア、募集職種、募集人数、勤務地、現場工期、募集期間、稼働時間、必要経験年数、必須スキル、国籍・言語、持ち物、スケジュール詳細、請負案件詳細、発注者からのメッセージ
  - お気に入りボタン、「応募する」ボタン（→ CON-004）、発注者情報リンク（→ CON-006）
  - 下部固定の「応募する」ボタン
  - _Requirements: 2_
  - _デザインカンプ: CON-003.png_

- [x] 5. 応募入力画面の実装（CON-004）
  - デザインカンプ（CON-004.png）に準拠してレイアウトを実装する
  - ルーティング: /jobs/[id]/apply（CON-003 の「応募する」ボタンから遷移）
  - 案件サマリー（タイトル、会社名、報酬、エリア、稼働時間等）を画面上部に表示する
  - フォームフィールド: 応募人数（数値、必須）、日程/働き方（必須）、初回稼働希望日（日付、必須）、申し送り（テキスト、任意）
  - Zod スキーマでクライアントサイドバリデーションを実施する
  - 「上記内容を確認しました」チェックボックスと「応募する」ボタン（CTA）+ 「もどる」リンク
  - 確認 Dialog: 「この情報で応募して良いですか」→ OK → applyJobAction 実行 → 完了 Dialog「応募が完了しました」→ OK → CON-011 へ遷移
  - _Requirements: 3_
  - _デザインカンプ: CON-004.png_

- [x] 6. 発注者一覧・詳細画面の実装（CON-005, CON-006）
- [x] 6.1 (P) 発注者一覧画面の実装（CON-005）
  - デザインカンプ（CON-005.png, CON-005-popup.png）に準拠してレイアウトを実装する
  - Server Component で users + client_profiles を JOIN して取得する。deleted_at IS NULL でフィルタする
  - 発注者アバターは `<img>` タグで表示する（Supabase Storage）
  - カードリスト（1カラム）: アバター + 会社名 + 住所、募集職種、募集エリア、求める働き方（チェックマーク付き）
  - 「マイリスト登録」ボタン（FavoriteButton）+ 「詳細をみる」ボタン
  - 件数表示 + 検索ボタン（icon-search.png）+ ページネーション
  - _Requirements: 4_
  - _デザインカンプ: CON-005.png, CON-005-popup.png_

- [x] 6.2 (P) 発注者詳細画面の実装（CON-006）
  - デザインカンプ（CON-006.png）に準拠してレイアウトを実装する
  - Server Component で発注者の詳細情報を取得する（users + client_profiles JOIN）
  - 退会済みユーザーの場合: 「退会済みユーザー」と表示し、操作ボタン（メッセージ送信等）を非表示にする
  - アバターは `<img>` タグで表示する
  - 情報セクション: 募集職種、募集エリア、従業員規模、求める働き方、発注者からのメッセージ
  - 掲載中の案件一覧（案件カード形式）を表示する
  - お気に入りボタン、「メッセージを送る」導線
  - _Requirements: 5_
  - _デザインカンプ: CON-006.png_

- [x] 7. マイリスト画面の実装（CON-007）
  - デザインカンプ（CON-007.png, CON-007-b.png）に準拠してレイアウトを実装する
  - searchParams で表示タブ（type: job/client/user）とページ番号を管理する
  - Server Component で favorites テーブルから target_type でフィルタリングして取得する
  - プルダウン切り替え（Select コンポーネント）: 受注者は「案件」/「発注者」の2項目、発注者は「案件」/「発注者」/「見込みユーザー」の3項目
  - タブ内容に応じたカード一覧: 案件タブは JobListCard、発注者タブは CON-005 と同様、見込みユーザータブは CLI-005 と同様
  - 「マイリスト解除」ボタン + 「詳細をみる」ボタン + 「もどる」ボタン
  - ページネーション（タブごとに独立）
  - _Requirements: 6_
  - _デザインカンプ: CON-007.png, CON-007-b.png_

- [x] 8. 職人一覧・詳細画面の実装（CLI-005, CLI-006）
- [x] 8.1 (P) 職人一覧画面の実装（CLI-005）
  - デザインカンプ（CLI-005.png, CLI-005-popup-a.png, CLI-005-popup-b.png）に準拠してレイアウトを実装する
  - 発注者（client）と担当者（staff）のみアクセス可能にする（Middleware で制御）
  - Server Component で users + user_skills + user_available_areas を JOIN して取得する。deleted_at IS NULL でフィルタする
  - 職人アバターは `<img>` タグで表示する
  - カードリスト（1カラム）: アバター + 氏名 + 年齢、対応職種（複数）、本人確認バッジ（icon-tag.png）、CCUS バッジ、対応エリア（icon-globe.png）、経験年数
  - 高評価バッジ: 「発注者の再発注希望80%!」等
  - 件数表示 + 検索ボタン + ソートボタン（icon-sort.png）+ ページネーション
  - お気に入りボタン（target_type = 'user'）+ 「詳細をみる」ボタン
  - _Requirements: 7_
  - _デザインカンプ: CLI-005.png, CLI-005-popup-a.png, CLI-005-popup-b.png_

- [x] 8.2 (P) 職人詳細画面の実装（CLI-006）
  - デザインカンプ（CLI-006.png, CLI-006-design-sp.png, CLI-006-design-pc.png）に準拠してレスポンシブレイアウトを実装する
  - 発注者（client）と担当者（staff）のみアクセス可能にする
  - Server Component で職人のプロフィール詳細を取得する（users + user_skills + user_available_areas + user_qualifications + available_schedules + user_reviews JOIN）
  - 退会済みユーザーの場合: 「退会済みユーザー」と表示し、操作ボタンを非表示にする
  - アバターは `<img>` タグで表示する
  - バッジ: 本人確認済み（icon-tag.png）、CCUS 登録済み
  - PR 動画（登録済みの場合）を表示する
  - セクション: 基本情報（性別、都道府県、会社名/屋号）、自己紹介、能力（職種×経験年数、スキル、資格）、対応可能エリア、空き日程
  - 発注者からの評価（user_reviews 集計）、「評価を見る」リンク（→ CLI-028）
  - 「メッセージを送る」ボタン + 「スカウトを送る」ボタン + お気に入りボタン
  - _Requirements: 8_
  - _デザインカンプ: CLI-006.png, CLI-006-design-sp.png, CLI-006-design-pc.png_
  - _デザイン要件CSS: design-assets/specs/CLI-006-sp.css, design-assets/specs/CLI-006-pc.css_
  - ⚠️ CSS spec の色・余白・フォントの値を優先してデザインを再現すること

- [x] 9. Middleware のルーティング制御を追加する
  - CON-002〜007: ログイン済みユーザーのみアクセス可能にする
  - CLI-005, CLI-006: 発注者（client）と担当者（staff）のみアクセス可能にする
  - 既存の Middleware に新しいパスを追加する
  - _Requirements: 1, 2, 3, 4, 5, 6, 7, 8_

- [x] 10. テストの実装
- [x] 10.1 ユニットテスト・統合テストの実装
  - canApplyJob ユーティリティ: 有料ユーザー（active/past_due/staff）、無料ユーザー（職種×エリア合致/不合致）の各パターン
  - applicationSchema Zod バリデーション: 正常系 + 各フィールドの異常系
  - applyJobAction: FormData 組み立て → Supabase モック → 正常系 + 案件ステータス不正 + 重複応募 + 応募制限違反 + 認証エラー
  - toggleFavoriteAction: 未登録→登録、登録済み→解除、target_type 不正（受注者が 'user' を指定）、target_id 存在しない、認証エラー
  - Server Action 自体を vi.mock で差し替えない。Supabase クライアントをモックし、内部ロジックが実際に動くテストを書く
  - _Requirements: 1, 2, 3, 4, 5, 6, 7, 8_

- [x] 10.2 RLS テスト（pgTAP）の実装
  - 受注者は status = 'open' の案件のみ SELECT 可能であることを検証する
  - favorites は自分のレコードのみ SELECT/INSERT/DELETE 可能であることを検証する
  - applications は自分の応募のみ INSERT 可能であることを検証する
  - テスト用 UUID は seed.sql と重複させない
  - _Requirements: 1, 3, 6_

- [x] 10.3 E2E テスト（Playwright）の実装
  - 案件検索 → 案件詳細 → 応募入力 → 確認 → 完了 → 応募履歴一覧へ遷移のフロー
  - お気に入り登録/解除 → マイリストに反映されるフロー
  - 発注者一覧 → 発注者詳細の基本フロー
  - seed.sql のテストユーザー（contractor@test.local 等）を使用する
  - テストの期待値は seed.sql のデータと整合させる
  - _Requirements: 1, 2, 3, 4, 5, 6_
