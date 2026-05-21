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

## 進行状況（2026-05-21 完了）

- ✅ シナリオ A 完了（5 件のバグ発見、すべて修正済）
- ✅ シナリオ B 完了（2 件の UX バグ発見、すべて修正済）
- ✅ シナリオ C 完了（2 件の表示改善、すべて修正済）
- ✅ シナリオ D 完了（県跨ぎ案件作成 + 検索ヒット、新 UI で問題なし）
- ✅ シナリオ E 完了（上位包含検索: 東京都のみ）
- ✅ シナリオ F 完了（上位包含検索: 東京都+港区、同県別 muni 案件除外確認）
- ✅ シナリオ G 完了（CLI-005 受注者一覧 + CON-005 発注者一覧）
- ✅ シナリオ H 完了（無料受注者の応募ボタン活性化＝都道府県マッチ）
- ✅ シナリオ I 完了（案件エリア 10 件上限の保存時バリデーション）
- ✅ シナリオ J 完了（廃止市区町村の chip 保持表示）
- ✅ 旧 UX バグ #6 〜 #10 は新 UI で解消確認済
- ✅ Phase G 中に発見した新規バグ #11〜#15 は本セッションで全て修正済

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

#### #6 AreaListEditor の行レベルバリデーションエラーが画面に表示されない（**解消** — `master-area-multi-select` Phase G 2026-05-21 再確認）

- **場所**: `src/lib/validations/profile.ts`, `auth.ts`, `client-profile.ts`, `job.ts`
- **症状**: 「+ エリアを追加」で空行ができた状態で保存ボタンを押すと、Zod は `availableAreas.X.prefecture` の path にエラーを出すが、フォームの `FieldError` は `availableAreas` キーしか見ないため画面に表示されず「保存ボタンを押しても無反応、理由不明」状態に
- **原因**: 行レベルパスと配列レベルパスの不一致
- **修正**: 4 つのエリアスキーマを「prefecture を緩く受ける → array-level の `.refine()` で空行検出 → `.refine()` で `min(1)` 検証 → dedup transform」のチェーンに変更。エラーは配列レベルで `availableAreas` キーに出るので FieldError で表示される
- **回帰防止**: 既存 Vitest（600 件）PASS で確認
- **再発防止ルール**: CLAUDE.md「Zod の array スキーマで行レベル検証を行う場合、フォームに行レベルエラー表示の仕組みがなければ array-level の `.refine()` でまとめてエラー化する」追加

#### #7 バリデーションエラーが field 変更後も消えずに残り続ける（**解消** — `master-area-multi-select` Phase G 2026-05-21 再確認）

- **場所**: `src/app/(authenticated)/profile/edit/profile-edit-form.tsx` `handleAreaChange`
- **症状**: 1 度保存して「都道府県が選択されていない行があります」エラーが出た後、ユーザーが空行を埋めても**赤字メッセージが消えない**。次回保存ボタンを押すまで消去されない
- **原因**: `validationErrors` が「保存ボタン押下時のリセット」でしかクリアされない。field 変更時の auto-clear がない
- **修正**: `handleAreaChange` 内で当該フィールドのエラーキーを `setValidationErrors` から削除
- **影響範囲**: COM-002 のみ（他フォームは react-hook-form の標準挙動でカバー）
- **再発防止**: 同 form の他フィールド（skills, qualifications 等）でも同パターンが起きうる。Phase 9 後にまとめて汎用化検討

#### #8 「（市区町村未指定）」表示が UX ノイズ（**解消** — `master-area-multi-select` Phase G 2026-05-21 再確認）

- **場所**: `src/lib/utils/format-areas.ts`
- **症状**: 発注者詳細画面（CLI-020）で「東京都（市区町村未指定）、千葉県（市区町村未指定）、埼玉県（市区町村未指定）、大阪府（市区町村未指定）」のように繰り返し表示され、ユーザーから「情報不完全のように見えて邪魔」との指摘
- **原因**: 仕様策定時の文言が、データ意図（県全域）ではなくデータ状態（未指定）寄りだった
- **修正**: 「{県}（市区町村未指定）」→「{県}」のみ表示に変更（県名のみ＝県全域の意）
- **回帰防止**: Vitest test 14 件すべて期待値更新

