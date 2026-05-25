# Gap Analysis — video-display

実施日: 2026-05-25
対象 spec: `.kiro/specs/video-display/requirements.md`(全 8 Requirements)

---

## 1. 現状コードベース調査

### 1.1 既存「動画掲載」(受注者PR動画) の実装状況

| 領域 | ファイル / 場所 | 現状 | 本仕様での扱い |
|---|---|---|---|
| **DB カラム** | `users.video_url text NULL`(`supabase/migrations/20260324160600_002_core_tables.sql:21`) | 既存。素の text カラム、validation 制約なし | **据置**。受注者PR動画用として継続使用 |
| **Stripe Price ID** | `STRIPE_PRICE_VIDEO`(`.env.local`) | 既存・10 万円・one_time | **据置** |
| **Webhook ハンドラ** | `src/lib/billing/webhook/handle-checkout-completed.ts:243-268` `handleVideoOption` | 既存。`option_type='video'` の INSERT 処理を実装済み | **据置 + 新規 `handleVideoWorkplaceOption` 追加** |
| **Server Action** | `src/app/(authenticated)/billing/actions.ts:41-44, 81-92, 109-110` | `videoOptionInputSchema`, `priceIdForOption.video`, `buildSuccessUrl.video` の 3 箇所に分散 | **同パターンで `video_workplace` 追加**(各箇所に 1 分岐 + 新 schema) |
| **CLI-026 UI** | `src/app/(authenticated)/billing/BillingClient.tsx:473-493` | 「動画掲載」セクション(タイトル + 説明 + 申し込むボタン) | **据置 + 新規「職場紹介動画掲載」セクションを直下に追加** |
| **COM-001 表示** | `src/app/(authenticated)/profile/page.tsx:305-319` | `<a href={video_url} target="_blank">動画を見る</a>` テキストリンクのみ | **`<VideoEmbed>` で全面置換** |
| **CLI-006 表示** | `src/app/(authenticated)/users/contractors/[id]/page.tsx` | **未実装**(spec の REQ には記載あるが現状 video_url 参照なし) | **新規実装**(`<VideoEmbed>` セクション追加) |
| **ADM-009 表示** | (管理者画面全体が未実装) | **未実装** | **新規実装** |

### 1.2 既存 option_subscriptions / Stripe 周辺

| ファイル | 行/関数 | 内容 | 拡張ポイント |
|---|---|---|---|
| `src/lib/billing/webhook/handle-checkout-completed.ts:111-141` | `handleOptionCheckout` | metadata.option_type で `compensation_*` / `urgent` / `video` を分岐 | `video_workplace` 分岐を 1 箇所追加 |
| `src/lib/billing/webhook/handle-checkout-completed.ts:243-268` | `handleVideoOption` | option_subscriptions に INSERT(payment_type='one_time', end_date=null) | **同パターン**で `handleVideoWorkplaceOption` 新規 |
| `src/lib/billing/webhook/handle-subscription-lifecycle.ts:265` | option_subscriptions 状態同期 | 既存パターン | 影響なし(買い切りは subscription_id を持たないため) |
| `supabase/migrations/20260324160600_002_core_tables.sql:296` | `option_type text NOT NULL` | **CHECK 制約なし**。新値追加は ALTER 不要 | そのまま `'video_workplace'` 文字列で INSERT 可能 |

`option_subscriptions` の `option_type` カラムは CHECK 制約を持たないため、新値追加は DB スキーマ変更不要。アプリ層のリテラルとマッピングだけ追加すればよい。

### 1.3 client_profiles 関連

| 項目 | 現状 | 本仕様での扱い |
|---|---|---|
| `client_profiles` テーブル | 11 カラム(`display_name`, `address`, `image_url`, `recruit_job_types`, `working_way`, `employee_scale`, `language`, `message`, sns_* 5 個 etc.) | **新規カラム `workplace_video_url text NULL` を追加** |
| CON-006 SELECT 文 | `src/app/(authenticated)/clients/[id]/page.tsx:53-68` で `client_profiles(display_name, image_url, address, recruit_job_types, working_way, employee_scale, message, language)` | **`workplace_video_url` を SELECT に追加** |
| CLI-021 (発注者情報編集) | 既存。動画関連 UI なし | **本仕様では編集 UI は提供しない**(運営の代理投稿運用のため。CLI-021 は触らない) |
| RLS | `client_profiles` は SELECT 公開、書き込みは `user_id = auth.uid()` | **新カラムも既存 RLS で十分**(運営は admin client 経由で更新するため RLS バイパス) |

