# master-area 手動テストレポート

実施日: 2026-05-20（進行中）
実施者: nozomi（with Claude Opus 4.7）
所要: 約 X 時間（最終確定前）

## 目的

master-area 仕様の自動テスト全 PASS（Vitest 600 / pgTAP 178 / E2E 198）状態から、**E2E では取りこぼしうる観点**を手動で網羅検証する。

E2E が苦手な領域:

- **視覚的な崩れ**（エリア表記の折り返し、グルーピング表示）
- **多段プルダウンの体感**（都道府県切り替え時の市区町村候補更新速度）
- **検索フローの一貫性**（フィルタ popup → 結果反映 → ナビゲーション）
- **UX 誤解**（ボタンラベルの曖昧さ、エラー表示の不可視）
- **複数画面間の整合**（発注者本人の表示 vs 受注者から見た表示）

## 構成

| # | フェーズ | 主対象画面 |
|---|---|---|
| 0 | 環境準備 | — |
| 1 | 受注者新規登録 | AUTH-001 / AUTH-006 / COM-001 |
| 2 | 受注者プロフィール編集（soft cap）| COM-002 / COM-001 |
| 3 | 発注者の募集エリア編集 | CLI-021 / CLI-020 / CON-006 |
| 4 | 県跨ぎ案件 | CLI-003/004 / CON-002 |
| 5〜10 | 検索・マッチング・上限・廃止 muni | CON-002 / CON-005 / CLI-005 / CON-003 / Supabase Studio |

## 進行状況（2026-05-20 時点）

- ✅ シナリオ A 完了（5 件のバグ発見、すべて修正済）
- ✅ シナリオ B 完了（2 件の UX バグ発見、すべて修正済）
- ✅ シナリオ C 完了（2 件の表示改善、すべて修正済）
- ⏸ シナリオ D 着手前で中断（マルチ選択 UX 実装を先に行うため、別セッションへ）
- ⏸ シナリオ E〜J 未着手

## 発見事項

---

### シナリオ A: 認証フロー関連（🔴 重大・修正済）

引き継ぎ書（`manual-test-handoff.md`）の手順「`/register` で新規登録 → メールリンク → `/register/profile` 到達」が成立せず、根本まで掘ったところ **5 つの認証バグが連鎖**していたことが判明。**全て本番にも影響しうる**ものを Phase 9 で未然に発見できた。

#### #1 `enable_confirmations = false` で確認メールが送られない

- **場所**: `supabase/config.toml` line 211
- **症状**: `/register` でメール送信完了表示は出るが、Mailpit にメールが届かない
- **原因**: Supabase CLI のデフォルトのまま `enable_confirmations = false` だった。`/register` の実装は確認メール経由を前提にしているのに、設定が無効化されていた
- **修正**: `enable_confirmations = true` に変更
- **影響範囲**: ローカル開発環境のみ（本番 Supabase は別管理）
- **回帰防止**: AUTH-001 全通し E2E テスト（後続セッションで追加）でメール送信確認まで含める
- **再発防止ルール**: なし（環境固有）

#### #2 `register/actions.ts` が存在しない環境変数 `NEXT_PUBLIC_SITE_URL` を参照

- **場所**: `src/app/(auth)/register/actions.ts` line 21（修正前）
- **症状**: 確認メールの redirect URL がフォールバック値 `http://localhost:3000/auth/callback` になり、ブラウザのクッキードメインとずれて exchange 失敗
- **原因**: 他の Server Action は全て `NEXT_PUBLIC_APP_URL` を使っているのに、register/actions.ts だけ `NEXT_PUBLIC_SITE_URL` というタイポ的な名前を参照。`.env.local` にも `.env.local.example` にも存在しない変数名なので、常に undefined だった
- **修正**: `headers().get('host')` でリクエスト元ホストを動的に取得する方式に変更（CLAUDE.md「ローカル開発環境: localhost と 127.0.0.1 を混在させない」ルールにも準拠）
- **影響範囲**: **本番でも発生していたはず**。`/register` から新規登録するユーザーが 100% 失敗していた可能性
- **回帰防止**: AUTH-001 全通し E2E
- **再発防止ルール**: CLAUDE.md「環境変数の参照名は `.env.local.example` と一致を確認」追加

#### #3 localhost と 127.0.0.1 のクッキードメインずれ

