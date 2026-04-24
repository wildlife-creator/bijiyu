"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface MultiSelectProps {
  options: readonly string[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * シンプルなマルチセレクトプルダウン。
 * Popover / Command コンポーネントを使わずに dropdown を自前実装する。
 *
 * UI:
 * - トリガー: 選択済み値を「、」区切りで表示（未選択は placeholder）
 * - パネル: オプション一覧 + 疑似チェックボックスで複数選択可能
 * - クリック外で閉じる
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "お選びください",
  disabled,
  id,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function toggle(opt: string) {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  }

  const hasValue = value.length > 0;
  const summary = hasValue ? value.join("、") : placeholder;

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => !disabled && setOpen((s) => !s)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-[8px] border border-border bg-background px-3 py-2 text-left text-body-sm transition-colors disabled:cursor-not-allowed disabled:bg-muted ${
          hasValue ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-[8px] border border-border bg-background shadow-lg">
          <ul className="p-1" role="listbox" aria-multiselectable>
            {options.map((opt) => {
              const selected = value.includes(opt);
              return (
                <li key={opt} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => toggle(opt)}
                    className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-body-sm transition-colors ${
                      selected
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        selected
                          ? "border-primary bg-primary"
                          : "border-border bg-background"
                      }`}
                      aria-hidden
                    >
                      {selected && <Check className="size-3 text-white" />}
                    </span>
                    <span className={selected ? "font-medium" : ""}>{opt}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
