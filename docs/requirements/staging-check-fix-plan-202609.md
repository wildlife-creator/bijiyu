# ステージング指摘 不具合修正 方針書（フェーズ 2・承認待ち）（2026-09-08）

- 依頼書: `staging-check-fix-request-202609.md`（9 件、①再確認 → ②方針提示 → ③実装）
- フェーズ 1 の結果: 9 件すべて「原因は前回どおり・未修正」（2026-09-07、ブランチ `feature/spec-changes-202608` HEAD 01f0f1d で確認）
- 本書はフェーズ 2 の成果物。**人間が項目ごとに「実装する／しない」を決めるための資料**であり、承認前に実装には入らない。

## 0. 全体の進め方（共通）

| 観点 | 方針 |
|---|---|
| ブランチ | `spec-changes-202608.md` §5 のとおり。②改修まとめブランチ `feature/spec-changes-202608` から③作業ブランチ `fix/staging-check-202609-<グループ>` を切り、完了ごとに②へマージ。①クライアント確認用（staging 稼働中）は触らない |
| DB | **9 件ともマイグレーション不要**（新テーブル・新列・enum 追加なし）。テスト用の seed 追加はローカル seed.sql のみで、staging のデータは変更しない |
| テスト | 既存 3 層（vitest / pgTAP / Playwright）を作業ブランチで全実行して回帰確認。各項目に対応するテストを追加 |
| コミット | 下記グループ単位。メッセージは日本語で「何を直したか」 |

グループ分け（依存関係なし・並行可）:

| グループ | 項目 | 合計工数の目安 |
|---|---|---|
| A: 会員画面の小修正 | 3・4・5・8・9 | 1.75 日 |
| B: 管理画面の戻り導線 | 6・7 | 0.75 日 |
| C: スカウト受信者判定 | 1 | 1 日 |
| D: 退会デッドロック | 2a・2b（＋任意 2c） | 2 日（2c 込みで 3 日） |

---

## 1.【高】スカウトの受諾/辞退ボタンが出ない（No.33）

**やさしい説明**: プログラムが「スカウトを受け取るのは必ず個人の職人」と思い込んでいるため、会社アカウントが職人としてスカウトを受けるとボタンが出ず、押しても拒否される。

**修正方針**: 判定を「スカウトを送った人の反対側にいる人が受け取った人」に変え、画面とサーバーの 2 か所で同じ関数を使う。

| 変更 | 内容 |
|---|---|
| 新規 `src/lib/messaging/scout-recipient.ts` | `resolveScoutRecipientUserIds(admin, thread, scoutSenderId)`: 送信者がどちらの side（participant 本人 or その side の組織メンバー）かを判定し、**反対側の user id 集合**（個人なら participant のみ、組織なら participant + 組織メンバー全員）を返す。既存の `resolveSideUserIds`（`messages/[threadId]/page.tsx` 末尾）を共通化して流用 |
| `messages/[threadId]/page.tsx:83-87` | `showScoutActions` = 「viewer がスレッドのどちらかの side に属する」かつ `role !== 'staff'`。送信者側の除外は既にメッセージ単位（`showScoutActions && !messageIsMine`）で行われているので、そのまま活かす |
| `messages/[threadId]/actions.ts:346-354` | `respondToScoutAction` の権限チェックを「user.id が上記の受信者集合に含まれる」かつ `role !== 'staff'` に変更。送信者本人ブロックは維持 |

- **担当者（staff）を除外する理由**: CLAUDE.md「担当者の受注者アクション制限」。組織が受け取ったスカウトに応答するのは Owner（`role='client'`）。
- **影響範囲**: 上記 3 ファイル。個人⇔個人・個人⇔組織の既存ケースは結果が変わらない（受信者集合に含まれるのは同じ人）。
- **テスト**: vitest `src/__tests__/messaging/actions.test.ts` に「両側 org identity で受信側 Owner が応答できる」「staff は拒否」「送信側組織のメンバーは拒否」を追加。E2E: seed に「法人 ⇔ 法人」のスカウトスレッドを 1 本追加し、受信側 Owner でボタン表示 → 辞退まで 1 ケース。
- **工数**: 1 日。
- **任意 1b**（0.25 日）: 送った側の吹き出しに「相手の返答を待っています」を表示（`scout-action-buttons.tsx:54`）。「ボタンが無い＝バグ」という誤認を防ぐ。**推奨: 一緒にやる**。

