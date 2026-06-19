# Requirements Document — appwide-ui-consistency（アプリ全体 UI 統一）

## Project Description (Input)

ユーザー側アプリ全体（`src/app/(authenticated)/`）で次の 4 つを統一する独立タスク。本タスクは表示層のみの統一作業で、ドメインロジック・データモデル・API・既存テストの期待値変更は一切伴わない。

1. **画面の最大横幅**（max-w）を 4 段階ルール（6xl / 4xl / 2xl / lg）で揃える
2. **「もどる」ボタン**（BackButton）の表示幅を 320px 固定にする
3. **CON-006「掲載中の案件」サブグリッド**を 2 列止まりにする（4xl 内で 1 カード ≈ 420px 確保。グレー帯は viewport 端まで維持）
4. **ページの内側余白**（padding）を全ページ `px-4 py-6 md:px-8 md:py-8` で統一する

---

### 確定済み設計判断（仕様書レビュー後の追加検証込み）

#### a. なぜ admin と同じ「1 値集約」にしないか
admin は全画面が「読み物 + 軽いフォーム」で `max-w-2xl` が万能。ユーザー側は「カード 3 列で広がる一覧」と「縦長の編集フォーム」が混在するため、1 値だと一覧が圧迫されて PC のメリットが消える。

#### b. なぜ「一覧」を 6xl と 4xl の 2 種に分けるか
カード横展開を持つ一覧 (CLI-005 等 7 ページ) と縦並びリスト (CON-001 等 8 ページ) は性質が違う。6xl を 1 列リストに当てると「1 行ごとに 1152px 幅の横長帯」が縦に並んで視線移動が無駄。

#### c. なぜ「2 段ラッパー」構造にしないと壊れるか（仕様書レビューで発覚）
53 ページのほぼ全てが `<div className="min-h-dvh bg-muted ...">` 形式の **page chrome ラッパー** を最上位に持っていた。ここに `max-w` を直接当てると、グレー背景まで max-w に縮んで **左右に白い帯が出るレイアウト破綻** が発生する。

正しい構造は **「外側で背景フル幅維持 + 内側で content を中央寄せ＋余白」** の 2 段ラッパー:
```jsx
<div className="min-h-dvh bg-muted">                                {/* 外側: 背景フル幅 */}
  <div className="mx-auto w-full max-w-{X} px-4 py-6 md:px-8 md:py-8">  {/* 内側: 中央寄せ + 余白 */}
    {content}
  </div>
</div>
```

#### d. なぜ CON-006 サブグリッドを 2 列止まりにするか
4xl (896px) ページ内で `lg:grid-cols-3` が走ると 1 カード ≈ 270px と詰まる。`md:grid-cols-2` 止まりなら 1 カード ≈ 420px でゆとりあり。

#### e. なぜ CON-006「掲載中の案件」のグレー帯は viewport 端まで延ばす特別対応をするか（ユーザー判断）
現状コードは「掲載中の案件」セクションを `-mx-4 md:-mx-8` の negative margin で viewport 端まで広げ、グレー帯で「ここは別の情報ですよ」と視覚的に区別している。max-w-4xl を親に被せると negative margin は 4xl の範囲しか伸びず、**グレー帯が短くなって両脇に白余白が出る**。ユーザー判断により、CON-006 だけ **viewport edge まで延びる特別な書き方**で対応する（標準的な full-bleed テクニックを utility class 化して使う）。

#### f. なぜ退会画面（COM-006）は `max-w-lg` のままにするか
中身が 4 要素しかなく `max-w-2xl` だと間延びする。同じ「お別れ系」の課金管理トップとも揃えて「気をつけて操作してね」感を一貫させる。

#### g. なぜ「もどるボタン固定 320px」にするか
BackButton 内部は現状 `w-full` のみで親要素幅依存。3 値ルール適用後はボタンが 4 種の幅にバラける。内部デフォルトに `mx-auto max-w-xs` を追加して 320px 固定にすることで、callers 側の個別指定差を吸収する。CLAUDE.md にも「同一セクション内の複数ボタンは `w-full max-w-xs mx-auto` で統一」のルールあり。

#### h. なぜ Client Component が page chrome を所有しているケースは「内容のみに再構造化」するか（仕様書レビューで発覚）
billing/page.tsx・profile/edit/page.tsx・profile/withdrawal/page.tsx・messages/bulk-send/page.tsx・messages/scout-send/page.tsx は、page.tsx に div を持たず単に `<ClientComponent />` を返すだけ。Client Component 側が `<div className="min-h-dvh bg-muted ...">` を所有している。page.tsx で max-w を当てる方針を一貫させるため、これら 5 ファイルの Client Component は **内容のみ render する形に再構造化** し、page chrome は page.tsx 側に移す。

#### i. なぜ「白背景のフォーム 8 ページ」はそのまま白背景を維持するか（ユーザー判断）
仕様書レビューで「白背景になっているページ」と「グレー背景になっているフォーム多数」の混在が発覚。並べてみると **白 = 外向き（他人 or 運営に発信／他社情報の閲覧）/公開コンテンツ** / **グレー = 内向き（自分・自社の内部管理）** という意図的なデザインパターンらしき分岐が見える。意図がある可能性が高いため触らず、もし統一が必要なら別タスクで「白に寄せるかグレーに寄せるか」をデザイン視点で議論する。本タスクは max-w 統一のみが目的。

**例外として本人確認系 3 ページ（COM-003 / COM-004 / COM-005）はグレー化する**: 仕様書レビューの再検証で発覚した「現状 P5（白）でパターンに反する」ページ。自分の身分書類提出フロー（内向き）のため、ユーザー判断により bg-muted（グレー）を新規付与して内向きパターンに揃える。

