"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VideoUrlSchema } from "@/lib/validations/video";
import {
  updateVideoUrlAction,
  updateWorkplaceVideoUrlAction,
} from "@/app/admin/actions";

interface VideoPostFormProps {
  userId: string;
  currentUrl: string | null;
  /** "pr" = 受注者PR動画 (ADM-010) / "workplace" = 職場紹介動画 (ADM-010B) */
  variant: "pr" | "workplace";
  /**
   * もどるの遷移先。ADM-010B は入口が ADM-004（発注者詳細）のため
   * `/admin/clients/[id]` を明示する（admin spec Task 5.3）。
   * 未指定は従来どおり router.back()
   */
  backHref?: string;
}

/**
 * ADM-010 / ADM-010B 共通の動画投稿フォーム（video-display Task 5.4）。
 *
 * URL 入力 +「更新」(固定ラベル) + 現在の登録 URL 表示 + もどる。
 * 差分は variant に応じて呼び出す Server Action のみ。
 */
export function VideoPostForm({ userId, currentUrl, variant, backHref }: VideoPostFormProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // クライアント側でも VideoUrlSchema で二重防御（空文字＝掲載停止は許容）
    const parsed = VideoUrlSchema.safeParse(url);
    if (!parsed.success) {
      toast.error(
        parsed.error.issues[0]?.message ??
          "対応プラットフォームの URL を入力してください",
      );
      return;
    }

    const formData = new FormData();
    formData.set("userId", userId);
    formData.set("url", url);

    startTransition(async () => {
      const action =
        variant === "pr" ? updateVideoUrlAction : updateWorkplaceVideoUrlAction;
      const result = await action(formData);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        url.trim() === "" ? "動画の掲載を停止しました" : "動画 URL を更新しました",
      );
      router.refresh();
      setUrl("");
    });
  }

  return (
    <div className="px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        ユーザー動画投稿
      </h1>

      <form onSubmit={handleSubmit} className="mt-8">
        <label htmlFor="video-url" className="text-body-sm font-bold">
          URL
        </label>
        <Input
          id="video-url"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.tiktok.com/@.../video/..."
          className="mt-2 bg-background"
        />

        <div className="mt-6 flex justify-center">
          <Button
            type="submit"
            variant="default"
            disabled={pending}
            className="w-full max-w-xs rounded-full text-white"
          >
            更新
          </Button>
        </div>
      </form>

      <div className="mt-8">
        <p className="text-body-sm font-bold">現在の登録URL</p>
        <p className="mt-1 break-all text-body-sm text-foreground">
          {currentUrl && currentUrl.trim() ? currentUrl : "未登録"}
        </p>
      </div>

      <div className="mt-10 flex flex-col items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            backHref ? router.push(backHref) : router.back()
          }
          className="w-full max-w-xs rounded-full"
        >
          もどる
        </Button>
      </div>
    </div>
  );
}