- **場所**: `src/app/(auth)/register/actions.ts`
- **症状**: ユーザーが `localhost:3000` でアクセスしていても、メールの redirect が `127.0.0.1:3000` になり、PKCE の code_verifier クッキーが読めず exchange 失敗
- **原因**: バグ #2 と同根。`siteUrl` を環境変数固定にすると、ユーザーのブラウザのホストと不一致になる
- **修正**: `headers().get('host')` でユーザーのアクセス元ホストを動的に追従
- **影響範囲**: 主にローカル開発環境
- **再発防止ルール**: CLAUDE.md 既存ルール「ローカル開発環境: localhost と 127.0.0.1 を混在させない」を補強

#### #4 middleware が「signup 完了済み」と誤判定して `/mypage` に蹴る

- **場所**: `src/middleware.ts` line 278-291
- **症状**: メール確認後、`/auth/callback` → `/register/profile` への redirect は出るが、middleware が `/register/profile` を auth page 扱いで `/mypage` にリダイレクトしてしまい、プロフィール入力画面に辿り着けない
- **原因**: `handle_new_user` トリガーが auth.users INSERT 時点で public.users 行を作成するため、middleware の「`userData が NULL なら新規ユーザー`」前提が常に偽になる。`last_name = NULL` の不完全ユーザーを完了済み扱いにしていた
- **修正**: middleware で SELECT に `last_name` を追加し、`last_name IS NULL` を未完了扱いとして `/register/*` 許可
- **影響範囲**: **本番でも発生していたはず**。新規登録者がプロフィール入力をスキップして `/mypage` に着地していた
- **回帰防止**: AUTH-001 全通し E2E
- **再発防止ルール**: CLAUDE.md「middleware の `userData` 判定では `handle_new_user` トリガーで作られる行を考慮し、`last_name` 等で実質完了を判定する」追加

#### #5 PKCE の code_verifier クッキーが Server Action からブラウザに伝播しない

- **場所**: `src/app/(auth)/register/actions.ts`（Supabase ssr の PKCE モード）
- **症状**: signupAction の中で `cookieStore.set()` が呼ばれ、サーバー側のクッキーストアには `sb-127-auth-token-code-verifier` が入っているのに、26 秒後にユーザーがメールリンクを踏んで `/auth/callback` に来た時には**クッキーが空**で送信される
- **原因**: Next.js 16 Turbopack + `@supabase/ssr` v0.9 + `useActionState`/`formAction` outside transition の組み合わせで、Server Action の Set-Cookie がブラウザに反映されない。`startTransition` ラップでも解消せず
- **修正**:
  - register/page.tsx で `formAction` を `startTransition` でラップ（ベストプラクティス遵守）
  - signupAction を `@supabase/supabase-js` の `createClient` で `flowType: 'implicit'` 強制
  - 新規ページ `src/app/(auth)/register/verify/page.tsx` を作成し、URL fragment（`#access_token=...&refresh_token=...`）から client 側で `setSession()` する
  - 招待フロー（`/accept-invite/confirm`）と同じ implicit flow + フラグメントトークンパターンに揃えた
- **影響範囲**: **本番でも発生しうる**。Turbopack 固有なら production build では起きない可能性もあるが不確実
- **回帰防止**: AUTH-001 全通し E2E
- **再発防止ルール**: CLAUDE.md「AUTH-001 のメール確認フローは PKCE ではなく implicit flow を使う（Server Action からの PKCE クッキー伝播が不安定）」追加

---

### シナリオ B〜C: master-area UX 関連（🟡 重要・修正済）

#### #6 AreaListEditor の行レベルバリデーションエラーが画面に表示されない

- **場所**: `src/lib/validations/profile.ts`, `auth.ts`, `client-profile.ts`, `job.ts`
- **症状**: 「+ エリアを追加」で空行ができた状態で保存ボタンを押すと、Zod は `availableAreas.X.prefecture` の path にエラーを出すが、フォームの `FieldError` は `availableAreas` キーしか見ないため画面に表示されず「保存ボタンを押しても無反応、理由不明」状態に
- **原因**: 行レベルパスと配列レベルパスの不一致
- **修正**: 4 つのエリアスキーマを「prefecture を緩く受ける → array-level の `.refine()` で空行検出 → `.refine()` で `min(1)` 検証 → dedup transform」のチェーンに変更。エラーは配列レベルで `availableAreas` キーに出るので FieldError で表示される
- **回帰防止**: 既存 Vitest（600 件）PASS で確認
- **再発防止ルール**: CLAUDE.md「Zod の array スキーマで行レベル検証を行う場合、フォームに行レベルエラー表示の仕組みがなければ array-level の `.refine()` でまとめてエラー化する」追加

#### #7 バリデーションエラーが field 変更後も消えずに残り続ける

