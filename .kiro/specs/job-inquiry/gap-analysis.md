# Implementation Gap Analysis — job-inquiry

このドキュメントは、要件定義（`requirements.md`）と既存コードベースの差分を整理し、設計フェーズの判断材料を提供するものです。**実装方針の確定はしません**。

## サマリ

- 直近の **support spec（お問い合わせ COM-008・トラブル報告 COM-012）** と **scout-notification 通知** にほぼ同形のパターンが既に存在し、本機能の9割以上は既存実装の差し替えで成立する
- 受信箱は「**読むだけ**」の最小構成（対応済フラグ等の状態管理機能なし）に確定したため、新規性が高い箇所は「**RLS の SELECT を宛先 client と同一組織メンバーに開放するポリシー**」の1点のみ
- 残り（フォーム・テーブル・通知メール・CON-006 ボタン・マイページ導線・受信箱一覧/詳細・連投制限・Zod スキーマ）は **既存パターンの単純拡張**
- 想定工数: **M（3〜5 営業日相当）**、リスク: **Low**

## 1. Requirement-to-Asset Map

要件別に、既存資産で使えるもの／新規で作るものを対応付けた。

### 要件 1: フォーム表示と入力
| 要件項目 | 既存資産 | 状態 |
|---|---|---|
| ログイン後のフォーム画面（SSR で氏名・メール初期表示） | `src/app/(authenticated)/trouble-report/page.tsx`（39行）— 認証チェック→users から `last_name + first_name`（スペース無し）と email を取得→Form に props 渡し | ✅ Reuse |
| react-hook-form + Zod + sonner トースト構成 | `trouble-report-form.tsx` — `useForm` + `zodResolver` + `defaultValues` + `toast.error` のパターン | ✅ Reuse |
| 必須/任意バッジ | `REQUIRED_BADGE` / `OPTIONAL_BADGE`（trouble-report-form.tsx 内 const） | ✅ Reuse パターン |
| CTA（紫ピル）＋ BackButton（outline ピル） | `Button` + `BackButton(href="/mypage")` パターン、`w-full rounded-full` | ✅ Reuse |
| 複数選択チェックボックス UI | `src/components/ui/checkbox.tsx`（要存在確認）／なければ shadcn ui を追加 | ⚠️ Confirm |
| `resolveParticipantName()` で発注者表示名 | `src/lib/utils/display-name.ts` — `displayName / lastName / firstName / deletedAt` を取って優先順位解決 | ✅ Reuse |

### 要件 2: 送信・バリデーション
| 要件項目 | 既存資産 | 状態 |
|---|---|---|
| Zod スキーマ（クライアント+サーバー共通） | `src/lib/validations/trouble.ts` — `z.object({ ... })` + `.refine` で個別チェック | ✅ Reuse パターン |
| FormData パース + Server Action | `submitTroubleReportAction()`（actions.ts 全113行） — auth→Zod→admin client COUNT→INSERT→ファイル添付→update の流れ | ✅ Reuse パターン |
| `ActionResult` 型（`{ success, error?, data? }`） | `src/lib/types/action-result.ts` | ✅ Reuse |
| 成功時トースト＋遷移 | trouble-report-form.tsx の `setSubmitted(true)` 完了表示 → 本機能では`router.push("/clients/[id]")` 等で CON-006 戻し | 🔄 軽微改変 |

### 要件 3: アクセス制御
| 要件項目 | 既存資産 | 状態 |
|---|---|---|
| 退会済み client 判定 | `clients/[id]/page.tsx` の `isDeleted = !!client.deleted_at` 判定 | ✅ Reuse |
| 自分自身判定 | `client.id === user.id` の直書き | ✅ Reuse |
| 同一組織判定 | `is_same_org(auth.uid(), org_id)`（SECURITY DEFINER 関数。`supabase/migrations/20260402100000_fix_org_members_rls_recursion.sql` で定義済み） | ✅ Reuse（要確認: 個人プラン client は org_id 無し→false 返却で意図通り） |
| Middleware 認証 | `middleware.ts`（既存） — `/clients/*` は認証必須 | ✅ Reuse |
| 三重防御 | Middleware + Server Action + RLS の構図はプロジェクト共通 | ✅ Reuse |

### 要件 4: 連投制限
| 要件項目 | 既存資産 | 状態 |
|---|---|---|
| `MAX_SUBMISSIONS_PER_HOUR = 5` パターン | `trouble-report/actions.ts:14`、`contact/actions.ts:12` 共通 | ✅ Reuse |
| admin client で送信者本人の集計 | trouble-report と同じ（RLS で SELECT 不可な行も admin で集計） | ✅ Reuse |