## 2.【高】退会できない「詰み」状態（No.8）

**やさしい説明**: 「発注済み」の仕事が残っていると退会できない。片づける 3 つの方法（完了報告・職人キャンセル・運営取消）に全部締め切りがあり、過ぎると誰も片づけられない。

### 2a. 運営が期限切れの「発注済み」を片づけられるようにする（根治）

| 変更 | 内容 |
|---|---|
| `src/lib/admin/application-status.ts` | 純粋関数 `canAdminResolveExpired(app, job, today)` を追加: `status='accepted'` かつ完了報告の入力期間終了（`evaluateReviewInputWindow` が `after-end`）のとき true。既存 `canAdminCancel`（稼働日前）はそのまま |
| ADM-014 `applications/[id]/actions.ts` | 新 Server Action `adminCompleteApplicationAction`（status → `completed`）を追加。`adminCancelApplicationAction` は「稼働日前 **または** 期限切れ」なら許可に拡張（`cancelled_by='admin'`）。両方 `requireAdmin()` + 監査ログ（新アクション名 `application_complete_admin` を `src/lib/audit` の型に追加） |
| ADM-014 `applications/[id]/page.tsx` | 期限切れの accepted に「完了扱いにする」「発注を取り消す」の 2 ボタンを表示（確認ダイアログ付き、既存 `cancel-button.tsx` を踏襲）。案件の `work_end_date` を SELECT に追加 |
| 仕様書 | `.kiro/specs/matching/requirements.md` のステータス遷移に「accepted → completed / cancelled（運営による期限切れ解消・ADM-014）」を追記。`.kiro/specs/admin/requirements.md` REQ-ADM-014 に操作を追記 |

- **「完了扱い」と「取消」を両方置く理由**: 実際に稼働が終わった案件を「取消」と記録するのは事実と違う。稼働しなかった案件は「取消」。運営が事情に応じて選ぶ。
- **影響範囲**: admin 3 ファイル + 監査型 + 仕様書 2 本。会員側画面は無変更（`completed` は既存の「取引完了」表示、評価は付かないだけ）。DB 変更なし（enum に `completed` は既存、`cancelled_by` の CHECK も `admin` を許容済）。
- **テスト**: vitest（純粋関数の境界日 / 両 Action の許可・拒否）。E2E: seed に「稼働終了 +6 日の accepted」を 1 件追加し、ADM-014 で完了扱い → バッジが「取引完了」に変わる 1 ケース。pgTAP 不要（admin は service_role）。
- **工数**: 1.5 日。

### 2b. 退会できないときのメッセージを具体的にする

| 変更 | 内容 |
|---|---|
| `src/lib/withdrawal/execute.ts:64-120` | 件数だけ見ている 2 つのガードを、案件タイトルも取得する形に変更。文言例: 「進行中の案件（表町電気工事 ほか1件）があるため退会できません。稼働終了日から5日を過ぎて完了報告ができない場合は、お問い合わせからご連絡ください。」 |

- **影響範囲**: 本人退会（`withdrawal-form.tsx` はそのまま `state.error` を表示）と admin 強制退会の両方が同じ関数を使うので、両方で新文言になる。
- **テスト**: 既存 vitest の期待文言を更新 + タイトル 3 件以上の省略表示ケース追加。
- **工数**: 0.5 日。

### 2c.（任意）受注者が「結果待ち」の応募を自分で取り下げられるようにする

