# P4「動画基盤」実装メモ（引き継ぎ・ユーザー承認済み）

作成: 2026-09-02。承認: 同日ユーザー「とりあえずok」（受け入れ条件・追加 1 点・除外リスト・細部 3 点の既定案を含めて承認）。
親ドキュメント: `docs/requirements/spec-changes-202608.md` §2.3（+§2.2(2) の一部）/ D4 / D9。技術調査: `docs/research/video-file-upload-study.md`（Cloudflare Stream 第一候補で確定）。

## 0. ブランチ・進行状況（2026-09-02 時点）

- 3 層ブランチ運用: ① `staging`（クライアント確認用・触らない）→ ② `feature/spec-changes-202608`（P1+P2+P3 マージ済み、origin push 済み）→ ③ フェーズ作業ブランチ
- **P4 の作業ブランチ `p4-video-platform` は作成済み**（feature から分岐、先頭 = P3 マージコミット `4cded27`）。**実装完了（2026-09-02）**: migration `20260902120000_videos.sql` / `src/lib/videos/*` / `src/lib/cloudflare/stream.ts` / ADM-027（`/admin/users/[id]/videos`）/ Webhook route / 表示 6 画面の置換 / テスト（vitest・pgTAP・E2E）/ steering・CLAUDE.md 更新。旧 ADM-010 / 010B と `hasActiveOption` は削除済み。Cloudflare の実疎通は staging で確認（ユーザー宿題 5-2 の後）
- 完了ごとに ② へ `--no-ff` マージ → origin push。P1〜P8 が揃ってから ① へマージ（このとき旧動画カラムの DROP と DB 適用を行う）
- ローカル DB はマイグレーション適用済み・seed 状態。`supabase db reset` で再現可

## 1. 受け入れ条件（承認済み）

### A. データと表示
1. 動画テーブル新設: 掲載先ユーザー / 掲載場所（職人ページ・会社ページ。**後から増やせる形にする**）/ 表示順 / Cloudflare 動画 UID または埋込 URL / 管理用ラベル（自由入力）/ 状態（処理中・公開）。既存の `users.video_url` / `client_profiles.workplace_video_url`（TikTok URL）は migration でこのテーブルへコピー移行。**旧カラムは DROP しない**（① マージ時に 2 段階方式で廃止 = spec の「DB の扱い」節）
2. 表示 6 画面が新テーブルを読み、複数本を表示順どおり表示（本数上限なし = D4、デザインは 3 本程度想定、既存のサムネ → Dialog 再生の形を維持）
3. オプション購入有無による表示ゲートを撤廃（`hasActiveOption` の動画ゲート 6 か所を除去。全ユーザーのページに表示可能）
4. Cloudflare 動画は自動サムネで再生、TikTok も従来どおり再生

### B. 管理画面
5. ADM-009 / ADM-004 から動画管理画面への導線を常時表示（購入ゲート撤廃）
6. 動画管理画面: MP4 の D&D アップロード（進捗バー・二重送信防止）or URL 貼り付けで追加 / ラベル / 表示順入替 / 削除。監査ログ記録
7. アップロード直後は「処理中」、Cloudflare Webhook（HMAC 検証）で公開へ。フォールバックの「状態を確認」ボタンも設置
8. 削除時は Cloudflare 側のファイルも削除
9. 掲載お知らせメール（本人 broadcast + 運営宛）は既存を維持。**通知は「その掲載場所での 1 本目」だけ**（承認済みの既定。複数本まとめ掲載でメールが増えないように）

### C. 品質・その他
10. 課金まわり（購入ボタン・価格・商品名「受注者PR動画 / 職場紹介動画」）は触らない（P7/P8 スコープ）
11. Cloudflare 通信はテストで擬似化。vitest / pgTAP / E2E 全通過。`e2e/video-display.spec.ts` の負のアサーション（未購入 → 非表示）は反転させる
12. steering / CLAUDE.md 更新
13. **追加（§2.2(2) 特典判定の漏れ対応）**: ADM-004 のプラン表示で、カード払い（Stripe）でも「月払い / 年払い」を表示する（現在は銀行振込のみサイクル表示。年払い特典＝SNS 動画プレゼントの判定に必要。数行の修正）

### 意図的な除外（承認済み）
- ユーザー撮影プランの購入導線 → P7 / 補償取り下げ・料金表コピー → P8 / TikTok 紹介ページ掲載 → 運用 / 旧カラム DROP → ① マージ時
- 下書き・非公開切替は作らない（掲載をやめる = 削除）
- 再生の会員限定化（requireSignedURLs）は入れない（現行 TikTok 埋込と同じ公開埋込）

## 2. 設計方針（調査結果に基づく確定事項）

