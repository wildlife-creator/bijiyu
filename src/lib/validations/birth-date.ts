import { z } from "zod";

/**
 * 生年月日入力の自動整形。
 *
 * スマホの数字キーボードには「/」が無く、区切りの手入力を必須にすると登録を
 * 完了できない。そこで数字だけを打てば `YYYY/MM/DD` に自動整形する。
 *
 * - 全角数字（０-９）は半角へ正規化
 * - 数字以外（`/` `-` 空白 その他）はすべて除去したうえで再構成するため、
 *   ペースト（`1990-01-15` / `1990/01/15`）・バックスペース・IME 変換にも耐える
 * - 先頭 8 桁までを使用（年4 + 月2 + 日2）。それ以上は切り捨て
 * - 途中入力でも段階的に区切りを挿入（例: `199001` → `1990/01`）
 *
 * 出力はあくまで表示用。実在日付・範囲の検証と DB 正規化は
 * {@link birthDateSchema} が担う。
 */
export function formatBirthDateInput(raw: string): string {
  // 全角数字 → 半角
  const normalized = raw.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );

  // ペースト対策: `/` または `-` で年・月・日の 3 成分が揃っている場合は、
  // 各成分をゼロ詰めしてから連結する。数字だけを抜き出して連結すると
  // 1 桁の月日（"1990/1/5"）が "1990/15" に化けるため。
  // 成分が欠ける途中入力（"1990/1" 等）は化けないので素の数字連結に委ねる。
  const parts = normalized.split(/[/-]/).filter((p) => p !== "");
  if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
    const [y, m, d] = parts;
    const joined =
      y.slice(0, 4) +
      m.padStart(2, "0").slice(0, 2) +
      d.padStart(2, "0").slice(0, 2);
    return formatBirthDateDigits(joined.slice(0, 8));
  }

  const digits = normalized.replace(/\D/g, "").slice(0, 8);
  return formatBirthDateDigits(digits);
}

/** 数字列（最大8桁）を段階的に YYYY/MM/DD へ整形する内部ヘルパー。 */
function formatBirthDateDigits(digits: string): string {
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}/${digits.slice(4)}`;
  return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`;
}

/**
 * 生年月日の共通スキーマ。
 *
 * 誕生日はカレンダーピッカー（type="date"）で何十年も遡るのが煩雑なため、
 * 半角テキストで直接入力できる UI（type="text"）に変更した。本スキーマで
 * 形式（YYYY/MM/DD または YYYY-MM-DD）と実在日付を検証し、DB 用に
 * `YYYY-MM-DD`（ゼロ詰め）へ正規化する。
 *
 * - 区切りは `/` でも `-` でも可
 * - 1900 年〜今年、かつ実在する日付のみ許可（例: 2020/02/30 は拒否）
 * - 出力は常に `YYYY-MM-DD`
 */
export const birthDateSchema = z
  .string()
  .min(1, "生年月日を入力してください")
  .refine(
    (s) => /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s.trim()),
    "生年月日は半角で「1990/01/15」の形式で入力してください",
  )
  .refine((s) => {
    const [y, m, d] = s
      .trim()
      .split(/[-/]/)
      .map((n) => Number(n));
    const thisYear = new Date().getFullYear();
    if (y < 1900 || y > thisYear) return false;
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(y, m - 1, d);
    // ロールオーバー検出（例: 2/30 → 3/2 になる）
    return (
      dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
    );
  }, "正しい生年月日を入力してください")
  .transform((s) => {
    const [y, m, d] = s
      .trim()
      .split(/[-/]/)
      .map((n) => Number(n));
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  });