#### #9 同県内の市区町村が分離表示で読みづらい（**解消** — `master-area-multi-select` Phase G 2026-05-21 再確認。CON-002 カード + CON-003 詳細で「東京都（世田谷区、港区、品川区）」のグループ表示確認）

- **場所**: `src/lib/utils/format-areas.ts`
- **症状**: 「東京都あきる野市、東京都江戸川区」のように同じ県名が繰り返される表示が冗長
- **原因**: 仕様策定時に「県全域なし + 複数市区町村」のグルーピングが未対応
- **修正**: 「{県}（{m1}、{m2}）」括弧グループ表示に統一。1 市区町村でも「{県}（{m1}）」で統一
- **回帰防止**: Vitest test 期待値更新

#### #10 CON-006 発注者詳細「エリア」フィールドが何を表すか不明瞭（**解消** — `master-area-multi-select` Phase G 2026-05-21 再確認。住所 + 募集エリアの 2 行構成で「エリア」行は完全削除）

- **場所**: `src/app/(authenticated)/clients/[id]/page.tsx`
- **症状**: 受注者から見た発注者詳細画面に「住所」「エリア」「募集エリア」の 3 つが並んでおり、「エリア」が何の県を指しているか分からない
- **原因**: 「エリア」フィールドは発注者 owner の `users.prefecture`（個人居住県）を表示していた。業務プロフィールに個人居住県を表示する必然性が薄く、プライバシー観点でも不適切
- **修正**: DetailRow ごと削除
- **影響範囲**: CLI-020 のみ。`users.prefecture` カラム自体は保持（個人住所として CLAUDE.md ルール通り据え置き）

---

### シナリオ G(再確認時 Phase G 派生): multi-select Phase C で混入した回帰 / UI 不整合 (🟡 重要・修正済 2026-05-21)

#### #11 areaRowsSchema 統合で旧 #6 が再発（**解消**）

- **場所**: `src/lib/validations/area.ts` `areaRowsSchema.superRefine`
- **症状**: 新 UI の COM-002 受注者プロフィール編集で、不完全行（県のみ・muni 未選択・全域未チェック）を作って「保存する」を押すと、警告も画面遷移も発生しない（旧 #6 と同症状）
- **原因**: `multi-select` Phase C で 4 つのエリアスキーマを共通 `areaRowsSchema` に統合した際、`superRefine` で `path: [i]`（行レベル）にエラーを出す形になっていた。各フォームの FieldError は `errors.<fieldName>.message` (配列ルート) を参照しているため、行レベルパスのエラーは画面に出ない → Phase 9 の #6 修正が実質巻き戻った
- **修正**: `superRefine` 内で `path: []`（配列ルート）にエラーを集約する形に変更。同種エラーの重複出力も flag で抑制
- **回帰防止**: `src/__tests__/validations/area.test.ts` に「エラーは path: [] に集約される」テストを 4 件追加
- **教訓**: schema 共通化を行う際は、各フォームの FieldError がどのパスを見るか（配列ルート vs 行レベル）を確認してから path を決める

#### #12 AreaList の文字サイズが DetailRow 他フィールドより大きい（**解消**）

- **場所**: `src/components/area/area-list.tsx`
- **症状**: COM-001 受注者プロフィール詳細の「対応可能エリア」値が、メールアドレス・会社名等の他フィールド (text-body-sm) より明らかに大きく表示される
- **原因**: AreaList が `<p className={className}>` で外部 className のみ依存。DetailRow 側は `value` が string 以外（ReactNode）の場合に `text-body-sm` をラップしないため、AreaList の `<p>` はブラウザ既定 font-size を継承
- **修正**: AreaList のデフォルト className を `text-body-sm` に変更。caller が override したい場合は twMerge で後勝ち
- **影響範囲**: AreaList 全使用箇所 9 箇所のうち className 未指定の 7 箇所が改善。明示指定済の 2 箇所は twMerge で従来通り
- **教訓**: 共通コンポーネントは「親の text 系クラスを継承する」前提にせず、自身でデフォルトを持つ方が安全（特に `<p>` のような block 要素）

