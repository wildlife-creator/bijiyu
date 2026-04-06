"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface BackButtonProps {
  className?: string;
}

export function BackButton({ className }: BackButtonProps) {
  const router = useRouter();

  return (
    <Button
      variant="outline"
      className={`rounded-full text-body-md ${className ?? ""}`}
      onClick={() => router.back()}
    >
      もどる
    </Button>
  );
}
