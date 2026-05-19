"use client";

/**
 * AreaListEditor
 *
 * 動的なエリア行リスト管理コンポーネント。各行は AreaPicker で構成される。
 *
 * 仕様 (Req 2.7 / 3.6 / 4.4 / 4.5 / 4.6 / 10.5):
 *   - 行ごとに `AreaPicker` を表示、右側「×」ボタンで行削除
 *   - 最下部に「+ エリアを追加」ボタン
 *   - props で minItems / maxItems / softCapWarning を受け取る
 *   - 削除ボタンは minItems 到達時に disabled、追加ボタンは maxItems 到達時に
 *     disabled + tooltip
 *   - **`<form>` 内に配置されるため、追加・削除ボタンは type="button" を必ず明示する**
 *     (CLAUDE.md「フォーム内の <button> には必ず type を明示する」ルール準拠)
 *   - softCapWarning を超えた時点で警告 inline 表示 (受注者・発注者の soft cap)
 *   - 初期 value.length === 0 のときは内部で空 minItems 件分の空行を自動追加 (useEffect)
 *   - SP/PC ともに縦並び (`flex flex-col gap-3`)
 *
 * 親フォーム連携:
 *   - 親は react-hook-form の useFieldArray + useWatch で `AreaDraft[]` を管理し、
 *     value/onChange に渡す (onChange 側は `replace()` で全置換、または setValue)
 *
 * 廃止市区町村の編集表示:
 *   - 親が既存登録の廃止 muni に「（廃止）」サフィックスを付けて value に渡す
 *   - 保存時は親で stripDeprecatedSuffix して Server Action 用 AreaTuple[] にする
 */

import * as React from "react";
import { XIcon } from "lucide-react";
import { AreaPicker, type AreaDraft } from "./area-picker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AreaListEditorProps {
  value: AreaDraft[];
  onChange: (next: AreaDraft[]) => void;
  municipalitiesByPrefecture: Record<string, string[]>;
  /** 最少件数 (default 1)。これ以下では削除ボタン disabled */
  minItems?: number;
  /** 最大件数。指定時、これ以上の追加は不可 (追加ボタン disabled) */
  maxItems?: number;
  /** soft cap: 超えても保存可能だが警告 inline 表示 */
  softCapWarning?: number;
  /** soft cap 超過時の警告メッセージ */
  softCapWarningLabel?: string;
  /** 「+ エリアを追加」ボタンのラベル */
  addLabel?: string;
  /** maxItems 到達時の tooltip テキスト */
  maxReachedTooltip?: string;
  disabled?: boolean;
  className?: string;
}

export function AreaListEditor({
  value,
  onChange,
  municipalitiesByPrefecture,
  minItems = 1,
  maxItems,
  softCapWarning,
  softCapWarningLabel = "対応エリアが多すぎると絞り込み効果が薄れます",
  addLabel = "+ エリアを追加",
  maxReachedTooltip,
  disabled = false,
  className,
}: AreaListEditorProps) {
  // 初期 value.length === 0 のときは空 minItems 件分を内部で自動追加し parent に通知
  React.useEffect(() => {
    if (value.length === 0 && minItems > 0) {
      const empty: AreaDraft[] = Array.from({ length: minItems }, () => ({
        prefecture: null,
        municipality: null,
      }));
      onChange(empty);
    }
  }, [value.length, minItems, onChange]);

  const handleRowChange = (index: number, next: AreaDraft) => {
    const newValue = value.slice();
    newValue[index] = next;
    onChange(newValue);
  };

  const handleRowRemove = (index: number) => {
    if (value.length <= minItems) return;
    onChange(value.filter((_, i) => i !== index));
  };

  const handleAddRow = () => {
    if (maxItems !== undefined && value.length >= maxItems) return;
    onChange([...value, { prefecture: null, municipality: null }]);
  };

  const isMaxReached = maxItems !== undefined && value.length >= maxItems;
  const isSoftCapExceeded =
    softCapWarning !== undefined && value.length > softCapWarning;
  const tooltip = isMaxReached
    ? (maxReachedTooltip ?? `最大${maxItems}件まで`)
    : undefined;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {value.map((row, index) => (
        // eslint-disable-next-line react/no-array-index-key -- 並べ替えなし・行 ID なしのため index で十分
        <div key={index} className="flex items-start gap-2">
          <div className="flex-1">
            <AreaPicker
              value={row}
              onChange={(next) => handleRowChange(index, next)}
              municipalitiesByPrefecture={municipalitiesByPrefecture}
              disabled={disabled}
            />
          </div>
          <button
            type="button"
            onClick={() => handleRowRemove(index)}
            disabled={disabled || value.length <= minItems}
            aria-label={`エリア ${index + 1} を削除`}
            className="mt-1 cursor-pointer rounded-full p-2 text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleAddRow}
          disabled={disabled || isMaxReached}
          className="self-start"
          title={tooltip}
        >
          {addLabel}
        </Button>
        {isSoftCapExceeded && (
          <p className="text-body-xs text-amber-600">{softCapWarningLabel}</p>
        )}
      </div>
    </div>
  );
}
