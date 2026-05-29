# Implementation Plan — job-inquiry（求人へのお問い合わせ）

> 対応デザインカンプ: `~/Downloads/求人フォーム.png`（フォーム本体）。受信箱一覧・詳細は新規 ID（COM-014 / COM-015）の専用カンプ無し。`applications/received` 一覧・詳細のスタイルに合わせる（CLAUDE.md デザイン参照ルール）。
> CON-006 ボタンは `clients/[id]/page.tsx` 既存「メッセージを送る」の並びに紫ピル CTA で追加。

- [x] 0. 既存テストの全実行とデグレ確認
  - `npm run test`（Vitest）・`supabase test db`（pgTAP）・`npm run test:e2e`（Playwright）を順に実行し、全てパスすることを確認する
  - 失敗がある場合は原因を調査・修正してから実装に着手する（新機能の前にベースラインを緑にする）
  - _Requirements: -_

- [x] 1. データ基盤（テーブル・RLS・型再生成）
- [x] 1.1 job_inquiries テーブルと RLS の migration
  - 送信者参照（user 削除時 NULL 化）、宛先 client 参照（同上）、宛先 organization 参照（denormalize、削除時 NULL 化）、氏名・メール・お問い合わせ項目（text[]、長さ1以上の CHECK）・お問い合わせ内容（NOT NULL DEFAULT ''）・受信日時を持つテーブルを作成する
  - 連投制限 COUNT 用の `(sender_id, created_at DESC)`、受信箱一覧用の `(target_client_id, created_at DESC)`、組織共有受信箱用の `(target_organization_id, created_at DESC) WHERE target_organization_id IS NOT NULL` の 3 つのインデックスを作成する
  - RLS を有効化し、SELECT は admin / 宛先 client 本人 / 宛先組織メンバー（`is_same_org()`）の 3 ポリシーで OR 開放する
  - INSERT は「認証済みかつ sender_id = auth.uid()」の 1 ポリシーのみ許可する
  - UPDATE / DELETE はポリシーを設けず default deny（一般ユーザー不可。admin client / バックエンドのみ）とする
  - _Requirements: 2.6, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.3_
- [x] 1.2 DB 型の再生成と参照整備
  - `supabase gen types` で型を再生成し、新テーブルに依存する Server Action / RSC ページが型エラーを起こさない状態にしてビルドを通す
  - _Requirements: 8.3_

- [x] 2. 共通モジュール（選択肢・検証・テンプレ・アクセスガード）
- [x] 2.1 (P) お問い合わせ項目ラベル定数
  - 「求人について話を聞きたい」「求人に応募したい」「その他」の 3 つを `as const` のラベル文字列配列として定義する（マスタ化しない。trouble-report / contact と同方針）
  - DB 保存値・Zod の `z.enum()` 入力・メールテンプレ表示で全て同じ定数を参照する
  - _Requirements: 1.6, 1.10_
- [x] 2.2 入力検証スキーマ（client/server 共通）　※依存: 2.1（`INQUIRY_TOPICS` を import）
  - 氏名（必須・100字以内）、メールアドレス（必須・形式検証）、お問い合わせ項目（`z.array(z.enum(INQUIRY_TOPICS)).min(1)`）、お問い合わせ内容（任意・2000字以内・デフォルト ''）の Zod スキーマを定義する
  - エラーメッセージは日本語固定文言とし、クライアント側（react-hook-form）とサーバー側（Server Action）で同一スキーマを再利用する
  - _Requirements: 2.2, 2.3, 2.4, 2.5_
- [x] 2.3 (P) 通知メールテンプレート
  - 件名「【ビジ友】求人へのお問い合わせを受信しました - {senderName}」、本文先頭に宛先発注者の表示名、続いて送信者氏名・メール・選択項目（カンマ区切り）・内容・受信箱詳細 URL（CTA ピル）・ビジ友トップ URL（フッター）を含む HTML を生成する
  - レイアウトは `scout-notification.ts` のテーブル構造を踏襲し、ヘッダー色 `#920783`、CTA ピル、フッターを統一する
  - `{ subject, html }` を返すピュア関数として実装し、外部 I/O を持たない
  - _Requirements: 5.1, 5.2, 5.3_
- [x] 2.4 (P) アクセスガードヘルパー
  - 「閲覧者 viewer」「対象 target」の必要情報（viewer の role / organization_id、target の id / deleted_at / organization_id）を構造化値で受け取り、`{ ok: true } | { ok: false; reason: 'deleted' | 'self' | 'same_org' | 'admin' }` を返すピュア関数として実装する
  - DB アクセスを内部に持たず、CON-006 のボタン表示判定と Server Action のガード判定の両方が同じ関数を呼ぶ前提とする（UI と Server Action の許可範囲一致を関数レベルで保証）
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_

