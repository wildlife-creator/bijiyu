# Implementation Plan

- [x] 0. 既存テストの全実行とデグレ確認
  - `npm run test`（Vitest）を実行し、全テストがパスすることを確認する
  - `supabase test db`（pgTAP）を実行し、RLS テストが全パスすることを確認する
  - `npm run test:e2e`（Playwright）を実行し、E2E テストが全パスすることを確認する
  - 失敗がある場合は原因を調査・修正してから実装タスクに着手する

- [x] 1. マイグレーションの作成（組織ベーススレッドモデル対応）
- [x] 1.1 message_threads スキーマ変更マイグレーション
  - `message_threads` テーブルに `organization_id` カラムを追加する（uuid, nullable, FK → organizations）
  - `scout_status` カラムを削除する（messages テーブルに移動）
  - 既存の scout_status UPDATE RLS ポリシー（`message_threads_scout_respond`）を削除する
  - 組織ベースの SELECT RLS ポリシーを追加する: `participant_1_id = auth.uid() OR participant_2_id = auth.uid() OR (organization_id IS NOT NULL AND is_same_org(auth.uid(), organization_id))`
  - 組織ベースの INSERT RLS ポリシーを更新する
  - UNIQUE 制約: `(organization_id, participant_2_id) WHERE organization_id IS NOT NULL`
  - インデックス: `(organization_id)` を追加
  - _Requirements: 1, 2, 4, 5, 6_

- [x] 1.2 messages スキーマ変更マイグレーション
  - `messages` テーブルに `scout_status` カラムを追加する（text, nullable）
  - CHECK 制約: `(is_scout = false AND scout_status IS NULL) OR (is_scout = true AND scout_status IN ('pending', 'accepted', 'rejected'))`
  - scout_status UPDATE は admin client 経由で実行するため RLS ポリシーは不要（設計判断: PERMISSIVE ポリシーの OR 結合による競合を回避）
  - _Requirements: 2_

- [x] 1.3 Storage バケット RLS 更新マイグレーション
  - `message-attachments` バケットの SELECT RLS ポリシーを更新: スレッド参加者 or 同一組織メンバーが閲覧可能に変更
  - _Requirements: 3_
  - ⚠️ `applications.scout_message_id` のマイグレーションは matching spec で実施するため、ここには含めない

- [x] 2. Zod バリデーションスキーマの更新
  - ファイル: `src/lib/validations/message.ts`
  - messageSchema: 変更なし（body + image）
  - scoutSchema: 変更なし（userId, jobId, title, body）
  - bulkMessageSchema: 変更なし（recipientIds, body）
  - ※ スキーマ自体は変更不要だが、既存のテストが通ることを確認する
  - _Requirements: 3, 5, 6_

- [x] 3. Server Actions の書き換え（組織ベース対応）
- [x] 3.1 sendMessageAction の書き換え
  - ファイル: `src/app/(authenticated)/messages/[threadId]/actions.ts`
  - スレッド参加チェックを組織ベースに変更: `participant_1_id = user.id OR participant_2_id = user.id OR (organization_id IS NOT NULL AND is_same_org)`
  - 組織メンバーであればスレッドに送信可能にする
  - レート制限、月間制限、画像アップロードのロジックは変更なし
  - 代理アカウント判定（is_proxy 自動設定）は実装済み（organization_members.is_proxy_account を参照）
  - _Requirements: 3_

- [x] 3.2 sendScoutAction の書き換え
  - ファイル: `src/app/(authenticated)/messages/scout-send/actions.ts`
  - 既存スレッドの検索: 法人プランは `organization_id` で検索、個人プランは `participant_1_id + participant_2_id` で検索
  - 既存スレッドがあればそのスレッドにスカウトメッセージを追加（新規スレッド不要）
  - 既存スレッドがなければ新規作成（法人プランでは `organization_id` を設定）
  - スレッドの `thread_type` を 'scout' に更新（まだ 'message' の場合）
  - messages INSERT 時に `scout_status = 'pending'` を設定する
  - 重複チェック: 同一受注者 × 同一案件で既に is_scout=true かつ同じ job_id のメッセージがある場合はエラー
  - _Requirements: 6_

- [x] 3.3 sendBulkMessagesAction の書き換え
  - ファイル: `src/app/(authenticated)/messages/bulk-send/actions.ts`
  - 既存スレッド検索: 法人プランは `organization_id` で検索、個人プランは `participant_1_id + participant_2_id` で検索
  - 新規スレッド作成時: 法人プランでは `organization_id` を設定
  - _Requirements: 5_

