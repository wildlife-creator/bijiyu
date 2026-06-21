# Implementation Plan — appwide-ui-consistency（アプリ全体 UI 統一・改訂版）

> 対応デザインカンプ: なし（既存全画面の max-w / chrome 統一作業のため、新規カンプ無し）。
> 軽量 spec（option B）として `design.md` は省略済み。設計判断は `requirements.md` 上部「確定済み設計判断」セクションで完結。
> **本タスクの主要なリスクは「2 段ラッパー構造化」と「Client Component 再構造化」**。max-w 適用だけの単純作業ではないので、慎重に進める。
> 詳細な振り分け（53 ページの max-w / chrome の現状と変更後）は `requirements.md` REQ-1.6 早見表を参照。

---

- [x] 0. 既存テストの全実行とデグレ確認
  - `npm run test`（Vitest）・`supabase test db`（pgTAP）・`npm run test:e2e`（Playwright）を順に実行し、全てパスすることを確認する
  - 失敗がある場合は原因を調査・修正してから実装に着手する（本タスクは表示層のみの変更だが、ベースラインを緑にしてから着手する原則は守る）
  - _Requirements: REQ-7 テスト面_

---

## フェーズ 1: 共通基盤の準備（BackButton + utility class + サブグリッド）

- [x] 1. BackButton 内部 className のデフォルト変更
  - `src/components/shared/back-button.tsx` の Button className を変更:
    - 現状: `cn("w-full rounded-pill text-body-md", className)`
    - 変更後: `cn("mx-auto w-full max-w-xs rounded-pill text-body-md", className)`
  - これにより、callers 側で className 上書きしていない 13 箇所も自動的に 320px 幅・中央寄せになる
  - 既存の `className="w-full max-w-xs"` を明示している 14 箇所は冗長化するが本 PR では撤去しない（互換維持）
  - _Requirements: REQ-2_

- [x] 2. schedule 系画面の `size="lg"` 削除（Task 3 の前提）
- [x] 2.1 `src/app/(authenticated)/schedule/page.tsx` の `<BackButton href="/mypage" size="lg" />` から `size="lg"` を削除
- [x] 2.2 `src/app/(authenticated)/schedule/new/page.tsx` の `<BackButton href="/schedule" size="lg" />` から `size="lg"` を削除
- [x] 2.3 `src/app/(authenticated)/schedule/[id]/edit/page.tsx` の `<BackButton href="/schedule" size="lg" />` から `size="lg"` を削除
  - _Requirements: REQ-4_

- [x] 3. BackButton から size prop インターフェース削除
  - Task 2 完了後に実施。`BackButtonProps` から `size?: "default" | "lg"` を削除し、`<Button>` への `size={size}` 渡しも削除
  - 順序逆だと schedule 3 画面で型エラーになるため Task 2 を必ず先に
  - _Requirements: REQ-2_

- [x] 4. `bleed-viewport` utility class を globals.css に追加
  - `src/app/globals.css` の `@layer utilities { ... }` に追加（既存 `@layer utilities` が無ければ新設）:
    ```css
    @layer utilities {
      .bleed-viewport {
        margin-inline: calc(50% - 50vw);
        padding-inline: calc(50vw - 50%);
      }
    }
    ```
  - 用途: max-w 制約された親の中で、子セクションを viewport edge まで広げる full-bleed テクニック
  - 現状の `@layer base` 2 箇所と重複しないよう、別の `@layer utilities` ブロックとして追加する
  - _Requirements: REQ-3.2_

- [x] 5. CON-006「掲載中の案件」サブグリッドと bleed-viewport 適用
- [x] 5.1 サブグリッドを 2 列止まりに変更
  - `src/app/(authenticated)/clients/[id]/page.tsx` の「掲載中の案件」 grid の className を変更:
    - 現状: `mt-2 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3`
    - 変更後: `mt-2 grid grid-cols-1 gap-6 md:grid-cols-2`（`lg:grid-cols-3` 削除）
  - _Requirements: REQ-3.1_
- [x] 5.2 セクションを viewport edge まで延ばす
  - 同ファイルの「掲載中の案件」 section の className を変更:
    - 現状: `mt-6 -mx-4 px-4 py-6 bg-muted md:-mx-8 md:px-8`
    - 変更後: `mt-6 bleed-viewport py-6 bg-muted`
  - これにより `max-w-4xl` ページ内でもグレー帯が viewport edge まで届く
  - _Requirements: REQ-3.2_

---

## フェーズ 2: Client Component の再構造化（5 ファイル・難易度高）

> 以下の 5 つの Client Component は page chrome（min-h-dvh bg-muted 等の外殻）を所有している。
> chrome を page.tsx 側に移し、Client Component は **内容のみ render** する形に再構造化する。
> 各タスクは page.tsx 側の 2 段ラッパー新設と同時にやる必要があるため、組で実装する。

