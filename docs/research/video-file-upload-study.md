# 動画ファイル（MP4）直接掲載の技術検討

作成日: 2026-08-26（ツール追加調査: 同日）
対象: bijiyu 動画掲載オプション（受注者PR動画 / 職場紹介動画）

---

## 0. 前提条件

| 項目 | 内容 |
|---|---|
| 動画の長さ | 1本あたり 1 分弱 |
| 受領形式 | MP4（クライアントから受領済み） |
| ファイルサイズの想定 | 1080p スマホ撮影で 30〜70MB 程度。Web 向けに圧縮済みなら 10〜20MB 程度 |
| 登録者 | 現行仕様どおり管理者（ADM-010 / ADM-010B） |
| 表示先 | ログイン済みユーザーのみ（COM-001 / CLI-006 / CON-006 / CLI-020 / ADM-004 / ADM-009） |

費用試算の共通シナリオ: **100 本保存・1 本 50MB・月 5,000 再生**（保存 約 5GB、配信 約 245GB / 5,000 分）。

---

## 1. 結論

以下の3点です。

1. MP4 の直接掲載は技術的に可能です。
2. 推奨は「動画配信サービスを経由する方式」です。第一候補は **Cloudflare Stream**、第二候補は **Mux** です。既存の iframe 埋込設計をそのまま流用でき、月額は数ドル〜十数ドルに収まるためです。
3. 本数が少なく、管理者側で H.264 の MP4 に統一できる場合は「Supabase Storage に直接保存する方式」でも成立します。ただし Supabase Pro プラン（$25/月〜）が実質必須です。

---

## 2. 現状の実装

### 2.1 データ

| 項目 | 内容 |
|---|---|
| 保存先カラム | `users.video_url`（受注者PR動画） |
| | `client_profiles.workplace_video_url`（職場紹介動画） |
| 型 | text（URL 文字列） |
| 表示条件 | URL が存在 かつ `option_subscriptions` に active な該当オプション |

### 2.2 URL 解析と表示

| 項目 | 内容 | ファイル |
|---|---|---|
| URL 解析 | `parseVideoUrl()` が hostname と path を判定し `embedUrl` を組み立てる | `src/lib/video-embed.ts` |
| 対応プラットフォーム | **TikTok のみ**。YouTube / Vimeo はコメント上「将来追加」の扱いで未実装 | 同上 |
| 検証 | `VideoUrlSchema`（Zod）。クライアント・サーバー共通 | `src/lib/validations/video.ts` |
| サムネイル | TikTok oEmbed API から取得。1時間キャッシュ | `src/lib/video-embed/fetch-thumbnail.ts` |
| 再生 UI | サムネイルボタン → Dialog 内に `<iframe src={embedUrl}>` | `src/components/video-embed/video-embed-inner.tsx` |
| CSP | `frame-src 'self' https://www.tiktok.com` を middleware で付与 | `src/middleware.ts` |

### 2.3 管理者による登録

| 項目 | 内容 | ファイル |
|---|---|---|
| 画面 | ADM-010 / ADM-010B（URL テキスト入力のみ。ファイル入力なし） | `src/app/admin/(protected)/users/[id]/video-post-form.tsx` |
| Server Action | `updateVideoUrlAction` / `updateWorkplaceVideoUrlAction` → `updateVideoColumn` | `src/app/admin/actions.ts` |
| 付随処理 | 監査ログ記録。初回登録時のみユーザー・運営へメール送信 | 同上 |

### 2.4 既存のファイルアップロード基盤

| 項目 | 内容 |
|---|---|
| ストレージ | Supabase Storage。バケットは画像・PDF 用（最大 5〜10MB、MIME 制限あり） |
| アップロード方式 | ブラウザ → Storage 直接アップロード。Vercel の Server Action リクエスト上限（約4.5MB）を回避するため |
| own-folder 方式 | `uploadFilesDirect()`（`src/lib/storage/direct-upload.ts`）。RLS で `{user_id}/` 配下に INSERT |
| 署名付きURL方式 | `prepareSupportAttachmentUploadAction()` + `uploadToSignedUrl()`（`src/lib/support/`）。サーバーがパス採番 |
| 動画用バケット | **未定義** |

### 2.5 現状からの示唆

以下の3点です。

- 動画ファイルを Server Action 経由で送ることはできません。Vercel の 4.5MB 上限があるためです。ブラウザ直接アップロードが必須です。
- 管理者は他ユーザーの代理で登録するため、own-folder RLS 方式は使えません。署名付きアップロード URL 方式（サポート添付と同じ）が適合します。
- サムネイルは oEmbed で取得しているため、自前ファイルでは別の手段が必要です。

