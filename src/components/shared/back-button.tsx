"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BackButtonProps {
  className?: string;
}

export function BackButton({ className }: BackButtonProps) {
  const router = useRouter();

  return (
    <Button
      variant="outline"
      className={cn("w-full rounded-pill text-body-md", className)}
      onClick={() => router.back()}
    >
      もどる
    </Button>
  );
}