### 要件 5: メール通知
| 要件項目 | 既存資産 | 状態 |
|---|---|---|
| Resend 送信ラッパー | `sendEmail()`（`src/lib/email/send-email.ts:50`） — 本番 Resend / dev は `/tmp/bijiyu-dev-mail/` フォールバック | ✅ Reuse |
| HTML テンプレート構造 | `scout-notification.ts` — `{ subject, html }` 返却、`recipientName` `senderName` 等を埋め込み、bg #920783 ヘッダー、CTA ボタンスタイル統一 | ✅ Reuse パターン |
| Server Action からの呼び出し | `scout-send/actions.ts:213` の `await sendEmail({...}).catch((err) => console.error(...))` — fire-and-forget（失敗してもロールバックしない） | ✅ Reuse |
| `SERVICE_URL` の組み立て | `process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"` | ✅ Reuse |
| 宛先 Owner のメール取得 | `auth.users.email` を admin client で取得（cross-user で見るため） | ✅ Reuse パターン |

### 要件 6: 発注者の受信箱（読むだけ）
| 要件項目 | 既存資産 | 状態 |
|---|---|---|
| 一覧画面の SSR + 20件ページネーション | `applications/received/page.tsx`（CLI-007）の `ITEMS_PER_PAGE = 20` + `from / to` ＋ count 同時クエリパターン | ✅ Reuse パターン |
| 詳細画面の構成 | `applications/received/[id]/page.tsx` の SSR 詳細パターン | ✅ Reuse パターン |
| mailto / 既存メッセージ機能への補助リンク | `<a href={mailto:...}>` ／ `<Link href="/messages/new?to=${userId}">` | ✅ Reuse |
| マイページ導線 | `mypage/page.tsx` の `MANAGE_ORDERS_MENU` 等に MenuItem を1行追加 | ✅ Reuse パターン |

### 要件 7+8: RLS とデータの器
| 要件項目 | 既存資産 | 状態 |
|---|---|---|
| `job_inquiries` テーブル | なし | 🆕 New |
| admin SELECT RLS | `trouble_reports_select_admin` パターン（`is_admin(auth.uid())`） | ✅ Reuse |
| 認証済み INSERT（sender = self） | `trouble_reports_insert_own` パターン（`WITH CHECK (user_id = auth.uid())`） | ✅ Reuse |
| **宛先 client + 同一組織メンバー SELECT** | trouble_reports には無いが、messaging の `messages_select` で `organization_id IS NOT NULL AND is_same_org(...)` パターンあり | ⚠️ パターン拡張（messaging 流） |
| UPDATE / DELETE 不許可 | trouble_reports と同じく default deny（ポリシー無し）で完結 | ✅ Reuse |

### 要件 9〜11: ナビ・整合性・テスト
| 要件項目 | 既存資産 | 状態 |
|---|---|---|
| BackButton 規約 | `src/components/shared/back-button.tsx`（ログイン後画面は下部 outline ピル） | ✅ Reuse |
| screen-map.md 追記 | 既存ファイルに行追加するだけ | ✅ Reuse 手順 |
| tech.md 「メール種別」表追記 | 既存表に1行追加 | ✅ Reuse 手順 |
| database-schema.md 追記 | 既存ファイルに新テーブル節を追加 | ✅ Reuse 手順 |
| Vitest / pgTAP / Playwright | support spec の `src/__tests__/{contact, trouble}` / `supabase/tests/` / `e2e/` パターン | ✅ Reuse パターン |

## 2. Implementation Approach Options

### Option A: 既存パターンの拡張（推奨）
**選ぶ理由**: ほぼ全てが既存パターンの単純コピー。新規アーキ要素は SELECT RLS の組織共有ポリシー1点のみ。

- フォーム画面 = `trouble-report/page.tsx` ＋ `trouble-report-form.tsx` ＋ `actions.ts` の 3 点セットをファイル名だけ変えて流用
- テーブル＋RLS = `trouble_reports` の構造を踏襲しつつ、SELECT ポリシーだけ messaging の `is_same_org()` パターンを混ぜる（UPDATE / DELETE は default deny）
- メール通知 = `scout-notification.ts` をテンプレ書き換え、`scout-send/actions.ts` の sendEmail 呼び出しパターンをコピー
- 受信箱画面 = `applications/received/page.tsx` の SSR + 20件ページング構造を踏襲、ステータスフィルタ等は無し（状態管理機能を持たないため）
- CON-006 ボタン = `clients/[id]/page.tsx` の既存「メッセージを送る」ボタンの並びに1個追加
- マイページ導線 = `mypage/page.tsx` の MenuItem 1 行追加

