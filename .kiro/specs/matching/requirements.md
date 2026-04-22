# マッチング機能（matching）— 要件定義

## 概要

応募から発注可否判断、作業完了/失注報告、相互評価までの一連のフローを管理する機能。
受注者側の応募履歴管理と、発注者側の応募管理・発注履歴管理を含む。

## 対象画面

| 画面ID | 画面名 | ロール | 概要 |
|--------|--------|--------|------|
| CON-011 | 応募履歴一覧 | 受注者 | 自分の応募案件のリスト |
| CON-012 | 応募詳細 | 受注者 | 応募した案件の詳細・ステータス表示 |
| CON-013 | 作業報告・評価入力 | 受注者 | 受注者側の稼働状況報告 + 発注者への評価 |
| CLI-007 | 応募一覧 | 発注者 | 案件への応募者リスト |
| CLI-008 | 応募詳細 | 発注者 | 応募者のプロフィール・発注ボタン |
| CLI-009 | 発注可否 | 発注者 | 発注の承認/拒否 |
| CLI-010 | 発注履歴一覧 | 発注者 | 発注済み案件のリスト |
| CLI-011 | 発注履歴詳細 | 発注者 | 発注済み案件の詳細・ステータス |
| CLI-012 | 作業完了/失注報告・評価登録 | 発注者 | 発注者側の完了報告 + 受注者への評価（6項目） |
| CLI-028 | 発注者評価 | — | 発注者→受注者の評価表示画面（6項目集計） |

## 対象ロール

- 受注者（Contractor）: CON-011〜013
- 発注者（Client）: CLI-007〜012, CLI-028
- 担当者（Staff）: 組織内の案件について CLI-007〜012 を操作可能。CON-011〜013（応募履歴）はアクセス不可（staffは応募できないのでデータなし。Middlewareでブロック）

## 機能要件

### 受注者側

#### REQ-MT-001: 応募履歴一覧（CON-011）

- 自分が応募した案件の一覧を表示する
- **ステータスフィルター**: 画面上部に「ステータス」ラベル + プルダウン（「お選びください」プレースホルダー）+ 「検索」ボタンを配置し、フィルター可能にする
- フィルター選択肢（表示用カテゴリ）:
  - 応募結果待ち — applications.status = 'applied' に対応
  - 稼働予定 — applications.status = 'accepted' かつ client_reviews なし・user_reviews なし（どちらも未評価）
  - 評価登録未入力 — applications.status = 'accepted' かつ client_reviews なし・user_reviews あり（相手の発注者は評価済み、自分はまだ）
  - 評価登録済み — applications.status = 'accepted' かつ client_reviews あり・user_reviews なし（自分は評価済み、相手の発注者はまだ）
  - 落選・キャンセル — applications.status IN ('rejected', 'cancelled') に対応
  - 取引完了 — applications.status IN ('completed', 'lost') に対応
- **検索結果件数**: カード一覧の上に「検索結果: ○○件」を表示する
- **並び替え**: 検索結果件数の右側にソートボタン（`assets/icons/icon-sort.png` を使用）を設置する
- **カード表示項目**（上から順）:
  1. ステータスバッジ（カード左上）— 表示ラベルはフィルター選択肢と同じ5種類を使用
  2. 案件タイトル
  3. 発注者の社名・氏名（※ `client_profiles.display_name`（CLI-021 で入力した名前）を表示。フォールバック: `users.last_name + first_name`）
  4. 募集職種・人数（左寄せ）、募集締め切り日（右寄せ）— 同じ行に横並び
  5. 報酬（例: 20,000円（人工））— `assets/icons/icon-coin.png`（コインアイコン）付き
  6. エリア（例: 東京都、埼玉県）— `assets/icons/icon-pin.png`（ピンアイコン）付き
  7. 募集期間（例: 20XX/XX/XX〜20XX/XX/XX）— `assets/icons/icon-calendar.png`（カレンダーアイコン）付き
- **カード内ボタン**: 各カードの下部に以下のカプセル型（ピル型）ボタンを配置
  - 「メッセージを確認」（アウトライン）— 当該応募に関連するメッセージスレッドへ遷移
  - 「応募詳細を見る」（塗りつぶし）— CON-012 へ遷移
