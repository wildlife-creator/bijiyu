"use server";

import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bulkMessageSchema } from "@/lib/validations/message";
import {
  areIdentityPairsEqual,
  type ThreadActorIdentity,
} from "@/lib/messaging/identity";
import { fetchAllRows } from "@/lib/admin/proxy-threads";
import type { ActionResult } from "@/lib/types/action-result";

// ---------------------------------------------------------------------------
// 3.3 sendBulkMessagesAction (org-aware)
// ---------------------------------------------------------------------------
export async function sendBulkMessagesAction(
  formData: FormData,
): Promise<ActionResult<{ sent: number; failed: number }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "認証が必要です" };

    // Role check
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!userData || (userData.role !== "client" && userData.role !== "staff")) {
      return { success: false, error: "一斉送信は発注者のみ利用できます" };
    }

    // Validate
    const recipientIdsRaw = formData.get("recipientIds") as string;
    let recipientIds: string[];
    try {
      recipientIds = JSON.parse(recipientIdsRaw);
    } catch {
      return { success: false, error: "送信先の形式が不正です" };
    }

    const parsed = bulkMessageSchema.safeParse({
      recipientIds,
      body: formData.get("body"),
    });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
    }

    // Get user's org (if any) and proxy account status
    const { active } = await getActiveOrganizationContext(supabase);
    const organizationId = active?.organizationId ?? null;
    const isProxy = active?.isProxyAccount === true;

    // Phase 2: identity ベース検索用の admin client (相手 org 解決に必要)
    const admin = createAdminClient();
    const myIdentity: ThreadActorIdentity = {
      userId: user.id,
      organizationId,
    };

    let sent = 0;
    let failed = 0;

    for (const recipientId of parsed.data.recipientIds) {
      try {
        // 相手 (受信者) の組織 identity を admin 経由で解決
        const { data: recipientOrgRow } = await admin
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", recipientId)
          .maybeSingle();
        const recipientOrgId = recipientOrgRow?.organization_id ?? null;
        const targetIdentity: ThreadActorIdentity = {
          userId: recipientId,
          organizationId: recipientOrgId,
        };

        // 自分 (または自組織) が絡む候補を identity 列で拾い、identity ペア照合
        const involvementOr = [
          `participant_1_id.eq.${user.id}`,
          `participant_2_id.eq.${user.id}`,
        ];
        if (organizationId) {
          involvementOr.push(`organization_1_id.eq.${organizationId}`);
          involvementOr.push(`organization_2_id.eq.${organizationId}`);
        }
        // R5.1: 1000 件上限による静かな打ち切りを避けるため range ページネーション。
        let candidates: Array<{
          id: string;
          participant_1_id: string;
          participant_2_id: string;
          organization_1_id: string | null;
          organization_2_id: string | null;
        }> = [];
        try {
          candidates = await fetchAllRows((from, to) =>
            supabase
              .from("message_threads")
              .select(
                "id, participant_1_id, participant_2_id, organization_1_id, organization_2_id",
              )
              .or(involvementOr.join(","))
              .order("id", { ascending: true })
              .range(from, to),
          );
        } catch {
          candidates = [];
        }

        const existing = candidates.find((t) => {
          const p1: ThreadActorIdentity = {
            userId: t.participant_1_id,
            organizationId: t.organization_1_id,
          };
          const p2: ThreadActorIdentity = {
            userId: t.participant_2_id,
            organizationId: t.organization_2_id,
          };
          return areIdentityPairsEqual(
            [myIdentity, targetIdentity],
            [p1, p2],
          );
        });

        let threadId: string | null = existing?.id ?? null;

        if (!threadId) {
          // 新規作成: identity 列を明示 set
          const { data: newThread, error: threadError } = await supabase
            .from("message_threads")
            .insert({
              participant_1_id: user.id,
              participant_2_id: recipientId,
              organization_1_id: organizationId,
              organization_2_id: recipientOrgId,
              organization_id: organizationId ?? recipientOrgId,
              thread_type: "message",
            })
            .select("id")
            .single();
          if (threadError || !newThread) { failed++; continue; }
          threadId = newThread.id;
        }

        const { error: msgError } = await supabase.from("messages").insert({
          thread_id: threadId,
          sender_id: user.id,
          body: parsed.data.body,
          is_scout: false,
          is_proxy: isProxy,
        });
        if (msgError) { failed++; continue; }

        await supabase
          .from("message_threads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", threadId);

        sent++;
      } catch {
        failed++;
      }
    }

    return { success: true, data: { sent, failed } };
  } catch {
    return { success: false, error: "処理中にエラーが発生しました" };
  }
}
