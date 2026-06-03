# Requirements Document

## Project Description (Input)
機能名: client-review-completion（受注者→発注者評価の出口づくり）

## 背景
建設業マッチングアプリ「ビジ友」。発注者→受注者評価（user_reviews / rating-redesign）は先日7項目★×5に刷新して完成済み。その裏返しである「受注者→発注者評価」（CON-013 作業報告・評価入力 / client_reviews テーブル）は、入力はあるが出口（表示・集計）がほぼ無い半完成状態。今回はこの「出口」を作る。

## 現状（調査済み）
- client_reviews テーブルのカラム: operating_status（稼働状況・必須）/ status_supplement（稼働状況の補足・任意）/ rating_again（また仕事を受けたいか good/bad・実質必須）/ comment（評価の補足・任意）
- 入力画面 CON-013: src/app/(authenticated)/applications/history/[id]/report/contractor-report-form.tsx。保存は src/app/(authenticated)/applications/actions.ts の submitContractorReportAction
- CLI-020（発注者情報詳細）の実体は src/app/(authenticated)/mypage/client-profile/page.tsx。現状は評判セクションで rating_again の good 件数のみを「👍 N」表示している
- 刷新前（rating-redesign 前 / commit b1d211e）の受注者評価フォームの Good/Bad マークは lucide `ThumbsUp` / `ThumbsDown`（選択中は塗り＋primary 色、未選択は灰色の線画）
- 問題点:
  1. rating_again は送信ボタンの有効条件かつ Zod で実質必須なのに、UIに「必須」表示が無い（operating_status には有る）
  2. rating_again は good 件数のみ表示。表示形式を「また受けたい（good件数／合計件数）」に整える必要がある
  3. status_supplement と comment は保存されるだけでどこにも表示されない（今回は表示しない＝保留）
  4. Good アイコンが lucide の ThumbsUp（線画）。刷新前の受注者評価フォームで使っていたサムアップマーク（塗り＋primary）を流用したい

## 今回のスコープ（ユーザー合意済み・2026-06-02 改訂）
1. 評価形式は現状の Good/Bad を維持する（★×5化はしない）
2. CON-013 の「また仕事を受けたいか」に「必須」表示を追加（実質必須なのに表示が無い問題の是正）
3. CLI-020 の評判表示を「また受けたい ＋ サムアップマーク（good件数／合計件数）」形式に整える。bad 件数は表示しない
4. Good マークを、刷新前の受注者評価フォームで使っていたサムアップマークに差し替える
5. 評判の good 件数・合計件数を算出する集計を、テスト可能な1か所の関数に集約する（将来の評判ページの土台）

## 保留事項（今回は実装しない）— 公開の段階設計
評価コメントの公開は「段階0（今回）→ 段階1 → 段階2」の3段階で考える。今回は段階0のみを実装し、段階1・2は後決めとする。データ（status_supplement / comment）は段階0の時点から保存し続けるため、後で段階1・2に進む判断をした際に過去分も含めて表示できる。

- **段階0（今回のスコープ）**: 発注者本人が、自分への「また受けたい（good件数／合計件数）」を CLI-020 で確認できる
- **段階1（保留・拡張可能）**: 発注者本人が、自分への「補足（status_supplement）・評価コメント（comment）」も CLI-020（または専用画面）で確認できる。画面要件が未確定のため今回は実装しない。閲覧者＝被評価者本人なので公開範囲（RLS）の変更は不要
- **段階2（さらに先の課題）**: 受注者（職人＝第三者）が、発注者の評判・コメントを閲覧できる。これは「誰に見せるか」の公開範囲を広げる判断＝ SELECT RLS の緩和が必要であり、段階1とは別レベルの意思決定として後決めとする（CLI-028 相当の他者向け画面の新設もここに含む）
- bad 件数の表示も今回は行わない（good／合計のみ）

## 重要な制約
- 評価形式変更（★化）はしない。client_reviews のスキーマ（カラム・型・制約）は変更しない
- CLAUDE.md のルール（ロール設計、フォーム内ボタンの type 明示、resolveParticipantName での名前解決、アイコンは public/images/icons 優先、テスト3層など）を遵守する

## Introduction

本 spec は、受注者が発注者を評価する機能（CON-013 / `client_reviews`）の「出口」を最小限整備することを目的とする。評価の**入力形式は現行の Good/Bad を維持**し、(a) 入力フォームの「実質必須なのに必須表示が無い」不整合を是正し、(b) Good マークを刷新前の受注者評価フォームのサムアップに差し替え、(c) 発注者が自分の評判（また受けたいと言われた件数）を確認できるよう CLI-020 の評判表示を整える。

評価の補足テキスト（稼働状況の補足・評価補足コメント）は**保存し続けるが、本 spec ではどの画面にも表示しない**。これは「発注者が自社への評価コメントを閲覧する」という未確定の画面要望に対応するための保留であり、将来別 spec で画面・公開範囲を確定させてから実装する。

