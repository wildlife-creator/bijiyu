# CLAUDE.md — ビジ友（bijiyu）プロジェクト指示書

## プロジェクト概要

建設業界の職人（受注者）と発注者をつなぐWebマッチングサービス。
cc-sdd（Spec-Driven Development）で開発を進める。

## パス構成

- ステアリング: `.kiro/steering/`
- 仕様書: `.kiro/specs/`
- デザインアセット: `design-assets/`（画面PNG、CSS spec、globals.css）※ Tailwind v4: トークンは globals.css の @theme inline で定義
- アイコン・ロゴ: `assets/`（`icons/` にUI用アイコンPNG、`images/` にロゴPNG）※ 画面実装時はこのアイコンを優先使用
- リファレンス: `reference/`（PNG マッピング等）
- Supabase: `supabase/`（migrations, seed, tests）※実装フェーズで作成

## ステアリングファイル一覧（12ファイル）

| ファイル | 内容 |
|---------|------|
| product.md | サービス概要、プラン、ビジネスモデル |
| tech.md | 技術スタック、メール、テスト、Realtime戦略 |
| structure.md | ディレクトリ構成、命名規則、ルーティング |
| screen-map.md | 全78画面一覧、画面ID |
| screen-navigation.md | 画面遷移フロー |
| roles-and-permissions.md | ロール、権限、プラン制限 |
| security.md | セキュリティ方針、入力検証 |
| authentication.md | 認証、認可、Stripe Webhook |
| database-schema.md | テーブル設計、RLS、マイグレーション |
| design-system.md | デザイントークン、レスポンシブ方針 |
| design-rule.md | Tailwindクラス実装ルール |
| implementation-notes.md | 実装判断の補足・注意点 |

## 開発ワークフロー

### cc-sdd フロー
1. `spec-init` → 機能の初期化
2. `spec-requirements` → 要件定義
3. `spec-design` → 設計
4. `spec-tasks` → タスク分解
5. `spec-impl` → 実装

### 開発の進め方
- 全78画面を機能グループごとに実装する
- 各グループの実装完了ごとに動作確認を行う
- テストはリスクベース: 書き込み+権限系はフルテスト、読み取り系はミニマル
- spec-impl 開始時に `reference/png-mapping.md` で対象画面の PNG ファイルを特定し、デザインカンプを確認してから実装に入ること
- spec-tasks で生成される tasks.md の各画面タスクには、対応するデザインカンプのファイル名（例: `design-assets/screens/CON-001.png`）を記載すること

### spec-tasks で生成する tasks.md のルール
- tasks.md の先頭タスク（タスク0）として「既存テストの全実行とデグレ確認」を必ず含めること
  - `npm run test` / `supabase test db` / `npm run test:e2e` を実行
  - 全テストがパスしてから実装タスクに着手する
  - 失敗がある場合は原因を調査・修正してから進む

### テスト失敗時のルール
- テスト失敗を修正した場合、その原因と対策を CLAUDE.md の「実装時の必須チェック項目」セクションに追記すること
- 他の機能でも同じバグが起きうる場合は、汎用的なルールとして記載する

## 言語・コーディング規約

### 言語
- コード: English（変数名、関数名、コメント）
- UI テキスト: Japanese（ボタンラベル、エラーメッセージ、プレースホルダー）
- ドキュメント: Japanese（spec ファイル、steering ファイル）

### TypeScript
- `strict: true` を有効にする
- `any` は使用禁止。型が不明な場合は `unknown` を使う
- 型定義は Supabase CLI の `supabase gen types` で自動生成したものを使用する
- コンポーネントの Props は `interface` で定義する

### ファイル命名
- ファイル名: kebab-case（例: `job-search-form.tsx`）
- コンポーネント名: PascalCase（例: `JobSearchForm`）
- 関数・変数名: camelCase（例: `getJobById`）
- 定数: UPPER_SNAKE_CASE（例: `MAX_SKILLS_COUNT`）
- DB関連の型: snake_case（Supabase 自動生成に合わせる）

### インポート
- `@/` エイリアスを使用する（`../../` の相対パスは禁止）
- インポート順: React → 外部ライブラリ → `@/` 内部モジュール → 相対パス

### コンポーネント設計
- Server Component をデフォルトとする
- `"use client"` は必要な場合のみ付与（useState、useEffect、イベントハンドラ使用時）
- 1ファイル1コンポーネント（ヘルパーコンポーネントは同ファイル内可）
- Props が5つ以上になったら設計を見直す

### スタイリング
- Tailwind CSS のユーティリティクラスのみ使用する
- カスタム CSS は原則禁止（globals.css の CSS変数定義を除く）
- shadcn/ui コンポーネントを優先的に使用する
- design-rule.md に定義されたクラスの組み合わせに従う

### デザインカンプの参照（必ず守ること）
- 画面を新規実装・修正する際は、必ず `design-assets/screens/` 内の対応する PNG ファイルを確認し、レイアウト・配置・余白・色・要素の見た目を合わせること
- 画面IDと PNG ファイルの対応は `reference/png-mapping.md` を参照する
- デザインカンプが PC 版（`*-design-pc.png`）と SP 版（`*-design-sp.png`）の両方ある場合は、両方を確認してレスポンシブ対応すること
- デザインカンプがない画面（`png-mapping.md` で「なし」と記載）は、同じ機能グループの他の画面のスタイルに合わせて実装する
- 機能要件（requirements.md）だけでなく、デザインカンプの見た目も実装の正とする。両者に矛盾がある場合はデザインカンプを優先し、判断に迷う場合は確認を求めること

### アイコン・ロゴの使用（必ず守ること）
- アイコンボタン（♡お気に入りボタン等、テキストなしでアイコンのみ表示するボタン）では `assets/icons/` 内のプロジェクト専用アイコンを優先的に使用すること
- lucide-react 等の汎用アイコンライブラリは、`assets/icons/` に該当するアイコンがない場合のみ使用可
- lucide-react アイコンを使う場合は `className="w-4 h-4 text-primary/70"` で薄紫に統一すること（プロジェクト専用アイコンの色味と合わせる）
- メニューリスト項目（マイページのナビゲーションリンク等）にはアイコンを付けない。テキスト + 右矢印（`>`）のみで構成すること
- ロゴは `assets/images/` 内のファイルを使用すること

