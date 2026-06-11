# Requirements Document

## Project Description (Input)
求人へのお問い合わせ機能（job-inquiry）。

### 概要
発注者詳細(CON-006 `/clients/[id]`)に「求人へのお問い合わせ」フォームへのボタンを設置。ログイン中のユーザー（主に受注者だが、管理者をのぞく全ロール）が、特定の発注者宛に「求人について話を聞きたい/応募したい」等の問い合わせを送る。内容はビジ友運営(admin)と宛先の発注者の両方が閲覧できる。

### コンセプト（重要）
ビジ友は「連絡先＋最小入力」を橋渡しし、求人のきっかけ作りを手伝うだけ。以降のやり取りは企業と職人で直接（メール / ビジ友メッセージ機能 どちらでも自由）。**求人問い合わせ用の専用メッセージ・返信機能は作らない**。

### デザインカンプ
`~/Downloads/求人フォーム.png`。画面タイトル「求人へのお問い合わせ」、サブタイトルに発注者名。

**重要：モックは姓/名2欄だが、機能的に兄弟である COM-008 お問い合わせ・COM-012 トラブル報告と揃えるため「氏名1欄」に変更して実装する**。

フォーム項目（確定版）:
- 氏名（必須・1欄）
- メールアドレス（必須）
- お問い合わせ項目（必須・**複数選択チェックボックス**）：求人について話を聞きたい / 求人に応募したい / その他
- お問い合わせ内容（任意・textarea）
- 送信する / もどる
- 添付なし・確認画面なし・1ページ完結

### 確定方針
- 対象は「発注者そのもの」宛（案件は選ばない、フォームに案件選択なし）
- 送信者はログイン必須。**氏名（姓+名をスペース無し連結）・メールは登録値を自動入力して編集可**。問い合わせは送信者 user_id に紐付け
- 発注者はマイページに受信箱（一覧＋詳細）を持ち、**内容の閲覧のみ可能**。状態管理（対応済フラグ等）も返信機能も持たない（既存のお問い合わせ・トラブル報告と同じく「保存して読む」だけの最小構成。橋渡し後の連絡は当事者間で直接＝メール / 既存のビジ友メッセージ機能 どちらでも自由）
- admin側は今回は画面を作らない。新規テーブル＋admin閲覧RLSの「データの器」だけ用意（既存のお問い合わせ/トラブル報告と同様、後日admin specで一括画面化。2026-06-09 に admin spec で ADM-020/021 求人問い合わせ一覧・詳細として定義済み）
- **新規問い合わせ時、発注者へメール通知**（Resend 経由。送信者の氏名・メール・項目・内容を伝える＝橋渡しの肝）。送信者への確認メールは無し（画面トーストで十分）

### 通知系の現状（前提）
- Supabase Auth は認証フロー専用のメールを既定テンプレで自動送信
- Resend で 8 種類のアプリ独自メールが実配線済み（matching, scout, billing, withdrawal 等）。`message-notification` のみテンプレ存在で未配線
- アプリ内通知（ヘッダーバッジ・notifications テーブル）は未実装。Realtime はメッセージ画面内の即時反映のみ
- → 求人問い合わせのメール通知は、scout-notification と同じ位置づけで Resend テンプレを1つ追加して送る

### 既存実装の参照
- 似た構造: お問い合わせ(COM-008 `/contact`)、トラブル報告(COM-012 `/trouble-report`) — フォーム→テーブル保存→admin閲覧RLSのパターン
- ボタン設置先: `src/app/(authenticated)/clients/[id]/page.tsx`（既に「メッセージを送る」ボタンあり、その並びに追加）
- 発注者名解決: resolveParticipantName / client_profiles.display_name
- 戻るボタン: ログイン後画面なので下部「もどる」(BackButton)一本

---

## Introduction