- **場所**: `src/app/(authenticated)/profile/edit/profile-edit-form.tsx` `handleAreaChange`
- **症状**: 1 度保存して「都道府県が選択されていない行があります」エラーが出た後、ユーザーが空行を埋めても**赤字メッセージが消えない**。次回保存ボタンを押すまで消去されない
- **原因**: `validationErrors` が「保存ボタン押下時のリセット」でしかクリアされない。field 変更時の auto-clear がない
- **修正**: `handleAreaChange` 内で当該フィールドのエラーキーを `setValidationErrors` から削除
- **影響範囲**: COM-002 のみ（他フォームは react-hook-form の標準挙動でカバー）
- **再発防止**: 同 form の他フィールド（skills, qualifications 等）でも同パターンが起きうる。Phase 9 後にまとめて汎用化検討

#### #8 「（市区町村未指定）」表示が UX ノイズ

- **場所**: `src/lib/utils/format-areas.ts`
- **症状**: 発注者詳細画面（CLI-020）で「東京都（市区町村未指定）、千葉県（市区町村未指定）、埼玉県（市区町村未指定）、大阪府（市区町村未指定）」のように繰り返し表示され、ユーザーから「情報不完全のように見えて邪魔」との指摘
- **原因**: 仕様策定時の文言が、データ意図（県全域）ではなくデータ状態（未指定）寄りだった
- **修正**: 「{県}（市区町村未指定）」→「{県}」のみ表示に変更（県名のみ＝県全域の意）
- **回帰防止**: Vitest test 14 件すべて期待値更新

#### #9 同県内の市区町村が分離表示で読みづらい

- **場所**: `src/lib/utils/format-areas.ts`
- **症状**: 「東京都あきる野市、東京都江戸川区」のように同じ県名が繰り返される表示が冗長
- **原因**: 仕様策定時に「県全域なし + 複数市区町村」のグルーピングが未対応
- **修正**: 「{県}（{m1}、{m2}）」括弧グループ表示に統一。1 市区町村でも「{県}（{m1}）」で統一
- **回帰防止**: Vitest test 期待値更新

#### #10 CLI-020「エリア」フィールドが何を表すか不明瞭

- **場所**: `src/app/(authenticated)/clients/[id]/page.tsx`
- **症状**: 受注者から見た発注者詳細画面に「住所」「エリア」「募集エリア」の 3 つが並んでおり、「エリア」が何の県を指しているか分からない
- **原因**: 「エリア」フィールドは発注者 owner の `users.prefecture`（個人居住県）を表示していた。業務プロフィールに個人居住県を表示する必然性が薄く、プライバシー観点でも不適切
- **修正**: DetailRow ごと削除
- **影響範囲**: CLI-020 のみ。`users.prefecture` カラム自体は保持（個人住所として CLAUDE.md ルール通り据え置き）

---

## 修正サマリ（コミット予定）

| Commit | 内容 |
|---|---|
| `fix(auth): AUTH-001 サインアップフロー 5 件のバグ修正` | バグ #1〜#5 + `/auth/callback` の debug ログ削除 + register/verify 新規 + middleware 修正 + page.tsx startTransition |
| `feat(master-area): エリア表示・バリデーション UX 改善` | バグ #6〜#10 + 関連テスト期待値更新 |

## 残タスク（新セッションへ引き継ぎ）

1. **マルチ選択 UX 実装**（新 spec: `master-area-multi-select`）
   - Pattern A 省略版（タウンワーク等の業界標準を踏襲）
   - 「県全域」と「市区町村複数」は **排他**
   - 既存データ移行時は「県全域」を優先（具体的市区町村を捨てる）
   - 影響範囲: AreaPicker / AreaListEditor / Zod スキーマ 4 本 / 5 フォーム / 既存 Vitest テスト期待値 / E2E テスト
2. **Phase 9 シナリオ D〜J 実施**（新マルチ選択 UX で）
3. **AUTH-001 全通し E2E テスト追加**（バグ #1〜#5 の再発防止）
4. **既存 3 種全自動テスト PASS 確認**
5. **`tasks.md` §9 を `[x]` に**
6. **本レポートに最終結果記入 + `project_master_area_progress.md` 更新**

## 関連ドキュメント

| ドキュメント | 用途 |
|---|---|
| `.kiro/specs/master-area/manual-test-handoff.md` | Phase 9 開始時の手順書 |
| `.kiro/specs/master-area/tasks.md` §9 | 公式タスク定義 |
| `CLAUDE.md` 「対応エリア・募集エリアの設計」「ローカル開発環境」 | 関連ルール |
| `project_master_area_progress.md`（メモリ）| セッション横断の進捗ログ |