**アイコン一覧（assets/icons/）:**

| ファイル名 | 見た目 | 用途 |
|-----------|-------|------|
| icon-briefcase.png | カバン（紫） | 仕事・案件関連のアイコンボタン |
| icon-search.png | 虫眼鏡（グレー） | 検索ボタン |
| icon-heart.png | ハート（グレー） | お気に入り（♡）ボタン |
| icon-memo.png | メモ用紙（紫） | メッセージ・書類関連のアイコンボタン |
| icon-globe.png | 地球（紫） | エリア・地域表示のアイコン |
| icon-avatar.png | 人型（紫） | プロフィール・ユーザー関連のアイコン |
| icon-pin.png | ピン（紫） | 位置・場所・現場表示のアイコン |
| icon-tag.png | タグ（紫） | 本人確認・CCUS・バッジ表示のアイコン |
| icon-sort.png | ソート矢印（グレー） | 並び替えボタンのアイコン |
| icon-coin.png | コイン（紫） | 報酬表示のアイコン |
| icon-calendar.png | カレンダー（紫） | 募集期間・日付表示のアイコン |

**ロゴ一覧（assets/images/）:**

| ファイル名 | 用途 |
|-----------|------|
| logo-horizontal.png | ヘッダー等の横長ロゴ |
| logo-vertical.png | 縦長ロゴ |

### 開発ツール（MCP）
- コードベースの検索・シンボル参照・編集には Serena MCP のツールを優先的に使用すること
- ファイルの全文検索や grep よりも、Serena のセマンティック検索（シンボル定義・参照の追跡）を先に試す

### データフェッチ
- デフォルト: React Server Components（RSC）で直接フェッチ
- 変更操作: Server Actions
- リアルタイム: Supabase Realtime（メッセージ + 通知バッジのみ）
- クライアントフェッチ: 上記で対応できない場合のみ

### エラーハンドリング
- Server Actions は `{ success: boolean, error?: string, data?: T }` 形式で返す
- ユーザー向けエラーメッセージは日本語で表示する
- 技術的なエラー詳細はログに記録し、ユーザーには見せない
- フォームバリデーションは Zod スキーマでクライアント・サーバー両方で実施する
- クライアントコンポーネントから Server Action を呼び出す際は、`success: false` のケースで必ず `toast.error(result.error)` 等でユーザーにフィードバックすること。成功パスのみ処理してエラーを握り潰すと「ボタンを押しても何も起きない」UX になる（PastDueBanner で実際に発生した）

### セキュリティ（必ず守ること）
- 全テーブルに RLS を有効化し、デフォルトで全アクセスを拒否する
- 権限チェックは Middleware（ルーティング）+ RLS（データアクセス）の二重防御
- 機密データ（本人確認書類等）は非公開バケットに保存する
- 環境変数をコードにハードコードしない

### テスト
- テストファイルは `__tests__/` ディレクトリに配置する
- 命名: `{対象}.test.ts` / `{対象}.test.tsx`
- spec-tasks で生成されたテスト指示に従う
- 高リスク（書き込み + 権限）: ユニット + インテグレーション必須
- 低リスク（読み取りのみ）: ユニットのみで可
- 新しい機能の spec-impl 開始時の最初のステップとして、以下の3コマンドを順に実行し、全テストが通ること（デグレードがないこと）を確認する:
  1. `npm run test` — Vitest（ユニット・統合テスト）
  2. `supabase test db` — RLS テスト（pgTAP）
  3. `npm run test:e2e` — Playwright（E2E テスト）
- 上記のいずれかが失敗した場合、新機能の実装に着手せず、まず失敗の原因を調査・修正すること
- E2E（Playwright）: 各機能の spec-impl 完了後、その機能に関わるユーザーストーリーを網羅的に洗い出し、Playwright テストを作成する
  - まず「この機能で考えうるユーザーストーリー」を一覧化する（正常系 + エラー系）
  - 各ストーリーについて、ユーザーの操作順にテストを書く（画面遷移→操作→結果確認の通しフロー）
  - 複数ロール（受注者・発注者・担当者）が関わる機能は、各ロールの視点でストーリーを書く
  - 書き込み系操作（保存・アップロード・送信など）は必ずカバーする
  - seed.sql に必要なテストデータを事前に用意し、テストが確実に再現可能な状態にする
- Playwright テスト実行前に `supabase start` と `npm run dev` が起動していることを確認する。DB は `supabase db reset` でリセットしてからテストを実行する

### Vitest モックのルール
- Server Action 自体を `vi.mock` で差し替えてはならない。Supabase クライアント等の外部依存をモックし、Server Action の内部ロジック（Zod バリデーション、FormData 解析、エラーハンドリング）が実際に動くテストを書くこと
- Supabase クライアントのモックは `{ data, error }` の形状を正確に再現すること。`data` だけ返して `error` を省略しない
- ファイルアップロードのテストでは `new File()` と `new FormData()` を使って実際の FormData を組み立てること。FormData の組み立てを省略しない
- モックの戻り値を常に成功にしない。正常系と異常系（error が返るケース、data が null のケース、認証エラー）の両方をテストすること

### Git コミット
- 1機能1コミットを基本とする
- コミットメッセージは日本語で、何を変更したか簡潔に書く
- マイグレーションファイルは必ずコミットに含める

## 禁止事項

- `any` 型の使用
- `!important` の使用
- インラインスタイル（`style={}` 属性）の使用
- `console.log` を本番コードに残すこと
- `.env` ファイルの Git コミット
- RLS を無効にしたままのテーブルを残すこと
- `dangerouslySetInnerHTML` の使用（XSS対策）
- パスワード・トークン・機密情報のログ出力

## 実装時の必須チェック項目（過去のバグから学んだルール）

### Supabase Storage 関連
- 画像表示に next/image を使う場合、next.config の remotePatterns に
  Supabase Storage のホストを追加すること（ローカル: localhost:54321、本番: xxxx.supabase.co）
