# 空き日程機能（schedule）— 研究・設計判断ログ

## Summary

- **Feature**: schedule（空き日程の登録・更新・削除）
- **Discovery Scope**: Extension（既存の `available_schedules` テーブル + RLS をそのまま流用、新規 UI と Server Action を追加。同時に既存 Middleware バグを修正）
- **Key Findings**:
  - DB 層は完全に整備済み（テーブル + RLS + seed）。マイグレーション不要
  - 既存 Middleware に `/availability` という存在しないパスをブロックしようとする誤記がある（実質ザル状態）。schedule 実装と同時に修正必須
  - 受注者アクションの三層防御（UI / Middleware / Server Action）は CLAUDE.md で確立済みパターン

## Research Log

### 既存 DB と RLS の状態

- **Context**: schedule 機能のデータ層がどこまで作られているかを確認する
- **Sources Consulted**:
  - `supabase/migrations/20260324160600_002_core_tables.sql:357` — `available_schedules` テーブル定義
  - `supabase/migrations/20260324161543_003_rls_policies.sql:489` — RLS ポリシー
  - `supabase/seed.sql:710` — テストデータ
- **Findings**:
  - テーブル定義（`id` / `user_id` / `start_date` / `end_date` / `note` / `created_at` / `updated_at`）は要件を満たしている
  - RLS: SELECT は認証済みユーザー全員可、INSERT/UPDATE/DELETE は `user_id = auth.uid()` のみ
  - seed に 6 件のテストデータ（受注者 `11111111-...` と `cc111111-...` 等）
- **Implications**: マイグレーション・seed の追加変更は不要。Server Action と UI 層の追加だけで完結する

### 既存 Middleware の Staff ガードバグ

- **Context**: `roles-and-permissions.md` には「Staff は CON-014〜016 アクセス不可（Middleware ブロック）」と明記されているが、実装が機能しているかを検証
- **Sources Consulted**:
  - `src/middleware.ts:443` — `pathname.startsWith("/availability")` というガード記述
  - `src/app/(authenticated)/mypage/page.tsx:34` — マイページから `/schedule` にリンク
- **Findings**:
  - 想定パスと実際のパスが食い違っている（`/availability` は存在せず、実体は `/schedule`）
  - 結果として Staff も `/schedule` に直接アクセスできる状態（実質ザル）
  - マイページ側でも Staff に「予定を確認する」セクション（応募履歴 + 空き日程）が無条件表示
- **Implications**: 既存バグ修正を schedule 機能のスコープに含める。三層防御で UI / Middleware / Server Action すべてを整える必要がある

### 日付入力 UI の既存パターン

- **Context**: 日付選択 UI を native input か shadcn DatePicker のどちらで実装するか
- **Sources Consulted**:
  - `src/components/jobs/job-form.tsx:315` — `work_start_date` / `work_end_date` / `recruit_start_date` / `recruit_end_date`
  - `src/app/(authenticated)/jobs/[id]/apply/application-form.tsx:129` — `preferred_first_work_date`
- **Findings**:
  - 既存フォーム全てが `<Input type="date">`（HTML native）に統一されている
  - shadcn の DatePicker / Calendar コンポーネントは導入実績なし
- **Implications**: 一貫性の観点から native date input を採用。新規依存追加なし。`min` 属性で過去日入力を防ぐパターンも既存と同じ

### 重複検出ロジックの実装方法比較

- **Context**: 期間重複検出を SQL 側（PostgreSQL daterange）か Application 側（TypeScript）かで実装するか
- **Sources Consulted**:
  - PostgreSQL `daterange` ドキュメント（`&&` overlap 演算子）
  - 既存 Server Action のテストパターン（Vitest による Supabase クライアントモック）
- **Findings**:
  - SQL 側: `daterange(start_date, end_date, '[]') && daterange($1, $2, '[]')` で 1 クエリ
  - Application 側: `WHERE user_id = $uid AND id != $excludeId` で全件取得し JS で `NOT (a.end < b.start OR a.start > b.end)` 判定
  - 1 ユーザーあたりの空き日程は数件〜十数件程度の想定（パフォーマンス影響軽微）
- **Implications**: Application 側の判定を採用。Vitest モックがシンプル（`daterange` SQL 演算子に対応する mock を書かなくてよい）、ロジックがテストしやすい、純粋関数として独立する

### CLI-006（職人詳細）における空き日程の表示状況

- **Context**: 登録した空き日程がどの画面に反映されるかを確認
- **Sources Consulted**:
  - `src/app/(authenticated)/users/contractors/[id]/page.tsx:100` — `available_schedules` SELECT 部分
  - `.kiro/specs/job-search/requirements.md:192` — 表示項目
  - `.kiro/steering/design-rule.md:138` — PC で発注者評価と横並び
- **Findings**:
  - CLI-006 で全ロール（contractor / client）の空き日程を表で表示する既存実装がある（全件・過去含む）
  - ロール絞り込みは `role IN ('contractor', 'client')` であり、staff は CLI-006 自体で `notFound()` 扱い
  - 受注者が長期使用すると過去日程が累積し、CLI-006 の縦が長く混雑する可能性が高い
  - デザインカンプ `design-assets/screens/CLI-006.png` は空き日程を 3 件表示で想定している
