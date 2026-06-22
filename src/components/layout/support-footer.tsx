import Link from "next/link";

type FooterLink = { label: string; href: string };

const SUPPORT_LINKS: ReadonlyArray<FooterLink> = [
  { label: "よくある質問", href: "/faq" },
  { label: "お問い合わせ", href: "/contact" },
  { label: "トラブル報告", href: "/trouble-report" },
];

const PRE_LOGIN_SUPPORT_LINKS: ReadonlyArray<FooterLink> = SUPPORT_LINKS.filter(
  (link) => link.href !== "/trouble-report",
);

const LEGAL_LINKS: ReadonlyArray<FooterLink> = [
  { label: "利用規約", href: "/terms" },
  { label: "プライバシーポリシー", href: "/privacy" },
  { label: "特定商取引法に基づく表記", href: "/legal" },
];

function LinkRow({ items }: { items: ReadonlyArray<FooterLink> }) {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-y-0.5">
      {items.map((item, index) => (
        <li key={item.href} className="flex items-center">
          {index > 0 && (
            <span aria-hidden="true" className="mx-2 text-muted-foreground/50">
              ・
            </span>
          )}
          <Link
            href={item.href}
            className="text-body-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

type SupportFooterVariant = "default" | "pre-login";

interface SupportFooterProps {
  variant?: SupportFooterVariant;
}

export function SupportFooter({ variant = "default" }: SupportFooterProps = {}) {
  const supportLinks =
    variant === "pre-login" ? PRE_LOGIN_SUPPORT_LINKS : SUPPORT_LINKS;

  return (
    <footer className="mt-10 pb-6">
      <div className="space-y-1.5">
        <LinkRow items={supportLinks} />
        <LinkRow items={LEGAL_LINKS} />
      </div>
    </footer>
  );
}
