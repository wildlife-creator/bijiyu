import Link from "next/link";

import { Button } from "@/components/ui/button";

const PRIVACY_SECTIONS = [
  {
    title: "第1条 個人情報の定義",
    body: "本プライバシーポリシーにおいて「個人情報」とは、生存する個人に関する情報であって、氏名、メールアドレス、その他の記述により特定の個人を識別できるものをいいます。",
  },
  {
    title: "第2条 個人情報の収集",
    body: "当社は、サービスの提供にあたり、以下の個人情報を収集することがあります。氏名、メールアドレス、電話番号、住所、本人確認書類に記載された情報、その他サービス利用に必要な情報。",
  },
  {
    title: "第3条 利用目的",
    body: "収集した個人情報は、サービスの提供・運営、本人確認、お問い合わせへの対応、利用規約に違反する行為への対応、サービスの改善、その他上記利用目的に付随する目的に利用します。",
  },
  {
    title: "第4条 第三者提供",
    body: "当社は、法令に基づく場合を除き、利用者の同意なく個人情報を第三者に提供することはありません。ただし、案件のマッチングに必要な範囲で、取引相手に必要最小限の情報を開示する場合があります。",
  },
  {
    title: "第5条 安全管理",
    body: "当社は、個人情報の漏洩、紛失、改ざんを防止するため、適切な安全管理措置を講じます。",
  },
  {
    title: "第6条 開示・訂正・削除",
    body: "利用者は、当社が保有する自己の個人情報について、開示・訂正・削除を請求できます。請求はお問い合わせフォームより受け付けます。",
  },
  {
    title: "第7条 Cookie の使用",
    body: "本サービスでは、利用者の利便性向上のためCookieを使用しています。利用者はブラウザの設定によりCookieを無効にできますが、一部機能が制限される場合があります。",
  },
  {
    title: "第8条 ポリシーの変更",
    body: "当社は、必要に応じて本プライバシーポリシーを変更できるものとします。変更後のポリシーは本サービス上に掲載した時点で効力を生じます。",
  },
];

export default function PrivacyPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        プライバシーポリシー
      </h1>

      {PRIVACY_SECTIONS.map((section) => (
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
