"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BackButtonProps {
  /**
   * 外側 wrapper div に追加する Tailwind クラス。
   * 親が `flex flex-col items-center` のような items-center 環境だと
   * wrapper div は content 幅までしか広がらず、内側 Button の
   * `w-full max-w-xs` が意図通り 320px にならないため、
   * 呼び出し側で `w-full max-w-xs` 等を明示するために追加。
   */
  className?: string;
}

export function BackButton({ className }: BackButtonProps = {}) {
  const router = useRouter();

  return (
    <div className={cn("mt-4 flex justify-center", className)}>
      <Button
        type="button"
        variant="outline"
        className="mx-auto w-full max-w-xs rounded-pill text-body-md"
        onClick={() => router.back()}
      >
        もどる
      </Button>
    </div>
  );
}