### DB（追加のみの migration、例: `20260902xxxxxx_videos.sql`）
```
CREATE TYPE video_placement AS ENUM ('contractor_page', 'client_page');  -- 追加余地のため将来 ALTER TYPE ADD VALUE
CREATE TYPE video_status AS ENUM ('processing', 'ready');
CREATE TABLE videos (
  id uuid PK, user_id uuid FK users ON DELETE CASCADE,
  placement video_placement NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  provider text NOT NULL CHECK (provider IN ('cloudflare','external')),
  cloudflare_uid text,        -- provider='cloudflare'
  embed_source_url text,      -- provider='external'（TikTok 等、parseVideoUrl が解釈する元 URL）
  admin_label text,
  status video_status NOT NULL DEFAULT 'ready',  -- cloudflare は processing で作成
  created_at/updated_at + set_updated_at トリガー
  CHECK provider と uid/url の整合
);
-- RLS: SELECT は authenticated（status='ready' のみ）+ admin は全行。INSERT/UPDATE/DELETE は service_role のみ
-- 移行: users.video_url IS NOT NULL → (user_id,'contractor_page',0,'external',url)。
--        client_profiles.workplace_video_url → ('client_page',...)。旧カラムは残す
```
- GRANT は既存の ALTER DEFAULT PRIVILEGES で付与される（P2 と同じ。明示 GRANT を 1 行足すのが慣例）
- pgTAP: `supabase/tests/videos_rls.test.sql`（本人以外も ready は読める / processing は admin のみ / authenticated INSERT 不可 / CHECK）

### 表示層
- `src/lib/video-embed.ts` の `PATTERNS` に Cloudflare を 1 件追加（`iframe.videodelivery.net/{uid}`、aspect は "video"）。または videos 行から直接 `ParsedVideo` を組む helper `parsedVideoFromRow()` を追加（external は `parseVideoUrl(embed_source_url)`）
- サムネ: cloudflare は `https://videodelivery.net/{uid}/thumbnails/thumbnail.jpg` 固定（oEmbed 不要）。`fetch-thumbnail.ts` は external のみ使用
- 新コンポーネント `<VideoList videos={...} />`（複数本を縦 or 横並び、各要素は既存 `VideoEmbedInner` 流用）
- 表示 6 画面（下記 3.1 の表）を videos SELECT（`.eq(user_id).eq(placement).eq(status,'ready').order(sort_order)`）に置換し、`hasActiveOption` ゲートを除去。admin 2 画面の「退会者でも表示」挙動は維持
- CSP: `src/middleware.ts:287-294` の `frame-src 'self' https://www.tiktok.com` に `https://iframe.videodelivery.net` を追記（customer subdomain 型プレイヤーを使う場合は `https://customer-*.cloudflarestream.com` も）

### Cloudflare 連携（`src/lib/cloudflare/stream.ts` 新設）
- env: `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_STREAM_API_TOKEN` / `CLOUDFLARE_STREAM_WEBHOOK_SECRET`（.env.local.example に追記。ローカルで未設定なら URL 登録のみ動く graceful degradation）
- アップロード URL 発行: admin Server Action → REST `POST /accounts/{id}/stream/direct_upload`（`maxDurationSeconds: 300`）→ `{uploadURL, uid}` を返し videos 行を status='processing' で作成。ブラウザは `fetch(uploadURL, {method:'POST', body: FormData(file)})`（200MB 以下、1 分動画想定なので TUS 不要）+ XHR で進捗
- Webhook: `src/app/api/webhooks/cloudflare-stream/route.ts`。`Webhook-Signature` ヘッダの HMAC-SHA256 検証（`time=...,sig1=...` 形式）。`readyToStream: true` → 該当 uid の videos.status='ready' に UPDATE（冪等なので専用イベントテーブルは作らない。Stripe の `withWebhookIdempotency` は流用しない）。1 本目 ready のとき掲載メール発火
- 状態確認ボタン: REST `GET /stream/{uid}` で readyToStream を見て同じ UPDATE（Webhook 未達の保険）
- 削除: `DELETE /stream/{uid}`（失敗しても DB 行は消し、エラーはログ + 監査 metadata に残す）

### 管理画面（新画面。screen-map に ADM-027 として追記）
- `/admin/users/[id]/videos`（1 画面で placement タブ or セクション分け）。既存 ADM-010/010B（URL 1 本フォーム）はこの画面に置き換え、旧ルートはリダイレクト or 削除（E2E も追随）
- 構成: 動画リスト（サムネ・ラベル・状態・↑↓で表示順・削除）+ 追加フォーム（D&D ゾーン + URL 入力の 2 way）
- Server Actions（`videos/actions.ts`）: `createVideoUploadAction`（direct_upload URL 発行 + processing 行作成）/ `addExternalVideoAction`（URL 検証 = parseVideoUrl 成功のみ）/ `updateVideoLabelAction` / `reorderVideoAction` / `deleteVideoAction` / `refreshVideoStatusAction`。全て `requireAdmin()` + `writeAuditLog`（AuditAction に `video_create` / `video_update` / `video_delete` / `video_reorder` を追加。既存 `video_url_update` は残す）
- 掲載メール: 既存 `sendVideoPublishedEmails`（`src/app/admin/actions.ts:136-200`）を videos 対応に移設。「その placement で ready な動画が 0 → 1 本になったとき」のみ送信

