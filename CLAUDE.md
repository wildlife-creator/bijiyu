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
| screen-map.md | 全77画面一覧、画面ID |
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
- 全77画面を機能グループごとに実装する
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
| icon-sort.png | ソート矢印（グレー） | 並び替え・スケジュール表示のアイコン |

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
- E2E（Playwright）: 各機能の spec-impl 完了後、その機能の書き込み系操作（保存・アップロード・送信など）をカバーする Playwright テストを作成する
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
- アップロード後の公開 URL 取得には getPublicUrl を使用すること
- **Storage RLS ポリシーとアップロードパスの整合**: `(storage.foldername(name))[1] = auth.uid()::text` のようなRLSポリシーの場合、`.upload(path, file)` の `path` はユーザーIDで始める必要がある（例: `${user.id}/filename.ext`）。バケット名をパスに含めないこと（`.from("bucket")` が既にバケットを指定している）
- **ユーザーアップロード画像の表示**: Supabase Storage から取得した画像を表示する際は `<img>` タグを使うこと。`next/image` の `<Image>` はリモートパターン設定の問題が起きやすく、サーバー再起動が必要になる場合がある

### Server Actions 関連
- Server Action を実装したら、ブラウザから実際に呼び出せることを
  前提としたコードにすること（モックだけで通るコードは不可）
- フォームの onSubmit ハンドラが Server Action を正しく呼び出していることを確認すること
- FormData の組み立て（特にファイル添付）が正しいことを確認すること

### ミドルウェア・認証フロー関連
- パスワードリセットやメール認証など、Supabase Auth のコールバック後にセッションが確立される画面は、ミドルウェアの「認証済みユーザーをauth画面からリダイレクト」ロジックの例外として登録すること（例: `/reset-password/confirm` は認証済みユーザーにもアクセスを許可）
- seed.sql のテストデータは実際の業務フローと整合させること（例: `identity_verified = true` にするなら `identity_verifications` テーブルにも対応する承認済みレコードを用意する）
- **pgTAP テストの UUID は seed.sql と重複させない**: pgTAP テストは `BEGIN; ... ROLLBACK;` で実行されるが、seed データが既に投入されている状態で実行される。テスト内で `INSERT INTO auth.users` する場合、seed.sql で使用済みの UUID と重複すると `duplicate key` エラーになる。テスト専用の UUID を使うこと

### 外部サービス連携
- billing 機能の実装時は Stripe CLI でローカル Webhook 転送を設定し、
  テスト決済後に users.role が 'client' に変わることを手動で確認すること
- Stripe Webhook の署名検証（STRIPE_WEBHOOK_SECRET）が .env.local に設定されていることを確認すること

### 設定ファイル
- 新しい外部ホストから画像を取得する場合は next.config の remotePatterns を必ず更新すること
- 新しい環境変数を追加したら .env.local.example にも追記すること

### E2Eテスト（Playwright）
- 各機能の spec-impl 完了後、その機能の書き込み系操作（保存・アップロード・送信など）をカバーする Playwright テストを作成すること
- 新しい機能の spec-impl 開始時の最初のステップとして `npm run test:e2e` を実行し、既存の全 Playwright テストが通ること（デグレードがないこと）を確認すること
- テスト実行前に `supabase start` + `supabase db reset` + `npm run dev` が必要。seed.sql のテストユーザー（contractor@test.local 等）を使ってテストを書くこと
- テストデータのクリーンアップは不要（次回の `supabase db reset` でリセットされる）
- **E2Eテストの期待値は seed.sql のデータと整合させること**: テストが前提とするユーザー状態（本人確認済み、サブスクリプション有効等）が seed.sql の実際のデータと一致しているか確認する。seed.sql でフラグを変更した場合、そのフラグに依存するE2Eテストも同時に更新すること。原因例: seed.sql で `identity_verified = true` を設定しているのに、E2Eテストが「本人確認バッジが表示されない」ことを期待して失敗した

### デザインカンプとの整合性
- 画面実装の完了前に、`design-assets/screens/` 内の対応する PNG と実装結果を目視比較すること
- 特にチェックすべき点: 要素の配置順序、セクションの分割、カードやボタンのスタイル、余白のバランス
- アイコンが `assets/icons/` のプロジェクト専用アイコンを使用しているか確認すること（lucide-react 等の汎用アイコンになっていないか）
- ロゴが `assets/images/` のプロジェクト専用ロゴを使用しているか確認すること
- ボタンのスタイルが design-rule.md のバリエーション定義（CTA = `bg-primary` ピル型、サブ = `outline` 等）に従っているか確認すること
- カードの角丸が design-system.md の定義（8px = カード、47px = ピル型ボタン）に従っているか確認すること
- 「機能は動くがデザインカンプと見た目が違う」は未完了とみなす

### Vitest モック関連
- Server Action のテストでは、Server Action 自体を vi.mock で差し替えてはならない。Supabase クライアントをモックし、Server Action の内部ロジックが実際に動くテストを書くこと
- テストが通っても「このテストは実際のブラウザ操作で同じ結果になるか？」を自問すること。モックが現実と乖離していないか確認する
- Supabase クライアントのモックでは `{ data, error }` の戻り値形状を正確に再現すること。異常系（error が返るケース）も必ずテストすること