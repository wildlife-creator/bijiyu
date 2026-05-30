# Requirements Document

## Project Description (Input)
機能名: rating-redesign

## 概要
発注者→受注者の評価機能を、現行の「6項目 Good/Bad 形式」から「7項目 ★×5 形式」に作り直す。

## 評価フォーム（発注者が応募完了時に入力）

### 星評価7項目（各 ★×5）
| # | 項目 | 必須/任意 | 備考 |
|---|---|---|---|
| 1 | 総合評価 | 必須 | CLI-006 で表示する代表値 |
| 2 | 稼働予定日にくる | 任意 | |
| 3 | 指示通りに動ける | 任意 | |
| 4 | 作業の速さ | 任意 | |
| 5 | 作業の丁寧さ | 任意 | |
| 6 | 作業に関する道具を持っている | 任意 | 「該当なし」選択可 |
| 7 | 特別な道具/重機等を持っている | 任意 | **新規追加**項目／「該当なし」選択可 |

#### 「該当なし」選択肢（道具2項目: #6 / #7）
- 道具の有無は本人のスキル・人柄とは無関係なため、評価不能時に **「該当なし」** を選んで集計（★平均）から除外できる
- 運用: 道具を持っていれば★で評価、持っていない・現場で支給/貸与された・その作業では使わなかった等で評価できない場合は「該当なし」を選ぶ
- **保存方式**: 「該当なし」は未評価と同じ **NULL**（DB マイグレーション不要）。`summarize` が NULL を除外する既存ロジックでそのまま平均から外れる
- 該当なしの **件数は記録・表示しない**（案A）。ある項目を全員が「該当なし」にした場合、CLI-028 では「未評価」と表示される
- 入力UI: 道具2項目に「該当なし」トグルを表示。選択すると★はクリア＆減光し、★を選ぶと自動解除（`StarRatingInput.allowNotApplicable`）
- 補足文言: 「お持ちでない・現場で支給/貸与された・その作業では使わなかった等、評価が難しい場合は「該当なし」を選んでください」

### 併記する既存欄（現行のまま残す）
- 稼働状況6択（必須）: 「問題なく稼働完了」「一部欠席したものの概ね問題なく稼働完了」「欠席（連絡あり）」「欠席（連絡なし）」「発注者側からお断り」「その他」
  - 応募ステータス（completed / lost）の判定に引き続き利用する（`mapOperatingStatusToApplicationStatus` を維持）
- 稼働状況の補足（任意テキスト）
- 評価の補足コメント（任意テキスト）

## 表示仕様

### CLI-006（受注者詳細）
- 総合評価のみ表示
- 形式: `★平均 + 件数`（例: ★★★★☆ 4.3 (12件)）
- 「詳しく見る」リンクで CLI-028 へ遷移

### CLI-028（発注者評価詳細）
- 7項目それぞれの「★平均 + 件数」を表示
- 任意項目（2〜7）の平均は **「評価あり件のみで平均」**（未入力は分母に含めない）
- 稼働状況の補足一覧（ページネーション）
- 評価の補足コメント一覧（ページネーション）

### CLI-005（職人一覧 / 受注者検索）
- 現状ハードコードされている「高評価 / 発注者の再発注希望80%！」を、実データに基づく動的バッジに置き換える
- **表示条件**: 総合評価の評価件数が **3件以上** かつ **★平均が 4.0 以上** の受注者にバッジを表示
- **表示形式**: カード上部に「【高評価】 ★平均 X.X（N件）」（例: 【高評価】 ★平均 4.5（12件））
  - 現状の2要素構造（黒地白文字バッジ + グレー補足テキスト）は維持
  - バッジ部分: 「高評価」
  - 補足部分: 「★平均 X.X（N件）」
- 条件を満たさない受注者にはバッジを表示しない（評価0件のユーザー含む）
- **段階**: 1段階のみ。将来「殿堂入り」等の上位バッジを追加する可能性は残すが、本 spec のスコープ外
- **閾値の保持方法**: コード定数として `src/lib/constants/rating.ts`（新規）に保持し、CLI-005 のバッジ判定で import して使う。将来の閾値変更は定数の数値修正のみで対応可能（DB マイグレーション不要）
  - `HIGH_RATING_BADGE_MIN_COUNT = 3`
  - `HIGH_RATING_BADGE_MIN_AVG = 4.0`

## DB 設計方針

