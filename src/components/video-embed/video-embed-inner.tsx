"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ParsedVideo } from "@/lib/video-embed";

interface VideoEmbedInnerProps {
  /** parse 済みのメタ情報（aspect / embedUrl 等） */
  parsed: ParsedVideo;
  /** oEmbed 由来のサムネイル URL（取得失敗時 / 未対応 platform で null） */
  thumbnailUrl: string | null;
  /** aria-label / Dialog タイトル用（任意） */
  label?: string;
}

/**
 * 動画埋込のクライアント側（Dialog の開閉と画像フォールバックを担当）。
 * 親の <VideoEmbed> (RSC) からサムネ URL を渡される。
 *
 * - thumbnailUrl があれば <img object-cover> で実サムネ表示
 * - 取得失敗（thumbnailUrl === null）または <img onError>（CDN 署名期限切れ等）の
 *   ときは薄いロゴ placeholder にフォールバック
 * - aspect は parsed.aspect で 9:16 / 16:9 を切替
 */
export function VideoEmbedInner({
  parsed,
  thumbnailUrl,
  label,
}: VideoEmbedInnerProps) {
  const [open, setOpen] = useState(false);
  const [thumbBroken, setThumbBroken] = useState(false);

  const title = label ?? "動画";
  const aspectClass =
    parsed.aspect === "9/16" ? "aspect-[9/16]" : "aspect-video";
  const showRealThumb = thumbnailUrl !== null && !thumbBroken;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${title}を再生`}
        className={`group relative ${aspectClass} mx-auto block w-full max-w-[280px] overflow-hidden rounded-[8px] border border-border/20 bg-muted`}
      >
        {showRealThumb ? (
          <img
            src={thumbnailUrl}
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
        <DialogContent className="max-w-[360px] p-0 sm:max-w-[360px]">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <div
            className={`${aspectClass} w-full overflow-hidden rounded-[8px]`}
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