- [x] 6. profile/edit (COM-002 プロフィール編集) の再構造化
- [x] 6.1 `profile-edit-form.tsx` から page chrome を撤去
  - line 414 の外殻 `<div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">` を撤去
  - line 420 banner `<p>` から `mx-auto max-w-2xl` を撤去（その他クラスは保持: `mt-4 text-body-sm text-destructive`）
  - line 425-427 form `<form>` から `mx-auto max-w-2xl` を撤去（`mt-6 space-y-6` は保持）
  - 結果として form の最上位は `<h1>` `<p>` `<form>` の 3 兄弟になる（or 適宜 Fragment / div でラップ）
  - _Requirements: REQ-5_
- [x] 6.2 `profile/edit/page.tsx` に 2 段ラッパー新設
  - `<ProfileEditForm ... />` 単体 return を以下に変更:
    ```jsx
    <div className="min-h-dvh bg-muted">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
        <ProfileEditForm ... />
      </div>
    </div>
    ```
  - _Requirements: REQ-1.2, REQ-1.4_

- [x] 7. billing (課金管理トップ) の再構造化
- [x] 7.1 `BillingClient.tsx` から page chrome を撤去
  - line 351 外殻 `<div className="min-h-screen bg-muted">` を撤去
  - line 352 内側 `<div className="mx-auto max-w-lg px-4 py-6">` を撤去（`py-6` 相当の vertical 余白は内側ラッパーで吸収済み）
  - `py-6` の content-specific な余白が必要な内部セクションがあれば適切な位置に移す
  - _Requirements: REQ-5_
- [x] 7.2 `billing/page.tsx` に 2 段ラッパー新設
  - `<BillingClient ... />` 単体 return を以下に変更:
    ```jsx
    <div className="min-h-screen bg-muted">
      <div className="mx-auto w-full max-w-lg px-4 py-6 md:px-8 md:py-8">
        <BillingClient ... />
      </div>
    </div>
    ```
  - _Requirements: REQ-1.2, REQ-1.4_

- [x] 8. profile/withdrawal (COM-006 退会) の再構造化
- [x] 8.1 `withdrawal-form.tsx` から **外側と内側の両方** のラッパーを撤去
  - line 89 の **外側** `<div className="px-4 py-6 md:px-8 md:py-8">` を撤去（padding は page.tsx の内側ラッパーで吸収）
  - line 90 の **内側** `<div className="mx-auto max-w-lg space-y-6">` から `mx-auto max-w-lg` を撤去（`space-y-6` は保持）
  - 結果として form 内容は `space-y-6` のみのラッパーに直接配置される（h1 を含むトップレベルは `<Fragment>` または `<>` で囲む）
  - _Requirements: REQ-5_
- [x] 8.2 `profile/withdrawal/page.tsx` に 2 段ラッパー新設
  - `<WithdrawalForm ... />` 単体 return を以下に変更:
    ```jsx
    <div className="min-h-dvh bg-muted">
      <div className="mx-auto w-full max-w-lg px-4 py-6 md:px-8 md:py-8">
        <WithdrawalForm ... />
      </div>
    </div>
    ```
  - _Requirements: REQ-1.2, REQ-1.4_

- [x] 9. messages/bulk-send (CLI-014 一斉送信) の再構造化
- [x] 9.1 `bulk-send-form.tsx` から page chrome を撤去
  - line 74 外殻 `<div className="min-h-screen bg-muted/40">` を撤去（`bg-muted/40` の薄いグレーは保持して page.tsx 側へ移す）
  - line 75 内側 `<div className="mx-auto max-w-2xl px-4">` を撤去
  - _Requirements: REQ-5_
- [x] 9.2 `messages/bulk-send/page.tsx` に 2 段ラッパー新設
  - 既存の `<BulkSendForm ... />` の上に以下を新設:
    ```jsx
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
        <BulkSendForm ... />
      </div>
    </div>
    ```
  - **既存の `bg-muted/40`（透明度 40%）はそのまま保持**（標準の `bg-muted` ではない）
  - _Requirements: REQ-1.2, REQ-1.4_

- [x] 10. messages/scout-send (CLI-015 スカウト送信) の再構造化
- [x] 10.1 `scout-send-form.tsx` から page chrome を撤去
  - line 114 外殻 `<div className="min-h-screen bg-muted/40">` を撤去
  - line 115 内側 `<div className="mx-auto max-w-2xl px-4">` を撤去
  - _Requirements: REQ-5_
- [x] 10.2 `messages/scout-send/page.tsx` に 2 段ラッパー新設
  - Task 9.2 と同じパターン:
    ```jsx
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
        <ScoutSendForm ... />
      </div>
    </div>
    ```
  - _Requirements: REQ-1.2, REQ-1.4_

---

## フェーズ 3: 6xl カテゴリ適用（カード 3 列グリッド一覧）— 7 画面

