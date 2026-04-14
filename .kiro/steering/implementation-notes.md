# 実装時の検討事項

仕様レビューで検出された項目のうち、仕様書の修正ではなく **実装フェーズ（spec-design）で判断・決定すればよいもの** をまとめたリストです。

### ステータス凡例

| ステータス | 意味 |
|-----------|------|
| ✅ 対応済み | 仕様書に反映済み。実装時に追加作業は不要 |
| 🔲 未着手 | 実装フェーズで対応が必要 |
| 🔶 実装時決定 | 実装フェーズで具体的な方法を選択・決定する |

---

## データベース関連

### 1. ~~updated_at の自動更新トリガー~~ → **対応済み** ✅
- database-schema.md の「基本方針」セクションにトリガー関数の定義と適用ルールを追記済み

### 2. ~~is_proxy と proxy_sender_id の整合性 CHECK 制約~~ → **廃止** ❌
- proxy_sender_id カラムを削除（代理アカウントは sender_id の書き換えをせず、通常の担当者と同じフローで送信する）。is_proxy フラグのみ残し、送信時に自動設定する

### 3. ソフトデリートのカスケード実装方式 🔶 実装時決定
- ユーザー退会時のカスケード処理（関連テーブルの更新）を DB トリガーで行うか Server Action で行うか
- 方針: Server Action で実行する（organizations のオーナー削除ルールと統一）

### 4. service_role キーの使用場所・初期化 🔲 未着手
- Webhook 処理や管理者操作で service_role キーが必要
- 実装時に環境変数（SUPABASE_SERVICE_ROLE_KEY）として設定し、Server Action / Edge Function からのみ使用する

## 画面・UX 関連

### 5. ~~「当月」カウントのタイムゾーン~~ → **対応済み** ✅
- messaging/requirements.md および job-posting/requirements.md に JST 基準と参考 SQL を追記済み

### 6. スケジュール重複検出のアルゴリズム 🔶 実装時決定
- 仕様: 「重複日程に警告アイコンを表示」
- 実装方法: クエリで `start_date < 他の end_date AND end_date > 他の start_date` で期間重複を判定。DB にフラグは持たず、表示時に計算する

### 7. メッセージ通知メールの送信タイミング 🔶 実装時決定
- 仕様: メッセージ受信時に通知メール送信
- 実装時に決める: 即時送信 or 一定時間後（例: 未読のまま5分経過後）に送信。バッチ送信の場合は Edge Function の cron で実装

### 8. past_due 状態での機能制限 ✅ 決定済み
- 7日間の猶予期間中は全機能利用可能（既存の is_paid_user() が past_due を含んでいるため）
- **アップグレード・ダウングレード: 不可**（CLI-026 でボタン非活性）
- **解約: 可能**（即時実行。前提条件チェックはスキップ、案件は強制クローズ）
- **支払い方法の更新: 可能**（Stripe Customer Portal へのリンク常時表示）
- 詳細は `.kiro/specs/billing/requirements.md` REQ-BL-005 を参照

## その他

### 9. ファイルアップロードのサイズ上限一覧 🔲 未着手
- プロフィール画像: 5MB
- 案件画像: 10MB（1枚あたり）
- 本人確認書類: 10MB
- CCUS書類: 10MB
- 実装時に Supabase Storage のバケットごとにサイズ制限を設定する

### 10. ADM-013 CSV出力項目 🔲 未着手
- 応募履歴一覧のCSV出力項目が「未定」
- Phase 2 以降で要件を確定させる

### 11. Supabase Realtime の接続管理 🔶 実装時決定
- メッセージのリアルタイム受信で使用
- 接続上限やフォールバック（WebSocket 切断時のポーリング）は実装時に決定

### 12. stripe_webhook_events のリトライ管理 🔲 未着手
- 現在の設計: status = 'failed' + error_message で記録
- 必要に応じて retry_count, next_retry_at カラムを追加（Phase 2 で検討）

### 13. ページネーション標準パターン 🔲 未着手
- 多くの画面で「20件/ページ」を採用
- 実装時に共通コンポーネント（Pagination）として標準化する