- デフォルトソート: 応募日の降順
- ページネーション: 20件ずつ
- 画面下部に「もどる」ボタン — マイページへ遷移

#### REQ-MT-002: 応募詳細（CON-012）

- 応募した案件の詳細情報を表示する
- 画面構成（上から順）:
  1. **ヘッダー**: 「応募詳細」（タイトル）
  2. **ステータスバッジ**: CON-011 と同じ表示用カテゴリ5種類のバッジを表示
     - ステータスが 'rejected' または 'cancelled' の場合: ステータスバッジ直下に注意書きテキストを表示する（赤文字、枠なし）
       - rejected: 「この応募はお断りとなりました。稼働は行われていません。」
       - cancelled: 「この応募はキャンセルしました。稼働は行われていません。」
  3. **案件情報セクション**:
     - 案件タイトル
     - 発注者の所属企業名
     - 募集職種・人数
     - 報酬 — `assets/icons/icon-coin.png`（コインアイコン）付き
     - エリア — `assets/icons/icon-pin.png`（ピンアイコン）付き
     - 募集期間 — `assets/icons/icon-calendar.png`（カレンダーアイコン）付き
     - 稼働時間（例: 8:00〜17:00（残業無）休日：○曜日）— lucide-react `Clock` アイコン付き（`className="w-4 h-4 text-primary/70"`）
  4. **「募集案件詳細」カプセル型ボタン**: クリックで CON-003（募集案件詳細）に遷移する
  5. **「以下の内容で応募済みです。」セクション**: 自分が応募時に入力した内容を表示
     - 人数（チェックマークアイコン付き）
     - 日程（チェックマークアイコン付き）
     - 希望初回稼働日（チェックマークアイコン付き）
     - 申し送り（チェックマークアイコン付き）
  6. **「勤務についての詳細」セクション**:
     - **表示条件**: applications.status = 'accepted' の場合のみ表示する。applied（応募結果待ち）、rejected（落選）、cancelled（キャンセル）の場合は非表示
     - 表示項目:
       - 【勤務地】— jobs テーブルから取得
       - 【勤務日・稼働時間】— jobs テーブルから取得
       - 【持ち物】— jobs テーブルから取得
       - 【必須スキル】— jobs テーブルから取得
       - 【業務に関する書類】（画像表示エリア含む）— jobs テーブルから取得
       - 【その他】— CLI-009-B で発注者が入力した連絡事項（applications.client_notes）
       - 【初回稼働日】— CLI-009-B で発注者が設定した日付（applications.first_work_date）
       - ※【申し送り】は「以下の内容で応募済みです。」セクションで表示済みのため、ここには含めない
  7. **「キャンセルする」テキストリンク**:
     - applications.status = 'accepted' の場合のみ表示
     - **キャンセル可否の判定基準**: 発注者が設定した初回稼働日（applications.first_work_date）の5日前まではキャンセル可能
     - 初回稼働日の5日前を過ぎた場合: ボタンを非活性にし、注意文言を表示:「初回稼働日の5日前を過ぎたため、システムからはキャンセルできません。」
     - キャンセル実行時: 確認ポップアップ → applications.status を 'cancelled' に更新 → CON-011 へ遷移
  8. **「評価を入力する」ピル型ボタン（塗りつぶし）**: CON-013 へ遷移
     - applications.status = 'accepted' の場合のみ表示
     - 既に client_reviews が登録済みの場合は非表示 or 非活性
  9. **「もどる」ピル型ボタン（アウトライン）**: CON-011 へ遷移（router.back()）
- **画面遷移（追加）**: CON-012 → CON-003（「募集案件詳細」ボタン経由）

#### REQ-MT-003: 作業報告・評価入力 — 受注者側（CON-013）