> 各 page.tsx の最上位 div を 2 段ラッパー構造に書き換える。
> 既存パターン別に変換手順が変わるので、`requirements.md` REQ-1.4 表を参照。

- [x] 11. 6xl カテゴリ各画面の 2 段ラッパー化
- [x] 11.1 `jobs/search/page.tsx`（CON-002 募集案件一覧、P2）
  - 現状: `<div className="min-h-dvh bg-muted">` 内に直接 content
  - 変更後: 外側 `<div className="min-h-dvh bg-muted">` 維持、内側 `<div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">` を新設
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 11.2 `clients/page.tsx`（CON-005 発注者一覧、P2）
  - 11.1 と同じパターン
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 11.3 `favorites/page.tsx`（CON-007 マイリスト、P2）
  - 11.1 と同じパターン
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 11.4 `applications/history/page.tsx`（CON-011 応募履歴一覧、P1）
  - 現状: `<div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">` 内に直接 content
  - 変更後: 外側 `<div className="min-h-dvh bg-muted">` に分離（padding 撤去）、内側 `<div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">` を新設
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 11.5 `jobs/manage/page.tsx`（CLI-001 募集現場一覧、P1-variant）
  - 現状: `<div className="min-h-dvh bg-muted px-6 py-6 md:px-12 md:py-8">` 内に直接 content
  - 変更後: 外側 `<div className="min-h-dvh bg-muted">`（padding 全撤去）、内側 `<div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">`（**標準余白に統一・REQ-1.5**）
  - _Requirements: REQ-1.2, REQ-1.4, REQ-1.5_
- [x] 11.6 `users/contractors/page.tsx`（CLI-005 ユーザー一覧、P2）
  - 11.1 と同じパターン
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 11.7 `applications/received/page.tsx`（CLI-007 応募一覧 mypage 導線、P1 + 内部 grid に max-w-6xl）
  - 現状: 外側 P1 + 内部 grid に `mx-auto mt-4 max-w-6xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`
  - 変更後: 外側 `<div className="min-h-dvh bg-muted">`、内側 `<div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">`、内部 grid の `mx-auto max-w-6xl` は撤去（重複）
  - _Requirements: REQ-1.2, REQ-1.4, REQ-6_

---

## フェーズ 4: 4xl 詳細カテゴリ適用 — 15 画面

- [x] 12. 4xl 詳細カテゴリ各画面の 2 段ラッパー化
- [x] 12.1 `jobs/[id]/page.tsx`（CON-003 募集案件詳細 / CLI-002 募集現場詳細）
  - **重要: このファイルは 2 つの主要 return を持つ。両方を同じパターンで変換すること**:
    - line 187: CLI-002 manage 表示（`isManageView === true` 分岐、`<div className="min-h-dvh px-4 py-6 md:px-8 md:py-8">`）
    - line 458: CON-003 表示（通常分岐、同パターン）
  - 現状: **P3（白）** — `min-h-dvh px-4 py-6 md:px-8 md:py-8`（bg-muted なし）
  - 変換: 外側 `<div className="min-h-dvh">`（**bg-muted なし、白維持・REQ-1.3 例外**）、内側 `<div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">`
  - 画像サムネ `md:grid-cols-4` 維持（4xl 内で 1 サムネ ≈ 210px、適切）
  - 既存の sticky 応募ボタン（line 650 付近の `<div className="sticky bottom-0 bg-background py-4 mt-6 border-t border-border">`）は内側に残る。PC で「ボタン横幅が 4xl 内に収まる」点を実機 QA で確認
  - _Requirements: REQ-1.2, REQ-1.3, REQ-1.4_
- [x] 12.2 `clients/[id]/page.tsx`（CON-006 発注者詳細、P3 白背景）
  - **Task 5.1 / 5.2（サブグリッド変更と bleed-viewport 適用）と同じファイル**。先に Task 5 を済ませる
  - 変換: 外側 `<div className="min-h-dvh">`（**bg-muted なし、白維持・REQ-1.3 例外**）、内側 `<div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">`
  - _Requirements: REQ-1.2, REQ-1.3, REQ-1.4, REQ-3_
- [x] 12.3 `messages/[threadId]/page.tsx`（CON-009 メッセージ詳細、P4）
  - 現状: `<div className="flex min-h-screen flex-col bg-[#F0F0F0]">` 内に MessageHeader + MessageThreadView
  - 変更後（**flex-1 が必須**）: 外側 `<div className="flex min-h-screen flex-col bg-[#F0F0F0]">`（**特殊カラー維持 + flex flex-col 維持**）、内側 `<div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6 md:px-8 md:py-8">`（**flex-1 で外側の flex container 内で残りの高さを取る**）
  - **重要**: `flex-1` がないと内側 div の高さが「auto」になり、MessageThreadView が viewport を埋めず、入力欄が画面下に固定されない（チャット UI が崩れる）
  - chat UI の高さ・吹き出し配置・入力欄が崩れないか実機 QA で確認（Task 17.2 で）
  - _Requirements: REQ-1.2, REQ-1.3, REQ-1.4_
