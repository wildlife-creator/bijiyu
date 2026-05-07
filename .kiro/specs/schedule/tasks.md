# 空き日程機能（schedule）— 実装計画

## 全体方針

requirements.md / design.md / research.md に基づき、以下のフェーズで実装する:

```
Phase 0  既存テスト全実行（デグレ確認）
Phase 1  既存実装の事前修正（Middleware + MyPage）
Phase 2  バリデーション層 / ドメイン層
Phase 3  Server Action 層
Phase 4  UI 層（共通フォーム / 削除ボタン / 3 画面）
Phase 5  テスト追加（Vitest / pgTAP / Playwright）
Phase 6  最終統合検証
```

各フェーズの完了後に該当のテストを実行し、デグレードがないことを確認する。`(P)` は同一フェーズ内で並列実行可能なタスクを示す。

## 実装タスク

- [x] 1. 既存テストの全実行とデグレード確認
  - `npm run test`（Vitest）/ `supabase test db`（pgTAP）/ `npm run test:e2e`（Playwright）を順に実行する
  - すべて pass することを確認してから次のタスクに着手する
  - 失敗があれば、原因を調査・修正してから Phase 1 以降に進む（CLAUDE.md「テスト失敗時のルール」「spec-tasks で生成する tasks.md のルール」に準拠）
  - 事前確認のため特定要件にひも付かない（失敗があれば該当 REQ を更新して対応）

- [x] 2. 既存実装の事前修正（schedule 機能と同一スコープ）
- [x] 2.1 (P) Middleware の Staff ガード誤記を修正する
  - `src/middleware.ts` の staff ガード対象を `/availability`（存在しないパス）から `/schedule` に変更する
  - 変更後、Staff が `/schedule` または `/schedule/...` にアクセスすると `/mypage` にリダイレクトされること、contractor / client では既存挙動が維持されること、を目視確認
  - _Requirements: 4.2_

- [x] 2.2 (P) マイページの「予定を確認する」セクションを Staff から非表示にする
  - `src/app/(authenticated)/mypage/page.tsx` の Section 2「予定を確認する」全体を `{!isStaff && (<section>...</section>)}` で囲む
  - 結果として「応募履歴」「空き日程一覧」両メニューが Staff から消えることを確認（応募履歴は元々 Middleware ブロック対象なので整合）
  - contractor / client では既存挙動を維持
  - _Requirements: 4.1_

- [x] 2.3 (P) CLI-006（職人詳細）の空き日程クエリを直近 3 件・未来分のみに変更する
  - `src/app/(authenticated)/users/contractors/[id]/page.tsx` の `available_schedules` SELECT 部分に `.gte("end_date", todayIso)` と `.limit(3)` を追加する
  - 過去日程（`end_date < today`）を除外し、`start_date` 昇順で直近の未来 3 件のみ取得
  - 受注者の登録件数自体は無制限のまま（CON-014 では全件表示で自己管理）。発注者画面の混雑だけを防ぐ閲覧側の制限
  - 「もっと見る」リンクは設けない（デザインカンプ CLI-006.png 準拠）
  - _Requirements: 5.1, 5.2_

- [x] 3. バリデーション層 / ドメイン層を構築する
- [x] 3.1 (P) Zod スキーマで開始日 / 終了日の検証ルールを定義する
  - 開始日が今日以降であること、終了日が開始日以降であることを検証
  - タイムゾーン正規化（`setHours(0, 0, 0, 0)`）でローカル日付の今日扱いを保証
  - クライアント・サーバー両方で同一スキーマを使う設計
  - _Requirements: 3.1, 3.3_

- [x] 3.2 (P) 期間重複判定のドメイン関数を実装する
  - 純粋関数として閉区間 `[start_date, end_date]` の重複を判定
  - `excludeId` オプションで自分自身（編集対象行）を除外できる
  - 副作用なし、入力配列を変更しない（境界値テストが書きやすい純粋関数として独立）
  - _Requirements: 2.3, 3.2_

- [x] 3.3 (P) ロールガード関数を実装する
  - `'contractor'` / `'client'` の許可ロールを判定し、`'staff'` / `'admin'` を拒否
  - Server Action の冒頭（三層防御の第 3 層）で使用する想定
  - _Requirements: 4.3_

- [x] 4. Server Action 層を構築する
  - 3 つの Server Action（create / update / delete）を同一の `actions.ts` に集約するため、ファイル衝突を避けて順次実装する
