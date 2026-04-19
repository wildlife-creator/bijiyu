# 組織管理機能（organization）— 要件定義

## 概要

法人プラン向けの機能。スカウトメッセージテンプレート管理、発注者プロフィール管理、担当者管理を提供する。

**本仕様書の実装は既存コードの広範なリファクタリングを伴う**（発注者表示名を `client_profiles.display_name` に一本化、`organizations.name` カラムを廃止する方針変更のため）。CLI-016〜025 の画面実装に着手する**前に**実施するリファクタリング手順は、本仕様書末尾の [付録 A: 実装前提リファクタリング手順（実装者向け）](#付録-a-実装前提リファクタリング手順実装者向け) に集約している。

## 対象画面

| 画面ID | 画面名 | 概要 |
|--------|--------|------|
| CLI-016 | スカウトメッセージテンプレート一覧 | テンプレートのリスト表示 |
| CLI-017 | スカウトメッセージテンプレート詳細 | テンプレートの内容表示 |
| CLI-018 | スカウトメッセージテンプレート編集 | 既存テンプレートの編集 |
| CLI-019 | スカウトメッセージテンプレート新規作成 | 新規テンプレートの作成 |
| CLI-020 | 発注者情報詳細 | 会社情報・メッセージ・評判の表示 |
| CLI-021 | 発注者情報編集 | 会社情報の編集フォーム |
| CLI-022 | 担当者一覧 | 担当者リスト |
| CLI-023 | 担当者詳細 | 担当者の情報表示 |
| CLI-024 | 担当者編集 | 担当者情報の編集 |
| CLI-025 | 担当者新規作成 | 新規担当者の作成 |
| AUTH-008 | 招待承諾・パスワード設定 | 招待された担当者が初回パスワードを設定する画面（詳細は REQ-ORG-010 および「共通仕様」参照） |

## 対象ロール

### CLI-024 の役割（担当者編集専用）

CLI-024 は **法人プランの Admin / Staff（= Owner / Admin が CLI-025 で作成した配下アカウント）の編集・削除専用の画面**。Owner 自身の情報編集は対象外とし、Owner は一般ユーザー向けのプロフィール編集画面（`/profile/edit` 等の COM 系）で自分の情報を更新する。

**理由:**
- Owner は自分で新規登録（AUTH系）したアカウントなので、一般ユーザーと同じくプロフィール編集画面を持つ
- Admin / Staff は Owner/Admin が作成した配下アカウントで、一般ユーザー向けのプロフィール画面では編集できない項目（権限・代理フラグ等）を扱う必要があるため、CLI-024 を専用画面として用意する

### 各ロールの操作範囲

- **発注者（Client）全般**: テンプレート管理 + 発注者情報（CLI-020/021）管理。担当者管理（CLI-022〜025）は法人プランのみ
- **管理責任者（Owner）**: 全操作可能
  - 自分自身の氏名・メール・その他個人情報: **`/profile/edit` で編集**（CLI-024 は使わない）
  - 自分自身の会社情報（発注者プロフィール）: CLI-021 で編集
  - Admin / Staff の作成・編集・削除: CLI-025 / CLI-024 で操作
  - 退会したい場合は COM-006（`/profile/withdrawal`）から実行（後述「画面外運用」参照）
- **管理者（Admin）**: 担当者（Staff）の作成・編集・削除が可能。自分自身の氏名・メール編集も CLI-024 で可能。他の Admin / Owner の編集、および管理者（Admin）の新規作成・自己削除は不可
- **担当者（Staff）**: スカウトテンプレートは組織の共有資産として閲覧・作成・編集・削除が可能。担当者一覧（CLI-022）・詳細（CLI-023）も閲覧可（新規作成ボタンは非表示）。自分自身の氏名・メール編集のみ CLI-024 で可能。他メンバーの編集・削除・自身の削除は不可。発注者情報（CLI-020）は閲覧のみ可

### CLI-022/023 への Owner の表示

- **CLI-022（担当者一覧）**には Owner も「管理責任者」タグ付きで一覧表示する（組織全員の構成を把握するため）
- **CLI-023（担当者詳細）**で Owner の行を開いた場合、Owner 本人が開いたときのみ「プロフィールを編集」ボタンを表示して `/profile/edit` へ遷移させる。他ロール（Admin / Staff）が Owner の詳細を開いた場合は編集・削除ボタンとも非表示
- Owner 本人が CLI-022 から自分の行をクリック → CLI-023 で自分の詳細を表示 → 「プロフィールを編集」で `/profile/edit` へ、という動線になる。CLI-024 には到達しない

### CLI-023（担当者詳細）の編集・削除ボタン表示ルール

自分がどのロールで、どの行を開いたかで、編集ボタン・削除ボタンの表示と遷移先が決まる。

| 自分のロール | 開いた対象 | 編集ボタン | 遷移先 | 削除ボタン |
|---|---|:-:|---|:-:|
| Owner | Owner 自身 | ○「プロフィールを編集」 | `/profile/edit` | × |
| Owner | Admin | ○「編集する」 | CLI-024 | ○ |
| Owner | Staff | ○「編集する」 | CLI-024 | ○ |
| Admin | Owner | × | — | × |
| Admin | Admin 自身 | ○「プロフィールを編集」 | CLI-024（自己編集モード） | × |
| Admin | 他 Admin | × | — | × |
| Admin | Staff | ○「編集する」 | CLI-024 | ○ |
| Staff | Owner | × | — | × |
| Staff | Admin | × | — | × |
| Staff | 他 Staff | × | — | × |
| Staff | Staff 自身 | ○「プロフィールを編集」 | CLI-024（自己編集モード） | × |

※ 編集・削除ボタンが × の行は、CLI-023 詳細画面にボタン自体を表示しない。
※ URL 直打ちで CLI-024 に権限外で到達した場合の挙動:
  - Owner が `CLI-024?id=自分のID` を開いた場合 → **`/profile/edit` へリダイレクト**
  - Admin / Staff が権限外の ID（他メンバー）で CLI-024 を開いた場合 → Server Action で 403 相当の拒否
※ Owner が退会したい場合は COM-006（`/profile/withdrawal`）から実行する。CLI-024 には「退会する」リンクも削除ボタンも置かない。サブスクのみ停止したい場合は CLI-026 系のプラン解約を別途利用（後述「画面外運用」参照）。

## 機能要件

### スカウトテンプレート（CLI-016〜019）

#### REQ-ORG-001: テンプレート一覧（CLI-016）

- 自分（または所属組織）のスカウトテンプレートを一覧表示する
- 表示項目:
  - 個人発注者・小規模事業主プラン（`organization_id IS NULL`）: タイトル、本文プレビュー（先頭 80 字程度で切って「…」）、作成日
  - 法人プラン（`organization_id IS NOT NULL`）: 上記に加えて**作成者氏名**（`owner_id` → `users.last_name + first_name`。組織共有のため誰が作成したかを明示）
- 並び順: `updated_at` 降順（最近編集したものが上。UI には更新日時を表示しないが、ソートキーとしては使用する）
- ページネーション: 20 件ずつ
- 0 件時の表示: 「テンプレートはまだ作成されていません。『新規作成』から追加してください」
- 「新規作成」ボタン → CLI-019 へ遷移
- 各テンプレートクリック → CLI-017 へ遷移
- 操作権限: 発注者（個人/小規模）は本人のテンプレートを操作可能。法人プランの組織メンバー（owner / admin / staff）は組織内で共有されるテンプレートを全員 CRUD 可能（組織の共有資産として扱う）

#### REQ-ORG-002: テンプレート詳細（CLI-017）

- テンプレートの全内容を表示する
- 表示項目:
  - 共通: タイトル、本文、メモ、作成日（`created_at`）
  - 法人プラン（`organization_id IS NOT NULL`）のみ追加: **作成者氏名**（`owner_id` → `users.last_name + first_name`）
  - 最終更新日・最終更新者・利用回数は表示しない（テンプレに下書き保存や履歴管理の概念がないため、表示しても実用価値がない）
- 「編集する」ボタン → CLI-018 へ遷移
- 「削除する」ボタン → 確認ポップアップ → 削除
- 操作権限: REQ-ORG-001 と同じ。法人プランでは組織メンバー全員が他メンバー作成のテンプレートも編集・削除可能（組織共有のため）

#### REQ-ORG-003: テンプレート編集（CLI-018）

- 既存テンプレートの内容を編集する
- 編集可能フィールド: タイトル、本文、メモ
- 保存成功時: CLI-017 へ遷移
- アクセス権限: 発注者本人。法人プランの場合は組織メンバー全員（owner / admin / staff）。他組織・他人のテンプレートは Middleware / Server Action / RLS でブロック

#### REQ-ORG-004: テンプレート新規作成（CLI-019）

- 新規テンプレートを作成する
- 入力フィールド:
  - タイトル（必須）
  - 本文（必須）
  - メモ（任意）
- scout_templates テーブルにデータを保存
- 法人プランの場合: `organization_id` を作成者の所属組織に自動設定（組織内で共有）。`owner_id` は作成したメンバーに設定(監査目的。編集権限には影響しない）
- 個人/小規模プランの場合: `organization_id = NULL`、`owner_id = 作成者`
- 保存成功時: CLI-017 へ遷移
- アクセス権限: 発注者本人。法人プランの場合は組織メンバー全員（owner / admin / staff）

#### REQ-ORG-004-B: スカウト送信画面でのテンプレ利用（CLI-014/015）

CLI-014/015 のスカウト送信フォームには既存の「スカウトテンプレートを選択」プルダウンを設置済み（messaging spec 実装時に配置）。CLI-016〜019 でテンプレが作成可能になった時点で、既存プルダウンがそのまま機能する。以下の挙動を確定する:

- **表示対象**: RLS で絞り込み（個人発注者は自分のテンプレ、法人プランの組織メンバーは組織共有テンプレ全件）
- **並び順**: `updated_at` 降順（CLI-016 と同じ。直近に編集したテンプレが上位）
- **選択時のプリフィル**:
  - タイトル・本文が両方空の場合 → 確認なしでテンプレ内容をプリフィル
  - タイトル・本文のいずれかに入力がある場合 → `window.confirm("入力中の内容がテンプレートで上書きされます。よろしいですか？")` を表示し、OK のときのみ上書き、キャンセルで据え置き
- **選択後の編集**: タイトル・本文とも送信前にインラインで編集可能。編集してもテンプレ本体（`scout_templates` レコード）には影響しない（その場限りの変更）
- **「スカウトからテンプレを保存」ボタン**: Phase 1 では実装しない。テンプレ作成は CLI-019（テンプレ新規作成画面）から行う

既存実装の修正点（付録 A の実装タスクに含める）:
- `src/app/(authenticated)/messages/scout-send/page.tsx`: `scout_templates` の `.order("created_at")` を `.order("updated_at")` に変更
- `src/app/(authenticated)/messages/scout-send/scout-send-form.tsx`: `handleTemplateSelect` に「既に入力中なら confirm ダイアログで確認」のロジックを追加

### 発注者プロフィール（CLI-020〜021）

#### REQ-ORG-005: 発注者情報詳細（CLI-020）

- 発注者（自社）のプロフィール情報を表示する
- 表示項目（デザインカンプ CLI-020.png に準拠）:
  - プロフィール画像
  - 社名・氏名（`client_profiles.display_name`）+ 住所（`client_profiles.address`）
  - 基本情報（表形式）:
    - 募集職種（`client_profiles.recruit_job_types`）— 会社として全般的に扱う職種
    - 募集エリア（`client_profiles.recruit_area`）
    - 従業員規模（`client_profiles.employee_scale`）
    - 求める働き方（`client_profiles.working_way`）
    - 言語（`client_profiles.language`）
  - メッセージ（`client_profiles.message`）
  - 評判（`client_reviews` の集計、デザインカンプ CLI-020.png に準拠）:
    - 集計対象: 当該発注者に対する全受注者からの評価（`client_reviews WHERE reviewee_id = 発注者.user_id`）
    - 表示形式: 評価項目ごとに「(項目名) 👍 (Good 数)」を列挙。例:「また仕事を受けたい 👍 3」
    - 対象項目: `rating_again`（また仕事を受けたいか）を Good 数で集計（Phase 1）
    - 0 件時の表示: 「評判はまだありません」
    - 詳細コメント・ページネーションは CLI-028（発注者評価）に委譲し、CLI-020 ではサマリーのみ
- データソース: `client_profiles` テーブル（上記表示項目に該当するカラムのみ）+ `client_reviews`（評判集計）
- **利用 SNS は受注者には表示しない**（`sns_x` / `sns_instagram` / `sns_tiktok` / `sns_youtube` / `sns_facebook` は運営の集計用のみで CLI-020 には出さない）
- 「編集する」ボタン → CLI-021 へ遷移（担当者には非表示）
- 「担当者を確認する」ボタン → CLI-022 へ遷移（法人プランの組織メンバー全員に表示。個人/小規模プランには非表示）
- 操作権限:
  - 管理責任者/管理者: 閲覧・編集可。担当者一覧への導線あり
  - 担当者: 閲覧のみ（編集ボタンは非表示。「担当者を確認する」ボタンは**表示する**。CLI-022 への閲覧アクセス権があるため）

#### REQ-ORG-006: 発注者情報編集（CLI-021）

- アクセス権限: 管理責任者/管理者のみ（担当者は Middleware でブロック）
- **発注者としての公開情報を全てこの画面で編集する。受注者に見える発注者情報 = この画面で入力した内容。**
- 編集可能フィールド（デザインカンプ CLI-020.png / CLI-021.png に準拠。入力順・必須マーク配置はカンプに従う）:
  - プロフィール画像（JPEG/PNG、最大5MB）→ `client_profiles.image_url`（「画像を登録する」ボタンから選択）
  - **社名・氏名（プラン別に必須/任意）** → `client_profiles.display_name`。受注者に見える発注者の表示名。プレースホルダー「○○株式会社」
    - 法人プラン（corporate / corporate_premium）: **必須**
    - 個人発注者プラン / 小規模事業主プラン（`individual` / `small`）: **任意**。Webhook が課金時に `client_profiles.display_name` のデフォルト値として `users.last_name + first_name`（受注者登録時に入力した姓名）を格納済みのため、空欄のまま保存しても受注者側で「名無し」にはならない
  - 住所（任意）→ `client_profiles.address`。プレースホルダー「東京都墨田区○○XX-X-XX」。社名・氏名の直下に配置
    - 注: 現行 `design-assets/screens/CLI-021.png` には住所入力欄が描かれていないが、CLI-020 で住所を表示するため本画面に追加する仕様。デザインカンプの再描画は別タスク（付録 A で言及）
  - **募集職種（必須、複数選択、OptionSets）** → `client_profiles.recruit_job_types`。会社として全般的に扱う職種（案件ごとの職種は `jobs.trade_type` で別管理）
  - **募集エリア（必須、複数選択、OptionSets）** → `client_profiles.recruit_area`
  - 従業員規模（任意、数値）→ `client_profiles.employee_scale`（プレースホルダー「100」、単位「人」）
  - 求める働き方（任意、OptionSets）→ `client_profiles.working_way`
  - 言語（任意、OptionSets）→ `client_profiles.language`
  - 発注者メッセージ（任意、複数行テキスト）→ `client_profiles.message`
  - 利用 SNS（任意、各独立チェックボックス）→ `client_profiles.sns_x` / `sns_instagram` / `sns_tiktok` / `sns_youtube` / `sns_facebook`
    - ラベル順: X、Instagram、TikTok、YouTube、Facebook（デザインカンプに準拠）
    - セクション見出し下に注記を表示:「※ 運営上の集計等のみに使用し、webアプリ上に表示はされません」
    - アカウント名や URL は一切入力させない。チェックの ON/OFF のみ保存する
- 更新対象テーブル: **`client_profiles` のみ**（全プラン共通。`organizations` テーブルは更新しない）
- 保存成功時: CLI-020 へ遷移
- **プラン購入後の初回遷移（`?setup=true` モード、全プラン共通）**: 全プランの Stripe Checkout success_url を CLI-021?setup=true に統一する。旧 `/mypage/organization-setup` 暫定画面と個人・小規模プランの `/mypage?checkout=success` 遷移は廃止し、すべて CLI-021 に集約する。`/mypage/organization-setup` に直接アクセスされた場合も CLI-021 にリダイレクトする
  - **表示**: 画面上部にセットアップバナーを表示
    - 法人プラン: 「プラン登録が完了しました。社名の入力が必須です（後からいつでも編集できます）」
    - 個人・小規模プラン: 「プラン登録が完了しました。発注者として利用する場合は社名または氏名を入力してください。受注者機能のみ利用する方はスキップ可（後からいつでも編集できます）」
  - **法人プラン**: `display_name` 必須、「スキップ」ボタン**非表示**。保存成功後に CON-001 へ遷移
  - **個人・小規模プラン**: `display_name` 任意、「スキップして後で設定する」ボタンを**表示**。スキップ押下時は DB 操作を行わず CON-001 へ遷移（Webhook が `client_profiles.display_name` にデフォルト格納した姓名がそのまま表示名として使われる）
  - **プリフィル**: 入力欄には `client_profiles.display_name` の現在値を表示（Webhook がデフォルト格納した `users.last_name + first_name` = 受注者登録時に入力した姓名、またはユーザーが以前編集した値）。ユーザーは上書きまたはそのまま保存できる
  - **再アップグレード時の冪等性**: `?setup=true` は常にセットアップバナーを表示する（「既に編集済みかどうか」の判定は行わない）。再アップグレード時は既存の編集済み display_name が prefill として表示されるため、法人ユーザーはそのまま保存するだけで完了。非法人ユーザーはスキップでよい
  - **プラン種別変更時の `display_name` prefill 挙動**（個人→法人、法人→個人等の遷移を含む）:
    - 既存 `client_profiles.display_name` の値を**常にそのまま prefill** する（プラン種別変更で値をリセットしない）
    - 例: 個人プラン時に「田中太郎」と入力 → 法人プランへアップグレード → CLI-021?setup=true で「田中太郎」が prefill → ユーザーは「田中工務店」に上書きして保存
    - 例: 法人プラン時に「田中工務店」と入力 → 個人プランへダウングレード → 後日 CLI-021 を開くと「田中工務店」が表示される（屋号として継続利用可）
    - Webhook は `client_profiles` の既存レコードに対しては `ON CONFLICT (user_id) DO NOTHING` 相当で動作するため、プラン種別変更で既存値を上書きすることは一切ない
    - **法人プランでの必須化は Zod バリデーション層で担保**: 個人→法人時に `display_name` が空文字の場合、Zod が保存時に拒否（「社名を入力してください」エラー）。ユーザーが CLI-021?setup=true で保存ボタンを押した時点で必須化される。スキップボタンは法人プランでは非表示のため、法人プラン移行直後に空文字のまま放置することはできない設計
    - **法人→個人→法人の往復ケース**: 最初の法人プランで「田中工務店」保存 → 個人プラン解約 → 再法人アップグレード → 「田中工務店」が prefill されてそのまま保存で完了（再入力不要）
  - **Webhook 未着時のアクセスガード緩和**: `?setup=true` 付き CLI-021 は、`users.role` や `subscriptions.plan_type` の確定を待たず認証済みユーザーに許可する（課金直後の race condition 対策）。保存 Server Action は Webhook 完了を前提とするため、未完了時は「プラン情報を反映中です。数秒後にもう一度お試しください」のエラーを返す
  - **受注者機能のみ利用目的で課金するユーザーへの配慮**: 個人・小規模プランのスキップ可仕様は、受注者機能の制限（登録職種×登録県）解除のみを目的に課金するユーザーへの配慮。発注者機能を使わないなら `display_name` は誰にも見えず、強制入力はフリクションにしかならないため

#### REQ-ORG-006-B: ダウングレード・解約・再加入時の `client_profiles` 取り扱い

発注者プロフィール（`client_profiles`）は、プラン状態が変化しても削除せず保持する。これにより再加入時の再入力をゼロにし、過去メッセージとの表示整合（「田中工務店」のまま見える）を保つ。

**データ保持ルール（全プラン共通）**:

| 状態遷移 | `client_profiles` の挙動 | `organizations` レコード | Owner の `users.role` | Admin / Staff の状態 |
|---|---|---|---|---|
| 初回加入（新規ユーザー） | 新規作成。`display_name` のデフォルト = `users.last_name + first_name` | 法人プラン時に `ensure_organization_exists` で作成 | 'contractor' → 'client' | — |
| CLI-021 で編集 | 該当カラムのみ更新 | 変化なし | 変化なし | 変化なし |
| ダウングレード / 解約 | **全カラム保持**（削除・リセットしない） | **保持**（削除しない）。法人→個人ダウングレード時も `organizations` + `organization_members` レコードは残す。billing 仕様書 REQ-BL-005 と整合。再アップグレード時に再利用 | 'client' → 'contractor' に降格 | **`role='staff'` のまま保持、`is_active=false` に設定してログイン不可化**（past_due の延長扱い。物理削除しない） |
| 再加入（既存 `client_profiles` あり） | **Webhook は `display_name` を含むどのカラムも上書きしない**。既存値（前回の編集内容）がそのまま引き継がれる | 既存 `organizations` を再利用（`ensure_organization_exists` が ON CONFLICT DO NOTHING 相当で動作） | 'contractor' → 'client' | **`is_active=true` に復帰**（past_due → active 復帰と同じロジック。billing Webhook `customer.subscription.created` ハンドラで実施） |

**受注者側からの見え方（降格後）**:

| 画面 / 場面 | 降格後の表示 | 理由 |
|---|---|---|
| 過去のメッセージスレッド | 「田中工務店」として表示（名前・アバターとも保持） | 進行中案件の継続やり取りを維持するため |
| 発注者一覧（CON-005）・発注者詳細（CON-006）・マイリスト（CON-007） | 非表示 | `.eq("role", "client")` で絞り込んでいるため降格者は除外される |
| 案件検索（CON-002） | 掲載中案件は全て `status = 'closed'` に変更されるため非表示 | billing 仕様書 REQ-BL-005 |
| 発注者評価（CLI-028） | 過去の評価は引き続き表示 | `client_reviews` は履歴データ |

**再加入時のセットアップフロー（CLI-021?setup=true）**:

- 入力欄に既存 `display_name` が prefill される（前回「田中工務店」と編集していればそのまま表示）
- 法人プランユーザーはそのまま保存するだけで完了（必須項目はすでに埋まっているため）
- 個人・小規模プランユーザーは引き続き「スキップして後で設定する」ボタンで CON-001 へ進める

**実装上の要点（設計フェーズで確認する）**:

- Webhook ハンドラ（`customer.subscription.updated` / `checkout.session.completed`）において `client_profiles` INSERT 時に `ON CONFLICT DO NOTHING` 相当の挙動にする（既存レコードがあれば何もしない）
- 初期化（`users.last_name + first_name` のコピー）は**初回 INSERT 時のみ**実行。UPDATE 時には走らせない

### 担当者管理（CLI-022〜025）— 法人プランのみ

#### REQ-ORG-007: 担当者一覧（CLI-022）

- 組織内のメンバー一覧を表示する（**Owner を含む全員**）
- 表示項目: 氏名、メールアドレス、権限タグ（管理責任者/管理者/担当者）、代理アカウントバッジ、「招待中」バッジ（`public.users.password_set_at IS NULL` の場合。パスワードをまだ設定していない ＝ 招待リンクからのパスワード設定が未完了の状態）
- 並び順: 権限降順（Owner → Admin → Staff）→ 同一権限内では `created_at` 昇順（先に登録された順）
- ページネーション: 20件ずつ
- **キーワード検索**（デザインカンプ CLI-022.png に準拠）: 画面上部に検索入力欄 + 検索ボタンを配置。氏名・メールアドレスを対象に部分一致で絞り込み。検索クエリは URL の `?q=...` で管理
- 「新規作成」ボタン → CLI-025 へ遷移（**owner / admin のみ表示。staff には非表示**）
- 各メンバー行クリック → CLI-023（詳細）へ遷移
- 0 件時の表示: 「該当する担当者が見つかりません」（検索結果 0 件）/ 「担当者はまだ登録されていません」（全件 0 件）
- 表示権限:
  - 管理責任者 / 管理者 / 担当者: 全メンバーを閲覧可能（組織の構成を共有する）
- 閲覧のみの staff からは新規作成ボタンが見えない状態
- **Owner 行の扱い**: 権限タグ「管理責任者」で表示。行をクリックした場合は CLI-023 で Owner 詳細を表示するが、そこからの編集導線は Owner 本人の場合のみ `/profile/edit` へ、他ロールが開いた場合は編集・削除ボタンとも非表示（「対象ロール」セクションの表に従う）
- **PC / SP 対応**: デザインカンプ CLI-022.png（PC）・CLI-022-design-sp.png（SP）の両方に従う。SP 版では権限タグをカラー表示、ボタン配置を縦積みにする等のレスポンシブ対応を行う

#### REQ-ORG-008: 担当者詳細（CLI-023）

- メンバー（Owner を含む全員）の情報を表示する
- 表示項目: 氏名、メールアドレス、権限、代理アカウントフラグ
- アクセス権限: 組織メンバー全員（owner / admin / staff）が閲覧可
- 「編集する」ボタン（自己の場合は「プロフィールを編集」ボタン）の表示・ラベル・遷移先: 「対象ロール」セクションの「CLI-023（担当者詳細）の編集・削除ボタン表示ルール」表に従う
  - Owner が自分自身の詳細を開いた場合 → 「プロフィールを編集」ボタンで `/profile/edit` へ遷移
  - Admin / Staff が自分自身の詳細を開いた場合 → 「プロフィールを編集」ボタンで CLI-024（自己編集モード）へ遷移
  - Owner / Admin が下位メンバーの詳細を開いた場合 → 「編集する」ボタンで CLI-024 へ遷移
  - その他（権限外）の場合 → ボタン自体を表示しない
- 「削除する」ボタンの表示: 同表に準拠。表示しない場合はボタンそのものを出さない
- 削除実行時の関連データ処理:
  - **organization_members**: 物理削除（組織のメンバー枠を空けるため）
  - **public.users**: そのまま残す（`deleted_at` を設定してソフトデリート）
  - **messages**: `sender_id` が削除対象の担当者になっている過去のメッセージはそのまま残す（過去のやり取りの記録として保持。送信者名は退会済みユーザー表示で対応）
  - **scout_templates**: `owner_id` が削除対象の担当者になっているテンプレートは、`owner_id` を組織の管理責任者（Owner。常に `organizations.owner_id` に一意決定され、複数 Admin がいる場合でも Admin には移譲しない）に移譲する（テンプレートは会社の資産として残す）
  - **client_profiles**: 発注者情報は組織 Owner 1 件に集約する設計のため、Admin / Staff は本機能で `client_profiles` を作成・編集しない（DB スキーマ上は `client_profiles.user_id` FK で誰でも持ちうるが、RLS および Server Action の論理制約で Owner のみに限定）。したがって Admin / Staff 削除時に `client_profiles` 側で行う処理は無し
- 削除確認ポップアップに「この担当者が作成したテンプレートは管理責任者に引き継がれます」と表示
- 管理責任者（owner）は CLI-024 からの削除不可（他メンバーからも本人からも不可）。Owner の退会は COM-006 経由（`/profile/withdrawal`）で行う。退会時は Admin の有無に関わらず**組織ごとソフトデリート**され、配下の Admin / Staff も連動してログイン不可化される（2026-04-19 C 案採用、「画面外運用」の退会セクション参照）。Owner 交代（契約者を別人に切り替える）は法人プラン**契約中に限り**運営経由で可能で、退会とは別プロセス（「管理責任者（Owner）の交代 パターン2」参照）

#### REQ-ORG-009: 担当者編集（CLI-024）

- **対象**: 法人プランの Admin / Staff の編集・削除専用。**Owner 自身の情報は本画面では編集しない**（Owner は `/profile/edit` で自分の情報を更新する）
- アクセス権限と編集対象範囲は「対象ロール」セクションの表に準拠
- **Owner が `CLI-024?id=自分のID` に URL 直打ちでアクセスした場合**: `/profile/edit` にリダイレクト（Server Action / Middleware で処理）
- **Admin / Staff が権限外の ID（自分以外 + 編集権限なし）で開いた場合**: Server Action で 403 相当の拒否
- **自分自身を編集する場合（Admin / Staff のみ）**:
  - 編集可能: 氏名（`users.last_name` / `users.first_name`）、メールアドレス
  - 編集不可（disabled 表示）: 権限（`org_role`）、代理アカウントフラグ
  - パスワード変更欄は本画面に置かない。パスワードを変更したい場合はログアウト後、ログイン画面（AUTH-002）の「パスワードを忘れた方」リンクから AUTH-003（パスワードリセット申請）→ AUTH-004（パスワード再設定）のフローで実施する（本プロジェクトはログイン中の「現在のパスワード入力 → 新パスワード設定」型画面を持たない方針。steering `authentication.md` L114 の認証フロー記載に準拠）
  - **アバター画像欄は置かない**（デザインカンプ `design-assets/screens/CLI-024.png` に含まれていない。Admin / Staff は受注者側のスレッド表示・CLI-022 / CLI-023 いずれにも個人アバターが表示される場面がないため、個人アバターというデータ自体を持たない設計とする。発注者として受注者に見せるアバターは CLI-021 の `client_profiles.image_url`（会社ロゴ）に集約する）
- **Owner が Admin / Staff を編集する場合**:
  - 編集可能: 氏名、メールアドレス、権限（admin / staff 切替）、代理アカウントフラグ
- **Admin が Staff を編集する場合**:
  - 編集可能: 氏名、メールアドレス、代理アカウントフラグ
  - 権限（`org_role`）フィールドは**非表示**（Admin が Staff の org_role を変更する意味のあるケースがないため。staff → admin の昇格は Owner のみ可能）
- **画面の注意書き**（担当者の引き継ぎに関する案内）:
  - 「アカウントを別の担当者に引き継ぐ場合は、新規作成（CLI-025）と旧担当者の削除で対応してください。既存のアカウントに別人の名前・メールを上書きしないでください」を画面上部または編集フォーム付近に表示
  - 理由: Admin / Staff のアカウントに別人の名前・メールを上書きすると、過去メッセージの送信者名混線、監査ログの境界消失、ログイン情報の引き継ぎに伴うセキュリティリスク等が発生する。別人への引き継ぎは「CLI-025 で新規作成 + 旧メンバー削除（CLI-024 削除ボタン）」のフローで対応する
- 更新対象テーブル:
  - 氏名の変更 → `users` テーブルを UPDATE
  - メールアドレスの変更 → **後述のメール変更フロー**（自己編集 / 他者編集で挙動が異なる）
  - 権限（`org_role`）の変更 → `organization_members` テーブルを UPDATE
  - 代理アカウントフラグの変更 → `organization_members` テーブルを UPDATE
- 保存成功時: CLI-023 へ遷移

##### メール変更フロー

Supabase Auth の挙動上、メール変更は "Secure email change"（新旧両方への確認）を使う。プロジェクトの `supabase/config.toml` の `[auth.email]` セクションには既に `double_confirm_changes = true` が設定済み（L203。追加設定不要）。ダッシュボードでは "Secure email change" と表示される機能と同一。

**パターンA: 本人が自分自身のメールを変更する**
1. フォーム送信 → Server Action でバリデーション（重複チェック含む）
2. 本人セッションの `supabase.auth.updateUser({ email: newEmail })` を呼ぶ
3. Supabase が**旧メールと新メール両方に確認リンク**を送信
4. 両方のリンクをクリックするまで `auth.users.email` は旧のまま。旧メールでのログインは維持される
5. 両方確認完了時点で `auth.users.email` が更新され、トリガーで `public.users.email` も同期
6. UI 表示: 「新旧メールアドレスに確認メールを送信しました。両方のリンクをクリックすると変更が完了します」トースト

**パターンB: Owner / Admin が他メンバーのメールを変更する**
1. フォーム送信 → Server Action で権限（対象ロール表）を検証
2. admin client で `supabase.auth.admin.updateUserById(targetUserId, { email: newEmail, email_confirm: true })` を呼び強制変更（即時反映）
3. トリガーで `public.users.email` を同期
4. **旧メール・新メール両方に通知メールを送信**（「組織の管理者によりメールアドレスが変更されました。身に覚えがない場合は運営までご連絡ください」）
5. UI 表示: 「メールアドレスを変更しました」トースト

**複数回の変更リクエスト**: 確認メール未クリックのまま新しい変更リクエストが出された場合は、最新のリクエストで上書きする（Supabase のデフォルト挙動）。特別な制御は行わない。

**退職者等で旧メールが生きていないケース**: 本人による変更は不可（旧メール側の確認が通らないため）。Owner / Admin がパターンB で強制変更する運用とする。

#### REQ-ORG-010: 担当者新規作成（CLI-025）

- 新規担当者を作成する
- 入力フィールド:
  - 名前（必須）
  - メールアドレス（必須）
  - 権限（必須、管理者 or 担当者。管理責任者は内部管理者のみ作成可能）
    - **Owner が操作している場合**: 「管理者」「担当者」の両方を選択可
    - **Admin が操作している場合**: 「担当者」のみ選択可（「管理者」は非表示 or disabled。Admin は管理者を作成できない）
  - 代理アカウント（チェックボックス、法人プランのみ、1法人1つ）
- フロー（2026-04-18 レビュー決定 1-C/D/G 再検討で RPC 集約方針に変更）:
  1. 入力 → 確認画面
  2. 確認OK → Server Action で以下を実行:
     a. メールアドレスの重複チェック（admin client で `public.users.email` を `.eq('email', input.email).maybeSingle()` で照会。R2 対応: `admin.listUsers()` は本番で O(N) のネットワーク往復になるため使わない。`public.users.email` は `handle_user_email_change` トリガーで `auth.users.email` と同期されており、`idx_users_email` インデックス経由で O(log N) で確認できる。孤児 auth.users による取りこぼしのフォールバックは下記 c の `inviteUserByEmail` 側エラー判定で対応）
     b. admin client で Owner の `subscriptions.plan_type` を取得し、`PLAN_LIMITS[plan_type].maxStaff` を算出（RPC に渡すため）
     c. `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: '{SITE_URL}/auth/callback?type=invite', data: { invited_role: 'staff', invited_last_name: input.lastName, invited_first_name: input.firstName, inviter_name, organization_name } })` を呼ぶ。この 1 コールで **auth.users の作成 + 招待メール送信** が同時に行われる（レビュー決定 1-E/2-A）。**D 対応**: `invited_role` / `invited_last_name` / `invited_first_name` メタデータが migration file 9 の `handle_new_user` トリガーに読み取られ、`public.users` が `role='staff'` + 姓名入りで自動作成される。`inviter_name` / `organization_name` はメール本文テンプレート用
     d. auth.users 作成時のトリガーにより public.users が自動生成される
     e. admin client 経由で `insert_staff_member_with_limit(new_user_id, org_id, org_role, is_proxy, max_staff)` RPC を呼び出し。RPC 内で `FOR UPDATE` ロック + COUNT により人数チェック（上限到達時は `STAFF_LIMIT_EXCEEDED` 例外でロールバック）+ R4 proxy 事前チェック → 正常系では `organization_members` INSERT を atomic 実行（**D 採用により RPC は `public.users` 行を一切触らない**。`role='staff'` + 姓名は migration file 9 の `handle_new_user` トリガーが INSERT 時にメタデータから設定済み）
  3. 人数チェックは RPC 内で atomic に実行される。TOCTOU による race は `FOR UPDATE` で構造的に排除済み（事前・事後の二段構えは不要）
  4. **失敗時のクリーンアップ**:
     - ステップ 2a で失敗: auth.users 未作成なので何もしない
     - ステップ 2c 失敗（inviteUserByEmail エラー）: auth.users 未作成または Supabase 側で自動ロールバック済み
     - ステップ 2e の RPC 失敗（`STAFF_LIMIT_EXCEEDED` / `PROXY_ACCOUNT_ALREADY_EXISTS` / `USER_NOT_FOUND` / `INVALID_ORG_ROLE` / その他）: try/catch で `supabase.auth.admin.deleteUser(new_user_id)` を呼び auth.users を削除（幽霊アカウント防止）
  5. 招待メールはステップ 2c 内で自動送信済み。メール送信失敗時も本体処理は成功扱いとし、CLI-022 の再送ボタンで救済する（表示条件: `public.users.password_set_at IS NULL`）
- エラー時のユーザー表示:
  - メールアドレス重複: 「このメールアドレスは既に登録されています」
  - 人数制限超過: 「担当者の上限（{maxStaff}人）に達しています。現在{現在数}人登録済みです。プランのアップグレードをご検討ください」（フロー 2a-0 と同じ文言）
  - その他のエラー: 「担当者の作成に失敗しました。時間をおいて再度お試しください」
- 人数制限:
  - 法人プラン（¥48,000）: 最大10人
  - 法人プラン高サポート（¥148,000）: 最大30人
  - 上限値は `src/lib/constants/plans.ts` の `PLAN_LIMITS.maxStaff` を参照（billing 仕様書 REQ-BL-005 と共通定数）
  - **新規追加時の超過チェック**: 上記フロー 2e の `insert_staff_member_with_limit` RPC 内で atomic 実行（`FOR UPDATE` + COUNT により TOCTOU を排除）
  - **ダウングレード時の超過チェック**: 本仕様書では重複実装しない。billing 仕様書 REQ-BL-005「ダウングレード前提条件チェック」の `validateDowngradePrerequisites()`（`src/lib/billing/validate-downgrade.ts`）が既にメンバー数のチェックを含んでおり、超過時はプラン変更自体をブロックする挙動が実装済み。organization 機能側は既存処理に依存する
  - 制限超過時: エラーメッセージ表示
- **代理アカウント制約（`organization_members.is_proxy_account = true`）**:
  - 1 法人につき **1 つまで**（DB 側で `UNIQUE (organization_id) WHERE is_proxy_account = true` の部分 UNIQUE 制約で担保。database-schema.md 参照）
  - 既に代理アカウントが存在する組織で代理フラグ ON にした場合（CLI-025 新規作成 or CLI-024 編集）、**R4 対応**: `insert_staff_member_with_limit` RPC 内の事前チェックで `PROXY_ACCOUNT_ALREADY_EXISTS` 例外を raise（CLI-025 経由）、または `updateMemberAction` 内の事前 SELECT でヒット検出（CLI-024 経由）。Server Action は専用例外コード（汎用 23505 ではなく）で判定し「代理アカウントは既に登録されています。既存の代理アカウントを解除してから再度お試しください」のトーストを表示。DB の部分 UNIQUE 制約は最終ガードとして残す（race の保険）
  - 設定権限: Owner / Admin のみ（Staff は CLI-025 自体にアクセス不可）。CLI-024 で既存担当者のフラグを切り替える場合も同じ権限
  - 法人プラン以外では本チェックボックスを非表示にする

## 共通仕様

### Server Action の戻り値形式

すべての Server Action は以下の統一フォーマットで結果を返す（CLAUDE.md の方針に準拠）:

```ts
type ServerActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };
```

- 失敗時の `error` は **日本語のユーザー向けメッセージ**（例: 「このメールアドレスは既に登録されています」）
- 技術的なエラー詳細（スタックトレース、Supabase エラーコード等）は `console.error` でサーバーログに記録し、クライアントには出さない
- クライアント側は `result.success` を判定し、`false` の場合は `toast.error(result.error)` でユーザーに通知する（握りつぶし禁止）

### 入力文字数上限・バリデーション

Zod スキーマで以下の上限をクライアント／サーバーの両方で検証する。文字数は `.trim()` 後の値で評価する。

#### スカウトテンプレート（CLI-019 / CLI-018）

| 項目 | 必須 | 上限 | 備考 |
|---|:-:|---:|---|
| タイトル | ○ | 50 字 | 改行禁止 |
| 本文 | ○ | 2000 字 | 改行可 |
| メモ | ― | 500 字 | 改行可。ヘルパーテキスト「※このメモは相手には表示されません」を入力欄下に表示 |

#### 発注者情報（CLI-021）

| 項目 | 必須 | 上限 | 備考 |
|---|:-:|---:|---|
| 社名・氏名（display_name） | 条件付き | 100 字 | 法人プラン（corporate / corporate_premium）は必須。個人・小規模プランは任意（空欄時は Webhook が `client_profiles.display_name` にデフォルト格納した `users.last_name + first_name` が表示名として使われる） |
| 住所（address） | ― | 200 字 | |
| プロフィール画像 | ― | 5 MB | JPEG / PNG のみ。詳細は「プロフィール画像アップロード」参照 |
| 募集職種（recruit_job_types） | ○ | 最大 10 件 | OptionSets の職種から複数選択 |
| 募集エリア（recruit_area） | ○ | 最大 47 件 | OptionSets の都道府県から複数選択 |
| 従業員規模(employee_scale） | ― | 1〜999999 | 整数のみ |
| 求める働き方(working_way） | ― | OptionSets | 単一選択 |
| 言語（language） | ― | OptionSets | 単一選択 |
| メッセージ（message） | ― | 1000 字 | 改行可 |
| 利用 SNS（sns_*） | ― | — | boolean チェックのみ |

#### 担当者（CLI-025 / CLI-024）

| 項目 | 必須 | 上限 | 備考 |
|---|:-:|---:|---|
| 姓（last_name） | ○ | 50 字 | |
| 名（first_name） | ○ | 50 字 | |
| メールアドレス | ○ | 254 字 | RFC 5321 準拠のメール形式。既存 `auth.users.email` との重複不可 |

### プロフィール画像アップロード（CLI-021）

- **バケット**: 既存の `avatars`（public バケット）を流用する。新バケットは作らない
  - 理由: 既に avatar 用の RLS ポリシー・Next.js remotePatterns・表示ユーティリティが整っており、同等の公開画像であるため重複実装を避ける
- **保存パス**: `{user_id}/client-profile.{ext}`
  - `user_id` は所属組織の Owner（法人プラン時）または本人（個人/小規模プラン時）。必ずログイン中ユーザー ID で始める（`storage.foldername(name)[1] = auth.uid()::text` の既存 RLS に合致させるため）
  - 同じパスで上書きする（バージョン履歴は持たない）
- **RLS ポリシー（追加ポリシー例）**:
  - INSERT / UPDATE / DELETE: 自分のフォルダ（`auth.uid()::text`）配下、または同一組織の Owner/Admin のフォルダ配下
  - SELECT: 全員可（public バケット）
- **ファイル検証（Server Action で実施）**:
  - MIME: `image/jpeg` / `image/png` のみ許可
  - サイズ: 5MB 以下
  - 上記以外は `{ success: false, error: "JPEG または PNG 画像（5MB 以下）を選択してください" }` を返す
- **表示**: `<img>` タグを使用（`next/image` はリモートパターンの差替えでサーバー再起動が必要になるため、既存 avatar 表示と同じ方針に合わせる）
- **既存画像の置換**: 新しい画像を保存する前に `supabase.storage.from('avatars').remove([oldPath])` で旧ファイルを削除する（同じパスで上書きするためパスが同じ場合は `upload({ upsert: true })` でも可）

### 担当者招待メール（CLI-025 作成フロー）

#### 送信トリガーと手段

- **送信条件**: CLI-025 で担当者（Admin / Staff）を新規作成する Server Action 内で、`inviteUserByEmail` 呼び出し時に同時送信される（D 採用後のフロー: inviteUserByEmail がメール送信 + auth.users 作成 → トリガーが public.users 作成 → RPC が organization_members INSERT、の 3 段。メール送信は最初のステップで完了する）
- **送信手段**: `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: '{SITE_URL}/auth/callback?type=invite', data: { invited_role: 'staff', invited_last_name, invited_first_name, inviter_name, organization_name } })` を使う（D 対応で `invited_*` メタデータを必ず含める）
  - この 1 コールで「`auth.users` へのユーザー作成」＋「招待メール送信」が同時に行われる（Supabase Auth の標準機能）
  - 独自のトークン管理は行わない
  - `redirectTo` に既存のコールバックルート `/auth/callback` を指定し、そこから AUTH-008（`/accept-invite/confirm`）にリダイレクトする構造にする（詳細は後述「Server Action の挙動」および「画面遷移」参照）
- **リンク有効期限**: **24 時間（Supabase の標準 TTL）**
  - `supabase/config.toml` / ダッシュボードの `[auth]` セクションに特別な拡張設定は入れない
- **メール本文テンプレート**（Supabase Auth の invite テンプレート設定で指定）:
  - 件名: 「ビジ友への招待 — {組織名} から担当者として招待されました」
  - 本文（抜粋、プレースホルダは Supabase の変数展開を使う）:
    ```
    {招待者氏名}（{組織名}）から、ビジ友への担当者登録を招待されました。

    以下のリンクからパスワードを設定してログインしてください。
    {invite_link}

    このリンクは 24 時間有効です。期限が切れた場合は招待元に再送を依頼してください。

    心当たりのない場合は本メールを破棄してください。
    ```
- **招待中ユーザーの UI 表示**: CLI-022 / CLI-023 でパスワード未設定（`public.users.password_set_at IS NULL`）の担当者には「招待中」バッジを表示する。`last_sign_in_at` は採用しない（招待リンクを踏んで `/auth/callback` でセッション確立しただけでも更新されうるため、「パスワード設定まで完了したか」の判定には不向き）
- **Server Action 失敗時の挙動**:
  - 招待メール送信自体が失敗しても、担当者作成（auth.users + public.users + organization_members の INSERT）は成功扱いとする（メール送信のリトライ可能な設計のため）
  - UI に「担当者を作成しました。ただし招待メールの送信に失敗しました。CLI-022 から招待メールを再送してください」のトーストを表示

#### 招待メール再送

- **再送ボタンの表示**: CLI-022（担当者一覧）の該当行、または CLI-023（担当者詳細）に「招待メールを再送する」ボタンを表示する
  - 表示条件: その担当者がまだパスワード設定を完了していない（`public.users.password_set_at IS NULL`）
  - 表示権限: Owner / Admin のみ（Staff には表示しない）
- **再送アクション**: `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: '{SITE_URL}/auth/callback?type=invite' })` を再実行し、新しい 24 時間有効な招待リンクを送る
- **UI**: 成功時トースト「招待メールを再送しました」

#### 招待を受けた人の画面遷移（招待 → アカウント利用開始までの流れ）

| ステップ | 画面 / 処理 | 内容 |
|---|---|---|
| 1 | メール受信 | 招待メールに 24 時間有効なマジックリンクが記載される |
| 2 | リンクをクリック | `{SITE_URL}/auth/callback?code=...&type=invite` に遷移 |
| 3 | `/auth/callback`（既存 Route Handler、UI なし） | `supabase.auth.exchangeCodeForSession(code)` でセッションを確立。`type === 'invite'` の場合は `/accept-invite/confirm`（AUTH-008）にリダイレクト。失敗時は `/login?error=...` にリダイレクト |
| 4 | **AUTH-008 招待承諾・パスワード設定**（新規画面、`/accept-invite/confirm`） | パスワード設定フォーム。設定完了で CON-001 へ |
| 5 | CON-001 マイページ | 初回ログイン完了。以降は通常の AUTH-002 → CON-001 フローを利用 |

#### 新規画面：AUTH-008 招待承諾・パスワード設定

招待を受けたユーザーがパスワードを設定するための画面。

##### ファイル配置・ルーティング

既存の `(auth)` ルートグループ配下に配置する（`(authenticated)` ではない。未認証でアクセス可能な画面のため）:

- **画面**: `src/app/(auth)/accept-invite/confirm/page.tsx`（Client Component）
- **Server Action**: `src/app/(auth)/accept-invite/confirm/actions.ts`（`updatePasswordAction` と同等の構造で新設）
- **コールバック**: 既存の `src/app/auth/callback/route.ts` に「招待」フローの分岐を追加する
  - 現在は `type === 'recovery'` なら `/reset-password/confirm`、それ以外なら `/register/profile` にリダイレクトしている
  - 新しく `type === 'invite'` のケースを追加し、`/accept-invite/confirm` にリダイレクトする

##### デザイン・レイアウト（既存 AUTH-004 を流用）

`src/app/(auth)/reset-password/confirm/page.tsx` のレイアウトをそのまま踏襲する。変更点のみ以下:

| 項目 | AUTH-004（既存・参照元） | AUTH-008（新規） |
|---|---|---|
| タイトル（`h1`） | 「パスワード再設定」 | 「ビジ友へようこそ」 |
| 説明文 | 「新しいパスワードをご入力ください」 | 「{組織名} の担当者として招待されました。パスワードを設定してください」 |
| ボタン文言 | 「ログイン」 | 「パスワードを設定する」 |
| 送信後の遷移 | `/login?message=password_updated` | `/mypage`（CON-001、既にセッション確立済みのため直接マイページへ） |
| 期限切れリンク | 「パスワード再設定を再申請する」→ `/reset-password` | 「ログイン画面へ戻る」→ `/login`（再申請は招待元（Owner/Admin）からの再送依頼が必要なため、ユーザーが自分で再申請するリンクは置かない） |

その他（以下は AUTH-004 と完全同一とする）:
- レイアウト: `flex flex-1 flex-col items-center px-6 pt-10` > `w-full max-w-lg`
- フォーム要素: `useForm` + `zodResolver` + `Label` / `Input` / `Button`（shadcn/ui）
- パスワードフィールド 2 つ（パスワード + パスワード（確認）、ヘルパーテキスト「※ 半角英数字の組み合わせ、8〜16文字」）
- バリデーションスキーマ: `@/lib/validations/auth` の既存 `updatePasswordSchema` を再利用
- CTA ボタンのクラス: `rounded-[47px] bg-primary text-primary-foreground h-12 w-full font-bold`
- エラー表示: `serverError` state + `isExpired` フラグで期限切れ判定
- 期限切れ判定: Server Action が返すエラーメッセージに「有効期限」が含まれる場合に `isExpired = true`

##### Server Action の挙動

`acceptInviteAction(input)` を新設（レビュー決定 1-B / 2-B を反映）:

1. `supabase.auth.getUser()` で現在のセッションを取得
2. セッションが無い場合はエラー「招待フローでアクセスしてください」を返す
3. 既にパスワード設定済みの場合（後述、`public.users.password_set_at IS NOT NULL`）は `{ success: true }` を返し、クライアント側で `/mypage` にリダイレクト（エラー表示はしない。レビュー決定 2-B）
4. `supabase.auth.updateUser({ password: newPassword })` でパスワードを保存
5. 成功したら続けて admin client で `UPDATE public.users SET password_set_at = now() WHERE id = auth.uid()` を実行する（実装は admin client に統一: design.md / tasks.md と整合。なお RLS 上は本人セッションでも UPDATE 可能だが、`acceptInviteAction` のセッション状態が招待リンク経由で不安定になりうるため、確実性を優先して admin client を採用）。この列は CLI-022 の「招待中」バッジ判定にも使用する（レビュー決定 1-B）
6. 成功時: `{ success: true }` を返し、クライアント側で `router.push('/mypage')`
7. 失敗時（期限切れ等）: `{ success: false, error: 'リンクの有効期限が切れています。招待元に再送を依頼してください' }` を返す

##### アクセス制御

- 未認証ユーザー: `/auth/callback` からのリダイレクトで到達する場合のみセッションが確立されている
- 既にパスワード設定済みのユーザーが URL 直打ちした場合: page.tsx の冒頭で `public.users.password_set_at IS NOT NULL` を確認し、該当すれば `/mypage` にリダイレクトする
- **判定ルール（全フロー共通）**: 「パスワード設定済み」の判定は **`public.users.password_set_at` 列**の有無で行う（レビュー決定 1-B でカラム新設）。`last_sign_in_at` は使わない（招待リンクを踏んで `/auth/callback` でセッションを確立した時点で更新されうるため、パスワード設定完了と区別できないケースがある）。同じ判定ロジックを「招待中バッジ」表示（REQ-ORG-007 / 招待メール再送条件）にも適用する

##### デザインカンプ

- 現状 `design-assets/screens/AUTH-008.png` は未作成
- AUTH-004 と完全に同じレイアウトで作るため、デザインカンプを新規作成せず「AUTH-004 と同様」として実装開始してよい（デザイン担当者への別途確認は不要）

**代替案（参考、未採択）**: AUTH-004（パスワード再設定）をモード分岐で流用する案もあったが、以下の理由で AUTH-008 新設を採択:
1. 文言が「パスワード再設定」のままだと、招待を受けた初見ユーザーに違和感がある
2. AUTH-004 は完了後にログイン画面へ遷移する仕様だが、招待フローは完了後そのまま CON-001 に遷移する方が UX が良い（ログインし直しの手間を省く）

## 非機能要件

### セキュリティ

- Middleware:
  - テンプレート（CLI-016〜019）: 発注者（課金済み）および法人プランの組織メンバー全員（staff 含む）アクセス可
  - 発注者情報（CLI-020）: 組織メンバー全員アクセス可。CLI-021 は owner / admin のみ
  - 担当者管理（CLI-022, CLI-023）: 法人プランの組織メンバー全員アクセス可（Owner 含む全員表示）。CLI-024 は Admin / Staff の編集・削除専用画面。Owner が `CLI-024?id=自分のID` にアクセスした場合は `/profile/edit` へリダイレクト、Admin / Staff が権限外の ID で開いた場合は 403 相当で拒否（対象ロール表に従う）。CLI-025 は owner / admin のみ
  - `/profile/edit`: `users.role = 'staff'` のユーザーがアクセスしようとした場合、**CLI-024 自己編集モード（`/mypage/members/[自分ID]/edit`）** へリダイレクトする。理由: `/profile/edit` は受注者として登録した人向けのプロフィール編集画面（スキル・対応可能エリア・資格等を編集する）であり、CLI-025 経由で作成された Admin / Staff はこれらの入力フローを通っていないため項目が空欄となり整合しない。Admin / Staff の自己編集は CLI-024 自己編集モードに一元化する（research.md L265 の決定に準拠）

#### Middleware 実装詳細（`src/middleware.ts` 修正範囲）

実装ガイドとして、Middleware の追加・変更すべき分岐を以下に集約する（詳細は `design.md` § Infrastructure / Middleware 参照）。

- **`CLIENT_ONLY_PREFIXES` に追加するパス**（受注者のみのアカウントをブロック対象に含める）:
  - `/messages/templates`（CLI-016〜019）
  - `/mypage/client-profile`（CLI-020 / CLI-021）
  - `/mypage/members`（CLI-022〜025）
- **`?setup=true` 例外分岐**: `pathname === '/mypage/client-profile/edit' && searchParams.get('setup') === 'true'` の場合、**`CLIENT_ONLY_PREFIXES` チェックより前に** 分岐して finalize（通過）する。理由: 課金直後は Webhook 未着で `users.role` / `subscriptions.plan_type` が未確定の可能性があるため（Webhook 遅延対策セクション参照）
  - 判定は必ず `pathname === '/mypage/client-profile/edit'` の完全一致で行う。`/edit` 部分マッチで判定すると CLI-021 以外の `/edit` 系 URL にも緩和が適用されてしまうため注意
- **旧 `/mypage/organization-setup` の扱い**: GET アクセスは `/mypage/client-profile/edit?setup=true` に **308 リダイレクト**（ブックマーク・古い導線の救済用。物理的な page.tsx は付録 A Step 4-A で削除）
- **CLI-024 の URL 直打ち対策**: `/mypage/members/[id]/edit` にアクセスがあった場合、Middleware で URL の `id` と `auth.uid()` を比較し、以下で分岐:
  - `id === auth.uid()` かつ `users.role = 'client'` かつ `org_role = 'owner'` → `/profile/edit` へリダイレクト（Owner は一般プロフィール画面で編集）
  - `id === auth.uid()` かつ `users.role = 'staff'` または `org_role = 'admin'` → 通過（自己編集モード）
  - `id !== auth.uid()` → page.tsx の Server Component で org_role を検証し、権限外なら 403 相当で拒否
- **ガードの責務分担**: Middleware はロール（`public.users.role`）による**粗いブロックのみ** を担当する。`org_role`（owner/admin/staff）による細かい操作権限判定は、各 page.tsx の Server Component および Server Action 内で実施する（Middleware で DB を複数回クエリすることを避けるため）
- RLS:
  - テンプレート: 自分 or 所属組織のテンプレート全員 CRUD 可
  - 発注者情報: 自分の `client_profiles` or 同一組織の owner / admin が編集可能
  - 担当者: 所属組織のメンバー全員が閲覧可。更新は Server Action で `org_role` と対象レコードを検証した上で実行
- 権限階層の検証: Server Action で `org_role` を確認し、権限外の操作を拒否
- 自己編集ガード: staff が `CLI-024?id={自分以外のuserId}` に直接到達した場合、Server Action で拒否（403 相当）。admin が他の admin や owner の編集に到達した場合も同様

### Webhook 遅延対策（課金直後のタイミング問題）

**背景**: Stripe Checkout 完了直後は Webhook（`handle_checkout_completed_plan` / `handle_subscription_lifecycle_updated`）がまだ到着していない可能性がある。この時点では `users.role` / `subscriptions.plan_type` が未更新のため、通常のガードで CLI-021 遷移時に「権限不足」「プラン未確定」で弾かれてしまう。本仕様では `/mypage/organization-setup` を廃止して CLI-021 に統合するため、同等の緩和策を CLI-021 側に用意する必要がある。

**対策（2 段階）**:

1. **Middleware 緩和**: 前述「Middleware 実装詳細」の `?setup=true` 例外分岐で、認証済みユーザーなら plan / role 未確定でも通過させる
2. **Server Action 側の検証**: `saveClientProfileAction` 内で以下のガードを行う:
   - `subscriptions.plan_type IS NULL` の場合 → `{ success: false, error: 'プラン情報を反映中です。数秒後にもう一度お試しください' }` を返す
   - フロントエンドはこの `success: false` を `toast.error(result.error)` で表示し、ボタン活性状態を維持する（ユーザーは数秒待って再送信できる）

**冪等性の担保**: Server Action が成功した場合、その後に Webhook が到着して `handle_subscription_lifecycle_updated` 等が同じ UPDATE を再実行しても DB 状態は壊れない設計にする（`subscriptions.plan_type` / `users.role` の UPSERT 相当）。これは既存 billing 実装の `ensure_organization_exists` / 二重課金防止の冪等性ルールと同方針。

**遷移先**: `saveClientProfileAction` が `success: true` を返した場合、`redirectTo` に `/mypage` を入れてフロント側で `window.location.href` でハードナビゲーション（Next.js Router Cache のリダイレクト結果キャッシュを回避、CLAUDE.md「Next.js Router Cache」ルール準拠）。

**非法人プランの扱い**: 個人発注者・小規模プランは `display_name` 未入力でもアカウントとして成立するため、CLI-021 には「スキップして後で設定する」ボタンを用意し、押下時は Server Action に `opts.skip = true` を渡して DB 書き込み無しで `redirectTo = '/mypage'` を返す。法人プラン（`plan_type = 'corporate'`）のみ `display_name` を必須化する（Zod で空文字拒否）。

### pgTAP テスト要件（scout_templates RLS）

CLI-016〜019 実装時に新規 pgTAP テストファイルを作成し、以下 10 パターンを全て検証する。目的: (1) 新マイグレーション `20260415100100_scout_templates_org_shared_crud.sql` の挙動（組織メンバー全員 CRUD 可）を担保、(2) RLS ポリシーの連鎖評価（`scout_templates` → `organization_members` → `is_same_org()`）が無限再帰せず正しく解決することを確認（過去に `organization_members` RLS の自己参照で再帰バグが発生し、エラーなく NULL 返却となるため検知が困難だった経緯あり）。

| # | グループ | シナリオ | 期待結果 |
|---|---|---|:-:|
| 1 | SELECT | 組織 A のメンバー X が、同じ組織 A のメンバー Y が作成したテンプレを閲覧 | ✅ 取得できる |
| 2 | SELECT | 組織 B のメンバーが組織 A のテンプレを閲覧しようとする | ❌ 結果 0 件 |
| 3 | INSERT | 個人発注者が `organization_id = NULL` でテンプレを新規作成 | ✅ 成功 |
| 4 | INSERT | 組織メンバーが自分の `organization_id` でテンプレを新規作成 | ✅ 成功 |
| 5 | **UPDATE** | **Staff が同じ組織の Owner 作成テンプレを編集**（本マイグレーションで追加した挙動の核心） | ✅ 成功 |
| 6 | UPDATE | 組織 B のメンバーが組織 A のテンプレを編集しようとする | ❌ 権限エラー |
| 7 | UPDATE | 個人発注者 A が個人発注者 B のテンプレを編集しようとする | ❌ 権限エラー |
| 8 | **DELETE** | **Staff が同じ組織の Admin 作成テンプレを削除**（同上・核心挙動） | ✅ 成功 |
| 9 | DELETE | 組織 B のメンバーが組織 A のテンプレを削除しようとする | ❌ 権限エラー |
| 10 | 再帰安全性 | 組織メンバーのセッションで `SELECT * FROM scout_templates` を実行 | ✅ エラー/NULL にならず正常に結果セットが返る |

**ファイル配置**: `supabase/tests/scout_templates_rls.test.sql`（既存 pgTAP テストと同じディレクトリに配置）

**実行**: `supabase test db` で自動的に走る。失敗時は該当 RLS ポリシーを修正するか、`is_same_org()` 経由に置き換える。

## 画面遷移

```
CON-001 → CLI-016（テンプレ一覧）→ CLI-017（詳細）→ CLI-018（編集）
                                  → CLI-019（新規作成）

CON-001 → CLI-020（発注者情報詳細）→ CLI-021（発注者情報編集）
                                   → CLI-022（担当者一覧）→ CLI-023（担当者詳細）→ CLI-024（編集）
                                                         → CLI-025（新規作成）

（招待フロー）
CLI-025 で担当者作成 → 招待メール送信
招待された人: メールリンク → /auth/callback?type=invite → AUTH-008（/accept-invite/confirm）→ CON-001
```

## 関連テーブル

- scout_templates: テンプレート（CRUD）
- client_profiles: 発注者プロフィール（CRUD）
- organizations: 組織情報
- organization_members: 組織メンバー（CRUD）
- users: ユーザーアカウント作成（担当者追加時）
- subscriptions: プラン確認（人数制限の検証）

## Server Action インターフェース一覧

実装時の参照用として、本 spec で新規・改修する Server Action の引数・戻り値・主なエラーを集約する。各 Action の詳細仕様（Preconditions / Postconditions / Invariants / Validation）は `design.md` の各ドメインセクションを参照。

戻り値の統一フォーマット（`{ success: true, data? }` / `{ success: false, error }`）は前述「共通仕様 § Server Action の戻り値形式」の `ServerActionResult<T>` 型に準拠する。以下の表の「成功時 data」欄は `data` フィールドの中身、「主なエラー」欄は `success: false` を返す主要な条件（内部エラーコード含む）を示す。**実装時、最終的に `error` フィールドに入る文字列は必ず日本語のユーザー向けメッセージとする**（共通仕様 § Server Action の戻り値形式 方針）。内部エラーコード（`STAFF_LIMIT_EXCEEDED` 等）は Server Action 内で日本語化してからクライアントに返す。

### スカウトテンプレート（CLI-016〜019）

| Action | 引数 | 成功時 data | 主なエラー |
|---|---|---|---|
| `createScoutTemplateAction` | `input: { title, body, memo? }` | `{ id: string }` | 認証/権限、`title > 50 字`、`body > 2000 字`、`memo > 500 字` |
| `updateScoutTemplateAction` | `id: string, input: { title, body, memo? }` | — | RLS拒否、対象 ID 不存在、文字数超過 |
| `deleteScoutTemplateAction` | `id: string` | — | RLS拒否、対象 ID 不存在 |

- 認可: 本人のテンプレ（`organization_id IS NULL`）は本人のみ、組織共有テンプレ（`organization_id` あり）は所属組織メンバー全員（Owner/Admin/Staff）が CRUD 可
- 成功時副作用: `revalidatePath('/messages/templates')`

### 発注者プロフィール（CLI-021）

| Action | 引数 | 成功時 data | 主なエラー |
|---|---|---|---|
| `saveClientProfileAction` | `input: ClientProfileInput, opts: { mode: 'edit'\|'setup'; skip?: boolean }` | `{ redirectTo: string }` | Staff 権限拒否、Webhook 未着（`プラン情報を反映中です…`）、Zod 検証エラー、画像サイズ/MIME |
| `uploadClientProfileImageAction` | `formData: FormData` | `{ imageUrl: string }` | サイズ > 5MB、MIME が `image/jpeg\|image/png` 以外、権限不足 |

- `ClientProfileInput`: `{ displayName, address, recruitJobTypes, recruitArea, employeeScale, workingWay, language, message, snsX, snsInstagram, snsTiktok, snsYoutube, snsFacebook }`（詳細は design.md § Client Profile Domain）
- 認可: Owner / Admin のみ。Staff は Middleware + Server Action で 403
- `opts.mode = 'setup'` + `opts.skip = true` の場合は DB 書き込み無しで `redirectTo = '/mypage'` を返す（非法人プラン用）
- Zod スキーマはプラン種別で分岐（法人のみ `displayName` 必須）。setup / edit モードでバリデーションは変えない（Webhook 未着ガードとスキップ制御のみ setup モードの責務）

### 担当者管理（CLI-022〜025）

| Action | 引数 | 成功時 data | 主なエラー |
|---|---|---|---|
| `createMemberAction` | `{ lastName, firstName, email, orgRole: 'admin'\|'staff', isProxyAccount: boolean }` | `{ userId: string }` | メール重複、`STAFF_LIMIT_EXCEEDED`（人数上限）、`PROXY_ACCOUNT_ALREADY_EXISTS`、Admin が `orgRole='admin'` 作成不可 |
| `updateMemberAction` | `targetUserId: string, input: Partial<MemberInput>` | `{ emailChangeMode: 'self'\|'admin'\|null }` | 権限違反（他 Admin/Owner 編集不可）、代理重複、メール重複 |
| `deleteMemberAction` | `targetUserId: string` | — | Owner 自身の削除不可、Staff の他人削除不可、Admin の他 Admin / Owner 削除不可 |
| `resendInviteAction` | `targetUserId: string` | — | `password_set_at IS NOT NULL`（既設定済み）、対象が同一組織のメンバーでない |

- 人数制限・代理重複・権限階層の atomic 検証は `insert_staff_member_with_limit` / `delete_staff_member` の 2 つの `SECURITY DEFINER` RPC に集約（TOCTOU を `FOR UPDATE` + COUNT で構造的に排除）
- RPC 失敗時は Server Action が `auth.admin.deleteUser()` で auth.users の孤児クリーンアップを行う
- メール変更経路: 本人 → `auth.updateUser`、管理者 → `auth.admin.updateUserById`（即時反映 + Resend 通知メールを旧/新メール両方へ送信）

### 招待承諾（AUTH-008）

| Action | 引数 | 成功時 data | 主なエラー |
|---|---|---|---|
| `acceptInviteAction` | `{ password: string, confirmPassword: string }` | — | リンク期限切れ（TTL 24h）、パスワード 8〜16 文字外、確認一致不一致 |

- 処理順（2 段階・必ずこの順で実行）:
  1. `supabase.auth.updateUser({ password: newPassword })` でパスワード保存
  2. admin client で `UPDATE public.users SET password_set_at = now() WHERE id = auth.uid()`
- 期限切れ時は「ログイン画面へ戻る」ボタンに切り替え、再招待は Owner / Admin 側の CLI-023「招待を再送」ボタン（`resendInviteAction`）で実行
- 認証済みかつ `password_set_at IS NOT NULL` で直打ちした場合は RSC 冒頭で `/mypage` に redirect（無言で、エラー表示しない）

### 廃止される Server Action

| Action | 旧ファイル | 置き換え先 |
|---|---|---|
| `saveOrganizationNameAction` | `src/app/(authenticated)/mypage/organization-setup/actions.ts` | `saveClientProfileAction`（`opts.mode = 'setup'`）に吸収 |

旧ファイル群（`page.tsx` / `actions.ts` / `OrganizationSetupForm.tsx` 3 ファイル）は付録 A Step 4-A で物理削除する。

## 画面外運用（CLI-024 以外で実行する操作）

ビジ友には「アカウントをやめる」系の操作が 3 種類ある。目的ごとに使う画面が異なる。

| 操作 | 何が起きるか | 実行場所 | 実行者 |
|---|---|---|---|
| 退会 | `users.deleted_at` をセット。サイト上で「退会済みユーザー」表示。ログイン不可 | COM-006（`/profile/withdrawal`） | 本人（対象ロールのみ） |
| プラン解約 | サブスクのみ停止。`users.role` が contractor に降格、アカウントは生存 | CLI-026 系（プラン画面） | Owner 本人 |
| 全情報の物理削除 | users レコード含む全関連データを完全削除 | 問い合わせ（COM-008） | 運営が管理画面で対応 |

### 退会（COM-006 = `/profile/withdrawal`）

- **実装状況**: 既に実装済み（`src/app/(authenticated)/profile/withdrawal/`）
- **利用可能なロール**（`profile/withdrawal/actions.ts:71` で `org_role != 'owner'` の組織メンバーを拒否）:
  - 無料受注者（contractor、組織に所属していない）
  - 個人発注者プラン（¥3,800、組織に所属していない）
  - 小規模事業主プラン（¥14,800、組織に所属していない）
  - 法人プラン Owner（¥48,000）
  - 法人プラン（高サポート）Owner（¥148,000）
- **利用不可のロール**:
  - 法人プランの Admin（`org_role = 'admin'`）
  - 法人プランの Staff（`org_role = 'staff'`）
- **退会時の処理**（2026-04-19 改訂: C 案採用）:
  - `users.deleted_at` をセット → サイト上の全画面で「退会済みユーザー」表示に切り替わる
  - 掲載中・下書きの案件 → `closed`、進行中応募（`applied` / `accepted`）→ `cancelled`
  - サブスクリプション → `cancelled`（DB 状態のみ。Stripe API キャンセル呼び出しは billing 連携時に TODO として残っている）
  - **Owner の場合（C 案）**: Admin の有無に関わらず、組織ごとソフトデリートする
    - `organizations.deleted_at` をセット（組織ソフトデリート）
    - 所属メンバー全員の `organization_members` を物理削除
    - Admin / Staff の `users.deleted_at` をセット（組織と連動してログイン不可化）
    - `client_profiles` レコードはそのまま残す（過去メッセージの表示整合性のため）
    - `scout_templates` は削除しない（組織ソフトデリート後は RLS でアクセス不能だが、履歴データとして保持）
    - **設計の背景**: Admin / Staff は Owner の招待（CLI-025）で作成されたアカウントで、正規の新規登録フロー（AUTH-001）・本人確認・独立した Stripe 契約を経ていない。Owner 退会後に新組織代表へ昇格させるには身元保証と契約主体の移行が必要だが、退会と同時に法人プラン契約も終了するため構造的に矛盾する。したがって**退会と同時に組織ごと凍結**する
    - **事業継続を希望する場合の案内**（COM-006 画面の確認ダイアログに表示。ユーザー向けの平易な表現を使うこと。「Admin / Staff」「CLI-026」のような内部用語は使わない）:
      > 退会すると、会社アカウント「{display_name}」は削除され、**あなたが招待した管理者・担当者のアカウントもまとめて利用停止**になります。招待された方々はビジ友にログインできなくなります。
      >
      > 一時的に料金だけ止めたい場合は、退会ではなく**「プランの解約」**をおすすめします。プランを解約すれば、後日あらためて法人プランにご契約いただくだけで、管理者・担当者のアカウント、作成したスカウト文例、受注者との過去メッセージ、すべてを元どおりに復活できます。
      >
      > 本当に退会した場合、同じ会社でビジ友を再開するには、新しく会社アカウントを作り直して、管理者・担当者をあらためて招待する必要があります（以前のスカウト文例・メッセージ履歴は引き継げません）。
      >
      > それでも退会しますか？

      - 文言の意図:
        - 「組織」ではなく「会社アカウント」
        - 「Admin / Staff」ではなく「管理者・担当者」（roles-and-permissions.md のユーザー向けラベルと一致）
        - 「CLI-026」ではなく「プランの解約」
        - 「ソフトデリート」「冷凍保存」のような技術用語は使わず「利用停止」「元どおりに復活」で表現
  - **Owner 以外の場合**: `organization_members` は関与しない（Admin / Staff は本フローに到達しない = L628-630 で既にブロック済み）
  - `auth.users` を `ban_duration: "876600h"` で凍結 → 再ログイン不可
  - `supabase.auth.signOut()` でセッション破棄

- **Owner 退会後の受注者側画面表示ルール**（2026-04-19 C 案採用時の連鎖挙動を明文化）:
  - **発注者名表示**: `resolveParticipantName()` が `client_profiles.display_name` を参照するため、退会前に社名が設定されていれば「田中工務店」のまま表示される（`organizations.deleted_at` セットでも影響なし。`client_profiles` は履歴として保持するため）。ただし Owner の `users.deleted_at` が立っているので、`display_name` が空だった場合のみ「退会済みユーザー」にフォールバック
  - **発注者一覧（CON-005）・発注者詳細（CON-006）・マイリスト（CON-007）**: 対象発注者の `users.deleted_at IS NOT NULL` で一覧から自動除外される（既存の `.is('deleted_at', null)` フィルタに準拠）
  - **案件検索（CON-002）**: 退会と同時に `jobs.status='open' → 'closed'` になるため非表示
  - **応募履歴（CON-011〜013）**: 受注者の過去応募データは保持。発注者が退会済みの場合、発注者名は `client_profiles.display_name` 経由で引き続き表示される
  - **メッセージスレッド（CON-008〜010）**: 過去スレッドは閲覧可能（`resolveParticipantName()` で社名継続表示）。ただし退会組織への新規メッセージ送信は不可（`organizations.deleted_at IS NOT NULL` で Server Action が拒否。RLS `organizations_select_public` は生存組織のみを返すため、送信先組織が見つからずエラー）
  - **発注者評価（CLI-028）・受注者が過去に書いた client_reviews**: レビューデータは履歴として保持。表示仕様は各該当画面の spec で定義（本 spec スコープ外）
  - **scout_templates**: 履歴データとして保持するが、`organization_members` 全削除 + Owner `deleted_at` セットにより RLS でアクセス不能になる。監査目的で運営が service_role で直接 SELECT する以外、実質的に死蔵データとなる（仕様通りの挙動）
  - **favorites（お気に入り）**: 受注者が退会組織の Owner を `target_type='client'` でマイリスト登録していた場合、対象 Owner の `users.deleted_at IS NOT NULL` により UI 側で除外表示する（具体的な表示ルールは各該当画面の spec で定義）
- **動線**: マイページ → プロフィール画面（`/profile`）の「退会する」リンク → COM-006
- **CLI-024 からの導線は設けない**（既存のプロフィール画面からの動線で完結）

### Admin / Staff の組織からの離脱

- COM-006 はブロックされるため、本人が画面から退会する手段はない
- 離脱したい場合は Owner（Admin から Staff を外す場合は Admin）に削除依頼
- Owner / Admin が CLI-024 の削除ボタンから削除:
  - `organization_members` を物理削除
  - `users.deleted_at` をセット（REQ-ORG-008 に準拠）
  - 結果として退会（COM-006）と同じ最終状態になる

### Owner の「プラン解約」（退会とは別物）

- **目的**: bijiyu を完全にやめたいのではなく、発注者機能だけ止めたい（例: 発注業務はやめるが、受注者としては使い続けたい）場合に使う
- **実行場所**: CLI-026 系（プラン画面）
- **挙動**（`billing` spec REQ-BL-005 に準拠）:
  - Stripe サブスクリプションをキャンセル → `subscriptions.status = 'cancelled'`
  - `users.role` を 'contractor' に降格（アカウントは生存。`users.deleted_at` はセットしない）
  - `organizations` / `organization_members` は保持（再アップグレードで復活）
  - 配下の admin / staff は `users.is_active = false` でログイン停止（再アップグレードで復帰）
  - 前提条件チェック: 掲載中案件・未返信応募・担当者数
- **退会（COM-006）との使い分け**:
  - 完全に bijiyu を離れたい → COM-006 退会
  - 発注者機能だけ止めて受注者として残りたい → CLI-026 プラン解約

### アカウント全情報の物理削除

- **UIからは全ロール不可**。退会（COM-006）が `users.deleted_at` セット + アカウント凍結までで、メッセージ履歴・応募履歴・画像・Stripe customer・本人確認書類等の関連データはDBに残る
- **依頼窓口**: COM-008（お問い合わせフォーム）→ 運営が管理画面で対応
- **対象ロール**: 全ロール共通（無料受注者・個人/小規模発注者・法人プラン全員）
- **位置付け**: GDPR 的な「自分の情報を全て消したい」要望、または退会後に残存データで問題が発生した場合の救済手段

### 管理責任者（Owner）の交代

Owner の「交代」には 2 つのパターンがある。用途で使い分ける。

#### パターン1: 同一人物として情報だけ更新する（`/profile/edit` で対応可能）

以下のようなケースは、Owner 本人が `/profile/edit`（一般ユーザー向けプロフィール編集画面）で氏名・メールを書き換えるだけで完結する（※ CLI-024 は Admin/Staff 専用のため、Owner は使わない）:

- 結婚・改姓で氏名が変わった
- 社用メールのドメインが変わった
- 部署異動・役職変更で肩書きや連絡先を更新したい

これは「アカウントの持ち主は同じ人」という前提で、プロフィール情報だけ最新化する運用。中小企業などで同一 ID を長く使い回すケースもこのパターンで対応可能。

#### パターン2: 別人へのアカウント移譲（法人プラン契約中に限り、運営経由で可能）

以下のようなケースは、CLI-024 での書き換えでは対応できない。必ず運営経由で処理する:

- 現 Owner が退職し、後任の別人が契約者を引き継ぐ
- 法人の代表者が交代し、契約主体が別の従業員に移る
- コンプライアンス上、契約者と実際の利用者を厳密に一致させる必要がある企業

**重要な前提**（2026-04-19 改訂: C 案採用による制約）:

- 本パターンは**法人プラン契約中にのみ実行可能**
- Owner が COM-006（退会）を実行した後は、組織ごとソフトデリートされるため Owner 交代の対象にならない
- したがって Owner 交代を希望する場合は、**現 Owner が退会する前に**運営（COM-008）へ交代依頼を行う運用フローとする
- 後任者が組織に存在しない場合は、事前に CLI-025 で Admin として追加しておく

**なぜ書き換えでは対応できないか:**

- 過去のメッセージ送信者名が**別人の名前に置き換わって履歴が混線**する
- 本人確認書類・Stripe customer 情報が別人のものとして継続してしまう
- 監査ログ上、どの時点から別人の操作になったか境界が追えなくなる
- ログイン情報（パスワード）を引き継ぐことになり、退職者が後任アカウントにアクセスできてしまうセキュリティリスク

**移譲時の処理フロー**（運営側）:

1. 後任者（例: 佐藤花子）を CLI-025 で Admin として新規作成（新しい独立したアカウント）
2. 運営が管理画面または Edge Function で以下を実行:
   - `organizations.owner_id` を旧 Owner → 新 Owner に更新
   - `organization_members.org_role` を更新（旧 Owner: 'owner' → 'admin' or 削除、新 Owner: 'admin' → 'owner'）
3. 旧 Owner は必要に応じて COM-006 から退会するか、Admin として組織に残る
4. Stripe customer の情報は必要に応じて運営が更新（請求先メールアドレス等）

**依頼窓口**: COM-008（お問い合わせ）→ 運営が対応

#### `/profile/edit` 画面での注意書き（Owner 向け）

Owner 自身の情報編集は CLI-024 ではなく `/profile/edit` で行うため、**`/profile/edit` 画面**に次の注意書きを表示する:

> 「氏名・メールアドレスの変更は同一人物の情報更新のみです。契約者（管理責任者）を別の方に引き継ぐ場合は、お問い合わせからご依頼ください」

- 表示対象: 法人プラン Owner の `/profile/edit` アクセス時（個人発注者・小規模・無料受注者には表示不要）
- 理由: Owner が退職・交代する場合に自分のアカウントに別人の名前・メールを上書きすると、過去メッセージの送信者名混線・本人確認書類の不整合・Stripe customer 情報の引き継ぎ問題・ログイン情報の引き継ぎに伴うセキュリティリスク等が発生する。別人への移譲は必ず運営経由（COM-008 → 運営が `organizations.owner_id` と `organization_members.org_role` を更新）で対応する

#### CLI-024 画面での注意書き（Admin / Staff 引き継ぎ向け）

CLI-024 は Admin / Staff の編集画面なので、こちらには次の注意書きを表示する（REQ-ORG-009 参照）:

> 「アカウントを別の担当者に引き継ぐ場合は、新規作成（CLI-025）と旧担当者の削除で対応してください。既存のアカウントに別人の名前・メールを上書きしないでください」

#### 詳細リファレンス

詳細は `database-schema.md` の「organizations → 組織オーナー削除時のルール」参照。

### 退会後のアカウント復活

- **UI からの復活機能は提供しない**。ログイン画面で「復活する」ボタン等は作らない
- **退会画面（COM-006）には**「退会後は原則として元に戻せません。ご利用を続ける意思がある場合は退会せずにプラン解約のみ行ってください」と警告を表示する
- **それでも復活したい場合**: COM-008（お問い合わせフォーム）→ 運営が個別判断で対応
  - 想定ケース: 誤操作による退会、短期間での気変わり、退会後に契約継続が必要になった場合等
  - 運営側の処理: 管理画面から `users.deleted_at` を `NULL` に戻す、`auth.users` の `ban_duration` を `'none'` に解除する
  - 復活後はスキル・資格・本人確認・案件履歴・メッセージ履歴がすべてそのまま戻る（削除ではなくフラグ立てのため）
  - サブスクは解約済みのため、発注者機能が必要な場合は再課金が必要
- **同じメールアドレスでの新規登録は不可**（`auth.users` にレコードが残っているため）。別メールでの新規登録は可能だが、その場合は過去の履歴とは紐付かない
- **運営側の判断基準**（内部ルール、スペック範囲外）: 退会から一定期間以内、悪用パターン（月5通制限リセット目的等）に該当しない、等を確認の上で復活判断する

## 関連 steering

- database-schema.md: scout_templates, client_profiles, organizations, organization_members テーブル
- roles-and-permissions.md: 法人プランの組織権限、操作権限マトリクス
- authentication.md: 法人プランの権限階層、Supabase Secure email change 設定
- 関連 spec: billing（プラン解約フロー、REQ-BL-005）、messaging（発注者表示名・退会済みユーザーの表示）

## 未確認事項

なし

## 実装前レビューで確定した追加事項（2026-04-18）

実装着手前の詳細クロスチェックで明らかになった設計穴・内部矛盾・不足情報について、以下の方針を確定した。詳細は `research.md` の「Decisions Confirmed」セクションを参照。

- **1-A 受注者視点の発注者名解決**: `organizations` テーブルを認証済みユーザーに公開読み取り可にする（`deleted_at IS NULL` の行）。`organization_members` は引き続き非公開
- **1-B 招待中バッジの判定データ**: `public.users` に `password_set_at timestamptz NULL` 列を追加。`acceptInviteAction` で `now()` をセット、CLI-022/023 の判定に使用
- **1-C/D/G 担当者追加・削除のトランザクション**: ~~DB 関数は追加せず Server Action 内で admin client を順次使用~~ → **2026-04-18 再検討**: 部分失敗による「幽霊ユーザー」リスクが UX 上無視できず、CLAUDE.md の Stripe 二重課金防止ルールとの方針整合性も欠くため、2 つの `SECURITY DEFINER` 関数（`insert_staff_member_with_limit` / `delete_staff_member`）を導入して原子性を構造的に担保する方針に切り替え。人数チェックは RPC 内 `FOR UPDATE` + COUNT で TOCTOU も排除。詳細は `design.md` の「担当者作成・削除は RPC に集約する」セクション参照
- **1-E/2-A 招待メール**: `inviteUserByEmail` に一本化（`createUser` は使わない）。`data: { inviter_name, organization_name }` で差し込み、`config.toml` + Dashboard にテンプレ設定
- **2-B AUTH-008 既設定ユーザー**: エラー表示せず無言で `/mypage` にリダイレクト
- **2-D/2-E/3-B URL 体系**: `/messages/templates`, `/mypage/client-profile`, `/mypage/members` 配下の階層 URL。Middleware はロール別の粗いブロックのみ、org_role 判定は各 page.tsx で実施
- **3-H Owner 退会後の空白期間**: ~~運営が後任指名するまでの空白期間を許容~~ → **2026-04-19 C 案採用で廃止**: Owner 退会時は Admin の有無に関わらず組織ごとソフトデリートする方針に変更。空白期間自体が存在しなくなり、`client_profiles.user_id` 移譲という運営手順も不要。Admin/Staff が事業継続を希望する場合は新規法人アカウントを立てて再招待する運用フロー（organization/requirements.md「退会（COM-006 = `/profile/withdrawal`）」セクション参照）

## デザインカンプの取り扱い

本仕様書で扱う画面（CLI-016〜025、AUTH-008）に関するデザインカンプの PNG 運用ルールを明記する。実装開始のブロック要因を減らすため、未整備・要再描画の PNG があっても**実装開始を待たない**方針とする。

### AUTH-008.png（招待承諾・パスワード設定）

- **状態**: 未作成
- **方針**: **新規作成不要**。REQ-ORG-010「新規画面：AUTH-008 招待承諾・パスワード設定」セクションに記載の通り、既存の AUTH-004（`src/app/(auth)/reset-password/confirm/page.tsx`）と同一レイアウトを踏襲する。差分はタイトル・説明文・ボタン文言・遷移先・期限切れリンクの 5 箇所のみで、そちらは仕様書本文に明記済み
- **デザイン担当への依頼**: 不要

### CLI-021.png（発注者情報編集）

- **状態**: 既存 PNG あり。ただし仕様変更で追加した「住所入力欄」が描かれていない
- **方針**: **実装開始前に再描画を待つ必要はない**。実装者は仕様書本文に従って実装する:
  - 配置: 社名・氏名（`display_name`）の直下
  - ラベル: 「住所」（任意マーク。必須マークは付けない）
  - プレースホルダー: 「東京都墨田区○○XX-X-XX」
  - 入力タイプ: 単一行 Input
  - 文字数上限: 200 字（Zod でクライアント・サーバー両方で検証）
- **事後レビュー**: 実装完了後、実装者が実機スクリーンショット（PC・SP 両方）をデザイン担当へ送付し、レイアウト・余白・ラベル配置についてレビューを受ける。必要な微調整を反映する
- **PNG 再描画**: 実装完了後の**ドキュメント整備タスク**として別途対応する。本機能のリリースブロック要因にはしない

### 既存 PNG が用意されている画面（CLI-016〜020、CLI-022〜025）

- 通常通り `design-assets/screens/` の既存 PNG を正として実装する
- PC 版・SP 版の両方が存在する場合は両方に従ってレスポンシブ対応する（CLI-022 で明記済み）
- 仕様書本文とデザインカンプの記載が矛盾する場合の優先順位は CLAUDE.md のルールに従う（デザインカンプを優先し、判断に迷う場合は確認）

---

## 付録 A: 実装前提リファクタリング手順（実装者向け）

> **注:** 本節は実装作業のチェックリストであり、要件の読者は飛ばしてよい。ここに書かれている内容は、将来 tasks.md が生成された時点でそちらへ移す。
>
> organization の spec-impl を開始する前に、以下のリファクタリングを完了すること。これは仕様変更（発注者表示名を `client_profiles.display_name` に一本化、`organizations.name` 廃止）に伴う既存コードの修正であり、CLI-016〜025 の画面実装より先に行う。
>
> **ファイルリストの検証**: 本節の Step 2〜5 に列挙するファイルは **2026-04-19 時点で grep により検証済み**（対象パターン: `getActiveCorporateOrgNames` / `organizations\s*\(\s*.*name` / `organizationName` / `resolveParticipantName`）。ただし実装着手までに新規機能追加で参照箇所が増える可能性があるため、**実装者は着手時に以下の 3 コマンドで再 grep して漏れがないか確認すること**:
>
> ```bash
> rg -n "getActiveCorporateOrgNames" src
> rg -n "organizations\s*\(\s*[^)]*name" src
> rg -n "organizationName" src
> ```
>
> 新たな参照が見つかった場合は、それを本節の該当 Step のリストに追記してから実装に入ること。

### Step 1: データベース migration

#### 1-A. 実行順序（必ずこの順で行う）

`organizations.name` は現在 `NOT NULL` 制約付きかつ既存データ・既存コードが参照している。カラム DROP を先に実行すると migration 実行時にエラーで止まる。以下の順で段階的に実施する:

1. **制約を外す migration**: `ALTER TABLE organizations ALTER COLUMN name DROP NOT NULL;` を適用する（これで空文字 or NULL を許可できる）
2. **データ移行 migration**: `organizations.name` の既存値を `client_profiles.display_name` に UPDATE でコピーする（既存 `client_profiles` が無い organization は INSERT で新規作成する）
3. **コードの書き換え**: Step 2〜4（共通関数・全画面・organization-setup 統合）を完了させる
4. **カラム削除 migration**: 上記 3 が完全に反映されたことを確認したうえで、最後に `ALTER TABLE organizations DROP COLUMN name;` を適用する

段階は **別々の migration ファイル** に分ける（1 ファイルで一気にやらない）。理由: デプロイ中に 3 のコード書き換えが未反映のまま 4 が先に走ると `organizations.name` を参照する既存コードが落ちるため、必ずコード配布 → DROP の順で流せるよう分離する。

> **具体的な migration ファイル一覧と配布ルール**: 本 spec は合計 **10 ファイル**を配布する（グループ①: 安全な 9 ファイル先行配布 / グループ②: コード PR デプロイ 追加 migration なし / グループ③: 別 PR で 24-48 時間の観察期間後に投入する破壊的 1 ファイル = file 10）。`ensure_organization_exists(uid uuid)` は現行シグネチャのまま本体のみ書き換えるため Group 1 で安全に先行配布可。R3/D 対応で `handle_new_user` トリガー拡張（file 9）も Group 1 に追加済み。上記 1〜4 は 10 ファイルの中の一部に対応する。全ファイルの詳細は `.kiro/specs/organization/design.md` の「Migration Strategy」セクションを参照。

#### 1-B. migration 対象テーブル・RPC

| 対象 | 作業内容 |
|---|---|
| `organizations` テーブル | 1-A の 1・2・4 を個別 migration で順に適用 |
| `ensure_organization_exists()` RPC | `supabase/migrations/20260411100100_billing_rpc_functions.sql` の INSERT 文から `name` パラメータを除去する migration を作成。Step 4 のコード書き換え（billing actions）と同時適用 |
| `client_profiles` テーブル | 1-C のカラム追加・変更を適用する migration を作成 |
| `supabase/seed.sql` | (1) organizations の INSERT（現状 L453・L911・L974 の 3 箇所。いずれも `INSERT INTO organizations (id, name, owner_id)` 形式）から `name` フィールドを削除。既存の組織名データ（例「鈴木工務店株式会社」「山田建設株式会社」「補償テスト建設」）は対応する `client_profiles.display_name` の UPDATE/INSERT に変換して同 seed 内に追記。(2) 既存の `client_profiles` のうち 1〜2 行に `address` カラムのサンプル値（例「東京都墨田区○○1-2-3」）を追加し、CLI-020 / CLI-021 のレイアウト確認と E2E テストで住所表示を検証可能にする。`sns_*` カラムは全行 DEFAULT false のままで差し支えない（個別のテストが必要なら該当行のみ true に設定） |

#### 1-C. `client_profiles` カラムの追加・変更

CLI-020・CLI-021 の表示／編集項目を満たすため、以下のカラムを追加・修正する。

**既に migration 済みで本 spec で追加作業が不要なもの:**
- `language text` — `supabase/migrations/20260404110000_add_language_to_client_profiles.sql` で追加済み ✅
- `recruit_area text[]` — `supabase/migrations/20260331000000_011_alter_client_profiles_recruit_area_to_array.sql` で text → text[] 変換済み ✅

**本 spec で新規 migration を作成し追加するもの:**

| カラム名 | 型 | NULL 可 | 長さ上限 | 用途 |
|---|---|:-:|:-:|---|
| `address` | `text` | ○ | 200 字 | 住所（CLI-020 で社名の下に表示） |
| `sns_x` | `boolean` (`DEFAULT false NOT NULL`) | ✕ | — | 「X（旧 Twitter）を利用しているか」のチェック値 |
| `sns_instagram` | `boolean` (`DEFAULT false NOT NULL`) | ✕ | — | 「Instagram を利用しているか」のチェック値 |
| `sns_tiktok` | `boolean` (`DEFAULT false NOT NULL`) | ✕ | — | 「TikTok を利用しているか」のチェック値 |
| `sns_youtube` | `boolean` (`DEFAULT false NOT NULL`) | ✕ | — | 「YouTube を利用しているか」のチェック値 |
| `sns_facebook` | `boolean` (`DEFAULT false NOT NULL`) | ✕ | — | 「Facebook を利用しているか」のチェック値 |

1 つの migration ファイルで 6 カラムまとめて追加してよい（依存関係なし）。

**SNS カラムの仕様（重要）:**
- 利用 SNS はアカウント名・URL を収集しない。「どの SNS を使っているか」のチェックボックス値のみを保持する（`true` = 利用あり / `false` = 利用なし）
- CLI-021 に「※ 運営上の集計等のみに使用し、webアプリ上に表示はされません」の注記を表示する（デザインカンプ CLI-021.png より）
- 受注者側の画面（CLI-020 等）には SNS 情報は表示しない。運営の集計・分析用のみ
- 既存 steering `database-schema.md` の `sns_*` カラム定義は本仕様書の更新と同時に boolean に書き換え済み（organization 作業で反映済み）

**住所（`address`）に関する注意:**
- 発注者として受注者に見せる公開情報は全て CLI-020（詳細表示）／ CLI-021（編集）で扱う方針のため、住所もこの 2 画面で完結させる
- CLI-020（詳細表示）では社名・氏名の直下に住所を表示する
- CLI-021（編集）に住所入力欄を追加する（現行 `design-assets/screens/CLI-021.png` に未描画のため、デザインカンプの再描画が必要）

### Step 2: 共通関数の書き換え（2 ファイル）

| ファイル | 作業内容 |
|---|---|
| `src/lib/utils/display-name.ts` | (1) `resolveParticipantName()` を新ロジックに書き換え。引数: `organizationName` → `displayName`（`client_profiles.display_name`）。優先順位: `displayName → last_name + first_name` の 2 段階。(2) 同ファイル L24 の `getUserDisplayName()` 内の `` `${last} ${first}` `` を `` `${last}${first}` `` に修正する（**スペース無し**。CLAUDE.md の姓名結合ルールに従う。現行は同一ファイル内でさえ L24 がスペースあり、L58 がスペース無しで不整合しているためこの機会に統一する） |
| `src/lib/utils/resolve-org-names.ts` | `getActiveCorporateOrgNames()` を廃止。代替として `client_profiles.display_name` を直接取得するヘルパー関数に置き換え（or 各ページでインライン取得） |

### Step 3: 全画面のクエリ書き換え（3-A 14 ファイル + 3-B 2 ファイル = 合計 16 ファイル）

**Step 3 には 2 種類のリファクタリングが含まれる:**

- **3-A. 発注者表示名の一本化（14 ファイル）**: `getActiveCorporateOrgNames()` / `organizations.name` 参照を `client_profiles.display_name` 直接取得に置き換え
- **3-B. 発注者アバターの一本化（2 ファイル）**: 「受注者が見る発注者のアバター」を `users.avatar_url` から `client_profiles.image_url` に切り替え（全プラン共通。個人発注者・小規模・法人プラン全てで CLI-021 登録画像を優先し、未登録時は既存のデフォルト画像にフォールバック）

#### 3-A. 発注者表示名の一本化（14 ファイル）

以下の全ファイルで `getActiveCorporateOrgNames()` の呼び出しまたは `organizations.name` の参照を `client_profiles.display_name` の直接取得に置き換える:

| # | ファイル | 画面 |
|---|---|---|
| 1 | `src/app/(authenticated)/clients/page.tsx` | CON-005 発注者一覧 |
| 2 | `src/app/(authenticated)/clients/[id]/page.tsx` | CON-006 発注者詳細 |
| 3 | `src/app/(authenticated)/favorites/page.tsx` | CON-007 マイリスト |
| 4 | `src/app/(authenticated)/mypage/page.tsx` | CON-001 マイページ |
| 5 | `src/app/(authenticated)/jobs/search/page.tsx` | CON-002 案件検索 |
| 6 | `src/app/(authenticated)/jobs/[id]/page.tsx` | CON-003 案件詳細 |
| 7 | `src/app/(authenticated)/jobs/[id]/apply/page.tsx` | CON-004 応募情報入力 |
| 8 | `src/app/(authenticated)/jobs/manage/page.tsx` | CLI-002 案件管理 |
| 9 | `src/app/(authenticated)/applications/actions.ts` | マッチング通知メール |
| 10 | `src/app/(authenticated)/applications/history/page.tsx` | CON-011 応募履歴一覧 |
| 11 | `src/app/(authenticated)/applications/history/[id]/page.tsx` | CON-012 応募詳細 |
| 12 | `src/app/(authenticated)/messages/page.tsx` | メッセージ一覧（名前表示） |
| 13 | `src/app/(authenticated)/messages/[threadId]/page.tsx` | CON-009/CLI-013 メッセージ詳細（L31 で `organizations(id, name)` を SELECT、L55 で `organizationName: org?.name` を参照） |
| 14 | `src/app/(authenticated)/messages/scout-send/actions.ts` | CLI-015 スカウト送信（L179 で `organizationName: orgName` を使用） |

**備考:**
- 旧リストに含めていた `src/app/(authenticated)/applications/received/[id]/page.tsx`（CLI-009 応募詳細・発注者側）は `organizations.name` 参照コードを持たないため対象外。
- `src/__tests__/utils/resolve-org-names.test.ts` は Step 5（テスト修正）で扱う。

#### 3-B. 発注者アバターの一本化（2 ファイル）

**背景**: メッセージ画面で受注者が発注者とのスレッドを開いた際、現状コードは発注者側のアバターとして `users.avatar_url`（個人の顔写真）を参照している。しかし本仕様では発注者を受注者に見せる際は全プラン共通で CLI-021 で登録した会社画像（`client_profiles.image_url`）を使う。法人プランの場合、複数のメンバーがスレッドを共有するため「誰が送信したかで個人アバターが切り替わる」UI は不自然であり、発注者としての統一アイコン（会社ロゴ）を表示する方が UX 上正しい。

| # | ファイル | 修正内容 |
|---|---|---|
| 15 | `src/app/(authenticated)/messages/[threadId]/page.tsx` | L29-31 の `.select(...)` に `client_profiles(image_url)` を追加し、L60 の `otherAvatarUrl = participant1?.avatar_url ?? null` を `otherAvatarUrl = clientProfile?.image_url ?? null` に変更。`isContractorSide` が true（受注者が発注者を見る側）のときのみ適用する。逆方向（発注者が受注者を見る）は従来通り `users.avatar_url` を使用 |
| 16 | `src/app/(authenticated)/messages/page.tsx` | スレッド一覧で各スレッドの相手アバターを取得する箇所について、相手が発注者側の場合は `client_profiles.image_url` から取得、相手が受注者側の場合は従来通り `users.avatar_url` を使うよう修正 |

**フォールバック**: `client_profiles.image_url` が NULL の場合、既存のデフォルトプレースホルダー（`/assets/icons/icon-avatar.png` のグレー人型）を表示する（現行挙動を維持）。

### Step 4: organization-setup の CLI-021 統合と新規ルート追加

#### 4-A. 既存ファイルの書き換え（8 ファイル）

| ファイル | 作業内容 |
|---|---|
| `src/app/(authenticated)/mypage/organization-setup/page.tsx` | **削除**（CLI-021 が初回セットアップも担うため）。ユーザーが URL 直打ちした場合に備え、リダイレクト用の page.tsx を残しても可 |
| `src/app/(authenticated)/mypage/organization-setup/actions.ts` | **削除**。`saveOrganizationNameAction` は CLI-021 の Server Action に吸収 |
| `src/app/(authenticated)/mypage/organization-setup/OrganizationSetupForm.tsx` | **削除** |
| `src/app/(authenticated)/billing/actions.ts`（L95-100 付近、`buildSuccessUrl()`） | **全プラン統一**に変更。現行の法人プランのみ `/mypage/organization-setup` + 個人/小規模は `/mypage?checkout=success` の分岐を廃止し、全プランで `/mypage/client-profile/edit?setup=true`（または CLI-021 の実 URL）に遷移する |
| `src/app/(authenticated)/billing/BillingClient.tsx`（L205 付近、アップグレード成功時の `window.location.href`） | 同様に全プランで CLI-021?setup=true に遷移するように変更 |
| `src/app/auth/callback/route.ts`（L14-L66） | **既存の recovery 分岐の隣に `type === 'invite'` 分岐を追加**し、`/accept-invite/confirm` にリダイレクトする |
| `src/app/(authenticated)/messages/scout-send/page.tsx`（テンプレ取得部分、L78-81 付近） | `scout_templates` の `.order("created_at", { ascending: false })` を `.order("updated_at", { ascending: false })` に変更（REQ-ORG-004-B と揃える） |
| `src/app/(authenticated)/messages/scout-send/scout-send-form.tsx`（`handleTemplateSelect`、L63-70 付近） | タイトル・本文のいずれかに入力がある場合、`window.confirm("入力中の内容がテンプレートで上書きされます。よろしいですか？")` を呼び OK のときのみプリフィルを実行するよう修正（REQ-ORG-004-B） |

#### 4-B. 新規作成する画面・ルート（AUTH-008 + CLI-016〜025）

| 新規ファイル | 内容 |
|---|---|
| `src/app/(auth)/accept-invite/confirm/page.tsx` | AUTH-008 本体（Client Component） |
| `src/app/(auth)/accept-invite/confirm/actions.ts` | `acceptInviteAction`（`supabase.auth.updateUser({ password })`） |
| `src/app/(authenticated)/messages/templates/page.tsx` 他 | CLI-016〜019 スカウトテンプレート CRUD 一式 |
| `src/app/(authenticated)/mypage/client-profile/page.tsx` 他 | CLI-020・CLI-021 発注者情報表示・編集 |
| `src/app/(authenticated)/mypage/members/page.tsx` 他 | CLI-022〜025 担当者管理 |
| `src/lib/email/templates/email-changed-by-admin.tsx` | CLI-024 でメールアドレスを他メンバーによって変更された場合に、旧メール・新メール両方へ送信する通知メールの本文テンプレート（React Email）。件名「メールアドレスが変更されました」、本文は「組織の管理者によりメールアドレスが変更されました。身に覚えがない場合は運営までご連絡ください（COM-008 のリンク）」|
| `supabase/migrations/{timestamp}_staff_member_rpcs.sql` | REQ-ORG-010 / REQ-ORG-008 のトランザクション境界を担保する 2 つの `SECURITY DEFINER` 関数（`insert_staff_member_with_limit` / `delete_staff_member`）の作成 migration。`service_role` のみ EXECUTE 可。詳細仕様は design.md 参照 |
| `supabase/tests/insert_staff_member_with_limit.test.sql` | 上記 RPC の pgTAP テスト（上限内 INSERT 成功 / `STAFF_LIMIT_EXCEEDED` / `FOR UPDATE` 直列化 / `INVALID_ORG_ROLE` / `USER_NOT_FOUND` / 権限拒否 / 既存ユーザー行不変（D 採用） / `PROXY_ACCOUNT_ALREADY_EXISTS`（R4 対応） / proxy=false 時のスキップ確認 の **8 シナリオ**） |
| `supabase/tests/delete_staff_member.test.sql` | 上記 RPC の pgTAP テスト（atomic 実行 / 冪等性 / 権限拒否の 3 シナリオ） |
| `supabase/tests/handle_new_user_invite_metadata.test.sql` | D 対応で追加した `handle_new_user` トリガー拡張の pgTAP テスト（メタデータから role='staff' / 姓名保存 / メタデータ無し時の contractor フォールバック / 不正値時の contractor フォールバック の 4 シナリオ） |

※ 具体的なディレクトリ構成・ファイル分割は design.md で確定する

### Step 5: テスト修正（7 ファイル: Vitest 4 + Playwright 2 + pgTAP 1）

#### Vitest（ユニット・統合）

| ファイル | 作業内容 |
|---|---|
| `src/__tests__/utils/resolve-org-names.test.ts` | `getActiveCorporateOrgNames` 廃止に伴い**全削除**（約 155 行） |
| `src/__tests__/billing/save-org-name-action.test.ts` | organization-setup 暫定画面廃止に伴い**全削除** |
| `src/__tests__/billing/start-checkout-action.test.ts` | **全プランで** success_url が `CLI-021?setup=true` になることをアサートするよう書き換え。現行の「法人のみ organization-setup」「個人/小規模は `?checkout=success`」の分岐テストを統一テストに集約する。併せて「個人/小規模プランはスキップ可能である」ことの挙動は CLI-021 側の E2E でカバー |
| `src/__tests__/billing/plan-actions.test.ts` | L228 付近のコメント「`/mypage/organization-setup` へ遷移してもガードを通れるように」を CLI-021 基準に書き換え（コメントのみ、ロジックは影響なし） |

#### Playwright（E2E）

| ファイル | 作業内容 |
|---|---|
| `e2e/billing.spec.ts` | organization-setup 関連のテストケースを CLI-021（`?setup=true`）遷移に書き換え。さらに L13 のコメント（`corp-noname@test.local: corporate active, organizations.name=''`）を `client_profiles.display_name=''` 基準に書き換え。併せて「個人・小規模プラン購入時も CLI-021?setup=true に遷移する」「個人・小規模プランで『スキップして後で設定する』を押下すると CON-001 に遷移し、表示名フォールバック（`users.last_name + first_name`）が使われる」シナリオを新規追加 |
| `e2e/display-name.spec.ts` | L8・L14 のコメント（「`organizations.name` を優先表示」「organizations.name = '補償テスト建設'」）を `client_profiles.display_name` 基準に書き換え。テスト本体のアサーションも「`organizations.name` ベース」から「`client_profiles.display_name` ベース」に置換 |

#### pgTAP（RLS テスト）

| ファイル | 作業内容 |
|---|---|
| `supabase/tests/messaging_rls.test.sql` | L41 の `INSERT INTO organizations (id, name, owner_id) VALUES (..., 'テスト株式会社', ...)` から `name` カラムを削除し、対応する `client_profiles (user_id, display_name) VALUES (..., 'テスト株式会社')` の INSERT を追加する。これは Step 1-A の 4（`organizations.name` DROP）の migration 実行前に修正しないとテストが落ちるため、Group 3 の破壊的 migration（file 10）配布前に必ず完了させる |

### Step 5.5: 周辺スクリプトの処理

| ファイル | 作業内容 |
|---|---|
| `scripts/task16-integration.mjs` | **削除または無効化**。Task 16（billing Stripe CLI 自動化テスト）の一回限りの検証スクリプトで、L11 コメント・L128/L129/L138/L139 で `organizations.name` の INSERT/SELECT に依存している。CLI-021 統合後は動作不能になるため、以下のいずれかを選択: (a) スクリプト全体を削除する（推奨。Task 16 は完了済み） (b) `organizations.name` 参照を `client_profiles.display_name` に書き換え、遷移先を `/mypage/client-profile/edit?setup=true` に変更して保守する |

### Step 5.6: billing spec ドキュメントの記述更新

organization 実装時に `organizations.name` カラムが廃止されると、既存の billing spec 配下のドキュメントに残る `organizations.name` 参照が historical にしか意味を持たなくなる。本 spec 実装の一環として以下を更新する（billing の暫定仕様が organization 実装で完結する旨を明示）。

| ファイル | 作業内容 |
|---|---|
| `.kiro/specs/billing/tasks.md` | 同ファイル L423-L433 の「`organizations.name` への参照行リスト」に従って、L436 / L519 / L520 / L657-L661 / L673 / L744 / L745 の記述を `client_profiles.display_name` 基準に書き換え。Task 8.7（暫定画面）の記述は「organization spec で CLI-021 に統合済み」の注記を残して完了扱いに変更 |
| `.kiro/specs/billing/requirements.md` | L491 / L521 の「`organizations.name` カラムは organization spec で廃止される」表現を**過去形**に書き換え（「廃止された」「削除済み」）。発注者表示名は `client_profiles.display_name` に一本化済みである旨を明示 |
| `.kiro/specs/billing/design.md` | L248 / L556 / L571 / L590 / L597 / L1419 の `organizations.name` 参照を確認。廃止済みであることを反映し、Phase 1 暫定画面の記述は「organization spec で置き換え済み」の注記に変更 |
| `.kiro/specs/billing/research.md` | L12 の「`organizations.name` カラムは organization spec で廃止予定」を「廃止済み」に更新 |
| `.kiro/specs/billing/impl-memo.md` | **更新しない**（billing/tasks.md L433 の指示通り、L254 / L294 の `organizations.name` 参照は**歴史的記録として保持**する。過去の仕様変遷が追えなくなるため削除禁止） |

更新の基本方針: 「organizations.name は廃止済み、発注者表示名は `client_profiles.display_name` に一本化済み」を繰り返し書かず、過去形で簡潔に示す。詳細は `.kiro/steering/database-schema.md`「発注者表示名のルール」および本 spec 付録 A を参照、という形で steering / spec 間の記述を DRY に保つ。

### Step 6: 全テスト実行で確認

```bash
npm run test        # Vitest
supabase test db    # RLS テスト
npm run test:e2e    # Playwright
```

全テストが通ったことを確認してから、CLI-016〜025 の画面実装に着手する。