### 1.4 shadcn / UI ライブラリ

| コンポーネント | 場所 | 用途 |
|---|---|---|
| `Dialog` | `src/components/ui/dialog.tsx` | **ライトボックス埋込に流用** |
| `Sheet` | `src/components/ui/sheet.tsx` | 不採用(モバイル下部からのスライドインだが、動画には Dialog 中央表示の方が適合) |
| `AlertDialog` | `src/components/ui/alert-dialog.tsx` | 不採用(動画再生は確認ダイアログではない) |

### 1.5 CSP / Next.js 設定の現状

- `src/middleware.ts`: 認証・redirect・billing-status header propagation のみ。**Content-Security-Policy ヘッダーは未設定**
- `next.config.ts`: `images.remotePatterns` で Supabase Storage のみ、CSP 関連設定なし
- → **frame-src 設定は新規追加が必要**(middleware で `Content-Security-Policy` ヘッダーを書き込む or next.config の `headers()` で設定)

### 1.6 管理者画面の実装状況

`find src -path "*admin*" -name "*.tsx"` の結果: **何もない**。

- ADM-001 〜 ADM-015 まで spec / screen-map.md には記載があるが、コード上は admin route group 自体が未作成
- 本仕様で必要な ADM-008 / ADM-009 / ADM-010 / ADM-010B は**全画面新規実装**になる
- これは video-display スコープを超える "admin 機能全体" の話だが、本仕様で必要な範囲(ユーザー一覧 + 詳細 + 動画投稿)に限定して spec-design / spec-tasks で扱う必要あり

### 1.7 既存 Zod validation の慣習

| ファイル | パターン |
|---|---|
| `src/lib/validations/*.ts` | Zod schema 本体はここに集約(actions.ts は import するだけ) |
| `videoOptionInputSchema` (`billing/actions.ts:41`) | inline 定義(短いため) |

新規追加する `VideoUrlSchema`(URL → parseVideoUrl で null check) は **`src/lib/validations/video.ts` 新設** が clean。`parseVideoUrl` 本体は `src/lib/video-embed.ts`(pure function) に分離。

---

## 2. Requirement-to-Asset Map

| Req | 要件概要 | 既存資産 | ギャップ |
|---|---|---|---|
| **R1** | 職場紹介動画オプションの購入 | Stripe / option_subscriptions 周辺は既存 | **Missing**: `STRIPE_PRICE_VIDEO_WORKPLACE` env var / `videoWorkplaceOptionInputSchema` / `priceIdForOption` 拡張 / `buildSuccessUrl` 拡張 / `handleVideoWorkplaceOption` |
| **R2** | 管理者による URL 登録・更新 | (管理者画面自体が未実装) | **Missing**: ADM-008 / ADM-009 / ADM-010 / ADM-010B 4 画面新規。`updateVideoUrlAction` / `updateWorkplaceVideoUrlAction` Server Actions 新規 |
| **R3** | VideoEmbed 共通コンポーネント | shadcn Dialog 既存。iframe 利用は前例なし。CSP 未設定 | **Missing**: `<VideoEmbed>` / `parseVideoUrl()` / middleware の CSP frame-src 追加。**Unknown**: TikTok embed.js の必要性 / 各 TikTok URL 形式への対応範囲 |
| **R4** | 受注者PR動画の表示 (refactor) | `profile/page.tsx` でテキストリンク表示のみ。CLI-006 / ADM-009 は未実装 | **Refactor**: COM-001 を `<VideoEmbed>` 化。**Missing**: CLI-006 / ADM-009 への新規セクション追加 |
| **R5** | 職場紹介動画の表示 | CON-006 (`clients/[id]/page.tsx`) は実装済みだが video 表示なし | **Missing**: `workplace_video_url` カラム追加 + CON-006 への `<VideoEmbed>` 追加 + option_subscriptions active 判定 |
| **R6** | ADM-008 フィルター更新 | ADM-008 自体が未実装 | **Missing**: ADM-008 を新規実装。フィルタープルダウン仕様を 4 選択肢で実装 |
| **R7** | CLI-026 オプションプラン表示 | BillingClient.tsx の「オプションプラン」セクションは既存 | **Extend**: 「職場紹介動画掲載」行を追加。発注者プラン判定ロジック(`isPaidUser` 派生 or `subscriptions.plan_type` 直接参照) |
| **R8** | 既存運用・データ整合性 | 既存パターン全般 | **Constraint**: 既存 `'video'` 値は据置必須。URL カラムは status 連動で物理削除しない |

