# Requirements Document

## Project Description (Input)

**プロジェクト名**: 受注者プロフィール 3 マスタ整備（master-skills）

### 背景

建設業職人マッチングサービス「ビジ友」の受注者プロフィールには、これまで以下 3 種のデータが混在していた:

- **対応職種**（`user_skills.trade_type`）: TRADE_TYPES 13 値の固定リスト
- **保有スキル**（`users.skill_tags text[]`）: 自由入力タグ
- **保有資格**（`user_qualifications.qualification_name`）: 自由入力

このうち TRADE_TYPES が 13 値しかなく、業界実態と乖離していた。さらに CLI-005 等の検索ポップアップで「保有スキル」「保有資格」フィルターに TRADE_TYPES プルダウンを誤用しているバグも発生中。

本プロジェクトでは 3 マスタを DB テーブル化し、検索バグも合わせて根本解決する。また、発注者プロフィールの「募集職種」（`client_profiles.recruit_job_types`）も同じ trade-types マスタを参照する形に整える。

### プレリリース前提

**現在はリリース前のため、既存ユーザーデータの移行戦略は不要**。旧 `TRADE_TYPES` 13 値は丸ごと削除し、新マスタで再投入する。テストデータ（`supabase/seed.sql`）も新マスタの値で書き直す。

### マスタ素材（クリーニング完了 2026-05-14）

- `.kiro/specs/master-skills/raw-data/cleaned/trade-types.txt` — 113 行（`大カテ/中カテ｜末端` の 2 階層を label 内 prefix で表現）
- `.kiro/specs/master-skills/raw-data/cleaned/qualifications.txt` — 599 行（フラット）
- `.kiro/specs/master-skills/raw-data/cleaned/skill-tags.txt` — 244 行（フラット）
- 整理過程の判断記録は `cleaned/cleaning-notes.md`

### 確定済み設計原則

1. 全マスタとも DB テーブル化（`master_trade_types` / `master_qualifications` / `master_skill_tags`）。スキーマは `(id, label, deprecated_at)` の最小構成
2. 階層構造は trade-types の label 内 prefix のみ。DB 上はフラット。別カラム化しない
3. 入力 UI は単一入力枠 + インクリメンタル検索（既存の複数プルダウン UI は廃止）
4. 個数制限: 全マスタ DB レベルでは無制限。UI で「主要 N 件 + 折りたたみ」表示
5. 必須/任意: trade-types のみ signup 時に必須 1 件以上。skill-tags / qualifications は profile edit で任意
6. 経験年数: trade-type ごとに必須維持（入力負担を「適当な大量登録」の抑止メカニズムとして活用）
7. カッコ表記: 全マスタとも全角『（）』に統一済み
8. マスタ追加: クローズ運用。admin が migration + Supabase ダッシュボードで更新。ユーザー側「追加リクエスト」機能は作らない
9. 論理削除: 全マスタテーブルに `deprecated_at timestamptz null` を持たせる。廃止項目は新規選択から除外、既存ユーザーの値は保持して「（廃止）」サフィックス表示
10. **ユーザー側カラムの保存方式: label 文字列をそのまま保存する**（denormalization）。マスタは「正本の選択肢リスト」として機能し、入力時に label をコピーする。これにより約 25 画面の表示クエリ書き換えを回避する

---

## Introduction

本仕様は、ビジ友サービスの受注者プロフィールで利用する 3 種のマスタデータ（対応職種・保有資格・保有スキル）を DB テーブル化し、既存の検索バグを合わせて修正する基盤整備プロジェクトの要件を定義する。

**ゴール:**

1. 3 マスタを `master_trade_types` / `master_qualifications` / `master_skill_tags` の 3 テーブルに正規化し、クリーニング済みデータ（113 / 599 / 244 件）を投入する
2. 入力 UI を「単一入力枠 + インクリメンタル検索」に統一する
3. CLI-005 等の検索ポップアップに残る「`TRADE_TYPES` を保有スキル/保有資格に誤用」バグを解消する
4. 発注者プロフィール（`client_profiles.recruit_job_types`）も同じ trade-types マスタを参照する形に整える
5. プレリリース前提でテストデータを刷新し、旧 13 値の TRADE_TYPES を完全に廃止する

**スコープ外（明示的に含めない）:**

- ユーザー側「マスタ追加リクエスト」機能（admin 専用運用に固定）
- ネイティブアプリ・PWA 対応
- マスタの多言語化
- ピン留め・人気度ベースのソート（Requirement 15 で未決のまま保留）

**用語定義:**

| 用語 | 意味 |
|------|------|
| マスタ | サービス全体で共有する選択肢の正本データ。`(id, label, deprecated_at)` の最小スキーマで管理する DB テーブル |
| 対応職種（trade type） | 受注者が「対応できる仕事の種類」として登録する大分類（例: 建築/躯体｜大工）。経験年数とセットで保存。1 ユーザー複数登録可（無制限） |
| 募集職種 | 発注者が `client_profiles.recruit_job_types` で「会社として募集する仕事の種類」として登録する値。trade-types マスタを共用する |
| 保有資格（qualification） | 受注者が保有する資格（例: 1 級建築士、玉掛技能者）。1 ユーザー複数登録可（無制限） |
| 保有スキル（skill tag） | 受注者の自己 PR 用タグ（道具・機械・材料・抽象スキル等。例: 型枠設置、トーチランプ）。1 ユーザー複数登録可（無制限） |
| label 保存方式 | ユーザー側のカラム（`user_skills.trade_type` 等）にマスタの id ではなく label 文字列をそのまま保存する方式。表示クエリの書き換え範囲を最小化する |
| インクリメンタル検索 | 入力途中で候補をリアルタイムに絞り込む UI パターン。combobox とも呼ぶ |
| 主要 N 件 + 折りたたみ | プロフィール表示時、最初の N 件のみ表示し、残りは「もっと見る」操作で展開する見せ方 |
| 論理削除 | レコードを物理削除せず `deprecated_at` に削除日時を入れて「廃止扱い」にする方式 |

---

## 影響範囲（実調査結果）

`grep` による全数調査の結果、**約 27 画面 / 約 50 ファイル**が影響を受ける。画面名は `.kiro/steering/screen-map.md` の正式名に揃える。

### 改修対象 27 画面の一覧

