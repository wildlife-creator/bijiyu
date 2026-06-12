"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AdminUserFiltersProps {
  initialKeyword: string;
  /** "all" | "video" | "compensation_5000" | "compensation_9800" */
  initialOption: string;
}

// 受注者向けオプションのみ3択（職場紹介動画は発注者向けのため ADM-003 側に置く）
const OPTION_ITEMS: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "video", label: "動画掲載(受注者PR)" },
  { value: "compensation_5000", label: "補償¥5,000" },
  { value: "compensation_9800", label: "補償¥9,800" },
];

/**
 * ADM-008 のキーワード検索 + オプションプラン加入者フィルタ（video-display Task 5.2）。
 * フィルタ状態は URL searchParams を SSOT とし、検索ボタンで router.push する。
 */
export function AdminUserFilters({
  initialKeyword,
  initialOption,
}: AdminUserFiltersProps) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(initialKeyword);
  const [option, setOption] = useState(initialOption || "all");

  function handleSearch() {
    const params = new URLSearchParams();
    if (keyword.trim()) params.set("q", keyword.trim());
    if (option && option !== "all") params.set("option", option);
    // 新規検索時はページを 1 に戻す（page は付けない = 既定 1）
    router.push(`/admin/users${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="mt-6 space-y-4">
      <div>
        <label htmlFor="admin-keyword" className="text-body-sm font-bold">
          キーワード
        </label>
        <Input
          id="admin-keyword"
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="氏名・メールアドレス"
          className="mt-1 bg-background"
        />
      </div>

      <div>
        <label className="text-body-sm font-bold">オプションプラン加入者</label>
        <Select value={option} onValueChange={setOption}>
          <SelectTrigger className="mt-1 w-full bg-background">
            <SelectValue placeholder="お選びください" />
          </SelectTrigger>
          <SelectContent>
            {OPTION_ITEMS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