- **Implications**: schedule 機能の登録は CLI-006 に反映されるが、**直近の未来 3 件のみ表示する制限を schedule スコープに含める**（REQ-SC-004 / 後述 Decision「CLI-006 表示制限」参照）。受注者の登録自体は無制限のまま、閲覧側だけ制限する役割分担で、受注者の柔軟性と発注者の見やすさを両立する

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Server Components + Server Actions | Next.js 標準、プロジェクト全体の既存パターン | 既存と一貫、認証コンテキストが暗黙、SSR で初期表示が速い | クライアント側のリアクティブ状態管理は別途 | **採用** |
| Client Component + API Route | 全部クライアントで状態管理 | リアクティブ UX 強化 | プロジェクトの既存パターンから逸脱、認証コンテキスト渡しが煩雑 | 不採用 |
| RPC Function（PostgreSQL） | INSERT 重複チェックを SQL 関数化 | アトミック | ロジックが SQL 側に分散、テスト困難 | 不採用 |

## Design Decisions

### Decision: 重複チェックは Application レイヤで実装する

- **Context**: 既存日程との期間重複を検出する箇所を SQL / Application どちらに置くか
- **Alternatives Considered**:
  1. SQL `daterange` overlap（`&&` 演算子）
  2. Application 側で全件 SELECT 後に TypeScript 関数で判定
- **Selected Approach**: 2 を採用。Server Action 内で対象ユーザーの全空き日程を SELECT し、純粋関数 `hasOverlappingSchedule(existing, candidate, options)` で判定
- **Rationale**:
  - 1 ユーザーあたりの空き日程は数件規模、パフォーマンス影響軽微
  - Vitest テストで mock しやすい（純粋関数として境界値テストが書きやすい）
  - `note` カラムを将来 UI で扱うようになっても判定ロジックは変えなくて済む
- **Trade-offs**: クエリ 1 回追加（無視できる範囲）/ 関数として独立しテスト容易
- **Follow-up**: 大量データ時のパフォーマンスは O(N) なので現状想定では問題なし

### Decision: メモ欄は UI に表示しない（DB カラムは残す）

- **Context**: requirements.md 初版にあった「メモ欄」を最終的に UI 非対応とする判断
- **Alternatives Considered**:
  1. デザインカンプ準拠で UI 完全非対応（DB カラムも将来削除）
  2. 仕様書準拠で UI に Textarea を追加
- **Selected Approach**: UI 非対応。DB カラム `note` はスキーマ上残す（NULL のまま運用）
- **Rationale**: デザインカンプ優先（CLAUDE.md ルール）。空き日程の本質は日付範囲なのでメモは無くても運用可能。将来要望があれば UI 追加で対応できる
- **Trade-offs**: DB カラムが死ぬ vs 将来追加する自由度を保てる
- **Follow-up**: 半年運用しても note 要望が無ければマイグレーションで列削除を検討

### Decision: 「もどる」ボタンは全画面で href 固定

- **Context**: Save 後リダイレクトでブラウザ履歴に編集画面が残り、`router.back()` で意図しない画面に戻るバグ（CLAUDE.md「BackButton の `href` 明示の例外パターン」）
- **Alternatives Considered**:
  1. `router.back()` で前画面へ戻る（汎用パターン）
  2. 各画面ごとに href を固定（CLI-020 / 022 / 023 と同じ防御）
- **Selected Approach**: 2 を採用。CON-014 → `/mypage`、CON-015 / 016 → `/schedule`
- **Rationale**: ループバグの再発防止。既存の防御パターンと一貫
- **Trade-offs**: 履歴を辿れない（戻り先が固定）vs ループしない確実性

### Decision: 重複の警告はソフト警告（toast.warning）に限定

- **Context**: 重複時の UX をどう設計するか
- **Alternatives Considered**:
  1. 一覧と登録の両方で⚠表示 + ツールチップ（仕様書原案）
  2. 登録/更新時のみ `toast.warning`
  3. 完全省略
- **Selected Approach**: 2 を採用
- **Rationale**: スマホでツールチップ（hover）が機能しない / ユーザーが気づくべきは登録の瞬間 / 一覧のレイアウト変更を避ける
- **Trade-offs**: 後から重複に気づきにくい（ただし削除ボタンで個別対処可能）

### Decision: 既存 Middleware バグの修正を schedule スコープに含める

- **Context**: `/availability` ガード誤記をどのタイミングで修正するか
- **Alternatives Considered**:
  1. schedule 機能と分離して別 PR で修正
  2. schedule 実装と同一スコープで修正
- **Selected Approach**: 2 を採用
- **Rationale**: 分離するとリグレッションになる（schedule 実装が完成した瞬間に staff から書き込めてしまう）/ 同一スコープなら整合性検証が一回で済む
- **Trade-offs**: コミット粒度が複合 vs 機能の整合性

### Decision: CLI-006（職人詳細）で空き日程を直近の未来 3 件のみ表示する