| # | 画面 ID | パス（または機能名） | 役割（screen-map 正式名） | 主な触り方 |
|---|---------|--------------------|------------------------|-----------|
| 1 | AUTH-006 | `register/profile` | 新規会員登録情報入力 | 3 マスタ入力 UI を新方式に置換 |
| 2 | COM-001 | `profile` | プロフィール詳細（受注者） | 「主要 N 件 + 折りたたみ」表示、廃止項目は編集画面のみサフィックス |
| 3 | COM-002 | `profile/edit` | プロフィール編集（受注者） | 3 マスタ入力 UI を新方式に置換 |
| 4 | CON-001 | `mypage` | マイページ | プロフィールサマリーで trade_type 表示 + 応募可否マッチングロジック |
| 5 | CON-002 | `jobs/search` | 募集案件一覧 | 「募集職種」フィルターを新マスタ参照に置換（複数選択 OR） |
| 6 | CON-003 | `jobs/[id]` | 募集案件詳細 | 募集職種全件表示 + 応募ボタンの可否判定 |
| 7 | CON-004 | `jobs/[id]/apply` | 応募情報入力 | 案件サマリーで募集職種表示 + 応募可否のサーバー側ガード |
| 8 | CON-007 | `favorites` | マイリスト | カード内の trade_types / recruit_job_types 表示（2 件 + 他） |
| 9 | CON-009 / CLI-013 | `messages/[threadId]` | メッセージ/スカウト詳細（共通コンポーネント） | スカウト情報カード内の trade_types 表示（2 件 + 他） |
| 10 | CON-011 | `applications/history` | 応募履歴一覧 | カード内の trade_types 表示（2 件 + 他） |
| 11 | CON-012 | `applications/history/[id]` | 応募詳細（受注者側） | 案件の trade_types 表示（2 件 + 他） |
| 12 | CLI-001 | `jobs/manage` | 募集現場一覧 | カード内の trade_types 表示（2 件 + 他） |
| 13 | CLI-002 | `jobs/[id]?manage=true` | 募集現場詳細（管理用 UI） | 募集職種表示。`jobs/[id]/page.tsx` を CON-003 と共有 |
| 14 | CLI-003 | `jobs/[id]/edit` | 募集現場編集 | 募集職種入力 UI を新方式に置換（複数選択） |
| 15 | CLI-004 | `jobs/create` | 募集現場新規登録 | 募集職種入力 UI を新方式に置換（複数選択） |
| 16 | CLI-005 | `users/contractors` + `contractor-search-filter` | ユーザー一覧（職人一覧）+ 検索ポップアップ | **TRADE_TYPES 誤用バグの本丸**。3 マスタフィルター全置換（複数選択 OR） |
| 17 | CLI-006 | `users/contractors/[id]` | ユーザー詳細（職人詳細） | 3 マスタ全表示（5 件 + もっと見る） |
| 18 | CLI-007 | `applications/received` | 応募一覧（mypage 導線） | 応募者の trade_type 表示（2 件 + 他） |
| 19 | CLI-007B | `jobs/[id]/applicants` | 案件応募者一覧 | 応募者の trade_type 表示（2 件 + 他） |
| 20 | CLI-008 | `applications/received/[id]` | 応募詳細 | 応募者の 3 マスタ + 案件 trade_types 表示（すべて 2 件 + 他） |
| 21 | CLI-009 | `applications/received/[id]/decide` | 発注可否 | 応募者の trade_type + 案件 trade_types 表示（2 件 + 他） |
| 22 | CLI-010 | `applications/orders` | 発注履歴一覧 | 応募者の trade_type 表示（2 件 + 他） |
| 23 | CLI-011 | `applications/orders/[id]` | 発注履歴詳細 | 応募者の 3 マスタ + 案件 trade_types 表示（すべて 2 件 + 他） |
| 24 | CLI-015 | `messages/scout-send` | スカウト送信 | 案件の trade_types 表示（2 件 + 他） |
| 25 | CLI-020 | `mypage/client-profile` | 発注者情報詳細 | recruit_job_types 表示 |
| 26 | CLI-021 | `mypage/client-profile/edit` | 発注者情報編集 | recruit_job_types 入力 UI を新方式に置換 + カテゴリ一括選択 |
| 27 | CON-005 / CON-006 | `clients` + `clients/[id]` + `client-search-form` | 発注者一覧 + 発注者詳細 + 検索ポップアップ | recruit_job_types フィルター・表示を新マスタ参照に置換（複数選択 OR） |

### 改修ファイル全リスト（カテゴリ別、約 50 ファイル）

**A. 定数・型・バリデーション（5 ファイル）**
- `src/lib/constants/options.ts` — TRADE_TYPES 定数（削除）
- `src/lib/validations/profile.ts` — qualifications / skillTags の Zod
- `src/lib/validations/client-profile.ts` — recruitJobTypes の Zod
- `src/types/database.ts` — `supabase gen types` で再生成
- 関連バリデーションテスト

**B. 受注者プロフィール（4 ファイル）**
- `src/app/(auth)/register/profile/page.tsx`
- `src/app/(authenticated)/profile/page.tsx`
- `src/app/(authenticated)/profile/edit/profile-edit-form.tsx`
- `src/app/(authenticated)/profile/edit/actions.ts`

**C. 発注者プロフィール（4 ファイル）**
- `src/app/(authenticated)/mypage/client-profile/page.tsx`
- `src/app/(authenticated)/mypage/client-profile/edit/page.tsx`
- `src/app/(authenticated)/mypage/client-profile/edit/client-profile-edit-form.tsx`
- `src/app/(authenticated)/mypage/client-profile/actions.ts`

**D. 検索画面（6 ファイル）**
- `src/app/(authenticated)/users/contractors/page.tsx`
- `src/app/(authenticated)/users/contractors/contractor-search-filter.tsx`
- `src/app/(authenticated)/users/contractors/[id]/page.tsx`
- `src/app/(authenticated)/clients/page.tsx`
- `src/app/(authenticated)/clients/client-search-form.tsx`
- `src/app/(authenticated)/clients/[id]/page.tsx`