**CON-003 / CLI-002（jobs/[id]/page.tsx）は白維持**: 同じく仕様書レビュー後に追加発見した白背景ページ。公開された案件詳細を見る/管理するページで「公開コンテンツの表示・発信 = 白」パターンに合致するため、現状の白を維持する。

#### j. なぜ padding を `px-4 py-6 md:px-8 md:py-8` に揃えるか（ユーザー判断）
現状ほぼ全ページが `px-4 py-6 md:px-8 md:py-8` だが、3 ページ (jobs/manage / applications/orders/[id] / applications/history/[id]) だけ `px-6 py-6 md:px-12 md:py-8` で不一致。3 ページのほうが少数派、また厳密に意図的な差ではなさそう（時期によるブレ）なので、標準に揃える。

---

### 仕様書レビューで発見した既存コードの 8 パターン

53 ページの最上位 div を grep した結果、次の **8 パターン + Delegated** が混在していることが判明。本仕様書はそれぞれの変換手順を明示する:

| パターン | 該当数 | 現状の構造 | 例 |
|---|---|---|---|
| **P1** | 16 | `min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8` | mypage、applications/orders、profile 他 |
| **P1-variant** | 3 | `min-h-dvh bg-muted px-6 py-6 md:px-12 md:py-8` | jobs/manage、applications/orders/[id]、applications/history/[id] |
| **P2** | 5 | `min-h-dvh bg-muted`（パディングなし、カードグリッド系） | clients、users/contractors、jobs/search、favorites、users/contractors/[id] |
| **P3** | 3 | `min-h-dvh px-4 py-6 md:px-8 md:py-8`（bg-muted なし＝白） | clients/[id]、jobs/[id]/apply、**jobs/[id]/page.tsx**（line 187 & 458 の 2 返却） |
| **P3-variant** | 5 | `min-h-dvh px-4 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8`（白＋PC で部分的に max-w-2xl 中央寄せ実装済） | jobs/[id]/edit、jobs/create、trouble-report、mypage/job-inquiries/[id]、clients/[id]/inquiry |
| **P4** | 1 | `flex min-h-screen flex-col bg-[#F0F0F0]`（チャット UI 特殊カラー） | messages/[threadId] |
| **P5** | 3 | `px-4 py-6 md:px-8 md:py-8`（**min-h なし、bg なし、padding のみ**。仕様書レビュー後に追加発見） | profile/verification/page.tsx、profile/verification/identity/page.tsx、profile/verification/ccus/page.tsx |
| **P6** | 2 | `mx-auto min-h-dvh max-w-2xl bg-muted px-4 py-6 md:px-8 md:py-8`（**単一 div に bg + max-w + padding 全部入り**。仕様書レビュー後に追加発見） | applications/received/[id]/page.tsx、applications/received/[id]/decide/page.tsx |
| **Delegated** | 5 | page.tsx は `<ClientComponent />` のみ。chrome は Client 側 | billing、profile/edit、profile/withdrawal、messages/bulk-send、messages/scout-send |
| **その他** | 10 | 上記以外のフォーム系（min-h-dvh bg-muted ベース、P1 同等） | schedule 系、messages/templates 系、mypage/members 系、profile/edit 等 |

---

### 対象外（明示的に out of scope）

- `src/app/admin/`（admin layout は既に `max-w-2xl` 一括適用済み、別系統）
- `src/app/(auth)/`（BackChevron 別系統、BackButton 未使用）
- `src/app/(support)/` の **横幅統一**（BackButton 内部変更で 320px は自動適用される）
- 個別ページのレイアウト最適化（PC で 2 列化など）
- **白背景 8 ページ vs グレー背景の他ページの色統一**（別タスクで議論）。本タスクでは仕様書レビュー時点の状態（CON-006 / CON-004 / CLI-003 / CLI-004 / COM-012 / COM-013 / COM-015 / CON-003-CLI-002 = 白維持）を尊重
- 既存 BackButton callers の冗長な className 撤去（互換維持のため本 PR では掃除しない）
- 新規 design canvas の追加・既存デザインカンプの差し替え

### 参考メモ

- [[project_appwide_content_maxwidth]] — 横幅未統一の宿題
- [[project_back_button_policy]] — 戻る導線の最終仕様（2026-05-27 実装、本タスクで「もどるボタン幅固定」を追記する）
- [[feedback_defer_appwide_ui_consistency]] — UI 統一は方針決め→独立タスクで運用するルール

---

## Introduction

本機能はユーザー側アプリ全体の UI 統一を行う独立タスクである。具体的には次の 4 つ:
1. 53 ページの最大横幅を 4 段階（6xl / 4xl / 2xl / lg）で揃える
2. BackButton 内部のデフォルトに `max-w-xs` を追加して 320px 固定にする
3. CON-006「掲載中の案件」サブグリッドを 2 列止まりにし、グレー帯は viewport edge まで延びる特別対応を追加
4. 余白を全ページ `px-4 py-6 md:px-8 md:py-8` に統一

新規ドメインロジック・データモデル変更・API 変更・既存テスト期待値変更は一切伴わない。

**品質担保の主軸は実機 QA**（PC 1440px / 1920px の 2 viewport で各カテゴリ代表画面の見た目確認）になる。Vitest / pgTAP / Playwright 既存テストは max-w 変更がセレクタ・テキスト・データに影響しないため、テスト変更なしで全 PASS することを確認する（regression check）。

軽量 spec（option B）として `design.md` は省略する。設計判断は本ドキュメント「確定済み設計判断」セクションで完結。

---

## Requirements

### REQ-1: 画面の最大横幅（4 段階ルール + 2 段ラッパー構造）

#### REQ-1.1: 4 段階の max-w 区分