**トレードオフ**: ✅ 速い・既存パターンへの逸脱なし／❌ ほぼ無し（受信箱が「読むだけ」になったので構造判断もほぼ要らない）

### Option B: 完全新規コンポーネント
**選ぶ理由**: 受信箱機能を将来「通知センター」へ発展させる構想がある場合（現状そういう構想は無い）

- 受信箱を独立した「通知センター」コンポーネントとして設計
- 将来の admin 通知・他種のお知らせと統合可能

**トレードオフ**: ✅ 拡張性／❌ オーバーエンジニアリング。現状の橋渡しコンセプトに対して過剰

### Option C: ハイブリッド
**選ぶ理由**: フォーム部分は Option A、受信箱だけは独立コンポーネント化

- フォーム = Option A（既存パターン拡張）
- 受信箱 = `src/components/inquiry-inbox/` に独立コンポーネントとして実装し、`mypage/job-inquiries/page.tsx` から呼び出す

**トレードオフ**: ✅ 受信箱の単体テストがしやすい／❌ 1機能のために構造を分けるコストの方が大きい

→ **推奨は Option A**。Option C は将来「他種の問い合わせ inbox（admin 経由のお知らせ等）」を作る兆しがあれば再検討。

## 3. 設計フェーズに持ち越す Research Item

1. **`target_organization_id` の denormalize 可否**: SELECT RLS で `is_same_org(auth.uid(), target_organization_id)` を使うため、INSERT 時に宛先 client の `organization_id` をミラー保存する設計を取るかどうか。messaging が同パターンを採用済み。**取る方向で設計予定**。
2. **個人プラン client の挙動**: 個人プランは organization を持つか持たないか？ org spec の 14画面リファクタで全 client が organization を持つ前提に統一されている（[[project_org_refactoring_prerequisite]]）。`is_same_org()` は両プランで一貫動作する想定。設計フェーズで実機確認。
3. **新規画面 ID の採番**: 求人問い合わせフォーム / 受信箱一覧 / 受信箱詳細の3画面に対する画面 ID。COM 系（共通）か CON/CLI 系か。橋渡し性質から **COM-013 / COM-014 / COM-015** を提案。screen-map.md の備考欄に追記。
4. ~~「ビジ友メッセージで返信する」リンク先~~ → **2026-05-28 削除決定**：受信箱詳細に独立した返信導線は置かない方針に確定（お問い合わせ・トラブル報告と同じ「保存して読むだけ」の最小構成）。送信者メールアドレスは `<a href="mailto:...">` ハイパーリンクとして自然に表示するのみ。edge case が消滅し、実装・テスト工数も削減。

## 4. 工数・リスク

| 項目 | 値 | 根拠 |
|---|---|---|
| **工数** | **M（3〜5 営業日）** | 新規ファイル数は推定 10〜12 と少なめ。各ファイルは既存パターンの単純コピーで150行以内が大半。受信箱から状態管理が外れて簡素化された |
| **リスク** | **Low** | 全パターンが直近の support / messaging で動作実証済み。新規 RLS パターンは SELECT のみ（messaging 既存パターンの転用） |

## 5. 設計フェーズへの推奨

- **アプローチ**: Option A（既存パターン拡張）
- **新規追加ファイル（想定10〜12点）**:
  - migration 1 本（`job_inquiries` テーブル＋RLS）
  - 定数 1 本（`src/lib/constants/job-inquiry-options.ts`）
  - Zod 1 本（`src/lib/validations/job-inquiry.ts`）
  - メールテンプレ 1 本（`src/lib/email/templates/job-inquiry-notification.ts`）
  - フォーム画面 3 本（フォーム本体）: `page.tsx` ＋ `inquiry-form.tsx` ＋ `actions.ts`
  - 受信箱 2 本（読むだけ）: `/mypage/job-inquiries/page.tsx`、`/mypage/job-inquiries/[id]/page.tsx`（**詳細用 actions.ts は不要 = 状態管理機能なし**）
- **既存ファイルの編集（少量）**:
  - `clients/[id]/page.tsx` — ボタン1個追加
  - `mypage/page.tsx` — MenuItem 1行追加
  - `screen-map.md` / `tech.md` / `database-schema.md` — ドキュメント追記
- **必ず通すレビュー観点**:
  - RLS SELECT の `is_same_org()` 利用が想定通り動くか（個人プラン client・法人プラン client・退会済み client それぞれで pgTAP 検証）
  - ボタン表示条件と Server Action 許可範囲の一致（CLAUDE.md ルール）
  - CON-006 ボタン押下フローと、送信成功→CON-006戻り の E2E 通し
