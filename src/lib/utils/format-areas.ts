/**
 * エリア配列の表示文字列化。
 *
 * 表示ルール (Req 5.1 / 5.2 / 5.3 / 5.5 / 5.6):
 *   - 単一エリア:
 *     - municipality === null → 「{prefecture}（市区町村未指定）」
 *     - municipality !== null → 「{prefecture}{municipality}」 (連結)
 *   - 同一県の県全域 + 市区町村混在 → 「{prefecture}（{m1}・{m2}ほか）」
 *     (列挙は最大 2 件 + 「ほか」)
 *   - maxVisible 超え → 末尾「他N エリア」省略表示
 *   - 入力 0 件 → emptyLabel (default "") を返す
 *   - 同一 (prefecture, municipality) 重複は内部で dedupe
 *
 * UI 側で 12+ 箇所の表示を共通化する。`AreaList` (詳細画面、全件展開) と
 * `AreaSummary` (カード、maxVisible=3) で formatAreas を呼ぶ。
 */

export interface AreaForDisplay {
  prefecture: string;
  municipality: string | null;
}

export interface FormatAreasOptions {
  /** 表示単位の上限。指定がない (undefined) 場合は全件展開 */
  maxVisible?: number;
  /** 0 件時の表示文字列。default "" */
  emptyLabel?: string;
}

export function formatAreas(
  areas: AreaForDisplay[],
  options: FormatAreasOptions = {},
): string {
  const { maxVisible, emptyLabel = "" } = options;
  if (areas.length === 0) return emptyLabel;

  // 1. Dedupe by (prefecture, municipality) — preserve first-seen order
  const seen = new Set<string>();
  const deduped: AreaForDisplay[] = [];
  for (const a of areas) {
    const k = `${a.prefecture}|${a.municipality ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(a);
  }

  // 2. Group by prefecture, preserving insertion order
  interface Group {
    hasFullPref: boolean;
    municipalities: string[];
  }
  const order: string[] = [];
  const groups = new Map<string, Group>();
  for (const a of deduped) {
    let g = groups.get(a.prefecture);
    if (!g) {
      g = { hasFullPref: false, municipalities: [] };
      groups.set(a.prefecture, g);
      order.push(a.prefecture);
    }
    if (a.municipality === null) {
      g.hasFullPref = true;
    } else {
      g.municipalities.push(a.municipality);
    }
  }

  // 3. Generate display units
  //    - hasFullPref + 0 munis → 1 単位 「{pref}（市区町村未指定）」
  //    - hasFullPref + ≥1 munis → 1 単位 「{pref}（{m1}(・{m2})?ほか）」
  //    - !hasFullPref + 1 muni → 1 単位 「{pref}{m1}」
  //    - !hasFullPref + ≥2 munis → 単位ごとに分離 「{pref}{m1}」、「{pref}{m2}」…
  const units: string[] = [];
  for (const pref of order) {
    const g = groups.get(pref);
    if (!g) continue;
    if (g.hasFullPref && g.municipalities.length === 0) {
      units.push(`${pref}（市区町村未指定）`);
    } else if (g.hasFullPref) {
      const head = g.municipalities.slice(0, 2).join("・");
      units.push(`${pref}（${head}ほか）`);
    } else {
      for (const m of g.municipalities) {
        units.push(`${pref}${m}`);
      }
    }
  }

  // 4. Apply maxVisible
  if (maxVisible !== undefined && units.length > maxVisible) {
    const visible = units.slice(0, maxVisible);
    const remaining = units.length - maxVisible;
    return `${visible.join("、")} 他${remaining}エリア`;
  }
  return units.join("、");
}

/** カード共通の省略表示 (default maxVisible=3) */
export function formatAreasShort(
  areas: AreaForDisplay[],
  maxVisible = 3,
): string {
  return formatAreas(areas, { maxVisible });
}

/** 詳細画面の全件展開表示 */
export function formatAreasLong(areas: AreaForDisplay[]): string {
  return formatAreas(areas);
}