| 区分 | max-w | 実寸 | 適用条件 |
|---|---|---|---|
| 一覧（カード 3 列グリッド） | `max-w-6xl` | 1152px | `md:grid-cols-2 lg:grid-cols-3` でカードが横に広がる一覧 |
| 詳細・1 列リスト | `max-w-4xl` | 896px | 詳細表示・縦並びリスト・付加情報の多い画面 |
| フォーム・入力 | `max-w-2xl` | 672px | 編集・新規作成・申請・送信フォーム |
| 課金・退会特例 | `max-w-lg` | 512px | 課金管理トップ・退会フォーム |

#### REQ-1.2: 「2 段ラッパー」構造（必須）

全ページの最上位 return 要素は **次の 2 段構造** にする:

```jsx
<div className="min-h-dvh bg-muted">                                {/* 外側: 背景フル幅 + viewport 高さ */}
  <div className="mx-auto w-full max-w-{X} px-4 py-6 md:px-8 md:py-8">  {/* 内側: 中央寄せ + 標準余白 */}
    {content}
  </div>
</div>
```

**外側ラッパーの役割**:
- `min-h-dvh`: viewport 高さを確保（フッターや空ページ対策）
- `bg-muted`: グレー背景を viewport 端まで広げる（白背景ページでは省略）

**内側ラッパーの役割**:
- `mx-auto w-full max-w-{X}`: 中央寄せで該当区分の最大幅
- `px-4 py-6 md:px-8 md:py-8`: 標準余白（全ページ統一）

#### REQ-1.3: 例外パターン

| ケース | 外側ラッパー | 備考 |
|---|---|---|
| **白背景 8 ページ**（CON-006、CON-004、CLI-003、CLI-004、COM-012、COM-013、COM-015、**CON-003/CLI-002 = jobs/[id]/page.tsx**） | `<div className="min-h-dvh">` (bg-muted なし) | ユーザー判断による白背景維持。CON-003/CLI-002 は仕様書レビュー後の再検証で追加発見、「公開コンテンツの表示・発信 = 白」パターンに合致 |
| **メッセージ詳細 CON-009** | `<div className="flex min-h-screen flex-col bg-[#F0F0F0]">` | チャット UI 特殊カラー＋flex 構造。**外側に `flex flex-col` 追加、内側に `flex flex-1 flex-col` 必須**（入力欄が画面下に固定される構造のため） |
| **本人確認系 3 ページが白だが、グレー化する**（COM-003、COM-004、COM-005） | （現状 P5 で白）→ **外側に `min-h-dvh bg-muted` を新設してグレー化** | ユーザー判断による「内向き = グレー」ルールに合わせる。現状 P5（min-h・bg なし、padding のみ）で白だったが、自分自身の確認書類提出フローのため内向きに分類し直し |

#### REQ-1.4: 6 つのパターン別変換手順

| 現状パターン | 変換手順 |
|---|---|
| **P1**: `min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8` | 外側 `min-h-dvh bg-muted` のみ残す、内側に `mx-auto w-full max-w-{X} px-4 py-6 md:px-8 md:py-8` を新設 |
| **P1-variant**: `min-h-dvh bg-muted px-6 py-6 md:px-12 md:py-8` | 上記と同じ。**px-6/md:px-12 は標準値 px-4/md:px-8 に統一**（REQ-1.5） |
| **P2**: `min-h-dvh bg-muted`（padding なし） | 外側 `min-h-dvh bg-muted` 維持、内側に `mx-auto w-full max-w-{X} px-4 py-6 md:px-8 md:py-8` を新設（標準余白付与） |
| **P3**: `min-h-dvh px-4 py-6 md:px-8 md:py-8`（白） | 外側 `min-h-dvh`（bg-muted 付与しない＝白維持）、内側に `mx-auto w-full max-w-{X} px-4 py-6 md:px-8 md:py-8` を新設 |
| **P3-variant**: `min-h-dvh px-4 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8` | 外側 `min-h-dvh`（白維持）、内側に `mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8` を新設（`md:` prefix を削除して全 breakpoint で max-w 適用） |
| **P4**: `flex min-h-screen flex-col bg-[#F0F0F0]` | **外側 `min-h-screen bg-[#F0F0F0] flex flex-col` 維持**（flex flex-col 追加）、内側に **`mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6 md:px-8 md:py-8`** を新設（**flex-1 を必須**。これがないと MessageThreadView が縦に潰れ、入力欄が画面下に固定されない） |
| **P5**: `px-4 py-6 md:px-8 md:py-8`（min-h・bg なし、padding のみ） | 外側 `<div className="min-h-dvh bg-muted">` を **新設**（min-h と bg-muted を付与・ユーザー判断によりグレー化）、内側に `mx-auto w-full max-w-{X} px-4 py-6 md:px-8 md:py-8` を新設。**現状の `px-4 py-6 md:px-8 md:py-8` は撤去**（内側に統合） |
| **P6**: `mx-auto min-h-dvh max-w-{X} bg-muted px-4 py-6 md:px-8 md:py-8`（単一 div 全部入り） | **既存の単一 div を 2 段に分割**: 外側 `<div className="min-h-dvh bg-muted">` (mx-auto と max-w を抜き、min-h と bg-muted のみ残す)、内側に `<div className="mx-auto w-full max-w-{X} px-4 py-6 md:px-8 md:py-8">` を新設（mx-auto と max-w と padding を内側に集約）。**現状は bg-muted が max-w 内に閉じ込められて PC で「グレーの帯が中央のみ」になっていた、本変換で初めて viewport 端まで広がる** |
| **Delegated**（page.tsx は `<ClientComponent />` のみ） | REQ-5 で詳述。Client Component から chrome を撤去し、page.tsx に 2 段ラッパー新設 |

#### REQ-1.5: padding 統一

