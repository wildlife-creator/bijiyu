"use client";

/**
 * CollapsibleList (プロフィール表示の「主要 N 件 + もっと見る」)
 *
 * COM-001 / CLI-006 等の受注者プロフィール詳細で、3 マスタ項目
 * （対応職種・保有資格・保有スキル）を「主要 N 件 + もっと見る」表示する。
 *
 * 仕様:
 *   - items.length === 0 のとき null を返す
 *   - initialLimit より少ない場合は全件表示、ボタンは非表示
 *   - N の既定値は呼び出し側で指定（対応職種=5 / 保有資格=5 / 保有スキル=8）
 *   - 廃止判定 / サフィックス付与は行わない。保存値をそのまま表示する
 */

import * as React from "react";

import { Button } from "@/components/ui/button";

export interface CollapsibleListProps {
  items: string[];
  initialLimit: number;
  /** chip / 行スタイルのいずれか。既定は chip */
  variant?: "chip" | "row";
  /** 「もっと見る」ボタンの表示文言 */
  showMoreLabel?: string;
  /** 「折りたたむ」ボタンの表示文言 */
  showLessLabel?: string;
}

export function CollapsibleList({
  items,
  initialLimit,
  variant = "chip",
  showMoreLabel = "もっと見る",
  showLessLabel = "折りたたむ",
}: CollapsibleListProps) {
  const [expanded, setExpanded] = React.useState(false);

  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, initialLimit);
  const hasMore = items.length > initialLimit;

  return (
    <div className="space-y-2">
      {variant === "chip" ? (
        <div className="flex flex-wrap gap-1.5">
          {visible.map((label) => (
            <span
              key={label}
              className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-body-xs text-primary"
            >
              {label}
            </span>
          ))}
        </div>
      ) : (
        <ul className="space-y-1">
          {visible.map((label) => (
            <li key={label} className="text-body-sm text-foreground">
              {label}
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          className="text-body-sm text-primary"
        >
          {expanded ? showLessLabel : showMoreLabel}
        </Button>
      )}
    </div>
  );
}
