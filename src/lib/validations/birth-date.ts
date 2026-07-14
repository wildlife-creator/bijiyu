import { z } from "zod";

/**
 * 生年月日文字列（`YYYY-MM-DD` / `YYYY/MM/DD` / 部分入力 / 空）を年・月・日に分解する。
 *
 * 生年月日は「年＝数字入力・月/日＝プルダウン」の 3 分割 UI（{@link "@/components/shared/birth-date-field"}）
 * で入力するため、単一文字列 ⇔ 3 パーツの変換が必要になる。区切りは `/` でも `-` でも可。
 *
 * - 年は数字 4 桁まで（それ以外の文字は除去）
 * - 月・日は先頭ゼロを外した数値文字列に正規化（DB から来る `"01"` → `"1"`）。
 *   プルダウンの option value（`"1"`〜`"12"` / `"1"`〜`"31"`）と一致させるため
 * - 値が無いパーツは空文字を返す
 */
export function splitBirthDate(value: string | null | undefined): {
  year: string;
  month: string;
  day: string;
} {
  const parts = (value ?? "").split(/[-/]/);
  return {
    year: (parts[0] ?? "").replace(/\D/g, "").slice(0, 4),
    month: normalizeUnit(parts[1]),
    day: normalizeUnit(parts[2]),
  };
}

/** 月・日の 1 パーツを「先頭ゼロなしの数値文字列」に整える。空・非数値は空文字。 */
function normalizeUnit(raw: string | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits === "") return "";
  const n = Number(digits);
  return Number.isNaN(n) || n === 0 ? "" : String(n);
}

/**
 * 年・月・日パーツを 1 本の生年月日文字列（`YYYY/MM/DD`）に結合する。
 *
 * 3 つとも空なら空文字を返す（「未入力」を表し、{@link birthDateSchema} の
 * 「生年月日を入力してください」で弾ける）。一部だけ埋まっている途中状態は
 * `1990//` のように区切りだけ残し、形式エラーとして検出させる。
 */
export function joinBirthDate(year: string, month: string, day: string): string {
  if (!year && !month && !day) return "";
  return `${year}/${month}/${day}`;
}

/**
 * 指定した年・月の日数（28〜31）を返す。月が未確定なら 31 を返す。
 * 年が 4 桁に満たない場合は閏年（2000）扱いにして 2/29 を許容する
 * （後から年が確定した時点で {@link clampBirthDay} が調整する）。
 */
export function daysInBirthMonth(year: string, month: string): number {
  const m = Number(month);
  if (!m || m < 1 || m > 12) return 31;
  const y = /^\d{4}$/.test(year) ? Number(year) : 2000;
  // new Date(y, m, 0) = 「(m+1) 月の 0 日目」= m 月の末日
  return new Date(y, m, 0).getDate();
}

/**
 * 現在の日が、年・月から決まる末日を超えていれば末日にクランプする。
 * 月を「31 日→30 日の月」に変えた時などに、無効な日付が残らないようにする。
 */
export function clampBirthDay(day: string, year: string, month: string): string {
  if (!day || !month) return day;
  const max = daysInBirthMonth(year, month);
  return Number(day) > max ? String(max) : day;
}

/**
 * 生年月日の共通スキーマ。
 *
 * 入力 UI は「年＝数字入力・月/日＝プルダウン」の 3 分割で、内部的には
 * `YYYY/MM/DD`（区切りは `/` または `-`）の 1 本の文字列にまとめて本スキーマに渡す。
 * 本スキーマで形式と実在日付を検証し、DB 用に `YYYY-MM-DD`（ゼロ詰め）へ正規化する。
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
    "生年月日をすべて選択してください",
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