#### #15 既存登録の deprecated muni allow-list が全 5 フォームから渡されていない（**解消** — 2026-05-21 Phase G 中に発見）

- **場所**: `area-row.tsx` / `area-list-editor.tsx` の `existingDeprecatedMunicipalitiesByPrefecture` prop を、登録系 5 フォーム (受注者プロフィール編集 / CLI-021 発注者情報編集 / AUTH-006 サインアップ / CLI-003 案件新規 / CLI-004 案件編集) のいずれもが渡していなかった
- **症状**: master の deprecated_at を設定しても、既存ユーザーが選択していた廃止 muni が「（廃止）」suffix 付きで表示されない。シナリオ J 検証で発見
- **原因**: master-area-multi-select Phase C で AreaRow/AreaListEditor に prop は定義 (`?:` optional) したが、5 フォームの page.tsx で実際に値を渡すコードを書き忘れた
- **修正**:
  - `src/lib/master/fetch.ts` に `buildExistingDeprecatedMunicipalitiesByPrefecture(existingPairs)` を追加（正規化後 muni 配列を受け取り、master の deprecated と intersection を返す）
  - 既存データのある 3 フォーム (CLI-021 / 受注者プロフィール / CLI-004) の page.tsx で正規化後 AreaRow を flatMap → helper 呼出 → form に prop 注入
  - 既存データのない 2 フォーム (AUTH-006 / CLI-003) は default 空でそのまま
  - CLI-021 / 受注者プロフィール / CLI-004 のフォーム props 型に optional 追加 + AreaListEditor へ forward
- **回帰防止**: 既存テスト (Vitest 642 件) が全 PASS。Playwright master-area シナリオで担保 (Phase F まで網羅済)
- **教訓**: prop を定義しても caller を全件更新しないと「サイレントに無効化」される。Phase 完了時に「新規 props は全 caller で渡しているか」grep 確認を組み込むこと

#### #14 案件詳細の報酬表示が下限のみで上限を無視（**解消** — 2026-05-21 Phase G 中に発見）

- **場所**: `src/app/(authenticated)/jobs/[id]/page.tsx` の「報酬」DetailRow 2 箇所 (line 268 / 533)
- **症状**: カード（CON-002 募集案件一覧）では「26,000円〜32,000円（人工）」と範囲表示されるのに、詳細（CON-003）では「26,000円（人工）」と下限のみで上限が表示されない
- **原因**: 詳細ページのその場書きが `${(job.reward_lower ?? 0).toLocaleString()}円（人工）` で上限を完全に無視。カードは `formatReward(lower, upper)` で 4 分岐していたのに、詳細との共通化が無く乖離
- **修正**: `src/lib/utils/format-reward.ts` に `formatRewardRange(lower, upper, opts)` を共通ヘルパーとして切り出し、詳細ページ 2 箇所を置換
- **回帰防止**: `src/__tests__/utils/format-reward.test.ts` で 4 分岐 + undefined/null 等の 7 件カバー
- **スコープ外**: 同様の場渡し実装が `manage/job-list-client.tsx` / `scout-info-card.tsx` 等に残るが、症状（不一致表示）が出ていない箇所はこの修正の影響なしで継続

#### #13 client-profile.spec.ts CLI-021 setup E2E の fragility（**解消**）

- **場所**: `e2e/client-profile.spec.ts:109`「法人プラン Owner が setup モードで社名必須バリデーション」
- **症状**: `master-area-multi-select` Phase G の自動テスト最終確認 (`npm run test:e2e`) で fail
- **原因**: `.fill("")` 実行時、react-hook-form の defaultValue がまだ DOM に同期されておらず入力欄が空。Playwright は「空欄→空欄＝差分なし」と判定してイベント発火を skip → 直後に React が `defaultValue` を入力欄へ書き戻し → 送信成功
- **修正**: `await expect(input).toHaveValue("鈴木工務店株式会社")` で初期値同期を待ってから `.clear()` でクリア
- **教訓**: react-hook-form 系の入力欄で `.fill("")` する E2E は、defaultValue の DOM 同期を `toHaveValue` で待つ。`.clear()` の方が同期忘れに強い

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