凡例: **Missing** = 完全新規、**Extend** = 既存に分岐追加、**Refactor** = 既存実装を置換、**Unknown** = 設計フェーズで調査必要、**Constraint** = 既存仕様の制約

---

## 3. 実装アプローチ

### Option A: 既存パターンを最大限拡張

- billing 関連は全て既存ファイルに `video_workplace` 分岐を追加(BillingClient.tsx / actions.ts / handle-checkout-completed.ts)
- 動画表示は新規 `<VideoEmbed>` + `parseVideoUrl` を新設し、既存テキストリンク実装を全置換
- 管理者画面は新規実装(これは既存ファイルが無いため Option B でも同じ)

**Pros**:
- 既存テスト・パターンを最大限活用、リスク最小
- レビュー差分が小さい(Webhook ハンドラは関数 1 つ追加するだけ等)
- 既存購入者(`option_type='video'`)の意味論を変えない

**Cons**:
- BillingClient.tsx が 動画オプション × 2 + 急募 + 補償 × 2 で長くなる(現在 ~800 行、+50 行程度)
- handle-checkout-completed.ts も同様に 1 関数追加

### Option B: video-display を独立モジュール化

- `src/lib/video-display/` ディレクトリを新設し、billing / 表示 / admin を全て下に集約
- 既存 BillingClient.tsx から動画オプション部分を切り出し、`<VideoOptionSection>` 等の専用コンポーネントへ
- Webhook ハンドラも `handle-video-options.ts` 等に切り出し

**Pros**:
- 関心の分離が綺麗(将来 YouTube / Vimeo 追加時にも 1 箇所で完結)
- BillingClient.tsx のサイズ抑制

**Cons**:
- 既存「動画掲載」(受注者PR) の処理にも手が入る → CLAUDE.md「既存仕様変更したくない」と緊張
- ファイル数増加、レビュー差分大、既存テスト改修コスト
- 既存「動画掲載」のリファクタは別 PR として切り分けるべき粒度

### Option C: Hybrid(推奨)

- **billing 周辺(購入フロー / Stripe / Webhook)**: Option A(既存パターン拡張)
- **動画表示 UX(VideoEmbed / parseVideoUrl)**: Option B(独立した新規モジュール `src/components/video-embed/` + `src/lib/video-embed.ts`)
- **管理者画面**: 新規実装(既存資産なし、Option A/B/C の区別が無意味)
- **DB**: マイグレーション 1 本(workplace_video_url カラム追加)

**Pros**:
- 既存 billing 実装に最小限の手を入れつつ、表示層は綺麗に独立
- VideoEmbed を共通コンポーネントとして将来の動画機能拡張(他箇所での埋込)にも転用可
- 各層のレビューが独立して進む

**Cons**:
- 計画は若干複雑(3 つの戦略を併用)、しかし各層独立しているため実装は分かりやすい

---

## 4. Effort & Risk

| 領域 | Effort | Risk | 根拠 |
|---|---|---|---|
| DB マイグレーション(`workplace_video_url`) | S | Low | 単一カラム追加、index 不要、RLS 既存パターン流用 |
| Stripe / Webhook 拡張 | S | Low | 既存 `handleVideoOption` の clone-and-modify、テストパターンも既存 |
| BillingClient.tsx 拡張 | S | Low | 既存セクション複製、プラン判定ロジックは既存利用 |
| `<VideoEmbed>` + `parseVideoUrl` 新設 | S-M | Medium | shadcn Dialog 流用は容易だが、TikTok 埋込挙動・aspect-ratio・CSP 設定が新規。要調査項目あり |
| CSP middleware 追加 | S | Medium | 既存 middleware への ヘッダー追加自体は単純。ただし「他箇所への影響」を要確認(既存ページが iframe を使っていないか確認済 = 影響なし) |
| COM-001 表示置換 | S | Low | 既存実装が短いため置換容易 |
| CLI-006 表示追加 | S | Low | 既存ページにセクション追加のみ |
| CON-006 表示追加 | S | Low | 同上 |
| 管理者画面 ADM-008 / 009 / 010 / 010B 4 画面新規 | M | Medium | route 自体が初実装、Middleware の admin role check は既存 spec で要件化されている。デザインカンプは ADM-008 / 009 / 010(=ADM-008-b リネーム済) / 010B(010 と同形流用) |
| E2E テスト追加(動画表示・ライトボックス・管理者投稿) | M | Medium | TikTok iframe を E2E でどう assert するかが unknown(おそらく iframe src のみ確認に留める)|
| **総合** | **M (3-7 日)** | **Medium** | 個別タスクは Low ばかりだが、管理者画面が新規 + CSP / TikTok 埋込の Unknown が積み上がる |