- FAQ が「マッチング成立前であれば応募の取り下げは可能」と書いているのに機能が無い。発注者が放置すると受注者側も退会できない（ガード 1）。
- 変更: CON-012（`applications/history/[id]`）に `status='applied'` のとき「応募を取り下げる」ボタン。`cancelApplicationAction` を applied にも対応（`cancelled_by='contractor'`）。発注者組織へ通知メール 1 通（既存の応募キャンセル通知テンプレートを流用）。
- 工数: 1 日。**推奨: 今回やる**（FAQ との不整合を放置すると同種の指摘が再発する）。ただし分離して後回しにしても他項目に影響しない。

### 2d. staging に残っている詰みデータ 2 件の解消方法（人間の判断が必要）

対象: `8f5b6eef…` / `b5146f97…` の accepted 応募 2 件（表町電気工事・かずひで333）。

| 案 | 内容 | 長所 | 短所 |
|---|---|---|---|
| **A（推奨）** | 2a を staging に出荷したあと、運営画面 ADM-014 から「完了扱い」で解消 | 修正そのものの実地検証になる。手作業 SQL 不要 | 2a の出荷まで待つ（クライアントの退会テストが待たされる） |
| B | Supabase Studio で該当 2 行を `UPDATE applications SET status='completed'` | 即日解消 | 監査ログが残らない。手作業ミスのリスク。2a の検証機会を失う |

---

## 3.【高】スマホで入力欄が拡大したまま戻らない（No.1・24）

**やさしい説明**: iPhone は文字が 16px 未満の入力欄を押すと画面を自動拡大する。共通部品を使っていない入力欄が 5 つある。

| ファイル:行 | 変更 |
|---|---|
| `src/components/messaging/message-input.tsx:188` | `text-sm` → `text-base md:text-sm` |
| `src/app/(authenticated)/messages/templates/scout-template-form.tsx:90,111,128 付近` | `text-body-md` → `text-base md:text-body-md`（3 箇所） |
| `src/components/master/master-combobox.tsx:199` | `text-body-sm` → `text-base md:text-body-sm` |
| `.kiro/steering/design-rule.md` | 「入力欄（input / textarea / cmdk Input）に 16px 未満の文字サイズを単独で当てない。必ず `text-base md:…` にする」を追記（再発防止） |

- **影響範囲**: スマホ幅（768px 未満）でのみ文字が 16px になる。PC は不変。フェーズ 1 でアプリ全体を洗い直し、他に該当なし。
- **テスト**: 自動テストなし（見た目のみ）。`tsc` / `lint` 通過 + 実機（iPhone Safari）で 3 画面確認。
- **工数**: 0.5 日。

## 4.【高】検索条件を開くとキーワード欄に自動フォーカス（No.21）

| ファイル:行 | 変更 |
|---|---|
| `src/components/job-search/search-filter-sheet.tsx:82` | `<SheetContent … onOpenAutoFocus={(e) => e.preventDefault()}>` を 1 行追加 |

- **影響範囲**: CON-002 / CON-005 / CLI-005 の 3 画面に一括で効く。キーボード操作時のフォーカスがパネル自体になるだけで、アクセシビリティ上の問題なし。
- **テスト**: 既存 E2E（検索パネルを開いてキーワードを `fill`）が通ることを確認。自動フォーカスの有無を検証する E2E 1 件追加（`toBeFocused` の否定）。
- **工数**: 0.25 日。

## 5.【高】♡解除がマイリストに即反映されない（No.22）

| ファイル | 変更 |
|---|---|
| `src/components/job-search/favorite-button.tsx` | 任意 prop `refreshOnToggle?: boolean` を追加。true なら Server Action 成功後に `router.refresh()` |
| `src/components/job-search/job-list-card.tsx` | 同名 prop を受けて `FavoriteButton` に渡す（案件カード経由のため） |
| `src/app/(authenticated)/favorites/page.tsx:280,407,575` | 3 箇所で `refreshOnToggle` を渡す |
| `src/app/(authenticated)/jobs/search-actions.ts` `toggleFavoriteAction` | `revalidatePath("/favorites")` を追加（保険） |

