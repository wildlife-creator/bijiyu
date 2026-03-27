import Link from "next/link";

import { Button } from "@/components/ui/button";

const FAQ_DATA = [
  {
    category: "アカウントについて",
    items: [
      {
        q: "アカウントの登録方法を教えてください",
        a: "トップページの「新規登録」ボタンからメールアドレスを入力し、届いたメールのリンクをクリックしてプロフィールを入力してください。",
      },
      {
        q: "パスワードを忘れた場合はどうすればいいですか？",
        a: "ログイン画面の「パスワードをお忘れの方」リンクからパスワードリセットの手続きを行ってください。",
      },
    ],
  },
  {
    category: "案件について",
    items: [
      {
        q: "案件に応募するにはどうすればいいですか？",
        a: "案件一覧から気になる案件を選び、詳細画面の「応募する」ボタンから応募できます。",
      },
      {
        q: "案件の掲載方法を教えてください",
        a: "有料プランに加入後、マイページの「募集現場一覧」から新規案件を作成できます。",
      },
    ],
  },
  {
    category: "本人確認について",
    items: [
      {
        q: "本人確認に必要な書類は何ですか？",
        a: "運転免許証、運転経歴証明書、マイナンバーカード、在留カードのいずれかと、本人の顔写真が必要です。",
      },
      {
        q: "本人確認の審査にはどのくらいかかりますか？",
        a: "通常1〜3営業日で審査結果をメールでお知らせします。",
      },
    ],
  },
  {
    category: "課金について",
    items: [
      {
        q: "有料プランの料金を教えてください",
        a: "プラン詳細はマイページの「有料プラン案内」からご確認いただけます。",
      },
      {
        q: "プランの解約方法を教えてください",
        a: "マイページの課金管理画面から解約手続きが可能です。",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-center text-heading-lg font-bold">よくある質問</h1>

      {FAQ_DATA.map((section) => (
        <section key={section.category} className="space-y-4">
          <h2 className="text-heading-md font-bold">{section.category}</h2>

          <div className="space-y-4">
            {section.items.map((item) => (
              <div key={item.q} className="space-y-1">
                <p className="text-body-md">
                  <span className="font-bold">Q. </span>
                  {item.q}
                </p>
                <p className="text-body-md text-muted-foreground">
                  <span className="font-bold">A. </span>
                  {item.a}
                </p>
              </div>
            ))}
          </div>
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