- [x] 3. フォーム送信（Server Action・フォーム画面・フォーム本体）　※依存: 1, 2
- [x] 3.1 求人問い合わせ Server Action
  - 認証ユーザーを取得し、未ログイン・admin ロール・対象不在を拒否する
  - admin client で宛先 client を取得（id・deleted_at・organization_id・auth email）し、Task 2.4 の access-guard で self / deleted / same_org / admin を再検証する（UI ガードと同じ関数を呼ぶ）
  - サーバー側で Zod スキーマを再実行し、必須未入力・形式不正・項目未選択を field レベルで拒否する
  - admin client で「sender_id = auth.uid() AND created_at > now() - 1 hour」の COUNT を取り、5 件以上なら「送信回数の上限に達しました...」を返す
  - admin client で `job_inquiries` に INSERT し、宛先 client の所属組織を `organizations.owner_id` から解決して `target_organization_id` を denormalize 保存する
  - INSERT 成功後に `sendEmail({ to: target email, subject, html })` を fire-and-forget で呼び出し、失敗時は `console.error` のみで本体処理はロールバックしない
  - 結果を `ActionResult` 形式（成功・各種失敗）で返却し、ユーザー向け文言は日本語固定・内部詳細は出さない
  - _Requirements: 1.10, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.5, 3.6, 4.1, 4.2, 5.1, 5.4, 5.5, 5.6, 5.7_
- [x] 3.2 求人問い合わせフォーム画面（RSC）
  - パス `/clients/[id]/inquiry` で SSR レンダリングし、未ログインは Middleware が拒否する前提で認証ユーザー情報を取得する
  - `users.last_name + users.first_name`（スペース無し連結）と `auth.users.email` を初期値として取得し、宛先 client の表示名を `resolveParticipantName()` で解決する
  - Task 2.4 の access-guard を呼び、self / deleted / same_org / admin に該当する場合は `notFound()` または `/clients/[id]` への redirect でフォーム到達自体を遮断する
  - 画面タイトル「求人へのお問い合わせ」とサブタイトル（宛先発注者の表示名）を表示し、フォーム本体に `defaultName` / `defaultEmail` / `targetClientId` / `targetDisplayName` を props として渡す
  - 戻る動線は画面下部の `BackButton`（outline ピル）のみとし、ページ独自の上部戻る矢印は設けない
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 3.4, 3.6, 9.1_
- [x] 3.3 求人問い合わせフォーム本体（Client）
  - react-hook-form + `zodResolver(jobInquirySchema)` でフォーム state を管理し、`defaultValues` に親 RSC から受け取った氏名・メールを設定する
  - 氏名（1欄）・メールアドレス・お問い合わせ項目（チェックボックス3個の複数選択）・お問い合わせ内容（任意 textarea）の入力 UI を提供し、必須/任意バッジを表示する
  - フォーム内ボタンは「送信する」を `type="submit"` で明示し、「もどる」は `type="button"`（BackButton 内部含む）で明示する（CLAUDE.md フォーム内ボタン type ルール）
  - 画面下部は `flex flex-col items-center gap-3` の縦並び中央揃えで、紫ピル CTA「送信する」（`bg-primary text-primary-foreground rounded-full text-white w-full max-w-xs`）と outline ピル「もどる」を縦に並べる
  - 送信時は `submitJobInquiryAction` を呼び、`success: true` で `router.push('/clients/${targetClientId}?inquiry=success')` で発注者詳細(CON-006)へ戻し、`success: false` で `toast.error(result.error)` を表示してフォーム入力を保持する
  - 確認画面ステップ・添付ファイル欄は設けない（1ページ完結）
  - フォーム要素の背景色は `bg-background`（白）で統一する
  - _Requirements: 1.6, 1.7, 1.8, 1.9, 2.1, 2.2, 2.3, 2.4, 2.7, 2.8, 9.1, 9.2_

- [x] 4. CON-006 ボタンと成功トースト統合　※依存: 2, 3
- [x] 4.1 CON-006「求人へのお問い合わせ」ボタン追加
  - `src/app/(authenticated)/clients/[id]/page.tsx` の既存「メッセージを送る」ボタンの並びに、紫ピル CTA「求人へのお問い合わせ」を追加し、`<Link href={\`/clients/${id}/inquiry\`}>` で遷移する
  - 表示判定は Task 2.4 の access-guard を呼び、self / deleted / same_org / admin のいずれかに該当する場合はボタン自体を描画しない（Server Action のガードと完全一致）
  - viewer 側情報（role / organization_id）と target 側情報（id / deleted_at / organization_id）を RSC で取得し、access-guard に構造化値で渡す
  - _Requirements: 1.1, 3.1, 3.2, 3.3, 3.4, 3.6_