- Storage バケットの作成と RLS ポリシー設定を実装タスクに含めること
- ファイルアップロードの Server Action は FormData で受け取ること
- アップロード後の URL 取得: 公開バケットは `getPublicUrl()` を使用。非公開バケット（`application-documents` 等）はファイルパスのみ DB に保存し、表示時に `createSignedUrl()` で Signed URL を生成すること（`getPublicUrl()` は非公開バケットでは機能しない）
- **Storage RLS ポリシーとアップロードパスの整合**: `(storage.foldername(name))[1] = auth.uid()::text` のようなRLSポリシーの場合、`.upload(path, file)` の `path` はユーザーIDで始める必要がある（例: `${user.id}/filename.ext`）。バケット名をパスに含めないこと（`.from("bucket")` が既にバケットを指定している）
- **ユーザーアップロード画像の表示**: Supabase Storage から取得した画像を表示する際は `<img>` タグを使うこと。`next/image` の `<Image>` はリモートパターン設定の問題が起きやすく、サーバー再起動が必要になる場合がある

### 書類・ファイル添付のデータ保存レベル
- ファイル添付機能を実装する際は「誰に見せるデータか」で保存先を使い分けること:
  - **案件レベル**（全応募者に見せる）: `job_images` テーブル + `job-attachments` バケット。案件作成・編集時にアップロード
  - **応募レベル**（特定の応募者にだけ見せる）: `applications.document_urls` + `application-documents` バケット。発注可否（CLI-009-B）等でアップロード
- 受注者側の画面（CON-012 等）で「業務に関する書類」を表示する場合は、案件レベル（`job_images`）と応募レベル（`applications.document_urls`）の両方を統合して表示すること。受注者にとってはどちらも「発注者から提供された書類」なので区別不要
- 新しいバケットを作成する場合は、マイグレーションでバケット作成 + RLS ポリシー設定をセットで行うこと

### Server Actions 関連
- Server Action を実装したら、ブラウザから実際に呼び出せることを
  前提としたコードにすること（モックだけで通るコードは不可）
- フォームの onSubmit ハンドラが Server Action を正しく呼び出していることを確認すること
- FormData の組み立て（特にファイル添付）が正しいことを確認すること

### ミドルウェア・認証フロー関連
- パスワードリセットやメール認証など、Supabase Auth のコールバック後にセッションが確立される画面は、ミドルウェアの「認証済みユーザーをauth画面からリダイレクト」ロジックの例外として登録すること（例: `/reset-password/confirm` は認証済みユーザーにもアクセスを許可）
- seed.sql のテストデータは実際の業務フローと整合させること（例: `identity_verified = true` にするなら `identity_verifications` テーブルにも対応する承認済みレコードを用意する）
- **pgTAP テストの UUID は seed.sql と重複させない**: pgTAP テストは `BEGIN; ... ROLLBACK;` で実行されるが、seed データが既に投入されている状態で実行される。テスト内で `INSERT INTO auth.users` する場合、seed.sql で使用済みの UUID と重複すると `duplicate key` エラーになる。テスト専用の UUID を使うこと

### RLS ポリシーの自己参照（無限再帰）
- RLS ポリシーの USING 句で自テーブルを直接 SELECT するサブクエリを書いてはならない。PostgreSQL が無限再帰を検出してエラーになる
- 例: `organization_members` の SELECT ポリシーで `SELECT organization_id FROM organization_members WHERE ...` を使うと再帰する
- 対策: `SECURITY DEFINER` 関数（`is_same_org()` 等）を経由してアクセスする。SECURITY DEFINER 関数は RLS をバイパスするため再帰が発生しない
- 他テーブルの RLS ポリシーから `organization_members` を参照する場合も同様に `is_same_org()` を使うこと（`organizations_select` ポリシー等）
- このバグはクエリが `null` を返すだけでエラーメッセージが画面に表示されないため、発見が遅れやすい

### フィルター付き一覧画面と `router.back()` の状態不整合
- フィルター付き一覧画面で `router.back()` を使うと、プルダウン等の `useState` が前回の選択値を保持したまま残り、URL の searchParams（フィルターなし）と UI 表示が乖離する
- 対策: フィルターの状態は URL の searchParams を Single Source of Truth とし、`useState` ではなく `useSearchParams()` から直接値を取得すること
- プルダウン選択で即時フィルタリングする場合は `onValueChange` 内で `router.push()` して URL を更新する

### 段階的フォーム表示（条件レンダリング）
- プルダウンや選択肢に応じてフォームの表示内容が変わる場合は、別ページ遷移ではなく `useState` による同一ページ内の条件レンダリングで実装すること（例: CLI-009 の「発注を依頼する」/「お断りする」選択）
- プルダウンの `onValueChange` では state 更新のみ行い、Server Action の呼び出しは行わない。送信はフォームの「送信する」ボタン押下時に行う
- `decision` が未選択（`null`）の場合は送信ボタンを `disabled` にする
- このパターンは「選択 → 追加入力 → 確認 → 送信」のステップを1ページ内で完結させる場合の標準パターンとする

### CTA ボタン（`variant="default"`）の文字色
- `bg-primary` ボタンの文字色が白（`text-primary-foreground`）になっていることを必ず確認すること
- `asChild` + `<Link>` の組み合わせでは `<a>` タグのデフォルトスタイルが干渉し文字色が黒になる場合がある。その場合は明示的に `text-white` を `className` に追加する
- globals.css の `--primary-foreground` が `0 0% 100%`（白）に設定されていることも確認すること
- 同一セクション内に複数のボタンがある場合、幅を `w-full max-w-xs mx-auto` で統一し、中央寄せにすること
- 遷移先のあるアクションボタン（「募集案件詳細」「ユーザー詳細」等）は primary 塗りつぶし（`variant="default" rounded-full text-white`）、「もどる」ボタンは `variant="outline" rounded-full` で統一する
- ボタンの親要素には `flex flex-col items-center gap-3` を適用して縦並び中央揃えにする

### フォーム要素の背景色
- 入力可能なフォーム要素（Input, Textarea, Select, date input）の背景色は `bg-background`（白）にすること
- `bg-muted` や `bg-gray-*` 等のグレー系背景をフォーム要素に使用してはならない（disabled 状態を除く）
- disabled / readonly 状態のフォーム要素は `bg-muted` を使用する（操作可能 vs 操作不可の視覚的区別）

