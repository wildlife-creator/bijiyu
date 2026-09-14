"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ParsedVideo } from "@/lib/video-embed";

import { VIDEO_FRAME } from "./video-frame";

interface VideoEmbedInnerProps {
  /** parse 済みのメタ情報（aspect / embedUrl 等） */
  parsed: ParsedVideo;
  /** サムネイル URL（oEmbed 由来 or Cloudflare 固定 URL。取得失敗時は null） */
  thumbnailUrl: string | null;
  /** aria-label / Dialog タイトル用（任意） */
  label?: string;
}

/**
 * 動画埋込のクライアント側（Dialog の開閉と画像フォールバックを担当）。
 * 親の <VideoList> (RSC) からサムネ URL を渡される。
 *
 * - thumbnailUrl があれば <img object-contain> で実サムネ表示（切り取らずレターボックス）
 * - 取得失敗（thumbnailUrl === null）または <img onError>（CDN 署名期限切れ等）の
 *   ときは薄いロゴ placeholder にフォールバック
 * - 枠の縦横比は埋込元に関係なく `VIDEO_FRAME`（video-frame.ts）で統一する。
 *   サムネ枠と再生ダイアログの両方に同じ比率を使う
 */
export function VideoEmbedInner({
  parsed,
  thumbnailUrl,
  label,
}: VideoEmbedInnerProps) {
  const [open, setOpen] = useState(false);
  const [thumbBroken, setThumbBroken] = useState(false);

  const title = label ?? "動画";
  const showRealThumb = thumbnailUrl !== null && !thumbBroken;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${title}を再生`}
        className={`group relative ${VIDEO_FRAME.aspect} block w-full overflow-hidden rounded-[8px] border border-border/20 ${showRealThumb ? "bg-black" : "bg-muted"}`}
      >
        {showRealThumb ? (
          <img
            src={thumbnailUrl}
            alt=""
            onError={() => setThumbBroken(true)}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <img
            src="/images/logo-vertical.png"
            alt=""
            className="absolute inset-0 m-auto h-1/2 w-1/2 object-contain opacity-20"
          />
        )}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 transition-colors group-hover:bg-black/65">
            <svg
              viewBox="0 0 24 24"
              className="ml-1 h-6 w-6 fill-white"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={`${VIDEO_FRAME.dialogWidth} p-0`}>
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <div
            className={`${VIDEO_FRAME.aspect} w-full overflow-hidden rounded-[8px]`}
          >
            {open && (
              <iframe
                src={parsed.embedUrl}
                title={title}
                aria-label={title}
                allow="fullscreen"
                className="h-full w-full border-0"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