- [x] 12.4 `applications/history/[id]/page.tsx`（CON-012 応募詳細、P1-variant）
  - 外側 `<div className="min-h-dvh bg-muted">`（padding 全撤去・標準化）、内側 `<div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">`
  - _Requirements: REQ-1.2, REQ-1.4, REQ-1.5_
- [x] 12.5 `users/contractors/[id]/page.tsx`（CLI-006 ユーザー詳細、P2）
  - 外側 `<div className="min-h-dvh bg-muted">` 維持、内側 `<div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">`
  - 既存の `md:flex-row` 2 列セクション（line 338 付近）は維持（4xl 内で 1 列 ≈ 420px、余裕あり）
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 12.6 `applications/received/[id]/page.tsx`（CLI-008 応募詳細・発注者側、**P6 単一 div 全部入り**）
  - 現状: line 177 で `<div className="mx-auto min-h-dvh max-w-2xl bg-muted px-4 py-6 md:px-8 md:py-8">` の単一 div に全部入り（**PC では bg-muted が max-w-2xl 内に閉じ込められて中央の細いグレー帯になっていた**）
  - 変換: 既存の単一 div を 2 段に分割
    - 外側 `<div className="min-h-dvh bg-muted">`（mx-auto と max-w を抜き、min-h と bg-muted のみ残す）
    - 内側 `<div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">`（widen 2xl→4xl、mx-auto と padding を内側に集約）
  - 本変換で **初めて bg-muted が viewport 端まで広がる**（既存はグレー帯が中央 672px のみ）。実機 QA で意図通りか確認
  - _Requirements: REQ-1.2, REQ-1.4, REQ-6_
- [x] 12.7 `applications/orders/[id]/page.tsx`（CLI-011 発注履歴詳細、P1-variant）
  - 外側 `<div className="min-h-dvh bg-muted">`（padding 全撤去・標準化）、内側 `<div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">`
  - _Requirements: REQ-1.2, REQ-1.4, REQ-1.5_
- [x] 12.8 `messages/templates/[id]/page.tsx`（CLI-017 スカウトテンプレ詳細、P1）
  - 外側 `<div className="min-h-dvh bg-muted">`（padding 撤去）、内側 `<div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">`
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 12.9 `mypage/client-profile/page.tsx`（CLI-020 発注者情報詳細、P1）
  - 12.8 と同パターン
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 12.10 `mypage/members/[id]/page.tsx`（CLI-023 担当者詳細、P1）
  - 12.8 と同パターン
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 12.11 `billing/plans/page.tsx`（CLI-026 有料プラン案内、**既に 2 段構造**）
  - 現状: line 90 外側 `<div className="min-h-screen bg-muted">` + line 91 内側 `<div className="mx-auto max-w-4xl px-4 py-6">` (**既に正しい 2 段構造**)
  - 変換: **最小変更で標準化のみ**
    - 外側 `<div className="min-h-screen bg-muted">` はそのまま（`min-h-screen` は他ページの `min-h-dvh` と微妙に違うが本タスクでは保持）
    - 内側に **`w-full` 追加 + `md:px-8 md:py-8` 追加** で標準化: `<div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">`
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 12.12 `users/[id]/reviews/page.tsx`（CLI-028 発注者評価、**P1**）
  - 外側 `<div className="min-h-dvh bg-muted">` 維持（padding 撤去）、内側 `<div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">`
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 12.13 `profile/page.tsx`（COM-001 プロフィール詳細、P1）
  - 外側 `<div className="min-h-dvh bg-muted">`（padding 撤去）、内側 `<div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">`
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 12.14 `profile/verification/page.tsx`（COM-003 本人確認・CCUS登録申請、**P5 → bg-muted 化**）
  - 現状: line 83 で `<div className="px-4 py-6 md:px-8 md:py-8">` のみ（**min-h なし、bg-muted なし、現状白**）
  - 変換: **外側を新設**してグレー化（ユーザー判断、白→グレー）
    - 外側 `<div className="min-h-dvh bg-muted">` を **新設**（min-h と bg-muted を付与）
    - 内側 `<div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">` を新設
    - 既存の外側 `px-4 py-6 md:px-8 md:py-8` は撤去
  - 本変換で **背景が白からグレー（bg-muted）に変わる**。COM-004/005 と合わせて本人確認系 3 ページ統一
  - _Requirements: REQ-1.2, REQ-1.3, REQ-1.4_
