"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function BackButton() {
  const router = useRouter();

  return (
    <div className="mt-4 flex justify-center">
      <Button
        variant="outline"
        size="lg"
        className="w-full rounded-[47px] border-foreground text-foreground"
        onClick={() => router.back()}
      >
        もどる
      </Button>
    </div>
  );
}
