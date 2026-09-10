"use client";

import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OPTION_PRICES_TAX_INCLUDED } from "@/lib/billing/options";
import {
  PAID_PLAN_TYPES,
  PLAN_LIMITS,
  YEARLY_PRICE_TAX_INCLUDED,
  type PlanType,
} from "@/lib/constants/plans";

/** 比較表の列見出し（「プラン」サフィックス無しの短縮名） */
const PLAN_SHORT_LABELS: Record<Exclude<PlanType, "free">, string> = {
  individual: "ライト",
  small: "スタンダード",
  corporate: "プレミアム",
  corporate_premium: "ハイエンド",
};

/**
 * CLI-026 plan-list: Plan comparison table page.
 * Design comp: CLI-026-plan-list.png
 */

/**
 * 月額・年額は src/lib/constants/plans.ts（PLAN_LIMITS / YEARLY_PRICE_TAX_INCLUDED）から導出し、
 * 銀行振込の請求金額・料金プラン画面と必ず一致させる（手書きの金額を置かない）。
 */
const PLAN_COLUMNS: {
  key: PlanType;
  label: string;
  monthly: string | null;
  yearly: string | null;
}[] = [
  { key: "free", label: "無料", monthly: "¥0", yearly: "¥0" },
  ...PAID_PLAN_TYPES.map((key) => ({
    key,
    label: PLAN_SHORT_LABELS[key],
    monthly: `¥${PLAN_LIMITS[key].monthlyPriceTaxIncluded.toLocaleString("ja-JP")}`,
    yearly: `¥${YEARLY_PRICE_TAX_INCLUDED[key].toLocaleString("ja-JP")}`,
  })),
];

interface FeatureRow {
  label: string;
  values: string[];
}

/**
 * 比較表の行（2026-09-10 クライアント確定、docs/requirements/video-plans-handoff-202609.md §8）。
 * 「上位表示」はスタンダード以上（P11 で list_plan_rank にスタンダードを追加）。
 * 「検索機能」「サポート担当」「代理メッセージ」の通数はアプリで制御しない（案内上の目安）。
 * 「プロフィール動画制作」「ビジ友公式SNS動画制作」の付属もアプリで判定しない（運用対応）。
 */
const FEATURES: FeatureRow[] = [
  {
    label: "職種",
    values: ["登録職種", "無制限", "無制限", "無制限", "無制限"],
  },
  {
    label: "エリア",
    values: ["登録県", "全域", "全域", "全域", "全域"],
  },
  {
    label: "マイリスト登録",
    values: ["無制限", "無制限", "無制限", "無制限", "無制限"],
  },
  {
    label: "新しい人への\nメッセージ",
    values: ["5通/月", "無制限", "無制限", "無制限", "無制限"],
  },
  {
    label: "現場掲載",
    values: ["-", "1件/月", "無制限", "無制限", "無制限"],
  },
  {
    label: "検索機能",
    values: ["○", "無制限", "無制限", "無制限", "無制限"],
  },
  {
    label: "上位表示",
    values: ["-", "-", "○", "○", "○"],
  },
  {
    label: "複数人利用",
    values: [
      "-",
      "-",
      "-",
      `${PLAN_LIMITS.corporate.maxStaff}人まで`,
      `${PLAN_LIMITS.corporate_premium.maxStaff}人まで`,
    ],
  },
  {
    label: "サポート担当\n（スカウト）",
    values: ["-", "-", "-", "○", "○"],
  },
  {
    label: "代理メッセージ",
    values: ["-", "-", "-", "24通/年", "300通/年"],
  },
  {
    label: "プロフィール動画制作",
    values: ["-", "-", "-", "○", "○"],
  },
  {
    label: "ビジ友公式SNS動画制作",
    values: ["-", "-", "-", "年払いのみ○", "年払いのみ○"],
  },
];

