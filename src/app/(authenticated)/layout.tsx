import { createClient } from "@/lib/supabase/server";
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

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader
        isAuthenticated
        hasActiveSubscription={hasActiveSubscription}
      />
      <main>{children}</main>
      <Toaster position="top-center" />
    </div>
  );
}
