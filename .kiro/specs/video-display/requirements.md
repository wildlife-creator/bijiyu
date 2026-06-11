# Requirements Document

## Introduction

ビジ友における動画掲載体験を以下の 3 軸で改善する:

1. **発注者向け新規オプション「職場紹介動画掲載」**を追加し、発注者詳細画面 (CON-006) で職場の雰囲気を動画で伝えられるようにする。受注者向け既存「動画掲載」(PR動画) と独立した別商品として提供する
2. **既存「動画掲載」(受注者PR動画) の表示 UX を刷新**する。現状は profile/page.tsx でテキストリンク「動画を見る」が表示され外部サイトに遷移するのみだが、デザインカンプ (CLI-006) は iframe ライトボックスでのページ内埋込再生を意図しており、この本来の意図に合わせる。なお profile/tasks.md (L32) では既に「`video_url` が存在し動画掲載オプションが有効な場合」と active 判定が要件化されているが、現状実装は `video_url` の存在のみで描画している。本仕様で active 判定を必須化することにより、過去に動画掲載オプションを購入したが解約 / 期限切れ状態のユーザーは PR 動画が表示されなくなる挙動になる (これは新仕様ではなく既存仕様への実装準拠)
3. **動画埋込の共通コンポーネント `<VideoEmbed>` + `parseVideoUrl()` 抽象化レイヤー**を導入する。当面 TikTok のみ対応で出荷し、将来 YouTube / Vimeo 等への対応が validation 1 行で済む構造を確保する

本機能は単発オプション (買い切り) として実装し、既存の動画掲載オプションと同額 (100,000円 / 動画) で提供する。掲載は運営による TikTok 代理投稿運用に統一する。受注者PR動画 (`users.video_url`) と職場紹介動画 (`client_profiles.workplace_video_url`) は独立したカラムで管理し、`option_subscriptions.option_type` は既存 `'video'` (受注者PR) を据置のうえ `'video_workplace'` を新規追加する。

## Requirements

### Requirement 1: 「職場紹介動画掲載」オプションの購入

**Objective:** 発注者として、自社の職場紹介動画を発注者詳細画面に掲載できるオプションを購入したい。そうすることで職人候補に職場の雰囲気を伝え、応募意欲を高める。

#### Acceptance Criteria

1. When 発注者プラン加入者 (個人発注者 / 小規模 / 法人 Owner) が CLI-026 の「職場紹介動画掲載を申し込む」ボタンを押下したとき、the billing system shall Stripe Checkout (`mode='payment'`, 100,000円, `STRIPE_PRICE_VIDEO_WORKPLACE`) のセッションを生成し、決済画面へリダイレクトする
2. If staff / 無料受注者 が CLI-026 にアクセスした場合、the billing system shall 「職場紹介動画掲載を申し込む」ボタンを非活性または非表示にする (admin はサーバー側 `billing/actions.ts:154` で別途拒否されるため UI 層での特例ガードは不要)
3. When Stripe Webhook が `checkout.session.completed` を `metadata.type='option'` かつ `metadata.option_type='video_workplace'` で受信したとき、the billing system shall `option_subscriptions` に `payment_type='one_time'` / `option_type='video_workplace'` / `status='active'` / `end_date=NULL` でレコードを INSERT する (`start_date` は DB default = `NOW()` に委ねる、既存 `handleVideoOption` パターンに揃える)
4. When 購入完了で `success_url` に戻ったとき、the billing screen shall `?option_success=video_workplace` を読み取り「職場紹介動画掲載オプションのお申し込みが完了しました」のトーストを表示する
5. The billing system shall 「職場紹介動画掲載」の解約 UI を提供しない (買い切り。掲載停止は ADM-010B で URL を空更新する運用とする)
6. The billing system shall 既存「動画掲載」(受注者PR) と「職場紹介動画掲載」を独立した 2 つの Stripe Price として管理し、片方の購入が他方に影響しない

### Requirement 2: 動画 URL の管理者による登録・更新

**Objective:** 運営担当者として、購入者の TikTok 動画 URL を代理で登録・更新したい。そうすることで、購入されたオプションに対応する動画をビジ友のページ上に表示できる。

#### Acceptance Criteria

1. When 管理者が ADM-009 (ユーザーアカウント詳細) を表示したとき、the admin user detail screen shall 対象ユーザーの `option_subscriptions` を参照し、active な `'video'` があれば「受注者PR動画を投稿する」ボタンを、active な `'video_workplace'` があれば「職場紹介動画を投稿する」ボタンを、それぞれ動的に表示する
   - **【2026-06-10 更新（admin spec）】**: 職場紹介動画（`video_workplace`）の投稿入口は ADM-004（発注者アカウント詳細）へ移設が決定。ADM-009 に表示するのは「受注者PR動画を投稿する」ボタンのみとなり、本 AC の video_workplace ボタンの記述は旧仕様（ADM-009 からの導線撤去と E2E 書き換えは admin spec で実装。`.kiro/specs/admin/requirements.md` REQ-ADM-010B 参照）