- `user_reviews` テーブルを作り直す（既存データはテストデータのみで破棄可）
- 既存の `rating_again` / `rating_follows_instructions` / `rating_punctual` / `rating_speed` / `rating_quality` / `rating_has_tools`（各 string で 'good'/'bad'）を、7つの smallint（1〜5、nullable）カラムに置き換え
- 新カラム名案:
  - `rating_overall`（必須、NOT NULL、1〜5）
  - `rating_punctual`（任意、NULL 許可）
  - `rating_follows_instructions`（任意）
  - `rating_speed`（任意）
  - `rating_quality`（任意）
  - `rating_has_tools`（任意）
  - `rating_has_special_equipment`（任意、新規）
- `operating_status` / `status_supplement` / `comment` カラムは維持
- CHECK 制約で 1〜5 範囲に制限

## 影響範囲

- DB: `supabase/migrations/` に新マイグレーション
- Server Action: `src/app/(authenticated)/applications/actions.ts` の `submitClientReportAction`
- バリデーション: `src/lib/validations/matching.ts` の `clientReportSchema`
- フォーム UI: `src/app/(authenticated)/applications/orders/[id]/report/client-report-form.tsx`（Good/Bad ボタン → 星評価コンポーネントに置き換え）
- 表示: `src/app/(authenticated)/users/contractors/[id]/page.tsx`（CLI-006、総合評価サマリー追加）
- 表示: `src/app/(authenticated)/users/[id]/reviews/page.tsx`（CLI-028、6項目集計 → 7項目集計）
- 表示: `src/app/(authenticated)/users/contractors/page.tsx`（CLI-005、ハードコードバッジを動的バッジに置き換え）
- 集計: 評価件数・★平均の取得方法を design 段階で決定（リアルタイム集計 vs `users` テーブルへのキャッシュカラム denormalize）
- 定数: `src/lib/constants/rating.ts` を新規作成し、バッジ閾値定数（`HIGH_RATING_BADGE_MIN_COUNT`、`HIGH_RATING_BADGE_MIN_AVG`）を保持
- 型: `npm run gen:types` で Supabase 型再生成
- 共通: 星評価コンポーネント（入力用 + 表示用）を新規作成（`src/components/shared/star-rating.tsx` 等）
- テスト: Vitest（バリデーション・Server Action・バッジ判定ロジック）、pgTAP（user_reviews RLS）、Playwright（CON-013 完了報告フロー + CLI-005/006/028 表示）
- デザインカンプ: `design-assets/screens/CLI-005*.png` / `CLI-028.png` を参照。評価フォーム側のカンプがあれば確認

## デザインカンプ参照

- CLI-005: `design-assets/screens/CLI-005.png` / `CLI-005-popup-a.png` / `CLI-005-popup-b.png`
- CLI-006: `design-assets/screens/CLI-006*.png`
- CLI-028: `design-assets/screens/CLI-028.png`
- 完了報告フォーム（CON-013 / 受注者側）: 発注者側も同フォームを使うため要確認

  ※ CLI-005 のデザインカンプにバッジが描かれているかは要確認。描かれていない場合、現状実装の見た目（黒地白文字バッジ + グレー補足テキスト）を踏襲する

## 関連 spec

- `.kiro/specs/matching/` — 評価機能の親 spec。本 spec で REQ-MT 番号を更新・参照する

## Introduction

本 spec は、発注者が受注者を評価する機能（CLI-012）と、その結果の表示画面（CLI-005 / CLI-006 / CLI-028）を、現行の「6項目 Good/Bad 形式」から「7項目 ★×5 形式」に作り直すことを目的とする。

**スコープ内**:
- `user_reviews` テーブル（発注者→受注者の評価）のスキーマ刷新
- CLI-012 評価入力フォームの再構成
- CLI-005 / CLI-006 / CLI-028 の評価表示変更
- 旧 Good/Bad 6項目データの破棄と新スキーマへの置換
- 旧「また依頼したい」（rating_again）項目の廃止と「総合評価」（rating_overall）への意味統合（旧 rating_again ≠ 新 rating_overall。カラム名 punctual/follows_instructions/speed/quality/has_tools は名前は同じだが意味論を Good/Bad → ★×5 に変更）

**スコープ外**:
- `client_reviews` テーブル（受注者→発注者の評価、CON-013）の刷新 — 本 spec では変更しない
- 評価機能とは独立した稼働状況6択の意味論変更 — 既存ロジック（applications.status 連動）を維持する
- 「殿堂入り」等の上位バッジ — 将来拡張余地として残すのみ