### 下書き保存のバリデーション
- 下書き保存（status = "draft"）時は `jobDraftSchema`（タイトルのみ必須）を使用し、公開時は `jobSchema`（全必須項目チェック）を使用すること
- 下書き保存ボタンは `type="button"` にして react-hook-form のクライアント側バリデーションをスキップすること。`type="submit"` だとフルバリデーションが走り、途中入力の下書きが保存できない
- Server Action 側でも `status === "draft"` を判定して `jobDraftSchema` を使い分けること
- 数値フィールド（rewardLower, rewardUpper, headcount）は下書き時に NaN になりうるため、DB 保存時に `numOrNull()` で null に変換すること
- 「公開する」ボタンは `handleSubmit(callback)()` を使い、バリデーション失敗時はトーストでエラーフィールドを通知すること


### 外部サービス連携
- billing 機能の実装時は Stripe CLI でローカル Webhook 転送を設定し、
  テスト決済後に users.role が 'client' に変わることを手動で確認すること
- Stripe Webhook の署名検証（STRIPE_WEBHOOK_SECRET）が .env.local に設定されていることを確認すること

### Stripe 二重課金防止（必ず守ること）
- Checkout Session 作成前の二重課金防止は **DB チェック + Stripe API チェックの二段構え** で行うこと。DB（subscriptions テーブル）のチェックだけでは、Webhook 遅延時に DB が未更新のままガードをすり抜ける
- Stripe API チェック: `ensureStripeCustomer` で customerId 確定後、`stripe.subscriptions.list({ customer, status: 'active', limit: 1 })` を呼び、active subscription が存在すれば拒否する
- この問題は本番でも起こりうる（Stripe Webhook の配送遅延、Webhook ハンドラの一時ダウン、ユーザーの素早い再操作）
- 同様のパターン（外部サービスの状態を DB にミラーリングしている場合）では、DB だけでなく外部サービスの API も直接確認すること

### 設定ファイル
- 新しい外部ホストから画像を取得する場合は next.config の remotePatterns を必ず更新すること
- 新しい環境変数を追加したら .env.local.example にも追記すること

### E2Eテスト（Playwright）
- 各機能の spec-impl 完了後、その機能の書き込み系操作（保存・アップロード・送信など）をカバーする Playwright テストを作成すること
- 新しい機能の spec-impl 開始時の最初のステップとして `npm run test:e2e` を実行し、既存の全 Playwright テストが通ること（デグレードがないこと）を確認すること
- テスト実行前に `supabase start` + `supabase db reset` + `npm run dev` が必要。seed.sql のテストユーザー（contractor@test.local 等）を使ってテストを書くこと
- テストデータのクリーンアップは不要（次回の `supabase db reset` でリセットされる）
- **E2Eテストの期待値は seed.sql のデータと整合させること**: テストが前提とするユーザー状態（本人確認済み、サブスクリプション有効等）が seed.sql の実際のデータと一致しているか確認する。seed.sql でフラグを変更した場合、そのフラグに依存するE2Eテストも同時に更新すること。原因例: seed.sql で `identity_verified = true` を設定しているのに、E2Eテストが「本人確認バッジが表示されない」ことを期待して失敗した
- **`page.goto(URL)` 直接遷移だけで E2E を完結させない**: 対象画面に直接飛ぶだけのテストは、その画面に**辿り着ける経路**（マイページのメニュー、ヘッダー、前画面のボタン）が壊れていても検出できない。少なくとも主要ユーザーストーリーの起点は「ログイン → マイページ → メニュークリック → 画面到達」まで click で繋ぐこと。機能詳細テスト（フォーム入力等）は page.goto 直接遷移でよい。`e2e/mypage-navigation.spec.ts` がこのロール別導線スモークの基準実装（2026-04 に /mypage のリンク URL が全て誤っていたが、既存 E2E が page.goto 直接遷移型だったため検出されなかった実例の再発防止）
- **shadcn/ui の Select は `selectOption()` で操作してはならない（必ず守ること）**: shadcn の `<Select>`（Radix UI ベース）は DOM 上 `<button role="combobox">` として描画されるため、Playwright の `selectOption()` は `Element is not a <select> element` で失敗する。正しいパターンは `await page.getByLabel(...).click()` → `await page.getByRole("option", { name: "..." }).click()` の 2 段クリック。基準実装は `e2e/matching.spec.ts` / `e2e/messaging.spec.ts`。同じ落とし穴: フォーム実装を native `<select>` から shadcn Select に置き換えた際に対応する E2E テストの更新が漏れるパターン（2026-04-22 に `e2e/profile.spec.ts` の都道府県変更テストで実例発生）

### ナビゲーションリンクと実ルートの整合（必ず守ること）
- 新規画面を実装したら、**その画面への導線となる全リンク**（マイページ、ヘッダー、画面内ボタン）の `href` 値を検索し、実在のルートと完全一致することを確認する
- 具体手順: `grep -r 'href=' src/app/(authenticated)/mypage/page.tsx` 等で該当画面向けの href を列挙し、Next.js の `src/app/` 配下に対応する page.tsx があるか突き合わせる
- `href="/scouts/templates"` のような「REST 風で一見正しそうな URL」の誤記は typo として見逃されやすい。目視だけでなくアプリを起動してクリック確認する
- E2E は `page.goto()` 直接遷移だけでは導線ミスを検出できないため、上記「E2Eテスト」セクションのロール別導線スモークで保険をかける

### テストファイル内で本体ロジックの定数を「コピー」してはならない（必ず守ること）
- 本体コード（middleware, Server Action 等）の定数や関数を、テストファイル冒頭に**ハードコピー**して「isolated testing」する書き方は禁止
- 必ず `import { CLIENT_ONLY_PREFIXES } from '@/middleware'` のように本体を import して使う
- コピーすると本体更新と同期が取れず、**テストは古い実装に対して通り続けるが production は動かない**という事態になる（2026-04-21 に `src/__tests__/auth/middleware-routing.test.ts` で実例発生: 実際の middleware から `/organization` prefix が削除され `/mypage/members` 等が追加されていたが、テスト側コピーは古いままで、存在しないルート `/organization/members` に対する「client-only block」が通っていた）

