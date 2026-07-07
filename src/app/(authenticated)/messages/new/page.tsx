import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/job-search/back-button";
import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MONTHLY_NEW_THREAD_LIMIT,
  isMonthlyNewThreadLimitExceeded,
} from "@/lib/messaging/rate-limits";

interface Props {
  searchParams: Promise<{ to?: string }>;
}

/**
 * CLI-013 entry point: "メッセージを送る" from CLI-006 (user detail).
 * Finds or creates a thread with the target user, then redirects to the thread detail page.
 */
export default async function NewMessagePage({ searchParams }: Props) {
  const params = await searchParams;
  const targetUserId = params.to;

  if (!targetUserId) {
    redirect("/messages");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get BOTH users' organizations
  // Use admin client for targetUserId because organization_members RLS restricts SELECT to same-org members only
  const admin = createAdminClient();

  // Actor: use multi-org-aware helper (Cookie-resolved active org)
  const { active } = await getActiveOrganizationContext(supabase);
  const myOrgId = active?.organizationId ?? null;

  const { data: targetOrg } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", targetUserId)
    .maybeSingle();

  // Determine organization_id: use whichever side has an org
  // (in a contractor <-> org thread, one side has org, the other doesn't)
  const organizationId = myOrgId ?? targetOrg?.organization_id ?? null;

  // Search for existing thread
  let threadId: string | null = null;

  if (organizationId) {
    // Org-based: search by org + contractor (participant_2)
    // The contractor is whichever user does NOT belong to the org
    const contractorId = myOrgId ? targetUserId : user.id;
    const { data: existing } = await supabase
      .from("message_threads")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("participant_2_id", contractorId)
      .limit(1)
      .maybeSingle();
    threadId = existing?.id ?? null;
  } else {
    // No org: search by participant pair
    const { data: existing } = await supabase
      .from("message_threads")
      .select("id")
      .or(
        `and(participant_1_id.eq.${user.id},participant_2_id.eq.${targetUserId}),and(participant_1_id.eq.${targetUserId},participant_2_id.eq.${user.id})`,
      )
      .limit(1)
      .maybeSingle();
    threadId = existing?.id ?? null;
  }

  // Q2: 新規スレッド作成時のみ月次上限判定を適用。既存スレッド返信は無制限。
  // 判定は既存スレッドが見つからなかった場合にのみ実行する（既存への返信は
  // 影響しない仕様）。
  if (!threadId) {
    if (await isMonthlyNewThreadLimitExceeded(supabase, user.id)) {
      return (
        <div className="min-h-dvh">
          <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
            <h1 className="text-center text-heading-lg font-bold text-secondary">
              今月の新規メッセージ上限に達しました
            </h1>
            <div className="mt-6 rounded-[8px] border border-border/10 bg-background p-6">
              <p className="text-body-md text-foreground">
                無料プランでは、新しいスレッドの作成が月{MONTHLY_NEW_THREAD_LIMIT}件までに制限されています。
              </p>
              <p className="mt-3 text-body-md text-foreground">
                有料プランにアップグレードすると、上限なくメッセージを送信できます。既存スレッドへの返信はそのままご利用いただけます。
              </p>
            </div>
            <div className="mt-6 flex flex-col items-center gap-3">
              <Button
                asChild
                className="w-full max-w-xs rounded-full bg-primary text-white hover:bg-primary/90"
              >
                <Link href="/billing">料金プランを見る</Link>
              </Button>
              <BackButton />
            </div>
          </div>
        </div>
      );
    }

    // participant_2 = contractor side (the one without org, or the target if neither has org)
    const contractorId = organizationId
      ? (myOrgId ? targetUserId : user.id)
      : targetUserId;
    const creatorId = user.id;

    // Use admin client: contractor creating a thread with organization_id
    // would fail RLS (not an org member), so bypass with service_role
    const { data: newThread, error } = await admin
      .from("message_threads")
      .insert({
        participant_1_id: creatorId,
        participant_2_id: contractorId,
        organization_id: organizationId,
        thread_type: "message",
      })
      .select("id")
      .single();

    if (error || !newThread) {
      redirect("/messages");
    }
    threadId = newThread.id;
  }

  redirect(`/messages/${threadId}?showScoutActions=false`);
}
