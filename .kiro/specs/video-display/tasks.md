# Implementation Plan

> 並列実行マーカー `(P)` は「先行タスク完了後に他タスクと同時着手しても、ファイル競合・データ依存が無い」サブタスクに付与。詳細の依存注記を必ず確認すること。

- [x] 1. 既存テストの全実行とデグレ確認
  - `npm run test`（Vitest）/ `supabase test db`（pgTAP）/ `npm run test:e2e`（Playwright）を順に実行し、全テストがパスすることを確認する
  - 失敗がある場合は原因を調査・修正してから以降のタスクに着手する（E2E は `supabase start` + `supabase db reset` + `npm run dev` 起動を前提）

- [x] 2. (P) `client_profiles` に職場紹介動画 URL カラムを追加するマイグレーション
  - `client_profiles` に `workplace_video_url`（text, NULL 許容, default なし, index 不要, CHECK なし）を追加するマイグレーションを作成する
  - 既存 RLS（SELECT 公開 / 書き込みは own）で十分なことを確認し、ポリシー追加は行わない
  - `option_subscriptions.option_type` は CHECK 制約が無いため `'video_workplace'` 追加に DDL 変更不要（既存 `'video'` の意味は据置・rename しない）ことを確認する
  - _Requirements: 5.1, 8.1_

- [x] 3. 動画埋込・検証・オプション判定の共通基盤
- [x] 3.1 (P) 動画 URL 解析レイヤー `parseVideoUrl` と PATTERNS テーブルを実装
  - URL から `{ platform, id, aspect, embedUrl }` を抽出、未対応・不正は `null` を返す純粋関数を実装する（ネットワーク I/O なし）
  - `new URL()` で host/path を分離し、hostname 完全一致（`tiktok.com` / `www.tiktok.com`）+ pathname パターンで判定。host 偽装・クエリ内 URL を構造的に排除する
  - Phase 1 は TikTok 標準閲覧 URL（`@user/video/{digits}`）のみ通過。短縮/共有 URL は非対応。`embedUrl` は捕捉 id から常に TikTok player URL を再構築する
  - 新規プラットフォーム対応が PATTERNS への 1 エントリ追加で済む構造にする
  - 単体テスト: 標準 URL（www 有/無・末尾クエリ有）で抽出成功、短縮・共有・host 偽装・空文字で `null`
  - _Requirements: 3.1, 3.2, 3.3, 8.5_

- [x] 3.2 動画埋込コンポーネント `VideoEmbed` を実装
  - 静的プレースホルダー画像 + 中央の三角再生ボタンを描画し、押下で shadcn Dialog ライトボックスを開いて iframe 埋込再生する
  - `parseVideoUrl` が `null` の URL では何も描画しない（外部リンクフォールバックを出さずサイレント非表示）
  - 縦長は 9:16、横長（将来）は 16:9 でプレイヤー領域を確保。自身は active 判定を行わず、表示可否は呼び出し側に委ねる
  - 再生ボタン・Dialog トリガーは `type="button"` を明示、iframe に `title`/`aria-label`/`allow="fullscreen"` を付与、`dangerouslySetInnerHTML` は使わない
  - TikTok アカウント非公開・動画削除済みのケースでも iframe ロードエラーを捕捉せず、TikTok 埋込プレイヤーのエラー表示に委ねる（ビジ友側に独自のエラー UI を出さない）
  - 依存: 3.1 完了後
  - _Requirements: 3.4, 3.5, 3.6, 3.7, 3.8, 8.7_

- [x] 3.3 (P) 動画 URL の Zod 検証スキーマ `VideoUrlSchema` を実装
  - 空文字（掲載停止＝NULL 更新用）を許容し、非空は `parseVideoUrl` 通過を必須とする。不正時は「対応プラットフォームの URL を入力してください」を返す
  - クライアント（フォーム）とサーバー（Server Action）が同一スキーマを共有し二重防御する
  - 依存: 3.1 完了後。単体テスト（空文字通過 / 不正 URL でエラー）を含む
  - _Requirements: 2.5, 8.6_

