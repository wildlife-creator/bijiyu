# design-rule.md — Tailwind 実装ルール（ビジ友）

## 概要

このファイルは、AIが画面を実装する際に従うべきTailwindクラスの使い方ルール。
design-system.md が「方針（なぜ）」を定義するのに対し、本ファイルは「実装（どう書くか）」を定義する。

## カラートークンの使い方

### 基本ルール
- 色は `globals.css` の `@theme inline` ブロックに定義されたトークン名で指定する（Tailwind v4: JS設定ファイルではなくCSSでトークンを定義）
- 直接の色コード指定（`bg-[#3B82F6]` 等）は原則禁止
- Figma デザイン CSS がある画面は、CSS の値を優先する

### トークン対応表

| 用途 | クラス例 | 説明 |
|------|---------|------|
| CTAボタン背景 | `bg-primary` | メインアクション（応募する、送信する等） |
| CTAボタンテキスト | `text-primary-foreground` | CTAボタン上の文字色 |
| サブボタン背景 | `bg-secondary` | サブアクション（キャンセル、戻る等） |
| ページ背景 | `bg-background` | 全ページの背景 |
| 本文テキスト | `text-foreground` | 通常のテキスト |
| 薄いテキスト | `text-muted-foreground` | 補足情報、プレースホルダー |
| 境界線 | `border-border` | カード、入力欄の枠線 |
| エラー | `text-destructive` | エラーメッセージ、削除ボタン |
| エラー背景 | `bg-destructive` | エラーバッジ、削除ボタン背景 |
| 成功 | `text-green-600` | 承認済みバッジ等 ※ 将来的に `--color-success` トークンを globals.css に追加予定。追加後は `text-success` に変更すること |

### 判断フロー
```
1. screen-map.md の CSS 列にファイルがあるか？
   → あり: CSS の値を最優先で使う
   → なし: 次へ

2. globals.css の @theme inline にトークンが定義されているか？
   → あり: トークンを使う
   → なし: Tailwind デフォルトクラスを使う（後でトークン化を検討）
```

## タイポグラフィ

### フォント指定
```
font-sans → 'Zen Kaku Gothic New', system-ui, sans-serif（globals.css @theme inline で設定済み）
```

### テキストサイズの使い分け

| 用途 | クラス | 目安 |
|------|-------|------|
| ページタイトル | `text-heading-lg font-bold` | h1 相当 |
| セクション見出し | `text-heading-md font-bold` | h2 相当 |
| カードタイトル | `text-body-lg font-semibold` | h3 相当 |
| 本文 | `text-body-md` | 通常テキスト |
| 補足・キャプション | `text-body-sm text-muted-foreground` | 小さな補足情報 |

※ カスタムサイズは globals.css の @theme inline に Figma CSS 実測値で定義済み。
※ line-height: 140%、letter-spacing: 0.04em（本文）/ 0.02em（見出し）がデフォルト。

## スペーシング

### セクション間隔

| 用途 | クラス |
|------|-------|
| ページ内のセクション間 | `space-y-8` or `gap-8` |
| カード間 | `space-y-4` or `gap-4` |
| フォーム項目間 | `space-y-4` |
| ボタン間（横並び） | `gap-3` |
| テキストとサブテキスト間 | `space-y-1` |

### パディング

| 用途 | クラス |
|------|-------|
| ページ全体 | `px-4 py-6`（モバイル）/ `md:px-8 md:py-8`（PC） |
| カード内 | `p-4`（モバイル）/ `md:p-6`（PC） |
| ボタン | shadcn/ui のデフォルトを使用 |

## レスポンシブ

### 基本原則
- **モバイルファースト**: クラスは何もつけない状態がモバイル
- **PC対応**: `md:` プレフィックス（768px以上）で上書き
- PC版デザインデータは存在しないため、AIが適切に判断する

### レイアウトパターン

