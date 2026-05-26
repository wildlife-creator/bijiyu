"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseVideoUrl } from "@/lib/video-embed";

interface VideoEmbedProps {
  /** users.video_url または client_profiles.workplace_video_url */
  url: string;
  /** プレースホルダーの aria-label / Dialog タイトル用（任意） */
  label?: string;
}

/**
 * 動画埋込コンポーネント（video-display Task 3.2）。
 *
 * 静的プレースホルダー + 中央の三角再生ボタンを描画し、押下で shadcn Dialog
 * ライトボックスを開いて iframe で埋込再生する。
 *
 * - `parseVideoUrl(url)` が null の場合は **何も描画しない**（要件 3.8、
 *   外部リンクフォールバックは出さずサイレント非表示）。
 * - aspect は縦長 9:16 / 横長（将来）16:9 を parsed.aspect で切り替える。
 * - 自身は active 判定を行わない。表示可否は呼び出し側が
 *   `url && hasActiveOption(...)` で制御し、true のときだけレンダリングする。
 */
export function VideoEmbed({ url, label }: VideoEmbedProps) {
  const [open, setOpen] = useState(false);

  const parsed = parseVideoUrl(url);
  if (!parsed) return null;

  const title = label ?? "動画";
  const aspectClass = parsed.aspect === "9/16" ? "aspect-[9/16]" : "aspect-video";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${title}を再生`}
        className={`group relative ${aspectClass} mx-auto block w-full max-w-[280px] overflow-hidden rounded-[8px] border border-border/20 bg-muted`}
      >
        {/* 静的プレースホルダー（薄いブランドマーク） */}
        <img
          src="/images/logo-vertical.png"
          alt=""
          className="absolute inset-0 m-auto h-1/2 w-1/2 object-contain opacity-20"
        />
        {/* 中央の三角再生ボタン */}
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
          <div className={`${aspectClass} w-full overflow-hidden rounded-[8px]`}>
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
