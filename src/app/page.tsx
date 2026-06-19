import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="flex min-h-full flex-col">
      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 pt-16">
        <div className="w-full max-w-lg mx-auto flex flex-col items-center gap-8 text-center">
          <h1>
            <img
              src="/images/logo-mark.png"
              alt="ビジ友"
              className="w-48 h-auto mx-auto"
            />
          </h1>
          <p className="text-body-base text-foreground">
            ビジ友は建設業界の職人と発注者をつなぐマッチングサービスです
          </p>

          <div className="flex w-full flex-col gap-4">
            <Button variant="outline" className="h-12 w-full rounded-[47px]" asChild>
              <Link href="/login">ログイン</Link>
            </Button>
            <Button
              className="rounded-[47px] bg-primary text-primary-foreground h-12 w-full font-bold"
              asChild
            >
              <Link href="/register">新規登録</Link>
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-8">
        <nav className="mx-auto flex max-w-lg flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link href="/faq" className="text-body-sm text-muted-foreground">
            よくある質問
          </Link>
          <Link href="/contact" className="text-body-sm text-muted-foreground">
            お問い合わせ
          </Link>
          <Link href="/terms" className="text-body-sm text-muted-foreground">
            利用規約
          </Link>
          <Link href="/privacy" className="text-body-sm text-muted-foreground">
            プライバシーポリシー
          </Link>
          <Link href="/legal" className="text-body-sm text-muted-foreground">
            特定商取引法に基づく表記
          </Link>
        </nav>
        <div className="mx-auto mt-4 flex max-w-lg justify-center">
          <Link
            href="/admin/login"
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground"
          >
            管理者ログイン
          </Link>
        </div>
      </footer>
    </div>
  );
}
