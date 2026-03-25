import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RegistrationCompleteRedirect } from "@/app/(auth)/register/complete/redirect-client";

export default function RegisterCompletePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-lg flex flex-col items-center gap-6 text-center">
        <h1 className="text-heading-xl font-bold text-primary">登録完了</h1>
        <p className="text-body-base text-foreground">
          会員登録が完了しました。
        </p>
        <Button
          className="rounded-[47px] bg-secondary text-secondary-foreground h-12 w-full font-bold"
          asChild
        >
          <Link href="/mypage">マイページへ</Link>
        </Button>
      </div>
      <RegistrationCompleteRedirect />
    </div>
  );
}
