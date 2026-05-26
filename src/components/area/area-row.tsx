"use client";

/**
 * AreaRow (master-area-multi-select Phase B Task 2.1)
 *
 * 1 県分のエリア入力 UI:
 *   - 都道府県 Select (shadcn `<Select>`)
 *   - 「全域」Checkbox (登録系のみ。検索系では showWholeCheckbox={false})
 *   - 市区町村 Checkbox 群 (グリッド表示)
 *
 * Phase A の `AreaRow` 型に対する controlled component。state は親が保持し、
 * value/onChange で受け渡す。
 *
 * 表示ルール (Req 1.3〜1.7 / 2.1〜2.6 / 3.2 / 7.3):
 *   - prefecture === "" の間は「全域」と muni 群を非表示 (Issue 4 確定)
 *   - 「全域」ON 時は municipalities を即時クリア、muni 群は disabled グレーアウト
 *   - 他行で選択済みの prefecture は Select 候補で「(他の行で選択済み)」disabled
 *   - 廃止済み muni はチェック済みの場合のみ「○○区（廃止）」サフィックスで保持表示
 *   - 市区町村 Checkbox 群はスマホ 1 列 / タブレット以上 2 列のレスポンシブグリッド
 *
 * フォーム内 button はすべて type="button" を明示
 * (CLAUDE.md「フォーム内の <button> には必ず type を明示する」準拠)。
 */

import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PREFECTURES } from "@/lib/constants/options";
import { cn } from "@/lib/utils";

import type { AreaRow } from "./types";

export interface AreaRowProps {
  value: AreaRow;
  onChange: (next: AreaRow) => void;
  /** 当該行で選択可能な candidate municipalities (active のみ、prefecture でフィルタ済み) */
  candidateMunicipalitiesByPrefecture: Record<string, string[]>;
  /** 廃止 muni を含む既存登録 muni (削除済みでも保持表示するための allow-list) */
  existingDeprecatedMunicipalitiesByPrefecture?: Record<string, string[]>;
  /** 他行で既に選択済みの prefecture (本行の Select で disabled 表示) */
  disabledPrefectures?: string[];
  /** 検索系では「全域」チェックボックスを非表示 (Req 7B-3) */
  showWholeCheckbox?: boolean;
  disabled?: boolean;
  className?: string;
}

export function AreaRow({
  value,
  onChange,
  candidateMunicipalitiesByPrefecture,
  existingDeprecatedMunicipalitiesByPrefecture = {},
  disabledPrefectures = [],
  showWholeCheckbox = true,
  disabled = false,
  className,
}: AreaRowProps) {
  const handlePrefectureChange = (next: string) => {
    // 都道府県を変更したら whole / municipalities をリセット (不整合防止)
    onChange({ prefecture: next, whole: false, municipalities: [] });
  };

  const handleWholeToggle = (checked: boolean) => {
    if (checked) {
      // 全域 ON で muni を即時クリア
      onChange({ ...value, whole: true, municipalities: [] });
    } else {
      onChange({ ...value, whole: false });
    }
  };

  const handleMunicipalityToggle = (muni: string, checked: boolean) => {
    if (checked) {
      if (value.municipalities.includes(muni)) return;
      onChange({ ...value, municipalities: [...value.municipalities, muni] });
    } else {
      onChange({
        ...value,
        municipalities: value.municipalities.filter((m) => m !== muni),
      });
    }
  };

  const candidates = value.prefecture
    ? (candidateMunicipalitiesByPrefecture[value.prefecture] ?? [])
    : [];
  const deprecatedSelected = value.prefecture
    ? (existingDeprecatedMunicipalitiesByPrefecture[value.prefecture] ?? [])
    : [];

  // 表示する muni リスト: active candidates + 既存登録の deprecated muni (重複除去)
  const muniSeen = new Set<string>();
  const muniDisplayList: Array<{ label: string; isDeprecated: boolean }> = [];
  for (const m of candidates) {
    if (muniSeen.has(m)) continue;
    muniSeen.add(m);
    muniDisplayList.push({ label: m, isDeprecated: false });
  }
  for (const m of deprecatedSelected) {
    if (muniSeen.has(m)) continue;
    muniSeen.add(m);
    muniDisplayList.push({ label: m, isDeprecated: true });
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Select
        value={value.prefecture}
        onValueChange={handlePrefectureChange}
        disabled={disabled}
      >
        <SelectTrigger className="min-h-10 w-full bg-background text-sm">
          <SelectValue placeholder="都道府県を選択" />
        </SelectTrigger>
        <SelectContent>
          {PREFECTURES.map((p) => {
            const isDisabledByOtherRow =
              disabledPrefectures.includes(p) && p !== value.prefecture;
            return (
              <SelectItem key={p} value={p} disabled={isDisabledByOtherRow}>
                {p}
                {isDisabledByOtherRow ? "（他の行で選択済み）" : ""}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {value.prefecture !== "" && (
        <>
          {showWholeCheckbox && (
            <label className="flex cursor-pointer items-center gap-2 text-body-sm">
              <Checkbox
                checked={value.whole}
                onCheckedChange={(c) => handleWholeToggle(c === true)}
                disabled={disabled}
              />
              <span>全域</span>
            </label>
          )}
          <div
            className={cn(
              "grid grid-cols-1 gap-x-3 gap-y-2 md:grid-cols-2",
              value.whole && "opacity-50",
            )}
          >
            {muniDisplayList.map(({ label, isDeprecated }) => {
              const checked = value.municipalities.includes(label);
              return (
                <label
                  key={label}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 text-body-sm",
                    (disabled || value.whole) && "cursor-not-allowed",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(c) =>
                      handleMunicipalityToggle(label, c === true)
                    }
                    disabled={disabled || value.whole}
                  />
                  <span>
                    {label}
                    {isDeprecated ? "（廃止）" : ""}
                  </span>
                </label>
              );
            })}
            {muniDisplayList.length === 0 && (
              <p className="text-body-xs text-muted-foreground">
                該当する市区町村がありません
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
