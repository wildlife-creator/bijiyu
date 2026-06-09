/**
 * お住まい（個人居住地）の表示用フォーマット。
 *
 * 都道府県 + 市区町村（任意）をスペース無しで結合する。
 * 市区町村が未指定なら都道府県のみ。両方無ければ null を返す。
 *
 * 例:
 *   formatResidence("埼玉県", "さいたま市浦和区") → "埼玉県さいたま市浦和区"
 *   formatResidence("埼玉県", null)               → "埼玉県"
 *   formatResidence(null, null)                   → null
 */
export function formatResidence(
  prefecture: string | null | undefined,
  municipality: string | null | undefined,
): string | null {
  const pref = prefecture?.trim() ?? "";
  const muni = municipality?.trim() ?? "";
  if (!pref) return null;
  return muni ? `${pref}${muni}` : pref;
}
