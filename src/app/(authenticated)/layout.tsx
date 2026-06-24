import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PastDueBanner } from "@/components/billing/PastDueBanner";
import { SiteHeader } from "@/components/site-header";
import { OrgSwitcher } from "@/components/organization/org-switcher";
import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { Toaster } from "@/components/ui/sonner";

interface AuthenticatedLayoutProps {
  children: React.ReactNode;
}

export default async function AuthenticatedLayout({
  children,
}: AuthenticatedLayoutProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let hasActiveSubscription = false;
  let orgSwitcher: React.ReactNode = null;

  if (user) {
    // proxy-account-multi-org-support Phase 3 / Phase 7
    // active org コンテキストを 1 回解決して subscription 解決と OrgSwitcher
    // 描画の両方に使い回す（organization_members SELECT を 2 回走らせない）。
    const { active, all } = await getActiveOrganizationContext(supabase);

    // ---- subscription 解決 ----
    // Owner / 個人ユーザーは自分の subscription を持つので素直に SELECT。
    // Staff / Admin は自分の subscription を持たず Owner のサブスクに相乗りする
    // 設計（CLAUDE.md「Staff ユーザーの subscription 参照」/ REQ-ORG-011）。
    // Staff セッションは RLS で他者の subscriptions を SELECT 不可のため
    // admin client で解決する。基準実装: src/app/(authenticated)/mypage/page.tsx
    const isStaffContext = active !== null && active.orgRole !== "owner";
    if (isStaffContext) {
      const admin = createAdminClient();
      const { data: subscription } = await admin
        .from("subscriptions")
        .select("status")
        .eq("user_id", active.orgOwnerId)
        .in("status", ["active", "past_due"])
        .maybeSingle();
      hasActiveSubscription = !!subscription;
    } else {
      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .in("status", ["active", "past_due"])
        .maybeSingle();
      hasActiveSubscription = !!subscription;
    }

    // ---- OrgSwitcher ----
    // proxy-account-multi-org-support Phase 7 / Task 7.3
    // N 組織兼任スタッフの組織コンテキスト切替 UI をヘッダーに組み込む。
    // memberships が 1 件以下なら OrgSwitcher 内部で null を返すため
    // 単一組織ユーザー / 受注者単独ユーザーには DOM 出力なし。
    if (all.length > 1) {
      orgSwitcher = (
        <OrgSwitcher
          memberships={all.map((m) => ({
            organizationId: m.organizationId,
            displayName: m.displayName,
          }))}
          activeOrgId={active?.organizationId ?? null}
        />
      );
    }
  }

  // PastDueBanner data: read from middleware-set headers (Task 2 軽 4)
  // so we do NOT need a second subscriptions SELECT.
  const requestHeaders = await headers();
  const billingStatus = requestHeaders.get("x-billing-status");
  const pastDueSince = requestHeaders.get("x-past-due-since");

  let pastDueBanner: { daysRemaining: number; severity: "warning" | "critical" } | null = null;
  if (billingStatus === "past_due" && pastDueSince) {
    const since = new Date(pastDueSince).getTime();
    // Server Component なのでリクエスト毎に 1 回評価。React Compiler の純粋性チェックは過剰反応。
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const daysRemaining = Math.max(0, 7 - Math.floor((now - since) / 86_400_000));
    const severity = daysRemaining >= 4 ? "warning" : "critical";
    pastDueBanner = { daysRemaining, severity };
  }

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader
        isAuthenticated
        hasActiveSubscription={hasActiveSubscription}
        orgSwitcher={orgSwitcher}
      />
      {pastDueBanner && (
        <PastDueBanner
          daysRemaining={pastDueBanner.daysRemaining}
          severity={pastDueBanner.severity}
        />
      )}
      <main>{children}</main>
      <Toaster position="top-center" />
    </div>
  );
}
