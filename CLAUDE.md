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
- 仕様書（requirements.md）の記述が簡素な場合（例:「表示項目: 応募者名、職種、応募日」のみ）、デザインカンプの見た目を正としてレイアウト・配置・セクション構成・アイコン使い分けを読み取り、仕様書に書かれていない要素もデザインカンプに従って実装すること。仕様書の項目リストは「最低限含む要素」であり、デザインカンプに描かれている要素を省略してよいという意味ではない

### Vitest モック関連
- Server Action のテストでは、Server Action 自体を vi.mock で差し替えてはならない。Supabase クライアントをモックし、Server Action の内部ロジックが実際に動くテストを書くこと
- テストが通っても「このテストは実際のブラウザ操作で同じ結果になるか？」を自問すること。モックが現実と乖離していないか確認する
- Supabase クライアントのモックでは `{ data, error }` の戻り値形状を正確に再現すること。異常系（error が返るケース）も必ずテストすること

### ロール設計と画面アクセス（必ず守ること — 過去に複数回リグレッション発生）
- ビジ友は「1アカウントで受注・発注の両方が可能」な設計。受注者が課金すると発注者機能が追加で解放され、受注者機能もそのまま使える
- CON系画面（受注者向け）のクエリやアクセス制御で `role = 'contractor'` に限定しないこと。発注者（client）・担当者（staff）も CON系画面にアクセス可能
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
  - CON-003（応募ボタン）: 案件オーナーまたは同一組織メンバーの場合は応募ボタン非表示（自分の案件に応募する意味がないため）。それ以外の場合、無料ユーザーのみ職種×エリアの合致チェックで非活性化。有料ユーザー（発注者含む）は常に活性
  - 発注者が CON-002 → CON-003 で他社の案件にアクセスした場合の動作は、有料の受注者と完全に同一
  - CLI-001 のカードリンク: `/jobs/${job.id}?manage=true` → CLI-002（管理画面）に遷移
  - /jobs/[id] の表示分岐: `(isOwner || isSameOrganization) && searchParams.manage === 'true'` のときのみ CLI-002。それ以外は CON-003
  - Middleware: CON系は認証済み全ロールに開放。CLI系（CLI-026〜027を除く）は発注者・担当者のみ
  - 発注者マイページ: 「仕事を探す」セクション（CON系画面への導線）を非表示にしてはならない。CON-002 への導線は「仕事を探す」セクションで提供する（「発注先を探す」セクションには含めない）

### UI テキスト・ラベル（必ず守ること）
- お気に入りボタンのラベルは「マイリスト登録」/「マイリスト解除」を使うこと（「興味する」等の不自然な日本語は禁止）
- UIテキストは自然な日本語であることを確認すること。機械的な翻訳調の表現は使わない

### ナビゲーション・画面遷移（必ず守ること）
- 全画面に「戻る」ボタンを設置すること。遷移先は `router.back()` を使用しブラウザ履歴に基づかせる（ハードコードされた遷移先パスは原則禁止）
- ナビゲーションメニュー（ヘッダー、マイページ）のリンク先URLと実際のページファイルパスが一致していることを必ず確認すること。404の原因になる

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