**E. 案件（13 ファイル）**
- `src/components/jobs/job-form.tsx`（共通フォーム部品 — CLI-003 編集 / CLI-004 新規作成 で共有）
- `src/app/(authenticated)/jobs/actions.ts`
- `src/app/(authenticated)/jobs/create/page.tsx`（CLI-004 募集現場新規登録）
- `src/app/(authenticated)/jobs/search/page.tsx`（CON-002 募集案件一覧）
- `src/app/(authenticated)/jobs/search/job-search-filter.tsx`
- `src/app/(authenticated)/jobs/search-actions.ts`
- `src/app/(authenticated)/jobs/[id]/page.tsx`（CON-003 募集案件詳細 / CLI-002 募集現場詳細を URL `?manage=true` で分岐表示）
- `src/app/(authenticated)/jobs/[id]/edit/page.tsx`（CLI-003 募集現場編集）
- `src/app/(authenticated)/jobs/[id]/apply/page.tsx`（CON-004 応募情報入力）
- `src/app/(authenticated)/jobs/[id]/applicants/page.tsx`（CLI-007B 案件応募者一覧）
- `src/app/(authenticated)/jobs/manage/page.tsx`（CLI-001 募集現場一覧）
- `src/app/(authenticated)/jobs/manage/job-list-client.tsx`
- `src/components/job-search/job-list-card.tsx`

**F. 応募（7 ファイル）**
- `src/app/(authenticated)/applications/received/page.tsx`
- `src/app/(authenticated)/applications/received/[id]/page.tsx`
- `src/app/(authenticated)/applications/received/[id]/decide/page.tsx`
- `src/app/(authenticated)/applications/orders/page.tsx`
- `src/app/(authenticated)/applications/orders/[id]/page.tsx`
- `src/app/(authenticated)/applications/history/page.tsx`
- `src/app/(authenticated)/applications/history/[id]/page.tsx`

**G. メッセージ・スカウト（5 ファイル）**
- `src/app/(authenticated)/messages/[threadId]/page.tsx`
- `src/app/(authenticated)/messages/scout-send/page.tsx`
- `src/components/messaging/message-bubble.tsx`
- `src/components/messaging/message-list.tsx`
- `src/components/messaging/scout-info-card.tsx`

**H. その他（2 ファイル）**
- `src/app/(authenticated)/mypage/page.tsx`
- `src/app/(authenticated)/favorites/page.tsx`

**I. DB・マイグレーション・seed（7 ファイル + 新規 migration 2 本）**
- `supabase/migrations/...002_core_tables.sql`（既存スキーマ）
- `supabase/migrations/...004_indexes.sql`（既存インデックス）
- `supabase/migrations/...006_complete_registration.sql`（RPC）
- `supabase/migrations/...007_update_profile.sql`（RPC）
- `supabase/migrations/...add_skill_tags_to_users.sql`
- `supabase/migrations/...update_profile_rpc_skill_tags.sql`（RPC）
- `supabase/seed.sql`
- ＋本仕様で追加する新規 migration 1: マスタ 3 テーブル作成 + データ投入
- ＋本仕様で追加する新規 migration 2: `jobs.trade_type text` → `jobs.trade_types text[]` への列改名 + 型変更 + インデックス再作成

**J. テスト（4 ファイル）**
- `src/__tests__/profile/validations.test.ts`
- `src/__tests__/organization/client-profile-actions.test.ts`
- `e2e/profile.spec.ts`
- `e2e/scout-application.spec.ts`

### label 保存方式（denormalization）の利点

ユーザー側カラム（`user_skills.trade_type`, `users.skill_tags`, `user_qualifications.qualification_name`, `jobs.trade_type`, `client_profiles.recruit_job_types`）は **マスタの label をそのままコピーして保存する**。これにより:

- 上記カテゴリ B〜H の **表示部分はクエリ書き換え不要**（現状の `{job.trade_type}` のままで動く）
- 検索クエリも現状の `eq` / `overlaps` がそのまま動く
- マスタ参照は「入力 UI」と「検索ポップアップの候補生成」の中だけに局所化される
- 触る範囲が劇的に減る

トレードオフ: マスタの label を後で変更すると、ユーザー側に既に保存された値は古い label のまま残る。ただし運用初期で label の変更頻度は低いと想定し、必要時には migration の `UPDATE` で一括書き換えする。

---

## Requirements

### Requirement 1: 3 マスタテーブルの DB 基盤整備

**Objective:** As a プラットフォーム開発者, I want 3 マスタを共通スキーマの DB テーブルとして用意したい, so that 受注者プロフィール・発注者プロフィール・案件投稿・検索の各機能から一貫した選択肢として参照できる。

#### Acceptance Criteria

1. The ビジ友 DB shall マスタ用テーブル `master_trade_types` / `master_qualifications` / `master_skill_tags` を 3 つ提供する
2. The ビジ友 DB shall 各マスタテーブルに最小カラム `id (uuid PK)` / `label (text NOT NULL UNIQUE)` / `deprecated_at (timestamptz NULL)` / `created_at (timestamptz NOT NULL DEFAULT now())` / `updated_at (timestamptz NOT NULL DEFAULT now())` を持たせる
3. The ビジ友 DB shall マスタテーブルにカテゴリ・親子関係を表す追加カラム（parent_id / category / sort_order 等）を持たせず、階層は trade_types の `label` 文字列内の prefix（`大カテ/中カテ｜末端` 形式）のみで表現する
4. The ビジ友 DB shall マスタテーブルに対するインクリメンタル検索を実用速度で行えるよう、`label` カラムに対し検索効率を確保するインデックス（部分一致対応のため `pg_trgm` 拡張 + GIN を spec-design で検討）を持つ
5. The ビジ友 DB shall 全マスタテーブルに対し RLS を有効化したうえで、`SELECT` を全ユーザー（anon / authenticated 双方）に開放し、`INSERT` / `UPDATE` / `DELETE` は service_role のみ可能とする
6. The ビジ友 DB shall マスタテーブルに対する `INSERT` / `UPDATE` で `updated_at` を自動更新するトリガーを持つ
7. If 同一 label のレコードを `INSERT` しようとする, then the ビジ友 DB shall UNIQUE 制約違反として拒否する
8. The ビジ友 サービス shall ユーザー側のカラム（`user_skills.trade_type`, `users.skill_tags`, `user_qualifications.qualification_name`, `jobs.trade_types`, `client_profiles.recruit_job_types`）にマスタの `id` ではなく `label` 文字列を保存する（denormalization 方式）
9. The ビジ友 アプリケーション shall ユーザー側カラムへの保存時に「保存対象の label が `master_xxx.label` に存在し、かつ `deprecated_at IS NULL` であること」を Server Action 層でバリデーションする

---

### Requirement 2: マスタ初期データの投入

**Objective:** As a プラットフォーム運用者, I want クリーニング済みの 3 マスタ素材を migration で正本データとして投入したい, so that 全環境（local / staging / production）が同一の初期データから動作する。

#### Acceptance Criteria