- [x] 3.4 (P) 正準 `OptionType` 型と active オプション判定ヘルパー `hasActiveOption` を実装
  - 既存リテラル（video / video_workplace / urgent / compensation_5000 / compensation_9800）を 1 箇所に集約する正準 union 型を定義する
  - `hasActiveOption(client, userId, optionType)`: `option_subscriptions` を `status='active'` で存在チェック。`'cancelled'`/`'expired'` は false（URL は保持しつつ表示判定で非表示、論理状態のみで管理し物理削除しない）
  - Supabase クライアントを引数化し、cross-user 参照（他ユーザーの option）では admin（service-role）client を渡す前提とする（RLS は `user_id=auth.uid()` OR `is_admin()`）
  - 単体テスト: active=true / cancelled・expired=false / 該当 option_type 無し=false（`{data,error}` 形状を再現、異常系含む）
  - _Requirements: 4.1, 4.4, 5.1, 5.3, 8.1, 8.3, 8.4_

- [x] 3.5 (P) ミドルウェアに CSP `frame-src` を付与
  - 既存ミドルウェアの応答に `Content-Security-Policy: frame-src 'self' https://www.tiktok.com` を付与する（`default-src` 等は付けず frame-src のみで回帰ゼロ）
  - 認証ページ応答に確実に付与されることを確認し、将来プラットフォーム追加時にドメインを追記できる形にする
  - _Requirements: 3.9, 3.10_

- [x] 4. 職場紹介動画オプションの課金拡張
- [x] 4.1 (P) Checkout Action に `video_workplace` 分岐と発注者プラン未加入ガードを追加
  - 価格 ID 解決を正準 `OptionType` で型付けし、`video_workplace → STRIPE_PRICE_VIDEO_WORKPLACE` を追加。既存「動画掲載」(video) と独立した 2 つの Stripe Price として管理する
  - 入力スキーマに `video_workplace` を追加、成功 URL に `?option_success=video_workplace` を構築
  - 発注者プラン加入者（`plan_type` が `individual/small/corporate/corporate_premium` かつ `status='active'`、past_due は不可）でなければ拒否。staff/admin は既存ロールチェックで拒否
  - `.env.local.example` に `STRIPE_PRICE_VIDEO_WORKPLACE` を追記
  - 依存: 3.4 完了後（OptionType 利用）
  - _Requirements: 1.1, 1.2, 1.4, 1.6, 7.3, 7.4, 8.2_

- [x] 4.2 (P) Webhook に職場紹介動画オプションの登録処理を追加
  - `checkout.session.completed`（`metadata.type='option'`, `option_type='video_workplace'`）受信時に `option_subscriptions` へ `payment_type='one_time'` / `option_type='video_workplace'` / `status='active'` / `end_date=NULL` で INSERT する（`start_date` は DB default）
  - 既存「動画掲載」(video) の登録処理と同パターン。冪等性は既存 webhook event dedupe に委ねる
  - 依存: 3.4 完了後。統合テスト（正しい列で INSERT、error ケース含む）を含む
  - _Requirements: 1.3, 8.4_

- [x] 4.3 CLI-026 に「職場紹介動画掲載」セクションを追加
  - 既存「動画掲載」(受注者PR) セクションを一切変更せず、その直下に独立した 2 行目として追加する
  - 金額「100,000円/動画」・説明「現場や会社の雰囲気を伝える動画を、発注者詳細画面に掲載します。」・「職場紹介動画掲載を申し込む」ボタンを配置
  - ボタン非活性条件 = 処理中 / staff / 発注者プラン未加入（既存 props の `currentPlan` ∈ 有料プラン かつ `!isPastDue` から導出、新規 prop 追加不要）
  - 購入完了で戻った際に `?option_success=video_workplace` を読み取り「職場紹介動画掲載オプションのお申し込みが完了しました」トーストを表示。解約 UI は提供しない
  - デザインカンプ: `design-assets/screens/CLI-026.png` / `CLI-026-b.png`
  - 依存: 4.1 完了後
  - _Requirements: 1.4, 1.5, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 4.4 課金拡張のテスト
  - 単体: 価格 ID 解決・成功 URL 構築の `video_workplace` 分岐が正しい env/URL を返す
  - 統合: 発注者プラン未加入・past_due・staff での購入拒否（Server Action 内部ロジックを実行、モックは `{data,error}` 形状を再現し正常系・異常系両方）
  - _Requirements: 1.1, 1.2, 7.3, 8.2_

