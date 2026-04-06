import { Badge } from "@/components/ui/badge";

// Display category configuration
const DISPLAY_CATEGORY_MAP: Record<
  string,
  { label: string; className: string }
> = {
  応募結果待ち: {
    label: "応募結果待ち",
    className: "bg-blue-50 text-blue-400 border-blue-100",
  },
  "応募あり（未対応）": {
    label: "応募あり（未対応）",
    className: "bg-red-50 text-red-400 border-red-100",
  },
  稼働予定: {
    label: "稼働予定",
    className: "bg-[rgba(146,7,131,0.05)] text-primary/60 border-[rgba(146,7,131,0.1)]",
  },
  発注済み: {
    label: "発注済み",
    className: "bg-[rgba(146,7,131,0.05)] text-primary/60 border-[rgba(146,7,131,0.1)]",
  },
  評価登録未入力: {
    label: "評価登録未入力",
    className: "bg-yellow-50 text-yellow-500 border-yellow-100",
  },
  評価登録済み: {
    label: "評価登録済み",
    className: "bg-orange-50 text-orange-400 border-orange-100",
  },
  "落選・キャンセル": {
    label: "落選・キャンセル",
    className: "bg-muted/50 text-muted-foreground/60 border-border/50",
  },
  "キャンセル・お断り": {
    label: "キャンセル・お断り",
    className: "bg-muted/50 text-muted-foreground/60 border-border/50",
  },
  取引完了: {
    label: "取引完了",
    className: "bg-green-50 text-green-400 border-green-100",
  },
};

/**
 * Map DB status + review existence to display category for contractor.
 * hasClientReview = 自分（受注者）の評価, hasUserReview = 相手（発注者）の評価
 */
export function getDisplayCategory(
  status: string,
  hasClientReview: boolean,
  hasUserReview: boolean = false,
): string {
  switch (status) {
    case "applied":
      return "応募結果待ち";
    case "accepted":
      if (hasClientReview) return "評価登録済み";
      if (hasUserReview) return "評価登録未入力";
      return "稼働予定";
    case "rejected":
    case "cancelled":
      return "落選・キャンセル";
    case "completed":
    case "lost":
      return "取引完了";
    default:
      return status;
  }
}

/**
 * Map DB status + review existence to display category for client.
 * hasUserReview = 自分（発注者）の評価, hasClientReview = 相手（受注者）の評価
 */
export function getOrderDisplayCategory(
  status: string,
  hasUserReview: boolean,
  hasClientReview: boolean = false,
): string {
  switch (status) {
    case "applied":
      return "応募あり（未対応）";
    case "accepted":
      if (hasUserReview) return "評価登録済み";
      if (hasClientReview) return "評価登録未入力";
      return "発注済み";
    case "rejected":
    case "cancelled":
      return "キャンセル・お断り";
    case "completed":
    case "lost":
      return "取引完了";
    default:
      return status;
  }
}

interface ApplicationStatusBadgeProps {
  status: string;
  hasClientReview?: boolean;
  hasUserReview?: boolean;
  displayCategory?: string;
}

export function ApplicationStatusBadge({
  status,
  hasClientReview = false,
  hasUserReview = false,
  displayCategory,
}: ApplicationStatusBadgeProps) {
  const category = displayCategory ?? getDisplayCategory(status, hasClientReview, hasUserReview);
  const config = DISPLAY_CATEGORY_MAP[category] ?? {
    label: category,
    className: "bg-gray-100 text-gray-500",
  };

  return (
    <Badge
      variant="outline"
      className={`rounded-full text-body-xs font-medium ${config.className}`}
    >
      {config.label}
    </Badge>
  );
}