求人へのお問い合わせ機能（job-inquiry）は、発注者詳細(CON-006)から特定の発注者宛に簡易な問い合わせを送る「橋渡し」機能である。ビジ友は連絡先と最小入力を仲介するだけで、以降のやり取りは当事者間で直接（メール / 既存のビジ友メッセージ機能）行う。**求人問い合わせ専用の返信・メッセージ機能は実装しない**。

問い合わせは宛先発注者と将来の運営(admin)が閲覧できる。発注者側は本 spec の範囲で受信箱（一覧／詳細）を実装するが、**内容の閲覧のみで、対応済フラグ等の状態管理機能は持たない**（既存のお問い合わせ・トラブル報告と同じ「保存して読む」だけの最小構成）。admin 側はテーブル＋閲覧 RLS の「データの器」だけ用意して画面実装は後日 admin spec に委譲する（既存の support spec と同じ方針）。

法人プランでは、宛先発注者の組織メンバー全員（Owner / 組織管理者 / 担当者）が受信箱を共有して閲覧できるものとする（既存のメッセージ・応募管理と同じ組織共有モデルに合わせる）。

新たに必要となる画面（求人問い合わせフォーム、受信箱一覧、受信箱詳細）の screen-map への登録・画面 ID 採番は設計フェーズで行う。

---

## Requirements

### Requirement 1: 求人問い合わせフォームの表示と入力

**Objective:** ログイン中のユーザーとして、発注者詳細画面から自分の情報があらかじめ入った求人問い合わせフォームを開きたい。それにより素早く問い合わせを送って次の連絡につなげたい。

#### Acceptance Criteria
1. While ログインユーザーが発注者詳細(CON-006)を表示している（かつ Requirement 3 の表示禁止条件に該当しない場合）, the job-inquiry feature shall 同画面のアクションエリアに「求人へのお問い合わせ」ボタンを表示する
2. When ログインユーザーが「求人へのお問い合わせ」ボタンを押下, the job-inquiry feature shall 当該発注者宛の求人問い合わせフォーム画面に遷移する
3. While 求人問い合わせフォームが表示されている, the job-inquiry feature shall 画面タイトルを「求人へのお問い合わせ」と表示し、サブタイトルに宛先発注者の表示名（`resolveParticipantName()` で解決した `client_profiles.display_name` または氏名）を表示する
4. When 求人問い合わせフォーム画面が初期表示される, the job-inquiry feature shall ログインユーザーの登録氏名（`users.last_name + users.first_name` をスペース無し連結）と登録メールアドレス（`auth.users.email`）を「氏名」「メールアドレス」入力欄に自動入力する
5. While 求人問い合わせフォームが表示されている, the job-inquiry feature shall 自動入力された氏名・メールアドレスをユーザーが自由に編集できるようにする
6. The job-inquiry feature shall 求人問い合わせフォームに次の必須項目を提供する: 氏名（1欄）、メールアドレス、お問い合わせ項目（複数選択チェックボックス、選択肢は「求人について話を聞きたい」「求人に応募したい」「その他」）
7. The job-inquiry feature shall 求人問い合わせフォームに任意項目として「お問い合わせ内容」（自由記述 textarea）を提供する
8. The job-inquiry feature shall 求人問い合わせフォームに添付ファイル欄および入力内容確認ステップを設けない（1ページ完結）
9. While 求人問い合わせフォームが表示されている, the job-inquiry feature shall 画面下部に紫ピル＋白文字の「送信する」CTA ボタンと outline ピルの「もどる」ボタンを縦並び中央揃えで表示する
10. The job-inquiry feature shall お問い合わせ項目の選択肢ラベルを文字列で保存する（マスタテーブル化しない＝将来の選択肢増減はコード定数の変更で対応する。COM-008 / COM-012 と同方針）

### Requirement 2: 求人問い合わせの送信とバリデーション

**Objective:** 送信者として、入力内容のバリデーションを通過したときだけ問い合わせが保存され、失敗時には明確なフィードバックが得たい。

