"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PendingOverlay } from "@/components/shared/pending-overlay";

interface MembersSearchFormProps {
  initialKeyword: string;
}

/**
 * CLI-022 担当者一覧のキーワード検索。
 * 以前はネイティブ <form method="get"> でページ全体を再読み込みしていたが、
 * 送信中のローディング表示（スピナー）を他の一覧画面と揃えるため、URL
 * searchParams を SSOT とする client 検索（router.push + useTransition）に変更。
 */
export function MembersSearchForm({ initialKeyword }: MembersSearchFormProps) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(initialKeyword);
  const [isPending, startTransition] = useTransition();

  function handleSearch() {
    const params = new URLSearchParams();
    if (keyword.trim()) params.set("q", keyword.trim());
    // 新規検索時はページを 1 に戻す（page は付けない = 既定 1）
    startTransition(() =>
      router.push(`/mypage/members${params.toString() ? `?${params}` : ""}`),
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <PendingOverlay active={isPending} />
      <div>
        <label htmlFor="q" className="text-body-sm font-medium text-foreground">
          キーワード
        </label>
        <Input
          id="q"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="氏名・メールで検索"
          className="mt-1 bg-background"
        />
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSearch}
          disabled={isPending}
          className="rounded-pill bg-primary px-8 text-white hover:bg-primary/90"
        >
          検索
        </Button>
      </div>
    </div>
  );
}