---

## 3. 改修内容（方式共通）

以下の7点です。

| # | 領域 | 改修内容 |
|---|---|---|
| 1 | DB | 動画の「種別」と「ファイル参照」を保持する。案: 各テーブルに `video_source`（'embed' / 'file'）と `video_file_ref`（ストレージパス、または配信サービスの動画ID）を追加。既存 `video_url` は埋込用として残す |
| 2 | 解析層 | `parseVideoUrl` の戻り値 `ParsedVideo` に `platform: "file"`（または `"stream"`）を追加。`VideoUrlSchema` を「URL か ファイル参照のどちらか」を受け付ける形へ拡張 |
| 3 | 表示層 | `VideoEmbedInner` で platform に応じて `<iframe>` と `<video controls playsinline>`（または配信サービスのプレイヤー）を出し分け |
| 4 | サムネイル | `getVideoThumbnail` に file 用の分岐を追加。取得方法は方式により異なる |
| 5 | 管理画面 | ADM-010 / ADM-010B にファイル入力・進捗バー・アップロード中の二重送信防止を追加。「URL で登録」「ファイルで登録」の切替 UI |
| 6 | Server Action | (a) 署名付きアップロード URL 発行アクション（admin 権限チェック付き）、(b) アップロード完了後にパス／動画IDを検証して DB 更新。差替え・掲載停止時に旧ファイルを削除 |
| 7 | 検証 | MIME（`video/mp4` 等）・拡張子・サイズ上限をクライアントとバケット／サービス側で二重に強制（既存 `UploadRule` パターンに `VIDEO_UPLOAD_RULE` を追加） |

補足: CSP は現状 `frame-src` のみの限定付与のため、`<video>` の再生には影響しません。配信サービスの iframe を使う場合のみ `frame-src` にドメイン追記が必要です。

---

## 4. ツール調査（一覧）

### 4.1 分類

| 分類 | ツール | 特徴 |
|---|---|---|
| A. 汎用ストレージ（変換なし） | Supabase Storage | 既存基盤。MP4 をそのまま配信 |
| | Vercel Blob | 既存ホスティングに同居。MP4 をそのまま配信 |
| B. 動画専用 API（変換・配信込み） | Cloudflare Stream | 分単位の単純課金。iframe プレイヤー |
| | Mux | 開発者向け。React 用アップローダー・プレイヤー |
| | Bunny Stream | GB 単位の低価格。iframe プレイヤー |
| | api.video | 分単位。エンコード無料 |
| C. メディア管理サービス | Cloudinary | 画像・動画統合。クレジット制 |
| D. 動画共有サービス | YouTube / Vimeo | 運営がアップロードして URL 登録 |
| E. 自前構築 | AWS S3 + MediaConvert + CloudFront | 部品を組み合わせる |

### 4.2 機能比較

| ツール | ブラウザ直接アップロード | 再開可能（TUS） | 自動変換（HEVC/MOV → HLS） | サムネ自動 | 埋込方法 | 完了通知 | 再生制限（署名） | 1ファイル上限 |
|---|---|---|---|---|---|---|---|---|
| Supabase Storage | ○（署名付きURL） | ○ | × | × | `<video>` | 不要（同期） | ○（署名付きURL） | Free 50MB / Pro 任意 |
| Vercel Blob | ○（client upload） | ○（multipart） | × | × | `<video>` | 不要（同期） | △（private store は Function 経由） | 5TB |
| Cloudflare Stream | ○（Direct Creator Upload） | ○（200MB 超は必須） | ○ | ○（URL 固定） | iframe | Webhook（HMAC 署名付き） | ○（requireSignedURLs） | 制限なし（TUS） |
| Mux | ○（Direct Upload） | ○（Mux Uploader） | ○ | ○（image.mux.com） | Web Component（`<mux-player>`） | Webhook（`video.asset.ready`） | ○（signed playback） | 設定可 |
| Bunny Stream | ○（TUS） | ○ | ○ | ○ | iframe | Webhook | ○（Token 認証） | — |
| api.video | ○（Delegated Upload Token） | ○ | ○ | ○ | iframe / Player SDK | Webhook | ○（Private video） | — |
| Cloudinary | ○（Upload Preset） | ○（chunked） | ○ | ○ | `<video>` / Player | Webhook | ○ | Free 100MB / Plus 2GB |
| YouTube / Vimeo | ×（運営が手動） | — | ○ | ○（oEmbed） | iframe | — | △（限定公開） | — |

