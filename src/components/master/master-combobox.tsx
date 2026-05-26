"use client";

/**
 * MasterCombobox
 *
 * cmdk + Radix Popover による単一/複数選択 combobox。
 * 入力 4 画面（COM-002 / AUTH-006 / CLI-021 / job-form）と
 * 検索 3 画面（CLI-005 / CON-002 / CON-005）の計 7 画面で共用する。
 *
 * 機能:
 *   - mode="single": ピック後に value=[picked] を親に通知し、Popover を閉じる
 *   - mode="multi":  ピック後に value=[...prev, picked] を親に通知し、開いたまま
 *   - 既選択を候補から除外
 *   - 候補 0 件時に emptyLabel を表示
 *   - chip の × ボタンで個別解除
 *   - 入力空のとき Backspace で末尾 chip 削除
 *   - 日本語 IME の確定前 Enter で誤確定しない
 *   - 候補 filter は `toLowerCase().includes()` のクライアント側部分一致
 */

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Popover as PopoverPrimitive } from "radix-ui";
import { XIcon, ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type MasterComboboxMode = "single" | "multi";

export interface MasterComboboxProps {
  mode: MasterComboboxMode;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** 候補 0 件時に表示するメッセージ */
  emptyLabel?: string;
  /** 全候補を取得失敗したときの fallback */
  loadingFailedLabel?: string;
  disabled?: boolean;
  /** mode="single" 時に value 空でも表示するヒント */
  singleTriggerLabel?: string;
  className?: string;
}

export function MasterCombobox({
  mode,
  options,
  value,
  onChange,
  placeholder = "検索",
  emptyLabel = "候補がありません",
  disabled = false,
  singleTriggerLabel,
  className,
}: MasterComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const composingRef = React.useRef(false);

  const candidates = React.useMemo(() => {
    const selectedSet = new Set(value);
    const q = search.trim().toLowerCase();
    return options.filter((opt) => {
      if (selectedSet.has(opt)) return false;
      if (!q) return true;
      return opt.toLowerCase().includes(q);
    });
  }, [options, value, search]);

  const handlePick = React.useCallback(
    (picked: string) => {
      if (mode === "single") {
        onChange([picked]);
        setSearch("");
        setOpen(false);
        return;
      }
      if (value.includes(picked)) return;
      onChange([...value, picked]);
      setSearch("");
    },
    [mode, value, onChange],
  );

  const handleRemove = React.useCallback(
    (label: string) => {
      onChange(value.filter((v) => v !== label));
    },
    [onChange, value],
  );

  const handleInputKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (
    e,
  ) => {
    if (composingRef.current) return;
    if (e.key === "Backspace" && search === "" && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-slot="master-combobox-trigger"
          className={cn(
            "flex min-h-10 w-full items-center gap-2 rounded-[8px] border border-input bg-background px-3 py-2 text-left text-sm shadow-xs",
            "focus-visible:outline-2 focus-visible:outline-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            {mode === "multi" &&
              value.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-body-xs text-primary"
                >
                  {label}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`${label} を削除`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(label);
                    }}
                    className="cursor-pointer rounded-full p-0.5 hover:bg-primary/20"
                  >
                    <XIcon className="size-3" />
                  </span>
                </span>
              ))}
            {mode === "single" && value.length === 1 && (
              <span className="text-foreground">{value[0]}</span>
            )}
            {mode === "single" && value.length === 0 && (
              <span className="text-muted-foreground">
                {singleTriggerLabel ?? placeholder}
              </span>
            )}
            {mode === "multi" && value.length === 0 && (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-[8px] border border-border bg-popover p-0 shadow-md"
        >
          <CommandPrimitive
            // cmdk 既定の filter を無効化（候補絞り込みは props.options 側で完結）
            shouldFilter={false}
            className="w-full"
          >
            <CommandPrimitive.Input
              value={search}
              onValueChange={setSearch}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              onKeyDown={handleInputKeyDown}
              placeholder={placeholder}
              className="w-full border-b border-border bg-background px-3 py-2 text-body-sm outline-none placeholder:text-muted-foreground"
            />
            <CommandPrimitive.List className="max-h-64 overflow-y-auto p-1">
              {candidates.length === 0 ? (
                <CommandPrimitive.Empty className="px-3 py-4 text-center text-body-sm text-muted-foreground">
                  {emptyLabel}
                </CommandPrimitive.Empty>
              ) : (
                candidates.map((opt) => (
                  <CommandPrimitive.Item
                    key={opt}
                    value={opt}
                    onSelect={() => handlePick(opt)}
                    className="cursor-pointer rounded-[4px] px-3 py-2 text-body-sm aria-selected:bg-primary/10 hover:bg-primary/10"
                  >
                    {opt}
                  </CommandPrimitive.Item>
                ))
              )}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