- [x] 4.2 成功トースト表示　※依存: 4.1（同一ファイル `clients/[id]/page.tsx` への import 追加が衝突）
  - `/clients/[id]` 内で `searchParams.inquiry === 'success'` を検出するクライアントコンポーネントを新規ファイルで作成し、`toast.success("問い合わせを送信しました")` を実行する
  - 実行後は `router.replace(pathname)` でクエリパラメータを除去し、画面リロード時の二重表示を防ぐ
  - 4.1 のボタン追加と同じ `clients/[id]/page.tsx` を編集（import 行と JSX 配置）するため、4.1 と直列で実装する
  - _Requirements: 2.7_

- [x] 5. 受信箱（一覧・詳細・マイページ導線）　※依存: 1
- [x] 5.1 (P) 受信箱一覧画面（RSC）
  - パス `/mypage/job-inquiries` で SSR レンダリングし、`job_inquiries` を受信日時降順で SELECT する（RLS が「宛先 client 本人 / 同一組織メンバー」のみを返すため UI 側で追加フィルタは不要）
  - 1ページ20件のページネーション（`from / to` + `count: 'exact'` の2クエリ構成、`applications/received/page.tsx` のパターンを踏襲）を実装する
  - 各行に受信日時、送信者氏名、選択されたお問い合わせ項目（複数項目はカンマ区切り、長い場合は省略表示）を表示する
  - 行クリックで `/mypage/job-inquiries/[id]` に遷移する
  - 画面下部に BackButton（マイページへ戻る動線）を設置する
  - ステータスフィルタ・対応済みトグル・返信ボタン等の状態管理 UI は一切設置しない（「保存して読むだけ」の最小構成）
  - _Requirements: 6.2, 6.3, 6.5, 9.3_
- [x] 5.2 (P) 受信箱詳細画面（RSC）
  - パス `/mypage/job-inquiries/[id]` で SSR レンダリングし、1件 SELECT する。行が存在しない（RLS で見えない場合も含む）は `notFound()` で 404 を返す
  - 受信日時、送信者氏名、送信者メールアドレス、お問い合わせ項目、お問い合わせ内容を表示する
  - 送信者メールアドレスは `<a href={\`mailto:${row.email}\`}>` の標準的なハイパーリンクとして表示し、クリックでメーラー起動・モバイル長押し / マウス選択でコピーが自然にできる状態にする
  - 独立した「返信する」ボタン・案内テキスト・対応済みフラグ等の状態管理 UI は一切設置しない（橋渡しコンセプトの維持）
  - 画面下部に BackButton（受信箱一覧またはマイページへ戻る動線）を設置する
  - _Requirements: 6.4, 6.5, 6.6, 6.7, 7.5, 9.3_
- [x] 5.3 (P) マイページ導線追加
  - `src/app/(authenticated)/mypage/page.tsx` の `MANAGE_ORDERS_MENU` 等、発注者向け（Owner / 組織管理者 / 担当者）メニューに「求人へのお問い合わせ」（`href: "/mypage/job-inquiries"`）を1行追加する
  - 受注者専用画面（contractor のみのマイページ）には表示しない。`MANAGE_ORDERS_MENU` の既存可視性ルール（client / org メンバーで表示）を踏襲する
  - 法人プランの担当者（staff）にも表示する（受信箱が組織共有のため）
  - `href` の値が新規ルート `/mypage/job-inquiries` と完全一致することを実装時に確認する（CLAUDE.md「ナビゲーションリンクと実ルートの整合」）
  - _Requirements: 6.1, 6.7, 10.4_

- [x] 6. ドキュメント整合（screen-map / tech / database-schema）　※依存: 1〜5（テーブル定義 / メールテンプレ / 画面パスの確定後に追記）
- [x] 6.1 (P) screen-map.md への画面 ID 追記
  - 求人問い合わせフォーム（COM-013、`/clients/[id]/inquiry`）、受信箱一覧（COM-014、`/mypage/job-inquiries`）、受信箱詳細（COM-015、`/mypage/job-inquiries/[id]`）の 3 画面を COM 系（4. 共通系）の「静的・サポートページ」表または新規節に追記する
  - 各行に画面 ID・画面名・パス・概要（橋渡し性質・状態管理機能なし）を記載する
  - _Requirements: 10.1_
- [x] 6.2 (P) tech.md「メール種別と送信トリガー」表に1行追記
  - 求人問い合わせ通知（テンプレ: `jobInquiryNotificationEmail`、トリガー: `submitJobInquiryAction` 成功時、宛先: 宛先 client の `auth.users.email`、送信元: Resend）を1行追加する
  - 配線済みテンプレ群（matching, scout, billing, withdrawal 等）と並ぶ形で記載する
  - _Requirements: 10.2_