### 14. 組織ベーススレッドモデル（messaging） ✅ 対応済み
- **決定事項**: メッセージスレッドは「1組織（or 個人発注者）× 1受注者 = 常に1スレッド」とする
- **法人プラン**: `message_threads.organization_id` を設定し、同一組織メンバー全員がスレッドにアクセス可能
- **個人プラン**: `organization_id = NULL`。従来の participant_1_id / participant_2_id による個人対個人スレッド
- **スカウト**: スレッドレベルではなくメッセージレベルで管理。`messages.scout_status` で受諾/拒否を記録。1スレッド内に複数案件のスカウトが共存可能
- **段階的移行**: 将来、billing/organization spec で全発注者に organization を自動作成した段階で、個人スレッドを組織スレッドに移行する
- **理由**: 受注者から見て「○○株式会社とのやり取り」が1スレッドにまとまる方が自然。法人の担当者全員がスレッドを共有できる
- **影響範囲**: database-schema.md、security.md、roles-and-permissions.md、messaging specs（requirements/design/tasks）を修正済み

### 15. applications.scout_thread_id → scout_message_id への変更 ✅ 対応済み
- **決定事項**: 1スレッド内に複数スカウトが存在しうるため、スレッドIDではなくメッセージIDで応募元スカウトを特定する
- **変更**: `applications.scout_thread_id` (FK → message_threads) → `applications.scout_message_id` (FK → messages)
- **影響**: database-schema.md のカラム定義とインデックスを修正済み。matching spec のマイグレーションで実施

### 16. Server Action での File バリデーション（Zod instanceof 問題） ✅ 対応済み
- **決定事項**: Server Action で FormData 経由の File を受け取る場合、Zod の `z.instanceof(File)` を使わない
- **理由**: Next.js の Server Action ではクライアント/サーバー間で File オブジェクトがシリアライズされるため、`instanceof File` がサーバー側で false になる場合がある
- **対策**: Server Action 内で `file.size`、`file.type` を直接チェックするインラインバリデーションを使用する。Zod スキーマは body 等の文字列フィールドのみに使用
- **影響**: sendMessageAction で対応済み。他の機能でファイルアップロードを実装する際も同パターンを適用すること

### 17. 受注者が組織スレッドを作成する際の admin client 使用 ✅ 対応済み
- **決定事項**: `/messages/new` で受注者が発注者にメッセージを送る際、相手の組織情報を取得してスレッドを作成する処理は admin client（service_role）で実行する
- **理由**: organization_members の SELECT RLS は `is_same_org()` で制限されるため、受注者は相手の組織情報を取得できない。また、organization_id 付きスレッドの INSERT も `is_same_org()` チェックに通過できない
- **対策**: Server Component 内で admin client を使用して organization_members を検索し、スレッドを作成する。認証チェックは通常クライアントで実施済みの状態で admin client を使用するため、権限チェックは担保されている

### 18.5. Stripe 二重課金防止は DB + Stripe API の二段構え ✅ 対応済み
- **決定事項**: `startCheckoutAction` の二重課金防止チェックは、DB（subscriptions テーブル）に加えて Stripe API（`subscriptions.list`）でも確認する
- **理由**: Webhook 主導モデルでは DB の更新は Webhook 到達後に行われるため、Webhook 遅延時に DB チェックだけではガードをすり抜ける。実際に `stripe listen` 未起動のローカル環境で同一ユーザーが2回決済に成功し、Stripe 上に重複 subscription が作成された事例が発生した
- **対策**: `ensureStripeCustomer` で customerId 確定後、`stripe.subscriptions.list({ customer, status: 'active', limit: 1 })` を呼び、active subscription が存在すれば拒否する。DB チェック（高速、大半のケースをカバー）→ Stripe API チェック（Webhook 遅延時のフォールバック）→ Webhook RPC 内の最終防御の三段構え
- **影響**: `src/app/(authenticated)/billing/actions.ts` の Step 7.5 として実装。テストモック（`makeFakeStripe`）にも `subscriptions.list` を追加

### 18. messages UPDATE RLS を廃止し admin client に統一 ✅ 対応済み
- **決定事項**: messages テーブルの UPDATE 操作（read_at 更新、scout_status 更新）は全て admin client で実行し、UPDATE 用 RLS ポリシーは設置しない
- **理由**: PostgreSQL の PERMISSIVE ポリシーは OR で結合されるため、read_at 更新用ポリシーが scout_status の更新にも適用されてしまう。例: 組織スタッフが read_at 更新ポリシーを通じて scout_status を変更できてしまう
- **対策**: UPDATE ポリシーを全て削除し、Server Action 内で権限チェック後に admin client で更新する。SELECT/INSERT のみ RLS で保護