- 画面タイトル: 「作業報告・評価入力」
- 受注者が稼働状況を報告し、発注者を評価する
- 画面構成（上から順）:
  1. **タイトル**: 「作業報告・評価入力」
  2. **作業報告セクション**:
     - 「稼働状況」（必須、**プルダウン選択**、「お選びください」プレースホルダー）:
       - 問題なく稼働完了
       - 一部欠席したものの概ね問題なく稼働完了
       - 欠席（連絡あり）
       - 欠席（連絡なし）
       - 発注者側からお断り
       - その他
     - 「稼働状況の補足」自由記入欄（任意）
  3. **評価入力セクション**:
     - 「また仕事を受けたいか？」（必須）— サムアップ👍 / サムダウン👎 のアイコンボタンで選択（'good' / 'bad'）
     - 選択時にアイコンの色が変化するインタラクションを実装する（未選択: グレー → 選択時: アクティブカラー）
     - 「評価の補足」自由記入欄（任意）
  4. **「作業報告・評価を登録する」ピル型ボタン（塗りつぶし）**
  5. **「もどる」ピル型ボタン（アウトライン）**
- **評価によるステータス遷移（双方向）**: 受注者（CON-013）・発注者（CLI-012）どちらが先に評価を登録してもよい。片方が評価を登録した時点では `accepted` のまま維持し、**両方の評価（client_reviews + user_reviews）が揃った時点で** status を `completed` または `lost` に遷移する。最終ステータスは発注者側の `operatingStatus` を `mapOperatingStatusToApplicationStatus()` でマッピングした値（'completed' / 'lost'）を採用する
- client_reviews テーブルに operating_status（選択値をそのまま保存）、status_supplement、rating_again、comment を保存
- 保存成功後: マイページトップ（/mypage）へ `?success=report` 付きで遷移し、トースト通知「作業報告・評価を登録しました」を表示する

### 発注者側

#### REQ-MT-004: 応募一覧（CLI-007）

- 自社の案件に対する応募者の一覧を表示する
- 案件ごとにフィルター可能（searchParams `jobId`）
- **並び替え**: 「全○○件」の右にソートアイコン（`assets/icons/icon-sort.png`）を配置。クリックで `sort` searchParam を `asc` ↔ `desc` にトグルし、応募日の昇順/降順を切り替える
- **カードリスト**: `max-w-6xl mx-auto` で中央寄せ。レスポンシブグリッド（SP: 1列、MD: 2列、LG: 3列）
- **カード表示項目**（上から順）:
  1. ステータスバッジ（カード左上）
  2. アバター + 氏名
  3. 対応できる職種（カンマ区切り）
  4. 本人確認済み / CCUS登録済み バッジ
  5. 対応可能エリア — `assets/icons/icon-globe.png`（地球アイコン）付き
  6. 経験年数 — `assets/icons/icon-briefcase.png`（カバンアイコン）付き
  7. 「このユーザーから以下の案件に応募があります」テキスト
  8. 案件情報カード（タイトル、募集職種・人数、締め切り）
  9. 「応募詳細をみる」ボタン → CLI-008 へ遷移
- ページネーション: 20件ずつ
- デフォルトソート: 応募日の降順

#### REQ-MT-005: 応募詳細（CLI-008）

