import { sendPlanActivatedEmail } from "@/lib/billing/activation-emails";
import { dateStringToJstIso } from "@/lib/billing/bank-transfer";
import type { BillingCycle, PaidPlanType } from "@/lib/constants/plans";
import { sendEmail } from "@/lib/email/send-email";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const POSTGRES_UNIQUE_VIOLATION = "23505";

export type GrantPlanResult =
  | { ok: true; subscriptionId: string; periodEndIso: string }
  | { ok: false; error: string };

/**
 * 銀行振込（Stripe を介さない）の基本プラン契約行を作り、Stripe 経路の
 * `handle_checkout_completed_plan` と同じ副作用を再現する共通処理。
 *
 * 呼び出し元:
 * - ADM-026 銀行振込の有効化（`activateBankTransferAction`）: 有効化メールあり
 * - ADM-009 管理運営アカウントの設定（`setOpsAccountAction`）: 内部アカウントのため
 *   有効化メールなし・期限 2099 年（P5 / D10）
 *
 * 副作用（順序どおり）:
 * 1. subscriptions INSERT（payment_method='bank_transfer'、stripe_subscription_id NULL）
 * 2. role が contractor なら client へ昇格 + audit `role_changed`
 * 3. client_profiles を upsert（既存があれば display_name を維持）
 * 4. プレミアム / ハイエンドなら `ensure_organization_exists` RPC
 * 5. audit `subscription_created`
 * 6. （任意）§6.7 プラン契約完了メール
 *
 * 呼び出し側で「既に有効な契約がないこと」を確認しておくこと（最終防御は
 * 一意制約 `subscriptions_unique_active`。違反時は ok:false で返す）。
 */
export async function grantBankTransferPlan(
  admin: AdminClient,
  params: {
    userId: string;
    userRole: string;
    /** client_profiles.display_name の初期値（姓名） */
    fullName: string;
    planType: PaidPlanType;
    billingCycle: BillingCycle;
    /** 利用開始日（YYYY-MM-DD、JST） */
    startDate: string;
    /** 有効期限日（YYYY-MM-DD、JST。その日の 23:59:59 まで有効） */
    periodEndDate: string;
    /** audit metadata の via（例: 'bank_transfer' / 'ops_account'） */
    via: string;
    sendActivationEmail: boolean;
  },
): Promise<GrantPlanResult> {
  const { userId, planType, billingCycle } = params;
  const startIso = dateStringToJstIso(params.startDate, "start");
  const periodEndIso = dateStringToJstIso(params.periodEndDate, "end");

  const insert = await admin
    .from("subscriptions")
    .insert({
      user_id: userId,
      plan_type: planType,
      status: "active",
      payment_method: "bank_transfer",
      billing_cycle: billingCycle,
      stripe_subscription_id: null,
      current_period_start: startIso,
      current_period_end: periodEndIso,
    })
    .select("id")
    .single();
  if (insert.error || !insert.data) {
    if (insert.error?.code === POSTGRES_UNIQUE_VIOLATION) {
      return { ok: false, error: "この方には有効なプランが既にあります" };
    }
    console.error("[grantBankTransferPlan] subscriptions insert failed", insert.error);
    return { ok: false, error: "契約の作成に失敗しました" };
  }
  const subscriptionId = insert.data.id;

  // role: contractor → client（handle_checkout_completed_plan と同じ）
  if (params.userRole === "contractor") {
    const { error: roleError } = await admin
      .from("users")
      .update({ role: "client" })
      .eq("id", userId);
    if (roleError) {
      console.error("[grantBankTransferPlan] role update failed", roleError);
    } else {
      await admin.from("audit_logs").insert({
        actor_id: null,
        action: "role_changed",
        target_type: "user",
        target_id: userId,
        metadata: { from: "contractor", to: "client", via: params.via },
      });
    }
  }

  // client_profiles を作成（既存があれば display_name を維持）
  const { error: profileError } = await admin
    .from("client_profiles")
    .upsert(
      { user_id: userId, display_name: params.fullName },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
  if (profileError) {
    console.error("[grantBankTransferPlan] client_profiles upsert failed", profileError);
  }

  // 法人プラン: 組織を用意
  if (planType === "corporate" || planType === "corporate_premium") {
    const { error: orgError } = await admin.rpc("ensure_organization_exists", {
      uid: userId,
    });
    if (orgError) {
      console.error("[grantBankTransferPlan] ensure_organization_exists failed", orgError);
    }
  }

  await admin.from("audit_logs").insert({
    actor_id: null,
    action: "subscription_created",
    target_type: "subscription",
    target_id: subscriptionId,
    metadata: {
      plan_type: planType,
      payment_method: "bank_transfer",
      billing_cycle: billingCycle,
      user_id: userId,
      via: params.via,
    },
  });

  if (params.sendActivationEmail) {
    // §6.7 プラン契約完了メール（Stripe 経路と同じテンプレ）
    await sendPlanActivatedEmail(admin, sendEmail, userId, planType, startIso);
  }

  return { ok: true, subscriptionId, periodEndIso };
}