- [x] 5. 管理者画面（動画運用に必要な最小サーフェス）
- [x] 5.1 管理者ルートの土台とエントリルートを整備
  - admin route group + layout + 共通ナビを新設し、各ページで `role='admin'` を再チェックする（ミドルウェアの `/admin/*` 制限と二重化）
  - ミドルウェアが admin を `/admin/dashboard` へ redirect するため、最小ランディング `/admin/dashboard`（ADM-008 への導線を置く）を作成するか redirect 先を ADM-008 に変更し、admin ログイン直後の 404 を解消する
  - _Requirements: 2.1, 6.1_

- [x] 5.2 (P) ADM-008 ユーザーアカウント一覧 + オプション加入者フィルター
  - 表示列は screen-map 定義（氏名・年齢・メールアドレス・退会済み表示、氏名/メールのキーワード検索、20 件ページネーション）に従う
  - 「オプションプラン加入者」プルダウンを 4 単一選択（動画掲載(受注者PR) / 職場紹介動画掲載 / 補償¥5,000 / 補償¥9,800）で実装。未選択は絞り込みなし
  - 絞り込みはサーバー側で適用（対象 option_type の active な user_id 集合を取りメインクエリに `in` で渡す）。フィルタ状態は URL searchParams を SSOT とする
  - デザインカンプ: `design-assets/screens/ADM-008.png`
  - 依存: 5.1 完了後
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 5.3 (P) ADM-009 ユーザーアカウント詳細 + 動的投稿ボタン + PR動画表示
  - 対象ユーザーの active オプションに応じ、`'video'` あれば「受注者PR動画を投稿する」（ADM-010 へ）、`'video_workplace'` あれば「職場紹介動画を投稿する」（ADM-010B へ）を動的表示（0/1/2 個）。どちらも無ければボタンを出さない
  - `users.video_url` 設定済みかつ active な `'video'` がある場合のみ PR動画を `VideoEmbed` で描画する
  - デザインカンプ: `design-assets/screens/ADM-009.png`
  - 依存: 5.1 / 3.2 / 3.4 完了後
  - _Requirements: 2.1, 2.2, 4.3, 4.6_

- [x] 5.4 (P) ADM-010 / ADM-010B 動画投稿フォームと更新 Server Action
  - 両画面は同一レイアウト（URL 入力 + 「更新」ボタン（入力状態に依らず固定）+ 現在の登録 URL 表示・未登録時「未登録」+ もどる）。差分は対象カラムと Server Action のみ
  - ADM-010 は `users.video_url`、ADM-010B は `client_profiles.workplace_video_url` を更新。`VideoUrlSchema` 検証を通過した場合のみ更新し、空文字入力時は対応カラムを NULL に更新（掲載停止）
  - 検証失敗時は `{ success:false, error }` で日本語メッセージを返しトースト表示。更新は admin（service-role）client で実行。送信ボタンは `type="submit"`、もどるは `type="button"`
  - デザインカンプ: `design-assets/screens/ADM-010.png`（ADM-010B も同レイアウト流用）
  - 依存: 5.1 / 3.3 / 2 完了後
  - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [x] 5.5 管理者動画投稿のテスト
  - 統合: URL 更新 / 空文字で NULL 更新 / 不正 URL で拒否（書き込み + 権限系のためフルテスト、Server Action 内部ロジックを実行）
  - 一般ユーザー・staff が更新 Server Action を実行できないこと（三重防御の確認）
  - _Requirements: 2.3, 2.4, 2.5, 2.6_

- [x] 6. 表示統合（受注者PR動画・職場紹介動画）
- [x] 6.1 (P) COM-001 プロフィール詳細の PR動画表示をリファクタ
  - 既存「動画を見る」テキストリンク実装を `VideoEmbed` 呼び出しへ完全置換する
  - `users.video_url` 設定済みかつ active な `'video'` がある場合のみ描画（自分のページのため通常クライアントで判定）。オプション無効時は描画しない
  - デザインカンプ: `design-assets/screens/COM-001.png`
  - 依存: 3.2 / 3.4 完了後
  - _Requirements: 4.1, 4.4, 4.5_