**親 spec との関係**: 本 spec の決定事項は `.kiro/specs/matching/` の REQ-MT-009 / REQ-MT-010 を更新し、CLI-005 / CLI-006 表示として新たな REQ-MT 項目を追加する形で matching spec に反映する（Requirement 9 参照）。

## Requirements

### Requirement 1: 評価入力フォームの7項目★×5化（CLI-012）
**Objective**: As a 発注者, I want 7項目の★×5評価で受注者を評価したい（総合評価のみ必須、他6項目は任意）, so that 観点別に細かく伝えつつ、入力負担を抑えつつ、最低限「総合評価」だけは必ず提出される。

#### Acceptance Criteria

1. When 発注者が CLI-012 評価入力画面を開いた, the 評価入力フォーム shall 7項目の★×5入力欄を表示する（順序: 総合評価 → 稼働予定日にくる → 指示通りに動ける → 作業の速さ → 作業の丁寧さ → 作業に関する道具を持っている → 特別な道具/重機等を持っている）
2. The 評価入力フォーム shall 「総合評価」を必須項目として扱い、未入力の場合は送信ボタンを無効化する
3. The 評価入力フォーム shall 「総合評価」以外の6項目を任意項目として扱い、未入力（NULL）のまま送信可能とする
4. The 評価入力フォーム shall 任意項目の選択値を「未評価」状態へ戻す操作（クリアボタン等）を提供する
5. The 評価入力フォーム shall 稼働状況6択を必須項目として表示する（選択肢: 問題なく稼働完了 / 一部欠席したものの概ね問題なく稼働完了 / 欠席（連絡あり）/ 欠席（連絡なし）/ 発注者側からお断り / その他）
6. The 評価入力フォーム shall 稼働状況の補足テキストと評価補足コメントを任意項目として表示する
7. If 発注者が必須項目（総合評価または稼働状況）を未入力で送信した, the 評価入力フォーム shall 該当項目にエラーメッセージを表示し送信処理を中止する
8. When 発注者が評価を正常に送信した, the システム shall CLI-010（発注履歴一覧）へ遷移する
9. The 評価入力フォーム shall 道具2項目（作業に関する道具を持っている / 特別な道具/重機等を持っている）に「該当なし」トグルと補足文言を表示する
10. When 発注者が道具項目で「該当なし」を選択した, the 評価入力フォーム shall その項目の★をクリアし、送信時は未評価と同じ NULL として送る（集計の★平均から除外される）
11. When 発注者が「該当なし」選択中の道具項目に★を付与した, the 評価入力フォーム shall 「該当なし」を自動解除して★値を採用する

### Requirement 2: 評価データの永続化と整合性（user_reviews スキーマ）
**Objective**: As a システム運営者, I want 評価データを正規化された安全なスキーマで永続化したい, so that データ整合性が保たれ集計クエリで正しい結果が得られる。

#### Acceptance Criteria

1. The user_reviews テーブル shall 7つの星評価カラム（rating_overall, rating_punctual, rating_follows_instructions, rating_speed, rating_quality, rating_has_tools, rating_has_special_equipment）を smallint 型で保持する
2. The user_reviews テーブル shall rating_overall を NOT NULL 制約とし、他6項目を NULL 許可とする
3. The user_reviews テーブル shall CHECK 制約で各星評価カラムを1〜5の整数値に制限する（NULL は許可）
4. The user_reviews テーブル shall operating_status / status_supplement / comment / application_id / reviewer_id / reviewee_id を現行通り保持する
5. The user_reviews テーブル shall (application_id) を UNIQUE 制約で1応募1評価に制限する
6. When 発注者が評価を送信し、かつ当該応募の client_reviews（受注者→発注者の評価）が既に登録済みである, the Server Action shall applications.status を mapOperatingStatusToApplicationStatus(operating_status) の戻り値（'completed' または 'lost'）に更新する
7. When 発注者が評価を送信し、当該応募の client_reviews が未登録である, the Server Action shall applications.status を 'accepted' のまま維持する（受注者側の評価登録時に最終遷移が行われるため）

### Requirement 3: 受注者詳細での総合評価表示（CLI-006）
**Objective**: As a 発注者, I want 受注者詳細ページで一目で評価の高さを把握したい, so that 多数の受注者から有望な候補を素早く見つけられる。

#### Acceptance Criteria