### 既存コードの片付け
- `hasActiveOption` は動画ゲート専用ヘルパー（6 call sites のみ）→ ゲート撤廃で dead code 化するので削除し、`src/__tests__/billing/has-active-option.test.ts` も削除（billing の「購入済み」判定は BillingClient 内の activeOptions で独立しており影響なし）
- ADM-010/010B の `updateVideoUrlAction` / `updateWorkplaceVideoUrlAction` / `VideoUrlSchema` / `video-post-form.tsx` は新画面へ置換後に削除（テスト `video-actions.test.ts` は新 Action のテストに書き換え）
- seed: `supabase/seed.sql:1388-1431` 付近の動画 fixture 5 件を videos 行に変更（+ 未購入ユーザーにも動画がある = 表示される、の検証データ）

## 3. 調査で確定した現状（file:line）

### 3.1 表示 6 画面（全て `<VideoEmbed url label>` + `hasActiveOption` ゲート）
| 画面 | ファイル | ゲート行 |
|---|---|---|
| COM-001 /profile | `src/app/(authenticated)/profile/page.tsx` | :195（video） |
| CLI-006 /users/contractors/[id] | 同 [id]/page.tsx | :140-142（video、admin client） |
| CON-006 /clients/[id] | 同 page.tsx | :119-122（video_workplace） |
| CLI-020 /mypage/client-profile | 同 page.tsx | :147-153 |
| ADM-009 /admin/users/[id] | 同 page.tsx | :93 + :139（`isDeleted` で OR、編集リンク :217-227 もゲート） |
| ADM-004 /admin/clients/[id] | 同 page.tsx | :175-179 + :277（編集リンク :467-478 もゲート） |

### 3.2 その他の要所
- 埋込部品: `src/lib/video-embed.ts`（PATTERNS :37-50、TikTok のみ）/ `src/lib/video-embed/fetch-thumbnail.ts`（oEmbed + unstable_cache 1h, tag "video-thumbnail"）/ `src/components/video-embed/video-embed.tsx`（async RSC）/ `video-embed-inner.tsx`（"use client"、Dialog + iframe、aria-label「{label}を再生」= E2E が依存）
- 管理フォーム: `src/app/admin/(protected)/users/[id]/video/page.tsx`・`workplace-video/page.tsx`・`video-post-form.tsx`。Action は `src/app/admin/actions.ts` の `updateVideoColumn` :38-127（監査 `video_url_update` :110）
- Webhook の手本: `src/app/api/webhooks/stripe/route.ts`（唯一の API route。HMAC 検証 → 常に 200 返却の流儀）
- 監査 union: `src/lib/audit/log.ts:8-33`
- E2E: `e2e/video-display.spec.ts` 10 テスト。CLI-006(b)・CON-006(b) の「未購入 → toHaveCount(0)」は反転が必要。admin 導線テストは新画面のセレクタに書き換え（URL 登録経路で通す。Cloudflare 実通信は E2E 対象外）
- 条件 13 の修正箇所: `src/app/admin/(protected)/clients/[id]/page.tsx` のプラン表示（P2 で `isBankTransfer && ・${BILLING_CYCLE_LABELS[...]}` としている部分を、Stripe でもサイクル表示に変更）

## 4. 進め方の注意（このリポジトリ固有）

- 実装後の検証: `npx tsc --noEmit` → `npx vitest run` → `supabase db reset` + `supabase test db` → `npm run dev` 起動 + Playwright
- **Playwright のブラウザが未インストール**（@playwright/test 1.58.2 が要求する chromium_headless_shell-1208 が無い。ネットワーク制限でサンドボックスから DL 不可だった）。対処は 2 択: ユーザーに `npx playwright install chromium` を対話ターミナルで実行してもらう / または一時 config で `launchOptions.executablePath` に既存の `~/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` を指定（P2/P3 はこの方法で全 E2E を通した。一時 config はコミットしないこと）
- migration を書いたら `supabase db reset` → `supabase gen types typescript --local > src/types/database.ts`
- コミットはユーザー承認後。完了 → 承認 → ③にコミット → ②へ `--no-ff` マージ → `git push origin feature/spec-changes-202608`
- 完了報告の形式: 変更ファイル一覧・テスト結果・受け入れ条件のチェック表（P1〜P3 と同じ）

## 5. ユーザー側の宿題（P4 と並行、未完了）

1. **P3 の Stripe 設定**: `! node scripts/stripe/setup-yearly-prices.mjs` を実行 → 出力された 5 行を `.env.local`（staging/本番は Vercel env）に貼る。年払いの正式金額はクライアント確認中（暫定 月額×12。変更時は `YEARLY_AMOUNTS` 環境変数で作り直し + `YEARLY_PRICE_TAX_INCLUDED` 更新）
2. **P4 の Cloudflare 準備（P0）**: Cloudflare アカウント作成 + Stream の支払い設定（月 $5 前払い〜）。済んだら Account ID / API トークン（Stream 権限）を `.env.local` に設定。手順は実装後に噛み砕いて案内する予定。**これが無くても実装・擬似化テストは完了できる**（実ファイルアップロードの確認だけ後回し）
3. Stripe 領収書メール設定の現状確認（ダッシュボード、後回しで可）
