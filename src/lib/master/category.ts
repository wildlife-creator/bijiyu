/**
 * trade-types label のカテゴリパースと siblings 抽出。
 *
 * フォーマット:
 *   `<big>/<mid>｜<leaf>`   2 階層あり（例: `建築/躯体｜大工`）
 *   `<single>｜<leaf>`     1 階層のみ（例: `撮影・クリエイティブ｜カメラマン`）
 *                          → big === mid === single とする
 *   `<leaf>`               パイプ無し（カテゴリ無し）→ big='', mid='' とし leaf のみ
 *
 * 区切り文字:
 *   - 大カテと中カテの区切りは半角 `/`
 *   - 中カテと末端の区切りは全角 `｜` (U+FF5C)
 *
 * DB スキーマには階層情報を持たず、label の prefix で完結する設計。
 * `RelatedSuggestions` と `CategoryBulkSelector` の双方が利用する。
 */

const FULLWIDTH_PIPE = "｜";
const SLASH = "/";

export interface TradeTypeCategory {
  big: string;
  mid: string;
  leaf: string;
}

export function parseTradeTypeCategory(label: string): TradeTypeCategory {
  const pipeIdx = label.indexOf(FULLWIDTH_PIPE);
  if (pipeIdx === -1) {
    return { big: "", mid: "", leaf: label };
  }
  const prefix = label.slice(0, pipeIdx);
  const leaf = label.slice(pipeIdx + FULLWIDTH_PIPE.length);
  const slashIdx = prefix.indexOf(SLASH);
  if (slashIdx === -1) {
    return { big: prefix, mid: prefix, leaf };
  }
  const big = prefix.slice(0, slashIdx);
  const mid = prefix.slice(slashIdx + SLASH.length);
  return { big, mid, leaf };
}

/**
 * 全 trade-types から大カテゴリ一覧（出現順）を返す。空文字列は除外。
 */
export function listBigCategories(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    const { big } = parseTradeTypeCategory(label);
    if (!big || seen.has(big)) continue;
    seen.add(big);
    out.push(big);
  }
  return out;
}

/**
 * 全 trade-types から (big, mid) ペア一覧を出現順で返す。
 */
export function listMidCategories(
  labels: string[],
): Array<{ big: string; mid: string }> {
  const seen = new Set<string>();
  const out: Array<{ big: string; mid: string }> = [];
  for (const label of labels) {
    const { big, mid } = parseTradeTypeCategory(label);
    if (!big || !mid) continue;
    const key = `${big}|${mid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ big, mid });
  }
  return out;
}

/**
 * 対象 label と同じ中カテゴリ配下の他 trade-types を返す。
 * 自身は除外。カテゴリが特定できない label（big または mid が空）は空配列。
 */
export function siblingsInSameMidCategory(
  target: string,
  allLabels: string[],
): string[] {
  const targetCat = parseTradeTypeCategory(target);
  if (!targetCat.big || !targetCat.mid) return [];
  return allLabels.filter((label) => {
    if (label === target) return false;
    const cat = parseTradeTypeCategory(label);
    return cat.big === targetCat.big && cat.mid === targetCat.mid;
  });
}