- **影響範囲**: マイリスト画面のみ体感が変わる。他の一覧・詳細画面は prop を渡さないので従来どおり（解除してもカードは残る＝正常）。
- **テスト**: E2E `e2e/job-search.spec.ts` に「マイリストで解除 → カードがその場で消える」を案件・発注者・職人の 3 タブ分追加。
- **工数**: 0.5 日。

## 6.【中】管理画面の「もどる」ボタンの飛び先間違い（No.35・37/38）

| ファイル:行 | 変更 |
|---|---|
| `src/app/admin/(protected)/applications/filters.tsx:54-70` + `applications/page.tsx:299` | フィルタに `backTo` prop を渡し、`handleSearch` で URL を組み直すときに維持（No.35） |
| `src/app/admin/(protected)/users/[id]/page.tsx:378` | 「発注者詳細」リンクに `?backTo=<自分の URL>` を付与（No.37/38）。同ファイル 236 行の動画リンクと同じ形 |

- **影響範囲**: admin の 3 ファイル。他画面の導線は変えない。
- **テスト**: E2E `e2e/admin.spec.ts` に「発注者詳細 → 応募◯件 → 検索 → もどる → 発注者詳細に戻る」「ユーザー詳細 → 発注者詳細 → もどる → ユーザー詳細に戻る」の 2 ケース。
- **工数**: 0.25 日。

## 7.【中】管理画面の検索欄がブラウザ戻りで元に戻らない（No.40）

| ファイル | 変更 |
|---|---|
| `src/app/admin/(protected)/clients/filters.tsx` / `users/filters.tsx` / `applications/filters.tsx` / `src/components/admin/keyword-search-form.tsx` | 「マウント時に一度だけ」の `useState(initial…)` に、`useEffect(() => setKeyword(initialKeyword), [initialKeyword])`（Select も同様）を足し、URL が変わったら表示も追従させる |

- **影響範囲**: 4 ファイル・6 画面（発注者一覧 / ユーザー一覧 / 応募一覧 / お問い合わせ / 求人お問い合わせ / トラブル報告）。入力途中の文字は URL が変わらない限り残るので、検索ボタンを押すまでの体験は不変。
- **テスト**: E2E 1 ケース（検索 → ブラウザ戻る → 検索欄が空に戻る）。
- **工数**: 0.5 日。
- **対象外の補足**: No.36・42・43・34・39 は依頼書どおり対象外。前回調査で挙げた No.41（保存後の `redirect()` が履歴に残る）も依頼書の 9 件に含まれていないため本書では扱わない。

## 8.【中】プロフィール写真が WebP だと保存に失敗（確認-3(b)）

| ファイル:行 | 変更 |
|---|---|
| `src/lib/validations/profile.ts:15,18,28` | `ALLOWED_AVATAR_MIME_TYPES` に `image/webp`、`ALLOWED_AVATAR_EXTENSIONS` に `.webp`、`AVATAR_PATH_EXTENSIONS` に `webp` を追加 |

- **影響範囲**: アバター保存のみ。画面の案内文（「JPEG・PNG・WebP形式」）・直接アップロードのルール・avatars バケットは既に WebP 許可済みで、これで 4 つの関門が揃う。
- **テスト**: vitest 新規 `src/__tests__/profile/avatar-path.test.ts`（`isOwnedStoragePath` × `AVATAR_PATH_EXTENSIONS` で webp が通る / gif は弾く）。
- **工数**: 0.25 日。

## 9.【中】本人確認書類の画像がまれに表示できない（確認-3(a)）

| ファイル:行 | 変更 |
|---|---|
| `src/lib/admin/signed-urls.ts:40-64` | `createSignedUrls` が失敗したら 1 回だけ自動で再試行（数百 ms 待って再実行）。監査ログは 1 回のみ |
| `src/components/admin/document-view.tsx:23-30` | フォールバック文言を「書類を表示できませんでした。ページを再読み込みしてください」に変更 |

