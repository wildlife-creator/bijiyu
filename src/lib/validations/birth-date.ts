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
  // 全角数字 → 半角、数字以外を除去
  const digits = raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\D/g, "")
    .slice(0, 8);

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
