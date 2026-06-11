# Requirements Document

## Project Description (Input)
spec名: support（問い合わせ・トラブル報告）

### 概要
ユーザー向けの「お問い合わせ」フォームの全面改修と、新規「トラブル報告」画面の追加。両方とも将来ビジ友の管理者（admin）が管理画面で閲覧・対応できるようにするが、**管理画面そのものは本 spec の対象外**（admin の10+画面は仕様確定後に admin spec で一括実装する方針）。本 spec ではユーザー側フォーム＋データの器（テーブル・RLS・Storageバケット）までを作る。

### 対象画面
- COM-008 お問い合わせ（既存・全面改修）: `/contact`・**非ログインでもログイン中でも送信可**
- COM-012 トラブル報告（新規）: `/trouble-report`・**ログイン必須**

### お問い合わせ（COM-008）改修内容
現行の `contacts` テーブル（last_name/first_name/email/contact_types[]/content）を新 migration で全面的に組み替える。旧カラム（last_name, first_name, contact_types, content）は撤廃。

新しい入力項目とカラム:
- 【基本情報】会社名／屋号(company_name・必須)、氏名(name・必須・1欄)、電話番号(phone・必須)、メールアドレス(email・必須)、所在地(address・任意)
- 【お問い合わせについて】お問い合わせ内容(inquiry_type・必須・単一選択)、ビジ友の利用目的(purpose・必須・単一選択)、業種・職種(trade_type・必須・単一選択)
- 【案件情報】工事内容(project_description・任意・テキスト)、工事エリア(project_area・任意・テキスト)
- 【動画掲載の相談】動画掲載の相談(video_consultation・任意・単一選択)
- 【詳細・添付】問い合わせ詳細(detail・必須・複数行テキスト)、資料添付(attachments・任意)
- user_id(任意・nullable): ログイン中に送信した場合は自動で送信者の user_id を記録、非ログインは null。フォームの見た目・入力の手間は変えず裏で記録するだけ。将来 admin が「登録ユーザー○○からの問い合わせ」と分かるようにするため

選択肢（ラベル文字列で保存）:
- お問い合わせ内容: 登録方法／料金について／仕事掲載／協力会社募集／職人募集／その他
- ビジ友の利用目的: 仕事を依頼したい／協力会社を探したい／職人として仕事を探したい／元請けになりたい／サービスを詳しく知りたい
- 業種・職種: 大工／左官／タイル／電気／設備／内装／解体／外構／塗装／その他（※profile の master_trade_types とは別物の簡易リスト。問い合わせ分類用）
- 動画掲載の相談: 会社紹介動画を作りたい／施工動画を掲載したい／相談したい

レイアウト: 上記4〜5セクションに区切り、全項目を常時表示。任意項目は〔任意〕表記。選択は shadcn Select（単一選択）。レート制限（同一メール1時間5件）は維持。

### トラブル報告（COM-012）新規
新規 `trouble_reports` テーブル。ログイン必須（(authenticated) 配下）。シンプル設計。

入力項目とカラム:
- user_id(必須・自動): 報告者。auth.uid() を自動記録
- 氏名(reporter_name・必須): ログイン中ユーザーの登録氏名を初期値に入れて編集可
- トラブル相手の氏名(counterparty_name・必須)
- メールアドレス(email・必須・手入力): 登録メールを初期値に入れて編集可
- トラブル種類(category・任意・単一選択): 連絡が取れない／支払いトラブル／仕事内容が違う／迷惑行為／その他（ラベル保存）
- 内容(content・必須・自由記入テキスト)
- 資料添付(attachments・任意)
- マイページに導線を追加（href と実ルートの一致を確認。mypage link audit ルール遵守）

