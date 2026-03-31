# デザインシステム — ビジ友

## デザイン原則
- モバイルファースト（スマホ版 PNG を基準に実装）
- 親しみやすさ（建設業の職人が日常的に使えるUI）
- shadcn/ui をベースにした統一的なコンポーネント

## カラーパレット

Figma CSS から抽出した実測値。具体的な色コードは globals.css（@theme inline + CSS変数）に定義済み。

| トークン名 | 色コード | CSS変数 | 用途 |
|-----------|---------|---------|------|
| primary | #920783 | `--primary` | CTA ボタン背景、アクセント要素（ブライトパープル） |
| secondary | #601986 | `--secondary` | テキストアクセント、ボーダー（ダークパープル） |

> **CSS変数の割り当て理由**: shadcn/ui の Button `default` variant は `bg-primary` を使う。CTAボタン色（#920783）を `--primary` に、テキストアクセント色（#601986）を `--secondary` に割り当てることで、`<Button>` がそのまま正しい色で表示される。テキスト見出しには `text-secondary` を使用する。

| トークン名 | 色コード | CSS変数 | 用途 |
|-----------|---------|---------|------|
| background | #FFFFFF | `--background` | ページ背景 |
| foreground | #1E1E1E | メインテキスト（チャコール） |
| muted | #F4F4F4 | 薄い背景、非アクティブ領域 |
| muted-foreground | #9E9E9E | 補足情報、プレースホルダー |
| accent | #DFF0F2 | ライトシアン背景 |
| destructive | #C30D23 | エラー・アラート |
| border | #D9D9D9 | 境界線・区切り線 |

### ビジ友固有カラー（shadcn/ui 標準スロット外）

| トークン名 | 色コード | 用途 |
|-----------|---------|------|
| bijiyu-lavender | #F0E2EF | メッセージ送信バブル背景（ピンク系） |
| bijiyu-gray | #333333 | セカンダリテキスト |
| bijiyu-purple-60 | rgba(96,25,134,0.6) | ホバー・アクティブ状態 |
| bijiyu-purple-08 | rgba(146,7,131,0.08) | 薄パープル背景 |

## タイポグラフィ

- メインフォント: **Zen Kaku Gothic New**（日本語）, system-ui, sans-serif
  - Figma CSS 全476箇所で使用されているブランドフォント
- フォントウェイト: 500（本文）/ 700（見出し・CTA）
- 文字間隔: 0.04em（本文）/ 0.02em（見出し）

### サイズ体系（Figma CSS 実測値）

| トークン | サイズ | 用途 | 使用頻度 |
|---------|-------|------|---------|
| body-xs | 11px | 極小テキスト | 13箇所 |
| body-sm | 12px | キャプション | 89箇所 |
| body-md | 13px | 本文（デフォルト） | 121箇所 |
| body-base | 14px | やや大きめ本文 | 82箇所 |
| body-lg | 15px | 強調本文 | 21箇所 |
| heading-sm | 16px | 小見出し | 80箇所 |
| heading-md | 18px | セクション見出し | 23箇所 |
| heading-lg | 20px | ページタイトル | 16箇所 |
| heading-xl | 22px | 大見出し | 7箇所 |
| heading-2xl | 32px | ヒーロー見出し | 3箇所 |

## スペーシング
- セクション間: space-y-8 / gap-8
- カード間: space-y-4 / gap-4
- 具体値は globals.css の @theme inline に定義

## ボーダー

| 値 | 用途 | 使用頻度 |
|----|------|---------|
| 1px | 標準ボーダー | 417箇所 |
| 5px | 強調ボーダー | 62箇所 |
| 2px | 中ボーダー | 25箇所 |

### 角丸

| 値 | 用途 | 使用頻度 |
|----|------|---------|
| 8px | カード・コンテナ（基準値） | 56箇所 |
| 3px | 微角丸 | 83箇所 |
| 47px | ピル型ボタン | 60箇所 |
| 33px | 小ピル | 9箇所 |

## コンポーネント方針
- shadcn/ui コンポーネントを優先使用
- カスタマイズは Tailwind CSS のユーティリティクラスで行う
- 独自CSSファイルやインラインスタイルは作成しない
- ピル型ボタン（border-radius: 47px）はビジ友のブランド要素

## レスポンシブ戦略
- スマホ版がデフォルト → md: (768px以上) でPC対応
- PC版の Figma PNG は存在しない（AIが判断）
- 詳細なレスポンシブルールは design-rule.md に定義

## トークンの参照ルール
- 基本: globals.css の @theme inline トークンに従う
- デザイン要件CSS がある画面: CSS値を優先
- 判定方法: screen-map.md の「CSS」列を参照

## トークン管理の3層構造

```
【方針層】 steering/design-system.md（本ファイル）
  └ デザイン原則、色の意図、タイポグラフィ方針
  └ 「なぜこの色か」「なぜこのフォントか」の判断基準
       ↓ 具体化
【定義層】 src/app/globals.css（@theme inline + CSS変数）
  └ 具体的なトークン値（色コード、px値）
  └ design-assets/specs/ のCSSから抽出した共通値
  └ ※ Tailwind v4: tailwind.config.ts は不要。CSSベースで設定
       ↓ 参照
【実装指示層】 steering/design-rule.md
  └ 各フェーズでAIが従う実装ルール
  └ トークンに従え、CSSがあればCSSを優先、の判断フロー
```