- [x] 4.1 createScheduleAction を実装する
  - 4 ステップの標準ロールガード: createClient → auth.getUser → users.role SELECT → isContractorOrClientRole で早期 return
  - Zod 検証 → 既存日程 SELECT → 重複判定 → INSERT
  - 重複時は `ActionResult<{ warning?: string }>` の `data.warning` に通知文言を入れて成功 return
  - 成功 return 直前に `revalidatePath("/schedule")` を呼ぶ
  - 処理全体を `try/catch` で囲み、catch 内では `{ success: false, error: "予期しないエラーが発生しました" }` を return
  - _Requirements: 3.1, 3.2, 3.3, 4.3_

- [x] 4.2 updateScheduleAction を実装する
  - 4 ステップロールガード（4.1 と同じ）
  - 所有権の明示チェック: 対象行の `user_id` を SELECT し `auth.uid()` と比較、不一致なら拒否
  - Zod 検証 → 既存日程 SELECT → 重複判定（`excludeId` に対象 `id` を渡す）→ UPDATE
  - 成功 return 直前に `revalidatePath("/schedule")` + try/catch ラッピング
  - _Requirements: 2.1, 2.3, 4.3_

- [x] 4.3 deleteScheduleAction を実装する
  - 4 ステップロールガード + 所有権チェック → 物理削除（DELETE）
  - 戻り値は `ActionResult`（warning なし）
  - 成功 return 直前に `revalidatePath("/schedule")` + try/catch ラッピング
  - クライアント側で `router.push("/schedule")` を呼ぶため、Server Action からの `redirect` は呼ばない（責務分担を ScheduleForm と統一）
  - _Requirements: 2.2, 4.3_

- [x] 5. UI 層を構築する
- [x] 5.1 (P) 共通フォームコンポーネント（ScheduleForm）を実装する
  - discriminated union 型で create / edit モードの Props を分離（`mode === "edit"` のとき `defaultValues` 必須をコンパイル時に保証）
  - react-hook-form + zodResolver でクライアント側バリデーション
  - 開始日 / 終了日に `<Input type="date" min={todayIso}>` を使用（既存 job-form と同じパターン）
  - mode に応じて `createScheduleAction` / `updateScheduleAction` を呼び分け
  - 結果ハンドリング: `result.success === false` → `toast.error(result.error)`、`result.success === true && result.data?.warning` → `toast.warning(result.data.warning)`、最後に `router.push("/schedule")`
  - 万一 Router Cache 問題が出た場合のフォールバックは `window.location.href = "/schedule"`
  - _Requirements: 2.1, 3.1, 3.2, 3.3_

- [x] 5.2 (P) 削除ボタンコンポーネント（DeleteScheduleButton）を実装する
  - shadcn `<AlertDialog>` を使用、トリガーは赤系（`variant="destructive"` + `rounded-pill`）の「削除する」ボタン
  - 確定時に `deleteScheduleAction(scheduleId)` を呼び、成功なら `router.push("/schedule")`、失敗なら `toast.error(result.error)`
  - AlertDialog の文言: 本文「この空き日程を削除します。よろしいですか？」、確定ラベル「削除する」、キャンセルラベル「キャンセル」
  - _Requirements: 2.2_

- [x] 5.3 (P) CON-014 一覧画面（SchedulePage、Server Component）を実装する
  - h1「空き日程」 + 統一説明文「予定が空いている日程を登録すると、発注者からスカウトが届きやすくなります。」
  - 自分の `available_schedules` を `start_date` 昇順で SELECT
  - 既存 `formatDate`（@/lib/utils/format-date）で `${formatDate(start)}〜${formatDate(end)}` 形式の日付範囲表示（CLI-006 と完全一致）
  - 過去日程（`end_date < today`）は `text-muted-foreground` で灰色表示、並び順は維持
  - 各行クリックで `/schedule/[id]/edit` に遷移（リンクで包む）
  - 「空き日程を追加する」CTA → `/schedule/new`
  - `<BackButton href="/mypage" />`（履歴に依存しない固定遷移）
  - _Requirements: 1.1, 1.2_

- [x] 5.4 CON-016 登録画面（NewSchedulePage、Server Component）を実装する
  - h1「空き日程登録」 + 共通説明文
  - `<ScheduleForm mode="create" submitLabel="空き日程を登録する" />` を配置（5.1 完了後に着手）
  - `<BackButton href="/schedule" />`
  - _Requirements: 3.1_