---

## 5. Research Needed (設計フェーズへ持ち越す調査項目)

| # | 項目 | 確認方法 |
|---|---|---|
| 1 | **TikTok 埋込で `embed.js` は必須か** | TikTok 公式ドキュメント / 実機検証(iframe 単体だけで再生できるか) |
| 2 | **TikTok URL のバリエーション網羅** | `https://www.tiktok.com/@user/video/1234`(標準)、`https://vt.tiktok.com/xxxx`(短縮)、`https://m.tiktok.com/...`(モバイル)、`https://tiktok.com/t/xxxx`(共有)。どこまでサポートするか決定 |
| 3 | **CSP 設定箇所**(middleware vs next.config.headers) | Next.js 16 のベストプラクティス確認。既存 middleware で response header を書く方が他のセキュリティヘッダーとも統合しやすい |
| 4 | **Dialog 内 iframe のキーボードアクセシビリティ** | Tab トラップ / Esc 閉じる / `aria-label` 設定 |
| 5 | **TikTok アカウント非公開 / 動画削除済みの表示挙動** | iframe 内で TikTok 側がエラー表示する。ビジ友側は捕捉不可(諦めて TikTok の挙動に委ねる) |
| 6 | **モバイル in-app browser(LINE/X 等) での再生可否** | 一部の WebView は iframe playback を制限する。フォールバック「TikTok で見る」リンクが必要かを検討 |
| 7 | **TikTok のサムネ取得(oEmbed API)を使うか** | プレースホルダーを実動画サムネにすると UX 向上だが、毎回 API call が必要 → 設計時に判断 |
| 8 | **ADM-008 のフィルター実装で「動画掲載(受注者PR) / 職場紹介動画掲載」を排他選択にするか、複数選択を許すか** | 既存 spec は「単一選択」だが、運営がよく使うのが OR 検索(両方の購入者を見たい)なら multi-select 推奨。要決定 |
| 9 | **E2E テストで iframe をどう assert するか** | Playwright で `iframe[src*="tiktok.com"]` の存在確認まで。再生検証は無理 |
| 10 | **管理者画面のロールガード** | Middleware で `users.role = 'admin'` チェックを `/admin/*` 全配下に追加(既存 spec 要件) |

---

## 6. 設計フェーズへの推奨事項

### 推奨アプローチ: **Option C (Hybrid)**

- **billing 周辺**: 既存パターン拡張(Option A)
- **動画埋込**: 新規モジュール(Option B)で `<VideoEmbed>` を共通化
- **管理者画面**: 新規実装(該当箇所が空のため)
- **DB**: 単一カラム追加マイグレーション

### 主要な設計判断ポイント

1. **`parseVideoUrl` の戻り値型**: `{ platform, id, aspect, embedUrl }` の構造。設計時に正確なシグネチャと型定義を固める
2. **VideoEmbed の責務範囲**: 「サムネ + 三角ボタン + Dialog + iframe」までを 1 コンポーネントで吸収するか、`<VideoThumbnail>` + `<VideoDialog>` に分けるか
3. **active 判定の共通ヘルパー**: `hasActiveOption(userId, optionType)` のような関数を `src/lib/billing/` 配下に新設すべきか、各表示箇所で個別に option_subscriptions を SELECT するか
4. **管理者画面の Middleware**: `users.role = 'admin'` チェックは middleware で `/admin/*` パターンに包括的に当てる
5. **ADM-009 のボタン表示条件**: `option_subscriptions` の status='active' 判定。0/1/2 ボタンの動的描画
6. **既存「動画掲載」(option_type='video') の表示制御**: 現在は users.video_url の存在のみで表示している。要件 R4-AC1 では「option_subscriptions に active な video あり」を条件に追加するので、**既存挙動が変わる**(option を解約したユーザーは表示されなくなる)。この影響範囲を設計時に再確認

### 重要な制約

- **既存 `option_type='video'` 値は据置**(rename / migration なし)
- **既存「動画掲載」UI(BillingClient.tsx の対応セクション) は据置**
- **CLI-021 (発注者情報編集) には触らない**(動画は運営の代理投稿運用のため、ユーザー編集 UI を提供しない)
- **法人プランは Owner が代表購入**(staff / admin は購入不可、既存 billing actions の role check で対応済み)