### 4.3 費用比較（共通シナリオ: 100本・50MB・月5,000再生）

| ツール | 固定費 | 保存 | 配信 | 変換 | 月額目安 | 備考 |
|---|---|---|---|---|---|---|
| Supabase Storage（Pro） | $25 | 100GB 込み | 250GB 込み（超過 $0.09/GB） | — | **$25** | Free プランは 50MB 上限・転送 5GB のため不可 |
| Vercel Blob（Pro） | $20（Pro 契約が前提） | 5GB 込み（超過 $0.023/GB） | 100GB 込み（超過 $0.05/GB） | — | **$20 + 約 $7** | Hobby は商用不可 |
| Cloudflare Stream | なし | $5 / 1,000分（前払い） | $1 / 1,000分 | 無料 | **約 $10** | 最小購入単位 $5 |
| Mux | なし | $0.003 / 分・月 | 月 100,000 分まで無料 | Basic 品質は無料 | **約 $0.3** | 配信無料枠が大きい |
| Bunny Stream | $1（最低利用額） | $0.01 / GB | Asia $0.03 / GB | 標準は無料 | **約 $8** | 東京 PoP あり。14日無料トライアル |
| api.video | なし | $0.00285 / 分 | $0.0017 / 分 | 無料 | **約 $9** | サンドボックスは 30 秒・透かし付き |
| Cloudinary（Plus） | $99 | 1 クレジット = 1GB | 1 クレジット = 2GB（有料プラン） | クレジット消費 | **$99** | Free 25 クレジットでは配信量が不足 |
| YouTube / Vimeo | 0 / Vimeo Starter $20 | — | — | — | **$0〜20** | 運営の手作業が発生 |
| AWS 自前構築 | なし | S3 $0.023 / GB | CloudFront 日本 約 $0.11 / GB | MediaConvert 従量 | **約 $30 + 構築費** | パイプライン構築が別途必要 |

※ 費用は 2026-08 時点の公式ページに基づく概算です。為替・税・無料枠の変更で変動します。

### 4.4 Next.js（bijiyu）との接続

| ツール | サーバー側 | クライアント側 | 既存設計との適合 |
|---|---|---|---|
| Supabase Storage | 既存 `createAdminClient().storage.createSignedUploadUrl()` | `uploadToSignedUrl()`（6MB 超は `tus-js-client`） | ◎ 既存パターンそのまま。表示だけ `<video>` に |
| Vercel Blob | `@vercel/blob` の `handleUpload` Route Handler | `upload()`（client upload） | ○ 新規 SDK。表示は `<video>` |
| Cloudflare Stream | REST（`/stream/direct_upload`）。SDK 不要 | `fetch` POST（200MB 以下）または `tus-js-client` | ◎ `PATTERNS` に `iframe.videodelivery.net` を1件追加。サムネは URL 固定 |
| Mux | `@mux/mux-node` | `@mux/mux-uploader-react` + `@mux/mux-player-react` | ○ iframe ではなく Web Component。`VideoEmbedInner` に分岐追加 |
| Bunny Stream | REST（Library API） | `tus-js-client` | ◎ `iframe.mediadelivery.net/embed/{libraryId}/{videoId}` を `PATTERNS` に追加 |
| api.video | `@api.video/nodejs-client` | `@api.video/video-uploader` | ◎ `embed.api.video/vod/{videoId}` を `PATTERNS` に追加 |
| Cloudinary | `cloudinary` SDK | Upload Widget または署名付き直接アップロード | ○ `<video>` または Cloudinary Player |
| YouTube | なし（運営が手動） | なし | ◎ `PATTERNS` に YouTube を追加するのみ |

---

## 5. 方式A: Supabase Storage に MP4 をそのまま保存

### 5.1 構成

| 項目 | 内容 |
|---|---|
| 保存先 | 新バケット `videos`（private + 署名付き URL 推奨。ログイン済みユーザー限定表示のため） |
| アップロード | 署名付きアップロード URL + TUS（再開可能）。Supabase は 6MB 超に TUS を推奨。`tus-js-client` を追加 |
| 再生 | `<video src={signedUrl} controls playsinline preload="metadata">` |
| サムネイル | ブラウザ側で `<video>` + `<canvas>` から1フレームを画像化して同時アップロード |
| サイズ上限 | Free: 50MB。Pro 以上: バケット単位で任意（最大 500GB） |