全ページの内側ラッパー余白は **`px-4 py-6 md:px-8 md:py-8`** で統一する（ユーザー判断 ④）。

現状 `px-6 py-6 md:px-12 md:py-8` の 3 ページも標準値に揃える:
- `jobs/manage/page.tsx`
- `applications/orders/[id]/page.tsx`
- `applications/history/[id]/page.tsx`

#### REQ-1.6: 全 53 ページの振り分け早見表

##### 6xl カテゴリ（カード 3 列グリッド一覧）— 7 画面

| # | 画面ID | 画面名 | path | 現状パターン | 外側変更後 | 内側変更後 |
|---|---|---|---|---|---|---|
| 1 | CON-002 | 募集案件一覧 | `jobs/search/page.tsx` | P2 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8` |
| 2 | CON-005 | 発注者一覧 | `clients/page.tsx` | P2 | 同上 | 同上 |
| 3 | CON-007 | マイリスト | `favorites/page.tsx` | P2 | 同上 | 同上 |
| 4 | CON-011 | 応募履歴一覧 | `applications/history/page.tsx` | P1 | `min-h-dvh bg-muted` 維持（外側 padding 撤去） | 新設 `mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8` |
| 5 | CLI-001 | 募集現場一覧 | `jobs/manage/page.tsx` | P1-variant | `min-h-dvh bg-muted` 維持（px-6/md:px-12 撤去） | 新設 `mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8`（標準余白に揃える） |
| 6 | CLI-005 | ユーザー一覧（職人） | `users/contractors/page.tsx` | P2 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8` |
| 7 | CLI-007 | 応募一覧（mypage 導線） | `applications/received/page.tsx` | P1 | `min-h-dvh bg-muted` 維持（外側 padding 撤去） | 新設 `mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8`。内部 grid の `mx-auto max-w-6xl` は撤去（重複） |

##### 4xl 詳細カテゴリ — 15 画面

