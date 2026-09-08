# ステージング確認シート 指摘事項 調査結果（2026-09-07）

- 依頼書: `docs/requirements/staging-check-investigation-202609.md`
- 調査方法: コード読解（ブランチ `feature/spec-changes-202608`、staging と同一の改修内容）。**ステージングDBの実データは本セッションから読めなかった**（後述「DB実データの確認手順」）。DB依存の判定は「コード上の結論」と「Studio SQL Editor で確認する手順」の2本立てで記載。
- 判定記号: (A) 仕様通り・勘違い / (B) 不具合 / (C) 仕様だが改善余地あり

## 判定サマリー

| # | 指摘 | 判定 | 概要 |
|---|---|---|---|
| 修正-1 | スマホで入力欄が拡大したまま | **(B)** | 入力欄3ファイル（5箇所）が16px未満。iOS Safari の自動ズーム。CSS 修正のみ |
| 修正-2 | 検索条件を開くとキーワード欄に自動フォーカス | **(B)** | Radix Sheet のデフォルト自動フォーカス。共通部品1行の修正で3画面に効く |
| 修正-3 | ♡解除がマイリストに即反映されない | **(B)** | マイリスト画面（CON-007）でカードを取り除く処理が無い。DB は正しく更新済み |
| 確認-1 | プランの価格が違う | **(A)**（+C） | 定数・/billing・/billing/plans・Stripe 設定は全て一致。年払いは「月額×12 の暫定値」。比較表の文言に要修正候補 2 点 |
| 確認-2 | 求人を削除できず退会もできない | **(A)+(B)** | 削除機能は仕様上存在しない（掲載終了のみ）。ただし「発注済み（accepted）が評価期間切れで残る」と本人も運営も解除できない**デッドロックが実在** |
| 確認-3 | 本人確認の画像が反映されない | **(B)**+(C) | プロフィール写真の WebP がサーバー検証で弾かれ反映されない確定バグ。本人確認書類側は「申請後に本人は画像を見ない」仕様＋署名URL失敗時のリトライ無し |
| 確認-4 | 発注されたのに「結果待ち」 | (A) 濃厚 | `accepted` が「結果待ち」と出る経路は無い。発注側の「送信する」が未完了（勤務地・初回稼働日未入力で押せない）か別応募の可能性。DB で確定 |
| 確認-5 | スカウトの受諾ボタンが出ない | **(B)** の経路あり+(C) | 法人プランの会員が職人としてスカウトを受けるとボタンが出ず応答も拒否される。送信者側には「返答待ち」表示が無い |
| 確認-6〜15 | 管理画面のブラウザ戻る | **(B)** 4 件 / (C) 4 件 / 未特定 2 件 | No.35・37(38)・40・41 は実装起因で確定。42/43・36 は画面内状態の SPA 標準挙動。34・39 は要実機確認 |
| 確認-16 | 組織あてスレッドの見え方 | (A) | 同組織メンバー全員に表示される。例外は昇格前の個人スレッドと兼任スタッフの組織切替のみ |

---

## 第1部: 要修正

### 【修正-1】スマホ入力時に画面が拡大したまま戻らない — 判定 (B)

**原因**: iOS Safari は、フォーカスした入力欄の文字サイズが 16px 未満だと画面を自動で拡大する。フォーカスを外しても拡大は戻らない。shadcn の `Input` / `Textarea` 共通部品は `text-base md:text-sm`（スマホ 16px）で安全だが、共通部品を使わず独自にサイズ指定している入力欄が 3 ファイルにある。

| ファイル:行 | 要素 | 実効サイズ（スマホ） | 使われる画面 |
|---|---|---|---|
| `src/components/messaging/message-input.tsx:188` | メッセージ本文 `<textarea>`（`text-sm`） | 14px | CON-009 / CLI-013 メッセージスレッド（指摘 No.1・F5-2 の画面） |
| `src/app/(authenticated)/messages/templates/scout-template-form.tsx:86,107,128` | タイトル `<input>` / 本文 / メモ `<textarea>`（`text-body-md`） | 13px | CLI-019 スカウトテンプレート（指摘 No.24 の画面） |
| `src/components/master/master-combobox.tsx:199` | 職種・資格・スキル検索の入力（`text-body-sm`） | 12px | COM-002 / AUTH-006 / CLI-021 / CLI-003・004 / CON-002 / CON-005 / CLI-005 の計 7 画面 |

- `SelectTrigger`（14px）は `<button>` 要素なので iOS の自動ズーム対象外。
- `src/app/layout.tsx` に viewport の `maximum-scale` 等は無い（意図通り。ズーム禁止はアクセシビリティ上避ける）。
- `globals.css` の `--text-body-sm: 12px / --text-body-md: 13px` はプロジェクト独自トークン。