- [x] 12.15 `mypage/job-inquiries/[id]/page.tsx`（COM-015 求人問い合わせ受信箱詳細、P3-variant 白）
  - 現状: `<div className="min-h-dvh px-4 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">` 内に直接 content
  - 変更後: 外側 `<div className="min-h-dvh">`（**bg-muted なし、白維持・REQ-1.3 例外**）、内側 `<div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">`（widen 2xl→4xl、md: prefix 削除）
  - _Requirements: REQ-1.2, REQ-1.3, REQ-1.4_

---

## フェーズ 5: 4xl 1 列リストカテゴリ適用 — 8 画面

- [x] 13. 4xl 1 列リストカテゴリ各画面の 2 段ラッパー化
- [x] 13.1 `mypage/page.tsx`（CON-001 マイページ、P1、複数 return あり）
  - **対象は line 365 の主要 page render** に限定: `<div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">`
  - **line 105 / 121 等の return は helper component（MenuList 等）のもので、触らない**
  - line 365 の return を 2 段ラッパー化: 外側 `<div className="min-h-dvh bg-muted">`、内側 `<div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">`
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 13.2 `messages/page.tsx`（CON-008 メッセージ/スカウト一覧、P1 内部 max-w-2xl）
  - 外側 `<div className="min-h-dvh bg-muted">` 維持、内側 `<div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">`（widen 2xl→4xl）
  - 内部 `max-w-2xl` 撤去
  - _Requirements: REQ-1.2, REQ-1.4, REQ-6_
- [x] 13.3 `schedule/page.tsx`（CON-014 空き日程一覧、P1）
  - 外側 `<div className="min-h-dvh bg-muted">`（padding 撤去）、内側 `<div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">`
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 13.4 `jobs/[id]/applicants/page.tsx`（CLI-007B 案件応募者一覧、**P1**）
  - 現状: line 154 で `<div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">` (P1)
  - 変換: 外側 `<div className="min-h-dvh bg-muted">` 維持（padding 撤去）、内側 `<div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">`
  - **注意: line 160 付近の `<div className="mx-auto mt-4 max-w-2xl rounded-[8px] border border-border bg-background p-4">` は status filter UI 用の意図的な装飾枠。一般 cleanup ルール「内部 max-w 撤去」に引っ張られて誤撤去しないこと**（保持）
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 13.5 `applications/orders/page.tsx`（CLI-010 発注履歴一覧、P1）
  - 13.3 と同パターン
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 13.6 `messages/templates/page.tsx`（CLI-016 スカウトテンプレ一覧、P1）
  - 13.3 と同パターン
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 13.7 `mypage/members/page.tsx`（CLI-022 担当者一覧、P1、複数 return）
  - 13.1 と同様にメインの page render の return を 2 段ラッパー化
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 13.8 `mypage/job-inquiries/page.tsx`（COM-014 求人問い合わせ受信箱一覧、P1 内部 max-w-3xl）
  - 外側 `<div className="min-h-dvh bg-muted">` 維持、内側 `<div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">`（slight widen 3xl→4xl）
  - 内部 `max-w-3xl` 撤去
  - _Requirements: REQ-1.2, REQ-1.4, REQ-6_

---

## フェーズ 6: 2xl フォームカテゴリ適用 — 20 画面

> このうち 5 つ（CLI-014、CLI-015、COM-002、CLI-021 を含む）は Client Component に委譲。Task 6〜10 で対応済（フェーズ 2）。
> 本フェーズはそれら以外の 15 画面 + CLI-021（page.tsx の 2 段ラッパー新設のみ）= 16 画面。

- [x] 14. 2xl フォームカテゴリ各画面の 2 段ラッパー化
- [x] 14.1 `jobs/[id]/apply/page.tsx`（CON-004 応募情報入力、P3 白）
  - 現状: `<div className="min-h-dvh px-4 py-6 md:px-8 md:py-8">` 内に直接 content
  - 変更後: 外側 `<div className="min-h-dvh">`（**bg-muted なし、白維持・REQ-1.3 例外**）、内側 `<div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">`
  - _Requirements: REQ-1.2, REQ-1.3, REQ-1.4_
- [x] 14.2 `applications/history/[id]/report/page.tsx`（CON-013 作業報告・評価入力、P1）
  - 外側 `<div className="min-h-dvh bg-muted">`（padding 撤去）、内側 `<div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">`
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 14.3 `schedule/[id]/edit/page.tsx`（CON-015 空き日程更新、P1）
  - 14.2 と同パターン
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 14.4 `schedule/new/page.tsx`（CON-016 空き日程登録、P1）
  - 14.2 と同パターン
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 14.5 `jobs/[id]/edit/page.tsx`（CLI-003 募集現場編集、P3-variant 白）
  - 現状: `<div className="min-h-dvh px-4 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">` 内に直接 content
  - 変更後: 外側 `<div className="min-h-dvh">`（**bg-muted なし、白維持**）、内側 `<div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">`（md: prefix 削除）
  - _Requirements: REQ-1.2, REQ-1.3, REQ-1.4, REQ-6_
