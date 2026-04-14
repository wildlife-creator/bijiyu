import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { PastDueBanner } from "@/components/billing/PastDueBanner";
import { SiteHeader } from "@/components/site-header";
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

  if (user) {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .in("status", ["active", "past_due"])
      .maybeSingle();

    hasActiveSubscription = !!subscription;
  }

  // PastDueBanner data: read from middleware-set headers (Task 2 軽 4)
  // so we do NOT need a second subscriptions SELECT.
  const requestHeaders = await headers();
  const billingStatus = requestHeaders.get("x-billing-status");
  const pastDueSince = requestHeaders.get("x-past-due-since");

  let pastDueBanner: { daysRemaining: number; severity: "warning" | "critical" } | null = null;
  if (billingStatus === "past_due" && pastDueSince) {
    const since = new Date(pastDueSince).getTime();
    const daysRemaining = Math.max(
      0,
      7 - Math.floor((Date.now() - since) / 86_400_000),
    );
    const severity = daysRemaining >= 4 ? "warning" : "critical";
    pastDueBanner = { daysRemaining, severity };
  }

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader
        isAuthenticated
        hasActiveSubscription={hasActiveSubscription}
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
