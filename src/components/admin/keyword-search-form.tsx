"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface KeywordSearchFormProps {
  /** 検索結果ページの basePath（例: "/admin/contacts"） */
  basePath: string;
  placeholder: string;
  initialKeyword: string;
}

/**
 * admin 一覧画面共通のキーワード検索フォーム（検索条件はキーワード1枠のみの画面用）。
 * フィルタ状態は URL searchParams を SSOT とし、検索ボタンで router.push する。
 */
export function KeywordSearchForm({
  basePath,
  placeholder,
  initialKeyword,
}: KeywordSearchFormProps) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(initialKeyword);

  function handleSearch() {
    const params = new URLSearchParams();
    if (keyword.trim()) params.set("q", keyword.trim());
    // 新規検索時はページを 1 に戻す（page は付けない = 既定 1）
    router.push(`${basePath}${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="mt-6 space-y-4">
      <div>
        <label
          htmlFor={`keyword-${basePath}`}
          className="text-body-sm font-bold"
        >
          キーワード
        </label>
        <div className="relative mt-1">
          <img
            src="/images/icons/icon-search.png"
            alt=""
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60"
          />
          <Input
            id={`keyword-${basePath}`}
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={placeholder}
            className="bg-background pl-9"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSearch}
          className="h-9 rounded-full bg-primary px-10 text-body-md text-white hover:bg-primary/90"
        >
          検索
        </Button>
      </div>
    </div>
  );
}