2. If 対象ユーザーがどちらの動画オプションも購入していない場合、the admin user detail screen shall 動画投稿ボタンを 1 つも表示しない
3. When 管理者が ADM-010 (受注者PR動画投稿) で URL を入力し「更新」ボタンを押下したとき、the system shall `parseVideoUrl` で URL を検証し、validation を通過した場合のみ `users.video_url` を更新する
4. When 管理者が ADM-010B (職場紹介動画投稿) で URL を入力し「更新」ボタンを押下したとき、the system shall `parseVideoUrl` で URL を検証し、validation を通過した場合のみ `client_profiles.workplace_video_url` を更新する
5. If `parseVideoUrl` が `null` を返した場合、the admin video posting screen shall 「対応プラットフォームの URL を入力してください」エラーメッセージを表示し、DB 更新を行わない
6. When 管理者が URL 入力欄を空文字のまま「更新」ボタンを押下したとき、the admin video posting screen shall 対応カラム (`users.video_url` または `client_profiles.workplace_video_url`) を `NULL` に更新する (掲載停止)
7. The admin video posting screen shall 「現在の登録 URL」を画面下部に表示し、未登録時は「未登録」と表示する
8. ADM-010 と ADM-010B shall URL 入力 + 更新ボタン + 現在の登録 URL 表示 + もどるボタンという同一レイアウトを採用する

### Requirement 3: 動画埋込の共通コンポーネント

**Objective:** 開発者として、動画 URL からプラットフォームを判別して埋込再生する共通コンポーネントを提供したい。そうすることで、受注者PR動画と職場紹介動画の表示ロジックを統一し、将来のプラットフォーム追加コストを最小化する。

#### Acceptance Criteria

1. The video display module shall `parseVideoUrl(url: string)` 関数を提供し、入力 URL から `{ platform, id, aspect, embedUrl }` を抽出するか、未対応・不正な URL に対して `null` を返す
2. Where プラットフォーム抽象化レイヤーが定義された `PATTERNS` テーブルを持つ場合、the video display module shall 新規プラットフォーム対応をエントリ 1 行の追加のみで実現する
3. The video display module shall Phase 1 において TikTok URL (`tiktok.com` ホスト、`/video/{id}` パス) のみ validation を通過させる
4. When `<VideoEmbed url={...} />` がレンダリングされたとき、the video display module shall 三角の再生ボタンを中央に配置したプレースホルダーを描画する (Phase 1 は静的プレースホルダー画像で描画。TikTok oEmbed API 経由でのサムネ動的取得は将来検討)
5. When ユーザーが再生ボタンを押下したとき、the video display module shall shadcn `Dialog` ベースのライトボックスを開き、`<iframe>` で動画を埋込再生する
6. While TikTok 動画を埋込再生するとき、the video display module shall `aspect-[9/16]` (縦長) でプレイヤー領域を確保する
7. Where YouTube / Vimeo 等の横長動画を埋込再生する場合 (将来対応)、the video display module shall `aspect-video` (16:9) でプレイヤー領域を確保する
8. If `parseVideoUrl` が `null` を返す URL が `<VideoEmbed>` に渡された場合、the video display module shall 何も描画しない (フォールバックは外部リンク等を出さず、サイレントに非表示)
9. The middleware shall Content-Security-Policy の `frame-src` ディレクティブに `'self'` および `https://www.tiktok.com` を許可する
10. Where 将来 YouTube / Vimeo 等を追加する場合、the middleware shall 該当ドメインを `frame-src` に追加する

### Requirement 4: 受注者PR動画の表示 (既存リファクタリング)

**Objective:** 受注者として、自身の PR 動画をビジ友のページ内で再生してもらいたい。そうすることで、職務経歴だけでは伝わらない人柄や現場の雰囲気をアピールできる。

#### Acceptance Criteria

