"use client";

import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * CLI-026 plan-list: Plan comparison table page.
 * Design comp: CLI-026-plan-list.png
 */

const PLAN_COLUMNS = [
  { key: "free", label: "無料", price: null },
  { key: "individual", label: "個人発注者様向け", price: "¥3,800" },
  { key: "small", label: "小規模事業主様向け", price: "¥14,800" },
  { key: "corporate", label: "法人向け", price: "¥48,000" },
  {
    key: "corporate_premium",
    label: "法人向け（高サポート）",
    price: "¥148,000",
  },
] as const;

interface FeatureRow {
  label: string;
  values: string[];
}

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
    values: ["無制限", "無制限", "無制限", "無制限", "無制限"],
  },
  {
    label: "上位表示",
    values: ["-", "○", "○", "○", "○"],
  },
  {
    label: "複数人利用",
    values: ["-", "-", "-", "10人まで", "30人まで"],
  },
  {
    label: "代理メッセージ",
    values: ["-", "-", "-", "36通/年", "300通/年"],
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
      <div className="mx-auto max-w-4xl px-4 py-6">
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
              {/* Price row */}
              <tr>
                <td className="sticky left-0 z-10 border-b border-r border-border bg-background p-2.5 text-body-sm font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                  月額
                </td>
                {PLAN_COLUMNS.map((col, i) => (
                  <td
                    key={col.key}
                    className={`border-b border-border bg-secondary/5 p-2.5 text-center text-body-sm font-semibold ${i < PLAN_COLUMNS.length - 1 ? "border-r" : ""}`}
                  >
                    {col.price ?? ""}
                  </td>
                ))}
              </tr>
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