### Staff ユーザーの subscription 参照（必ず守ること）
- Staff（`users.role = 'staff'`）は**自分の subscription を持たない**。Owner のサブスクに相乗りする設計
- **用途は「表示・閲覧のみ」**（マイページのメニュー可視性、画面内のプラン別表示切替等）。Staff は支払い系 Server Action を実行しないため、課金実行コンテキストで Staff の subscription を解決する必要は発生しない（`.kiro/specs/organization/requirements.md` REQ-ORG-011 の設計判断参照）
- 表示用途で Staff のプラン状態を判定する際は、以下の順で解決する:
  1. `organization_members WHERE user_id = <staff_uid>` → `organization_id`
  2. `organizations WHERE id = <organization_id> AND deleted_at IS NULL` → `owner_id`
  3. `subscriptions WHERE user_id = <owner_id> AND status IN ('active', 'past_due')`
- ステップ 3 は RLS により Staff セッションから直接 SELECT 不可のため、**admin client** を使う
- `.eq('user_id', user.id)` で自分の subscription を引く書き方を Staff に適用すると常に null になり、「発注者向けメニューが Staff では一切表示されない」バグが発生する（2026-04-21 実例）
- 基準実装: `src/app/(authenticated)/mypage/page.tsx` の subscription 分岐
- 支払い系 Server Action（billing 配下）のロールチェックは `'owner'` / `'admin'` のみ許可し、`'staff'` を許可リストに含めない（契約主体を Owner 単一に固定する設計判断。詳細は organization spec REQ-ORG-011）

### organization 機能実装時の必須リファクタリング（必ず守ること）
- organization の spec-impl を開始する際、**CLI-016〜025 の画面実装（Task 9 以降）より先に**、付録 A のリファクタリング全 8 ステップを完了すること
- リファクタリングの詳細な手順とファイルリストは `.kiro/specs/organization/requirements.md` 付録 A および `tasks.md` Task 2〜8 / Task 16 / Task 16.1 / Task 16.2 に記載
- リファクタリングの要点: `organizations.name` カラム廃止 → `client_profiles.display_name` に一本化。`getActiveCorporateOrgNames()` 廃止。`resolveParticipantName()` の引数・優先順位変更。全 14 画面のクエリ書き換え。`/mypage/organization-setup` の CLI-021 統合
- **Task 16.1 / 16.2 を飛ばさないこと**（過去に漏れが発生）:
  - Task 16.1: `scripts/task16-integration.mjs` の削除または更新（organization-setup 廃止で動作不能になる）
  - Task 16.2: billing spec 4 ドキュメント（tasks.md / requirements.md / design.md / research.md）の記述を過去形に更新。`impl-memo.md` は歴史的記録として保持
  - これらはコード変更ではなく「周辺アセット（スクリプト・spec ドキュメント）の更新」のため、テストコマンドでは検知できない。tasks.md を頭から末尾まで辿ることで確実に実施する
- リファクタリング完了後、`npm run test` / `supabase test db` / `npm run test:e2e` が全て通ることを確認してから画面実装（Task 9 以降）に着手する
- **このリファクタリングを飛ばして画面実装を始めてはならない**。仕様書と既存コードが食い違った状態で新機能を作ると、画面によって発注者名が異なるバグが発生する

### デザインカンプとの整合性
- 画面実装の完了前に、`design-assets/screens/` 内の対応する PNG と実装結果を目視比較すること
- 特にチェックすべき点: 要素の配置順序、セクションの分割、カードやボタンのスタイル、余白のバランス
- アイコンが `assets/icons/` のプロジェクト専用アイコンを使用しているか確認すること（lucide-react 等の汎用アイコンになっていないか）
- ロゴが `assets/images/` のプロジェクト専用ロゴを使用しているか確認すること
- ボタンのスタイルが design-rule.md のバリエーション定義（CTA = `bg-primary` ピル型、サブ = `outline` 等）に従っているか確認すること
- カードの角丸が design-system.md の定義（8px = カード、47px = ピル型ボタン）に従っているか確認すること
- 「機能は動くがデザインカンプと見た目が違う」は未完了とみなす
- 仕様書（requirements.md）の記述が簡素な場合（例:「表示項目: 応募者名、職種、応募日」のみ）、デザインカンプの見た目を正としてレイアウト・配置・セクション構成・アイコン使い分けを読み取り、仕様書に書かれていない要素もデザインカンプに従って実装すること。仕様書の項目リストは「最低限含む要素」であり、デザインカンプに描かれている要素を省略してよいという意味ではない

### メッセージング・組織スレッド関連
- メッセージスレッドは「1組織（or 個人発注者）× 1受注者 = 常に1スレッド」。法人プランの場合、同一組織メンバー全員がスレッドを共有する
- 受注者が発注者にスレッドを作成する際は **admin client** を使用すること（相手の organization_members を SELECT する権限が RLS で制限されるため）
- messages テーブルの UPDATE（read_at, scout_status）は **admin client** で実行すること（PERMISSIVE ポリシーの OR 結合問題を回避）
- Server Action で FormData 経由の File を受け取る場合、Zod の `z.instanceof(File)` は使わないこと（サーバー側で instanceof が一致しない）。`file.size`、`file.type` を直接チェックするインラインバリデーションを使用する
- 受注者のスレッド一覧・詳細で組織名を表示するため、organizations テーブルに `organizations_select_thread_participant` RLS ポリシーが必要
- **代理メッセージ（`is_proxy`）の仕組み**: 代理アカウント（`organization_members.is_proxy_account = true`）は、ビジ友の運営スタッフが法人の担当者アカウントにログインして操作するためのもの。**sender_id の書き換えは行わない**（`proxy_sender_id` カラムは廃止済み）。Server Action が送信者の `is_proxy_account` を参照し、`messages.is_proxy = true` を自動設定するだけ。「代理」バッジは**発注者側の画面でのみ表示**し、受注者側には表示しない

### Vitest モック関連
- Server Action のテストでは、Server Action 自体を vi.mock で差し替えてはならない。Supabase クライアントをモックし、Server Action の内部ロジックが実際に動くテストを書くこと
- テストが通っても「このテストは実際のブラウザ操作で同じ結果になるか？」を自問すること。モックが現実と乖離していないか確認する
- Supabase クライアントのモックでは `{ data, error }` の戻り値形状を正確に再現すること。異常系（error が返るケース）も必ずテストすること