1. The ビジ友 マイグレーションシステム shall `cleaned/trade-types.txt`（113 行）の全行を `master_trade_types` に投入する
2. The ビジ友 マイグレーションシステム shall `cleaned/qualifications.txt`（599 行）の全行を `master_qualifications` に投入する
3. The ビジ友 マイグレーションシステム shall `cleaned/skill-tags.txt`（244 行）の全行を `master_skill_tags` に投入する
4. When マイグレーションが投入する各レコードを生成する, the ビジ友 マイグレーションシステム shall `label` を素材ファイルの 1 行（前後空白トリム済み）と完全一致させ、追加の正規化を行わない
5. If 素材ファイルの行内に空行や `#` で始まるコメント行が含まれる, then the ビジ友 マイグレーションシステム shall それらをスキップしてレコード化しない
6. The ビジ友 マイグレーションシステム shall 全マスタの初期投入レコードについて `deprecated_at` を NULL とする
7. The ビジ友 マイグレーションシステム shall マスタ投入後の総レコード数を local の `supabase db reset` で `(113, 599, 244)` であることを検証可能にする（pgTAP テストまたは migration 内の `RAISE NOTICE` で確認）
8. The ビジ友 マイグレーションシステム shall 素材ファイルそのもの（`raw-data/cleaned/*.txt`）はリポジトリに保全し、migration からはそのファイルを SQL に展開する形ではなく、整形済みの `INSERT` 文として埋め込む（DB の自己完結性を担保する）
9. The ビジ友 マイグレーション運用 shall `raw-data/cleaned/*.txt` から SQL の `INSERT` 文を生成するスクリプト（TypeScript / Node.js で実装）を `scripts/` 配下にコミットし、将来のマスタ更新時に再利用可能にする。生成された SQL は migration ファイルに直接埋め込む

---

### Requirement 3: 受注者プロフィール入力 UI の単一入力枠化

**Objective:** As a 受注者, I want 3 マスタの登録を統一された単一入力枠 + インクリメンタル検索で完結させたい, so that 大量の選択肢から自分に合う項目を素早く見つけて登録できる。

#### Acceptance Criteria

1. The 受注者プロフィール画面（COM-001 / COM-002 / register/profile） shall 「対応職種」「保有資格」「保有スキル」の入力 UI を、それぞれ 1 つの単一入力枠（combobox）に統一する
2. When ユーザーが入力枠に文字を入力する, the 受注者プロフィール画面 shall `master_xxx.label` を部分一致で検索し、`deprecated_at IS NULL` のレコードを候補として表示する
3. When ユーザーが候補を選択する, the 受注者プロフィール画面 shall 選択値の label をユーザー側カラム（テキスト配列または別テーブルの text 値）に追加し、入力枠をクリアして次の入力を受け付ける
4. When ユーザーが入力済みリストの項目を削除操作する, the 受注者プロフィール画面 shall そのエントリのみをリストから削除する
5. While ユーザーが対応職種を 1 件以上登録するまで, the 受注者プロフィール画面 shall プロフィール保存ボタンを非活性にする（trade-types のみ必須 1 件以上）
6. The 受注者プロフィール画面 shall 保有資格・保有スキルについて未入力（0 件）での保存を許可する
7. When ユーザーが対応職種を 1 件追加する, the 受注者プロフィール画面 shall その職種に対応する「経験年数」入力枠を同時に必須項目として表示する
8. If ユーザーが対応職種に経験年数を入力せず保存しようとする, then the 受注者プロフィール画面 shall エラーメッセージ「経験年数を入力してください」を該当行に表示し、保存を拒否する
9. The 受注者プロフィール画面 shall 同じ master label を同一ユーザーが 2 回以上選択することを抑止する（候補リストから既選択分を除外、または選択時にエラー表示）
10. The 受注者プロフィール画面 shall DB レベルの個数上限を設けず、ユーザーが追加したい件数だけ追加可能とする
11. The 受注者プロフィール画面 shall 旧 UI（複数プルダウン・3 件まで制限）を完全に廃止する
12. The 受注者プロフィール画面 shall インクリメンタル検索の応答を実用速度（候補 599 件の中で 200ms 程度以内）で返す（クライアント側全件キャッシュ vs サーバー検索の選択は spec-design で確定する）
13. Where ユーザーが既登録の項目が後日 `deprecated_at` 設定で廃止された場合, the 受注者プロフィール画面 shall その項目を編集画面で「（廃止）」サフィックス付きで表示し、保存時に当該項目を勝手に削除しない（ユーザーが明示削除した場合のみ削除する）
14. When ユーザーが対応職種を 1 件追加する, the 受注者プロフィール画面 shall その項目と同じ大カテゴリ／中カテゴリ配下にある他の trade-types マスタ項目を「関連候補（同じ系統の職種）」として下方にサジェスト表示する（既選択分は除外）
15. When ユーザーが関連候補から項目を選択する, the 受注者プロフィール画面 shall それを入力済みリストに追加し、追加時に経験年数の入力欄も併せて表示する
16. The 受注者プロフィール画面 shall 関連候補表示を「閉じる」「スキップ」操作で非表示にできるようにし、選択は任意とする
17. The 関連候補サジェスト機能 shall trade-types マスタにのみ適用し、qualifications / skill_tags マスタには適用しない（後者はフラット構造で系統がないため）

---

### Requirement 4: プロフィール表示 UI の「主要 N 件 + 折りたたみ」化

**Objective:** As a 発注者 / 受注者プロフィール閲覧者, I want 受注者の対応職種・保有資格・保有スキルを冗長にならない件数で確認したい, so that スクロール量を抑えつつ必要なら全件を展開できる。

#### Acceptance Criteria