### 横断的な設計決定
- **名前ラベルは全画面「氏名」で統一**（既存アプリが「氏名」で統一されているため。「お名前」は使わない）
- **選択式は全て単一選択**（shadcn Select）。トラブル種類も単一
- **選択肢はラベル文字列で保存**。後から選択肢を増減・改名・削除しても過去データは壊れない。当面はコード定数（`contact-options.ts` 等）で管理し、将来「運営が管理画面から編集」が必要なら master テーブル方式に格上げ可能（admin 一括実装時に検討）
- **添付ファイル**: 非公開バケット `support-attachments` を新規作成。画像/PDF・最大5枚・各5MB。anon も INSERT 可（お問い合わせが非ログインのため）、authenticated も INSERT 可、**SELECT は admin のみ**。ファイルパスを text[] で保存し、表示（admin画面・後日）は署名付きURL。Server Action 内で file.size/file.type を直接検証（z.instanceof(File) は使わない）
- **管理画面は本 spec の対象外**。データの器（contacts 組み替え・trouble_reports 新規・両方に admin 読み取り可 RLS・admin 読み取り可バケット）だけ用意し、「お問い合わせ／トラブル報告の admin 一覧・詳細画面は admin spec で別途実装する（ADM-016/017 お問い合わせ、ADM-018/019 トラブル報告として 2026-06-09 に admin spec で定義済み）」と spec に明記する（将来の admin 一括実装が器の存在を把握できるように）

### 注意・既存資産
- COM-008 の現行実装は contactSchema が `src/lib/validations/profile.ts`、CONTACT_TYPES が `src/lib/constants/profile-options.ts` にあり profile spec 配下に紛れている。spec-requirements/design 時に正確な所在を確認し、問い合わせ系として整理する
- admin の器（layout/dashboard/users/video）は video-display spec で実装済み。新管理画面を足す際は users パターン（createAdminClient + サーバー側フィルタ + 20件ページング）を踏襲（これは将来の admin spec での話）
- CLAUDE.md の既存ルール遵守: フォーム内ボタンの type 明示、shadcn Select の E2E 2段クリック、react-hook-form の初期値同期待ち（プリフィル項目）、非公開バケットの署名付きURL、FormData の File はインライン検証、ナビゲーションリンクと実ルートの一致
- テスト方針（リスクベース）: 書き込み+権限系なのでフルテスト。tasks.md 先頭に既存テスト全実行（デグレ確認）を含める。pgTAP で RLS（admin のみ SELECT、トラブル報告は本人のみ INSERT）、E2E で両フォーム送信＋添付＋マイページ導線

## Introduction

本機能は、ビジ友のユーザー向け「お問い合わせ」フォーム（COM-008）の全面改修と、新規「トラブル報告」フォーム（COM-012）の追加を扱う。お問い合わせはログインの有無を問わず送信でき、トラブル報告はログイン必須とする。両者とも将来ビジ友の管理者（admin）が管理画面から閲覧・対応できるようにするが、**管理画面そのものは本 spec の対象外**であり、本 spec ではユーザー側フォームと「データの器」（テーブル・RLS・Storage バケット）までを構築する。データは最初から管理者が読み取れる構造で蓄積し、将来の admin 一括実装が器のやり直し無しに乗るようにする。

### 選択肢一覧（ラベル文字列で保存・単一選択）

| 項目 | 必須 | 対象 | 選択肢 |
|---|---|---|---|
| お問い合わせ内容 (inquiry_type) | 必須 | お問い合わせ | 登録方法／料金について／仕事掲載／協力会社募集／職人募集／その他 |
| ビジ友の利用目的 (purpose) | 必須 | お問い合わせ | 仕事を依頼したい／協力会社を探したい／職人として仕事を探したい／元請けになりたい／サービスを詳しく知りたい |
| 業種・職種 (industry) | 必須 | お問い合わせ | 大工／左官／タイル／電気／設備／内装／解体／外構／塗装／その他（※`master_trade_types` とは別の問い合わせ分類用簡易リスト。`user_skills.trade_type` と紛らわしいため列名は `industry` とする。画面表示は「業種・職種」のまま） |
| 動画掲載の相談 (video_consultation) | 任意 | お問い合わせ | 会社紹介動画を作りたい／施工動画を掲載したい／相談したい |
| トラブル種類 (category) | 任意 | トラブル報告 | 連絡が取れない／支払いトラブル／仕事内容が違う／迷惑行為／その他 |

## Requirements

### Requirement 1: お問い合わせフォームの送信（ログインの有無を問わない）

**Objective:** As a サイト訪問者（ログイン有無を問わない）, I want お問い合わせフォームから問い合わせを送信したい, so that 登録方法・料金・各種募集などについて運営に相談できる