- [x] 14.6 `jobs/create/page.tsx`（CLI-004 募集現場新規登録、P3-variant 白）
  - 14.5 と同パターン
  - _Requirements: REQ-1.2, REQ-1.3, REQ-1.4, REQ-6_
- [x] 14.7 `applications/received/[id]/decide/page.tsx`（CLI-009 発注可否、**P6 単一 div 全部入り**）
  - 現状: line 106 で `<div className="mx-auto min-h-dvh max-w-2xl bg-muted px-4 py-6 md:px-8 md:py-8">` の単一 div 全部入り（**PC では bg-muted が max-w-2xl 内に閉じ込められて中央の細いグレー帯になっていた**）
  - 変換: 既存の単一 div を 2 段に分割
    - 外側 `<div className="min-h-dvh bg-muted">`
    - 内側 `<div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">`
  - 本変換で **初めて bg-muted が viewport 端まで広がる**（既存はグレー帯が中央 672px のみ）。実機 QA で意図通りか確認
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 14.8 `applications/orders/[id]/report/page.tsx`（CLI-012 作業完了/失注報告、P1）
  - 14.2 と同パターン
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 14.9 `messages/templates/[id]/edit/page.tsx`（CLI-018 テンプレート編集、P1）
  - 14.2 と同パターン
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 14.10 `messages/templates/new/page.tsx`（CLI-019 テンプレート新規作成、P1）
  - 14.2 と同パターン
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 14.11 `mypage/client-profile/edit/page.tsx`（CLI-021 発注者情報編集、**P1 - page.tsx 自身が chrome を持つ**）
  - 現状: line 153 で page.tsx 自身が `<div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">` を持つ（Delegated ではない）
  - 変換: 外側 `<div className="min-h-dvh bg-muted">` 維持（padding 撤去）、内側 `<div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">`
  - ClientProfileEditForm 側は元々外殻なし（`<form className="space-y-6">` のみ）のため変更不要
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 14.12 `mypage/members/[id]/edit/page.tsx`（CLI-024 担当者編集、P1）
  - 14.2 と同パターン
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 14.13 `mypage/members/new/page.tsx`（CLI-025 担当者新規作成、P1）
  - 14.2 と同パターン
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 14.14 `profile/verification/identity/page.tsx`（COM-004 公的証明書・本人顔写真送付、**P5 → bg-muted 化**）
  - 現状: line 68 で `<div className="px-4 py-6 md:px-8 md:py-8">` のみ（**min-h なし、bg-muted なし、現状白**）
  - 変換: **外側を新設**してグレー化（ユーザー判断、白→グレー）
    - 外側 `<div className="min-h-dvh bg-muted">` を **新設**
    - 内側 `<div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">` を新設
    - 既存の外側 `px-4 py-6 md:px-8 md:py-8` は撤去
  - 本変換で **背景が白からグレー（bg-muted）に変わる**
  - _Requirements: REQ-1.2, REQ-1.3, REQ-1.4_
- [x] 14.15 `profile/verification/ccus/page.tsx`（COM-005 CCUS技術者ID・本人確認番号入力、**P5 → bg-muted 化**）
  - 現状: line 62 で `<div className="px-4 py-6 md:px-8 md:py-8">` のみ（同上、現状白）
  - 変換: 14.14 と同パターン（外側 `min-h-dvh bg-muted` を新設、内側 `max-w-2xl` ラッパーを新設、既存 padding 撤去）
  - 本変換で **背景が白からグレー（bg-muted）に変わる**
  - _Requirements: REQ-1.2, REQ-1.3, REQ-1.4_
- [x] 14.16 `trouble-report/page.tsx`（COM-012 トラブル報告、P3-variant 白）
  - 14.5 と同パターン（md: prefix 削除、白維持）
  - _Requirements: REQ-1.2, REQ-1.3, REQ-1.4, REQ-6_
- [x] 14.17 `clients/[id]/inquiry/page.tsx`（COM-013 求人へのお問い合わせ、P3-variant 白）
  - 14.5 と同パターン
  - _Requirements: REQ-1.2, REQ-1.3, REQ-1.4, REQ-6_

> **Note**: CLI-014（messages/bulk-send）、CLI-015（messages/scout-send）、COM-002（profile/edit）、COM-006（profile/withdrawal）は Task 6〜10（フェーズ 2）で対応済。

---

## フェーズ 7: lg 特例カテゴリ

> 課金管理トップと退会は Task 7（フェーズ 2）と Task 8（フェーズ 2）で対応済。
> 本フェーズは確認タスクのみ。

- [x] 15. lg 特例カテゴリの完了確認
- [x] 15.1 `billing/page.tsx`（課金管理トップ）が Task 7 で 2 段ラッパー化済み
  - _Requirements: REQ-1.2, REQ-1.4_