#### Acceptance Criteria
1. When 送信者が「送信する」ボタンを押下, the job-inquiry feature shall Server Action を呼び出して問い合わせを保存する
2. If 必須項目（氏名・メールアドレス・お問い合わせ項目のいずれか）が未入力, the job-inquiry feature shall 該当項目のエラーメッセージを表示し、送信を行わない
3. If 入力されたメールアドレスが標準的なメール形式に合致しない, the job-inquiry feature shall 「メールアドレスの形式が正しくありません」を表示し、送信を行わない
4. If お問い合わせ項目（チェックボックス）が1つも選択されていない, the job-inquiry feature shall 「お問い合わせ項目を選択してください」を表示し、送信を行わない
5. The job-inquiry feature shall サーバー側でも Zod スキーマによる同一のバリデーションを実施する（クライアント側のみの検証を信用しない）
6. When サーバー側バリデーションが全て通過, the job-inquiry feature shall 問い合わせを永続化する（送信者 user_id・宛先 client_id・氏名・メールアドレス・お問い合わせ項目（複数）・お問い合わせ内容・受信日時を保存）
7. When 保存が成功, the job-inquiry feature shall 完了トースト（「問い合わせを送信しました」）を表示し、発注者詳細(CON-006)に戻す
8. If 保存中に予期しないエラーが発生, the job-inquiry feature shall 汎用エラートースト（「送信中にエラーが発生しました。しばらくしてから再度お試しください。」）を表示し、フォームの入力内容を維持する
9. While ユーザーが未ログイン, the job-inquiry feature shall 求人問い合わせフォームの送信を受け付けない（Middleware ＋ Server Action の二重防御）

### Requirement 3: 送信者・宛先のアクセス制御

**Objective:** 不適切な相手（自分自身・自社・退会済み）への問い合わせを防ぎ、不要な操作を画面に出さない。

#### Acceptance Criteria
1. While 発注者詳細(CON-006)が表示されている対象 client が退会済み（`users.deleted_at IS NOT NULL`）, the job-inquiry feature shall 「求人へのお問い合わせ」ボタンを表示しない
2. While 発注者詳細(CON-006)が表示されている対象 client が閲覧者自身（`client.id === user.id`）, the job-inquiry feature shall 「求人へのお問い合わせ」ボタンを表示しない
3. While 法人プランの担当者・組織管理者・管理責任者が自社（同一 `organization`）の発注者詳細を表示している, the job-inquiry feature shall 「求人へのお問い合わせ」ボタンを表示しない
4. While ユーザーが管理者（`users.role = 'admin'`）, the job-inquiry feature shall 「求人へのお問い合わせ」ボタンを表示しない（運用上、管理者は問い合わせを送信しない）
5. If 上記の表示制限を URL 直打ち等で回避してフォーム送信が試行された, the job-inquiry feature shall Server Action 内で同じ判定を行い、保存を拒否する
6. The job-inquiry feature shall ボタンの表示可否と Server Action の許可範囲を必ず一致させる（UI と Server Action の許可範囲のズレを禁止）

### Requirement 4: 連投防止（レート制限）

**Objective:** スパム・誤操作による連投を抑止し、発注者の受信箱を保護したい。

#### Acceptance Criteria
1. If 同一送信者 user_id の直近1時間以内の問い合わせ件数が5件以上, the job-inquiry feature shall 「送信回数の上限に達しました。しばらくしてから再度お試しください。」を表示し、保存を拒否する
2. The job-inquiry feature shall レート制限の集計を RLS で参照不可な行も含めて正確に行うため、サーバー側で送信者本人の送信履歴を集計可能な方法で実装する（COM-012 トラブル報告と同じパターン）

### Requirement 5: 発注者への新規問い合わせメール通知

**Objective:** 発注者として、新しい問い合わせが届いたことをメールですぐ気づき、橋渡しのきっかけを逃さず受け取りたい。