- 応募者のプロフィール情報と応募内容を表示する
- **レスポンシブ**: `max-w-2xl mx-auto` で中央寄せ
- 画面構成（上から順）:
  1. **ヘッダー**: 「応募詳細」（タイトル）+ ステータスバッジ（タイトル右）
  2. **案件情報セクション**:
     - セクション見出し「案件情報」（太字）
     - 案件タイトル（太字、大きめフォント）
     - 募集職種・人数
     - 報酬 — `assets/icons/icon-coin.png`（コインアイコン）付き
     - エリア — `assets/icons/icon-pin.png`（ピンアイコン）付き
     - 募集期間 — `assets/icons/icon-calendar.png`（カレンダーアイコン）付き
     - 稼働時間 — lucide-react `Clock` アイコン付き（`className="w-4 h-4 text-primary/70"`）
  3. **「募集案件詳細」ボタン**: primary 塗りつぶしピル型（`rounded-full text-white w-full max-w-xs`）。クリックで CON-003 に遷移
  4. **区切り線** + 「以下の内容で応募があります。」テキスト
  5. **ユーザー情報セクション**:
     - セクション見出し「ユーザー情報」（太字）
     - アバター + 氏名（年齢）
     - 対応できる職種（カンマ区切り）
     - 本人確認済み / CCUS登録済み バッジ
     - 対応可能エリア — lucide-react `CheckCircle2` アイコン付き
     - 経験年数 — lucide-react `CheckCircle2` アイコン付き
     - 保有スキル — lucide-react `CheckCircle2` アイコン付き（user_skills から取得）
     - 保有資格 — lucide-react `CheckCircle2` アイコン付き（user_qualifications から取得）
  6. **「ユーザー詳細」ボタン**: primary 塗りつぶしピル型（`rounded-full text-white w-full max-w-xs`）。クリックでユーザー詳細に遷移
  7. **応募内容セクション**:
     - セクション見出し「応募内容」（太字）
     - 人数（CheckCircle2 アイコン付き）
     - 日程（CheckCircle2 アイコン付き）
     - 希望初回稼働日（CheckCircle2 アイコン付き）
     - 申し送り（CheckCircle2 アイコン付き）
  8. **「発注可否」ボタン**: primary 塗りつぶしピル型。`status === 'applied'` の場合のみ表示。CLI-009 へ遷移
  9. **「もどる」ボタン**: outline ピル型（`w-full max-w-xs`）、router.back()
- 全ボタン幅を `w-full max-w-xs` で統一し、中央寄せ

#### REQ-MT-006: 発注可否（CLI-009）

- 応募に対して発注（承認）またはお断り（拒否）を行う
- **レスポンシブ**: `max-w-2xl mx-auto` で中央寄せ
- **段階的フォーム表示**: プルダウン選択に応じて同一ページ内にフォームを条件付きレンダリング（別ページ遷移ではない）
  - `decision === null` → 追加フォームなし、送信ボタン非活性
  - `decision === 'accept'` → CLI-009-B フォームを展開表示
  - `decision === 'reject'` → CLI-009-C フォームを展開表示
- **CLI-009-B（「発注を依頼する」選択時）**:
  - 「勤務についての詳細」見出し + 説明テキスト
  - 入力項目:
    - 勤務地（必須）— テキスト入力、jobs の住所で初期値プリフィル
    - 業務に関する書類（任意）— 既存 job_images（document タイプ）を読み取り専用表示 + 応募レベルの追加書類アップロード（`application-documents` バケット → `applications.document_urls` に保存）
    - その他（任意）— テキストエリア → applications.client_notes に保存
    - 初回稼働日（必須）— 日付入力 → applications.first_work_date に保存
  - 送信時: applications.status を 'accepted' に更新
  - 受注者へメール通知（マッチング成立通知）
- **CLI-009-C（「お断りする」選択時）**:
  - 入力項目:
    - お断りの理由（任意）— テキストエリア → applications.rejection_reason に保存
  - 送信時: applications.status を 'rejected' に更新
  - 受注者へメール通知（お断り通知）
  - **お断り理由は受注者には表示しない**（内部記録のみ）
- 完了後: ポップアップ「ユーザーへ結果を送信しました」→ OK ボタン → CLI-007（応募一覧）へ遷移

**ストレージ（R2-7 で追加）**:
- バケット: `application-documents`（非公開）
- アップロードパス: `${user.id}/${application.id}/${filename}`
- RLS: 認証ユーザーが自分のフォルダへ INSERT 可、全認証ユーザーが SELECT 可
- DB: `applications.document_urls text[]` カラムにファイルパス（バケット内の相対パス）を保存。表示時は `createSignedUrl()` で Signed URL を生成して表示する（非公開バケットのため `getPublicUrl()` は使用不可）

#### REQ-MT-007: 発注履歴一覧（CLI-010）

