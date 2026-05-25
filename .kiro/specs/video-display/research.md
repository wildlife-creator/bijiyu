# Research & Design Decisions — video-display

## Summary
- **Feature**: `video-display`
- **Discovery Scope**: Complex Integration（外部 iframe 埋込 + 課金フロー拡張 + 管理者画面新規 + CSP 新設 + 既存表示リファクタ）
- **Key Findings**:
  - **TikTok 公式 iframe プレイヤー `https://www.tiktok.com/player/v1/{id}` は embed.js なしで単体動作する**。gap-analysis の Unknown #1（embed.js 必須か）は「不要」で確定。blockquote + embed.js 方式は採用しない
  - **`option_subscriptions` の SELECT RLS は `user_id = auth.uid()` OR `is_admin()`**。CLI-006 / CON-006 は他ユーザーの active option を判定するため **admin（service-role）クライアント必須**。通常クライアントの nested join はサイレントに null を返し「動画が出ない」バグになる
  - **CSP は `frame-src` のみのスコープ限定で追加する**。`default-src` を含む完全 CSP は既存の inline style / Supabase / Stripe 通信を壊すリスクがあるため Phase 1 では導入しない。要件 3.9 に従い middleware（既存の response header 伝播パターン）で `Content-Security-Policy: frame-src 'self' https://www.tiktok.com` を付与する
  - `option_subscriptions.option_type` は CHECK 制約なしの素の `text`。`'video_workplace'` 追加に DB スキーマ変更不要（アプリ層のリテラル追加のみ）
  - `client_profiles` は SELECT 公開（`USING (true)`）。`workplace_video_url` カラム値自体は誰でも読めるため、表示判定（active option）だけが admin client を要する

## Research Log