#### Acceptance Criteria
1. When 求人問い合わせの保存が成功, the job-inquiry feature shall Resend 経由で宛先発注者（対象 client = Owner ロール）の登録メールアドレス宛に通知メールを1通送信する
2. The job-inquiry feature shall 通知メール本文に次を含める: 送信者の氏名、送信者のメールアドレス、選択されたお問い合わせ項目、お問い合わせ内容、宛先発注者の表示名、ビジ友マイページの受信箱への導線リンク
3. The job-inquiry feature shall 通知メールの件名を「【ビジ友】求人へのお問い合わせを受信しました」相当の固定形式とし、本文先頭で宛先発注者の表示名を明記する
4. If メール送信に失敗, the job-inquiry feature shall 本体の問い合わせ保存処理をロールバックせず、エラーをサーバーログに記録する（security.md「メール送信失敗時の共通方針」に従う）
5. The job-inquiry feature shall 送信者本人への確認メールを送信しない（画面トーストで通知する）
6. The job-inquiry feature shall 通知メールの送信先を宛先 client（Owner ロール）の登録メールアドレスに限定する（組織メンバー全員への通知は本 spec のスコープ外、将来検討）
7. While 開発環境（`RESEND_API_KEY` 未設定）, the job-inquiry feature shall 既存の `sendEmail()` のローカルフォールバックを利用してメール内容を確認可能な状態にする

### Requirement 6: 発注者の受信箱（一覧・詳細）

**Objective:** 発注者として、自分宛に届いた求人問い合わせをマイページから一覧で確認し、必要に応じて詳細を読んで送信者に直接連絡したい。

#### Acceptance Criteria
1. While 発注者本人または同一組織メンバーがマイページを表示している, the job-inquiry feature shall マイページに求人問い合わせ受信箱への導線リンクを表示する（具体的なセクション配置は設計フェーズで決定）
2. While 受信箱一覧画面が表示されている, the job-inquiry feature shall 自分（または所属 organization）宛の問い合わせを受信日時の新しい順に一覧表示し、1ページあたり20件のページネーションを提供する
3. The job-inquiry feature shall 受信箱一覧の各行に次を表示する: 受信日時、送信者氏名、選択されたお問い合わせ項目
4. When 発注者が受信箱一覧の行を押下, the job-inquiry feature shall 受信箱詳細画面に遷移し、送信者氏名・メールアドレス・お問い合わせ項目・お問い合わせ内容・受信日時を表示する
5. The job-inquiry feature shall 受信箱画面に返信フォーム・メッセージ送信機能・対応済みフラグ等の状態管理機能・独立した「返信する」ボタンや案内テキストを一切提供しない（橋渡しコンセプトの維持。お問い合わせ・トラブル報告と同じ「保存して読む」だけの最小構成）
6. The job-inquiry feature shall 受信箱詳細画面に表示する送信者メールアドレスを `<a href="mailto:...">` の標準的なハイパーリンクとして実装する（独立した「返信する」ボタンや案内テキストではなく、メールアドレス表示として自然な形）
7. While 受信箱を法人プランのメンバーが閲覧している, the job-inquiry feature shall Owner / 組織管理者 / 担当者の全員に閲覧を許可する

### Requirement 7: アクセス制御（受信箱とデータ保護）

**Objective:** 受信箱の内容が宛先発注者と運営以外に漏れないようにしたい。

#### Acceptance Criteria
1. The job-inquiry feature shall 問い合わせデータを保存するテーブルに RLS を有効化し、デフォルトでアクセスを拒否する
2. The job-inquiry feature shall SELECT を次の条件のみ許可する: 宛先 client_id が `auth.uid()` と一致、または `auth.uid()` が宛先 client の所属 organization のメンバー（`is_same_org()` で判定）、または `users.role = 'admin'`
3. The job-inquiry feature shall INSERT を「認証済みかつ送信者 user_id が `auth.uid()` と一致」のみ許可する
4. The job-inquiry feature shall 一般ユーザーからの UPDATE / DELETE を許可しない（admin 操作またはバックエンド処理に限定。発注者側の状態管理機能を持たないため UPDATE 不要）
5. The job-inquiry feature shall 機密データ（送信者の生メールアドレス等）を本人・宛先発注者・admin 以外には漏らさない（他ユーザー向けにマスキング表示する画面は本 spec のスコープ外）