| # | 画面ID | 画面名 | path | 現状パターン | 外側変更後 | 内側変更後 |
|---|---|---|---|---|---|---|
| 1 | CON-003 / CLI-002 | 募集案件詳細 / 募集現場詳細 | `jobs/[id]/page.tsx` | **P3（白）。Line 187 (CLI-002 manage 表示) と line 458 (CON-003 表示) の 2 つの主要 return を持つ** | `<div className="min-h-dvh">` (**bg-muted なし、白維持・REQ-1.3 例外**) | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8`。**両 return（line 187 / line 458）とも同じ変換を適用する**（片方忘れ防止） |
| 2 | CON-006 | 発注者詳細 | `clients/[id]/page.tsx` | **P3（白）** | `min-h-dvh`（bg-muted なし、白維持） | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8` + REQ-3 の特別対応 |
| 3 | CON-009 | メッセージ/スカウト詳細 | `messages/[threadId]/page.tsx` | **P4** | `min-h-screen bg-[#F0F0F0]` 維持 | 新設 `mx-auto flex w-full max-w-4xl flex-col px-4 py-6 md:px-8 md:py-8`（flex 構造を内側に） |
| 4 | CON-012 | 応募詳細 | `applications/history/[id]/page.tsx` | P1-variant | `min-h-dvh bg-muted` 維持（px-6/md:px-12 撤去） | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8`（標準余白） |
| 5 | CLI-006 | ユーザー詳細（職人） | `users/contractors/[id]/page.tsx` | P2 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8`。内部 `md:flex-row` 2 列セクションは 4xl 内で 1 列 ≈ 420px、適切 |
| 6 | CLI-008 | 応募詳細（発注者側） | `applications/received/[id]/page.tsx` | **P6（line 177 単一 div に `mx-auto min-h-dvh max-w-2xl bg-muted px-4 py-6 md:px-8 md:py-8` 全部入り）** | 新設 `<div className="min-h-dvh bg-muted">`（既存の単一 div を分割し min-h と bg-muted のみ残す） | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8`（widen 2xl→4xl、mx-auto と padding を内側に集約） |
| 7 | CLI-011 | 発注履歴詳細 | `applications/orders/[id]/page.tsx` | P1-variant | `min-h-dvh bg-muted` 維持（px-6/md:px-12 撤去） | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8` |
| 8 | CLI-017 | スカウトテンプレ詳細 | `messages/templates/[id]/page.tsx` | P1 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8` |
| 9 | CLI-020 | 発注者情報詳細 | `mypage/client-profile/page.tsx` | P1 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8` |
| 10 | CLI-023 | 担当者詳細 | `mypage/members/[id]/page.tsx` | P1 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8` |
| 11 | CLI-026 | 有料プラン案内 | `billing/plans/page.tsx` | **既に 2 段構造**（line 90 外側 `<div className="min-h-screen bg-muted">` + line 91 内側 `<div className="mx-auto max-w-4xl px-4 py-6">`） | `min-h-screen bg-muted` 維持（既存） | 既存の内側ラッパーに **`w-full` 追加 + `md:px-8 md:py-8` 追加** で標準化（最小変更）。`min-h-screen` は他ページの `min-h-dvh` と微妙に違うが本タスクでは保持 |
| 12 | CLI-028 | 発注者評価 | `users/[id]/reviews/page.tsx` | **P1** | `min-h-dvh bg-muted` 維持（padding 撤去） | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8` |
| 13 | COM-001 | プロフィール詳細 | `profile/page.tsx` | P1 | `min-h-dvh bg-muted` 維持（padding 撤去） | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8` |
| 14 | COM-003 | 本人確認・CCUS登録申請 | `profile/verification/page.tsx` | **P5（line 83 で `<div className="px-4 py-6 md:px-8 md:py-8">` のみ、min-h・bg なし）** | **新設 `<div className="min-h-dvh bg-muted">`**（min-h と bg-muted を付与、ユーザー判断によりグレー化） | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8`。既存の外側 `px-4 py-6 md:px-8 md:py-8` は撤去 |
| 15 | COM-015 | 求人問い合わせ受信箱詳細 | `mypage/job-inquiries/[id]/page.tsx` | **P3-variant（白）** | `<div className="min-h-dvh">`（**白維持・REQ-1.3 例外**） | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8`（widen 2xl→4xl、md: prefix 削除） |

##### 4xl 1 列リストカテゴリ — 8 画面

| # | 画面ID | 画面名 | path | 現状パターン | 外側変更後 | 内側変更後 |
|---|---|---|---|---|---|---|
| 1 | CON-001 | マイページ | `mypage/page.tsx` | P1 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8` |
| 2 | CON-008 | メッセージ/スカウト一覧 | `messages/page.tsx` | P1（内部 max-w-2xl） | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8`（widen 2xl→4xl） |
| 3 | CON-014 | 空き日程一覧 | `schedule/page.tsx` | P1 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8` |
| 4 | CLI-007B | 案件応募者一覧 | `jobs/[id]/applicants/page.tsx` | **P1** | `min-h-dvh bg-muted` 維持（padding 撤去） | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8`。**内部 line 160 付近の `<div className="... max-w-2xl rounded-[8px] border ...">` は status filter UI 用、保持すること**（一般 cleanup ルールで撤去しない） |
| 5 | CLI-010 | 発注履歴一覧 | `applications/orders/page.tsx` | P1 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8` |
| 6 | CLI-016 | スカウトテンプレ一覧 | `messages/templates/page.tsx` | P1 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8` |
| 7 | CLI-022 | 担当者一覧 | `mypage/members/page.tsx` | P1 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8` |
| 8 | COM-014 | 求人問い合わせ受信箱一覧 | `mypage/job-inquiries/page.tsx` | P1（内部 max-w-3xl） | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8`（slight widen 3xl→4xl） |

##### 2xl フォームカテゴリ — 20 画面

| # | 画面ID | 画面名 | path | 現状パターン | 外側変更後 | 内側変更後 |
|---|---|---|---|---|---|---|
| 1 | CON-004 | 応募情報入力 | `jobs/[id]/apply/page.tsx` | **P3（白）** | `min-h-dvh`（白維持） | 新設 `mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8` |
| 2 | CON-013 | 作業報告・評価入力 | `applications/history/[id]/report/page.tsx` | P1 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8` |
| 3 | CON-015 | 空き日程更新 | `schedule/[id]/edit/page.tsx` | P1 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8` |
| 4 | CON-016 | 空き日程登録 | `schedule/new/page.tsx` | P1 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8` |
| 5 | CLI-003 | 募集現場編集 | `jobs/[id]/edit/page.tsx` | **P3-variant（白）** | `min-h-dvh`（白維持） | 新設 `mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8`（md: prefix 削除） |
| 6 | CLI-004 | 募集現場新規登録 | `jobs/create/page.tsx` | **P3-variant（白）** | `min-h-dvh`（白維持） | 新設 `mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8`（md: prefix 削除） |
| 7 | CLI-009 | 発注可否 | `applications/received/[id]/decide/page.tsx` | **P6（line 106 単一 div に `mx-auto min-h-dvh max-w-2xl bg-muted px-4 py-6 md:px-8 md:py-8` 全部入り）** | 新設 `<div className="min-h-dvh bg-muted">`（既存の単一 div を分割し min-h と bg-muted のみ残す） | 新設 `mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8`（mx-auto と max-w と padding を内側に集約） |
| 8 | CLI-012 | 作業完了/失注報告・評価登録 | `applications/orders/[id]/report/page.tsx` | P1 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8` |
| 9 | CLI-014 | メッセージ一斉送信 | `messages/bulk-send/page.tsx` | **Delegated** → BulkSendForm | page.tsx に `min-h-screen bg-muted/40` 新設（外側） | page.tsx に内側ラッパー新設。BulkSendForm は内容のみに（REQ-5） |
| 10 | CLI-015 | スカウト送信 | `messages/scout-send/page.tsx` | **Delegated** → ScoutSendForm | 同上 | 同上 |
| 11 | CLI-018 | テンプレート編集 | `messages/templates/[id]/edit/page.tsx` | P1 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8` |
| 12 | CLI-019 | テンプレート新規作成 | `messages/templates/new/page.tsx` | P1 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8` |
| 13 | CLI-021 | 発注者情報編集 | `mypage/client-profile/edit/page.tsx` | **P1（line 153 で page.tsx 自身が `<div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">` を持つ。Delegated ではない）** | `min-h-dvh bg-muted` 維持（padding 撤去） | 新設 `mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8`。ClientProfileEditForm 側は元々外殻なし（`<form className="space-y-6">` のみ）のため変更不要 |
| 14 | CLI-024 | 担当者編集 | `mypage/members/[id]/edit/page.tsx` | P1 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8` |
| 15 | CLI-025 | 担当者新規作成 | `mypage/members/new/page.tsx` | P1 | `min-h-dvh bg-muted` 維持 | 新設 `mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8` |
| 16 | COM-002 | プロフィール編集 | `profile/edit/page.tsx` | **Delegated** → ProfileEditForm（内部 P1 + max-w-2xl） | page.tsx に `min-h-dvh bg-muted` 新設 | page.tsx に内側ラッパー新設。ProfileEditForm は内容のみに（REQ-5） |
| 17 | COM-004 | 公的証明書・本人顔写真送付 | `profile/verification/identity/page.tsx` | **P5（line 68 で `<div className="px-4 py-6 md:px-8 md:py-8">` のみ、min-h・bg なし、現状白）** | **新設 `<div className="min-h-dvh bg-muted">`**（min-h と bg-muted を付与、ユーザー判断によりグレー化＝白→グレーに変更） | 新設 `mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8`。既存の外側 `px-4 py-6 md:px-8 md:py-8` は撤去 |
| 18 | COM-005 | CCUS技術者ID・本人確認番号入力 | `profile/verification/ccus/page.tsx` | **P5（line 62 で同上、現状白）** | **新設 `<div className="min-h-dvh bg-muted">`**（同上、白→グレーに変更） | 新設 `mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8`。既存の外側 padding は撤去 |
| 19 | COM-012 | トラブル報告 | `trouble-report/page.tsx` | **P3-variant（白）** | `min-h-dvh`（白維持） | 新設 `mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8`（md: prefix 削除） |
| 20 | COM-013 | 求人へのお問い合わせ | `clients/[id]/inquiry/page.tsx` | **P3-variant（白）** | `min-h-dvh`（白維持） | 新設 `mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8`（md: prefix 削除） |

##### lg 特例カテゴリ — 2 画面

| # | 画面ID | 画面名 | path | 現状パターン | 外側変更後 | 内側変更後 |
|---|---|---|---|---|---|---|
| 1 | -（screen ID なし） | 課金管理トップ | `billing/page.tsx` | **Delegated** → BillingClient（内部 P1 + max-w-lg 2 段） | page.tsx に `min-h-screen bg-muted` 新設 | page.tsx に内側ラッパー `mx-auto w-full max-w-lg px-4 py-6 md:px-8 md:py-8` 新設。BillingClient は内容のみに（REQ-5） |
| 2 | COM-006 | 退会手続き | `profile/withdrawal/page.tsx` | **Delegated** → WithdrawalForm | page.tsx に `min-h-dvh bg-muted` 新設 | page.tsx に内側ラッパー `mx-auto w-full max-w-lg px-4 py-6 md:px-8 md:py-8` 新設。WithdrawalForm は内容のみに（REQ-5） |

##### 適用対象外 — 1 画面

| # | 画面ID | 画面名 | path | 理由 |
|---|---|---|---|---|
| 1 | CLI-013 | メッセージ送信（redirect） | `messages/new/page.tsx` | redirect のみで JSX 描画なし |

---

### REQ-2: もどるボタン（BackButton）の固定幅化

WHEN 任意のページに `<BackButton />` が配置される
THE システム SHALL BackButton を画面横で **320px 幅で中央寄せ** 表示する

WHEN BackButton コンポーネントが render される
THE システム SHALL 内部 className のデフォルトを `mx-auto w-full max-w-xs rounded-pill text-body-md` とする（現状 `w-full rounded-pill text-body-md` に `mx-auto max-w-xs` を追加）

WHEN BackButton コンポーネントの size prop（現状 `"default" | "lg"`）を扱う
THE システム SHALL size prop インターフェース自体を `BackButtonProps` から削除し、Button への `size=` 渡しも削除する（schedule 3 画面で size="lg" 渡しが廃止された結果、有効な caller が消えるため）

WHEN BackButton callers が既存の className 上書き（`w-full max-w-xs` 等）を渡している
THE システム SHALL 本 PR では callers 側の className 上書きを撤去しない（互換維持。`cn()` の dedupe で挙動は内部デフォルトに一致するため動作影響なし。後続タスクで整理可）

---

### REQ-3: CON-006「掲載中の案件」セクション特別対応

#### REQ-3.1: サブグリッド調整

WHEN CON-006 発注者詳細（`src/app/(authenticated)/clients/[id]/page.tsx`）の「掲載中の案件」サブグリッドが PC viewport で render される
THE システム SHALL サブ案件カードを **最大 2 列まで** で停止させる

変更内容（line 番号は実装時に再確認）:
- 現状: `mt-2 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3`
- 変更後: `mt-2 grid grid-cols-1 gap-6 md:grid-cols-2`（`lg:grid-cols-3` を削除）

これにより `max-w-4xl` (896px) ページ内で 1 カードあたり ≈ 420px の表示幅を確保する。

#### REQ-3.2: グレー帯の viewport edge 拡張（ユーザー判断 ②）

WHEN CON-006 発注者詳細の「掲載中の案件」セクションが render される
THE システム SHALL セクションのグレー背景を **viewport edge から viewport edge まで延ばす**

現状のコード（line 番号は実装時に再確認）:
```jsx
<section className="mt-6 -mx-4 px-4 py-6 bg-muted md:-mx-8 md:px-8">
```

この `-mx-4 md:-mx-8` 方式は親が viewport 全幅であることを前提としており、親が `max-w-4xl` になると grey 帯が viewport edge まで届かない。次の **full-bleed テクニック** で書き換える:

##### 推奨実装: 共通 utility class を新設

`src/app/globals.css` の `@layer utilities` に追加:

```css
@layer utilities {
  .bleed-viewport {
    margin-inline: calc(50% - 50vw);
    padding-inline: calc(50vw - 50%);
  }
}
```

CON-006 のセクション:
```jsx
<section className="mt-6 bleed-viewport py-6 bg-muted">
  {/* 既存の h3 と grid */}