- **影響範囲**: ADM-012 本人確認、お問い合わせ詳細、トラブル報告詳細、admin メッセージスレッドの 4 画面（同じ関数を共用）。
- **テスト**: vitest（1 回目失敗 → 2 回目成功で URL が返る / 2 回失敗で null）。
- **工数**: 0.25 日。
- **補足**: クライアントの No.20「画像が反映されない」の直接原因はまだ未確定。8・9 を実装しつつ、クライアントへ「どの画面・何の画像・どう反映されなかったか」のヒアリングは別途。

---

## 承認が必要な判断まとめ

| # | 判断 | 推奨 |
|---|---|---|
| 1 | 項目 1〜9 のうち実装するもの | 全 9 件実装（合計約 5.5 日） |
| 2 | 任意 1b（送信側に「返答待ち」表示） | やる（+0.25 日） |
| 3 | 任意 2c（受注者の結果待ち取り下げ） | やる（+1 日）。分離して後回しも可 |
| 4 | staging の詰みデータ 2 件の解消 | 案 A（2a 出荷後に運営画面で解消） |
| 5 | 着手順 | A（小修正）→ B（admin）→ C（スカウト）→ D（退会）。C・D はクライアントが実際に踏んだ不具合なので、急ぐなら C・D を先に |

---

## 実装結果（フェーズ 3・2026-09-08）

承認内容: 全 9 件 + 任意 1b（送信側「返答待ち」）+ 1c（受信側 staff への案内）+ 2c（結果待ち応募の取り下げ）。staging の詰みデータは案 A。

| グループ | 作業ブランチ → `feature/spec-changes-202608` へ merge | 内容 | テスト |
|---|---|---|---|
| A | `fix/staging-check-202609-a-ui`（83af705 / merge 98ba863） | 3・4・5・8・9 | vitest 1787 / pgTAP 450 / E2E 343（新規 4 + vitest 8） |
| B | `fix/staging-check-202609-b-admin`（84ee69e / merge 71e9964） | 6・7 | vitest 1787 / pgTAP 450 / admin 系 E2E 55（新規 4） |
| C | `fix/staging-check-202609-c-scout`（0182e6c / merge 28c776f） | 1 + 1b + 1c | vitest 1799 / pgTAP 450 / E2E 351（新規 4 + vitest 12） |
| D | `fix/staging-check-202609-d-withdrawal` | 2a・2b・2c | vitest 1821 / pgTAP 450 / E2E（新規 4 + vitest 22）。本文末尾の「最終結果」参照 |

補足:
- DB マイグレーションは 9 件とも無し（seed.sql に E2E 用データを追加したのみ。staging のデータは変更していない）
- 仕様書更新: `.kiro/specs/matching/requirements.md`（7'. 応募取り下げ / accepted → completed 運営解消）、`.kiro/specs/admin/requirements.md`（REQ-ADM-014 期限切れ解消）、`.kiro/specs/notifications/email-decisions-wip.md`（§1.2 A 行の方針転換 + 1.2.C/D）、`.kiro/steering/design-rule.md`（入力欄 16px）、`CLAUDE.md`（再発防止ルール）
- **staging の詰みデータ 2 件（案 A）**: D を staging に出荷後、運営が ADM-014 で該当応募（表町電気工事・かずひで333）を開き「完了扱いにする」を押して解消する。出荷（feature → クライアント確認用ブランチのマージ・デプロイ）は本作業の範囲外
- E2E 実行環境メモ: `@playwright/test` 1.58.2 が要求する `chromium_headless_shell-1208` のダウンロードがネットワーク要因で進まないため、既存の `headless_shell-1234` を `launchOptions.executablePath` で指す一時 config（リポジトリ外）で実行した。次回 `npx playwright install chromium` を対話ターミナルで完了させること