### 5.2 利点

- 追加サービス契約が不要です。
- 既存の署名付きアップロード・パス検証パターンをそのまま流用できます。
- 改修範囲が最も小さく済みます。

### 5.3 課題

以下の4点です。

- **変換が行われません。** 今回は MP4 受領のため問題は小さいですが、コーデックが HEVC（iPhone 標準設定）の MP4 は Android / Windows で再生できません。管理者側で H.264 へ変換する運用が必要です。
- **画質の自動切替がありません。** スマートフォン回線で 50MB を読み込むため、再生開始が遅くなります。
- **サムネイル生成を自前で実装する必要があります。**
- **Supabase Pro プランが必須です。** Free は 50MB 上限・転送 5GB のため、1 分動画の運用に耐えません。

---

## 6. 方式B: 動画配信サービスを経由（推奨）

### 6.1 Cloudflare Stream（第一候補）

| 項目 | 内容 |
|---|---|
| アップロード | Direct Creator Upload。サーバーが `maxDurationSeconds`（例: 180）を指定して一時 URL を発行し、ブラウザが直接 POST（200MB 以下）。API トークンはブラウザに出ない |
| 処理 | 自動変換・HLS 化。完了は Webhook（HMAC-SHA256 署名付き）で受信。既存 Stripe Webhook と同じ構成で `/api/webhooks/cloudflare-stream` を追加 |
| 保存する値 | 動画 UID |
| 再生 | `https://iframe.videodelivery.net/{uid}` を iframe 埋込。**既存の Dialog + iframe 設計にそのまま載る** |
| サムネイル | `https://videodelivery.net/{uid}/thumbnails/thumbnail.jpg` が自動提供 |
| CSP | `frame-src` に `https://iframe.videodelivery.net` を追記 |
| 再生制限 | `requireSignedURLs` で署名付き再生にできる（ログイン済み限定表示に適合） |

### 6.2 Mux（第二候補）

| 項目 | 内容 |
|---|---|
| アップロード | `@mux/mux-node` で Direct Upload URL を発行し、`@mux/mux-uploader-react` が再開可能アップロード・進捗表示を担う |
| 処理 | Basic 品質なら変換無料。完了は Webhook `video.asset.ready` |
| 保存する値 | Asset ID / Playback ID |
| 再生 | `@mux/mux-player-react`（Web Component）。iframe ではないため `VideoEmbedInner` に分岐を追加 |
| サムネイル | `https://image.mux.com/{playbackId}/thumbnail.jpg` |
| 費用 | 配信 100,000 分/月まで無料。本シナリオでは月 $1 未満 |

### 6.3 Bunny Stream / api.video

いずれも iframe 埋込・TUS・Webhook・サムネ自動を備え、Cloudflare Stream と同等の構成で実装できます。
費用は本シナリオで月 $8〜9 と Cloudflare Stream と同水準です。
選定基準は以下の2点です。

- 管理画面の操作性・日本語対応: Bunny は Web 管理画面が充実。api.video は API 中心。
- 開発者向け情報量: Cloudflare / Mux の方が Next.js 向け事例が豊富。

### 6.4 方式B 共通の利点

以下の4点です。

- ファイル形式・コーデックを問いません。
- 回線に応じた画質切替が自動で行われます。
- サムネイルが自動生成されます。
- 既存の「サムネ → Dialog → iframe」設計を維持できます。

### 6.5 方式B 共通の課題

以下の3点です。

- 外部サービスの契約と API キー管理（Vercel 環境変数）が増えます。
- 処理完了を待つ非同期フロー（Webhook）が必要です。アップロード直後は「処理中」表示が必要です。
- 動画削除時にサービス側の削除 API 呼び出しも必要です。

---

## 7. 方式C: 運用で回避（YouTube / Vimeo 限定公開）

| 項目 | 内容 |
|---|---|
| 内容 | 管理者がクライアントから受け取った MP4 を運営のチャンネルへ「限定公開」でアップロードし、その URL を ADM-010 に登録する |
| 改修 | `PATTERNS` に YouTube（または Vimeo）エントリを追加。`fetchByPlatform` に oEmbed を追加。`frame-src` にドメイン追記 |
| 利点 | 改修が最小（1 人日程度）。費用ゼロ（Vimeo は Starter $20/月〜） |
| 課題 | 運営側のアップロード作業が発生。YouTube はロゴ・関連動画が表示される。クライアントが「自社サイト内の動画」として扱いたい場合に不向き。YouTube Data API による自動アップロードは 1 日あたりの上限が小さく（既定クォータで 6 本程度）、未審査アプリからのアップロードは非公開固定になるため、自動化には向かない |

