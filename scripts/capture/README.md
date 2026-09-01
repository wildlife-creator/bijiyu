# ビジ友 画面キャプチャ集の作り方

検収シート「②画面チェック一覧」の別冊となる、全画面キャプチャ集（PDF）を自動生成するツールです。
全97画面のうち94画面を自動撮影します（CON-010=画面内包 / CLI-027=Stripe / ADM-007=同一ページ内ステップ の3つは対象外として、PDFにその旨を記載します）。

## 前提

- 撮影対象の環境で seed のテストユーザー（contractor@test.local など、パスワード testpass123）でログインできること
- ローカルで撮る場合: `supabase start`（seed 投入済み）+ `npm run dev` でアプリが動いていること

## 使い方（2コマンド）

```bash
# 1. 全画面を撮影（PC 1440px / スマホ 390px の2サイズ、フルページ）
node scripts/capture/capture-screens.mjs

# 2. PDF に束ねる（1画面1ページ、画面ID+画面名の見出し、PC/スマホ並置）
node scripts/capture/build-pdf.mjs
```

出力は `scripts/capture/output/` に入ります:

- `png/` … 連番_画面ID_pc/sp.png（Excel等に個別で使いたい場合はこちら）
- `manifest.json` … 撮影結果の記録（ok / no-data / error / skip、リダイレクト検知つき）
- `ビジ友_キャプチャ集.pdf` … クライアントに渡す別冊

## ステージングで撮る場合

```bash
CAPTURE_BASE_URL=https://staging.bijiyuu.net node scripts/capture/capture-screens.mjs
```

※ ステージングのDBに seed テストユーザーとサンプルデータ（案件・応募・メッセージ等）が
入っている必要があります。入っていない場合はローカルで撮影してください
（画面の見た目確認が目的なので、ローカル撮影で十分です）。

## 撮り直し

修正後に特定の画面だけ撮り直す場合:

```bash
CAPTURE_ONLY=CON-003,CLI-002 node scripts/capture/capture-screens.mjs
node scripts/capture/build-pdf.mjs   # PDFは全体を再生成
```

## 注意

- 撮影のみでデータは変更しません（フォーム送信・削除・決済は一切行いません）
- 「詳細」系の画面は一覧の先頭のデータを開いて撮影します。応募や承認待ちなど、
  データが無いと撮れない画面は manifest に `no-data` と記録されます。
  E2Eシード投入後や、検収シナリオ（B1応募・B5本人確認申請など）を一度流した後に
  再実行すると埋まります
- `manifest.json` の `redirected: true` は「指定URLと違う画面に移動した」印です。
  権限やデータ状態によるリダイレクトが原因のことが多いので、撮れた画像を目視確認してください