### ロール設計と画面アクセス（必ず守ること — 過去に複数回リグレッション発生）
- ビジ友は「1アカウントで受注・発注の両方が可能」な設計。受注者が課金すると発注者機能が追加で解放され、受注者機能もそのまま使える
- CON系画面（受注者向け）のクエリやアクセス制御で `role = 'contractor'` に限定しないこと。発注者（client）・担当者（staff）もCON系画面を閲覧可能。ただし担当者（staff）は受注者アクション不可（応募ボタン非表示、CON-004/CON-011〜016はMiddlewareでブロック）
- Middleware で CON系画面へのアクセスをcontractorのみに制限しないこと
- 発注者は応募制限なし（無料ユーザーの「登録職種×登録県」制限は適用されない）
- **禁止パターン（以下のコードパターンは絶対に書いてはならない）**:
  - `if (role === 'contractor')` で CON系画面の表示内容を分岐する
  - `if (role === 'client')` で CON-002 に発注者専用UIを表示する
  - `WHERE users.role = 'contractor'` で案件一覧のデータ取得を制限する
  - Middleware で `/con/*` パスを `contractor` ロールのみに制限する
- **正しい実装パターン**:
  - CON-002（募集案件一覧）: 全ロールで同一UI、同一データ、同一レイアウト
  - CON-002 のカードリンク: 全ロールで `/jobs/${job.id}`（パラメータなし）→ CON-003 に遷移
  - CON-003（応募ボタン）: 案件オーナーまたは同一組織メンバーの場合は応募ボタン非表示（自分の案件に応募する意味がないため）。担当者（staff）の場合も応募ボタン非表示（受注者アクション不可のため）。それ以外の場合、無料ユーザーのみ職種×エリアの合致チェックで非活性化。有料ユーザー（発注者含む）は常に活性
  - 発注者が CON-002 → CON-003 で他社の案件にアクセスした場合の動作は、有料の受注者と完全に同一
  - CLI-001 のカードリンク: `/jobs/${job.id}?manage=true` → CLI-002（管理画面）に遷移
  - /jobs/[id] の表示分岐: `(isOwner || isSameOrganization) && searchParams.manage === 'true'` のときのみ CLI-002。それ以外は CON-003
  - Middleware: CON系画面は認証済み全ロールに閲覧開放。ただしCON-004（応募入力）、CON-011〜013（応募履歴）、CON-014〜016（空き日程）は担当者（staff）をブロック。CLI系（CLI-026〜027を除く）は発注者・担当者のみ
  - 発注者マイページ: 「仕事を探す」セクション（CON系画面への導線）を非表示にしてはならない。CON-002 への導線は「仕事を探す」セクションで提供する（「発注先を探す」セクションには含めない）

### CLI-005/006 の表示対象（必ず守ること — 「1アカウントで受注・発注両方OK」設計の正しい反映）
- CLI-005（職人一覧）の検索クエリで `role = 'contractor'` 単独で絞ってはならない。`role IN ('contractor', 'client')` + `id != 自分自身` + `deleted_at IS NULL` の AND 条件で絞ること
- 設計理由: 個人発注者・小規模・法人 Owner（`role = 'client'`）も自分自身で会員登録した正規ユーザーであり、受注者として活動しうる。`role = 'contractor'` 単独で絞ると、これらのユーザーが永遠に検索されない
- 法人の admin/staff（`role = 'staff'`）は Owner が招待した代理アカウントで契約主体ではないため除外する
- CLI-006（職人詳細）も同条件のガードを入れる:
  - `id === user.id` なら `notFound()`（自分の詳細ページは無意味）
  - 対象ユーザーの `role` が `'contractor'`/`'client'` 以外（staff/admin）なら `notFound()`
- **`user_skills` 1 件以上のチェックは入れないこと**: 正規ルート（`/register/profile`）の `registerProfileSchema` が `skills.min(1)` を必須化しているため、自分で会員登録した全ユーザーは必ず skills を持つ。DB レベルで追加チェックを入れるのは「ありえないシナリオに備えた過剰防御」（YAGNI）。同じ理由で `user_available_areas` のチェックも不要
- **seed.sql は正規ルートを経たデータと整合させること**: 直接 INSERT で「skills や available_areas が空の client/contractor」を作ってはならない。これを seed に入れると「ありえない状態」を本物のデータと誤認し、不要な防御コードを書く動機になる（2026-04-22 に実例: B案として `user_skills!inner` フィルタを追加→ユーザー指摘で A案に巻き戻し）
- 実装基準: `src/app/(authenticated)/users/contractors/page.tsx`（CLI-005）、`src/app/(authenticated)/users/contractors/[id]/page.tsx`（CLI-006）
- E2E 検証: `e2e/job-search.spec.ts` の「CLI-005 表示対象」「CLI-006 アクセス制御」describe ブロック
- Middleware は変更しない（`/users/contractors` は `client`/`staff` のみアクセス可、無料 contractor からは見られない現状維持）

### 応募ステータスの画面分離（必ず守ること — CLI-007 / CLI-007B / CLI-010 の役割）
- mypage からの発注者導線は **status で画面が分離**されている:
  - **CLI-007（`/applications/received`）= `status = 'applied'` のみ**（未対応インボックス）
  - **CLI-010（`/applications/orders`）= `status ≠ 'applied'`**（発注可否決定以降の管理ダッシュボード）
  - 同じ応募が両画面に重複表示されることはない
- 案件単位で**全ステータスを俯瞰**したい場合は **CLI-007B（`/jobs/[id]/applicants`）** を使う（CLI-002 からの導線、案件スコープ）
- WHERE 句レベルの分離ルール:
  - CLI-007: `.eq("status", "applied")` を必ず付与
  - CLI-010: `.in("status", ["accepted","completed","lost","cancelled","rejected"])` で applied を除外
  - CLI-007B: status 制限なし（全ステータス表示）
- **新しい `applications.status` 値を追加する場合**、CLI-007 / CLI-010 どちら側に含めるかを明記すること:
  - 未決状態（発注者の判断待ち）→ CLI-007 側
  - 決着後 → CLI-010 側 + CLI-007B 側（CLI-007B は全ステータスなので自動的に含まれる）
