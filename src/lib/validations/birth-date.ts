import { z } from "zod";

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
