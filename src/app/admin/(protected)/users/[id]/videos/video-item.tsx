"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VIDEO_STATUS_LABELS } from "@/lib/videos/constants";

import {
  deleteVideoAction,
  moveVideoAction,
  refreshVideoStatusAction,
  updateVideoLabelAction,
} from "./actions";
import type { VideoItemData } from "./video-manager";

interface VideoItemProps {
  video: VideoItemData;
  /** 1 始まりの表示順 */
  position: number;
  total: number;
  onChanged: () => void;
}

/**
 * 動画 1 本の行（サムネ・種別・状態・ラベル編集・表示順・状態確認・削除）。
 */
export function VideoItem({ video, position, total, onChanged }: VideoItemProps) {
  const [label, setLabel] = useState(video.adminLabel ?? "");
  const [thumbBroken, setThumbBroken] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isProcessing = video.status === "processing";
  const displayLabel = video.adminLabel?.trim() || `動画 ${position}`;
  const showThumb = video.thumbnailUrl !== null && !thumbBroken;

  function run(key: string, fn: () => Promise<void>) {
    setBusyKey(key);
    startTransition(async () => {
      try {
        await fn();
      } finally {
        setBusyKey(null);
      }
    });
  }

  function handleSaveLabel() {
    run("label", async () => {
      const result = await updateVideoLabelAction({
        videoId: video.id,
        adminLabel: label,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("ラベルを保存しました");
      onChanged();
    });
  }

  function handleMove(direction: "up" | "down") {
    run(direction, async () => {
      const result = await moveVideoAction({ videoId: video.id, direction });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onChanged();
    });
  }

  function handleRefresh() {
    run("refresh", async () => {
      const result = await refreshVideoStatusAction({ videoId: video.id });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data?.status === "ready") {
        toast.success("処理が完了し、公開されました");
      } else {
        toast.info(result.data?.detail ?? "まだ処理中です");
      }
      onChanged();
    });
  }

  function handleDelete() {
    run("delete", async () => {
      const result = await deleteVideoAction({ videoId: video.id });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("動画を削除しました");
      onChanged();
    });
  }

  return (
    <li
      className="rounded-[8px] border border-border/20 bg-background p-4"
      aria-label={displayLabel}
    >
      <div className="flex gap-4">
        {/* サムネイル */}
        <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-[8px] border border-border/20 bg-muted">
          {showThumb ? (
            <img
              src={video.thumbnailUrl ?? undefined}
              alt=""
              onError={() => setThumbBroken(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <img
              src="/images/logo-vertical.png"
              alt=""
              className="absolute inset-0 m-auto h-1/2 w-1/2 object-contain opacity-20"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body-sm font-bold text-foreground">
              {position}. {displayLabel}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-body-xs font-bold ${
                isProcessing
                  ? "bg-amber-100 text-amber-800"
                  : "bg-primary/10 text-primary"
              }`}
            >
              {VIDEO_STATUS_LABELS[video.status]}
            </span>
            <span className="text-body-xs text-muted-foreground">
              {video.provider === "cloudflare" ? "アップロード（Cloudflare）" : "URL 埋込"}
            </span>
          </div>
          <p className="mt-1 break-all text-body-xs text-muted-foreground">
            {video.source}
          </p>

          {/* ラベル編集 */}
          <div className="mt-3 flex items-center gap-2">
            <label htmlFor={`label-${video.id}`} className="sr-only">
              管理用ラベル
            </label>
            <Input
              id={`label-${video.id}`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="管理用ラベル（任意）"
              maxLength={100}
              className="h-9 min-w-0 flex-1 bg-background text-body-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || label === (video.adminLabel ?? "")}
              onClick={handleSaveLabel}
              className="shrink-0 rounded-full"
            >
              {busyKey === "label" ? "保存中…" : "ラベル保存"}
            </Button>
          </div>
        </div>
      </div>

      {/* 操作 */}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`${displayLabel}を上へ`}
          disabled={pending || position === 1}
          onClick={() => handleMove("up")}
          className="rounded-full"
        >
          ↑ 上へ
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`${displayLabel}を下へ`}
          disabled={pending || position === total}
          onClick={() => handleMove("down")}
          className="rounded-full"
        >
          ↓ 下へ
        </Button>
        {isProcessing && video.provider === "cloudflare" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={handleRefresh}
            className="rounded-full"
          >
            {busyKey === "refresh" ? "確認中…" : "状態を確認"}
          </Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              aria-label={`${displayLabel}を削除`}
              className="rounded-full border-destructive text-destructive hover:bg-destructive/10"
            >
              削除
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>動画を削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                「{displayLabel}」をユーザーのページから削除します。
                {video.provider === "cloudflare" &&
                  " アップロードした動画ファイルも Cloudflare から削除されます。"}
                この操作は取り消せません。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                削除する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}
