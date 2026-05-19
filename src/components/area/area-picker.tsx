"use client";

/**
 * AreaPicker
 *
 * 都道府県 Select + 市区町村 MasterCombobox の 2 段プルダウン (単一行)。
 * 検索ポップアップと入力フォームの両方で共用する。
 *
 * 仕様 (Req 2.3 / 2.4 / 3.3 / 6.3 / 6.4 / 10.4):
 *   - 都道府県: 47 件固定 shadcn `<Select>`
 *   - 市区町村: 選択都道府県でフィルタした候補を `MasterCombobox` (single mode) に渡す
 *   - 都道府県未選択時は市区町村側 `disabled`
 *   - 市区町村は任意 (未選択 = null = 「県全域」)
 *   - 都道府県を変更すると municipality を null にリセット (不整合防止)
 *   - props で受け取る `municipalitiesByPrefecture` は Server Component で
 *     `getActiveMunicipalities()` を呼び都道府県別に group して JSON 注入
 *
 * 廃止市区町村の扱い (Req 1.8):
 *   - AreaPicker 単体では廃止判定を行わない (候補は active のみ)
 *   - 親コンポーネント (AreaListEditor 経由) が既存値に「（廃止）」サフィックスを
 *     付与し、value.municipality として渡す。保存時に親側で stripDeprecatedSuffix
 *     して Server Action に渡す
 *
 * 値の型は `AreaDraft`。prefecture が null = 「未選択ドラフト」状態。
 */

import * as React from "react";
import { MasterCombobox } from "@/components/master/master-combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PREFECTURES } from "@/lib/constants/options";
import { cn } from "@/lib/utils";

export interface AreaDraft {
  prefecture: string | null;
  municipality: string | null;
}

export interface AreaPickerProps {
  value: AreaDraft;
  onChange: (next: AreaDraft) => void;
  /** 都道府県別の active 市区町村候補 (Server Component から JSON 注入) */
  municipalitiesByPrefecture: Record<string, string[]>;
  disabled?: boolean;
  className?: string;
  /** 都道府県側のラベル / placeholder */
  prefecturePlaceholder?: string;
  /** 市区町村側のラベル / placeholder */
  municipalityPlaceholder?: string;
}

export function AreaPicker({
  value,
  onChange,
  municipalitiesByPrefecture,
  disabled = false,
  className,
  prefecturePlaceholder = "都道府県を選択",
  municipalityPlaceholder = "市区町村は任意（県全域でも検索可）",
}: AreaPickerProps) {
  const candidates = React.useMemo<string[]>(() => {
    if (!value.prefecture) return [];
    return municipalitiesByPrefecture[value.prefecture] ?? [];
  }, [value.prefecture, municipalitiesByPrefecture]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Select
        value={value.prefecture ?? ""}
        onValueChange={(v) => {
          // 都道府県を変更したら municipality を null にリセット
          onChange({ prefecture: v || null, municipality: null });
        }}
        disabled={disabled}
      >
        <SelectTrigger className="w-full bg-background text-body-sm">
          <SelectValue placeholder={prefecturePlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {PREFECTURES.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <MasterCombobox
        mode="single"
        options={candidates}
        value={value.municipality ? [value.municipality] : []}
        onChange={(next) => {
          onChange({ ...value, municipality: next[0] ?? null });
        }}
        placeholder={municipalityPlaceholder}
        singleTriggerLabel={municipalityPlaceholder}
        emptyLabel="該当する市区町村がありません"
        disabled={disabled || !value.prefecture}
      />
    </div>
  );
}