- **Context**: 受注者が長期使用すると CLI-006 の「空き日程」セクションが縦に長く混雑する。発注者にとって過去日程は判断材料にならない
- **Alternatives Considered**:
  1. 現状維持（全件・過去含めて表示） — schedule の Non-Goal として CLI-006 を変更しない
  2. 受注者の登録自体を 3 件までに制限する
  3. CLI-006 の閲覧側で「直近の未来 3 件のみ」に制限する
  4. 「これから」「過去」をセクション分けする / 「もっと見る」リンクで折りたたむ
- **Selected Approach**: 3 を採用。CLI-006 のクエリに `.gte("end_date", todayIso).limit(3)` を追加（`available_schedules` SELECT に閲覧側フィルターを加える）
- **Rationale**:
  - 受注者の登録柔軟性を保ちつつ、発注者画面の混雑を解消できる
  - デザインカンプ `design-assets/screens/CLI-006.png` が 3 件表示を想定している
  - 過去日程は発注者にとって判断材料にならない（過ぎた期間は発注のしようがない）
  - 案 2 は受注者の使い勝手を大きく損なう（月単位の予定を 3 件で表現するのは現実的でない）
  - 案 4 はデザインカンプから大きく逸脱、実装コスト高
- **Trade-offs**: 4 件目以降の未来予定は CLI-006 では見えなくなる（発注者は「メッセージ・スカウト」等の他チャネルで確認） / 実装は 1 行追加で完了
- **Follow-up**: 運用後に「もっと見たい」要望が出たら、別 spec で「もっと見る」リンクや展開機能を追加検討

### Decision: 「既存実装の事前修正」を schedule スコープに含める範囲（最終形）

- **Context**: schedule 実装に伴って既存コードの修正が必要なものを、どこまで同一スコープに含めるか
- **Alternatives Considered**:
  1. schedule 機能のみ実装、既存コード修正は別 PR
  2. schedule 実装と同一スコープで、関連する既存修正もまとめて実施
- **Selected Approach**: 2 を採用。以下 3 つを同一スコープに含める:
  1. Middleware `/availability` ガード誤記の修正（既存バグ）
  2. マイページの「予定を確認する」セクションを Staff から非表示に（既存バグ + UX 整合）
  3. CLI-006 の空き日程クエリ修正（REQ-SC-004 — 表示混雑対策）
- **Rationale**: 1 と 2 は schedule 機能と分離するとリグレッションリスク（schedule 実装直後に Staff からも書き込めてしまう、または UI 経由で誘導できてしまう）。3 は schedule 機能の延長線上の調整で、実装後に「混雑する」状態を放置しないほうが完成度が高い
- **Trade-offs**: コミット粒度が複合（1 機能 1 コミット原則からの逸脱）vs 機能の整合性とリグレッション防止

## Risks & Mitigations

- **Middleware 修正の漏れ**: `/availability` → `/schedule` の置換忘れ。**Mitigation**: tasks.md の独立タスクで明示し、Playwright E2E で staff ロールの直叩きリダイレクトを検証
- **マイページ Section 2 の二重表示**: staff に応募履歴も同時に出てしまう既存問題。**Mitigation**: セクションごと `{!isStaff && (...)}` で囲む。E2E で staff ロールのマイページに「予定を確認する」見出しが無いことを確認
- **重複判定の境界値（同日同時刻）**: `[start_date, end_date]` の閉区間として扱うか半開区間か。**Mitigation**: 仕様上 `date` 型（時刻なし）なので「同じ日付がどちらかに含まれれば重複」という閉区間判定で統一。`hasOverlappingSchedule` のユニットテストで境界値を網羅
- **法人 Owner（client）が schedule を登録した際の表示**: CLI-006 のクエリは `role IN ('contractor', 'client')` を許容するため Owner も表示対象。**Mitigation**: requirements.md にて「Owner も登録可能」と明記済み。CLI-006 側の表示制御は schedule 機能のスコープ外（既存挙動維持）
- **タイムゾーン差で「今日」が前日扱い**: クライアント側 JST と UTC の差で過去日扱いされる可能性。**Mitigation**: Zod 側で `setHours(0, 0, 0, 0)` でローカル日付に正規化、HTML `min` 属性は `toISOString().slice(0, 10)` の代わりにローカル日付文字列を使う

## References

- `.kiro/steering/roles-and-permissions.md` — 担当者の受注者アクション制限
- `.kiro/steering/database-schema.md` — `available_schedules` テーブル + RLS
- `.kiro/steering/design-rule.md` — CLI-006 レイアウト
- `CLAUDE.md` — 三層防御 / BackButton href / Server Actions 戻り値形式 / Vitest モックルール
- `supabase/migrations/20260324160600_002_core_tables.sql` — テーブル定義
- `supabase/migrations/20260324161543_003_rls_policies.sql` — RLS ポリシー
- `src/components/jobs/job-form.tsx` — native date input の既存パターン
- `src/app/(authenticated)/users/contractors/[id]/page.tsx` — CLI-006 における空き日程表示
