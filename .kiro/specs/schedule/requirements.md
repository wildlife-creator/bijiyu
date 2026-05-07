# 空き日程機能（schedule）— 要件定義

## 概要

受注者が自分の空き日程を登録・管理する機能。発注者が職人を検索する際の参考情報となる。

## 対象画面

| 画面ID | 画面名 | 概要 |
|--------|--------|------|
| CON-014 | 空き日程一覧 | 自分の空き日程の一覧表示 |
| CON-015 | 空き日程更新 | 既存の空き日程の編集 |
| CON-016 | 空き日程登録 | 新規の空き日程の登録 |

## 対象ロール

- 受注者（Contractor）: 全機能利用可能
- 発注者（Client）: 受注者機能として利用可能

## 共通画面要件

### 画面タイトル（h1）

| 画面ID | h1 文言 |
|--------|--------|
| CON-014 | 空き日程 |
| CON-015 | 空き日程更新 |
| CON-016 | 空き日程登録 |

### 説明文（3 画面共通、タイトル直下に表示）

> 予定が空いている日程を登録すると、発注者からスカウトが届きやすくなります。

「スカウト」はこのアプリの主要なコンタクト手段（CLI-015）。受注者にとって「空き日程を登録するメリット」を具体的に伝える文言として全 3 画面で統一する。デザインカンプの原文（CON-015/016 の「ご入力ください」「声がかかりやすくなります」）からは、以下の意図で改訂:
- 「ご入力ください」→「登録すると」: 一覧画面（CON-014）と入力画面（CON-015/016）で同じ文言を使えるよう、命令形ではなく条件節に変更
- 「声がかかる」→「スカウトが届く」: アプリ実装で実際に発生する具体的アクション（スカウト機能経由のメッセージ受信）に置き換え、用語をプロダクト全体で統一

## 機能要件

### REQ-SC-001: 空き日程一覧（CON-014）

- 自分が登録した空き日程の一覧を表示する
- 表示項目: 開始日〜終了日（例: `2024/11/24〜2024/11/30`）。既存の `formatDate`（`@/lib/utils/format-date`）を流用する。CLI-006（職人詳細）の表示と完全一致するため、画面間の一貫性を確保
- 表示形式: リスト表示（カレンダー表示は将来検討）
- ソート: 開始日の昇順（直近の日程が上）
- 過去の日程（`end_date < today`）は灰色文字（`text-muted-foreground`）で表示する。並び順は変更せず開始日昇順のまま。非表示にはしない（受注者が「登録したのに消えた」と誤解しないため）
- 重複日程の警告は CON-014（一覧）には表示しない（モバイルでツールチップが効かない / レイアウト変更を避けるため。重複検知は登録/更新時のソフト警告で対応 — REQ-SC-003 参照）
- メモ欄は UI に表示しない（DB の `note` カラムは将来拡張用にスキーマ上は残す）
- 「空き日程を追加する」ボタン → CON-016 へ遷移
- 各日程クリック → CON-015 へ遷移
- 「もどる」ボタン → `/mypage` に固定遷移（履歴に依存しない。Save 後リダイレクトでブラウザ履歴に編集画面が残るため、`router.back()` を使うとループする）

### REQ-SC-002: 空き日程更新（CON-015）

- 既存の空き日程を編集する
- 編集可能フィールド: REQ-SC-003 と同一（メモは含まない）
- 現在の登録内容をフォームにプリフィルする
- 「空き日程を更新する」ボタン: フォーム送信 → 更新 → CON-014 へリダイレクト
- 「削除する」ボタン: 赤系スタイル（`variant="destructive"`）。確認ダイアログ（shadcn `<AlertDialog>`、本文「この空き日程を削除します。よろしいですか？」）→ 物理削除 → CON-014 へリダイレクト
- 「もどる」ボタン → `/schedule`（CON-014）に固定遷移（履歴に依存しない）
- 重複警告: REQ-SC-003 と同じソフト警告ロジックを適用（自分自身の編集対象行 `id` は重複判定から除外する）
- 保存成功時: CON-014（一覧）へリダイレクト

### REQ-SC-003: 空き日程登録（CON-016）

- 新規の空き日程を登録する
- 入力フィールド:
  - 開始日（必須、日付。HTML `<input type="date">` を使用。既存 `job-form.tsx` と同じ実装パターンに揃える）
  - 終了日（必須、日付、開始日以降）
  - メモ欄は表示しない（REQ-SC-001 参照）
