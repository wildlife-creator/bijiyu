import Link from "next/link";

import { Button } from "@/components/ui/button";

const LEGAL_SECTIONS = [
  {
    title: "販売事業者",
    body: "株式会社ビジ友（準備中）",
  },
  {
    title: "代表者",
    body: "（準備中）",
  },
  {
    title: "所在地",
    body: "（準備中）",
  },
  {
    title: "連絡先",
    body: "メールアドレス: support@bijiyu.jp（準備中）",
  },
  {
    title: "販売価格",
    body: "各有料プランの料金は、サービス内の有料プラン案内ページに表示された金額に従います。表示価格は税込みです。",
  },
  {
    title: "支払方法",
    body: "クレジットカード決済（Visa、Mastercard、JCB、American Express）",
  },
  {
    title: "支払時期",
    body: "有料プランお申し込み時に即時決済されます。以降は契約期間に応じて自動更新・自動決済されます。",
  },
  {
    title: "サービス提供時期",
    body: "決済完了後、直ちにご利用いただけます。",
  },
  {
    title: "キャンセル・解約",
    body: "有料プランの解約はマイページの課金管理画面からいつでも手続き可能です。解約後は契約期間の終了日までサービスをご利用いただけます。日割り返金は行っておりません。",
  },
  {
    title: "動作環境",
    body: "最新版の Google Chrome、Safari、Firefox、Microsoft Edge を推奨しています。",
  },
];

export default function LegalPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-center text-heading-lg font-bold">
        特商法に関わる表示
      </h1>

      {LEGAL_SECTIONS.map((section) => (
        <section key={section.title} className="space-y-2">
          <h2 className="text-heading-md font-bold">{section.title}</h2>
          <p className="text-body-md">{section.body}</p>
        </section>
      ))}

      <div className="flex justify-center">
        <Button variant="outline" className="rounded-full" asChild>
          <Link href="/">もどる</Link>
        </Button>
      </div>
    </div>
  );
}