**修正方針**: 上記 5 箇所に `text-base md:<現行サイズ>` を付け、スマホでのみ 16px にする（PC の見た目は不変）。工数 0.5 日（修正 + 実機確認）。再発防止として、design-rule.md に「入力欄に `text-body-*` / `text-xs` / `text-sm` を単独で当てない」を追記推奨。

### 【修正-2】案件検索を開くとキーワード欄に自動フォーカス — 判定 (B)

**原因**: コード内に `autoFocus` / `.focus()` は 0 件。検索条件パネルは共通部品 `SearchFilterSheet`（`src/components/job-search/search-filter-sheet.tsx:82`）が Radix Dialog ベースの `Sheet` で実装されており、**Radix Dialog は開いた瞬間にパネル内の最初のフォーカス可能要素へ自動フォーカスする**（デフォルト挙動）。3 画面ともキーワード `<Input>` がパネル先頭にあるため、そこにフォーカスが当たりキーボードが立ち上がる（修正-1 のズームも誘発）。

| 画面 | キーワード欄 |
|---|---|
| CON-002 募集案件一覧 | `src/app/(authenticated)/jobs/search/job-search-filter.tsx:92` |
| CON-005 発注者一覧 | `src/app/(authenticated)/clients/client-search-form.tsx:99` |
| CLI-005 職人一覧 | `src/app/(authenticated)/users/contractors/contractor-search-filter.tsx:99` |

応募履歴等の絞り込み（`status-filter.tsx`）は Sheet も Input も使っておらず対象外。

**修正方針**: `search-filter-sheet.tsx` の `<SheetContent>` に `onOpenAutoFocus={(e) => e.preventDefault()}` を 1 行追加（3 画面に一括で効く）。工数 0.25 日。キーボード操作でパネルを開いた場合のフォーカス位置が「パネル自体」になるだけで、アクセシビリティ上の問題は無い。

### 【修正-3】お気に入り(♡)の解除がマイリストに即反映されない — 判定 (B)

**事象の整理**: クライアントの記載は「マイリスト（CON-007 `/favorites`）でハートを外してもカードがその場で消えない。マイページ経由で開き直すと消えている」。DB 側の削除は正常で、画面側の反映だけが欠けている。

**原因**（`src/components/job-search/favorite-button.tsx:39-58`）: ハートボタンは自分自身の見た目（ハート色／「マイリスト登録」ラベル）を `useState` で切り替えるだけで、Server Action 成功後に `router.refresh()` も、親一覧へ「このカードを消して」と伝える仕組みも無い。マイリスト画面（`src/app/(authenticated)/favorites/page.tsx:263-284, 407-412, 575-580`）は Server Component で、カードに `isFavorited={true}` を固定で渡しているため、解除後も「ハートが空のカード」が残り続ける。

- `toggleFavoriteAction`（`src/app/(authenticated)/jobs/search-actions.ts:414-529`）に `revalidatePath` は無いが、`/favorites` は動的ページで Router Cache も既定（staleTime 0）のため、**別ページ経由で開き直せば正しく消える**。これが「マイページまで戻れば反映される」の正体。
- 他の一覧（CON-002 / CON-005 / CLI-005 / 詳細画面）は「お気に入り一覧」ではないので、解除してもカードが残るのは正常。影響はマイリスト画面のみ。
- E2E（`e2e/job-search.spec.ts:197-`）は「登録 → `/favorites` を開く」の片道のみで、解除の即時反映は未検証だった。

**修正方針**（推奨: 案 1）
1. `FavoriteButton` に `refreshOnUnfavorite?: boolean` を追加し、解除成功時に `router.refresh()`。マイリスト画面の 3 箇所でのみ有効化。工数 0.5 日（E2E 1 件追加込み）。
2. 代替: マイリスト一覧をクライアント部品化して `useState` でカード配列を持ち、解除時に配列から除去（ページ再取得なし・体感が最速）。工数 1 日。
3. 併せて `toggleFavoriteAction` に `revalidatePath("/favorites")` を追加（将来キャッシュを強化した際の保険）。

---

## 第2部: 要確認

### 【確認-1】プランの価格が画面表示と異なる？ — 判定 (A)（比較表の文言は (C)）

**結論**: コード定数・/billing（CLI-026）・/billing/plans（CLI-026B）・Stripe 設定スクリプト・`.env.local.example` の金額は**全て一致**しており、画面間の不一致は無い。クライアントが「違う」と感じたのは、①メールで送られた「最終プラン」と現行定数の差（人間側で突合）、②年払い額が暫定値（月額×12）であること、のいずれかと推定。

**現行の価格一覧（税込）**

| 区分 | 内部キー | 月額 | 年払い（暫定＝月額×12） | 定義箇所 |
|---|---|---|---|---|
| 無料プラン | free | 0 | — | `src/lib/constants/plans.ts` |
| ライト | individual | 3,800 | 45,600 | 同上 |
| スタンダード | small | 14,800 | 177,600 | 同上 |
| プレミアム | corporate | 48,000 | 576,000 | 同上 |
| ハイエンド | corporate_premium | 148,000 | 1,776,000 | 同上 |
| 初回事務手数料 | — | 20,000（初回のみ） | — | `plans.ts:100` |