1. While 対象受注者に user_reviews レコードが1件以上存在する, the CLI-006 画面 shall 総合評価サマリーとして「★平均値 + 件数」を表示する（例: ★★★★☆ 4.3 (12件)）
2. The CLI-006 画面 shall 総合評価のみを表示し、他6項目の評価は CLI-006 上では表示しない
3. The CLI-006 画面 shall ★平均値を小数点第一位まで表示する（例: 4.3、5.0）
4. The CLI-006 画面 shall 総合評価サマリーから CLI-028 への「詳しく見る」リンクを提供する
5. If 対象受注者に user_reviews レコードが1件も存在しない, the CLI-006 画面 shall 「まだ評価がありません」相当のメッセージを表示し、★平均値・件数は表示しない

### Requirement 4: 評価集計詳細画面（CLI-028）
**Objective**: As a 発注者, I want 受注者の評価を項目別に詳しく確認したい, so that 自分が重視する観点（時間厳守・作業品質等）で個別に判断できる。

#### Acceptance Criteria

1. The CLI-028 画面 shall 7項目すべての「★平均値 + 件数」を表示する
2. The CLI-028 画面 shall 任意項目（rating_overall 以外の6項目）の平均値を「評価あり件数のみ」で算出する（NULL は分母に含めない）
3. The CLI-028 画面 shall 各項目の件数として「その項目を評価したレコード数」を表示する（rating_overall は必須なので全評価件数と一致、他6項目は「評価あり件数」となる）
4. If 任意項目の評価あり件数が0件である, the CLI-028 画面 shall 該当項目に「未評価」と表示する
5. The CLI-028 画面 shall 稼働状況の補足（status_supplement）と評価補足コメント（comment）の一覧を、それぞれ20件ごとのページネーションで表示する
6. The CLI-028 画面 shall 各補足一覧のレコードを新しい順（created_at DESC）で表示する
7. The CLI-028 画面 shall ★平均値を小数点第一位まで表示する

### Requirement 5: 高評価バッジの表示と判定（CLI-005）
**Objective**: As a 発注者, I want 職人一覧で「実績ある高評価の職人」を一目で識別したい, so that 信頼できる候補を効率的に絞り込める。

#### Acceptance Criteria

1. While 対象受注者の総合評価件数が HIGH_RATING_BADGE_MIN_COUNT（=3）以上、かつ総合評価の★平均値が HIGH_RATING_BADGE_MIN_AVG（=4.0）以上である, the CLI-005 画面 shall 当該受注者カード上部に「【高評価】」バッジと「★平均 X.X（N件）」補足テキストを表示する
2. If 対象受注者の総合評価件数が HIGH_RATING_BADGE_MIN_COUNT 未満、または総合評価の★平均値が HIGH_RATING_BADGE_MIN_AVG 未満である, the CLI-005 画面 shall バッジを表示しない（補足テキストも非表示）
3. The システム shall 閾値定数（HIGH_RATING_BADGE_MIN_COUNT, HIGH_RATING_BADGE_MIN_AVG）を `src/lib/constants/rating.ts` に集約し、DB マイグレーション不要で変更可能とする
4. The CLI-005 画面 shall 補足テキストの★平均値を小数点第一位まで表示する（例: ★平均 4.5（12件））
5. The CLI-005 画面 shall 現状ハードコードされた文言「発注者の再発注希望80%！」を撤去し、上記の動的バッジに置き換える
6. The バッジ判定ロジック shall 単体テスト可能な純粋関数として実装され、Vitest で件数・★平均の境界値（3件未満/3件以上、3.9/4.0/4.1）を検証可能とする

### Requirement 6: 集計値の取得性能と一貫性
**Objective**: As a システム開発者, I want 評価集計値（★平均・件数）を一覧画面で性能良く取得したい, so that 受注者数が増えても CLI-005 / CLI-006 の表示が遅延しない。

#### Acceptance Criteria

1. The システム shall 評価集計値（★平均値・件数）の取得方法（リアルタイム集計 vs `users` テーブルへのキャッシュカラム denormalize）を design 段階で確定する
2. Where 採用方式がキャッシュカラム denormalize である, the システム shall 評価追加時に該当受注者の集計カラムを更新する仕組み（DBトリガー or Server Action 内更新）を提供する
3. While 対象受注者の user_reviews が0件である, the システム shall 集計値を NULL または「未評価」相当の状態として表現する
4. The システム shall CLI-005 / CLI-006 / CLI-028 の3画面で同一受注者の★平均値・件数を一致させる（集計の一貫性）

