import Link from "next/link";

import { Button } from "@/components/ui/button";

const TERMS_SECTIONS = [
  {
    title: "第1条 総則",
    body: "本利用規約（以下「本規約」）は、ビジ友（以下「本サービス」）の利用条件を定めるものです。ご利用者は本規約に同意のうえ、本サービスを利用するものとします。",
  },
  {
    title: "第2条 定義",
    body: "本規約において使用する用語は、以下のとおり定義します。「利用者」とは、本規約に同意し本サービスに登録した個人または法人をいいます。「受注者」とは、案件に応募し作業を行う職人をいいます。「発注者」とは、案件を掲載し受注者を募集する者をいいます。",
  },
  {
    title: "第3条 アカウント登録",
    body: "利用者は正確な情報を提供し、アカウントを登録するものとします。虚偽の情報を登録した場合、当社はアカウントを停止または削除できるものとします。",
  },
  {
    title: "第4条 禁止事項",
    body: "利用者は、本サービスの利用にあたり、法令に違反する行為、他の利用者への迷惑行為、本サービスの運営を妨害する行為、その他当社が不適切と判断する行為を行ってはなりません。",
  },
  {
    title: "第5条 本人確認",
    body: "当社は利用者に対し、本人確認書類の提出を求めることがあります。本人確認が完了していない利用者は一部機能の利用が制限される場合があります。",
  },
  {
    title: "第6条 有料プラン",
    body: "有料プランの料金、支払方法、契約期間等は別途定めるものとします。有料プランの解約は、マイページの課金管理画面から手続きを行ってください。",
  },
  {
    title: "第7条 免責事項",
    body: "当社は、利用者間の取引について一切の責任を負わないものとします。本サービスは利用者間のマッチングを支援するものであり、取引の成立を保証するものではありません。",
  },
  {
    title: "第8条 規約の変更",
    body: "当社は、必要に応じて本規約を変更できるものとします。変更後の規約は本サービス上に掲載した時点で効力を生じます。",
  },
];

export default function TermsPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">利用規約</h1>

      {TERMS_SECTIONS.map((section) => (
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