#### Acceptance Criteria
1. When 未ログインの訪問者が `/contact` にアクセスする, the お問い合わせフォーム shall フォームを表示し送信を許可する
2. When ログイン済みユーザーが `/contact` にアクセスする, the お問い合わせフォーム shall 同一のフォーム・同一の入力項目を表示し送信を許可する
3. When 全必須項目を満たして送信する, the Support サービス shall 問い合わせ内容を `contacts` テーブルに保存し、受付完了メッセージを表示する
4. When 送信が完了する, the お問い合わせフォーム shall 完了画面（受付メッセージ＋トップへ戻る導線）を表示する
5. If 保存に失敗する, then the Support サービス shall ユーザー向けの日本語エラーメッセージを表示し、技術的なエラー詳細を画面に出さない

### Requirement 2: お問い合わせの入力項目と検証

**Objective:** As a 問い合わせ送信者, I want 必要な情報を構造化して入力したい, so that 運営が内容を正確に把握して対応できる

#### Acceptance Criteria
1. The お問い合わせフォーム shall 会社名／屋号・氏名・電話番号・メールアドレスを必須テキスト入力として要求する
2. The お問い合わせフォーム shall 所在地・工事内容・工事エリアを任意テキスト入力として提供する
3. The お問い合わせフォーム shall お問い合わせ内容・ビジ友の利用目的・業種職種をそれぞれ単一選択の必須項目として提供する
4. The お問い合わせフォーム shall 動画掲載の相談を単一選択の任意項目として提供する
5. The お問い合わせフォーム shall 問い合わせ詳細を必須の複数行テキストとして要求する
6. The お問い合わせフォーム shall 全項目をセクション（基本情報／お問い合わせについて／案件情報／動画掲載の相談／詳細・添付）に区切って常時表示し、任意項目に〔任意〕表記を付す
7. If 必須項目が未入力、またはメールアドレスの形式が不正である, then the Support サービス shall クライアント・サーバーの両方で検証し、該当項目に日本語エラーを表示して送信を中断する
8. The Support サービス shall 選択項目の値を定義済みラベルの許可リストに対して検証する

### Requirement 3: ログインユーザーへの紐付け

**Objective:** As a 運営（管理者）, I want ログイン中に送信された問い合わせを送信ユーザーに紐付けたい, so that 後日その人のプラン・利用状況を踏まえて対応できる

#### Acceptance Criteria
1. When ログイン済みユーザーが問い合わせを送信する, the Support サービス shall 送信者の user_id を `contacts.user_id` に記録する
2. When 未ログインの訪問者が問い合わせを送信する, the Support サービス shall `contacts.user_id` を null として保存する
3. The お問い合わせフォーム shall user_id 記録のための入力欄や追加操作をユーザーに課さない（裏側で記録する）
4. The Support サービス shall user_id をフォーム送信値ではなくサーバー側のログインセッションから取得する（他人へのなりすまし防止）【⑥】

### Requirement 4: お問い合わせのスパム・レート制限

**Objective:** As a 運営, I want 短時間の大量送信を抑止したい, so that スパムやいたずらを軽減できる

#### Acceptance Criteria
1. While 同一メールアドレスからの直近1時間の送信が5件以上である, when 新たな送信が行われる, the Support サービス shall 送信を拒否し上限到達メッセージを表示する
2. The Support サービス shall レート制限の判定をサーバー側で行う（クライアント側のみの制限に依存しない）
3. The Support サービス shall レート制限の件数集計を RLS をバイパスするサーバー専用クライアントで実行する（`contacts` の SELECT は管理者のみ許可のため、送信者本人の権限では件数が常に0となり制限が機能しないため）【①: 現行コードの潜在バグを修正】

### Requirement 5: トラブル報告フォームの送信（ログイン必須・本人紐付け）

**Objective:** As a ログイン済みユーザー, I want トラブル相手と内容を報告したい, so that 運営にトラブルを相談・記録してもらえる