- [x] 3.4 markAsReadAction の書き換え
  - ファイル: `src/app/(authenticated)/messages/[threadId]/actions.ts`
  - スレッド参加チェックを組織ベースに変更
  - _Requirements: 2, 4_

- [x] 3.5 respondToScoutAction の書き換え
  - ファイル: `src/app/(authenticated)/messages/[threadId]/actions.ts`
  - **メッセージレベル**で scout_status を更新するように変更（スレッドレベルではなく）
  - 引数: `threadId` → `messageId`（スカウトメッセージID）
  - 認証チェック → メッセージの is_scout=true チェック → scout_status='pending' チェック → スレッドの participant_2_id = current_user チェック → messages.scout_status 更新
  - 受諾時: ActionResult の data に jobId と messageId を含めて返す。URL: `/applications/new?job_id={jobId}&scout_message_id={messageId}`
  - _Requirements: 2_

- [x] 4. 共通 UI コンポーネントの書き換え
- [x] 4.1 message-bubble コンポーネントの更新
  - スカウトメッセージ（is_scout=true）の場合: バブル内にスカウト案件情報カードをインライン表示
  - 各スカウトメッセージごとに scout_status に応じた受諾/拒否ボタンを表示
  - _Requirements: 2, 4_
  - _デザイン要件CSS: design-assets/specs/CON-009-sp.css, design-assets/specs/CON-009-pc.css_

- [x] 4.2 message-input コンポーネント
  - 変更なし（組織ベースの影響を受けない）
  - _Requirements: 3_

- [x] 4.3 message-list コンポーネントの更新
  - Realtime 購読ロジックは変更なし（thread_id ベース）
  - 既読管理ロジックは変更なし
  - _Requirements: 2, 4_

- [x] 4.4 thread-list-item コンポーネントの更新
  - 法人プランのスレッド: 相手の名前として受注者名を表示（従来と同じ）
  - 受注者から見た場合: 相手の名前として `resolveParticipantName()` で取得した発注者表示名（`client_profiles.display_name`）を表示。法人プランの Staff が送信した場合は Owner の `client_profiles.display_name` を使用
  - 名前解決は親ページで `resolveParticipantName()` により行い、props として participantName を渡す設計（⚠️ organization spec-impl 時に `resolveParticipantName()` のロジックが新方式に変更される。旧方式の `organizations.name` 参照は廃止）
  - _Requirements: 1_

- [x] 4.5 scout-info-card コンポーネント
  - 変更なし（案件情報の表示ロジックは同じ）
  - _Requirements: 2_

- [x] 4.6 scout-action-buttons コンポーネントの書き換え
  - props: `threadId` → `messageId`（スカウトメッセージID単位で制御）
  - respondToScoutAction 呼び出しを messageId ベースに変更
  - 受諾時の遷移先: `/jobs/${jobId}/apply?scout_message_id={messageId}`
  - _Requirements: 2_

- [x] 5. 画面実装（CON-008 メッセージ/スカウト一覧）の書き換え
  - スレッド取得クエリを組織ベースに変更: `participant_1_id = user.id OR participant_2_id = user.id OR (organization_id IS NOT NULL AND is_same_org)`
  - 法人プラン: organizations テーブルを JOIN して組織名を取得
  - _Requirements: 1_
  - _デザインカンプ: design-assets/screens/CON-008.png_

- [x] 6. 画面実装（CON-009 / CLI-013 メッセージ詳細）の書き換え
- [x] 6.1 CON-009 メッセージ/スカウト詳細の書き換え
  - スレッドアクセスチェックを組織ベースに変更
  - スカウトメッセージごとに scout-info-card + scout-action-buttons をインライン表示
  - scout_status はメッセージレベルで取得
  - _Requirements: 2, 3_
  - _デザインカンプ: design-assets/screens/CON-009.png, CON-009-design-sp.png, CON-009-design-pc.png_
  - _デザイン要件CSS: design-assets/specs/CON-009-sp.css, CON-009-pc.css_

- [x] 6.2 CLI-013 メッセージ詳細（発注者側）の書き換え
  - 既存スレッド検索: 法人プランは organization_id で検索
  - 新規スレッド作成時: 法人プランでは organization_id を設定
  - _Requirements: 4_
  - _デザイン要件CSS: design-assets/specs/CLI-013-sp.css, CLI-013-pc.css_

