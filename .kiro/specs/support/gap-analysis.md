# Gap Analysis — support（問い合わせ・トラブル報告）

要件（requirements.md）と既存コードベースの差分分析。実装戦略の判断材料を提供する（最終決定は design フェーズ）。

## 1. 現状調査（再利用できる既存資産）

| 資産 | 場所 | 用途 |
|---|---|---|
| `createAdminClient()` | `src/lib/supabase/admin.ts` | service_role キーで RLS をバイパスするサーバー専用クライアント。**①④の修正に必須** |
| `createClient()`（server） | `src/lib/supabase/server.ts` | RLS に従う通常クライアント |
| ファイルアップロード実装 | `src/app/(authenticated)/applications/actions.ts:288-303` | `supabase.storage.from(bucket).upload(path, file)` → パスを `text[]`（`document_urls`）に保存。**ただし MIME/拡張子/サイズ検証なし・ファイル名は元名のまま**（本 spec はより厳格にする） |
| バケット作成＋Storage RLS の雛形 | `supabase/migrations/20260403100000_application_documents.sql` | `INSERT INTO storage.buckets (...false)` ＋ `CREATE POLICY ON storage.objects`。**support-attachments のテンプレートになる** |
| 署名付きURL生成 | `applications/history/[id]/page.tsx`（`createSignedUrl`） | 表示用。**本 spec では未使用**（後述） |
| マイページのサポートメニュー | `mypage/page.tsx:78-81`（`SUPPORT_MENU` 配列） | `{label, href}` を足すだけでトラブル報告導線を追加できる |
| BackButton | `src/components/shared/back-button.tsx` | 「戻る」導線 |
| shadcn Select × react-hook-form フォーム | profile/edit・job-posting 等 | 単一選択フォームの実装テンプレート |
| 既存の問い合わせ一式 | `(support)/contact/page.tsx`・`actions.ts`・`validations/profile.ts`（`contactSchema`）・`constants/profile-options.ts`（`CONTACT_TYPES`） | 全面改修の対象 |
| `contacts` テーブル＋RLS | migrations 002（作成）・003（`contacts_select_admin` / `contacts_insert_anon` / `contacts_insert_authenticated`） | ALTER で組み替え |
| middleware の公開ルート判定 | `src/middleware.ts`（`PUBLIC_PAGES` に `/contact` あり） | `/contact` は公開済み／`/trouble-report` は未登録＝自動的に認証必須 |

## 2. 要件 → 資産マップ（ギャップを Missing / Constraint / Unknown でタグ付け）

| 要件 | 既存資産 | ギャップ |
|---|---|---|
| Req1-2 お問い合わせ送信・項目 | contact 一式 | **Modify**: フォーム全面再構築・`contacts` ALTER |
| Req3 user_id 紐付け（セッション由来）⑥ | — | **Missing**: `contacts.user_id` 列追加・action でセッションから設定 |
| Req4① レート制限（admin で集計） | messages の COUNT 方式・`createAdminClient` | **Constraint**: `contacts` は admin のみ SELECT のため**集計は admin クライアント必須**（現行は通常クライアントで集計＝常に0件＝バグ） |
| Req5-6 トラブル報告 | — | **Missing**: `trouble_reports` テーブル・`/trouble-report` ページ＆action・氏名/メールのプリフィル（server で取得して渡す） |
| Req7 添付（画像/PDF・5枚・各5MB・MIME＋拡張子・ファイル名ランダム化） | applications の upload | **Missing**: 厳格な検証付き**共通アップロードユーティリティ**（既存は検証が緩く流用不可）。`crypto.randomUUID()` でファイル名生成 |
| Req7③ 孤児ファイル防止 | — | **Unknown(Research)**: 保存順序と失敗時クリーンアップ方針 |
| Req8 RLS・バケット④ | application_documents 雛形・`createAdminClient` | **Missing**: `support-attachments` バケット（管理者専用）＋ `trouble_reports` RLS（admin のみ SELECT、本人のみ INSERT、UPDATE/DELETE 拒否）。**匿名アップロードは admin クライアント代行で実現**（uid ベースの Storage RLS は匿名で使えないため） |
| Req8.7 署名付きURL表示 | createSignedUrl 実績あり | **Out-of-scope（本 spec）**: 表示する画面（admin）が無いため、本 spec では**保存のみ**。署名付きURL生成は将来の admin spec |
| Req10 導線・画面ID | `SUPPORT_MENU`・screen-map | **Modify**: SUPPORT_MENU に追加・screen-map に COM-012 追記 |
| 非機能② bodySizeLimit | `next.config`（現状 `"6mb"`） | **Constraint**: 25MB 添付のため **30MB 程度へ引き上げ必須** |

## 3. 実装アプローチ

### Option C（ハイブリッド）— 推奨
- **Extend（既存に手を入れる）**: `contacts` ALTER、contact フォーム/action 全面改修（①⑥の修正含む）、mypage 導線、screen-map、`next.config` の bodySizeLimit、旧 contact テスト更新
- **New（新規）**: `trouble_reports` テーブル＋RLS、`support-attachments` バケット＋RLS、`/trouble-report`（page＋action）、`contact-options.ts` 等の定数、`validations/contact.ts`・`validations/trouble.ts`、**共通アップロードユーティリティ**（検証＋ランダム命名＋admin クライアント保存）
- 理由: 問い合わせは既存資産が揃うので extend が自然。トラブル報告と添付基盤は独立性が高いので new が綺麗。両者は共通アップロードユーティリティと bucket を共有する

> Option A（全部 extend）は contacts/contact に機能を詰め込みすぎる。Option B（全部 new）は既存 contact 資産を捨てて重複する。→ C が最適。

### 設計で決める鍵となる判断
1. **書き込みクライアントの使い分け**: お問い合わせ＝レート制限集計・保存・アップロードを admin クライアントで実行（公開フォームのため）。トラブル報告＝INSERT を通常クライアント（RLS で本人 enforce）にするか admin にするか、添付保存は admin（バケット管理者専用）。→ 設計で確定
2. **孤児ファイル防止の順序**: 「全ファイル検証 → アップロード → レコード保存 →（失敗時）アップロード済みを admin クライアントで削除」が有力。バケットは管理者専用なので admin クライアントで削除可能
3. **公開 INSERT ポリシーの扱い**: contacts への直接 INSERT 口（`contacts_insert_anon/authenticated`）を残すか、service-role 経由のみに締めるか（多層防御 vs 単純化）

## 4. 工数・リスク

- **Effort: M（3〜7日）** — 新規ファイルは多い（2テーブル・1バケット・2フォーム・2 action・定数・Zod・共通util・各種テスト）が、すべて既存パターンの踏襲で新規技術は無い
- **Risk: Low〜Medium** —
  - Low: フォーム・バケット・RLS は確立パターンあり
  - Medium 要因: ①④の admin クライアント正しさ（特定済み）、`contacts` の破壊的 ALTER に伴う型再生成・旧参照（action/page/validations/tests）の同時更新、孤児ファイル順序

## 5. 設計フェーズへの申し送り（Research Needed）
- 孤児ファイル防止の確定手順（順序＋クリーンアップ）
- トラブル報告 INSERT の通常 vs admin クライアント（RLS 多層防御の要否）
- contacts 公開 INSERT ポリシーを残すか締めるか
- 共通アップロードユーティリティのインターフェイス設計（戻り値＝保存パス配列、失敗時の挙動）
- 署名付きURL表示は本 spec 対象外（保存のみ）であることを設計・タスクに明記し、不要な表示コードを作らない
