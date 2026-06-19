"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function BackButton() {
  const router = useRouter();

  return (
    <div className="mt-4 flex justify-center">
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