1. The 受注者プロフィール表示画面（CLI-006 / COM-001 等） shall 各マスタ項目について最初の N 件のみ初期表示し、残りは「もっと見る」操作で展開する
2. The 受注者プロフィール表示画面 shall マスタごとの N 値を画面ファイル内の定数として持ち、DB 制約として持たない（UI 層の調整で変更可能とする）
3. When ユーザーが「もっと見る」を操作する, the 受注者プロフィール表示画面 shall 残り全件をその場に展開する
4. The 受注者検索結果カード（CLI-005 リストカード）等のリスト UI shall 各マスタ項目について「主要 M 件 + 他」形式のサマリー表示を行う（M は画面ごとに固定）。表示例:「大工、塗装工、他」
5. The 受注者プロフィール表示画面 shall 保存されている label をそのまま表示し、廃止判定・サフィックス付与は行わない（廃止マークは編集画面でのみ表示する。Requirement 9 AC-3 / AC-9 参照）
6. The 受注者プロフィール表示画面 shall 表示対象が 0 件のマスタについては、セクション自体を非表示にする
7. The 受注者プロフィール表示画面 shall N 値のデフォルトを「対応職種: 5 件 / 保有資格: 5 件 / 保有スキル: 8 件」とし、spec-design でデザインカンプに合わせて最終調整する
8. The リストカード UI、応募関連画面のサマリー部（CLI-007 / CLI-007B / CLI-008 / CLI-009 / CLI-010 / CLI-011）、スカウト・メッセージ画面（CON-009 / CLI-013 / CLI-015） shall M 値のデフォルトを「対応職種: 2 件 / 保有スキル: 2 件 / 保有資格: 2 件」とする。新マスタの label が短くカードに余裕がある場合は spec-design で M=3 への引き上げを検討してよい
9. The リストカード UI shall ユーザーの登録件数が M 件以下の場合、「他」を表示せず、全件をそのまま表示する（例: 登録 2 件のとき「大工、塗装工」のみ）
10. The リストカード UI shall 件数の数値表示は行わない（「他 5 件」ではなく「他」のみ表示する）

---

### Requirement 5: 検索画面の TRADE_TYPES 誤用バグ修正と新マスタ参照化

**Objective:** As a ビジ友ユーザー（受注者・発注者ともに）, I want 検索ポップアップで「対応職種」「保有スキル」「保有資格」を正しいマスタから絞り込みたい, so that 検索結果が実態に即したものになる。

#### Acceptance Criteria

1. The CLI-005 検索ポップアップ（`contractor-search-filter.tsx`） shall 「対応職種」フィルターを `master_trade_types` から **複数選択可能な** combobox に置き換える
2. The CLI-005 検索ポップアップ shall 「保有スキル」フィルターを `master_skill_tags` から **複数選択可能な** combobox に置き換える（**TRADE_TYPES 誤用バグ修正**）
3. The CLI-005 検索ポップアップ shall 「保有資格」フィルターを `master_qualifications` から **複数選択可能な** combobox に置き換える（**ハードコード 10 値の廃止**）
4. The CON-005 検索ポップアップ（`client-search-form.tsx`） shall 「募集職種」フィルターを `master_trade_types` から **複数選択可能な** combobox に置き換える
5. The CON-002 検索ポップアップ（`job-search-filter.tsx`） shall 「募集職種」フィルターを `master_trade_types` から **複数選択可能な** combobox に置き換える
6. When ユーザーが検索ポップアップで条件を選択して検索する, the 検索結果ページ shall 選択された label を OR 条件で結合し、配列カラム（`jobs.trade_types` / `client_profiles.recruit_job_types` / `users.skill_tags` 等）は `overlaps()` で絞り込みを行う
7. The 検索ポップアップ shall 個別条件のクリア操作（×ボタン）と一括クリア操作の双方を提供する
8. When ユーザーが検索を実行する, the 検索ポップアップ shall ポップアップを自動的に閉じ、URL の searchParams に選択された label を配列形式でエンコードして反映する（同名パラメータの繰り返し、または カンマ区切り）
9. The 検索結果ページ shall フィルター条件を URL searchParams を Single Source of Truth として保持し、`router.back()` での状態不整合を発生させない（既存パターンを踏襲）
10. The 検索フィルター shall 選択件数に上限を設けない（実用上 10 件程度を想定し、UI レイアウトの破綻が懸念される場合は spec-design で軽い警告表示等を検討してよい）
11. The 検索フィルター shall 複数選択された label のいずれかにマッチする結果を返す（AND 検索ではなく OR 検索とする）
12. When 検索フィルターに何も選択されていない場合, the 検索結果ページ shall そのマスタ項目では絞り込みを行わず、全件を対象とする

---

### Requirement 6: 案件投稿フォームの trade_type 新マスタ移行

**Objective:** As a 発注者, I want 案件投稿時の募集職種を新マスタ（113 件）から選択したい, so that 業界実態に即した職種粒度で募集が出せる。

#### Acceptance Criteria

1. The 案件投稿フォーム（`components/jobs/job-form.tsx`） shall 「募集職種」入力欄を `master_trade_types` から選択する **複数選択可能な** combobox に置き換える
2. The 案件投稿フォーム shall 1 案件あたりの募集職種を **複数登録可能**とする（個数上限なし、実用上 1〜5 件を想定）
3. When 発注者が募集職種候補から選択する, the 案件投稿フォーム shall 選択値の `master_trade_types.label` を `jobs.trade_types text[]` に追加保存する
4. The 案件投稿フォーム shall 旧 13 値の TRADE_TYPES 固定プルダウンを完全に廃止する
5. The 案件編集フォーム（CLI-003, `jobs/[id]/edit`）および案件新規作成フォーム（CLI-004, `jobs/create`） shall 現値（配列、新規作成時は空配列）を読み込んで combobox に表示し、新マスタからの選択を可能にする
6. If 発注者が `deprecated_at` 設定済みの職種を持つ既存案件を編集する, then the 案件編集フォーム shall 編集画面で「（廃止）」サフィックス付きで現値を表示し、保存時には新規候補リストから廃止項目を除外する
7. The 案件投稿フォーム shall 「カテゴリで一括選択」機能を提供しない（発注者プロフィールの `recruit_job_types` とは異なり、個別案件は対象職種を厳選するため）
8. While 案件投稿フォームで募集職種が 1 件も選択されていない間, the 案件投稿フォーム shall 案件公開ボタンを非活性にする（必須項目）。下書き保存は許可する

---

### Requirement 7: 発注者プロフィール（`recruit_job_types`）の新マスタ参照化

**Objective:** As a 発注者, I want 「うちは○○の仕事を募集しています」リストを新マスタ 113 件から選択したい, so that 受注者の対応職種と同じ粒度で表現できマッチング精度が上がる。

#### Acceptance Criteria

