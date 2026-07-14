"use client";

import { useMemo } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  clampBirthDay,
  daysInBirthMonth,
  joinBirthDate,
  splitBirthDate,
} from "@/lib/validations/birth-date";

interface BirthDateFieldProps {
  /** `YYYY-MM-DD` / `YYYY/MM/DD` / 部分入力 / 空文字を受け取る */
  value: string;
  /** 結合後の `YYYY/MM/DD`（未入力時は空文字）を返す */
  onChange: (value: string) => void;
  /** 年入力欄の id。外側 Label の htmlFor と対応づける */
  yearInputId?: string;
  /** 送信バリデーションでエラーがある時に赤枠表示する */
  invalid?: boolean;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * 生年月日入力フィールド（年＝数字入力・月/日＝プルダウン）。
 *
 * 以前は 1 つのテキスト欄で 1 文字ごとに `YYYY/MM/DD` へ自動整形していたが、
 * 値を丸ごと書き換えるためカーソルが末尾へ飛び、途中修正・スラッシュ削除・部分選択が
 * できなかった。年・月・日を独立した 3 コントロールに分けることで、
 * 「間違えた欄だけ選び直す」自然な修正操作を可能にしている。
 *
 * - 年: 数字 4 桁のみ。区切りを挿入しないため入力途中でカーソルが飛ばない
 * - 月・日: プルダウン。日の選択肢は年・月から実在する日数に追従する
 * - 単一文字列 ⇔ 3 パーツの変換は {@link splitBirthDate} / {@link joinBirthDate} が担う
 */
export function BirthDateField({
  value,
  onChange,
  yearInputId,
  invalid,
}: BirthDateFieldProps) {
  const { year, month, day } = useMemo(() => splitBirthDate(value), [value]);

  const dayOptions = useMemo(() => {
    const max = daysInBirthMonth(year, month);
    return Array.from({ length: max }, (_, i) => i + 1);
  }, [year, month]);

  const handleYear = (raw: string) => {
    const nextYear = raw.replace(/\D/g, "").slice(0, 4);
    // 閏年判定が変わり 2/29 が無効になった場合などに日をクランプ
    onChange(joinBirthDate(nextYear, month, clampBirthDay(day, nextYear, month)));
  };

  const handleMonth = (nextMonth: string) => {
    onChange(joinBirthDate(year, nextMonth, clampBirthDay(day, year, nextMonth)));
  };

  const handleDay = (nextDay: string) => {
    onChange(joinBirthDate(year, month, nextDay));
  };

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <div className="flex items-center gap-1.5">
        <Input
          id={yearInputId}
          type="text"
          inputMode="numeric"
          maxLength={4}
          placeholder="1985"
          aria-label="生年（西暦）"
          aria-invalid={invalid || undefined}
          className="w-20 bg-background md:text-base"
          value={year}
          onChange={(e) => handleYear(e.target.value)}
        />
        <span className="text-muted-foreground text-body-sm">年</span>
      </div>

      <div className="flex items-center gap-1.5">
        <Select value={month} onValueChange={handleMonth}>
          <SelectTrigger
            aria-label="月"
            aria-invalid={invalid || undefined}
            className="w-16 bg-background text-base"
          >
            <SelectValue placeholder="--" />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-body-sm">月</span>
      </div>

      <div className="flex items-center gap-1.5">
        <Select value={day} onValueChange={handleDay}>
          <SelectTrigger
            aria-label="日"
            aria-invalid={invalid || undefined}
            className="w-16 bg-background text-base"
          >
            <SelectValue placeholder="--" />
          </SelectTrigger>
          <SelectContent>
            {dayOptions.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-body-sm">日</span>
      </div>
    </div>
  );
}