| オプション | 内部キー | 価格 | 課金形態 | 表示 |
|---|---|---|---|---|
| 自己PR動画掲載（受注者PR動画） | video | 100,000 | 買い切り | 表示 |
| 職場紹介動画 | video_workplace | 100,000 | 買い切り | 表示（プレミアム・ハイエンドの無料特典は運用対応、画面は一律表示＝仕様通り） |
| ユーザー撮影プラン | video_shooting | 20,000 | 買い切り | 表示 |
| 急募 | urgent | 20,000 | 買い切り | 表示 |
| 補償（最大200万円） | compensation_5000 | 5,000/月 | サブスク | **非表示**（`NEXT_PUBLIC_COMPENSATION_OPTION_ENABLED` 未設定＝販売停止） |
| 補償（上位） | compensation_9800 | 9,800/月 | サブスク | 同上 |

**留意点**
- 年払い額は `plans.ts:103-111` の `YEARLY_PRICE_TAX_INCLUDED` に「クライアント未確定・暫定」と明記。正式額が決まったら定数と Stripe 年額 Price（`scripts/stripe/setup-yearly-prices.mjs` の `YEARLY_AMOUNTS`）を同時更新。
- /billing/plans（`src/app/(authenticated)/billing/plans/page.tsx:13-19`）と /billing のオプション行（`BillingClient.tsx:515-949`）は金額を文字列でベタ書きしており定数と自動同期しない。今は一致しているが改定時の事故要因。
- **(C) 比較表の文言の要修正候補**（`billing/plans/page.tsx`）: ①45行「現場掲載 1件/月」→ 実装は「同時掲載 1 件」（月次リセットではない。`jobs/actions.ts:214-225`）。②61行「代理メッセージ 36通/年・300通/年」→ コード上に対応する上限・カウンタが存在しない（案内文のみ）。③比較表に年払い額の行が無い。
- 「銀行振込で申し込む」ボタンは `NEXT_PUBLIC_BANK_TRANSFER_SELF_SERVICE_ENABLED` 未設定のため非表示で、「お問い合わせください」案内のみ（P9 の仕様通り）。

**クライアント向け説明文（下書き）**
> 現在ステージングに表示している金額は、8 月にご確認いただいた「プラン名は変更・金額は据え置き」の内容で設定しています（ライト 3,800 円、スタンダード 14,800 円、プレミアム 48,000 円、ハイエンド 148,000 円、いずれも税込・月額）。年払いの金額は正式な額をまだいただいていないため、仮に「月額×12 か月」で表示しています。メールでお送りいただいた最終プランの金額と照らし合わせ、変更が必要な箇所を教えていただければ反映します。

### 【確認-2】求人を削除できず、退会もできない — 判定 (A)+(B)

**(A) 求人の「削除」機能は存在しない（仕様通り）**
- 案件の状態遷移は `draft → open → closed` の一方向のみ（`src/lib/validations/job.ts:224-228`）。`jobs` テーブルを DELETE する処理はコード全体に無い。
- CLI-002（案件管理）に出るのは募集中案件の「掲載を終了する」ボタンだけ（`src/app/(authenticated)/jobs/[id]/page.tsx:257-259`）。下書き・掲載終了済みの案件には操作ボタンが無い。
- 掲載終了（`closeJobAction`、`jobs/actions.ts:553-605`）は発注済みの応募があっても実行できる（警告表示のみ）。**掲載終了しても、その案件の応募状態（applied / accepted）は自動では変わらない**。

**退会ブロックの判定条件**（`src/lib/withdrawal/execute.ts:64-120`。本人退会と管理画面の強制退会が同じ関数を共有）

| ガード | 条件 | 表示メッセージ | `jobs.status` を見るか |
|---|---|---|---|
| 1 | 自分が応募者で `applications.status IN ('applied','accepted')` | 「応募中または進行中の案件があるため退会できません。応募の取り下げまたは完了後に再度お試しください。」 | 見ない |
| 1.5 | 組織メンバーで Owner 以外 | 「…管理責任者のみ退会手続きが可能です」 | — |
| 2 | 自分（法人 Owner は組織全体）の案件に `status = 'accepted'` の応募がある | 「受注者が作業中の案件があるため退会できません。案件の完了後に再度お試しください。」 | **見ない** |

つまり「求人を掲載終了にしても退会できない」は、**発注済み（accepted）の応募が残っている**場合に成立する。案件が open でも応募が無ければ退会はブロックされない。

**(B) デッドロックの存在** — accepted を解消する経路は 3 つだけで、いずれも期限付き:

| 経路 | 条件 | 期限切れ後 |
|---|---|---|
| 発注者・受注者の完了報告（双方の評価提出で completed / lost） | 初回稼働日 〜 稼働終了日 + 5 日（`src/lib/matching.ts:137-163`、`applications/actions.ts:895-902`） | 「入力期間を過ぎたため入力できません」 |
| 受注者のキャンセル（`cancelApplicationAction`） | 初回稼働日の 5 日前まで（`matching.ts:187-194`） | 不可 |
| 運営の発注取消（ADM-014 `canAdminCancel`） | 初回稼働日の前日まで（`src/lib/admin/application-status.ts:127-135`） | ボタン非表示・不可 |

→ 「稼働終了日 + 5 日」を過ぎた accepted 応募は、**本人も相手も運営も画面から解消できず、退会が永久にブロックされる**。仕様書（`.kiro/specs/matching/requirements.md:373-381`）にも救済策の記載が無い設計漏れ。今回のテストでは「発注 → 稼働日を過去日で設定」等で容易に到達しうる。

**付随して見つかった仕様ギャップ**
- ガード 1 のメッセージは「応募の取り下げ」を案内し、FAQ（`src/app/(support)/faq/content.ts:71`）も「マッチング成立前の応募取り下げは可能」と書いているが、**受注者が結果待ち（applied）の応募を取り下げる機能はコードに無い**（`cancelApplicationAction` は accepted 限定。`applications/actions.ts:100-103`）。結果待ちを解消できるのは発注者の「お断りする」だけで、発注者が放置すると受注者側は退会できない。
- 発注者から発注済み応募をキャンセルする機能も無い。
- エラーメッセージは対象案件名・応募者名・リンクを示さず、期限切れ時の窓口（お問い合わせ）にも触れていない。

**修正方針（案）**
1. 【小】退会エラーに対象案件名と「稼働終了日から 5 日を過ぎた場合はお問い合わせへ」の導線を追加。工数 0.5 日。
2. 【中】運営側に、稼働開始後・期限切れの accepted 応募を「完了扱い（completed）」または「取消」にできる ADM-014 の操作を追加（監査ログ付き）。工数 1〜1.5 日。デッドロックの根治策。
3. 【中】受注者が結果待ち（applied）の応募を取り下げられる機能（FAQ との整合）。工数 1 日（メール通知含む）。
4. 「案件の削除」は作らない（掲載終了で一覧から消える設計を説明で返す）。

**DB 実データで確認すること**（Q1〜Q3）: クライアントのアカウントに accepted 応募が残っているか、その `first_work_date` / 案件の `work_end_date` が期限切れか。

**クライアント向け説明文（下書き）**
> 掲載した現場は「削除」ではなく「掲載を終了する」ボタンで募集を止める仕組みです（応募者とのやり取りの記録を残すため、データ自体は消しません）。掲載を終了すると一覧から消えます。
> 退会については、「発注済み」の職人さんがいる現場が残っていると、トラブル防止のため退会できないようにしています。稼働が終わったら「完了報告」を入れていただくと退会できるようになります。ただ、今回のテストのように稼働終了日から日にちが経ってしまった案件は、画面から完了報告ができず退会もできない状態になることが分かりました。これはこちらの不備ですので、運営側で解消できるよう修正します。
### 【確認-3】本人確認の画像が反映されないときがある — 判定 (B)（プロフィール写真の WebP 不整合）+ (C)

起票の画面 ID（A4-3 メールアドレス変更）と内容が食い違うため、(a) 本人確認書類 と (b) プロフィール写真 の両方を調査した。

**(b) プロフィール写真（アバター）に確定バグ — 判定 (B)**
- 画面（`src/app/(authenticated)/profile/edit/profile-edit-form.tsx:484-489`）は「JPEG・PNG・WebP形式（5MB以下）」と案内し、直接アップロードのルール `IMAGE_UPLOAD_RULE_5MB`（`src/lib/storage/direct-upload.ts:29-40`）も `avatars` バケット（migration `20260712100000_avatars_allow_webp.sql`）も WebP を許可している。
- ところが、アップロード後にパスを DB へ保存する `uploadAvatarAction`（`src/app/(authenticated)/profile/edit/actions.ts:279`）が使う `AVATAR_PATH_EXTENSIONS`（`src/lib/validations/profile.ts:28`）は `["jpg","jpeg","png"]` で **WebP を含まない**。同じファイルの書類用 `DOCUMENT_PATH_EXTENSIONS`（21-27 行）は WebP 対応済みで、アバター側だけ更新漏れ。
- 結果: WebP を選ぶと Storage への保存は成功するのに `users.avatar_url` が更新されず、画面のエラーは「ファイルを選択してください」。JPEG/PNG では起きない。iPhone の HEIC は JPEG に変換される（`src/lib/storage/image-convert.ts:64`）ため、Android 端末やスクリーンショット・画像編集アプリ由来の WebP を使ったときだけ再現する＝「ときがある」に合致。
- **修正**: `AVATAR_PATH_EXTENSIONS` に `"webp"` を追加（1 行）。併せて `ALLOWED_AVATAR_MIME_TYPES` / `ALLOWED_AVATAR_EXTENSIONS`（同ファイル 15,18 行）も揃える。工数 0.25 日（vitest 更新込み）。

