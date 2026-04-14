"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openCustomerPortalAction } from "@/app/(authenticated)/billing/plan-actions";

interface PastDueBannerProps {
  daysRemaining: number;
  severity: "warning" | "critical";
}

/**
 * Sticky banner shown at the top of every authenticated page when the user's
 * subscription is past_due.
 *
 * - `severity: 'warning'` (4+ days remaining) — amber background
 * - `severity: 'critical'` (3 days or fewer)  — red background
 *
 * The "お支払い方法を更新する" button opens the Stripe Customer Portal
 * via openCustomerPortalAction (card update + invoice history).
 *
 * Props are computed on the Server in the layout (no duplicate SELECT).
 */
export function PastDueBanner({ daysRemaining, severity }: PastDueBannerProps) {
  const [pending, startTransition] = useTransition();

  function handleUpdatePayment() {
    startTransition(async () => {
      const result = await openCustomerPortalAction();
      if (result.success && result.data?.portalUrl) {
        window.location.href = result.data.portalUrl;
        return;
      }
      toast.error(
        !result.success
          ? result.error
          : "お支払い情報ページを開けませんでした",
      );
    });
  }

  const isWarning = severity === "warning";
  const bgClass = isWarning
    ? "bg-yellow-50 border-yellow-300 text-yellow-900"
    : "bg-red-50 border-red-300 text-red-900";
  const buttonVariant = isWarning ? "outline" : "destructive";

  const message =
    daysRemaining > 0
      ? `お支払いが確認できません。あと${daysRemaining}日以内にお支払い方法を更新してください。`
      : "まもなく自動解約されます。お支払い方法をただちに更新してください。";

  return (
    <div className={`border-b px-4 py-3 ${bgClass}`}>
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 sm:flex-row sm:justify-between">
        <p className="text-body-sm font-medium">{message}</p>
        <Button
          variant={buttonVariant as "outline" | "destructive"}
          size="sm"
          className="shrink-0 rounded-full"
          disabled={pending}
          onClick={handleUpdatePayment}
        >
          お支払い方法を更新する
        </Button>
      </div>
    </div>
  );
}