- [x] 7. 画面実装（CLI-014 メッセージ一斉送信）の書き換え
  - 既存スレッド検索を組織ベースに変更
  - 「全選択」/「全解除」ボタンを送信先選択エリアに追加
  - _Requirements: 5_
  - _デザインカンプ: design-assets/screens/CLI-014.png_

- [x] 8. 画面実装（CLI-015 スカウト送信）の書き換え
  - 既存スレッドへのスカウトメッセージ追加に対応
  - _Requirements: 6_
  - _デザインカンプ: design-assets/screens/CLI-015.png_

- [x] 9. Middleware ルーティング制御
  - 変更なし（既に `/messages/bulk-send`、`/messages/scout-send` を CLIENT_ONLY_PREFIXES に追加済み）
  - _Requirements: 1, 2, 3, 4, 5, 6_

- [x] 10. メール通知・名前表示の修正
  - スレッド一覧（`messages/page.tsx`）: SELECT に `company_name` を追加。名前解決を `org.name → company_name → last_name + first_name` に修正
  - スレッド詳細（`messages/[threadId]/page.tsx`）: 同上
  - スカウト通知メール（`messages/scout-send/actions.ts`）: インライン HTML → `scoutNotificationEmail()` テンプレートに切り替え。送信者名を名前表示ルールで解決
  - 名前解決ユーティリティ: `src/lib/utils/display-name.ts` を拡張し、`resolveParticipantName()` 関数を追加（org.name, company_name, last_name, first_name を引数に取る）
  - _Requirements: 1, 2, 6（名前表示ルール）_

- [x] 11. テストの書き換え
- [x] 11.1 ユニットテストの更新（Vitest）
  - Zod スキーマテスト: 変更なし（パス確認のみ）
  - タイムスタンプフォーマットテスト: 変更なし（パス確認のみ）
  - _Requirements: 3, 5, 6_

- [x] 11.2 統合テストの書き換え（Vitest）— 高リスク: 書き込み + 権限
  - ファイル: `src/__tests__/messaging/actions.test.ts`（25 テスト追加）
  - sendMessageAction: 未認証 / threadId 欠落 / スレッドアクセス拒否 / 本文空 / レート制限 / 組織メンバー送信成功
  - sendScoutAction: 未認証 / contractor ロール拒否 / Zod エラー / 法人既存スレッド再利用成功 / 重複スカウト拒否 / 個人プラン新規作成成功
  - sendBulkMessagesAction: 未認証 / contractor ロール拒否 / 不正 JSON / 空配列 / 法人既存スレッド再利用成功 / 法人新規スレッド作成成功
  - respondToScoutAction: 未認証 / メッセージ未発見 / 非スカウト / 既応答 / 非受信者拒否 / 受諾成功 / 同一スレッド複数スカウト独立応答
  - Supabase クライアントを mockFrom / mockAdminFrom でモックし、Server Action 内部ロジックを実走（Server Action 自体は vi.mock しない）
  - _Requirements: 2, 3, 4, 5, 6_

- [x] 11.3 RLS テストの書き換え（pgTAP）
  - 組織メンバーがスレッドを閲覧可能であることを検証する
  - 組織メンバーがスレッドのメッセージを閲覧可能であることを検証する
  - 非組織メンバーはアクセス不可であることを検証する
  - スカウト受信者（participant_2_id）のみ messages.scout_status を UPDATE 可能であることを検証する
  - 組織メンバー（スカウト送信側）は scout_status を UPDATE 不可であることを検証する
  - ⚠️ テスト用 UUID は seed.sql と重複させないこと
  - _Requirements: 2, 3, 6_

- [x] 11.4 E2E テストの書き換え（Playwright）
  - 受注者: メッセージ一覧 → 詳細 → メッセージ送信 → 送信確認
  - 受注者: スカウトメッセージの受諾 → CON-004 への遷移確認
  - 受注者: スカウトメッセージの拒否 → ボタン非表示確認（同一スレッドの通常メッセージは引き続き送信可能）
  - 発注者: メッセージ一覧 → 一斉送信 → 送信完了確認
  - 発注者: CLI-006 → スカウト送信 → 既存スレッドにスカウトメッセージが追加されることを確認
  - 発注者: CLI-013 でスカウトボタンが表示されないことを確認
  - seed.sql のテストユーザーを使用。テスト実行前に `supabase start` + `supabase db reset` + `npm run dev` が必要
  - _Requirements: 1, 2, 3, 4, 5, 6_