### Requirement 8: 運営（admin）向けデータの器

**Objective:** 将来の admin 統合管理画面で求人問い合わせを閲覧・管理できるよう、データの器（テーブル＋ RLS）だけは今回用意しておきたい。

#### Acceptance Criteria
1. The job-inquiry feature shall 問い合わせテーブルに admin（`users.role = 'admin'`）からの SELECT を許可する RLS ポリシーを設置する
2. The job-inquiry feature shall 本 spec のスコープに admin 用一覧・詳細画面の実装を含めない（既存の support spec と同じ方針）
3. The job-inquiry feature shall 将来 admin spec で画面実装する際にスキーマ変更や移行作業が最小になるよう、運用上必要な情報（受信日時、送信者 user_id、宛先 client_id、氏名、メールアドレス、お問い合わせ項目、内容）を漏れなく保存する

### Requirement 9: ナビゲーション・戻る動線

**Objective:** ログイン後画面の戻る規約と整合する戻り動線を提供したい。

#### Acceptance Criteria
1. The job-inquiry feature shall 求人問い合わせフォーム画面の戻る動線として、画面下部に outline ピルの「もどる」ボタンを1つ設置する（ページ独自の上部戻る矢印は設けず、共通ヘッダーに従う）
2. When 求人問い合わせの送信が成功, the job-inquiry feature shall 発注者詳細(CON-006)へ戻す
3. The job-inquiry feature shall 受信箱の一覧画面・詳細画面にもマイページへ戻る動線を提供する（既存の BackButton ルールに従う）

### Requirement 10: 既存のドキュメント・コードベースとの整合

**Objective:** 新しい機能を追加するうえで、既存のステアリング・スクリーンマップ・テーブル設計との不整合を残さないこと。

#### Acceptance Criteria
1. The job-inquiry feature shall 新規追加する画面（求人問い合わせフォーム、受信箱一覧、受信箱詳細）の画面 ID を `.kiro/steering/screen-map.md` に追記する
2. The job-inquiry feature shall 新規追加するメールテンプレート（求人問い合わせ通知）を `.kiro/steering/tech.md` の「メール種別と送信トリガー」表に追記する
3. The job-inquiry feature shall 新規追加するテーブル・RLS ポリシーを `.kiro/steering/database-schema.md` の該当箇所に追記する
4. The job-inquiry feature shall マイページの導線リンクの `href` が実在ルートと完全一致することを実装時に検証する（CLAUDE.md「ナビゲーションリンクと実ルートの整合」ルールに従う）

### Requirement 11: テスト

**Objective:** 書き込み系操作と権限制御の確実性を、機能リリース時点で検証可能にしたい。

#### Acceptance Criteria
1. The job-inquiry feature shall Server Action（問い合わせ送信）に対する Vitest ユニットテストを用意する（正常系・必須未入力・形式不正・連投制限・権限拒否の各ケース）
2. The job-inquiry feature shall RLS ポリシーに対する pgTAP テストを用意する（送信者本人 SELECT 不可、宛先 client SELECT 可、同一組織メンバー SELECT 可、第三者 SELECT 不可、一般ユーザー UPDATE / DELETE 不可）
3. The job-inquiry feature shall 主要なユーザーストーリーをカバーする Playwright E2E テストを用意する（受注者がフォームを開いて送信→発注者の受信箱で内容を確認できる通しフロー）
4. The job-inquiry feature shall E2E テストの起点を `page.goto()` 直接遷移だけに頼らず、発注者詳細(CON-006)からのボタン押下を含む実導線でカバーする（CLAUDE.md「page.goto 直接遷移だけで E2E を完結させない」ルールに従う）