- [x] 15.2 `profile/withdrawal/page.tsx`（COM-006 退会手続き）が Task 8 で 2 段ラッパー化済み
  - _Requirements: REQ-1.2, REQ-1.4_

---

## フェーズ 8: 適用対象外確認

- [x] 16. 適用対象外の確認
- [x] 16.1 `messages/new/page.tsx` に変更を加えないこと確認
  - redirect のみで JSX 描画なし、`redirect()` 呼び出しで終了
  - max-w 適用不要、BackButton 配置なし
  - _Requirements: REQ-1.6「適用対象外」_

---

## フェーズ 9: 実機 QA（手動テスト・本タスクの主要品質担保）

- [ ] 17. 主要画面の実機 QA（ユーザー側手動 QA 要）
  - 4 つの viewport で各カテゴリ代表画面の見た目を確認:
    - **PC 1440px** MacBook Pro 標準サイズ
    - **PC 1920px** FHD
    - **iPad 1024px** tablet
    - **SP 375px** iPhone
- [ ] 17.1 6xl カテゴリ
  - CLI-005 ユーザー一覧: PC 1440px で **カード 3 列、1 カード幅 340-360px**。グレー bg が viewport edge まで届く
  - CON-002 募集案件一覧: 同上
  - _Requirements: REQ-7 実機 QA 面_
- [ ] 17.2 4xl 詳細カテゴリ
  - CLI-006 ユーザー詳細: PC で md:flex-row 2 列セクション（空き日程 / 発注者評価）が **1 列 ≈ 420px** で表示
  - CON-006 発注者詳細: 「掲載中の案件」が **2 列まで、1 カード ≈ 420px**。**グレー帯は viewport edge まで届く**（bleed-viewport 動作確認）。**ページ本体は白背景**
  - CON-009 メッセージ詳細: chat UI（吹き出し配置・入力欄・スレッドヘッダー）が崩れない
  - _Requirements: REQ-7 実機 QA 面_
- [ ] 17.3 4xl 1 列リストカテゴリ
  - CON-001 マイページ: 896px 中央寄せ。グレー bg が viewport edge まで届く
  - CON-008 メッセージ一覧: 同上
  - _Requirements: REQ-7 実機 QA 面_
- [ ] 17.4 2xl フォームカテゴリ
  - CLI-021 発注者情報編集: 672px 幅の中央寄せフォーム
  - COM-002 プロフィール編集: 同上、ProfileEditForm 再構造化後のレイアウト崩れなし、banner も適切に表示
  - CLI-003 募集現場編集 / COM-012 トラブル報告: **白背景**のまま中央寄せ
  - _Requirements: REQ-7 実機 QA 面_
- [ ] 17.5 lg 特例カテゴリ
  - 課金管理トップ: 512px 中央寄せ。グレー bg が viewport edge まで届く。BillingClient 内部のセクション余白が崩れない
  - COM-006 退会: 同上、フォーム要素が 512px で集中して見える
  - _Requirements: REQ-7 実機 QA 面_
- [ ] 17.6 BackButton 統一確認
  - 各カテゴリ代表画面で「もどる」ボタンが **すべて 320px 幅で中央寄せ** に見える
  - schedule 3 画面のもどるボタン高さが他画面の default サイズと同じ
  - 既存の `<BackButton className="w-full max-w-xs" />` 等の callers と素の `<BackButton />` が同じ見た目になる
  - _Requirements: REQ-2, REQ-4, REQ-7 実機 QA 面_
- [ ] 17.7 全画面横断確認
  - **SP 375px**: max-w が効かず（viewport < 各 max-w 値）、レイアウトが現状から変わらない
  - **iPad 1024px**: 6xl カテゴリの 3 列カードグリッドが破綻しない
  - **PC 1440px / 1920px の両方**: グレー bg / 白 bg の境界が意図通りで、左右の白い帯が出ない（C1 問題が解消されている）
  - **白背景 8 ページ**（CON-004 / CON-006 / CLI-003 / CLI-004 / COM-012 / COM-013 / COM-015 / CON-003-CLI-002）: グレー背景の他ページと並べたときの違和感が許容範囲内
  - **本人確認系 3 ページ**（COM-003 / COM-004 / COM-005）: 白→グレーに変化、他の内向きフォームと一貫性が出ている
  - _Requirements: REQ-7 実機 QA 面_

---

## フェーズ 10: テスト再実行とメモ更新

- [x] 18. 既存テストの再実行（regression check）
  - `npm run test`（Vitest）が全 PASS することを確認
  - `supabase test db`（pgTAP）が全 PASS することを確認
  - `npm run test:e2e`（Playwright）が全 PASS することを確認
  - max-w / chrome 変更はセレクタ・テキスト・データに影響しないため、テスト変更ゼロで全 PASS する想定
  - 万一 fail があれば、原因を調査（max-w 変更で要素の overflow / layout shift が発生して getByRole / hover が効かなくなる等のケースがありうる）
  - _Requirements: REQ-7 テスト面_

