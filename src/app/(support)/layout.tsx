"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";

interface SupportLayoutProps {
  children: React.ReactNode;
}

export default function SupportLayout({ children }: SupportLayoutProps) {
  const router = useRouter();

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader isAuthenticated={false} />

      <main className="px-4 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          aria-label="戻る"
          className="mb-4"
        >
          <ChevronLeft className="size-6" />
        </Button>
        {children}
      </main>
    </div>
  );
}
