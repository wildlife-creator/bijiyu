# Research Log — support（問い合わせ・トラブル報告）

## Summary

- **Discovery 種別**: Light（既存パターンの拡張＋単純追加。外部 API・新規ライブラリなし）
- 対象: お問い合わせ（COM-008）全面改修 ＋ トラブル報告（COM-012）新規 ＋ 共通添付基盤
- 既存コードベースに、必要なパターン（Server Action からの Storage アップロード・非公開バケット＋RLS・admin クライアント・shadcn Select × react-hook-form・マイページメニュー）がすべて存在。新規技術は不要
- 主要な設計上の論点は「公開フォームでの書き込みクライアントの使い分け」「孤児ファイル防止の手順」「破壊的な `contacts` 組み替え」の3点。本ログで結論を確定し design.md に反映

## Research Log

### R1: Server Action からのファイルアップロードと保存
- **調査**: `src/app/(authenticated)/applications/actions.ts:288-303`、`supabase/migrations/20260403100000_application_documents.sql`
- **発見**: `supabase.storage.from(bucket).upload(path, file)` でアップロードし、パスを `text[]` カラムに保存する確立パターンあり。ただし既存実装は **MIME/拡張子/サイズ検証なし・ファイル名は元名のまま**。application-documents の Storage RLS は `(storage.foldername(name))[1] = auth.uid()` 方式で**匿名では使えない**
- **含意**: 本 spec はより厳格な検証（MIME＋拡張子＋5MB＋5枚）と**ファイル名ランダム化**を行う共通ユーティリティを新設する。匿名アップロードがある以上、uid ベース Storage RLS は使えず、**書き込みは service role（admin クライアント）で代行**し、バケットは公開ポリシーを持たせない（default deny）方式を採る

### R2: contacts のレート制限が機能していない（既存バグ）
- **調査**: `contacts_select_admin`（003 migration, `FOR SELECT TO authenticated USING is_admin`）と `contact/actions.ts` のレート制限 COUNT（通常クライアント）
- **発見**: contacts の SELECT は admin のみ。通常クライアント（送信者権限）での COUNT は RLS で全行除外され**常に 0**。匿名には SELECT ポリシー自体が無く同じく 0。よって現行のレート制限は**一度も発動しない**
- **含意**: レート制限の件数集計は **admin クライアント（RLS バイパス）** で実行する。Req4-3 / Req8-3 に明記済

### R3: 書き込みクライアントの使い分け（設計決定）
- **決定**:
  - **お問い合わせ（匿名あり）**: レート制限 COUNT・添付アップロード・レコード INSERT をすべて **admin クライアント**で実行。送信者の権限に依存しない。これに伴い `contacts` の公開 INSERT ポリシー（`contacts_insert_anon` / `contacts_insert_authenticated`）は**削除**し、検証済み Server Action（service role）のみを書き込み口とする（直接 INSERT 口を塞ぐ）
  - **トラブル報告（ログイン必須）**: レコード INSERT は **通常クライアント**で行い、RLS `WITH CHECK (user_id = auth.uid())` を本人保証の多層防御として効かせる。レート制限 COUNT と添付アップロード/クリーンアップは **admin クライアント**（SELECT・バケットが admin 限定のため）
- **理由**: 匿名送信者は本人保証ができないので service role 集約が自然。認証ユーザーは RLS で本人を強制できるので通常クライアントを活かす

### R4: 孤児ファイル防止の手順（設計決定）
- **決定**: 処理順を「認証/パース → Zod 検証 → レート制限 COUNT（admin）→ 添付の枚数/種別/サイズ検証 → 添付アップロード（admin）→ レコード保存 → **保存失敗時はアップロード済みファイルを admin クライアントで削除**」とする。アップロードが途中失敗した場合も、それまでに上げたファイルを削除して中断
- **理由**: レコードと添付の整合を保ち、持ち主不明ファイルを残さない。バケットは service role アクセスなので削除は admin クライアントで可能

### R5: 表示（署名付きURL）は本 spec 対象外
- **発見**: `createSignedUrl` は `applications/history/[id]/page.tsx` で実績あり
- **含意**: 本 spec には添付を**閲覧する画面が無い**（admin 画面は将来）。よって本 spec は**保存のみ**実装し、署名付きURL生成・表示コードは作らない。Req8-7 は将来の admin spec 向けの方針記載に留める

### R6: 破壊的な contacts 組み替え
- **発見**: `contacts` の参照は contact 一式＋`validations/profile.ts`＋`constants/profile-options.ts`＋`database.ts`＋`__tests__/profile/validations.test.ts` のみ（admin 等の読み手なし）。seed.sql に contacts 行なし
- **含意**: 新 migration で `contacts` を ALTER（旧4列 DROP・新規列 ADD）。`db reset` 後は空テーブルへの ALTER のため安全。型再生成と旧参照（action/page/validations/tests）の同時更新が必須。**本番にデータが入った後は NOT NULL 追加に backfill/DEFAULT が必要**（現状は本番データ無し）

## Architecture Pattern Evaluation
- 採用: **ハイブリッド**（gap-analysis Option C）。お問い合わせは既存資産を拡張、トラブル報告・添付基盤・定数/Zod は新規。共通添付ユーティリティとバケットを両フォームで共有
- 却下: 全 extend（contacts/contact に詰め込み過多）／全 new（既存 contact 資産の重複）

## Risks
- **R-1 破壊的 migration**: 型再生成と旧参照更新を同一タスクで完了しないとビルド不整合（Medium）。緩和: tasks 先頭でデグレ確認、migration 直後に gen types ＋ 旧参照修正をまとめる
- **R-2 admin クライアント誤用**: service role をクライアントに漏らさない（Low）。`createAdminClient` はサーバー専用、Server Action 内のみ
- **R-3 匿名大容量アップロード**: 公開フォーム固有（Medium）。緩和: 枚数/サイズ/種別制限＋レート制限（admin 集計で実効化）。残余リスクは許容（Req 非機能⑤）
- **R-4 bodySizeLimit**: 6mb のままだと添付がフレームワーク段階で失敗（High だが既知）。緩和: 30mb へ引き上げ
