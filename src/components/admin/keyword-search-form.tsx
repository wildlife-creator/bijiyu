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
        <Input
          id={`keyword-${basePath}`}
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={placeholder}
          className="mt-1 bg-background"
        />
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSearch}
          className="rounded-full bg-secondary text-white hover:bg-secondary/90"
        >
          検索
        </Button>
      </div>
    </div>
  );
}