1. When ユーザーが自身の COM-001 (プロフィール詳細) を表示したとき、the profile detail screen shall `users.video_url` が設定済みかつ `option_subscriptions` に active な `'video'` が存在する場合のみ `<VideoEmbed>` を描画する
2. When ユーザーが CLI-006 (受注者詳細) を表示したとき、the contractor detail screen shall 同条件で `<VideoEmbed>` を描画する (CLI-006 への閲覧アクセスは middleware で `client` / `staff` に制限済み)
3. When 管理者が ADM-009 (ユーザーアカウント詳細) を表示したとき、the admin user detail screen shall 同条件で `<VideoEmbed>` を描画する
4. If `users.video_url` が設定されていても `option_subscriptions` に `'video'` の active レコードが存在しない場合、the profile detail / contractor detail / admin user detail screen shall `<VideoEmbed>` を描画しない
5. The profile detail screen shall 既存の「動画を見る」テキストリンク実装 (`src/app/(authenticated)/profile/page.tsx`) を `<VideoEmbed>` 呼び出しへ完全に置換する
6. The contractor detail screen and admin user detail screen shall PR動画セクションを新規実装する (これらは spec 上は表示要件があったが現状未実装のため)

### Requirement 5: 職場紹介動画の表示

**Objective:** 発注者として、自社の職場紹介動画を発注者詳細画面に掲載したい。そうすることで、職人候補に職場の雰囲気を伝え、応募意欲を高める。

#### Acceptance Criteria

1. When ユーザーが CON-006 (発注者詳細) を表示したとき、the client detail screen shall 対象ユーザーの `client_profiles.workplace_video_url` が設定済みかつ `option_subscriptions` に active な `'video_workplace'` が存在する場合のみ `<VideoEmbed>` を描画する
2. The client detail screen shall 職場紹介動画の表示位置をアクションボタン群 (マイリスト・メッセージを送る) の直下、募集職種より上に配置する (デザインカンプ `CON-006.png` 準拠)
3. If 対象ユーザーの `client_profiles.workplace_video_url` が設定されていても `option_subscriptions` に `'video_workplace'` の active レコードが存在しない場合、the client detail screen shall `<VideoEmbed>` を描画しない
4. The client detail screen shall CON-006 で取得する対象ユーザーが常に `role='client'` (`clients/[id]/page.tsx:67` の `.eq("role", "client")` ガード) であることを前提に、その対象ユーザー単一の `client_profiles.workplace_video_url` を参照する。法人プランの場合この対象ユーザーは Owner であり、Admin / Staff は CON-006 に表示されないため、Owner 単独で動画 URL を管理する設計となる

### Requirement 6: ADM-008 フィルター更新

**Objective:** 運営担当者として、オプション加入者を種別ごとに絞り込みたい。そうすることで、対象ユーザーへの動画投稿作業を効率化できる。

#### Acceptance Criteria

1. When 管理者が ADM-008 (ユーザーアカウント一覧) の「オプションプラン加入者」プルダウンを開いたとき、the admin user list screen shall 「動画掲載(受注者PR) / 職場紹介動画掲載 / 補償¥5,000 / 補償¥9,800」の 4 つの選択肢を単一選択で表示する
2. When 「動画掲載(受注者PR)」が選択されたとき、the admin user list screen shall `option_subscriptions` に active な `'video'` を持つユーザーのみに絞り込んで表示する
3. When 「職場紹介動画掲載」が選択されたとき、the admin user list screen shall `option_subscriptions` に active な `'video_workplace'` を持つユーザーのみに絞り込んで表示する
4. While フィルターが未選択 (デフォルト) の場合、the admin user list screen shall すべてのユーザーを表示する (絞り込みなし)

### Requirement 7: CLI-026 オプションプラン表示

**Objective:** ユーザーとして、購入可能な動画オプションを一覧で確認したい。そうすることで、自身に必要なオプションを選択して購入できる。

#### Acceptance Criteria

1. The billing screen shall 「オプションプラン」セクションに「動画掲載」(既存・受注者PR) と「職場紹介動画掲載」(新規) を独立した 2 行として表示する
2. The billing screen shall 「職場紹介動画掲載」行に金額 (100,000円/動画) と説明文「現場や会社の雰囲気を伝える動画を、発注者詳細画面に掲載します。」と「職場紹介動画掲載を申し込む」ボタンを配置する
3. While ユーザーが発注者プラン加入者として有効でない (`subscriptions` レコードで `plan_type` が `'individual' / 'small' / 'corporate' / 'corporate_premium'` のいずれかかつ `status='active'` を満たさない) 場合、the billing screen shall 「職場紹介動画掲載を申し込む」ボタンを非活性にする (past_due 等のステータスは延滞解消まで購入不可)
4. While ユーザーが staff (代理アカウント) の場合、the billing screen shall 既存「動画掲載」と新規「職場紹介動画掲載」の両方のボタンを非活性にする (admin はサーバー側で `billing/actions.ts:154` が拒否するため UI 層での明示非活性は不要)
5. The billing screen shall 既存「動画掲載」セクションのレイアウト・文言・ボタン挙動を一切変更しない