| パターン | モバイル | PC（md:以上） |
|---------|---------|--------------|
| メインレイアウト | `flex flex-col` | `md:flex-row` |
| カード一覧 | `grid grid-cols-1` | `md:grid-cols-2 lg:grid-cols-3` |
| フォーム | `w-full` | `md:max-w-lg md:mx-auto` |
| サイドバー | 非表示 or ハンバーガー | `md:block md:w-64` |
| テーブル | カード形式に変換 | `md:table` でテーブル表示 |

### カードグリッドパターン（案件一覧系）

案件（募集案件）がリスト形式で並ぶ画面には、
CON-002-design-sp.png / CON-002-design-pc.png を
テンプレートとしたカードグリッドレイアウトを適用する。

#### 対象画面
| 画面ID | 画面名 |
|--------|--------|
| CON-002 | 募集案件一覧 |
| CLI-001 | 募集現場一覧 |
| CON-007 | マイリスト（お気に入り案件タブ） |
| CON-011 | 応募履歴一覧 |
| CLI-007 | 応募一覧 |
| CLI-010 | 発注履歴一覧 |

#### レイアウト
- SP: grid grid-cols-1 gap-8
- PC: md:grid-cols-2 lg:grid-cols-3 gap-8
- ページ左右余白: px-6（SP）/ md:px-12（PC）
- ページ背景: bg-muted（薄いグレー #F4F4F4）

#### カード構造
- shadcn/ui Card + rounded-[8px]
- カード上部: 画像サムネイル（1枚目、なければプレースホルダー）
- 画像左上: ステータスバッジ absolute 配置（rounded-[33px]）
- カード下部: タイトル、会社名、職種、報酬、エリア、募集期間
- アイコンは assets/icons/ のプロジェクト専用アイコンを使用

#### 判断基準
上記リストにない画面でも、案件データが一覧表示される画面では同じパターンを適用する。

### ブレークポイント
```
デフォルト: 0px〜（モバイル）
md: 768px〜（タブレット・PC）
lg: 1024px〜（ワイドPC、必要な場合のみ）
```

## コンポーネント実装ルール

### shadcn/ui の使い方
- `Button`, `Input`, `Select`, `Dialog`, `Card`, `Badge`, `Table` 等は shadcn/ui を使う
- カスタマイズは `className` プロパティで Tailwind クラスを追加する
- shadcn/ui にないコンポーネントのみ自作する

### ボタンのバリエーション

| 用途 | shadcn/ui variant | 補足 |
|------|-------------------|------|
| CTA（応募、送信等） | `default` | `bg-primary` |
| サブアクション（キャンセル等） | `outline` | 枠線のみ |
| 削除・退会 | `destructive` | 赤系 |
| リンクスタイル | `link` | テキストのみ |
| アイコンボタン | `ghost` + `size="icon"` | ♡ボタン等 |

### フォーム

```tsx
// フォームの基本構成
<form>
  <div className="space-y-4">
    <div className="space-y-1">
      <Label>ラベル</Label>
      <Input placeholder="プレースホルダー" />
      {error && <p className="text-body-sm text-destructive">{error}</p>}
    </div>
    {/* ...繰り返し... */}
    <Button type="submit" className="w-full">送信する</Button>
  </div>
</form>
```

### カード

```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-body-lg">タイトル</CardTitle>
    <CardDescription className="text-body-sm text-muted-foreground">説明</CardDescription>
  </CardHeader>
  <CardContent>
    {/* 内容 */}
  </CardContent>
</Card>
```

### バッジ（ステータス表示）

| ステータス | variant | 例 |
|-----------|---------|-----|
| 承認済み / 完了 | `default`（緑系にカスタム） | 本人確認済み |
| 申請中 / 進行中 | `secondary` | 審査中 |
| 否認 / エラー | `destructive` | 否認 |

### テーブル（管理画面）

```tsx
// モバイル: カード一覧、PC: テーブル
<div className="md:hidden space-y-4">
  {/* カード形式 */}
</div>
<div className="hidden md:block">
  <Table>
    {/* テーブル形式 */}
  </Table>
</div>
```

### ページネーション
- 20件ずつ表示（仕様通り）
- shadcn/ui の Pagination コンポーネントを使用