- 発注済み（status IN ('accepted', 'completed', 'lost', 'cancelled', 'rejected')）の案件一覧を表示する
- ステータスフィルター（プルダウン即時反映、検索ボタンなし — CON-011 と同じ方式）
  - すべて / 応募あり（未対応） / 発注済み / 評価登録未入力 / 評価登録済み / キャンセル・お断り / 取引完了
  - 「応募あり（未対応）」: status = 'applied'（受注者が応募済みで、発注者がまだ発注可否を決定していない段階）
  - 「発注済み」: status = 'accepted' かつ user_reviews なし・client_reviews なし（どちらも未評価）
  - 「評価登録未入力」: status = 'accepted' かつ user_reviews なし・client_reviews あり（相手の受注者は評価済み、自分はまだ）
  - 「評価登録済み」: status = 'accepted' かつ user_reviews あり・client_reviews なし（自分は評価済み、相手の受注者はまだ）
  - 「キャンセル・お断り」: status IN ('cancelled', 'rejected')
  - 「取引完了」: status IN ('completed', 'lost')
- フィルター状態は URL searchParams（`status`）を Single Source of Truth とする
- 並び替え: updated_at DESC（デフォルト）、ソートアイコンで ASC/DESC トグル
- カード表示項目: ステータスバッジ、受注者情報（氏名・年齢・職種タグ・本人確認/CCUSバッジ・対応可能エリア・経験年数）、応募済み案件情報（タイトル・募集職種/人数・締め切り）
- アクションボタン: 「ユーザー詳細をみる」（outline）/ 「発注内容詳細をみる」（primary）→ CLI-011 へ遷移
- ページネーション: 20件ずつ

#### REQ-MT-008: 発注履歴詳細（CLI-011）

- 発注済み案件の詳細情報を表示する
- レイアウト・アイコンは CON-012（応募詳細）と同一パターンを使用する
- セクション構成:
  1. **案件情報**: タイトル、募集職種・人数、報酬（icon-coin）、エリア（icon-pin）、募集期間（icon-calendar）、稼働時間（CheckCircle2）
     - 「募集案件詳細」ボタン（primary）→ CON-003 へ遷移
  2. **ユーザー情報**: アバター、氏名（年齢）、職種一覧、本人確認済み／CCUS登録済みバッジ（icon-tag）、対応可能エリア、経験年数、保有スキル、保有資格（各 CheckCircle2）
     - データ取得元: users, user_skills, user_available_areas, user_qualifications
     - 「ユーザー詳細」ボタン（primary）→ ユーザー詳細画面へ遷移
  3. **応募内容**: 人数、日程、希望初回稼働日、申し送り（各 CheckCircle2）
- ステータスバッジ: getOrderDisplayCategory() で表示カテゴリを判定
- ステータスが 'rejected' または 'cancelled' の場合:
  - ステータスバッジ直下に注意書きテキストを表示する（赤文字、枠なし）
  - rejected: 「この応募はお断りしています。稼働は行われていません。」
  - cancelled: 「この応募は応募者によりキャンセルされました。稼働は行われていません。」
- ステータスが 'accepted'（発注済み）かつ評価未登録の場合:
  - 「評価入力」ボタン（primary）→ CLI-012 へ遷移

#### REQ-MT-009: 作業完了/失注報告・評価登録 — 発注者側（CLI-012）

- 発注者が作業完了または失注を報告し、受注者を評価する
- 入力フィールド:
  - 稼働状況（必須、受注者側 CON-013 と同じ6選択肢: 問題なく稼働完了 / 一部欠席したものの概ね問題なく稼働完了 / 欠席（連絡あり）/ 欠席（連絡なし）/ 発注者側からお断り / その他）
  - 稼働状況の補足（任意）
  - 評価6項目（各 必須、'good' / 'bad'）:
    1. また依頼したいか（rating_again）
    2. 指示通りに動けるか（rating_follows_instructions）
    3. 稼働予定日にちゃんと来たか（rating_punctual）
    4. 作業は速いか（rating_speed）
    5. 作業は丁寧か（rating_quality）
    6. 工事に必要な工具を持っているか（rating_has_tools）
  - 評価の補足コメント（任意）
- user_reviews テーブルにデータを保存
- 受注者側の評価（client_reviews）が既に登録済みの場合、applications テーブルの status を mapOperatingStatusToApplicationStatus() で変換した値（「問題なく稼働完了」「一部欠席〜」→ 'completed'、それ以外 → 'lost'）に更新する。未登録の場合は status は 'accepted' のまま維持する
- 保存成功後: CLI-010（発注履歴一覧）へ遷移