#### Acceptance Criteria
1. While 未ログインである, when `/trouble-report` にアクセスする, the システム shall ログイン画面へリダイレクトしフォームを表示しない
2. When ログイン済みユーザー（contractor／client／staff のいずれでも）がアクセスする, the トラブル報告フォーム shall フォームを表示する（受注者アクション制限の対象外）
3. When 全必須項目を満たして送信する, the Support サービス shall 報告内容を `trouble_reports` テーブルに保存し、受付完了メッセージを表示する
4. The Support サービス shall `trouble_reports.user_id` を送信者本人の id として記録する（クライアントからの改ざんを許さない）
5. If 保存に失敗する, then the Support サービス shall 日本語エラーメッセージを表示し、技術的詳細を画面に出さない
6. While 同一ユーザーからの直近1時間のトラブル報告が5件以上である, when 新たな送信が行われる, the Support サービス shall サーバー側（RLS をバイパスするサーバー専用クライアントでの件数集計）で送信を拒否する【おまけ: トラブル報告にも連投防止】

### Requirement 6: トラブル報告の入力項目・プリフィル・検証

**Objective:** As a 報告者, I want 自分と相手の氏名・連絡先・内容をシンプルに入力したい, so that 手間なく正確に報告できる

#### Acceptance Criteria
1. When ログイン済みユーザーがフォームを開く, the トラブル報告フォーム shall 氏名とメールアドレスに登録済みの値を初期表示し、編集を許可する
2. The トラブル報告フォーム shall 氏名・トラブル相手の氏名・メールアドレス・内容を必須項目として要求する
3. The トラブル報告フォーム shall トラブル種類を単一選択の任意項目として提供する
4. If 必須項目が未入力、またはメールアドレスの形式が不正である, then the Support サービス shall クライアント・サーバーの両方で検証し、該当項目に日本語エラーを表示して送信を中断する

### Requirement 7: 添付ファイル（お問い合わせ・トラブル報告 共通）

**Objective:** As a 送信者, I want 図面・現場写真・見積書などを添付したい, so that 状況を具体的に伝えられる

#### Acceptance Criteria
1. The お問い合わせフォーム and the トラブル報告フォーム shall 任意で最大5件までのファイル添付を許可する
2. The Support サービス shall 画像（JPEG／PNG）と PDF のみを許可し、それ以外のファイルタイプを拒否する
3. The Support サービス shall 1ファイルあたり5MBを上限とし、超過するファイルを拒否する
4. The Support サービス shall MIMEタイプとファイル拡張子の両方を検証する
5. When 添付付きで送信する, the Support サービス shall ファイルを非公開バケット `support-attachments` に保存し、保存パスを該当レコードの `attachments`（text[]）に記録する
6. The Support サービス shall 保存ファイル名をランダムな一意の文字列に変換し、元のファイル名を保存パスに用いない
7. If ファイルのアップロードまたはレコード保存のいずれかが失敗する, then the Support サービス shall 送信を中断しエラーを表示し、**既にアップロード済みのファイルを残さない**（持ち主不明の孤児ファイルを作らない。保存順序と失敗時のクリーンアップは設計で確定する）【③】

### Requirement 8: データ保存とアクセス制御（管理者向けデータの器）

**Objective:** As a 運営（管理者）, I want 問い合わせ・トラブル報告を将来の管理画面から閲覧できる形で蓄積したい, so that 後日まとめて実装する管理画面でやり直しなく対応できる

#### Acceptance Criteria
1. The Support サービス shall すべての対象テーブル・バケットで RLS を有効化し、デフォルト拒否とする
2. The Support サービス shall `contacts` と `trouble_reports` の SELECT を管理者（role='admin'）のみに許可する
3. The Support サービス shall お問い合わせ・トラブル報告の書き込み系処理（レート制限の件数集計・レコード保存・ファイル保存）を、RLS をバイパスするサーバー専用の管理者権限クライアントで実行する（公開フォームのため送信者権限では件数集計が成立しないため）【①④】
4. The Support サービス shall `trouble_reports` の保存時に user_id を本人（auth.uid()）として記録し、本人以外の id での保存を許さない
5. The Support サービス shall `contacts` と `trouble_reports` に対する一般ユーザー・匿名からの UPDATE・DELETE を許可しない
6. The Support サービス shall `support-attachments` バケットを管理者専用とし、一般ユーザー・匿名からの直接の読み書きを許可しない（ファイルの保存・取得はサーバー専用クライアントが代行する）【④: 倉庫の鍵を単純化】
7. Where 添付ファイルを表示する必要がある, the Support サービス shall 有効期限付きの署名付きURLを生成して用いる（非公開バケットのため）