## 画像・アイコン

### アバター画像
- `rounded-full` で丸く切り抜く
- サイズ: `w-10 h-10`（一覧）/ `w-20 h-20`（プロフィール）
- `<img>` タグで表示する（Supabase Storage からの画像は `<img>` を使う — CLAUDE.md の実装チェック項目を参照）

### アイコン
- `assets/icons/` 内のプロジェクト専用アイコン PNG を優先的に使用する
- 実装時は `public/icons/` にコピーして配置し、`<img src="/icons/icon-briefcase.png" alt="" className="w-5 h-5" />` のように `<img>` タグで表示する
- サイズ: `w-4 h-4`（インライン）/ `w-5 h-5`（ボタン内）
- メニューリスト項目（ナビゲーションリンク）にはアイコンを付けない。テキスト + 右矢印のみで構成する
- `assets/icons/` に該当するアイコンがない場合のみ Lucide React を使用する
- アイコン一覧は CLAUDE.md の「アイコン・ロゴの使用」セクションを参照

### ロゴ
- 横型（ヘッダー用）: `<img src="/images/logo-horizontal.png" alt="ビジ友" className="h-[61px] w-auto" />`
- 縦型（ランディング・認証画面用）: `<img src="/images/logo-vertical.png" alt="ビジ友" />`
- `next/image` の `<Image>` は使わず `<img>` タグで統一する（CLAUDE.md の実装チェック項目と整合させるため）

## cc-sdd フェーズ別指示

### spec-design フェーズ

requirements.md の画面要件を読んだら、以下を行うこと：

1. `reference/png-mapping.md` で対象画面の PNG ファイル名を特定する
2. `design-assets/screens/` 内の対応する PNG ファイルを確認し、レイアウト構造と要素配置を読み取る
3. design.md に以下を記載すること：
   - PNGから読み取ったレイアウト構造と要素配置
   - 使用するshadcn/uiコンポーネント名
   - PC版でのレスポンシブ変更点

PNGが `png-mapping.md` で「なし」の場合は、requirements.md の記載内容と既存の実装済みページのパターンに基づいて判断すること。

### spec-impl フェーズ

実装を開始する前に、以下を行うこと：

1. `reference/png-mapping.md` で対象画面の PNG ファイル名を特定する
2. `design-assets/screens/` 内の対応する PNG ファイルを確認する（ワイヤーフレーム + デザインカンプの両方がある場合は両方確認）
3. `screen-map.md` の CSS 列を確認し、デザイン要件 CSS がある場合は `design-assets/specs/` 内の該当 CSS ファイルも確認する

以下のルールで実装すること：
1. PNGはスマホ版デザインである。モバイルファーストで実装する
2. 色・フォント・余白はglobals.css（@theme inline）のカスタムトークンに従う
3. デザイン要件CSSがある場合は、その値を globals.css @theme inline より優先する
4. Tailwind CSSユーティリティクラスを使用する
5. shadcn/uiコンポーネントを優先的に使用する
6. 独自CSSファイルやインラインスタイルは作成しない
7. 下記のレスポンシブルールに従いPC版に対応する

### デザイン要件CSS がある画面の一覧

| 画面ID | ファイル名 |
|--------|-----------|
| CON-002 | CON-002-sp.css / CON-002-pc.css |
| CON-009 | CON-009-sp.css / CON-009-pc.css |
| CLI-006 | CLI-006-sp.css / CLI-006-pc.css |
| CLI-013 | CLI-013-sp.css / CLI-013-pc.css |
| CLI-022 | CLI-022-sp.css（SP のみ） |
| 共通 | template-parts-sp.css / template-parts-pc.css |

## 禁止事項

- `style={}` 属性（インラインスタイル）の使用
- `!important` の使用
- カスタム CSS ファイルの作成（globals.css の変数定義を除く）
- `bg-[#FF0000]` 等の直接色コード指定（トークンが未定義の場合を除く）
- Tailwind の `@apply` の使用
- shadcn/ui にあるコンポーネントの自前再実装
