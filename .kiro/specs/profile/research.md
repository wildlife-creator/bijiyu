# Research & Design Decisions — profile

## Summary
- **Feature**: profile（プロフィール機能）
- **Discovery Scope**: Extension（auth 基盤の拡張）
- **Key Findings**:
  - Supabase Storage のファイルアップロードは `supabase.storage.from(bucket).upload(path, file)` で実行。MIMEタイプ検証はクライアント側 + サーバー側の両方で実施する必要がある
  - プロフィール編集は users + user_skills + user_qualifications + user_available_areas の4テーブルを更新。auth の complete_registration と同様にトランザクション処理が必要
  - 退会処理はソフトデリート（deleted_at 設定）+ Supabase Auth 無効化 + Stripe 解約の複合操作。application の進行中チェックが前提条件

## Research Log

### Supabase Storage アップロードパターン
- **Context**: プロフィール画像・本人確認書類・CCUS書類のアップロード方法
- **Findings**:
  - `supabase.storage.from('avatars').upload(`${userId}/${uuid}.jpg`, file)` でアップロード
  - 公開バケット（avatars）: `getPublicUrl()` で URL 取得
  - 非公開バケット（identity-documents, ccus-documents）: `createSignedUrl()` で一時URL生成
  - ファイルサイズ制限は Supabase Dashboard のバケット設定で制御
  - MIMEタイプ検証: クライアント側で `file.type` チェック + Server Action で再検証
- **Implications**: Server Action 内でファイルバリデーション → アップロード → DB 更新の順で実行

### プロフィール編集のトランザクション
- **Context**: 4テーブル同時更新の方法
- **Findings**:
  - auth で作成した `complete_registration` RPC と同様のパターンが使える
  - ただしプロフィール編集は既存データの DELETE → INSERT（スキル・エリア）が必要
  - `update_profile` RPC 関数を新規作成し、SECURITY DEFINER でトランザクション処理
- **Implications**: 新規マイグレーションで `update_profile` 関数を追加

### 退会処理のフロー
- **Context**: ソフトデリート + 関連リソースの無効化
- **Findings**:
  - users.deleted_at にタイムスタンプ設定（ソフトデリート）
  - Supabase Auth: `supabase.auth.admin.updateUserById(userId, { ban_duration: 'none' })` は service_role が必要
  - 代替: Server Action 内で `supabase.auth.signOut()` でセッション無効化。auth.users の削除は行わない（DB Trigger で public.users も消えるため）
  - Stripe 解約: service_role client で subscriptions テーブルを確認し、active なら Stripe API で解約
  - 進行中案件チェック: applications テーブルで status IN ('applied', 'accepted') をカウント
- **Implications**: 退会は Server Action で段階的に実行。Stripe 連携は billing spec 実装後に有効化

## Design Decisions

### Decision: プロフィール画像アップロードを Server Action で処理
- **Context**: クライアントから直接 Storage にアップロードするか、Server Action 経由にするか
- **Selected Approach**: Server Action でファイル受信 → バリデーション → Storage アップロード → DB 更新
- **Rationale**: MIMEタイプ・ファイルサイズのサーバー側検証を確実に行うため。security.md の方針に準拠
- **Trade-offs**: ファイルが Server Action を経由するため若干のレイテンシ増加。ただしプロフィール画像（最大5MB）であれば許容範囲

### Decision: 退会処理でソフトデリートのみ（auth.users は保持）
- **Context**: auth.users を物理削除するか、ソフトデリートのみにするか
- **Selected Approach**: public.users.deleted_at を設定 + セッション無効化。auth.users は保持
- **Rationale**: auth.users を削除すると ON DELETE CASCADE で public.users も消え、メッセージ履歴等の参照先が失われる。退会済みユーザーは「退会済みユーザー」として表示する設計（structure.md の display-name.ts）

### Decision: 静的ページは Server Component + ハードコード
- **Context**: COM-009〜011 の利用規約等の静的ページの実装方法
- **Selected Approach**: Server Component にテキストを直接記述
- **Rationale**: CMS 連携は MVP スコープ外。テキスト変更時はコード変更 + デプロイで対応

## Risks & Mitigations
- **リスク1**: ファイルアップロードのサイズ超過 → クライアント側で事前チェック + Storage バケットの制限設定
- **リスク2**: 退会時の Stripe 連携が billing spec 未実装 → Stripe 解約部分は try/catch で囲み、billing 未実装時はスキップ
- **リスク3**: 再提出時の rejected レコード蓄積 → パフォーマンス影響は minimal（ユーザーあたり数件程度）