**(a) 本人確認書類 — 構造的なバグは見つからず、間欠要因は 1 点 — 判定 (C)**
- 申請画面（COM-004 `src/app/(authenticated)/profile/verification/identity/page.tsx`）は送信前に `URL.createObjectURL` でプレビューを出し、送信後は `/profile/verification` に「申請中」等のバッジを表示するだけで、**申請後に本人が書類画像を見る画面は存在しない**（仕様）。「申請したのに画像が出ない」と感じたならこの仕様。
- 拡張子・MIME・バケット設定・Storage RLS（`20260325180000_008_storage_buckets.sql` の `identity_docs_owner_read/insert`）は整合。
- 管理画面 ADM-012（`src/app/admin/(protected)/verifications/[id]/page.tsx:75-90`）は毎リクエスト署名付き URL（有効 3,600 秒、`src/lib/admin/signed-urls.ts`）を生成し、`<img>` で表示（`src/components/admin/document-view.tsx`）。キャッシュはしていないので「期限切れ URL を出し続ける」経路は無い。
- 唯一の間欠要因: `getSignedDocumentUrls` は署名 URL 生成が一時的に失敗すると `url: null` を返し、画面は「書類を表示できません」と出すだけでリトライ導線が無い（`signed-urls.ts:56-63`、`document-view.tsx:23-29`）。開き直すと直る挙動として現れる。
- 審査済み（pending 以外）のレコードは ADM-012 を開くと一覧へ戻される（`page.tsx:44-46`）。古いタブやリンクから開くと「画像が消えた」ように見えうる。

**修正方針（a）**: 署名 URL 生成失敗時に 1 回自動リトライ、または「再読み込み」ボタンを表示。工数 0.5 日。

**DB 実データで確認すること**（Q6）: `users.avatar_url` の拡張子と `identity_verifications.document_url_*` のパス（`.webp` が混ざっていないか）。

**クライアント向け説明文（下書き、(a) の場合）**
> 本人確認書類は、送信した後はご本人の画面には画像を表示しない作りになっています（個人情報保護のため運営側だけが確認します）。「申請中」と表示されていれば送信は完了しています。プロフィール写真が変わらない件は、写真の形式（WebP という形式）によって保存に失敗する不具合が見つかりましたので修正します。

### 【確認-4】発注されたのに応募履歴が「結果待ち」のまま — 判定 (A) が濃厚（DB で確定）

- 表示ラベルは `applications.status` からの一意な変換（`src/components/shared/application-status-badge.tsx:50-71`）: `applied` → 「応募結果待ち」、`accepted` → 「稼働予定」（評価の有無で「評価登録未入力」「評価登録済み」）、`rejected/cancelled` → 「落選・キャンセル」、`completed/lost` → 「取引完了」。**`accepted` が「応募結果待ち」と表示される経路は無い**。
- CON-011（`src/app/(authenticated)/applications/history/page.tsx`）は毎回サーバーで `status` を取得し、キャッシュ無し。画面はタブではなく「絞り込み」プルダウン（`status-filter.tsx:14-22`、URL `?filter=`）。
- 発注側 CLI-009（`applications/received/[id]/decide/decision-form.tsx:173-175`）は「発注を依頼する」を選ぶと**勤務地と初回稼働日が両方入力されるまで「送信する」ボタンが押せない**。Server Action（`applications/actions.ts:440-582`）は検証を通った場合のみ `accepted` に更新し、失敗時は DB を触らない。「保存されたのに applied のまま」という経路は無い。
- したがって実態は次のいずれか: ①発注側が「送信する」まで到達していない（ボタンが押せず送信したつもりになっている）、②別の応募（別案件・別応募者）を発注した、③別アカウントの応募と混同。
- **付随の (C)**: 発注側の「送信する」が押せない理由（勤務地・初回稼働日が未入力）が画面上に明示されていない場合、①が起きやすい。フォームに未入力理由を表示する改善余地あり（要デザイン確認、工数 0.25 日）。

**DB 実データで確認すること**（Q3）: 該当応募の `status`・`updated_at`、同じ受注者の他の応募。`accepted` の行があれば CON-011 では「稼働予定」と出ているはず。

**クライアント向け説明文（下書き）**
> 「応募結果待ち」は、発注者側でまだ「発注を依頼する」の送信が完了していない状態です。発注する画面では、勤務地と初回稼働日の 2 つを入力しないと「送信する」ボタンが押せない仕組みになっています。送信が完了すると職人さん側の表示は「稼働予定」に変わります。お手数ですが、発注した案件と応募者が一致しているか、送信まで完了しているかをご確認ください。

### 【確認-5】スカウトの受諾ボタンが出てこない — 判定 (B) の経路が実在（DB で確定）+ (C)