- [x] 19. メモ更新
- [x] 19.1 `project_appwide_content_maxwidth` メモを更新
  - 「宿題」状態 → 「解決済み・本 spec で実施」に書き換える
  - 採用された 4 段階 max-w ルール + 2 段ラッパー構造を明記
  - 関連 spec として `[[appwide-ui-consistency]]` を追記（または歴史的記録としてマーク）
- [x] 19.2 `project_back_button_policy` メモを更新
  - 「BackButton 内部デフォルトに `mx-auto max-w-xs` を追加して 320px 固定」を追記
  - `size` prop が削除された点を追記
- [x] 19.3 新規 feedback メモ作成（汎用パターンの記録）
  - 「page chrome の 2 段ラッパーパターン」: 全ページ共通の `min-h-dvh bg-muted` 外殻 + `mx-auto max-w-X` 内側
  - 「viewport edge 拡張は `.bleed-viewport` utility で表現する」: max-w 制約内で section を viewport edge まで広げるテクニック
  - 「白背景 vs グレー背景の使い分け」: 外向き（他人/運営に発信）= 白、内向き（自分/自社の内部管理）= グレー、というデザインパターンらしき分岐の存在を記録

---

## 補足: 推奨 commit 構成

CLAUDE.md「1 機能 1 コミットを基本とする」に従い、本タスクは **1 PR・複数 commit** で構成する想定:

- **commit 1**: BackButton 改修 + utility class（Task 1〜4）
- **commit 2**: CON-006 サブグリッド + bleed-viewport 適用（Task 5）
- **commit 3**: Client Component 再構造化（Task 6〜10、フェーズ 2 全体）
- **commit 4**: 6xl カテゴリ適用（Task 11、フェーズ 3）
- **commit 5**: 4xl 詳細カテゴリ適用（Task 12、フェーズ 4）
- **commit 6**: 4xl 1 列リスト適用（Task 13、フェーズ 5）
- **commit 7**: 2xl フォーム適用（Task 14、フェーズ 6）
- **commit 8**: lg 特例確認 + 適用対象外確認（Task 15〜16）
- **commit 9**: 内部冗長指定の cleanup（REQ-6 に基づき、各 commit 中に組み込み可）
- **commit 10**: メモ更新（Task 19）

各 commit のメッセージは日本語で、何を変更したか簡潔に書く（例: `refactor(ui): BackButton 内部デフォルトを max-w-xs 固定に変更`、`refactor(ui): CON-006 サブグリッド 2 列止まり + bleed-viewport で viewport edge 維持`）。

## 補足: PR 説明文の骨子

```
## 概要
ユーザー側アプリ全体（(authenticated) 配下 53 画面）の max-w / page chrome / もどるボタンを統一する独立タスク。

## 変更内容
- 53 ページの page chrome を「外側: フル幅 bg + 内側: 中央寄せ max-w + 余白」の 2 段ラッパー構造に統一
- max-w は 4 段階（6xl / 4xl / 2xl / lg）で振り分け
- BackButton 内部デフォルトに mx-auto max-w-xs を追加（全 38 箇所が 320px に統一）
- BackButton から size prop を削除（schedule 3 画面の size="lg" 渡しも除去）
- CON-006「掲載中の案件」サブグリッドを 2 列止まりに（lg:grid-cols-3 削除）+ グレー帯は bleed-viewport utility で viewport edge まで維持
- 5 つの Client Component（BillingClient / WithdrawalForm / ProfileEditForm / BulkSendForm / ScoutSendForm）から page chrome を撤去し、page.tsx に 2 段ラッパー新設
- 余白を全ページ px-4 py-6 md:px-8 md:py-8 に統一（3 ページの px-6 md:px-12 を標準値に揃え）
- 内部の冗長な max-w / md: prefix 指定を撤去

## 維持される（変更しない）もの
- 白背景 8 ページ（CON-004、CON-006、CLI-003、CLI-004、COM-012、COM-013、COM-015、**CON-003/CLI-002**）は白背景のまま
- 本人確認系 3 ページ（COM-003、COM-004、COM-005）は白→グレー化（ユーザー判断による「内向き = グレー」ルール統一）
- CON-009 メッセージ詳細の bg-[#F0F0F0] 特殊カラー
- BulkSendForm / ScoutSendForm の bg-muted/40 透明度

## テスト
- Vitest / pgTAP / Playwright: 既存テストすべて PASS（期待値変更なし）
- 実機 QA: PC 1440px / 1920px / SP 375px / iPad 1024px の 4 viewport で代表画面を目視確認

## 関連
- spec: `.kiro/specs/appwide-ui-consistency/`
- 解決メモ: `project_appwide_content_maxwidth`
- 拡張メモ: `project_back_button_policy`
```