- **StatusFilter / SortButton は共有コンポーネント**（`src/app/(authenticated)/applications/orders/`）。`basePath` と `includeApplied` props で mypage CLI-010 と CLI-007B の挙動差を吸収する。mypage CLI-010 では `includeApplied={false}`、CLI-007B では `includeApplied={true}`
- **CLI-007B の認可**は Middleware ではなくページ内 `notFound()` で実施（`/jobs/[id]` は CON-003 と共用パスのため Middleware で一律ブロックできない）。`isOwner || isOrganizationMember` でない場合は 404
- CLI-002 の「応募者をみる」ボタンは **必ず `/jobs/[id]/applicants` に向ける**こと（過去の `/applications/manage?jobId=xxx` は壊れリンクで廃止済み）
- 詳細仕様: `.kiro/specs/matching/requirements.md` REQ-MT-004 / REQ-MT-004B / REQ-MT-007

### 担当者（staff）の受注者アクション制限（必ず守ること）
- `isPaidUser` の判定に `userData.role === "staff"` を含めてはならない。staff は CON 系画面を閲覧できるが、受注者としてのアクション（応募・空き日程管理等）は不可
- 受注者アクション系の Server Action（applyJobAction 等）のロールチェックに `'staff'` を含めないこと。許可ロールは `'contractor'` と `'client'` のみ
- CON-003 の応募ボタン表示条件には `role === 'staff'` による非表示チェックを必ず含めること
- 新しい受注者アクション（応募・評価・完了報告等）を実装する際は、staff がそのアクションを実行できないことを三重防御（Middleware + UI + Server Action）で確認すること
- `users.role = 'staff'` は `org_role` の値（admin / staff）に関係なく同じ制限が適用される。org_role による違いは CLI 系画面内の操作権限（担当者管理等）のみ

### 「対応できる職種」と「保有スキル」の使い分け（必ず守ること）
- **対応できる職種**（`user_skills.trade_type`）= `TRADE_TYPES` 固定リストからの選択値（大工・塗装・電気 等）。1ユーザー最大3件
- **保有スキル**（`users.skill_tags text[]`）= 自由入力タグ（型枠設置・外壁塗装・送配電線工 等）。件数制限なし
- この2つは意味論が異なる。受注者詳細（CLI-006）や応募詳細（applications/received・orders）で **`trade_type` を「保有スキル」ラベルで表示してはならない**。`users.skill_tags` を参照すること
- 2026-04-22 実例: COM-001/002 で保有スキル欄が欠落していた。それに合わせて CLI-006 / applications 詳細画面でも `skills.map((s) => s.trade_type).join("、")` を「保有スキル」として表示する hack が入っていたため、`users.skill_tags` に一本化
- 新しく「保有スキル」を表示する画面を作る際は必ず `users.skill_tags` を SELECT すること。user_skills から引かないこと

### 名前表示・姓名結合のルール
- 日本語の姓名結合は**スペースなし**で行うこと（`${lastName}${firstName}`）。`${lastName} ${firstName}` のようにスペースを入れると、既存の表示パターンと不一致になりテストが失敗する
- **すべての UI で発注者表示名の解決は `resolveParticipantName()` を使うこと**。メッセージ UI・メール通知に限らず、発注者一覧・案件カード・マイページ完了案件・お気に入り等、ユーザー名を表示するすべての場所で統一する
- **優先順位（新方針）**: `client_profiles.display_name`（CLI-021 で入力した社名・氏名）→ `users.last_name + first_name`（フォールバック）
- **旧方式（廃止）**: `organizations.name` → `users.company_name` → 氏名 の 3 段階解決は廃止。`organizations.name` カラム自体を削除済み。`users.company_name` は受注者プロフィール（COM-002）用であり、発注者表示名には使わない
- **法人プラン Staff の名前解決**: Staff は `client_profiles` を持たないため、所属組織の Owner の `client_profiles.display_name` を使う（Staff → `organization_members` → `organizations.owner_id` → `client_profiles`）
- **旧ヘルパーの廃止**: `src/lib/utils/resolve-org-names.ts` の `getActiveCorporateOrgNames()` は廃止する。`client_profiles` は公開 SELECT（RLS で全ユーザー閲覧可）のため、admin client を使わなくても他ユーザーの表示名を取得できる
- 名前解決ルールの詳細は `.kiro/steering/database-schema.md` の「発注者表示名のルール」セクションを参照
- 表示ロジックを変更すると、**データは変わらなくても画面の表示が変わる**ため、既存テストの期待値更新が必要になる。表示ロジック変更時は関連する E2E テストを必ず確認・更新すること
- メール通知の sender/recipient 名はハードコードしない。`resolveParticipantName()` で動的に解決すること

### 発注者プロフィールのデータ管理（必ず守ること）
- 受注者に見える発注者情報は **`client_profiles` テーブルに一元化**されている。CLI-021（発注者情報編集）が唯一の編集画面
- ダウングレード/解約時も `client_profiles` レコードは削除しない（再アップグレードでの再利用のため）
- プラン状態による表示切り替えは不要（どのプランでも `client_profiles.display_name` がそのまま使われる）

### 組織テーブルの RLS と admin client
- `organizations` / `organization_members` テーブルには `is_same_org` RLS が効いており、**他組織のメンバーから組織構造は SELECT できない**。nested join で embed した場合もサイレントに null になる（気づきにくい）
- ただし **発注者表示名の取得に `organizations` テーブルは使わない**（`client_profiles.display_name` に一本化済み）。`client_profiles` は公開 SELECT なので admin client 不要
- `organizations` テーブルへの admin client アクセスが必要になるのは、組織メンバーの権限判定（Server Action 内）等のケースに限定される

### 組織メンバー判定のパターン（必ず守ること）
- 法人プラン機能で「特定案件に対する権限判定」を行う際、`owner_id === user.id` だけで判定してはならない。組織メンバーが作成した案件も、オーナーが操作できる必要がある
- 正しいパターン:
  1. `owner_id === user.id` を最初にチェック（個人プランや自分の案件）
  2. それがだめなら `organization_members` を参照して `user.id` と `job.organization_id` の関係を確認
  3. どちらも満たさない場合のみ拒否
- **UI のプルダウン/一覧の表示範囲と Server Action の許可範囲は必ず一致させる**こと。プルダウンに出るのに Server Action で拒否される、もしくはその逆は UX 破綻になる。急募オプションで実際に発生した（プルダウンは組織全体、Server Action は owner_id のみで、スタッフ作成案件が選べても購入できなかった）