- [x] 6.3 (P) database-schema.md「主要テーブル別ポリシー」追記
  - `job_inquiries` テーブルのカラム定義、3 つのインデックス、5 つの RLS ポリシー（SELECT admin / SELECT target / SELECT org member / INSERT own / UPDATE・DELETE default deny）を追記する
  - 状態管理機能を持たない理由・UPDATE 不要の根拠も短く触れる
  - _Requirements: 10.3_

- [x] 7. テスト　※依存: 1〜6
- [x] 7.1 (P) Vitest ユニットテスト（Server Action・スキーマ・メールテンプレ）
  - `submitJobInquiryAction`: 正常系（INSERT＋メール fire-and-forget が呼ばれる）／必須未入力（氏名・メール・項目）／メール形式不正／項目未選択／自分宛拒否／自社宛拒否（same_org）／退会済み宛拒否／admin ロール拒否／連投制限超過（直近1時間5件以上）／メール送信失敗時に本体は成功扱い、の各ケースを検証する
  - Supabase クライアントのモックは `{ data, error }` 形状を正確に再現し、admin client COUNT のモックを使って異常系も網羅する
  - `jobInquirySchema`: 各フィールドのバリデーションメッセージが日本語固定文言と一致することを検証する
  - `jobInquiryNotificationEmail`: subject に送信者氏名が含まれること、html に宛先発注者表示名・送信者メール・選択項目・受信箱 URL が全て含まれることをスナップショットで検証する
  - Task 2.4 access-guard: 4 つの拒否理由（deleted / self / same_org / admin）と正常系（ok: true）をそれぞれ検証する
  - _Requirements: 11.1_
- [x] 7.2 (P) pgTAP RLS テスト
  - SELECT: admin は全件可、宛先 client 本人は自分宛のみ可、宛先 client の同一組織メンバー（owner / admin / staff）は同組織宛のみ可、第三者（無関係な contractor / 別組織 client / 別組織 staff）は 0 件しか見えないことを検証する
  - 個人プラン client（`target_organization_id IS NULL`）でも宛先本人だけが SELECT 可能であることを検証する
  - INSERT: `sender_id = auth.uid()` の行のみ受け入れ、他人を sender_id にする INSERT を弾くことを検証する
  - UPDATE / DELETE: 一般ユーザーから実行しても **データが不変であること**を is_() で検証する（throws_ok ではキャッチできないサイレントブロック対策）
  - テスト専用 UUID を使い、seed.sql の UUID と重複させないこと
  - _Requirements: 11.2_
- [x] 7.3 (P) Playwright E2E テスト
  - 受注者ログイン → マイページ → 発注者一覧（CON-005）→ 発注者詳細（CON-006）→ ボタン押下 → フォーム入力 → 送信 → CON-006 に戻り「問い合わせを送信しました」トースト表示、の通し導線を検証する（`page.goto()` 直接遷移に頼らない）
  - 発注者ログイン → マイページ → 受信箱一覧（COM-014）→ 行クリック → 受信箱詳細（COM-015）→ 送信者情報・項目・内容と mailto リンクが表示される、を検証する
  - 法人プランの担当者（staff）ログインで同じ問い合わせが受信箱に見えることを検証する
  - 自社発注者の CON-006 では「求人へのお問い合わせ」ボタンが表示されないことを検証する
  - 連投制限到達時にエラートースト「送信回数の上限に達しました…」が表示されることを検証する
  - チェックボックス操作は `getByRole("checkbox", { name: ... })` を使用し、プリフィル項目は `await expect(input).toHaveValue(initialValue)` で初期値同期を待ってから `.clear()` を呼ぶ（CLAUDE.md E2E ルール）
  - seed.sql に受注者・発注者・法人 staff の動作確認に必要なテストユーザーが揃っているか確認し、不足分を追加する
  - _Requirements: 11.3, 11.4_

- [x] 8. 統合と最終デグレ確認
  - 全テスト（Vitest・pgTAP・Playwright）を再実行して緑であることを確認する
  - ローカルで `supabase start` + `supabase db reset` + `npm run dev` を起動し、受注者アカウントで CON-006 → フォーム送信 → 受信箱で内容確認 → mailto リンク動作までを目視で通す
  - Resend 未設定環境では `/tmp/bijiyu-dev-mail/` に通知メール HTML が出力されることを確認する（dev フォールバック動作）
  - マイページ「求人へのお問い合わせ」リンクが実在ルート `/mypage/job-inquiries` と一致し、ログイン後画面の戻る規約（下部 BackButton）と整合していることをクリックで確認する
  - _Requirements: 2.7, 5.7, 6.1, 9.2, 9.3, 10.4_

## 意図的に見送る要件（Deferred）

- **8.2（admin 統合管理画面）**: 本 spec のスコープから明示的に除外される要件。Task 1.1 でデータの器（テーブル＋ admin SELECT RLS）を用意するため、後日 admin spec で画面のみ追加すればよい状態にする。既存の support spec（COM-008 / COM-012）と同じ方針。
