"use client";

/**
 * AreaListEditor (master-area-multi-select Phase C Task 3.1)
 *
 * 登録系フォーム共通のエリア入力 UI。
 *
 * 新モデル: 1 行 = 1 県 + N 市区町村 / または県全域 (Phase A AreaRow 型)
 *
 *   - 内部で `AreaRow` 部品 (src/components/area/area-row.tsx) を縦に並べる
 *   - 「+ 県を追加」ボタンで末尾に空行 `{ prefecture: "", whole: false, municipalities: [] }` を追加
 *   - 各行右上のゴミ箱ボタンで該当行を即時削除 (確認ダイアログなし、Req 1-9)
 *   - 他行で選択済みの prefecture は各 AreaRow の disabledPrefectures に集約 (同県重複の UI 防御、Req 3-1/3-2)
 *   - 件数カウンター・上限警告・soft cap 警告 UI は **一切表示しない** (Req 1-11, 7-4)
 *   - 案件 10 件上限は保存時 Zod エラー (jobAreaRowsSchema) で実現する
 *
 * `<form>` 内に配置されるため、追加・削除を含むすべての button に
 * type="button" を明示する (CLAUDE.md 「フォーム内 button には必ず type を明示する」準拠)。
 *
 * 親フォーム連携:
 *   - 親は `value: AreaRow[]` と `onChange: (next: AreaRow[]) => void` で controlled component として利用
 *   - 既存 DB データを表示する際は Server Component 側で `collapseAreasFromDb(pairs, sortOrderMap)` を通した
 *     `AreaRow[]` を defaultValues に注入する
 */

import * as React from "react";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { AreaRow as AreaRowComponent } from "./area-row";
import type { AreaRow } from "./types";

export interface AreaListEditorProps {
  value: AreaRow[];
  onChange: (next: AreaRow[]) => void;
  /** 都道府県別の active 市区町村候補 (Server Component から JSON 注入) */
  candidateMunicipalitiesByPrefecture: Record<string, string[]>;
  /** 既存登録の廃止 muni allow-list (チェック済み保持のため) */
  existingDeprecatedMunicipalitiesByPrefecture?: Record<string, string[]>;
  /** 「+ 県を追加」ボタンのラベル */
  addLabel?: string;
  disabled?: boolean;
  className?: string;
}

const EMPTY_ROW: AreaRow = {
  prefecture: "",
  whole: false,
  municipalities: [],
};

export function AreaListEditor({
  value,
  onChange,
  candidateMunicipalitiesByPrefecture,
  existingDeprecatedMunicipalitiesByPrefecture,
  addLabel = "+ 県を追加",
  disabled = false,
  className,
}: AreaListEditorProps) {
  const handleRowChange = (index: number, next: AreaRow) => {
    const newValue = value.slice();
    newValue[index] = next;
    onChange(newValue);
  };

  const handleRowRemove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleAddRow = () => {
    onChange([...value, { ...EMPTY_ROW }]);
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {value.map((row, index) => {
        // 他行で選択済みの prefecture (本行を除く)
        const disabledPrefectures = value
          .map((r, i) => (i !== index && r.prefecture ? r.prefecture : null))
          .filter((p): p is string => p !== null);
        return (
          // eslint-disable-next-line react/no-array-index-key -- 並び替えなし・ID なしのため index で十分
          <div key={index} className="flex items-start gap-2">
            <div className="flex-1">
              <AreaRowComponent
                value={row}
                onChange={(next) => handleRowChange(index, next)}
                candidateMunicipalitiesByPrefecture={
                  candidateMunicipalitiesByPrefecture
                }
                existingDeprecatedMunicipalitiesByPrefecture={
                  existingDeprecatedMunicipalitiesByPrefecture
                }
                disabledPrefectures={disabledPrefectures}
                disabled={disabled}
              />
            </div>
            <button
              type="button"
              onClick={() => handleRowRemove(index)}
              disabled={disabled}
              aria-label={`エリア ${index + 1} を削除`}
              className="mt-1 cursor-pointer rounded-full p-2 text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        onClick={handleAddRow}
        disabled={disabled}
        className="self-start"
      >
        {addLabel}
      </Button>
    </div>
  );
}
