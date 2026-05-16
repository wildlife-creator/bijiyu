"use client";

/**
 * CategoryBulkSelector (CLI-021 専用)
 *
 * 「カテゴリで一括選択」ボタンと、押下で開くダイアログ（大カテ / 中カテの
 * 2 段ネストツリー + チェックボックス）を提供する。
 * 「追加する」操作で、選択された中カテ配下の全 trade-types を value に push する。
 *
 * 注意:
 *   - 受注者プロフィール（COM-002）には載せない。発注者情報編集（CLI-021）専用
 *   - 既選択分はスキップ、`deprecated_at IS NULL` のみ追加候補
 *   - 確認時に「N 件追加」を明示
 */

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  listBigCategories,
  listMidCategories,
  parseTradeTypeCategory,
} from "@/lib/master/category";

export interface CategoryBulkSelectorProps {
  /** active な trade-types 一覧（deprecated は事前に除外して渡すこと） */
  options: string[];
  /** 現在の選択値（既存選択分はスキップする） */
  value: string[];
  /** value に追加して通知する */
  onChange: (next: string[]) => void;
  triggerLabel?: string;
}

export function CategoryBulkSelector({
  options,
  value,
  onChange,
  triggerLabel = "カテゴリで一括選択",
}: CategoryBulkSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedMids, setSelectedMids] = React.useState<Set<string>>(
    new Set(),
  );

  const bigs = React.useMemo(() => listBigCategories(options), [options]);
  const midsByBig = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const { big, mid } of listMidCategories(options)) {
      const arr = map.get(big) ?? [];
      arr.push(mid);
      map.set(big, arr);
    }
    return map;
  }, [options]);

  const reset = () => setSelectedMids(new Set());

  const toggleMid = (big: string, mid: string) => {
    const key = `${big}|${mid}`;
    const next = new Set(selectedMids);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedMids(next);
  };

  const additions = React.useMemo(() => {
    const valueSet = new Set(value);
    const additions: string[] = [];
    for (const label of options) {
      if (valueSet.has(label)) continue;
      const { big, mid } = parseTradeTypeCategory(label);
      if (!big || !mid) continue;
      if (selectedMids.has(`${big}|${mid}`)) {
        additions.push(label);
      }
    }
    return additions;
  }, [options, value, selectedMids]);

  const handleAdd = () => {
    if (additions.length === 0) {
      setOpen(false);
      reset();
      return;
    }
    onChange([...value, ...additions]);
    setOpen(false);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="rounded-full">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>カテゴリで一括選択</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {bigs.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">
              カテゴリ情報のある職種がありません。
            </p>
          ) : (
            bigs.map((big) => {
              const mids = midsByBig.get(big) ?? [];
              return (
                <section key={big}>
                  <h3 className="mb-2 text-body-md font-bold text-foreground">
                    {big}
                  </h3>
                  <div className="space-y-2 pl-2">
                    {mids.map((mid) => {
                      const key = `${big}|${mid}`;
                      const checked = selectedMids.has(key);
                      return (
                        <label
                          key={key}
                          className="flex items-center gap-2 text-body-sm text-foreground"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleMid(big, mid)}
                          />
                          <span>{mid}</span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </div>
        <DialogFooter className="flex items-center justify-between gap-2">
          <p className="text-body-sm text-muted-foreground">
            {additions.length === 0
              ? "選択中のカテゴリはありません"
              : `${additions.length} 件追加`}
          </p>
          <div className="flex items-center gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="rounded-full">
                キャンセル
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={additions.length === 0}
              className="rounded-full text-white"
            >
              追加する
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