### TikTok 埋込方式（embed.js vs iframe player）
- **Context**: gap-analysis Unknown #1 / #7。iframe 単体で再生できるか、embed.js / oEmbed が必須か
- **Sources Consulted**:
  - [TikTok Embed Player (player/v1)](https://developers.tiktok.com/doc/embed-player)
  - [TikTok Embed Videos guide](https://developers.tiktok.com/doc/embed-videos/)
- **Findings**:
  - 公式 iframe プレイヤー URL: `https://www.tiktok.com/player/v1/{tiktok_post_id}`。**外部 JavaScript 不要で単体レンダリング可能**
  - クエリパラメータで挙動制御可: `controls`(既定1)/`autoplay`(既定0)/`music_info`(既定0)/`description`(既定0)/`loop`/`muted`/`progress_bar`/`fullscreen_button` 等
  - `Window.postMessage()` でプログラム制御も可能（Phase 1 では不要）
  - 標準閲覧 URL `https://www.tiktok.com/@{user}/video/{id}` から末尾の数値が post id
  - blockquote(`class="tiktok-embed"`) + embed.js 方式は TikTok ブランディングが残りエラー時サポートが要るため**不採用**
- **Implications**:
  - `parseVideoUrl` は標準閲覧 URL から `{id}` を抽出し、`embedUrl = https://www.tiktok.com/player/v1/{id}` を構築すればよい
  - `<VideoEmbed>` の Dialog 内 `<iframe src={embedUrl}>` のみで再生成立。スクリプトロード不要 → CSP は `script-src` 緩和不要、`frame-src` だけで足りる
  - oEmbed によるサムネ動的取得は要件 3.4 で「将来検討」とされており Phase 1 は静的プレースホルダー。API 呼び出しを毎回行わずに済むため初期実装を簡素化

### Next.js 16 における CSP 設定方式
- **Context**: gap-analysis Unknown #3。middleware か next.config.headers() か
- **Sources Consulted**:
  - [Next.js: Content Security Policy guide](https://nextjs.org/docs/app/guides/content-security-policy)（v16.2.6, lastUpdated 2026-05-19）
- **Findings**:
  - nonce が必要な場合は middleware（Next.js 16 では `proxy.ts` が正式名、`middleware.ts` も継続動作）で動的生成。ただし nonce 利用は**全ページ動的レンダリング強制**（ISR/PPR/CDN キャッシュ不可）という重いトレードオフ
  - nonce 不要なら `next.config.js` の `headers()` で静的 CSP を設定する方式が推奨
  - 本機能は inline script を新規追加しないため **nonce 不要**
- **Implications**:
  - 純粋にベストプラクティスだけ見れば `next.config.headers()` 静的設定が軽量。しかし要件 3.9 が「the middleware shall ... `frame-src`」と明示し、既存 `src/middleware.ts` が既に `x-billing-status` 等の response header を一元付与している
  - → **既存 middleware の response に `frame-src` のみの CSP を追記**する方針を採用（要件遵守 + 既存ヘッダー伝播パターンとの一貫性）。`default-src` を入れない＝他リソースは無制限のままなので既存挙動への回帰リスクが無い
  - frame-ancestors（クリックジャッキング対策）は本機能スコープ外。別途セキュリティ強化タスクとして steering / security.md 側で扱う

### option_subscriptions の RLS と cross-user 参照
- **Context**: 表示判定（active option あり）を他ユーザーのページ（CLI-006 / CON-006）で行えるか
- **Sources Consulted**: `supabase/migrations/20260324161543_003_rls_policies.sql:379-385`
- **Findings**:
  - `option_subscriptions_select`: `USING (user_id = auth.uid())`
  - `option_subscriptions_select_admin`: `USING (is_admin(auth.uid()))`
  - INSERT/UPDATE はサーバーサイドのみ（ポリシーなし）
- **Implications**:
  - COM-001（自分のプロフィール）: 通常クライアントで自分の option を読める ✓
  - ADM-009（管理者）: admin ポリシーで読める ✓
  - **CLI-006 / CON-006（他ユーザー閲覧）: 通常クライアントでは他人の option_subscriptions が RLS で見えず、nested join はサイレント null**。→ active 判定は **admin（service-role）client** で実行する必要がある
  - これは CLAUDE.md「組織テーブルの RLS と admin client」「Staff subscription 参照」と同型の落とし穴。`hasActiveOption(client, userId, optionType)` は client を引数化し、cross-user 呼び出し側が admin client を渡す設計にする

### TikTok URL バリエーションの対応範囲
- **Context**: gap-analysis Unknown #2 / 要件 8.5（短縮 URL 等の対応範囲は設計で決定）
- **Findings**:
  - 標準閲覧 URL `https://www.tiktok.com/@{user}/video/{digits}` は id がパスに含まれ、正規表現でローカル抽出可能
  - 短縮 URL（`vt.tiktok.com/xxxx`）/ 共有 URL（`tiktok.com/t/xxxx`）は id がパスに無く、HTTP リダイレクト追跡（ネットワーク I/O）でしか実 id を解決できない
- **Implications**:
  - **Phase 1 は標準閲覧 URL のみ対応**（`www.` 有無・末尾クエリ文字列は許容）。短縮/共有 URL は非対応とし、ADM-010 / 010B のエラーメッセージで「動画ページの URL（`https://www.tiktok.com/@.../video/...`）を貼り付けてください」と運営に案内する
  - 運営代理投稿運用のため入力者は運営担当者に限定 → URL 形式の統制が効きやすく、短縮 URL 解決のためのネットワーク追跡を実装するコストは Phase 1 では正当化されない（YAGNI）

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| A: 既存パターン最大拡張 | billing/表示/admin すべて既存ファイルに分岐追加 | リスク最小・差分小 | BillingClient 肥大、表示層が散らばる | gap-analysis Option A |
| B: 独立モジュール化 | `src/lib/video-display/` に全集約 | 関心分離 | 既存 video 処理に手が入り回帰リスク、差分大 | gap-analysis Option B |
| **C: Hybrid（採用）** | billing=拡張 / 表示=新規共通モジュール / admin=新規 | 既存課金に最小限・表示は綺麗に独立・将来転用可 | 3 戦略併用で計画やや複雑 | gap-analysis 推奨 |

## Design Decisions

### Decision: TikTok 公式 iframe プレイヤーを採用（embed.js 不使用）
- **Context**: 動画埋込再生の実現方式
- **Alternatives Considered**:
  1. blockquote + `embed.js` — oEmbed 標準だが外部スクリプトロード・TikTok ブランディング・CSP `script-src` 緩和が必要
  2. 公式 iframe プレイヤー `player/v1/{id}` — スクリプト不要
- **Selected Approach**: 2。Dialog 内 `<iframe src="https://www.tiktok.com/player/v1/{id}">` のみで再生
- **Rationale**: スクリプトロード不要で CSP は `frame-src` のみで完結。`parseVideoUrl` でローカルに embedUrl を構築でき、ネットワーク I/O ゼロ
- **Trade-offs**: サムネが TikTok 提供のものにならない（静的プレースホルダー）。要件 3.4 が許容済
- **Follow-up**: 実機で iframe 単体再生・モバイル WebView 挙動を確認（gap-analysis Unknown #6）

### Decision: `parseVideoUrl` の PATTERNS テーブル抽象化
- **Context**: 要件 3.1 / 3.2（将来プラットフォーム追加をエントリ1行で）
- **Selected Approach**: `PlatformPattern[]` 配列を線形 match。各エントリが `hostMatch`(hostname 完全一致) / `pathMatch`(pathname から id capture) / `aspect` / `buildEmbedUrl` を持つ。`new URL()` で host/path を分離してから判定し host 偽装を排除。新規対応＝配列に1要素追加
- **Rationale**: switch 分岐より宣言的で、追加時の変更箇所が1点に閉じる
- **Trade-offs**: Phase 1 は TikTok 1 件のみ。over-engineering に見えるが要件 3.2 が明示要求

### Decision: active option 判定の共通ヘルパー + cross-user は admin client
- **Context**: gap-analysis 設計判断 #3、RLS 制約
- **Selected Approach**: `hasActiveOption(client, userId, optionType)` を `src/lib/billing/options.ts` に新設。`client` を引数化。COM-001/ADM-009 は通常 or admin、CLI-006/CON-006 は admin client を渡す
- **Rationale**: 表示判定ロジックを4画面で重複させない。RLS の cross-user 制約を呼び出し側の client 選択で吸収
- **Trade-offs**: 呼び出し側が「どの client を渡すか」を誤ると静かに壊れる → design.md で各画面の client 種別を明記し、E2E で cross-user 表示を検証

### Decision: 既存「動画掲載」(video) 表示への active 判定追加は仕様準拠（挙動変更を許容）
- **Context**: 要件 4.1 / 4.4、profile/tasks.md L32 で既に要件化済だが現状実装は `video_url` 存在のみで描画
- **Selected Approach**: COM-001 を `video_url` 存在 **かつ** active `'video'` option の AND 条件に変更
- **Rationale**: 仕様（profile spec）への実装準拠。解約/期限切れユーザーは非表示になるのが正
- **Trade-offs**: 既存挙動が変わる（過去購入・解約済ユーザーの PR 動画が消える）。要件 Introduction で明記済の意図的変更
- **Follow-up**: seed に「video_url あり + active video option なし」ユーザーを用意し、非表示を E2E で確認

### Decision: CSP は frame-src のみ・middleware 付与
- **Context**: 要件 3.9 / 3.10、Next.js CSP ベストプラクティス
- **Alternatives Considered**:
  1. next.config.headers() 静的 CSP（推奨パターン、軽量）
  2. middleware response header（要件明示・既存ヘッダー伝播と一貫）
- **Selected Approach**: 2。`frame-src 'self' https://www.tiktok.com` のみ（`default-src` 無し）
- **Rationale**: 要件 3.9 が middleware を明示。既存 middleware が response header を一元管理。`default-src` を入れないことで他リソース無制限維持＝回帰ゼロ
- **Trade-offs**: 完全 CSP（XSS 防御）ではない。本機能スコープ外として割り切り
- **Follow-up**: 将来 YouTube/Vimeo 追加時は同ディレクティブにドメイン追記（要件 3.10）

## Risks & Mitigations
- **cross-user で通常 client を使い active 判定が常に null** → `hasActiveOption` の client 引数を design.md で明記、CLI-006/CON-006 は admin client 必須。E2E で他ユーザー視点の表示を検証
- **管理者画面が完全新規（route group 自体が無い）** → 本 spec は video 投稿に必要な ADM-008/009/010/010B に範囲限定。Middleware の `/admin/*` admin role ガードは既存実装済（gap-analysis 1.6 / 中間 #10）
- **TikTok 非公開/削除動画** → ビジ友側は捕捉せず TikTok iframe のエラー表示に委ねる（要件 8.7）
- **モバイル in-app browser での iframe 再生制限** → Phase 1 はフォールバックリンク無し（要件 3.8 はサイレント非表示）。実機検証を follow-up
- **E2E で iframe 内再生は検証不能** → `iframe[src*="tiktok.com/player/v1"]` の存在・src のみ assert（gap-analysis Unknown #9）

## References
- [TikTok Embed Player (player/v1)](https://developers.tiktok.com/doc/embed-player) — iframe URL 形式・クエリパラメータ・スクリプト不要の根拠
- [TikTok Embedding Videos guide](https://developers.tiktok.com/doc/embed-videos/) — oEmbed/blockquote 方式との比較
- [Next.js Content Security Policy guide](https://nextjs.org/docs/app/guides/content-security-policy) — middleware vs next.config、nonce トレードオフ
- `supabase/migrations/20260324161543_003_rls_policies.sql:379-396` — option_subscriptions / client_profiles の RLS
- `src/lib/billing/webhook/handle-checkout-completed.ts:111-268` — handleOptionCheckout / handleVideoOption 既存パターン
- `src/app/(authenticated)/billing/actions.ts:41-159` — videoOptionInputSchema / priceIdForOption / buildSuccessUrl / role ガード