- [x] 6.2 (P) CLI-006 受注者詳細に PR動画セクションを新規追加
  - 対象ユーザーの `users.video_url` 設定済みかつ active な `'video'` がある場合のみ `VideoEmbed` を描画する
  - cross-user 参照のため active 判定は admin（service-role）client で実行する（通常クライアントの nested join はサイレント null になる）
  - デザインカンプ: `design-assets/screens/CLI-006.png` / `CLI-006-design-pc.png` / `CLI-006-design-sp.png`
  - 依存: 3.2 / 3.4 完了後
  - _Requirements: 4.2, 4.6_

- [x] 6.3 (P) CON-006 発注者詳細に職場紹介動画を新規追加
  - 取得クエリに `workplace_video_url` を追加し、設定済みかつ active な `'video_workplace'` がある場合のみ `VideoEmbed` を描画する
  - 表示位置はアクションボタン群（マイリスト・メッセージを送る）の直下、募集職種より上。対象は `role='client'` の Owner 単一を参照
  - cross-user 参照のため active 判定は admin（service-role）client で実行する
  - デザインカンプ: `design-assets/screens/CON-006.png`
  - 依存: 3.2 / 3.4 / 2 完了後
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 7. E2E テストとシードデータ
- [x] 7.1 seed データの整備
  - 「video_url あり + active video あり」「video_url あり + active video なし（解約/未加入）」「workplace_video_url あり + active video_workplace あり」「同なし」の受注者・発注者を用意する
  - 各ユーザーの option_subscriptions / subscriptions / 表示判定が業務フローと整合すること（active 判定の挙動変更検証に使う）
  - _Requirements: 4.4, 8.3_

- [x] 7.2 E2E（Playwright）でユーザーストーリーを網羅
  - 発注者: CLI-026 で職場紹介動画購入フロー（ボタン → Stripe）。未加入・staff でボタン非活性
  - 表示: COM-001 で自分の PR動画が描画され、再生ボタンで `iframe[src*="tiktok.com/player/v1"]` が出現（再生検証はせず src のみ assert）
  - cross-user: CLI-006（client/staff 視点）/ CON-006 で対象ユーザーの動画が表示される（admin client 経路の回帰防止）
  - 非表示回帰: 「video_url あり + active なし」ユーザーで動画が描画されないこと
  - 管理者: admin ログイン → `/admin/dashboard` → ADM-008 → ADM-009（ボタン 0/1/2 個）→ ADM-010/010B で URL 登録・空更新（掲載停止）をクリック導線で通す
  - TikTok 非公開/削除動画は TikTok 側のエラー表示に委ね、ビジ友側ではエラーを出さない方針を確認
  - 依存: 1〜6 / 7.1 完了後
  - _Requirements: 1.1, 4.1, 4.2, 5.1, 5.3, 7.3, 8.7_

- [x] 8. 関連 spec / steering ドキュメントの同期
- [x] 8.1 (P) steering の更新
  - `screen-map.md`: ADM-008 フィルターを 4 選択肢に、ADM-009 を 2 ボタン動的表示に、ADM-010 ラベルを「『更新』ボタン（固定）」に修正し、ADM-010B 行を新規追加（PNG=ADM-010.png 流用、画面 ID 73）
  - `screen-navigation.md`: ADM-009 → ADM-010 / ADM-010B の 2 ルート遷移に更新
  - `database-schema.md`: `client_profiles.workplace_video_url` 追加、`option_subscriptions.option_type` に `'video_workplace'` を追記
  - `product.md`: オプションプラン表に「職場紹介動画掲載 100,000円/動画 単発」行を追加。`roles-and-permissions.md`: 「ADM-008〜010」表記を「ADM-008〜010B」に更新
  - _Requirements: 2.8, 5.1, 6.1, 8.1_

- [x] 8.2 (P) 関連 spec の更新
  - `billing/`: 新 Stripe Price `STRIPE_PRICE_VIDEO_WORKPLACE` と Webhook 分岐（`option_type='video_workplace'`）を追記（既存「動画掲載」記述は据置）
  - `profile/`: テキストリンク → 埋込 + active 判定の実装を spec に同期
  - `job-search/`: CON-006 表示項目に「職場紹介動画（ヘッダー直下、active 判定付き）」を追加
  - `admin/`: ADM-008 フィルター 4 選択肢、ADM-009 動的ボタン、ADM-010 ラベル、REQ-ADM-010B 新設を反映
  - _Requirements: 1.6, 4.5, 5.2, 6.1_