**ボタンの表示条件**（`src/app/(authenticated)/messages/[threadId]/page.tsx:83-87`、`src/components/messaging/message-thread-view.tsx:268-291`、`scout-action-buttons.tsx:36-54`、`scout-info-card.tsx:128-131`）

| 見る人の立場 | scout_status | 案件 | 表示 |
|---|---|---|---|
| 送った本人（自分側のメッセージ） | pending | 募集中 | **何も表示しない**（「返答待ち」等の文言も無い） |
| 受け取った受注者（個人 identity 側） | pending | 募集中 | 「スカウトを受ける」「スカウトを断る」 |
| 受け取った受注者 | pending | 掲載終了 | 「この案件は掲載を終了しました」 |
| 受け取った側が**組織 identity**（`organization_X_id` が非 null） | pending | 問わず | **何も表示しない** |
| 誰でも | accepted / rejected | 問わず | 「スカウトを受けました」/「スカウトを断りました」 |

**考えられる原因（優先順）**
1. **(B) 受け取った側が法人プランの会員だった**: スカウト送信時のスレッド作成（`messages/scout-send/actions.ts:37-44, 104-115`）は、相手が `organization_members` に所属していれば相手側も組織 identity（`organization_2_id` 非 null）で作る。一方ボタン表示（`[threadId]/page.tsx:83-87`）と応答処理（`[threadId]/actions.ts:346-355`）は「受注者は必ず個人 identity」を前提に `organization_X_id IS NULL` の側だけを受信者とみなす。本サービスは「1 アカウントで受注・発注両方」の設計で、法人 Owner も職人一覧（CLI-005）に出てスカウトを受けられる（`users/contractors/page.tsx:226`、送信側に相手の組織所属を弾くガードは無い）ため、**法人プランの会員が職人としてスカウトを受けると、受諾・辞退ボタンが一切出ず、サーバー側でも「応答権限がありません」で拒否される**。テスト用に法人アカウントを作って相互にスカウトした場合、この経路を踏む。
2. (A) 送った本人のアカウントで開いていた（スカウトタブはスレッドの `thread_type = 'scout'` で判定するため送信者側にも出る。`messages/page.tsx:77-81`）。送信者側には「返答待ち」の表示すら無いので「ボタンが無い＝バグ」と誤認しやすい（(C)）。
3. (A) 案件が掲載終了だった（案内文は出るが「だからボタンが無い」とは伝わりにくい）。

**修正方針**
- 1 の根治: 受信者判定を「identity が null の側」から「スカウトメッセージの送信者と反対側の participant」へ変更（`[threadId]/page.tsx` と `[threadId]/actions.ts` の 2 箇所、同じ判定関数に統一）。工数 1 日（vitest / E2E 追加込み）。
- 2 の改善: 送信者側の吹き出しに「相手の返答を待っています」を表示（`scout-action-buttons.tsx:54` の分岐）。工数 0.25 日。
- 3 の改善: 文言を「この案件は掲載を終了したため、受諾・辞退はできません」に変更。工数 0.1 日。

**DB 実データで確認すること**（Q4）: 該当スカウトの `sender`、スレッドの `organization_1_id / organization_2_id`、受け取った側のアカウントが組織メンバーか、案件の `status`。

**クライアント向け説明文（下書き、原因 2 の場合）**
> スカウトの「受ける」「断る」ボタンは、スカウトを受け取った職人さんの画面にだけ表示されます。送った側（発注者）の画面には表示されません。職人さん側のアカウントでログインし、マイページ →「メッセージ・スカウト」→ 該当のスレッドを開くとボタンが表示されます。なお、法人プランのアカウントで職人としてスカウトを受けた場合にボタンが出ない不具合が見つかりましたので、こちらは修正します。

### 【確認-16】組織あてスレッドの見え方 — 判定 (A)（見つけ方の案内で解決）

- メッセージ一覧（`src/app/(authenticated)/messages/page.tsx:41, 83-98`）は、発注者・担当者がログインしている場合、有効化中の組織に紐づくスレッド（`organization_id` / `organization_1_id` / `organization_2_id` が自組織）を全て表示する。RLS `message_threads_select`（`supabase/migrations/20260707150000_message_threads_identity_pair.sql:78-86`）も同組織メンバー全員に開放済み。
- 担当者が見えないのは次の 2 例のみで、いずれも仕様: ①法人プランに昇格する前に代表者個人として始めたスレッド（組織 ID が無い。2026-06-04 の設計判断）、②複数組織を兼任する代理スタッフで、画面上部の組織切替が別の組織になっている。
- 導線: マイページ → 「メッセージ・スカウト」（`mypage/page.tsx:34, 48`。「仕事を探す」セクションは全ロールに表示）。

**DB 実データで確認すること**（Q5）: 対象スレッドの `organization_*_id` が担当者の所属組織と一致しているか。昇格前スレッドなら組織 ID が NULL。