### Requirement 9: 選択肢の保守性

**Objective:** As a 開発・運営, I want 選択肢を後から増減・改名できる, so that 既存データを壊さずに運用変更へ対応できる

#### Acceptance Criteria
1. The Support サービス shall 選択項目の値を、番号やコードではなくラベル文字列として保存する
2. Where 選択肢リストが追加・改名・削除される, the Support サービス shall 過去に保存された値を当時のラベルのまま保持・表示する
3. The Support サービス shall 選択肢リストをコード定数として管理する（将来の master テーブル化への移行を許容する）

### Requirement 10: ナビゲーション・画面登録

**Objective:** As a ログイン済みユーザー, I want マイページからトラブル報告に到達したい, so that 必要なときに迷わず報告できる

#### Acceptance Criteria
1. The システム shall マイページにトラブル報告（`/trouble-report`）への導線を追加する
2. The システム shall すべての追加導線リンクの href を実在するルートと一致させる
3. The お問い合わせフォーム and the トラブル報告フォーム shall 「戻る」導線を提供する
4. The システム shall 画面ID（お問い合わせ＝COM-008、トラブル報告＝COM-012）を screen-map に登録する

## 非機能要件

### セキュリティ
- 三重防御（Middleware → Server Action → RLS）を遵守する。トラブル報告のログイン必須は Middleware と RLS の両方で担保する
- Zod スキーマでクライアント・サーバー両方を検証し、許可リスト方式を用いる。エラーメッセージに内部情報を含めない
- 電話番号は管理者のみが閲覧できる（公開プロフィールには出さない。PII 保護方針に準拠）
- 添付は非公開バケットに保存し、ファイル名はランダム化する（元ファイル名からの情報漏洩防止）

### UI・文言
- UIテキストは自然な日本語とする。名前ラベルは全画面「氏名」で統一する（既存アプリの表記に合わせ「お名前」は使わない）
- デザインは同系統の既存フォーム（COM-008 等）のスタイル・余白・ボタン規約に合わせる

### 実装規約（CLAUDE.md 準拠・設計フェーズで具体化）
- フォーム内ボタンの `type` 明示、shadcn Select の E2E 2段クリック、react-hook-form の初期値同期待ち（プリフィル項目）、FormData の File はインライン検証
- **Server Action のリクエストサイズ上限**: `next.config` の `serverActions.bodySizeLimit` を現状の `"6mb"` から **30MB 程度**へ引き上げる（添付 最大5枚×5MB=25MB がフレームワーク段階で弾かれてランタイムエラーになるのを防ぐ）【②】

### 添付上限と悪用リスクの扱い【⑤】
- 添付の上限は **5枚・1ファイルあたり5MB（合計最大25MB）** とする（据え置き）
- お問い合わせは非ログインで送信できるため、匿名による大容量・連投の余地は公開フォームの制約として完全には排除できない。①のレート制限が正しく機能することと、枚数・サイズ上限・ファイル種別制限により実用上のリスクを許容範囲に抑える方針とする

### テスト（リスクベース＝書き込み＋権限系のためフル）
- `tasks.md` 先頭に既存テスト全実行（デグレ確認）を含める
- pgTAP で RLS（両テーブルとも admin のみ SELECT、trouble_reports は本人のみ INSERT、UPDATE/DELETE 拒否）を検証する
- E2E で「お問い合わせ送信（匿名＋ログイン）＋添付」「トラブル報告送信＋添付」「マイページ→トラブル報告の導線クリック」を検証する

## スコープ外（本 spec では実装しない）
- 管理画面（お問い合わせ／トラブル報告の admin 一覧・詳細）。将来の admin spec で users パターン（createAdminClient＋サーバー側フィルタ＋20件ページング）を踏襲して実装する。本 spec はデータの器（テーブル・RLS・バケット）までを用意する
- 管理者への新着通知メール（将来検討）
- 選択肢の管理画面からの編集（master テーブル化）。当面はコード定数で管理する
- 添付ファイル閲覧の監査ログ記録（admin 画面実装時に検討）
