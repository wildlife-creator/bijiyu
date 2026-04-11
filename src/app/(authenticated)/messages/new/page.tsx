import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  // Use admin client because organization_members RLS restricts SELECT to same-org members only
  const admin = createAdminClient();

  const { data: myOrg } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: targetOrg } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", targetUserId)
    .maybeSingle();

  // Determine organization_id: use whichever side has an org
  // (in a contractor <-> org thread, one side has org, the other doesn't)
  const organizationId = myOrg?.organization_id ?? targetOrg?.organization_id ?? null;

  // Search for existing thread
  let threadId: string | null = null;

  if (organizationId) {
    // Org-based: search by org + contractor (participant_2)
    // The contractor is whichever user does NOT belong to the org
    const contractorId = myOrg?.organization_id ? targetUserId : user.id;
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

  // Create new thread if none exists
  if (!threadId) {
    // participant_2 = contractor side (the one without org, or the target if neither has org)
    const contractorId = organizationId
      ? (myOrg?.organization_id ? targetUserId : user.id)
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
