# Implementation Plan — client-review-completion

> 受注者→発注者評価（client_reviews）の「出口」整備。評価形式は Good/Bad 維持。DB スキーマ・RLS・マイグレーションは変更しない。
> 並列実行可能なタスクには `(P)` を付与（独立ファイル・データ依存なし）。

- [x] 1. 着手前デグレ防止ゲート（既存テスト全実行）
  - `npm run test`（Vitest）/ `supabase test db`（pgTAP）/ `npm run test:e2e`（Playwright）を順に実行し、全てパスすることを確認する
  - 失敗がある場合は原因を調査・修正してから以降の実装に着手する（E2E はログインタイムアウト等の環境フレーキーに注意し、単体再実行で切り分ける）
  - _Requirements: 7.5_

- [x] 2. (P) 評判集計ドメインの新設とユニットテスト
  - client_reviews から特定の被評価者（発注者）の「また受けたい（good）件数」と「合計件数」を算出する集計を、再利用可能なドメイン関数として新設する（純粋関数 + 取得関数の2構成、`lib/rating` の集計様式を踏襲）
  - `total` の正準定義に従う: `rating_again` が good または bad の行数（null 除外）。`goodCount` は good の行数。0以上・`goodCount <= total` を満たす
  - 取得失敗・0件のときは good=0・合計=0 を返し例外を投げない（fail-safe）。引数は被評価者 ID のみ（将来「閲覧者≠被評価者」拡張の余地を残す）
  - 純粋関数を Vitest で検証する: good のみ / good+bad 混在 / 空配列（0,0）/ null 混在（合計から除外）。取得関数は Supabase モックで正常時集計・error 時 {0,0} 縮退を検証する
  - 補足（status_supplement）・コメント（comment）取得は実装しない（保留）
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.3, 7.1_

- [x] 3. (P) CON-013 評価入力フォームの必須表示是正とサムアップ統一
  - 「また仕事を受けたいか」の見出しに、稼働状況と同一体裁の「必須」表示を付与する。「稼働状況の補足」「評価の補足」は必須表示なしの任意項目のまま維持する
  - 送信ボタンの無効化（稼働状況・また受けたいか のいずれか未入力で disabled）とサーバ側 Zod 検証は現状維持し、未入力送信を日本語エラーで拒否することを確認する
  - Good/Bad マークは lucide サムアップを維持（選択中は塗り＋primary 色、未選択は灰色）。各ボタンは `type="button"` 明示・スクリーンリーダー向けラベルを維持する
  - **`aria-label="Good"/"Bad"` は変更しない**（既存 E2E が Good 選択に依存）
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4_

- [x] 4. CLI-020（発注者情報詳細）の評判表示を整える
  - 評判セクションの現状インライン集計（手書き count）を完全撤去し、タスク2の集計関数の `goodCount` / `total` に一本化する（合計件数の定義を集計関数の正準定義1つに揃える）
  - 表示を「また受けたい ＋ lucide サムアップ ＋（goodCount／total件）」に変更する。現状の 👍 絵文字を lucide サムアップに置き換え、入力フォームと見た目を統一する
  - 評価0件のとき「評判はまだありません」を維持する。法人プランは組織 Owner を被評価者として集計する（既存の発注者ID解決ロジックを踏襲）
  - 稼働状況の補足・評価補足コメント・bad 件数は表示しない（保留）
  - 依存: タスク2（集計関数）完了後に着手
  - _Requirements: 2.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1_

- [x] 5. (P) seed に client_reviews テストデータを追加
  - CLI-020 評判表示の検証用に、ある発注者テストユーザーを被評価者とする評価データを seed に追加する（good 複数件 + bad 1件で「good／合計」の分母を検証可能にする）
  - FK 整合を厳守: 既存の accepted/completed 応募行に紐付け、評価者=応募者（受注者）・被評価者=案件オーナー（発注者）。1応募1評価（application_id UNIQUE）を守る
  - 評価0件の発注者も別途確認できるよう、評価を一切持たない発注者ユーザーが seed に存在することを確認する
  - 依存なし（タスク6 の前提データ）
  - _Requirements: 7.4_

- [x] 6. E2E テスト（提出フロー + 評判表示）
  - CON-013 提出: 稼働状況選択 → Good 選択（`getByLabel("Good")`）→ 送信 → 評価済みになる正常系を検証する（既存フローを維持し、必須表示の存在 assert を追加してよい）
  - CLI-020 表示: 評判ありの発注者でログインし「また受けたい（good／合計）」が表示されることを検証する
  - CLI-020 表示（0件）: 評価0件の発注者で「評判はまだありません」が表示されることを検証する
  - 依存: タスク3・4（実装）とタスク5（seed）完了後
  - _Requirements: 7.2, 7.3_

- [x] 7. (P) steering ドキュメント整合
  - `.kiro/steering/screen-map.md` の CLI-020（発注者情報詳細）説明に「評判表示（また受けたい件数: good／合計）」への言及を追加する
  - 「評価コメントの表示・第三者公開は後決め（保留）」である旨を関連 steering（screen-map.md もしくは roles-and-permissions.md）に注記する
  - 依存なし（コード変更と独立）
  - _Requirements: 5.5, 8.1, 8.2, 8.3_

- [x] 8. 仕上げ・非回帰検証・デグレ防止ゲート
  - client_reviews を存在チェックに使う既存5画面（mypage / applications.history(+詳細) / applications.orders(+詳細) / jobs.[id].applicants）と発注者側の二者完了判定が従来通り動作することを確認する（スキーマ・列・rating_again 値を変えていないこと）
  - `client_reviews` の SELECT RLS を緩めていないこと、clients/[id]（受注者が他発注者を見る詳細）が client_reviews を参照していないことを確認する
  - `npm run test` / `supabase test db` / `npm run test:e2e` の3層すべてが既存テストを含めて成功することを確認する
  - _Requirements: 5.2, 5.4, 6.1, 6.2, 6.3, 7.5_