</section>
```

##### 動作原理

- `margin-inline: calc(50% - 50vw)`: section の containing block が viewport より小さい場合に負のマージンを設定し、section の左右端を viewport edge まで広げる
- `padding-inline: calc(50vw - 50%)`: 同等の正の padding で内側コンテンツを元の位置（containing block の content edge）に押し戻す

この方式は次の特性を持つ:
- **モバイル**（viewport < max-w）: containing block = viewport なので margin と padding の calc は 0。section は親と同じ width、つまり viewport edge まで届く ✓
- **PC**（max-w-4xl 適用時）: containing block ≈ 896px、margin = `-(50vw - 448px)`、padding = `(50vw - 448px)`。section が viewport edge まで広がり、content は元の位置を維持 ✓

##### 代替実装（utility class を避けたい場合）

インライン arbitrary value で同等の効果:
```jsx
<section className="mt-6 mx-[calc(50%_-_50vw)] px-[calc(50vw_-_50%)] py-6 bg-muted">
```

ただし可読性が落ちるため、本 spec では utility class 方式を推奨する。

---

### REQ-4: schedule 系画面の BackButton サイズ統一

WHEN CON-014 空き日程一覧 / CON-015 空き日程更新 / CON-016 空き日程登録のもどるボタンが render される
THE システム SHALL `size="lg"` prop を渡さず、Button コンポーネントの default サイズで表示する

変更対象（3 箇所、line 番号は実装時に再確認）:
- `schedule/page.tsx` の `<BackButton href="/mypage" size="lg" />` から `size="lg"` 削除
- `schedule/new/page.tsx` の `<BackButton href="/schedule" size="lg" />` から `size="lg"` 削除
- `schedule/[id]/edit/page.tsx` の `<BackButton href="/schedule" size="lg" />` から `size="lg"` 削除

---

### REQ-5: Client Component の page chrome 再構造化

WHEN page.tsx が単に `<ClientComponent />` のみを返し、Client Component が page chrome（`min-h-dvh bg-muted` 等の外殻）を所有している
THE システム SHALL Client Component から外殻を撤去し、**内容のみを return** する形に再構造化する。page.tsx 側に 2 段ラッパー（外側 + 内側）を新設する

対象ファイル（5 件）:

| # | page.tsx | Client Component | 再構造化内容 |
|---|---|---|---|
| 1 | `billing/page.tsx` | `BillingClient.tsx`（line 351-352 の `<div className="min-h-screen bg-muted"><div className="mx-auto max-w-lg px-4 py-6">` 2 段構造） | BillingClient から両 div を撤去（`py-6` は内部で適切な位置に移動）。page.tsx に `<div className="min-h-screen bg-muted"><div className="mx-auto w-full max-w-lg px-4 py-6 md:px-8 md:py-8"><BillingClient ... /></div></div>` |
| 2 | `profile/edit/page.tsx` | `profile-edit-form.tsx`（line 414 の `<div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">`、line 420 banner の独自 `max-w-2xl`、line 425-427 form の `mx-auto mt-6 max-w-2xl`） | form 外殻 div を撤去、banner の `mx-auto max-w-2xl` も撤去（内側ラッパー継承）、form の `max-w-2xl mx-auto` も撤去（`mt-6 space-y-6` は保持）。page.tsx に 2 段ラッパー新設 |
| 3 | `profile/withdrawal/page.tsx` | `withdrawal-form.tsx`（line 90 の `<div className="mx-auto max-w-lg space-y-6">` ※ min-h-dvh は無い、page.tsx 側でも未指定） | withdrawal-form から `mx-auto max-w-lg` 撤去（`space-y-6` は保持）。page.tsx に `<div className="min-h-dvh bg-muted"><div className="mx-auto w-full max-w-lg px-4 py-6 md:px-8 md:py-8"><WithdrawalForm ... /></div></div>` |
| 4 | `messages/bulk-send/page.tsx` | `bulk-send-form.tsx`（line 74-75 の `<div className="min-h-screen bg-muted/40"><div className="mx-auto max-w-2xl px-4">`） | 両 div を撤去。page.tsx に `<div className="min-h-screen bg-muted/40"><div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8"><BulkSendForm ... /></div></div>` ※ 既存の `bg-muted/40` 透明度色は保持 |
| 5 | `messages/scout-send/page.tsx` | `scout-send-form.tsx`（line 114-115 で同上の 2 段構造） | 同上の方法で再構造化 |

