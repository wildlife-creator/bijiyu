/**
 * 全エンティティ共通の area 検証 Zod スキーマ
 * (master-area-multi-select Phase A Task 1.3)。
 *
 *   - `areaRowSchema`: 1 件の AreaRow を表す
 *   - `areaRowsSchema`: AreaRow[] に対する排他/未完成/同県重複の一括検証
 *   - `jobAreaRowsSchema`: 案件用に展開後 10 件上限を追加
 *   - `searchAreaRowSchema`: 検索系専用 (配列長 1 / whole === false 強制)
 *
 * 4 ファイル (`auth.ts` / `profile.ts` / `client-profile.ts` / `job.ts`) の
 * area 関連スキーマは Phase C でこの単一定義に集約される。
 *
 * エラーメッセージは `areaErrorMessages` 定数経由で参照する。
 */

import { z } from "zod";

import { expandAreasForDb } from "@/lib/master/area-conversion";

export const areaErrorMessages = {
  exclusiveViolation:
    "エリア入力に矛盾があります(全域と市区町村は同時指定不可)",
  incompleteRow: "市区町村を 1 つ以上選択するか、全域にチェックしてください",
  duplicatePrefecture: "同じ都道府県を複数登録することはできません",
  tooManyAreasForJob:
    "エリアは最大 10 件までです。1 つ以上削除してください",
} as const;

export const areaRowSchema = z.object({
  prefecture: z.string().min(1),
  whole: z.boolean(),
  municipalities: z.array(z.string()),
});

export const areaRowsSchema = z
  .array(areaRowSchema)
  .superRefine((rows, ctx) => {
    // エラーは配列ルート (path: []) に集約する。各フォームの FieldError は
    // `errors.<fieldName>.message` (= 配列ルートのメッセージ) を参照しているため、
    // path: [i] (行レベル) に置くと画面に表示されない (Phase 9 #6 の再発防止)。
    let hasExclusive = false;
    let hasIncomplete = false;
    rows.forEach((row) => {
      if (row.whole && row.municipalities.length > 0) hasExclusive = true;
      if (!row.whole && row.municipalities.length === 0) hasIncomplete = true;
    });
    if (hasExclusive) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: areaErrorMessages.exclusiveViolation,
      });
    }
    if (hasIncomplete) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: areaErrorMessages.incompleteRow,
      });
    }

    const seen = new Set<string>();
    let hasDuplicate = false;
    rows.forEach((row) => {
      if (row.prefecture && seen.has(row.prefecture)) hasDuplicate = true;
      if (row.prefecture) seen.add(row.prefecture);
    });
    if (hasDuplicate) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: areaErrorMessages.duplicatePrefecture,
      });
    }
  });

/**
 * 案件用: 平坦化後 10 件以下の上限 (Req 6-5)。
 * `expandAreasForDb` を import するため Task 1.2 完了後に有効。
 */
export const jobAreaRowsSchema = areaRowsSchema.refine(
  (rows) => expandAreasForDb(rows).length <= 10,
  { message: areaErrorMessages.tooManyAreasForJob },
);

/**
 * 検索系派生スキーマ: 単一の AreaRow を扱う (配列概念なし)。
 * 検索系では「全域」チェック概念がない (muni 0 個チェック = 県のみ指定で代替)
 * ため `whole === false` を強制する。
 */
export const searchAreaRowSchema = areaRowSchema.refine(
  (r) => r.whole === false,
  { message: "検索系では全域指定不可" },
);