- [x] 5.5 CON-015 更新画面（EditSchedulePage、Server Component）を実装する
  - h1「空き日程更新」 + 共通説明文
  - `params.id` で対象行を SELECT。なければ `notFound()`、所有者でなければ `notFound()`（RLS による silent zero rows + 明示チェックの多層防御）
  - `<ScheduleForm mode="edit" defaultValues={...} submitLabel="空き日程を更新する" />` を配置（5.1 完了後に着手）
  - `<DeleteScheduleButton scheduleId={id} />`（5.2 完了後に着手）
  - `<BackButton href="/schedule" />`
  - _Requirements: 2.1_

- [x] 6. テストを追加する
- [x] 6.1 (P) Vitest によるユニットテストを実装する
  - `hasOverlappingSchedule`: 完全一致 / 隙間あり / 1 日重なり / 隣接 1 日空き / `excludeId` 動作 の 5 ケース以上
  - `scheduleSchema`: 正常 / startDate 過去 / endDate < startDate / 不正フォーマット
  - `isContractorOrClientRole`: contractor / client / staff / admin の 4 ケース
  - 3 つの Server Action: 正常 / Zod NG / staff 拒否 / 重複時 warning / 所有権 NG / Supabase エラー
  - Supabase クライアントを mock（Server Action 自体は mock しない、CLAUDE.md「Vitest モックのルール」遵守。`mockReset()` で onceValues queue 漏れ防止）
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.3_

- [x] 6.2 (P) pgTAP で RLS の検証テストを追加する
  - 認証ユーザー A が他ユーザー B の `available_schedules` を SELECT できる（公開閲覧）
  - A が B の行に対して INSERT / UPDATE / DELETE できない（拒否される）
  - A が自分の行に対して UPDATE / DELETE できる
  - テスト用 UUID は seed.sql と重複させないこと（CLAUDE.md ルール、未使用帯を使う）
  - _Requirements: 4.3_

- [x] 6.3 (P) Playwright による E2E テストを追加する
  - 受注者フルフロー: ログイン → マイページ「空き日程一覧」クリック → 一覧 → 追加 → 一覧反映 → 行クリックで編集 → 一覧反映 → 削除 → 一覧から消える（page.goto 直接遷移ではなく、マイページからのクリック導線を必ず含める）
  - ソフト警告: 既存日程と重複する期間を登録 → `toast.warning` 表示 + 一覧に 2 件並ぶ
  - 過去日防止: 過去日付を入力 → 送信不可
  - 過去日程の灰色表示: seed の過去日程に `text-muted-foreground` クラスが当たっていることを検証
  - Staff 三層防御: マイページに「予定を確認する」見出しが無い + `/schedule` 直叩きで `/mypage` リダイレクト
  - Owner（client ロール）の登録可: 法人 Owner で `/schedule` にアクセス → 登録できる
  - **CLI-006 表示制限**: 受注者で 5 件以上（過去・未来混在）登録 → 別ユーザー（発注者）で CLI-006 を開く → 「空き日程」セクションに直近の未来 3 件のみ表示・過去日程は表示されないことを検証
  - 既存 `e2e/mypage-navigation.spec.ts` に Staff のメニュー非表示確認を追加
  - 既存 `e2e/staff-access.spec.ts` に `/schedule` 直叩きリダイレクト確認を追加
  - 既存 `e2e/job-search.spec.ts` または新規 `e2e/contractor-schedule-display.spec.ts` に CLI-006 の表示制限検証を追加
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 5.2_

- [x] 7. 最終統合検証と機能 1 コミット化
  - `npm run test` / `supabase test db` / `npm run test:e2e` を再度実行し、全テストが pass することを確認
  - 各ロールでブラウザから手動の挙動確認:
    - 受注者: フルフロー（一覧 / 登録 / 更新 / 削除 / 重複ソフト警告）
    - 発注者 Owner（`role = 'client'`）: 受注者と同様にフルフロー可能 + 別の受注者の CLI-006 を開いて空き日程が直近 3 件以下のみ表示されることを確認
    - Staff（`role = 'staff'` の admin / staff 両方）: マイページに「予定を確認する」が無い + `/schedule` 直叩きで `/mypage` リダイレクト + curl で Server Action 直叩きを試して拒否されること
  - design-assets/screens/CON-014.png / CON-015.png / CON-016.png / CLI-006.png と実装結果を目視比較（タイトル・余白・ボタン配置・色味・角丸、CLI-006 の空き日程セクションは 3 件以下）
  - 完了後、機能単位で 1 コミットにまとめる（コミットメッセージ案: `feat(schedule): 空き日程機能の追加 + Middleware 既存バグ修正 + CLI-006 表示制限`）
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 5.2_
