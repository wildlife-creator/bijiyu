/**
 * UI 層の AreaRow 型 (master-area-multi-select Phase A)。
 *
 * UI 層は「1 行 = 1 県 + N 市区町村 / または県全域」を 1 つのオブジェクトで扱い、
 * DB 層は `(prefecture, municipality)` ペアのフラットなリストで扱う。両層の
 * 変換は純粋関数 `expandAreasForDb` / `collapseAreasFromDb`
 * (`src/lib/master/area-conversion.ts`) を必ず通すこと。
 *
 * 命名規則:
 *   - UI 層 (本ファイル): 複数形 `municipalities`
 *   - DB 層 (`AreaTuple` in `src/lib/master/validate-area.ts`): 単数形 `municipality`
 *
 * z.infer<typeof areaRowSchema> での導出を採らず手書きで分離する理由:
 *   `AreaRow.prefecture` は「未選択中の編集途中状態」として `""` を許容する必要がある。
 *   一方 Zod スキーマ `areaRowSchema` は保存時バリデーションで `prefecture.min(1)`
 *   を要求するため、両者は同じ型では表現できない。
 *
 * 本ファイルは UI 部品 (`AreaRow` / `AreaListEditor` / `SearchAreaPicker`)、
 * Zod スキーマ (`src/lib/validations/area.ts`)、純粋変換関数
 * (`src/lib/master/area-conversion.ts`) が import する単一エクスポート源。
 */

export interface AreaRow {
  /** "" = 未選択。Select 表示用のプレースホルダー状態 */
  prefecture: string;
  /** true = 県全域。municipalities は必ず空配列になる (UI で即時クリア) */
  whole: boolean;
  /** whole === true のときは []。whole === false のときは 0 件以上 (検索系では muni 0 = 県のみ指定の意) */
  municipalities: string[];
}