**スコープ内**:
- CON-013 評価入力フォームの必須表示是正（`rating_again`）
- CON-013 Good/Bad マークの差し替え（刷新前の受注者評価フォームのサムアップを流用）
- 発注者の評判サマリー（good 件数・合計件数）を算出するテスト可能な集計関数の新設
- 自分の発注者プロフィール（CLI-020 / mypage/client-profile）の評判表示を「また受けたい（good／合計）」形式に整える
- 既存の「存在チェック」利用箇所の非回帰確認

**スコープ外（保留・後決め）**:
- 稼働状況の補足（status_supplement）・評価補足コメント（comment）の表示（CLI-020 を含む全画面）
- bad 件数の表示
- 他の受注者が発注者の評判を閲覧する新画面（CLI-028 相当）
- `client_reviews` の SELECT RLS の緩和（公開範囲の拡大）
- 評価形式の★×5化・評価項目追加・client_reviews のスキーマ変更
- 稼働状況6択の意味論・applications.status 連動ロジックの変更（既存維持）

**現状の前提**: `client_reviews` の SELECT RLS は現在「被評価者本人・同一組織メンバー・投稿者本人」のみに許可されている。自分の評判（CLI-020）は表示可能だが、第三者の受注者が他発注者の評判を見るには RLS 緩和が必要であり、それは公開範囲の後決め判断に該当する。本 spec はこの RLS を緩めない。

## Requirements

### Requirement 1: 評価入力フォームの必須表示是正（CON-013）
**Objective:** As a 受注者, I want 「また仕事を受けたいか」が必須であることが入力前に分かるようにしたい, so that 送信ボタンが押せない理由に迷わず、評価を確実に提出できる。

#### Acceptance Criteria
1. The CON-013 評価入力フォーム shall 「また仕事を受けたいか」の見出しに、稼働状況と同一の体裁の「必須」表示を付与する
2. While 「稼働状況」または「また仕事を受けたいか」のいずれかが未入力である, the CON-013 評価入力フォーム shall 送信ボタンを無効化する（現行挙動を維持する）
3. If 受注者が稼働状況または rating_again を未入力のまま送信処理に到達した, the Server Action（submitContractorReportAction）shall Zod 検証で送信を拒否し、ユーザー向けの日本語エラーを返す
4. The CON-013 評価入力フォーム shall 「稼働状況の補足」「評価の補足」を任意項目として（必須表示なしで）表示する

### Requirement 2: Good/Bad マークの差し替え（CON-013）
**Objective:** As a プロダクトオーナー, I want 「また仕事を受けたいか」の Good/Bad を、刷新前の受注者評価フォームで使っていたサムアップマークに統一したい, so that 評価系 UI の見た目をプロジェクト内で揃えられる。

#### Acceptance Criteria
1. The CON-013 評価入力フォーム shall 「また仕事を受けたいか」の Good 選択肢を、刷新前（rating-redesign 前）の受注者評価フォームで使っていたサムアップマークと同一の見た目で表示する
2. The CON-013 評価入力フォーム shall Good / Bad の選択状態を視覚的に区別する（選択中は塗り＋primary 色、未選択は灰色相当）
3. The CON-013 評価入力フォーム shall 各選択ボタンにスクリーンリーダー向けのラベル（Good / Bad に相当する説明）を付与する
4. The CON-013 評価入力フォーム内の Good/Bad ボタン shall `type="button"` を明示し、意図しないフォーム送信を発生させない（CLAUDE.md フォーム内ボタンルール準拠）
5. Where 評判表示（CLI-020）でもサムアップマークを用いる, the システム shall 入力フォームと評判表示で同系統のサムアップ表現を使用し、見た目の一貫性を保つ

> 【決定】lucide `ThumbsUp` / `ThumbsDown`（size-6、選択中 fill=currentColor + text-primary、未選択 fill=none + 灰色）で統一する（案A）。CLI-020 の評判表示も現状の 👍 絵文字から lucide サムアップに合わせ、入力フォームと評判表示で見た目を揃える。

### Requirement 3: 評判サマリーの集計関数
**Objective:** As a システム開発者, I want 発注者の評判件数（good・合計）の算出を1か所のテスト可能な関数に集約したい, so that 表示画面に手書き集計を散在させず、将来の評判ページとロジックを共有できる。

#### Acceptance Criteria
1. The システム shall 特定の被評価者（発注者）について client_reviews から「また受けたい（rating_again='good'）件数」と「合計評価件数」を算出する集計関数を提供する
2. The 集計の件数算出ロジック shall 単体テスト可能な純粋関数として切り出され、Vitest で good 件数・合計件数・空入力の境界を検証可能とする
3. While 対象の被評価者に client_reviews が1件も存在しない, the 集計関数 shall good=0・合計=0 を返す（例外を投げない）
4. The 集計関数 shall 現行の RLS（被評価者本人・同一組織・投稿者本人のみ SELECT 可）の下で、被評価者本人のセッションから自分の評判を取得できる
5. The 集計関数 shall 被評価者 ID を引数に取る形とし、将来「閲覧者 ≠ 被評価者」や補足コメント表示を追加する際の拡張余地を残す（ただし本 spec では補足・コメントの取得は実装しない）