1. The 発注者情報編集画面（CLI-021, `mypage/client-profile/edit`） shall 「募集職種」入力欄を `master_trade_types` から選択する単一入力枠（combobox、複数選択可）に置き換える
2. The 発注者情報編集画面 shall `client_profiles.recruit_job_types text[]` に選択した label の配列を保存する（カラム型・スキーマは現行維持）
3. The 発注者情報詳細画面（CLI-020, `mypage/client-profile`） shall `recruit_job_types` を「主要 N 件 + 折りたたみ」または「全件カンマ区切り」のいずれかで表示する（spec-design でデザインカンプ準拠）
4. The CON-005 発注者検索 shall `client_profiles.recruit_job_types` に対する絞り込みを新マスタ参照の combobox から行い、`overlaps()` 演算子で複数選択 OR 検索する
5. The CON-006 発注者詳細画面（`clients/[id]`） shall `recruit_job_types` を表示する
6. The CLI-021 発注者情報編集 shall 個数上限を設けない（既存「複数選択可」を維持しつつ DB 制約は持たない）
7. Where `recruit_job_types` に `deprecated_at` 設定済みの label が含まれる場合, the 発注者情報編集画面 shall 編集時に「（廃止）」サフィックス付きで表示し、発注者情報詳細画面では従来通り表示する
8. The CLI-021 発注者情報編集画面 shall 単一入力枠（combobox）に加えて「カテゴリで一括選択」ボタンを提供し、選択されたカテゴリ（大カテゴリ単位または大カテゴリ + 中カテゴリ単位）配下の全 trade-types 項目を `recruit_job_types` に一括追加できる
9. When ユーザーがカテゴリ一括選択を実行する, the CLI-021 発注者情報編集画面 shall 既選択済みの項目をスキップし、未選択かつ `deprecated_at IS NULL` の項目のみを一括追加する
10. When ユーザーが一括追加された項目から個別に解除する, the CLI-021 発注者情報編集画面 shall その項目のみをリストから削除する（同カテゴリの他項目は維持する）
11. The 受注者プロフィール画面（COM-002 / register/profile） shall この「カテゴリ一括選択」機能を提供しない（受注者は自分が本当に対応可能な職種を厳選する設計のため）

---

### Requirement 8: 応募・スカウト・メッセージ・履歴系の表示更新

**Objective:** As a 受注者 / 発注者, I want 応募・スカウト・メッセージ・履歴の各画面で職種・スキル・資格が新マスタ準拠で表示されてほしい, so that サービス全体で表記の一貫性が保たれる。

#### Acceptance Criteria

1. The 応募一覧（CLI-007 / CLI-010 / CLI-007B） shall 応募者の `user_skills.trade_type` を新マスタ準拠の label で表示する（label 保存方式のため、現状コードのまま動作する想定）
2. The 応募詳細（CLI-008 / CLI-011） shall 応募者の 3 マスタ項目（対応職種・保有スキル・保有資格）と案件の募集職種を、リストカードと同じ「主要 2 件 + 他」形式で表示する。完全な詳細は同画面の「ユーザー詳細」「募集案件詳細」ボタンから別画面（CLI-006 / CON-003）で確認可能とする
3. The 発注可否画面（CLI-009） shall 応募者の対応職種と案件の募集職種を「主要 2 件 + 他」形式で表示する。CLI-008 から遷移してくる画面であり、発注者は既に応募内容を確認済みのため、サマリー表示で十分とする
4. The 応募履歴（CON-011 / CON-012） shall 案件の `jobs.trade_types`（配列）を新マスタ準拠の label で表示する（配列要素を「、」で連結する等の表示方法は spec-design で確定）
5. The スカウト送信（CLI-015） shall 案件の `jobs.trade_types`（配列）を「主要 2 件 + 他」形式で表示する。完全な詳細は案件詳細（CON-003）への遷移リンクで補完する
6. The メッセージ詳細（CON-009 受注者側 / CLI-013 発注者側、共通の `messages/[threadId]`） shall スカウト情報カード内の `jobs.trade_types` を「主要 2 件 + 他」形式で表示する。`src/components/messaging/scout-info-card.tsx` の既存リンク（タイトル部の `Link href={/jobs/${jobId}}`）により案件詳細（CON-003）へ遷移可能であることを前提とし、完全な詳細はそこから確認する
7. The マイページ（CON-001, `mypage/page.tsx`） shall 受注者プロフィールサマリーの `user_skills.trade_type` を新マスタ準拠の label で表示する
8. The お気に入り（CON-007, `favorites`） shall 案件カード内の `jobs.trade_types` および発注者カード内の `client_profiles.recruit_job_types` を新マスタ準拠の label で表示する（リストカードのため R4 AC-4 / AC-8 の「主要 M 件 + 他」形式に従う）
9. The 応募可否マッチングロジック（既存共通関数 `src/lib/utils/can-apply-job.ts` および呼び出し元 3 画面: CON-002 検索 Server Action / CON-003 案件詳細 / CON-004 応募フォーム） shall 「案件の `jobs.trade_types`（配列）のうちいずれか」と「受注者の `user_skills.trade_type`（配列）のうちいずれか」が label の厳密一致で重なるかで判定する（OR 一致）。共通関数の引数を string → string[] に変更し、内部ロジックも array 同士の overlap 判定に書き換える

---

### Requirement 9: 廃止項目の運用ルール（`deprecated_at`）

**Objective:** As a プラットフォーム運用者, I want マスタ項目を物理削除せず論理削除で運用したい, so that 過去のユーザー登録値を保ったまま新規選択肢から除外できる。

#### Acceptance Criteria

1. The ビジ友 DB shall マスタ項目の廃止を `UPDATE master_xxx SET deprecated_at = now() WHERE id = ?` で行う運用とし、`DELETE` を行わない
2. The 候補表示クエリ（プロフィール入力・検索ポップアップ・案件投稿フォーム） shall `WHERE deprecated_at IS NULL` を必ず付与し、廃止項目を新規候補から除外する
3. The 編集画面（COM-002 プロフィール編集 / CLI-021 発注者情報編集 / CLI-003 募集現場編集 / CLI-004 募集現場新規登録 / AUTH-006 新規会員登録情報入力） shall ユーザー値（label 文字列）が廃止項目に該当する場合、入力済みリスト内で「（廃止）」サフィックスを付与する（本人に気付かせ、変更を促す目的）
4. When 運用者が一度廃止したマスタ項目を復活させたい, then the ビジ友 DB shall `UPDATE master_xxx SET deprecated_at = NULL` で復活させることを許可する
5. The ビジ友 マイグレーション運用 shall マスタ項目の追加・廃止・ラベル修正をすべて migration ファイル + Supabase ダッシュボードで行い、ユーザー側 UI からは一切操作不能とする
6. When マスタの label を migration で書き換えた, the ビジ友 マイグレーションシステム shall 同一 migration 内でユーザー側カラム（`user_skills.trade_type` 等）に保存済みの旧 label を新 label に `UPDATE` で一括書き換えする（denormalization 方式の整合性維持）
7. Where 運営がマスタ項目を廃止する場合, the ビジ友 運用 shall 該当 label を保有する既存ユーザー（受注者の `user_skills` / `users.skill_tags` / `user_qualifications`、発注者の `client_profiles.recruit_job_types`、案件の `jobs.trade_type`）を事前に DB で抽出し、移行先候補を通知して可能な限り移行を完了してから `deprecated_at` を設定する
8. The ビジ友 運用 shall 廃止項目の検索性問題（廃止項目を保有するユーザーが新規検索でヒットしなくなる）を、上記 AC-7 の事前移行運用で吸収する（システム側で「廃止項目でも該当ユーザーがいる場合は検索候補に残す」のような複雑な分岐は実装しない）
9. The 表示専用画面（プロフィール表示・検索結果カード・案件詳細・応募一覧・スカウト送信・メッセージ詳細・お気に入り等、本人以外も閲覧する画面） shall 廃止判定・サフィックス付与を行わず、保存されている label をそのまま表示する。理由: 廃止マークは本人に変更を促すためのものであり、第三者に見せると本人の印象を損なう可能性がある。また label 保存方式の「表示画面を触らずに済む」利点を保つため