### Requirement 8: 既存運用・データ整合性との両立

**Objective:** 開発者・運営として、既存の動画掲載オプションのデータと運用を壊さずに新オプションを追加したい。そうすることで、リリース時のリスクを最小化し、後方互換を維持する。

#### Acceptance Criteria

1. The system shall 既存 `option_subscriptions.option_type='video'` の意味を「受注者PR動画」として据置し、rename / migration を行わない
2. The system shall `STRIPE_PRICE_VIDEO` (既存・受注者PR) と `STRIPE_PRICE_VIDEO_WORKPLACE` (新規・職場紹介) を環境変数で分離管理する
3. If 動画オプションが解約 / 期限切れ状態 (`status IN ('cancelled', 'expired')`) になった場合、the system shall DB 上の URL カラム (`users.video_url` / `client_profiles.workplace_video_url`) を保持しつつ、表示判定で非表示にする
4. The system shall 過去メッセージ・お気に入り等の参照整合性を維持するため、`option_subscriptions` レコードを物理削除しない (status 変更で論理状態を管理する)
5. The system shall TikTok URL の `parseVideoUrl` 解析を `https://www.tiktok.com/@{user}/video/{id}` (標準閲覧 URL) に対応させる。短縮 URL (`vt.tiktok.com/*`)、モバイル URL (`m.tiktok.com/*`)、共有 URL (`tiktok.com/t/*`) 等の追加バリエーションの対応範囲は設計フェーズで決定する
6. If 未知のプラットフォームの URL が ADM-010 / ADM-010B で送信された場合、the system shall サーバー側 Zod バリデーションで弾き、エラーを返す (クライアント・サーバー両方で `parseVideoUrl` を通す二重防御)
7. The system shall TikTok アカウントが非公開 / 動画が削除済みのケースでも、ビジ友側ではエラーを出さず TikTok の埋込プレイヤーが表示するエラーメッセージに委ねる

## 関連 spec / steering の更新方針

本仕様の実装に伴い、以下の既存 spec / steering ドキュメントを更新する。具体タスクは spec-tasks で展開する。

### `.kiro/specs/billing/`
- `requirements.md` / `design.md`: 新 Stripe Price `STRIPE_PRICE_VIDEO_WORKPLACE` と Webhook 分岐 (`option_type='video_workplace'`) を追記
- 既存「動画掲載 オプション」(受注者PR) の記述は据置

### `.kiro/specs/profile/`
- `requirements.md` L39 / `tasks.md` L32 では既に「`video_url` が存在し動画掲載オプションが有効な場合」と active 判定が要件化されている。本仕様で実装側を spec に同期する (テキストリンク → `<VideoEmbed>`、active 判定追加)

### `.kiro/specs/job-search/`
- `requirements.md` REQ-JS-005 (CON-006): 表示項目に「職場紹介動画 (ヘッダー直下、`option_subscriptions` active 判定付き)」を追加

### `.kiro/specs/admin/`
- `requirements.md` REQ-ADM-008 フィルター記述を 4 選択肢 (動画掲載(受注者PR) / 職場紹介動画掲載 / 補償¥5,000 / 補償¥9,800) に修正
- `requirements.md` REQ-ADM-009 の動画投稿ボタン記述を「購入オプションごとに 0 / 1 / 2 ボタンを動的表示」に修正
- `requirements.md` REQ-ADM-010 のラベル記述「既登録時: 『更新』ボタン」をデザインカンプ準拠の「『更新』ボタン (URL 入力状態に依らず固定)」に修正
- `requirements.md` に REQ-ADM-010B を新設 (ADM-010 同レイアウト、`client_profiles.workplace_video_url` 更新)

### `.kiro/steering/`
- `screen-map.md`
  - ADM-008 行のフィルター記述を 4 選択肢に更新
  - ADM-009 行のボタン記述を 2 ボタン動的表示に更新
  - ADM-010 行のラベル記述を「『更新』ボタン (固定)」に修正
  - ADM-010B 行を新規追加 (PNG = `ADM-010.png` 同レイアウト流用、画面 ID は 73)
- `screen-navigation.md`: ADM-009 → ADM-010 / ADM-010B の 2 ルート遷移に更新
- `database-schema.md`
  - `client_profiles` に `workplace_video_url text NULL` 列追加
  - `option_subscriptions.option_type` の説明に `'video_workplace'` (職場紹介動画掲載) を追記
- `product.md`: オプションプラン表に「職場紹介動画掲載 100,000円/動画 単発」行を追加 (既存「動画掲載」行の下)
- `roles-and-permissions.md` L166: 「ADM-008〜010」表記を「ADM-008〜010B」に更新