### Requirement 4: 自分の発注者プロフィールでの評判表示（CLI-020）
**Objective:** As a 発注者, I want 受注者から「また仕事を受けたい」と言われた件数を確認したい, so that 自分の評判を把握し、今後の発注行動の参考にできる。

#### Acceptance Criteria
1. The CLI-020（mypage/client-profile）画面 shall 評判セクションで「また仕事を受けたい」というラベルと lucide サムアップマーク、および「（good件数／合計件数）」を表示する（例: また仕事を受けたい [サムアップ]（5／6件））。現状の 👍 絵文字は lucide サムアップに置き換える。ラベル文言は CON-013 入力フォームの設問「また仕事を受けたいか？」と揃える
2. The CLI-020 画面 shall 評判の件数取得に Requirement 3 の集計関数を使用し、ページ内に手書きの集計クエリを重複させない
3. If 対象の発注者に client_reviews が1件も存在しない, the CLI-020 画面 shall 「評判はまだありません」相当のメッセージを表示し、件数を表示しない
4. The CLI-020 画面 shall 法人プランの場合は組織 Owner の被評価者 ID を対象として評判を集計する（現行の profileUserId 解決ロジックを踏襲する）
5. The CLI-020 画面 shall 稼働状況の補足（status_supplement）と評価補足コメント（comment）を表示しない（保留事項）
6. The CLI-020 画面 shall bad 件数を表示しない

### Requirement 5: 補足・コメント表示と公開範囲の保留
**Objective:** As a プラットフォーム運営者, I want 「評価コメントを誰に・どの画面で見せるか」の判断をリリース後に持ち越せるようにしたい, so that 画面要件が固まらないうちに拙速な公開をしない。

#### Acceptance Criteria
1. The 本 spec の実装 shall status_supplement / comment を引き続き保存するが、CLI-020 を含むいかなる画面にも表示しない
2. The 本 spec の実装 shall `client_reviews` の SELECT RLS ポリシーを緩和しない（被評価者本人・同一組織・投稿者本人のみ SELECT 可の現状を維持する）
3. The 本 spec の実装 shall 他の受注者が任意の発注者の評判・コメントを閲覧する新画面（CLI-028 相当）を新設しない
4. The clients/[id]（受注者が他発注者を見る詳細）画面 shall 本 spec では client_reviews を参照しない（現状を維持する）
5. The spec ドキュメント shall 「補足・コメントの表示／第三者公開（RLS 緩和＋他者向け画面）は後続 spec で画面要件を確定してから実装する」旨を明記する

### Requirement 6: 既存の「評価済み判定」利用箇所の非回帰
**Objective:** As a システム開発者, I want client_reviews を存在チェックに使っている既存画面の挙動を壊さないようにしたい, so that 応募履歴・発注履歴のフィルタやバッジが従来通り動作する。

#### Acceptance Criteria
1. The 本 spec の実装 shall client_reviews を存在チェック（評価済みか否か）に使用している既存画面（mypage、applications/history、applications/orders、applications/history/[id]、jobs/[id]/applicants）の判定挙動を変更しない
2. When 受注者が CON-013 で評価を送信した, the システム shall 当該応募を従来通り「評価登録済み」として既存の各一覧・詳細に反映する
3. The 本 spec の実装 shall client_reviews のスキーマ（カラム構成・型・UNIQUE 制約）を変更しない

### Requirement 7: テストとデグレ防止
**Objective:** As a システム開発者, I want 出口づくりの変更が既存機能を壊していないことを検証したい, so that 安心してリリースできる。

#### Acceptance Criteria
1. The 集計関数の純粋部分 shall Vitest でユニットテストされる（good 件数・合計件数の算出、空入力の境界）
2. The CON-013 評価提出フロー（必須表示・マーク差し替え後）shall Playwright で「Good を選んで評価を送信→評価済みになる」正常系を検証する
3. The CLI-020 評判表示 shall Playwright で「評価が存在する発注者で『また受けたい（good／合計）』が表示される」「評価0件で『評判はまだありません』が表示される」を検証する
4. The seed.sql shall CLI-020 評判表示の検証に必要な client_reviews テストデータ（good と bad が混在し合計件数が分母になることを確認できるバリエーション）を提供する
5. When 実装が完了した, the システム shall `npm run test` / `supabase test db` / `npm run test:e2e` の3層すべてが既存テストを含めて成功する状態を満たす（CLAUDE.md デグレ防止ゲート準拠）

### Requirement 8: 関連 spec / steering との整合
**Objective:** As a spec 管理者, I want 本 spec の決定事項をドキュメントに反映したい, so that 仕様書間の矛盾をなくし保守性を保てる。

#### Acceptance Criteria
1. The 本 spec shall steering の `.kiro/steering/screen-map.md` の CLI-020（発注者情報詳細）説明に「評判表示（また受けたい件数: good／合計）」への言及を追加する
2. The 本 spec shall 「評価コメントの表示・第三者公開は後決め（保留）」である旨を関連 steering（screen-map.md もしくは roles-and-permissions.md の該当箇所）に注記する
3. When 本 spec の実装が完了した, the spec 管理者 shall 上記ドキュメントの該当箇所を実装と整合する形で更新する
