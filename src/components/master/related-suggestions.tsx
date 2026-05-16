"use client";

/**
 * RelatedSuggestions (受注者プロフィール用)
 *
 * 直前に選んだ trade_type と同じ中カテゴリ配下の他 trade-types を
 * 「関連候補」として下方に表示する。
 * 「閉じる」または「スキップ」操作で非表示にできる任意 UI。
 * ピック時は親側で「既選択リストへの append + 経験年数欄の同時表示」を実行する。
 *
 * 注意:
 *   - qualifications / skill_tags には載せない（フラット構造で系統がないため）
 *   - 親が pickedTrade を渡している間のみ表示する
 *   - allActiveTradeTypes には deprecated 済みは含めない（呼び出し側で除外）
 */

import * as React from "react";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { siblingsInSameMidCategory } from "@/lib/master/category";

export interface RelatedSuggestionsProps {
  /** 直前に選んだ trade_type label。null のときは何も表示しない */
  pickedTrade: string | null;
  /** active な trade-types 一覧（deprecated 済みは事前除外） */
  allActiveTradeTypes: string[];
  /** すでに value 配列に入っている label。候補から除外する */
  alreadySelected: string[];
  /** 候補をピックしたとき親に通知する */
  onPick: (label: string) => void;
  /** 「閉じる/スキップ」操作。親側で pickedTrade を null にする */
  onDismiss: () => void;
}

export function RelatedSuggestions({
  pickedTrade,
  allActiveTradeTypes,
  alreadySelected,
  onPick,
  onDismiss,
}: RelatedSuggestionsProps) {
  const siblings = React.useMemo(() => {
    if (!pickedTrade) return [];
    const all = siblingsInSameMidCategory(pickedTrade, allActiveTradeTypes);
    const selectedSet = new Set(alreadySelected);
    return all.filter((label) => !selectedSet.has(label));
  }, [pickedTrade, allActiveTradeTypes, alreadySelected]);

  if (!pickedTrade || siblings.length === 0) return null;

  return (
    <div className="rounded-[8px] border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <p className="text-body-sm font-semibold text-foreground">
          関連候補
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="関連候補を閉じる"
          className="rounded-full p-1 hover:bg-muted"
        >
          <XIcon className="size-4 text-muted-foreground" />
        </button>
      </div>
      <p className="mt-1 text-body-xs text-muted-foreground">
        「{pickedTrade}」と同じカテゴリの職種です。必要なものをタップして追加できます。
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {siblings.map((label) => (
          <Button
            key={label}
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => onPick(label)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onDismiss}
          className="text-body-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          スキップ
        </button>
      </div>
    </div>
  );
}