**クライアント向け説明文（下書き）**
> 会社あてのメッセージは、代表者・担当者のどちらでログインしても同じものが表示されます。見る場所は「マイページ」→「メッセージ・スカウト」です。担当者の方の画面に出ていない場合は、そのやり取りが「法人プランにする前に代表者個人として始めたもの」の可能性があります。その場合は代表者の画面にだけ表示されます（過去の個人のやり取りを会社全体に公開しないための仕様です）。
### 【確認-6〜15】管理画面でブラウザの「戻る」が想定通りに動かない — 判定 (B) 4 件 / (C) 4 件 / 未特定 2 件

**前提となる実装構造**（`/admin` 配下）
- 画面内「もどる」は共通の `BackButton`（`router.back()`）を使わず、各ページが固定リンクまたは `?backTo=` クエリ（`src/lib/admin/back-to.ts` のリレー方式。詳細画面が自分の URL を子リンクの `backTo` に積む）を持つ `<Link>` で実装。`router.back()` / `router.replace()` / `window.location` は admin 内に 0 件。
- 一覧の検索・並び替えは全て `router.push`（履歴に積む）。
- 保存・削除系 Server Action の `redirect()` は type 未指定。Next.js 16 では Server Action 内の `redirect()` は既定で **push**（`node_modules/next/dist/client/components/redirect.js:52`）＝フォーム画面の履歴が残る。

**画面内「もどる」の遷移先一覧**

| ルート | もどる先 |
|---|---|
| /admin/clients, /admin/users, /admin/verifications | `/admin/dashboard`（固定） |
| /admin/applications, /admin/contacts, /admin/job-inquiries, /admin/trouble-reports, /admin/messages, /admin/jobs/[id] | `backTo` があればそこへ。無ければ `/admin/dashboard` |
| 各詳細（clients/[id], users/[id], applications/[id], contacts/[id], job-inquiries/[id], trouble-reports/[id], messages/[threadId]） | `backTo` があればそこへ。無ければ各一覧 |
| /admin/clients/[id]/edit, /admin/clients/new, /admin/verifications/[id], /admin/bank-transfers/[id], /new | 固定（親詳細 or 一覧）。verifications/[id] は意図的と明記 |

**指摘ごとの判定**

| No | 判定 | 原因 | 該当箇所 |
|---|---|---|---|
| 35 | **(B)** | 発注者詳細の「応募◯件」リンクは `backTo` 付きで応募一覧へ遷移する（`clients/[id]/job-site-list.tsx:65`）が、応募一覧の検索フォームが URL を組み直す際に `backTo` を落とす。以後「もどる」がフォールバックの `/admin/dashboard` へ飛ぶ | `src/app/admin/(protected)/applications/filters.tsx:54-70` |
| 37 | **(B)** | ユーザー詳細の「発注者詳細」リンクだけ `backTo` を引き継いでいない（同ファイル内の他リンクは付けている）。発注者詳細の「もどる」がフォールバックの発注者一覧へ飛ぶ | `src/app/admin/(protected)/users/[id]/page.tsx:378` |
| 38 | (B) 37 の派生 | 37 で一覧へ飛ばされた後にブラウザ戻るを押した体験が「ページを飛ばされた」に見える。ブラウザ戻る自体を壊すコードは無い | 同上 |
| 40 | **(B)** | 検索フォームの入力値が `useState(initialKeyword)` でマウント時に一度だけ URL から写される実装。ブラウザ戻るで URL が検索前に戻っても、部品が再利用されると入力欄が検索後の値のまま残る。users / applications / contacts / job-inquiries / trouble-reports の検索フォームも同型 | `src/app/admin/(protected)/clients/filters.tsx:51-53` ほか |
| 41 | **(B)** | メモ保存の `redirect()` が push 既定のため、履歴が「詳細 → 編集 → 詳細（新規）」となり編集画面が残る。ブラウザ戻るで編集画面に戻り、Router Cache の鮮度により保存前の値が見えたり最新だったりする。同型: 発注者削除・招待送信・本人確認の承認/却下・ユーザー削除の `redirect()` | `src/app/admin/(protected)/clients/[id]/actions.ts:77,162`、`verifications/[id]/actions.ts:155,219`、`users/[id]/actions.ts:89`、`clients/new/actions.ts:176` |
| 42 / 43 | (C) | 「もっと見る」は `useState` の画面内状態で URL に無い。別画面へ行って戻ったときに開閉状態が残るかは Next.js のクライアントキャッシュ次第（SPA の標準挙動） | `clients/[id]/job-site-list.tsx:30`、`src/components/master/collapsible-list.tsx:35` |
| 36 | (C)・要実機確認 | 並び順は URL `?sort=` が正で、詳細への `backTo` にも含まれる。コード上のバグは無い。並び替えボタン連打で同一 URL の履歴が複数でき、戻る連打時にキャッシュのどの時点が出るか不定になりうる | `applications/sort-button.tsx:42` |
| 34 / 39 | 未特定・要実機確認 | いずれも通常の `<Link>` のみで、履歴を置き換える実装は無い。Next.js App Router のクライアント側キャッシュ／プリフェッチ由来の間欠事象の疑い。再現条件（連打・回線速度）を実機で切り分ける | `jobs/[id]/page.tsx:247`、`dashboard/page.tsx` |

