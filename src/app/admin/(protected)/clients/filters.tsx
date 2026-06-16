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

interface AdminClientFiltersProps {
  initialKeyword: string;
  /** "all" | ClientCategory */
  initialCategory: string;
  /** "all" | "urgent" | "video_workplace" */
  initialOption: string;
}

const CATEGORY_ITEMS: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "owner", label: "管理責任者" },
  { value: "org_admin", label: "組織管理者" },
  { value: "org_staff", label: "担当者" },
  { value: "individual", label: "個人発注者" },
  { value: "small", label: "小規模発注者" },
];

const OPTION_ITEMS: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "urgent", label: "急募オプション" },
  { value: "video_workplace", label: "動画掲載（職場紹介）" },
];

/**
 * ADM-003 のキーワード検索 + 2枠フィルタ（区分／オプション・各単一選択）。
 * フィルタ状態は URL searchParams を SSOT とし、検索ボタンで router.push する。
 */
export function AdminClientFilters({
  initialKeyword,
  initialCategory,
  initialOption,
}: AdminClientFiltersProps) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(initialKeyword);
  const [category, setCategory] = useState(initialCategory || "all");
  const [option, setOption] = useState(initialOption || "all");

  function handleSearch() {
    const params = new URLSearchParams();
    if (keyword.trim()) params.set("q", keyword.trim());
    if (category && category !== "all") params.set("category", category);
    if (option && option !== "all") params.set("option", option);
    // 新規検索時はページを 1 に戻す（page は付けない = 既定 1）
    router.push(`/admin/clients${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="mt-6 space-y-4">
      <div>
        <label htmlFor="admin-client-keyword" className="text-body-sm font-bold">
          キーワード
        </label>
        <div className="relative mt-1">
          <img
            src="/images/icons/icon-search.png"
            alt=""
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60"
          />
          <Input
            id="admin-client-keyword"
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="氏名・メールアドレス・会社名"
            className="bg-background pl-9"
          />
        </div>
      </div>

      <div>
        <label className="text-body-sm font-bold">権限</label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="mt-1 w-full bg-background">
            <SelectValue placeholder="お選びください" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_ITEMS.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          className="h-9 rounded-full bg-primary px-10 text-body-md text-white hover:bg-primary/90"
        >
          検索
        </Button>
      </div>
    </div>
  );
}
