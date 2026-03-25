"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  const router = useRouter();

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <header className="flex items-center justify-between bg-background px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          aria-label="戻る"
        >
          <ChevronLeft className="size-6" />
        </Button>

        <span className="text-heading-sm font-bold text-primary">LOGO</span>

        <Button variant="ghost" size="icon" aria-label="メニュー">
          <Menu className="size-6" />
        </Button>
      </header>

      {/* Main content */}
      <main className="px-4 py-6 md:mx-auto md:max-w-lg">{children}</main>
    </div>
  );
}