---

### Requirement 10: マスタ管理運用とユーザー追加リクエスト機能のスコープ外化

**Objective:** As a プラットフォーム運用者, I want マスタ管理を admin 専用に固定したい, so that 検証されていない需要に対する機能投資を回避できる。

#### Acceptance Criteria

1. The ビジ友 サービス shall ユーザー側 UI（受注者プロフィール・発注者プロフィール・検索ポップアップ・案件投稿フォーム等）に「マスタに項目を追加してほしい」リクエストボタンを置かない
2. The ビジ友 サービス shall マスタ管理画面（ADM 系）を本仕様の範囲外とし、追加が必要な場合は別 spec で対応する（初期は Supabase ダッシュボードでの直接操作で十分とみなす）
3. The ビジ友 サービス shall 「マスタに該当項目がないユーザーの希望」を `contacts` テーブル（既存の問い合わせ機能）で受け付ける運用方針を採る

---

### Requirement 11: バリデーション・テスト・型整合の更新

**Objective:** As a プラットフォーム開発者, I want 既存のバリデーション・型・テストを新マスタ前提に整合させたい, so that マスタ移行後にビルド・テスト・実行のいずれもデグレなく通る。

#### Acceptance Criteria

1. The ビジ友 バリデーション層（`src/lib/validations/profile.ts`, `src/lib/validations/client-profile.ts`） shall 旧 `TRADE_TYPES` 13 値配列に対する Zod `.enum()` バリデーションを廃止し、「label が `master_xxx.label` に存在し `deprecated_at IS NULL`」を Server Action 層で検証する形に置き換える
2. The ビジ友 バリデーション層 shall プロフィール入力時の「対応職種 3 件まで」「保有資格 N 件まで」等の上限制約を全廃する
3. The ビジ友 バリデーション層 shall 「対応職種 1 件以上」の下限のみ維持する（trade-types のみ必須）
4. The ビジ友 型システム（`src/types/database.ts`） shall `supabase gen types` の再生成により新マスタテーブルの型を自動生成し、関連コードの型エラーを解消する
5. The ビジ友 E2E テストスイート shall プロフィール登録 / 編集 / 検索フローの主要ユーザーストーリー（正常系 + 上限なしの大量登録ケース + 廃止項目表示ケース）をカバーする
6. The ビジ友 ユニットテスト・統合テスト shall マスタ参照を含む Server Action（プロフィール保存、案件投稿、発注者プロフィール保存、検索）の正常系 + 異常系（存在しない label / 廃止済み label）をカバーする
7. When CI で `npm run test` / `supabase test db` / `npm run test:e2e` を実行する, the ビジ友 テストスイート shall 全テストが pass する
8. The ビジ友 シードデータ（`supabase/seed.sql`） shall 新マスタを参照する形式に更新され、テストユーザーの `user_skills.trade_type` / `users.skill_tags` / `user_qualifications.qualification_name` / `jobs.trade_types`（配列） / `client_profiles.recruit_job_types` が新マスタの label と整合する

---

### Requirement 12: プレリリース前提のデータ刷新

**Objective:** As a プラットフォーム運用者, I want プレリリースの利点を活かしテストデータを丸ごと新マスタで再構築したい, so that 移行戦略・マッピング処理・退避テーブルといった追加実装を不要にできる。

#### Acceptance Criteria

1. The ビジ友 マイグレーションシステム shall 旧 `TRADE_TYPES` 13 値前提のテストデータ（`supabase/seed.sql`）を破棄し、新マスタの label で再投入する
2. The ビジ友 マイグレーションシステム shall 既存ユーザーデータの「移行用マッピングテーブル」「退避テーブル」「ユーザー再選択フロー」を実装しない
3. The ビジ友 サービス shall プレリリース段階のため、本番環境にユーザーデータが存在しないことを前提とし、`supabase db reset` で全環境を再構築可能とする
4. When 本仕様の migration を適用する, the ビジ友 マイグレーションシステム shall 旧 `TRADE_TYPES` を参照していた既存テストデータが残存する場合に備え、新 migration を「既存データの全削除 → 新マスタ投入 → seed 再投入」の順で構成する
5. The ビジ友 マイグレーションシステム shall `jobs.trade_type text NOT NULL`（単一値）を `jobs.trade_types text[] NOT NULL DEFAULT '{}'`（配列）にスキーマ変更する。プレリリース前提で既存案件データは新規 seed で再投入するため、データ移行は不要
6. The ビジ友 マイグレーションシステム shall 既存インデックス `idx_jobs_search (status, prefecture, trade_type)` を新カラム名・新型に対応した形に作り直す（`trade_types` が text[] なので必要に応じて GIN インデックスを検討）

---

### Requirement 13: マッチング・応募制限ロジック

**Objective:** As a プラットフォーム開発者, I want 無料ユーザーの応募制限（「登録職種 × 登録県」ガード）を新マスタ前提で動かしたい, so that 113 件粒度の新マスタでもロジックが破綻しない。

#### Acceptance Criteria

