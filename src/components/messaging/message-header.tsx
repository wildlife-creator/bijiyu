"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

interface MessageHeaderProps {
  name: string;
}

export function MessageHeader({ name }: MessageHeaderProps) {
  const router = useRouter();

  return (
    <div className="flex items-center bg-background px-4 py-3 border-b border-border">
      <button
        type="button"
        onClick={() => router.back()}
        className="mr-3 flex-shrink-0"
      >
        <ChevronLeft className="h-5 w-5 text-foreground" />
      </button>
      <span className="text-base font-medium">{name}</span>
    </div>
  );
}