##### 注意点

- ProfileEditForm の **banner**（line 420 の `<p className="mx-auto mt-4 max-w-2xl text-body-sm text-destructive">`）の `mx-auto max-w-2xl` も撤去すること。内側ラッパーで継承される
- BillingClient の `py-6` のような content-specific な padding は **内部の最初のセクションに移動するか、内側ラッパーの py-6 で吸収する**（外側ラッパーの py に統合）
- BulkSendForm / ScoutSendForm の `bg-muted/40`（透明度 40%）は通常の `bg-muted` とは異なる薄いグレー。**page.tsx の外側ラッパーで `bg-muted/40` をそのまま使う**（色を変えない）
- client-profile-edit-form.tsx（CLI-021）は元々外殻を持たず `<form className="space-y-6">` のみなので、再構造化対象外（page.tsx 側で 2 段ラッパー新設のみ）

---

### REQ-6: 内部冗長指定の整理（cleanup）

WHEN page.tsx 最上位に 2 段ラッパーを追加した結果、内部の inner div / inline 指定に重複する max-w や padding が残る
THE システム SHALL 重複指定を撤去する（page.tsx を Single Source of Truth として一本化）

撤去対象一覧（最低限・line 番号は実装時に再確認）:

| # | 対象 | 撤去する指定 | 理由 |
|---|---|---|---|
| 1 | `applications/received/page.tsx` 内部 grid | `mx-auto max-w-6xl`（grid class 自体は残す） | page top に max-w-6xl を移動するため |
| 2 | `applications/received/[id]/page.tsx` 内部の `max-w-2xl` | `max-w-2xl` インライン指定 | page top に max-w-4xl 適用済（widen） |
| 3 | `applications/received/[id]/decide/page.tsx` 内部の `max-w-2xl` | `max-w-2xl` インライン指定 | page top に max-w-2xl 適用 |
| 4 | `billing/plans/page.tsx` 内部の `max-w-4xl` | `max-w-4xl` インライン指定 | page top に max-w-4xl 適用済 |
| 5 | `messages/page.tsx` 内部の `max-w-2xl` | `max-w-2xl` インライン指定 | page top に max-w-4xl 適用（widen） |
| 6 | `mypage/job-inquiries/page.tsx` 内部の `max-w-3xl` | `max-w-3xl` インライン指定 | page top に max-w-4xl 適用（slight widen） |
| 7 | P3-variant 5 ページの `md:mx-auto md:max-w-2xl md:px-8 md:py-8` | 全削除（md: prefix と中央寄せ） | 内側ラッパーが代替（全 breakpoint で適用） |
| 8 | P1-variant 3 ページの `px-6 md:px-12` | 全削除 | 内側ラッパーで `px-4 md:px-8` に統一 |
| 9 | 全 P1 ページの外側 padding `px-4 py-6 md:px-8 md:py-8` | 全削除 | 内側ラッパーへ移動 |