### 評価表示

#### REQ-MT-010: 発注者評価表示（CLI-028）

- ユーザー詳細（CLI-006）から遷移して、発注者→受注者の評価（user_reviews）を表示する
- 対象: 指定された受注者（職人）に対する全 user_reviews レコードを集計
- ユーザープロフィールセクション: アバター画像、氏名（年齢）、本人確認/CCUSバッジ、お気に入りハートアイコンを表示
- 表示項目（6項目の Good 集計、`good数/総件数案件中` の形式で表示）:
  1. また依頼したい（rating_again）
  2. 稼働予定日に来る（rating_punctual）
  3. 指示通りに動ける（rating_follows_instructions）
  4. 作業が速い（rating_speed）
  5. 作業が丁寧（rating_quality）
  6. 道具を持っている（rating_has_tools）
- 「稼働状況の補足」セクション: user_reviews.status_supplement の一覧を表示（20件ごとにページネーション）
- 「評価の補足」セクション: user_reviews.comment の一覧を表示（20件ごとにページネーション）

## 非機能要件

### セキュリティ

- Middleware: CON 系画面（/applications/history/）は受注者（contractor）・発注者（client）のみアクセス可。担当者（staff）はブロック（staffは応募できないのでデータなし）。CLI 系画面（/applications/received/, /applications/orders/）は発注者（client）・担当者（staff）のみ
- RLS:
  - SELECT（読み取り）:
    - 受注者: 自分の応募のみ閲覧可能
    - 発注者: 自分（または所属組織）の案件への応募のみ閲覧可能
    - client_reviews: 被評価者本人（reviewee_id = auth.uid()）、評価投稿者本人（reviewer_id = auth.uid()）、または同一組織メンバーが閲覧可能
    - user_reviews: 全ユーザーが閲覧可能（公開）
  - UPDATE（ステータス変更）:
    - 受注者: 自分の応募を cancelled に変更可能（status = 'applied' かつ 5日前制限内のみ）
    - 発注者: 自社案件への応募を accepted / rejected に変更可能（status = 'applied' のもののみ）
  - INSERT（評価登録）:
    - 評価: 作成は当事者のみ（UNIQUE 制約で二重登録防止）
  - UPDATE/DELETE（評価）: 不可（編集・削除は仕様上禁止）
- メール通知: 発注/お断り結果の通知はサーバーサイドから送信
  - **clientName（発注者名）の解決**: ハードコード `"発注者"` ではなく、`resolveParticipantName()` で動的に解決する。全プラン共通で `client_profiles.display_name`（CLI-021 で入力した社名・氏名）→ `users.last_name + first_name`（フォールバック）。Staff が送信した場合は Owner の `client_profiles.display_name` を使用。詳細は `.kiro/specs/messaging/requirements.md` の「名前表示ルール」セクションを参照
  - **applicantName（受注者名）の解決**: `users.company_name` → `users.last_name + first_name` の優先順位
- メール送信失敗で本体処理をロールバックしない（security.md の「メール送信失敗時の共通方針」に準拠）

### データ整合性

- 評価は1応募につき1件のみ（UNIQUE (application_id) — 評価者は応募ごとに1人に確定するため application_id のみで一意性を保証）
- **評価の更新・削除不可**: 一度投稿した評価（user_reviews, client_reviews）は編集・削除できない。これは評価の信頼性を保つための意図的な制約であり、UI上に編集・削除ボタンは配置しない
- ステータス遷移の整合性:
  - applied → accepted（発注者が発注）
  - applied → rejected（発注者がお断り）
  - applied → cancelled（受注者が自分でキャンセル、またはユーザー退会時の自動キャンセル）
  - accepted → completed（受注者・発注者の両方が評価を登録した時点で、発注者の operatingStatus が 'completed' の場合に遷移）
  - accepted → lost（受注者・発注者の両方が評価を登録した時点で、発注者の operatingStatus が 'lost' の場合に遷移）
  - accepted → cancelled（管理者による発注取り消し — ADM-014。受注者自身はキャンセル不可）
  - **受注者キャンセルの制約**: status = 'accepted' かつ first_work_date（発注者が設定した初回稼働日）- 5日 > NOW() の場合のみ可能。applied 状態でのキャンセル（応募取り消し）については別途確認が必要
  - **再応募の制約**: rejected 後の同一案件への再応募は不可。DB の UNIQUE 制約 `(job_id, applicant_id) WHERE status NOT IN ('cancelled')` により、rejected レコードが存在する場合は DB レベルで重複 INSERT がブロックされる（cancelled のみ除外 = rejected は制約に含まれるため再応募不可）。cancelled 後の再応募は可能（UNIQUE 制約から除外されているため）