- バリデーション（クライアント・サーバー両方で実施）:
  - 開始日は今日以降であること（HTML `min` 属性 + Zod の両方）
  - 終了日は開始日以降であること（Zod）
- 重複チェック（ソフト警告）:
  - 同じユーザーの既存空き日程と期間が重複する場合（純粋関数 `hasOverlappingSchedule` で判定。閉区間で `NOT (existing.end_date < new.start_date OR existing.start_date > new.end_date)`）、Server Action は登録を成功させた上で戻り値の `data.warning` に `"同じ期間が登録されています"` を含める
  - クライアント側で `result.success && result.data?.warning` のとき `toast.warning(result.data.warning)` を表示する（登録自体は完了している）
  - 戻り値の型は既存共通の `ActionResult<{ warning?: string }>`（`@/lib/types/action-result`）を流用する。CLAUDE.md「Server Actions」ルール（`{ success, error?, data? }` 形式）と整合させ、`warning` は `data` 内に格納
- 「空き日程を登録する」ボタン: フォーム送信
- 「もどる」ボタン → `/schedule`（CON-014）に固定遷移
- `available_schedules` テーブルにデータを保存（`note` カラムは UI 非対応のため `NULL` のまま）
- 保存成功時: CON-014（一覧）へリダイレクト

### REQ-SC-004: 関連画面の空き日程表示（CLI-006）

`schedule` 機能で登録された日程は、職人詳細画面（CLI-006）の「空き日程」セクションに反映される。受注者が大量に登録した場合に CLI-006 が縦に長く混雑するのを防ぐため、**閲覧側だけ表示制御を入れる**（登録側は無制限のまま）。

- **登録件数の上限**: 設けない（受注者は CON-016 から何件でも登録できる）
- **CON-014（受注者本人の管理画面）の表示**: 全件表示（過去含む。受注者が自分で整理できるよう「登録したのに見えない」誤解を防ぐ。詳細は REQ-SC-001 参照）
- **CLI-006（発注者から見える職人詳細）の表示**: **直近の未来 3 件のみ**
  - クエリ条件: `WHERE end_date >= today ORDER BY start_date ASC LIMIT 3`
  - 過去日程（`end_date < today`）は完全に除外（発注者にとって判断材料にならない情報のため）
  - 未来 3 件未満（例: 0 件・1 件・2 件）の場合はその件数だけ表示
  - 未来 0 件のとき、「空き日程」セクションごと非表示（既存実装の `schedules.length > 0` 条件で対応）
  - 「もっと見る」リンクは設けない（直近 3 件で発注判断は可能。デザインカンプ CLI-006.png 準拠）
- **役割分担の理由**: CON-014 は「自己管理用、全件見える」/ CLI-006 は「発注者の判断用、直近の必要情報だけ見える」という別目的の画面なので、表示が違うのは合理的
- **Non-Goal（明示）**: CLI-006 の他のセクション（基本情報・能力・発注者評価等）には変更を加えない。schedule 機能スコープでの修正は「空き日程セクションのクエリ」のみ

## 非機能要件

### セキュリティ

- **データアクセス（RLS、既存マイグレーション 003 で適用済み）**:
  - SELECT: 全認証ユーザーが閲覧可能（発注者が職人の空き日程を CLI-006 で確認する用途）
  - INSERT / UPDATE / DELETE: `user_id = auth.uid()` のみ（自分の日程のみ書き込み可能）

- **ロール別アクセス制御（三層防御 — 必ず守ること）**:
  許可ロール: `users.role IN ('contractor', 'client')`。`'staff'` は不可（`org_role` が `admin` でも `staff` でも同じ。担当者は受注者活動を行わない設計。詳細は `roles-and-permissions.md` / CLAUDE.md「担当者の受注者アクション制限」参照）
  - 第 1 層（UI）: マイページ（`src/app/(authenticated)/mypage/page.tsx`）で staff には「予定を確認する」セクション全体を非表示にする（`{!isStaff && (<section>...</section>)}`）。「応募履歴」も同セクション内のため同時に非表示になる（staff は応募できないので整合）
  - 第 2 層（Middleware）: `src/middleware.ts` の staff ガード対象を `/availability`（存在しないパス、既存バグ）から `/schedule` に修正する。staff が `/schedule*` にアクセスしたら `/mypage` にリダイレクト
  - 第 3 層（Server Action）: `createScheduleAction` / `updateScheduleAction` / `deleteScheduleAction` で `userData.role === 'staff'` の場合は早期 return で `{ success: false, error: "この操作は実行できません" }` を返す

