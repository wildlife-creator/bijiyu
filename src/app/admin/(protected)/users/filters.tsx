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

interface AdminUserFiltersProps {
  initialKeyword: string;
  /** "all" | "video" | "video_shooting" | "video_sns" | "compensation_5000" | "compensation_9800" */
  initialOption: string;
}

// 動画 3 プラン + 補償（P10、2026-09）。急募は案件単位のため ADM-003 側に置く
const OPTION_ITEMS: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "video", label: "プロフィール動画" },
  { value: "video_shooting", label: "ユーザー撮影プラン" },
  { value: "video_sns", label: "ビジ友公式SNS動画" },
  { value: "compensation_5000", label: "補償¥5,000" },
  { value: "compensation_9800", label: "補償¥9,800" },
];

/**
 * ADM-008 のキーワード検索 + オプションプラン加入者フィルタ（video-display Task 5.2）。
 * フィルタ状態は URL searchParams を SSOT とし、検索ボタンで router.push する。
 *
 * ブラウザの戻る/進むで URL（= initial*）が変わったときに入力欄の表示も追従させるため、
 * URL 由来の初期値を key にして内部 state を作り直す（ステージング指摘 No.40）。
 * 検索ボタンを押すまでの入力途中の値は、URL が変わらない限り保持される。
 */
export function AdminUserFilters(props: AdminUserFiltersProps) {
  const resetKey = `${props.initialKeyword}|${props.initialOption}`;
  return <AdminUserFiltersInner key={resetKey} {...props} />;
}

function AdminUserFiltersInner({
  initialKeyword,
  initialOption,
}: AdminUserFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [keyword, setKeyword] = useState(initialKeyword);
  const [option, setOption] = useState(initialOption || "all");

  function handleSearch() {
    const params = new URLSearchParams();
    if (keyword.trim()) params.set("q", keyword.trim());
    if (option && option !== "all") params.set("option", option);
    // 新規検索時はページを 1 に戻す（page は付けない = 既定 1）
    startTransition(() =>
      router.push(`/admin/users${params.toString() ? `?${params}` : ""}`),
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <PendingOverlay active={isPending} />
      <div>
        <label htmlFor="admin-keyword" className="text-body-sm font-bold">
          キーワード
        </label>
        <div className="relative mt-1">
          <img
            src="/images/icons/icon-search.png"
            alt=""
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60"
          />
          <Input
            id="admin-keyword"
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="氏名・メールアドレス"
            className="bg-background pl-9"
          />
        </div>
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
          disabled={isPending}
          className="h-9 rounded-full bg-primary px-10 text-body-md text-white hover:bg-primary/90"
        >
          検索
        </Button>
      </div>
    </div>
  );
}
