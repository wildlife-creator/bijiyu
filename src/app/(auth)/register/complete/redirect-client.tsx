"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RegistrationCompleteRedirect() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/mypage");
    }, 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return null;
}