---

## 8. 方式比較（総括）

| 観点 | A: Supabase Storage | B: Cloudflare Stream | B: Mux | C: YouTube 限定公開 |
|---|---|---|---|---|
| 技術的難易度 | 中 | 中 | 中 | 低 |
| 改修規模 | 中（`<video>`・サムネ自作） | 中（Webhook・API 連携） | 中（Webhook・Web Component） | 小 |
| ファイル形式の制約 | あり（H.264 前提） | なし | なし | なし |
| スマホでの再生品質 | 回線依存 | 自動最適化 | 自動最適化 | 自動最適化 |
| 月額（共通シナリオ） | $25 | 約 $10 | 約 $0.3 | 0 |
| 既存 iframe 設計との適合 | × | ◎ | ○ | ◎ |
| 外部依存 | Supabase のみ | Cloudflare 追加 | Mux 追加 | YouTube 追加 |
| 運営の作業 | なし | なし | なし | アップロード作業あり |

---

## 9. 推奨と進め方

### 9.1 推奨

方式B（Cloudflare Stream）を第一候補とします。理由は以下の3点です。

- 1 分の MP4 は 200MB 以下に収まるため、TUS なしの単純な POST で実装できます。
- 既存の iframe 埋込設計とサムネ取得構造に、`PATTERNS` 1 件と Webhook 1 本の追加で載ります。
- 費用が動画本数・再生分数に比例し、本シナリオで月 $10 程度です。

Mux を選ぶ条件は以下の2点です。

- 費用を最小化したい（配信無料枠が大きい）。
- iframe ではなく自前プレイヤー（`<mux-player>`）の見た目を細かく制御したい。

### 9.2 方式Aを選ぶ条件

以下の3点をすべて満たす場合は方式Aで十分です。

- 動画本数が少ない（数十本規模）。
- 管理者が H.264 の MP4 へ事前変換できる。
- Supabase を Pro プランで運用している。

### 9.3 決定前に確認したい事項

以下の3点です。

1. 本番 Supabase のプラン（Free の場合、方式Aは不可）。
2. 受領済み MP4 のコーデック（H.264 か HEVC か）とファイルサイズ。
3. 外部サービスの新規契約（Cloudflare / Mux）が可能か。

### 9.4 工数の目安

| 方式 | 目安 |
|---|---|
| A | 4〜6 人日（バケット・署名付きURL・TUS・`<video>`・サムネ生成・テスト） |
| B（Cloudflare Stream） | 4〜6 人日（Direct Upload・Webhook・処理中表示・`PATTERNS` 追加・テスト） |
| B（Mux） | 5〜7 人日（上記 + Web Component 対応） |
| C | 1 人日（YouTube 対応追加のみ） |

※ 既存パターン（署名付きアップロード・Webhook 冪等処理・`PATTERNS` 拡張）を流用する前提の概算です。

---

## 参考（2026-08-26 時点）

- Supabase Storage ファイル上限: https://supabase.com/docs/guides/storage/uploads/file-limits
- Supabase 再開可能アップロード: https://supabase.com/docs/guides/storage/uploads/resumable-uploads
- Supabase 料金: https://supabase.com/pricing
- Vercel Blob 料金: https://vercel.com/docs/vercel-blob/usage-and-pricing
- Cloudflare Stream 料金: https://developers.cloudflare.com/stream/pricing/
- Cloudflare Stream Direct Creator Uploads: https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads
- Cloudflare Stream Webhooks: https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/
- Mux 料金: https://www.mux.com/docs/pricing.txt
- Mux Next.js 連携: https://www.mux.com/docs/integrations/next-js
- Mux Uploader: https://www.mux.com/docs/guides/mux-uploader
- Bunny Stream 料金: https://bunny.net/docs/stream/pricing
- Bunny Stream 機能: https://bunny.net/stream/
- api.video 料金: https://api.video/pricing/
- Cloudinary 料金: https://cloudinary.com/pricing
- Cloudinary プラン比較: https://cloudinary.com/pricing/compare-plans
- Vimeo プラン: https://help.vimeo.com/hc/en-us/articles/12425432033937-About-Vimeo-plans
- AWS Video on Demand 費用例: https://docs.aws.amazon.com/solutions/latest/video-on-demand-on-aws-foundation/cost.html