## 画面遷移

```
受注者:
CON-001（マイページ）: 「仕事を探す」セクションの下に、status = 'accepted' の案件を「稼働予定」カードとして表示。
  受注者が評価登録済み（client_reviews あり）の場合はバッジを「評価登録済み」に、
  発注者が先に評価済み（user_reviews あり・client_reviews なし）の場合はバッジを「評価登録未入力」に変更。
  カードに「メッセージ」ボタン（→ /messages）と「応募詳細」ボタン（→ CON-012）を配置。
CON-001 → CON-011（応募履歴一覧）→ CON-012（応募詳細）→ CON-013（作業完了と評価入力）
                                      └→ CON-003（募集案件詳細）※「募集案件詳細」ボタン経由

発注者:
CON-001 → CLI-007（応募一覧）→ CLI-008（応募詳細）→ CLI-009（発注可否）→ CLI-007
CON-001 → CLI-010（発注履歴一覧）→ CLI-011（発注履歴詳細）→ CLI-012（完了報告・評価）
CLI-006（ユーザー詳細）→ CLI-028（発注者評価表示）
```

### スカウト経由応募の連携

#### REQ-MT-011: スカウト経由応募の識別と表示

- **概要**: スカウトメッセージから応募された案件を、通常の応募と区別して表示する
- **データ連携**: messaging spec のスカウト受諾フロー（REQ-MSG-002）から CON-004（応募情報入力）に遷移する際、URL パラメータ `scout_message_id` が渡される。応募データ保存時に `applications.scout_message_id` に記録する
- **応募フォーム（CON-004）**:
  - URL パラメータ `scout_message_id` を受け取った場合、`applications.scout_message_id` に保存する
  - スカウト経由の応募であることを画面上に表示する（「スカウト経由の応募です」のテキスト表示）
  - `scout_message_id` が指定された場合、該当メッセージが存在し `is_scout = true` であることをサーバー側で検証する
- **バッジ表示**: 以下の画面で `scout_message_id IS NOT NULL` の応募に「スカウト経由」バッジを表示する。発注者側は応募段階（CLI-007/008）から発注確定後（CLI-010/011）まで、受注者側は応募履歴（CON-011/012）で、いずれもライフサイクル全体でスカウト経由であることが判別できるようにする
  - CON-011（応募履歴一覧）: ステータスバッジの横に「スカウト経由」バッジ
  - CON-012（応募詳細）: ステータスバッジの横に「スカウト経由」バッジ
  - CLI-007（応募一覧）: ステータスバッジの横に「スカウト経由」バッジ
  - CLI-008（応募詳細）: ステータスバッジの横に「スカウト経由」バッジ
  - CLI-010（発注履歴一覧）: ステータスバッジの横に「スカウト経由」バッジ
  - CLI-011（発注履歴詳細）: ステータスバッジの横に「スカウト経由」バッジ
- **バッジスタイル**: 紫系カプセル型（`bg-[rgba(146,7,131,0.08)] text-primary/70 text-xs rounded-full px-2 py-0.5`）

## 関連テーブル

- applications: 応募情報（CRUD）
- user_reviews: 発注者→受注者の評価（6項目）
- client_reviews: 受注者→発注者の評価（1項目）
- jobs: 案件情報（SELECT）
- users: ユーザー情報（SELECT）
- messages: スカウトメッセージ（SELECT — scout_message_id の検証用）

## 関連 steering

- database-schema.md: applications, user_reviews, client_reviews テーブル
- roles-and-permissions.md: ロール別アクセス権限
- security.md: データアクセス制御

## 未確認事項

なし