1. The ビジ友 応募制限ロジック shall 無料ユーザーの応募可否を「`jobs.trade_types`（配列）のいずれか」と「`user_skills.trade_type`（配列）のいずれか」が **label の厳密一致で重なるか** で判定する（OR 一致）
2. The ビジ友 応募制限ロジック shall trade-types の階層構造（label 内 prefix `大カテ/中カテ｜`）を利用した「親一致」「子要素を親で代用」等のあいまいマッチングは行わない（初期は厳密一致のみ）
3. The CON-003 案件詳細画面 shall 無料ユーザーが対象案件の `jobs.trade_types` のいずれにも自分の対応職種を登録していない場合、応募ボタンを非活性化し、その理由を明示する
4. The CON-002 案件検索結果一覧 shall 全ロール・全プランで同一データ・同一 UI を維持し、`jobs.trade_types` の絞り込みを `overlaps()` 演算子で行う
5. Where 厳密一致による応募制限が運用後に問題（応募できる案件が少なすぎる等）になった場合, the ビジ友 サービス shall 別 spec で「親一致」「マッピングテーブル」等の救済策を後日追加検討する（**MVP では実装しない**）

---

### Requirement 14: ピン留め機能【MVP 範囲外、将来課題】

**Objective:** As a 受注者プロフィール入力者 / 検索ユーザー, I want 自分やサービス全体でよく使う項目を入力候補の先頭に出したい, so that 大量候補（特に qualifications 599 件）からの選択を素早く済ませられる。

#### Acceptance Criteria

1. The ビジ友 サービス shall MVP リリース時点でピン留め機能を実装しない
2. The 受注者プロフィール入力 UI shall インクリメンタル検索の自然な部分一致順（マッチ度・先頭一致優先）のみで候補を並べる
3. Where 運用後にマスタ採用頻度の実データが蓄積された段階で再評価する場合, the ビジ友 サービス shall 別 spec として「マスタ採用頻度ベースの動的ソート」または「運営によるピン留め設定」を策定して実装する
4. When spec-design 段階で実機検証を行う, the ビジ友 開発チーム shall qualifications 599 件・skill_tags 244 件のインクリメンタル検索が実用速度で目的項目に到達できることを確認する。問題があれば本仕様の R14 を再開する

**運用後の再評価判断基準:**

- **A-4-1**: MVP 段階では実装しない（**確定**）。運用 3〜6 ヶ月後にマスタ採用頻度集計を取り、上位 N 件を上に出す方式（自動）または運営手動ピン留め方式（手動）を選択する
- **A-4-2**: 採用時の対象範囲（サービス全体共通 vs ユーザー個別）は運用データを見てから決める
- **A-4-3**: 採用時の実装方式（`is_pinned boolean` vs `sort_priority integer` vs 動的集計）は運用データを見てから決める

---

### Requirement 15: ステアリング・CLAUDE.md・周辺 spec の波及更新

**Objective:** As a プラットフォーム開発者 / 仕様書メンテナ, I want 旧「3 件まで」「TRADE_TYPES 13 値固定」前提の記述を全廃したい, so that 新規実装者が古い前提に基づいて回帰バグを再導入することを防ぐ。

#### Acceptance Criteria

1. The ビジ友 ドキュメント体系 shall `.kiro/steering/database-schema.md` の `user_skills` / `users.skill_tags` / `user_qualifications` / `client_profiles.recruit_job_types` 関連記述を新マスタ前提に書き換える
2. The ビジ友 ドキュメント体系 shall `.kiro/steering/database-schema.md` の「選択肢データ（OptionSets）の方針」セクションについて、`user_skills.trade_type` / `user_qualifications.qualification_name` を「text 型のままにするもの」から「マスタテーブル参照（label 保存方式）」へ移動する
3. The ビジ友 ドキュメント体系 shall `CLAUDE.md` 内の「最大 3 件」「`TRADE_TYPES` から選択」関連記述を全廃し、新マスタ前提の運用ルールに置き換える
4. The ビジ友 ドキュメント体系 shall `.kiro/specs/matching/requirements.md` / `.kiro/specs/profile/requirements.md` / `.kiro/specs/job-posting/requirements.md` / `.kiro/specs/job-search/requirements.md` 等、関連 spec の関連記述を新マスタ前提に更新する
5. When ドキュメント更新が完了する, the ビジ友 ドキュメント体系 shall `grep "TRADE_TYPES" .kiro/ src/` で本仕様作成前と後の差分を比較し、新仕様外の参照が残らないことを確認できる

---

## Out of Scope（本仕様で対象外）

以下は本仕様の対象外とし、必要に応じて別 spec で扱う:

- ユーザー側「マスタ追加リクエスト」機能（admin 運用に固定）
- **マスタ管理画面（ADM 系の CRUD UI）**: 本仕様では作成しない。リリース後半年以内に別 spec「ADM-マスタ管理」として策定・実装することを想定する。それまでは Supabase ダッシュボードでの直接操作で運用する
- 多言語化対応（label の英語/中国語等への翻訳）
- マスタ項目への画像・説明文の追加
- 階層マッチング・親一致・マッピングテーブルによるあいまいマッチング（Requirement 13 AC-5 のとおり MVP では実装しない。受注者本人の自己選択を促す Requirement 3 の「関連候補サジェスト」で代替する）
- ピン留め・人気度ベースの並び順制御（Requirement 14 のとおり MVP 範囲外。運用データ蓄積後に別 spec で再評価する）
- ユーザー側カラムの id (uuid FK) 化（denormalization 方式を採用するため、本仕様では行わない）
- 廃止項目を保有するユーザーを検索でヒットさせる「動的検索候補復活」ロジック（Requirement 9 AC-7 の事前移行運用で吸収する）

---

## 仕様策定方針メモ（spec-design フェーズへの引き継ぎ）

- ユーザー側カラムは現状の `text` / `text[]` 型を維持し、保存値だけマスタの label と整合させる方針（denormalization）
- 詳細な DB スキーマ（マスタテーブルのインデックス、`pg_trgm` 採否、検索方式）は spec-design で確定する
- UI モックは既存の `design-assets/screens/` の COM-001/002, CLI-005, CON-002, CON-005, CLI-001, CLI-021 をベースに、単一入力枠 + インクリメンタル検索のディテール（候補リストの段階表示、選択時の追加情報入力、廃止項目表示）を design フェーズで起こす
- 約 25 画面の改修順序は spec-tasks で詰める。`label 保存方式` のおかげで表示画面はほぼ修正不要なので、入力系（COM-002 / CLI-021 / job-form）→ 検索系（CLI-005 / CON-002 / CON-005）の順が現実的
- マスタフェッチのキャッシュ戦略（Next.js `unstable_cache` / `revalidate`、SWR、static import 等）は spec-design で検討する
- ピン留め機能（Requirement 14）の採否は spec-design のレビューで決める。推奨は MVP 範囲外