- **法人 Owner（`role = 'client'`）の扱い**: 登録可能。Owner 自身は受注者活動も可能（"1 アカウントで受発注両方" の設計方針通り、CLAUDE.md「ロール設計と画面アクセス」参照）

### バリデーション

- 全フォーム入力に Zod スキーマ（`src/lib/validations/schedule.ts`）。クライアント・サーバー両方で同じスキーマを使用
- 日付の `min` 属性（HTML5）と Zod の両方で過去日入力を防ぐ（防御多層化）

### テスト戦略

- 書き込み + 権限系のためフルテスト対象（CLAUDE.md「テスト」セクション参照）
- ユニット（Vitest）: 各 Server Action の正常系 / 異常系（他人の `id` を書き換え試行、staff ロール拒否、日付バリデーション、重複検知）
- pgTAP: RLS の SELECT 全員可 / INSERT・UPDATE・DELETE 自分のみ
- E2E（Playwright）:
  - 受注者でログイン → mypage → /schedule → 登録 → 一覧反映 → 更新 → 削除のフルフロー（クリック導線必須）
  - staff ロールで `/schedule` 直叩きが `/mypage` にリダイレクトされる検証（三層防御の Middleware 層）
  - **REQ-SC-004 検証**: 受注者で 5 件以上（過去・未来混在）登録 → 発注者で CLI-006 を開く → 「空き日程」セクションに直近の未来 3 件のみ表示・過去日程は表示されないことを確認
- pgTAP テストの UUID は seed.sql と重複させない（CLAUDE.md ルール）

## 画面遷移

```
CON-001（マイページ）→ CON-014（一覧）→ CON-015（更新）
                                       → CON-016（登録）
```

## 関連テーブル

- available_schedules: 空き日程（CRUD）

## 関連 steering

- `database-schema.md`: `available_schedules` テーブル（start_date, end_date 形式）と RLS ポリシー
- `roles-and-permissions.md`: 担当者（Staff/Admin）の受注者アクション制限。CON-014〜016 はアクセス不可
- `design-rule.md`: CLI-006「空き日程」セクションのレイアウト（PC で発注者評価と横並び `md:grid-cols-2`）
- `CLAUDE.md`:
  - 「ロール設計と画面アクセス」: 1 アカウントで受発注両方の設計
  - 「担当者（staff）の受注者アクション制限」: 三層防御の必須ルール
  - 「BackButton の `href` 明示の例外パターン」: Save → 親画面リダイレクト時のループ対策

## 関連デザインカンプ

- `design-assets/screens/CON-014.png`（一覧、SP のみ）
- `design-assets/screens/CON-015.png`（更新、SP のみ）
- `design-assets/screens/CON-016.png`（登録、SP のみ）

※ PC 版デザインは無いため、SP デザインを基準にレスポンシブ実装する（`design-system.md` のブレークポイント方針に従う）。
※ デザインカンプ準拠で確定した項目: メモ欄なし、日付フォーマットは曜日なし（既存 `formatDate` 流用、`YYYY/MM/DD` 形式）、CTA ラベル「空き日程を追加する/更新する/登録する」、戻るボタンは「もどる」（ひらがな）、CLI-006 の表示は直近の未来 3 件のみ。

## 既存実装の事前修正（schedule 機能と同一スコープ）

schedule 実装と同時に以下 3 つの既存修正も同一スコープで行う（依存関係上、分離するとリグレッション・UX 不整合の原因になる）:

1. **Middleware `/availability` 誤記の修正**: `src/middleware.ts:443` の `pathname.startsWith("/availability")` を `pathname.startsWith("/schedule")` に変更（前述 第 2 層 防御）
2. **マイページのメニュー出し分け**: `src/app/(authenticated)/mypage/page.tsx:574-580` の Section 2 を `{!isStaff && (<section>...</section>)}` で囲む（前述 第 1 層 防御）
3. **CLI-006（職人詳細）の空き日程クエリ修正**: `src/app/(authenticated)/users/contractors/[id]/page.tsx` の `available_schedules` SELECT に `.gte("end_date", todayIso)` と `.limit(3)` を追加（REQ-SC-004 の表示制限）

## 未確認事項

なし（実装着手前のヒアリングで全項目決定済み — 2026-04-28）