WHEN cleanup 対象の Client Component が単一の caller からしか呼ばれていない
THE システム SHALL cleanup 後の挙動が変わらないか単一 caller の page でビジュアル確認する

---

### REQ-7: 受け入れ条件（acceptance criteria）

#### 機能面
- 全 53 ページが「全 53 ページ振り分け早見表」の通りに 2 段ラッパー構造を持つ（messages/new redirect を除く 52 ページ）
- 全 38 箇所の `<BackButton />` が PC 1440px viewport で「中央寄せ 320px 幅」に見える
- CON-006「掲載中の案件」が PC viewport で「2 列まで」で停止する
- CON-006「掲載中の案件」のグレー帯が PC viewport edge まで届いている（左右に白余白が出ない）
- schedule 3 画面のもどるボタン高さが他画面の default サイズと同じ
- BackButton コンポーネントから `size` prop インターフェースが削除されている
- 全ページの padding が `px-4 py-6 md:px-8 md:py-8` で統一されている（lg 特例は内側 padding も同じ）
- 白背景 8 ページ（CON-004、CON-006、CLI-003、CLI-004、COM-012、COM-013、COM-015、**CON-003/CLI-002**）は白背景のまま、グレー背景の他ページに干渉しない
- 本人確認系 3 ページ（COM-003、COM-004、COM-005）は **白から bg-muted（グレー）に変更**されている（仕様書レビュー後の判断による「内向き = グレー」ルール統一）

#### テスト面
- `npm run test`（Vitest）が全 PASS
- `supabase test db`（pgTAP）が全 PASS
- `npm run test:e2e`（Playwright）が全 PASS
- いずれもテスト期待値・seed の変更不要

#### 実機 QA 面（数値判定込み）

PC 1440px MacBook viewport で次を確認:
- **6xl カテゴリ**: CLI-005 ユーザー一覧で **カード 3 列、1 カード幅 340-360px** の範囲。グレー bg が viewport edge まで届く
- **4xl 詳細カテゴリ**: 
  - CLI-006 ユーザー詳細で md:flex-row 2 列セクション（空き日程 / 発注者評価）が **1 列 ≈ 420px** で表示
  - CON-006 発注者詳細で「掲載中の案件」が **2 列まで、1 カード ≈ 420px**。グレー帯は **viewport edge まで届く**
  - CON-009 メッセージ詳細で chat UI が崩れない（吹き出し配置・入力欄・スレッドヘッダー）
- **4xl 1 列リスト**: CON-001 マイページ、CON-008 メッセージ一覧で 896px 中央寄せ。グレー bg が viewport edge まで届く
- **2xl フォーム**: 
  - CLI-021 発注者情報編集、COM-002 プロフィール編集で 672px 幅の中央寄せフォーム、ProfileEditForm 再構造化後のレイアウト崩れなし
  - CLI-003 募集現場編集 / COM-012 トラブル報告で **白背景** のまま中央寄せ
- **lg 特例**: 課金管理トップ、COM-006 退会で 512px 中央寄せ。グレー bg が viewport edge まで届く
- **BackButton 統一**: 各カテゴリ代表画面で「もどる」が **すべて 320px 幅で中央寄せ**。schedule 3 画面のもどるボタン高さが他画面と同じ

FHD 1920px viewport でも上記の各画面が「左右の余白が広がっただけ」で崩れない。

SP 375px iPhone viewport で max-w が効かず（viewport < 各 max-w 値）レイアウトが現状から変わらない。

iPad 1024px viewport で 6xl カテゴリの 3 列カードグリッドが破綻しない。

---

## Out of Scope（再掲・明示的に対象外）

- `src/app/admin/` 配下の追加変更
- `src/app/(auth)/` 配下（BackChevron 別系統）
- `src/app/(support)/` 配下の **横幅統一**
- 個別ページのレイアウト最適化（PC 2 列化など）
- BackButton callers の既存 `className="w-full max-w-xs"` 等の冗長指定撤去
- **白背景 8 ページ vs グレー背景の他ページの色統一**（ユーザー判断 ③: 別タスクで議論）
- 新規 design canvas の追加・既存デザインカンプの差し替え

---

## Notes

- 本 spec は軽量 spec（option B）として `design.md` を省略
- 主要な品質担保は実機 QA。自動テストは regression check のみ
- 本タスクが landing したら以下のメモを更新:
  - `project_appwide_content_maxwidth` → 解決済み記録に更新（または歴史的記録化）
  - `project_back_button_policy` → 「BackButton 内部デフォルトで 320px 固定」を追記
  - 必要に応じて新規 feedback メモ:「page chrome の 2 段ラッパーパターン」「viewport edge 拡張は bleed-viewport utility で表現する」など汎用パターンを記録
