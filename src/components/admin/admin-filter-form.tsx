"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PendingOverlay } from "@/components/shared/pending-overlay";

export interface AdminFilterSelect {
  /** URL のクエリ名（例: "category"） */
  name: string;
  label: string;
  /** "all" = 絞り込みなし（クエリに付けない） */
  initialValue: string;
  items: { value: string; label: string }[];
}

interface AdminFilterFormProps {
  /** 検索結果ページのパス（例: "/admin/users"） */
  basePath: string;
  /** キーワード入力欄の id（label の htmlFor と対にする） */
  keywordId: string;
  keywordPlaceholder: string;
  initialKeyword: string;
  /** キーワードの下に並べるプルダウン（0 個以上） */
  selects?: AdminFilterSelect[];
  /**
   * 検索で URL を組み直しても落とさずに引き継ぐクエリ（ドリルダウンの jobId / clientId、
   * 「もどる」の backTo、⇅ ボタンが管理する並び順など）。空値は付けない
   */
  passthrough?: Record<string, string | null | undefined>;
}

/**
 * admin 一覧画面共通の検索フォーム（キーワード + 任意個数のプルダウン + 検索ボタン）。
 * フィルタ状態は URL searchParams を SSOT とし、検索ボタンで router.push する
 * （新規検索時はページを 1 に戻す = page を付けない）。
 *
 * ブラウザの戻る/進むで URL（= initial*）が変わったときに入力欄の表示も追従させるため、
 * URL 由来の初期値を key にして内部 state を作り直す（「マウント時に一度だけ URL から写す」
 * 実装では、戻るで URL が検索前に戻っても入力欄が検索後の値のまま残っていた）。
 * 検索ボタンを押すまでの入力途中の値は、URL が変わらない限り保持される。
 */
export function AdminFilterForm(props: AdminFilterFormProps) {
  const resetKey = [
    props.initialKeyword,
    ...(props.selects ?? []).map((s) => s.initialValue),
    ...Object.values(props.passthrough ?? {}).map((v) => v ?? ""),
  ].join("|");
  return <AdminFilterFormInner key={resetKey} {...props} />;
}

function AdminFilterFormInner({
  basePath,
  keywordId,
  keywordPlaceholder,
  initialKeyword,
  selects = [],
  passthrough = {},
}: AdminFilterFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [keyword, setKeyword] = useState(initialKeyword);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(selects.map((s) => [s.name, s.initialValue || "all"])),
  );

  function handleSearch() {
    const params = new URLSearchParams();
    if (keyword.trim()) params.set("q", keyword.trim());
    for (const s of selects) {
      const v = values[s.name];
      if (v && v !== "all") params.set(s.name, v);
    }
    for (const [k, v] of Object.entries(passthrough)) {
      if (v) params.set(k, v);
    }
    startTransition(() =>
      router.push(`${basePath}${params.toString() ? `?${params}` : ""}`),
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <PendingOverlay active={isPending} />
      <div>
        <label htmlFor={keywordId} className="text-body-sm font-bold">
          キーワード
        </label>
        <div className="relative mt-1">
          <img
            src="/images/icons/icon-search.png"
            alt=""
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60"
          />
          <Input
            id={keywordId}
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={keywordPlaceholder}
            className="bg-background pl-9"
          />
        </div>
      </div>

      {selects.map((s) => (
        <div key={s.name}>
          <label className="text-body-sm font-bold">{s.label}</label>
          <Select
            value={values[s.name]}
            onValueChange={(v) => setValues((prev) => ({ ...prev, [s.name]: v }))}
          >
            <SelectTrigger className="mt-1 w-full bg-background">
              <SelectValue placeholder="お選びください" />
            </SelectTrigger>
            <SelectContent>
              {s.items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSearch}
          disabled={isPending}
          className="h-9 rounded-full bg-primary px-10 text-body-md text-white hover:bg-primary/90"
        >
          検索
        </Button>
      </div>
    </div>
  );
}
