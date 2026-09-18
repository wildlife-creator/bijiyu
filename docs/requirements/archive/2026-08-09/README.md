# 2026-08〜09 改修の記録（アーカイブ）

このフォルダは、2026-08〜09 に行った改修（旧 P1〜P12、ステージング指摘対応）の**経緯と当時の設計判断**を残すためのものです。
**現在の仕様は `docs/requirements/current-spec.md` が正**で、ここの文書は歴史的記録として参照するだけにしてください（ここに書かれた仕様のうち、後の改修で変わったものがあります）。

| ファイル | 内容 | 補足 |
|---|---|---|
| `spec-changes-202608.md` | 改修全体の整理（P1〜P9 の決定事項・変更内容・着手順） | 銀行振込（P2）と代理登録（P9）はのちに P12 で作り替え |
| `p4-video-implementation-notes.md` | 動画基盤（`videos` テーブル・Cloudflare Stream・ADM-027） | 現行: current-spec §5 |
| `p5-ops-account-implementation-notes.md` | 管理運営アカウント | 設定画面はのちに廃止（開発側が SQL で設定） |
| `p6-list-sorting-implementation-notes.md` | 一覧のプラン順ランクと並び替えプルダウン | 現行: current-spec §8 |
| `p7-video-shooting-option-implementation-notes.md` | ユーザー撮影プラン（現 ユーザー撮影動画制作プラン） | 現行: current-spec §3 |
| `p8-compensation-withdrawal-implementation-notes.md` | 補償オプションの販売停止と報酬未払い窓口 | 現行: current-spec §3 |
| `p9-bank-transfer-lowkey-implementation-notes.md` | 銀行振込の本人申込ボタン非表示と代理登録 | P12 で廃止 |
| `p12-bank-transfer-onoff-implementation-notes.md` | 銀行振込を「お問い合わせ → 運営がオン／オフ」に作り替え | 現行: current-spec §2.2。ADM-004 の枠と直リンクはのちに削除 |
| `p12-bank-transfer-story-test.md` | 銀行振込の目視テスト手順 | — |
| `video-plans-handoff-202609.md` | 動画プランの整理（P10）と価格改定・比較表（P11）の引き継ぎ | 現行: current-spec §1・§3。旧 `video_workplace` はのちにキーごと削除 |
| `video-display-size-request-202609.md` | 会員向け動画表示枠の 9:16 統一の依頼 | 対応済み |
| `staging-check-investigation-202609.md` | ステージング確認シートの指摘の調査依頼 | — |
| `staging-check-investigation-result-202609.md` | 同 調査結果 | — |
| `staging-check-db-findings-202609.md` | 同 DB 実データの確認結果 | — |
| `staging-check-fix-request-202609.md` | 同 修正依頼書 | — |
| `staging-check-fix-plan-202609.md` | 同 修正方針と実装結果（末尾） | 現行: current-spec §9 |
| `staging-check-queries-202609.sql` | 同 確認用 SQL | — |

P1（プラン名変更）・P3（年払い）・P10（動画プラン整理）・P11（価格改定）の記録は `spec-changes-202608.md` と `video-plans-handoff-202609.md` に含まれています。

クライアント向けの説明資料（`changes-summary-202609.md` / `changes-status-for-client-202609.md` / `spec-additions-notice-for-client-202609.md`）と、ステージング反映の手順書（`staging-release-checklist-202609.md` / `staging-release-session-handoff-202609.md`）は今も使うため `docs/requirements/` 直下に置いています。