/** 表の下に出すオプション価格。金額は OPTION_PRICES_TAX_INCLUDED（課金定数）から導出 */
const OPTION_ROWS: { label: string; price: string }[] = [
  {
    label: "急募",
    price: `${OPTION_PRICES_TAX_INCLUDED.urgent.toLocaleString("ja-JP")}円（7日間）`,
  },
  {
    label: "プロフィール動画制作プラン",
    price: `${OPTION_PRICES_TAX_INCLUDED.video.toLocaleString("ja-JP")}円/動画`,
  },
  {
    label: "ユーザー撮影プラン",
    price: `${OPTION_PRICES_TAX_INCLUDED.video_shooting.toLocaleString("ja-JP")}円/動画`,
  },
  {
    label: "ビジ友公式SNS動画制作プラン",
    price: `${OPTION_PRICES_TAX_INCLUDED.video_sns.toLocaleString("ja-JP")}円/動画`,
  },
];

function CellValue({ value }: { value: string }) {
  if (value === "○") {
    return (
      <span className="inline-flex items-center justify-center rounded-full bg-primary/10 p-1">
        <Check className="h-3.5 w-3.5 text-primary" />
      </span>
    );
  }
  if (value === "-") {
    return <span className="text-muted-foreground/40">—</span>;
  }
  if (value === "無制限") {
    return <span className="font-medium text-primary/80">無制限</span>;
  }
  return <span>{value}</span>;
}

export default function PlanListPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-muted">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-center text-heading-lg font-bold text-secondary">
          プラン一覧
        </h1>

        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-background shadow-sm">
          <table className="w-full min-w-[720px] border-collapse text-body-sm">
            {/* Plan name header */}
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-r border-border bg-secondary p-3 text-xs font-bold text-white shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                  プラン名
                </th>
                {PLAN_COLUMNS.map((col, i) => (
                  <th
                    key={col.key}
                    className={`border-b border-border bg-secondary p-3 text-center text-xs font-bold text-white whitespace-nowrap ${i < PLAN_COLUMNS.length - 1 ? "border-r border-r-secondary-foreground/20" : ""}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
              {/* Price rows（月額 / 年額） */}
              {(["monthly", "yearly"] as const).map((cycle) => (
                <tr key={cycle}>
                  <td className="sticky left-0 z-10 border-b border-r border-border bg-background p-2.5 text-body-sm font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                    {cycle === "monthly" ? "月額" : "年額（年払い）"}
                  </td>
                  {PLAN_COLUMNS.map((col, i) => (
                    <td
                      key={col.key}
                      className={`border-b border-border bg-secondary/5 p-2.5 text-center text-body-sm font-semibold ${i < PLAN_COLUMNS.length - 1 ? "border-r" : ""}`}
                    >
                      {(cycle === "monthly" ? col.monthly : col.yearly) ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </thead>
            {/* Feature rows */}
            <tbody>
              {FEATURES.map((feature, rowIdx) => (
                <tr
                  key={feature.label}
                  className={
                    rowIdx % 2 === 0 ? "bg-background" : "bg-muted/30"
                  }
                >
                  <td
                    className={`sticky left-0 z-10 whitespace-pre-wrap border-r border-border p-3 text-body-sm font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] ${rowIdx % 2 === 0 ? "bg-background" : "bg-gray-50"}`}
                  >
                    {feature.label}
                  </td>
                  {feature.values.map((val, i) => (
                    <td
                      key={PLAN_COLUMNS[i].key}
                      className={`p-3 text-center text-body-sm ${i < PLAN_COLUMNS.length - 1 ? "border-r border-border" : ""}`}
                    >
                      <CellValue value={val} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* オプションプラン（価格のみ。申込は料金プラン画面 /billing から） */}
        <section className="mt-6 rounded-xl border border-border bg-background p-5 shadow-sm">
          <h2 className="text-heading-sm font-bold">オプションプラン</h2>
          <dl className="mt-3 divide-y divide-border">
            {OPTION_ROWS.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-4 py-2.5"
              >
                <dt className="text-body-sm font-medium">{row.label}</dt>
                <dd className="text-body-sm whitespace-nowrap">{row.price}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* もどる */}
        <div className="mt-8 flex justify-center">
          <Button
            variant="outline"
            className="w-full max-w-xs rounded-full bg-background"
            onClick={() => router.back()}
          >
            もどる
          </Button>
        </div>
      </div>
    </div>
  );
}