### Requirement 7: 評価データの権限と不変性（RLS / UNIQUE）
**Objective**: As a プラットフォーム運営者, I want 評価データを当事者のみが投稿でき、投稿後は改変不可としたい, so that 評価の信頼性と公平性を保てる。

#### Acceptance Criteria

1. The user_reviews テーブル shall INSERT を、当該 application の発注者本人（または同一組織メンバー）のみに RLS で許可する
2. The user_reviews テーブル shall SELECT を全認証ユーザーに RLS で許可する（評価は公開情報）
3. The user_reviews テーブル shall UPDATE と DELETE を RLS で全ユーザーに拒否する（編集・削除不可）
4. If 同一 application_id で既に評価レコードが存在する, the user_reviews テーブル shall UNIQUE 制約違反として2件目の INSERT を拒否する
5. The CLI-012 画面 shall 評価送信後の編集・削除ボタンを表示しない（UI レベルの一貫性）
6. The user_reviews RLS テスト shall 当事者外の INSERT / 全ユーザーの UPDATE・DELETE / 二重 INSERT が拒否されることを pgTAP で検証する

### Requirement 8: 旧スキーマの撤去とテストデータ移行
**Objective**: As a システム開発者, I want 旧 Good/Bad 形式のカラムを撤去し新スキーマに移行したい, so that 不要なカラムが残らず保守コストが下がる。

#### Acceptance Criteria

1. The マイグレーション shall user_reviews テーブルから旧6カラム（rating_again, rating_follows_instructions, rating_punctual, rating_speed, rating_quality, rating_has_tools）を DROP する
2. The マイグレーション shall user_reviews テーブルに新7カラム（rating_overall, rating_punctual, rating_follows_instructions, rating_speed, rating_quality, rating_has_tools, rating_has_special_equipment）を ADD する
3. The マイグレーション shall 既存の user_reviews レコードを TRUNCATE する（テストデータのみのため変換処理は行わない）
4. The seed.sql shall user_reviews 投入箇所を新スキーマ（7項目★×5）に合わせて更新する
5. The マイグレーション shall user_reviews の CHECK 制約・UNIQUE 制約・RLS ポリシーを新スキーマに合わせて再定義する
6. When `supabase gen types typescript --local > src/types/database.ts` を実行した, the システム shall user_reviews 型を新スキーマ通りに再生成する
7. The 移行作業 shall 旧スキーマを参照する既存テスト（Vitest: `src/__tests__/matching/actions.test.ts` / `src/__tests__/matching/validations.test.ts`、pgTAP: `supabase/tests/matching_rls.test.sql` 内の user_reviews 操作）を、新スキーマ（7項目★×5、rating_overall 必須・他6項目任意）に合わせて書き換える
8. When 移行作業（マイグレーション・seed.sql 更新・既存テスト書き換え）が完了した, the システム shall `npm run test` / `supabase test db` / `npm run test:e2e` の3層すべてが既存テスト群を含めて成功する状態を満たす（CLAUDE.md デグレ防止ゲート準拠）

### Requirement 9: 関連 spec（matching）との整合
**Objective**: As a spec 管理者, I want rating-redesign の決定事項を matching spec に反映したい, so that 仕様書間の矛盾をなくし保守性を保てる。

#### Acceptance Criteria

1. The rating-redesign spec shall matching/requirements.md REQ-MT-009 を「7項目★×5、総合評価のみ必須」形式に更新する
2. The rating-redesign spec shall matching/requirements.md REQ-MT-010 を「7項目集計表示、任意項目は評価あり件のみで平均」形式に更新する
3. The rating-redesign spec shall matching spec に新たな REQ-MT 項目として「CLI-005 高評価バッジ」と「CLI-006 総合評価サマリー」の要件を追加する
4. The rating-redesign spec shall steering の `.kiro/steering/screen-map.md` の以下4画面の説明を新仕様に合わせて更新する:
   - CLI-005: 「高評価バッジ（総合評価3件以上+★4以上で表示）」への言及追加
   - CLI-006: 「総合評価サマリー（★平均+件数）と CLI-028 への詳しく見るリンク」への言及追加
   - CLI-012: 「6項目 + 補足」→「7項目★×5（総合のみ必須）+ 稼働状況6択 + 補足」に書き換え
   - CLI-028: 「評価6項目の Good 集計」→「7項目★×5 集計（任意項目は評価あり件のみで平均）」に書き換え
5. When rating-redesign の実装が完了した, the spec 管理者 shall matching/requirements.md および steering/screen-map.md の該当箇所を本 spec と整合する形で更新する


