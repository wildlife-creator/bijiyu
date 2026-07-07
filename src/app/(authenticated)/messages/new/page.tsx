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
import {
  areIdentityPairsEqual,
  type ThreadActorIdentity,
} from "@/lib/messaging/identity";

interface Props {
  searchParams: Promise<{ to?: string }>;
}

/**
 * CLI-013 entry point: "メッセージを送る" from CLI-006 (user detail) など。
 *
 * Phase 2 (A1 修正):
 *   従来の「席2 = 受注者」ルールを廃止し、identity ペアでスレッドを一意化する。
 *   creator は必ず participant_1 (逆転バグ根絶)、相手は participant_2。
 *   organization_1_id / organization_2_id に各 identity の組織を格納。
 *   これにより受注者⇔受注者・発注者⇔発注者・組織⇔組織も同一ロジックで扱える。
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

  // Get BOTH sides' organizations.
  // Use admin client for targetUserId because organization_members RLS
  // restricts SELECT to same-org members only.
  const admin = createAdminClient();

  // Actor: use multi-org-aware helper (Cookie-resolved active org)
  const { active } = await getActiveOrganizationContext(supabase);
  const myOrgId = active?.organizationId ?? null;

  const { data: targetOrgRow } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", targetUserId)
    .maybeSingle();
  const targetOrgId = targetOrgRow?.organization_id ?? null;

  // Identity pair (Phase 2 統一モデル): 相手が組織所属なら組織 ID、
  // そうでなければ user ID を一意化キーとして扱う。
  const myIdentity: ThreadActorIdentity = {
    userId: user.id,
    organizationId: myOrgId,
  };
  const targetIdentity: ThreadActorIdentity = {
    userId: targetUserId,
    organizationId: targetOrgId,
  };

  // 自分 (もしくは自組織) が絡む既存スレッドを候補として取得し、
  // JS 側で identity ペア (順序無関係) で目的の相手側とマッチするものを選ぶ。
  // RLS により自分がアクセス権を持つ threads だけ返る。
  const involvementOr = [
    `participant_1_id.eq.${user.id}`,
    `participant_2_id.eq.${user.id}`,
  ];
  if (myOrgId) {
    involvementOr.push(`organization_1_id.eq.${myOrgId}`);
    involvementOr.push(`organization_2_id.eq.${myOrgId}`);
  }
  const { data: candidates } = await supabase
    .from("message_threads")
    .select(
      "id, participant_1_id, participant_2_id, organization_1_id, organization_2_id",
    )
    .or(involvementOr.join(","));

  const existing = (candidates ?? []).find((t) => {
    const p1: ThreadActorIdentity = {
      userId: t.participant_1_id,
      organizationId: t.organization_1_id,
    };
    const p2: ThreadActorIdentity = {
      userId: t.participant_2_id,
      organizationId: t.organization_2_id,
    };
    return areIdentityPairsEqual([myIdentity, targetIdentity], [p1, p2]);
  });

  let threadId: string | null = existing?.id ?? null;

  // Q2 (Phase 1 済): 新規スレッド作成時のみ月次上限判定。既存スレッド返信は無制限。
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

    // Phase 2 の一般化ルール:
    //   participant_1_id = creator (自分)。participant_2_id = 相手。
    //   organization_1/2_id にはそれぞれの identity の組織を格納。
    //   旧 organization_id は後方互換のため COALESCE で set (移行完了後 drop 予定)。
    // これにより:
    //   - 受注者⇔発注者: 従来通り
    //   - 受注者⇔受注者 / 発注者⇔発注者: 新規パターンも自然にサポート
    //   - 組織⇔組織: 両 org カラムに値が入る
    //
    // Use admin client: 参加 or 同一組織でないと RLS で INSERT 拒否されうるため。
    const { data: newThread, error } = await admin
      .from("message_threads")
      .insert({
        participant_1_id: user.id,
        participant_2_id: targetUserId,
        organization_1_id: myOrgId,
        organization_2_id: targetOrgId,
        // 後方互換: 旧クエリ (admin/messages, bulk-send etc.) は
        // organization_id を単一値として参照するため、片側の org を代表値として置く
        // (両側 org の org⇔org の場合は myOrgId を代表とする)。
        organization_id: myOrgId ?? targetOrgId,
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
