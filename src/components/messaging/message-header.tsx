"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { OfficialBadge } from "@/components/messaging/official-badge";

interface MessageHeaderProps {
  name: string;
  /** 相手が管理運営アカウントなら「ビジ友公式」バッジを出す */
  isOfficial?: boolean;
}

export function MessageHeader({ name, isOfficial = false }: MessageHeaderProps) {
  const router = useRouter();

  return (
    <div className="flex items-center px-4 py-3 border-b border-border">
      <button
        type="button"
        onClick={() => router.back()}
        className="mr-3 flex-shrink-0"
      >
        <ChevronLeft className="h-5 w-5 text-foreground" />
      </button>
      <span className="text-base font-medium">{name}</span>
      {isOfficial && (
        <span className="ml-2">
          <OfficialBadge />
        </span>
      )}
    </div>
  );
}