**修正方針（工数）**
1. No.37/38: リンクに `backTo` を付与（1 行）。0.1 日。
2. No.35: 応募一覧の検索フォームに `backTo` を受け渡して維持。0.25 日。
3. No.41: admin の保存・削除系 `redirect()` を `redirect(path, "replace")` に統一（7 箇所程度）。0.5 日（回帰確認込み）。
4. No.40: 検索フォーム 4〜6 ファイルを「URL の値をそのまま表示に使う」形に揃える（`useEffect` 同期または `key` による再マウント）。1 日。
5. No.34/36/39/42/43: 実機で再現条件を切り分けてから判断。応急策は一覧ページの `<Link prefetch={false}>` や `dynamic = "force-dynamic"` で切り分け。調査 0.5〜1 日。

**クライアント向け説明文（下書き、No.42/43・36・34/39 向け）**
> 管理画面の「もっと見る」で開いた状態や、検索条件の入力内容は、ブラウザの「戻る」では元に戻らない場合があります（ブラウザの戻るは「ページ」を戻す機能で、ページの中の開閉状態までは記憶しないためです）。画面内の「もどる」ボタンを使っていただくと、来た経路どおりに戻るように作っています。「もどる」ボタンで意図しない画面に飛ぶケース（No.35・No.37）はこちらの不備でしたので修正します。

---

## DB 実データの確認手順（未実施・要人手）

本セッションからステージング DB（bijiyu-staging / `mfrlsbnqybvkzwsmiolm`）へは接続できなかった（`psql` 無し、`supabase db dump --linked` は権限ポリシーで停止）。以下を Supabase Studio の SQL Editor で実行し、結果を上記「DB 実データで確認すること」に照らして最終判定する。**全て SELECT のみ**。

SQL は `docs/requirements/staging-check-queries-202609.sql` に保存した。

| クエリ | 対象項目 | 見るポイント |
|---|---|---|
| Q1 | 確認-2 | クライアントのアカウントに `accepted_as_client` / `accepted_as_contractor` / `applied_as_contractor` が残っていないか |
| Q2 | 確認-2 | 残っている案件の `status` と `work_end_date`（期限切れかどうか） |
| Q3 | 確認-2 / 確認-4 | 該当応募の `status` と `first_work_date`。「結果待ち」の応募が本当に `applied` か、`accepted` の行が別案件に無いか |
| Q4 | 確認-5 | スカウトの送信者、スレッドの `organization_1_id / organization_2_id`（受け取り側が組織 identity なら確認-5 の (B) 経路）、案件の `job_status` |
| Q5 | 確認-16 | 対象スレッドの組織 ID と担当者の所属組織の一致。NULL なら昇格前スレッド |
| Q6 | 確認-3 | `avatar_url` / `document_url_*` に `.webp` があるか |
| Q7 | 確認-1 | 契約中プランと `billing_cycle`（年払いを見ていたか） |

## 修正候補の一覧（実施可否は項目ごとに判断）

| 優先 | 項目 | 修正内容 | 工数 |
|---|---|---|---|
| 高 | 修正-1 | 入力欄 3 ファイル 5 箇所を `text-base md:…` に | 0.5 日 |
| 高 | 修正-2 | `SearchFilterSheet` に `onOpenAutoFocus` 抑止 1 行 | 0.25 日 |
| 高 | 修正-3 | マイリスト画面の ♡ 解除で `router.refresh()`（+ E2E） | 0.5 日 |
| 高 | 確認-3(b) | `AVATAR_PATH_EXTENSIONS` に webp 追加 | 0.25 日 |
| 高 | 確認-5(1) | スカウト受信者判定を「送信者の反対側」に変更 | 1 日 |
| 中 | 確認-2 | 期限切れ accepted を運営が解消できる ADM-014 操作 + 退会エラー文言に案件名・窓口 | 1.5〜2 日 |
| 中 | 確認-2 | 受注者の「結果待ち」応募の取り下げ（FAQ と整合） | 1 日 |
| 低 | 確認-1 | 比較表の「1件/月」→「同時 1 件」、代理メッセージ上限の扱い決定、年払い行 | 0.5 日 |
| 低 | 確認-4 | 発注フォームで送信ボタンが押せない理由を表示 | 0.25 日 |
| 低 | 確認-5(2)(3) | 送信者側「返答待ち」表示・掲載終了文言 | 0.25 日 |
| 低 | 確認-3(a) | 署名 URL 生成失敗時のリトライ | 0.5 日 |
