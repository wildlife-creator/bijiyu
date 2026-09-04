import type { LegalArticle } from "@/lib/legal/types";

/**
 * 特定商取引法に基づく表記の本文。
 *
 * 出典: docs/legal/tokushoho.md（文言はここから一字も変えないこと）。
 * md では「販売事業者：株式会社東都」のように項目名と内容がコロンで 1 行に
 * つながっているが、アプリ側は他 3 ページと揃えて項目名を見出し・内容を本文に分ける。
 */
export const LEGAL_ARTICLES: LegalArticle[] = [
  {
    title: "販売事業者",
    blocks: [{ type: "paragraph", text: "株式会社東都" }],
  },
  {
    title: "運営責任者",
    blocks: [{ type: "paragraph", text: "鈴木 一公" }],
  },
  {
    title: "所在地",
    blocks: [
      {
        type: "paragraph",
        text: "〒312-0034 茨城県ひたちなか市堀口218 堀口清水住宅6号室",
      },
    ],
  },
  {
    title: "電話番号",
    blocks: [{ type: "paragraph", text: "029-355-3518" }],
  },
  {
    title: "メールアドレス",
    blocks: [
      {
        type: "paragraph",
        text: "info@tou-to.com",
      },
    ],
  },
  {
    title: "販売価格",
    blocks: [
      { type: "paragraph", text: "各サービスページに記載の金額（全て消費税込み）" },
    ],
  },
  {
    title: "支払方法",
    blocks: [
      {
        type: "paragraph",
        text: "クレジットカード決済、銀行振込（銀行振込をご希望の場合はお問い合わせください）",
      },
    ],
  },
  {
    title: "支払時期",
    blocks: [
      {
        type: "paragraph",
        text: "料金の発生しない無料プランをご利用の場合、お支払いは発生しません。有料プランのうちサブスクリプション（月額課金制）をご契約の場合、クレジットカードにより初回お申し込み時に課金され、以後は毎月、契約更新日に自動的に課金されます。買い切り（都度課金）のサービスをご購入の場合、ご注文と同時にクレジットカードにより決済されます。銀行振込の場合は、当社が送付する請求書に記載の期日までにお振込みください。",
      },
    ],
  },
  {
    title: "サービス提供時期",
    blocks: [
      {
        type: "paragraph",
        text: "無料プランは会員登録完了後、有料プラン（サブスクリプション・買い切りいずれも）は決済完了後、それぞれ直ちにサービスをご利用いただけます。サブスクリプションについては、契約が有効な期間中、継続してご利用いただけます。",
      },
    ],
  },
  {
    title: "解約方法",
    blocks: [
      {
        type: "paragraph",
        text: "会員は、当社所定の方法によりいつでも解約することができます。",
      },
    ],
  },
  {
    title: "返品・キャンセルについて",
    blocks: [
      {
        type: "paragraph",
        text: "サービスの性質上、決済完了後の返金はいたしかねます。",
      },
      {
        type: "paragraph",
        text: "また、月途中で解約した場合であっても日割りによる返金は行いません。",
      },
    ],
  },
  {
    title: "動画制作サービスについて",
    blocks: [
      {
        type: "paragraph",
        text: "撮影日確定後のキャンセルについては返金いたしません。撮影又は編集開始後のキャンセルについては、進捗状況に応じて費用を請求する場合があります。",
      },
    ],
  },
];