### Webhook タイミング対策（必ず守ること）
- Stripe Server Action（`stripe.subscriptions.update()` 等）の直後に Webhook 由来の DB 状態へ依存する画面遷移を行う場合、**Webhook 到着前にアクセスされて race condition が発生する**
- 対策: Server Action 内で、Stripe 呼び出し成功後に UI 遷移先のガードチェックに必要な DB 更新を**同期的に先行実行**する
  - 例: 法人プランへのアップグレード時、`stripe.subscriptions.update()` の直後に `subscriptions.plan_type` を先行 UPDATE し、`ensure_organization_exists` を先行 RPC で呼ぶ
  - Webhook（`handle_subscription_lifecycle_updated`）で同じ更新が再実行されるが、冪等な操作なので二重実行しても安全
- 該当 Webhook ハンドラのロジックはできるだけ冪等に保つ。Server Action の先行更新とぶつかっても問題ないように設計する

### Next.js Router Cache とリダイレクトキャッシュ（必ず守ること）
- Next.js の App Router は Server Component のレスポンス（redirect 含む）をクライアント側 Router Cache に保持することがある
- DB 状態が変化してから同一 URL に遷移する場合、古い redirect 結果が使われて**意図しないページに飛ばされる**ことがある（例: 組織名入力画面への遷移で `/mypage` に即リダイレクトされ続ける）
- 対策: 状態変化後にクライアント遷移させる場合は `router.push()` ではなく **`window.location.href`** でハードナビゲーションする。新しい HTTP リクエストになるので Router Cache を回避できる
- `router.refresh()` ではこの問題を回避できない場合がある（redirect は別リソースとしてキャッシュされる）

### Zod UUID バリデーションと seed データ
- Zod v4 の `z.string().uuid()` は RFC 4122 準拠の厳密検証（variant bits まで検査）。**seed.sql の手書きダミー UUID（`66666666-6666-6666-6666-666666666666` 等）は非準拠で弾かれる**
- 現在 `src/app/(authenticated)/billing/actions.ts` の `urgentOptionInputSchema.jobId` は暫定対応として `UUID_LIKE_REGEX` に緩和中（`TODO(restore-strict-uuid):` コメント付き）。本番投入前に戻すか、seed データを RFC 準拠に書き換えること
- 新しい Server Action で UUID バリデーションを追加する際は、seed を使った手動テストで弾かれないか事前確認すること。弾かれる場合、同様の正規表現緩和 + TODO コメントで対応

### メールテンプレートの使用確認
- メールテンプレートファイル（`src/lib/email/templates/`）を作成したら、対応する Server Action で**実際に使われているか**確認すること。テンプレートが存在するのにインライン HTML で送信しているコードが過去に発見された（`scoutNotificationEmail` テンプレートが未使用だった）
- メール通知の sender/recipient 名はハードコードしない。`resolveParticipantName()` で動的に解決すること（過去に `clientName: "発注者"` とハードコードされていた問題が発生）

### UI テキスト・ラベル（必ず守ること）
- お気に入りボタンのラベルは「マイリスト登録」/「マイリスト解除」を使うこと（「興味する」等の不自然な日本語は禁止）
- UIテキストは自然な日本語であることを確認すること。機械的な翻訳調の表現は使わない

### ナビゲーション・画面遷移（必ず守ること）
- 全画面に「戻る」ボタンを設置すること。遷移先は `router.back()` を使用しブラウザ履歴に基づかせる（ハードコードされた遷移先パスは原則禁止）
- ナビゲーションメニュー（ヘッダー、マイページ）のリンク先URLと実際のページファイルパスが一致していることを必ず確認すること。404の原因になる
- **BackButton の `href` 明示の例外パターン**: Save Server Action の redirect で `window.location.href` / `router.push` によって親画面へ戻るフローがある場合、**履歴に edit 画面のエントリが残ったまま**になり、親画面で `router.back()` すると edit に戻ってしまうループが発生する。ツリー構造で親が固定している画面（CLI-020 / CLI-022 / CLI-023 等）は `<BackButton href="/mypage" />` のように明示して対処する。対応画面と理由は `src/components/shared/back-button.tsx` のコメント参照。2026-04 実例: CLI-021 保存 → CLI-020 戻る → /edit に戻ってループ発生

### 検索ポップアップ・フィルター
- 検索条件ポップアップを実装する際は、対応するデザインカンプ（`*-popup-a.png`、`*-popup-b.png` 等）を必ず参照し、フィルター項目・レイアウトを合わせること
- 検索ポップアップには「✕」閉じるボタンを設置し、検索実行後は自動で閉じること
- 配列型カラム（text[]）に対するフィルター検索は、完全一致（`=`）ではなく配列の重複チェック（`&&` 演算子）を使うこと。これにより、複数の値を持つレコードに対して OR条件の検索が正しく動作する
- 例: `WHERE recruit_area && ARRAY['神奈川県']::text[]` は、recruit_area に '神奈川県' を含むすべてのレコードをヒットさせる
- text型カラムに複数値をカンマ区切りで保存し LIKE で検索する実装は禁止（配列型を使うこと）
- **Supabase JS（PostgREST）で配列フィルターを使う場合の注意**: `.overlaps()` でリレーション先の配列カラムをフィルターする場合、デフォルトのジョインでは親行のフィルタリングが効かないことがある。リレーション先の条件で親行を絞り込むには `!inner` ジョインを使うこと（例: `.select('*, client_profiles!inner(*)').overlaps('client_profiles.recruit_area', ['神奈川県'])`）

### seed データ（テストデータ）
- 各ロール（受注者無料・発注者課金済み・管理者）でのテストが可能なようにデータを用意すること
- 受注者（無料）: 登録職種・登録県と合致する案件を必ず含めること（応募フローのテスト用）。合致しない案件も含めること（応募制限の動作確認用）
- 発注者（課金済み）: 受注者機能も利用可能（制限なしで案件検索・応募）。発注者機能（案件掲載・職人検索・スカウト等）もテスト可能なデータを用意すること
- テストユーザーごとに user_skills, user_available_areas, subscriptions のデータを整合させること