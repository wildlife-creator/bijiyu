"use client";

import { useState, useTransition } from "react";
import { toggleFavoriteAction } from "@/app/(authenticated)/jobs/search-actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface FavoriteButtonProps {
  targetType: "job" | "client" | "user";
  targetId: string;
  initialIsFavorited: boolean;
  /** "icon" = heart icon (default, for detail pages), "text" = outline text button (for list pages) */
  variant?: "icon" | "text";
  showLabel?: boolean;
}

function HeartIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={active ? "#920783" : "none"}
      stroke={active ? "#920783" : "#9E9E9E"}
      strokeWidth="2"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export function FavoriteButton({
  targetType,
  targetId,
  initialIsFavorited,
  variant = "icon",
  showLabel = false,
}: FavoriteButtonProps) {
  const [isFavorited, setIsFavorited] = useState(initialIsFavorited);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const prev = isFavorited;
    setIsFavorited(!prev);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("targetType", targetType);
      formData.set("targetId", targetId);

      const result = await toggleFavoriteAction(formData);

      if (!result.success) {
        setIsFavorited(prev);
        toast.error(result.error ?? "お気に入りの更新に失敗しました。");
      }
    });
  }

  if (variant === "text") {
    const label = isFavorited ? "マイリスト解除" : "マイリスト登録";
    return (
      <Button
        variant={isFavorited ? "outline" : "default"}
        size="sm"
        className={
          isFavorited
            ? "rounded-[47px] border-primary text-primary hover:bg-primary/10"
            : "rounded-[47px]"
        }
        onClick={handleToggle}
        disabled={isPending}
        aria-label={label}
      >
        {label}
      </Button>
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className="flex items-center gap-1 disabled:opacity-50"
      aria-label={isFavorited ? "マイリスト解除" : "マイリスト登録"}
    >
      <HeartIcon active={isFavorited} />
      {showLabel && (
        <span className="text-body-sm text-muted-foreground">
          {isFavorited ? "マイリスト解除" : "マイリスト登録"}
        </span>
      )}
    </button>
  );
}
