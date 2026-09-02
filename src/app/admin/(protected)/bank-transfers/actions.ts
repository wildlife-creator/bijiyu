"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin/require-admin";
import { writeAuditLog } from "@/lib/audit/log";
import {
  sendCompensationActivatedEmail,
  sendPlanActivatedEmail,
  sendUrgentActivatedEmails,
  sendVideoActivatedEmails,
} from "@/lib/billing/activation-emails";
import {
  OPEN_BANK_TRANSFER_STATUSES,
  computePeriodEnd,
  dateStringToJstIso,
  isValidDateString,
  targetFromRequestRow,
  type BankTransferTarget,
} from "@/lib/billing/bank-transfer";
import { grantBankTransferPlan } from "@/lib/billing/grant-plan";
import { isSubscriptionOption } from "@/lib/billing/options";
import { formatBillingDate } from "@/lib/email/recipients/billing-recipient";
import { sendEmail } from "@/lib/email/send-email";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types/action-result";

/**
 * ADM-026 銀行振込申込詳細 の Server Action（P2）。
 *
 * 申込レコードの状態遷移: requested → invoiced（請求書送付済）→ paid（入金確認 → 有効化）
 * / cancelled（取消）。有効化では Stripe 経路の `handle_checkout_completed_plan` RPC /
 * `handleOptionCheckout` と同じ副作用（契約行作成・role 昇格・client_profiles・組織作成・
 * 案件の急募フラグ・有効化メール）を、Stripe 由来の値なしで実行する。
 */

const memoSchema = z
  .string()
  .max(2000, "メモは2000文字以内で入力してください");

const POSTGRES_UNIQUE_VIOLATION = "23505";

type AdminClient = ReturnType<typeof createAdminClient>;

async function loadOpenRequest(admin: AdminClient, requestId: string) {
  const { data } = await admin
    .from("bank_transfer_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (!data) {
    return { ok: false as const, error: "対象の申込が見つかりません" };
  }
  if (!(OPEN_BANK_TRANSFER_STATUSES as readonly string[]).includes(data.status)) {
    return {
      ok: false as const,
      error: "この申込は既に処理済みです（入金確認済または取消）",
    };
  }
  return { ok: true as const, request: data };
}

function revalidateAll(requestId: string, userId: string) {
  revalidatePath("/admin/bank-transfers");
  revalidatePath(`/admin/bank-transfers/${requestId}`);
  revalidatePath(`/admin/clients/${userId}`);
  revalidatePath("/admin/clients");
  revalidatePath("/billing");
}

/** 請求書を送付した記録（requested → invoiced）。 */
export async function markBankTransferInvoicedAction(
  requestId: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const loaded = await loadOpenRequest(admin, requestId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  if (loaded.request.status !== "requested") {
    return { success: false, error: "この申込は既に請求書送付済です" };
  }

  const { error } = await admin
    .from("bank_transfer_requests")
    .update({
      status: "invoiced",
      invoiced_at: new Date().toISOString(),
      handled_by: auth.adminId,
    })
    .eq("id", requestId)
    .eq("status", "requested");
  if (error) {
    return { success: false, error: "更新に失敗しました" };
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "bank_transfer_invoiced",
    targetType: "bank_transfer_requests",
    targetId: requestId,
    metadata: { user_id: loaded.request.user_id },
  });
  revalidateAll(requestId, loaded.request.user_id);
  return { success: true };
}

/** 申込の取消（requested / invoiced → cancelled）。理由はメモに残す。 */
export async function cancelBankTransferRequestAction(
  requestId: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsedMemo = memoSchema.safeParse(String(formData.get("memo") ?? ""));
  if (!parsedMemo.success) {
    return {
      success: false,
      error: parsedMemo.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }

  const admin = createAdminClient();
  const loaded = await loadOpenRequest(admin, requestId);
  if (!loaded.ok) return { success: false, error: loaded.error };

  const memo = parsedMemo.data.trim();
  const mergedMemo = [loaded.request.admin_memo?.trim(), memo && `【取消理由】${memo}`]
    .filter((v): v is string => !!v)
    .join("\n");

  const { error } = await admin
    .from("bank_transfer_requests")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      handled_by: auth.adminId,
      admin_memo: mergedMemo || null,
    })
    .eq("id", requestId)
    .in("status", [...OPEN_BANK_TRANSFER_STATUSES]);
  if (error) {
    return { success: false, error: "更新に失敗しました" };
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "bank_transfer_cancel",
    targetType: "bank_transfer_requests",
    targetId: requestId,
    metadata: { user_id: loaded.request.user_id, reason: memo || null },
  });
  revalidateAll(requestId, loaded.request.user_id);
  return { success: true };
}

/** 運営メモの更新（状態を問わず可）。 */
export async function updateBankTransferMemoAction(
  requestId: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = memoSchema.safeParse(String(formData.get("memo") ?? ""));
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const memo = parsed.data.trim() === "" ? null : parsed.data;

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("bank_transfer_requests")
    .update({ admin_memo: memo })
    .eq("id", requestId)
    .select("user_id")
    .maybeSingle();
  if (error || !row) {
    return { success: false, error: "メモの保存に失敗しました" };
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "bank_transfer_memo_update",
    targetType: "bank_transfer_requests",
    targetId: requestId,
  });
  revalidateAll(requestId, row.user_id);
  return { success: true };
}

export interface ActivateBankTransferResult {
  /** 有効期限（YYYY/MM/DD）。買い切りオプションは null */
  periodEnd: string | null;
}

/**
 * 入金確認 → 有効化（requested / invoiced → paid）。
 *
 * formData.startDate（YYYY-MM-DD）を利用開始日とする。既定は当日。
 * D8: Stripe 契約中の会員を銀行振込へ切り替える場合、Stripe の期間終了日を開始日に
 * 指定し、その日以降に本操作を行う（有効プランが残っている間は拒否する）。
 */
export async function activateBankTransferAction(
  requestId: string,
  formData: FormData,
): Promise<ActionResult<ActivateBankTransferResult>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const startDate = String(formData.get("startDate") ?? "").trim();
  if (!isValidDateString(startDate)) {
    return { success: false, error: "利用開始日を YYYY-MM-DD 形式で入力してください" };
  }

  const admin = createAdminClient();
  const loaded = await loadOpenRequest(admin, requestId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const request = loaded.request;

  const target = targetFromRequestRow(request);
  if (!target) {
    return { success: false, error: "申込内容が不正です（対象を特定できません）" };
  }

  const { data: applicant } = await admin
    .from("users")
    .select("id, role, deleted_at, last_name, first_name")
    .eq("id", request.user_id)
    .maybeSingle();
  if (!applicant || applicant.deleted_at) {
    return { success: false, error: "申込者が退会済みのため有効化できません" };
  }

  const startIso = dateStringToJstIso(startDate, "start");

  let activatedSubscriptionId: string | null = null;
  let activatedOptionSubscriptionId: string | null = null;
  let periodEndLabel: string | null = null;

  if (target.kind === "plan") {
    const result = await activatePlan(admin, {
      userId: request.user_id,
      userRole: applicant.role,
      fullName: `${applicant.last_name ?? ""}${applicant.first_name ?? ""}`,
      target,
      startDate,
      startIso,
    });
    if (!result.ok) return { success: false, error: result.error };
    activatedSubscriptionId = result.subscriptionId;
    periodEndLabel = result.periodEndLabel;
  } else {
    const result = await activateOption(admin, {
      userId: request.user_id,
      target,
      jobId: request.job_id,
      startDate,
      startIso,
    });
    if (!result.ok) return { success: false, error: result.error };
    activatedOptionSubscriptionId = result.optionSubscriptionId;
    periodEndLabel = result.periodEndLabel;
  }

  const { error: updateError } = await admin
    .from("bank_transfer_requests")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      start_date: startDate,
      handled_by: auth.adminId,
      activated_subscription_id: activatedSubscriptionId,
      activated_option_subscription_id: activatedOptionSubscriptionId,
    })
    .eq("id", requestId);
  if (updateError) {
    // 契約行は作成済み。申込側の更新失敗はログに残し、運営が状態を手で直せるようにする
    console.error("[activateBankTransferAction] request update failed", updateError);
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "bank_transfer_activate",
    targetType: "bank_transfer_requests",
    targetId: requestId,
    metadata: {
      user_id: request.user_id,
      target_kind: target.kind,
      plan_type: request.plan_type,
      option_type: request.option_type,
      billing_cycle: request.billing_cycle,
      start_date: startDate,
      activated_subscription_id: activatedSubscriptionId,
      activated_option_subscription_id: activatedOptionSubscriptionId,
    },
  });
  revalidateAll(requestId, request.user_id);
  return { success: true, data: { periodEnd: periodEndLabel } };
}

// ---------------------------------------------------------------------------
// 有効化の内部処理（Stripe 経路の RPC / webhook と同じ副作用を再現）
// ---------------------------------------------------------------------------

async function activatePlan(
  admin: AdminClient,
  params: {
    userId: string;
    userRole: string;
    fullName: string;
    target: Extract<BankTransferTarget, { kind: "plan" }>;
    startDate: string;
    startIso: string;
  },
): Promise<
  | { ok: true; subscriptionId: string; periodEndLabel: string }
  | { ok: false; error: string }
> {
  const { userId, target, startDate, startIso } = params;

  // 二重契約防止（subscriptions_unique_active が最終防御）。D8 の案内を添える
  const { data: existing } = await admin
    .from("subscriptions")
    .select("id, payment_method, current_period_end")
    .eq("user_id", userId)
    .in("status", ["active", "past_due"])
    .limit(1)
    .maybeSingle();
  if (existing) {
    const until = existing.current_period_end
      ? formatBillingDate(existing.current_period_end)
      : "不明";
    return {
      ok: false,
      error:
        existing.payment_method === "stripe"
          ? `この方はクレジットカードでプランをご契約中です（期間終了日: ${until}）。期間終了後に、その日を利用開始日として有効化してください`
          : "この方には有効な銀行振込プランが既にあります。プラン変更・期限延長は発注者詳細から行ってください",
    };
  }

  // 契約行の作成と副作用（role 昇格・client_profiles・組織作成・監査・有効化メール）は
  // 管理運営アカウントの付与（P5）と共通の grantBankTransferPlan に集約
  const periodEnd = computePeriodEnd(startDate, target.billingCycle);
  const granted = await grantBankTransferPlan(admin, {
    userId,
    userRole: params.userRole,
    fullName: params.fullName,
    planType: target.planType,
    billingCycle: target.billingCycle,
    startDate,
    periodEndDate: periodEnd,
    via: "bank_transfer",
    sendActivationEmail: true,
  });
  if (!granted.ok) return granted;
  const subscriptionId = granted.subscriptionId;

  return { ok: true, subscriptionId, periodEndLabel: formatBillingDate(dateStringToJstIso(periodEnd, "end")) };
}

async function activateOption(
  admin: AdminClient,
  params: {
    userId: string;
    target: Extract<BankTransferTarget, { kind: "option" }>;
    jobId: string | null;
    startDate: string;
    startIso: string;
  },
): Promise<
  | { ok: true; optionSubscriptionId: string; periodEndLabel: string | null }
  | { ok: false; error: string }
> {
  const { userId, target, startDate, startIso } = params;
  const optionType = target.optionType;

  if (optionType === "compensation_5000" || optionType === "compensation_9800") {
    const { data: existingComp } = await admin
      .from("option_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .in("option_type", ["compensation_5000", "compensation_9800"])
      .eq("status", "active")
      .limit(1);
    if ((existingComp?.length ?? 0) > 0) {
      return { ok: false, error: "この方は既に補償オプションに加入しています" };
    }
    const cycle = target.billingCycle ?? "monthly";
    const periodEnd = computePeriodEnd(startDate, cycle);
    const endIso = dateStringToJstIso(periodEnd, "end");
    const insert = await admin
      .from("option_subscriptions")
      .insert({
        user_id: userId,
        payment_type: "subscription",
        payment_method: "bank_transfer",
        option_type: optionType,
        status: "active",
        start_date: startIso,
        end_date: endIso,
      })
      .select("id")
      .single();
    if (insert.error || !insert.data) {
      console.error("[activateBankTransferAction] compensation insert failed", insert.error);
      return { ok: false, error: "契約の作成に失敗しました" };
    }
    await sendCompensationActivatedEmail(admin, sendEmail, userId, optionType, startIso);
    return {
      ok: true,
      optionSubscriptionId: insert.data.id,
      periodEndLabel: formatBillingDate(endIso),
    };
  }

  if (optionType === "urgent") {
    if (!params.jobId) {
      return { ok: false, error: "急募オプションの対象案件が見つかりません" };
    }
    const { data: job } = await admin
      .from("jobs")
      .select("id, status")
      .eq("id", params.jobId)
      .maybeSingle();
    if (!job) {
      return { ok: false, error: "対象の案件が見つかりません（削除済みの可能性）" };
    }
    const { data: existingUrgent } = await admin
      .from("option_subscriptions")
      .select("id")
      .eq("job_id", params.jobId)
      .eq("option_type", "urgent")
      .eq("status", "active")
      .limit(1);
    if ((existingUrgent?.length ?? 0) > 0) {
      return { ok: false, error: "この案件には既に急募オプションが適用されています" };
    }
    const start = new Date(startIso);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const insert = await admin
      .from("option_subscriptions")
      .insert({
        user_id: userId,
        job_id: params.jobId,
        payment_type: "one_time",
        payment_method: "bank_transfer",
        option_type: "urgent",
        status: "active",
        start_date: start.toISOString(),
        end_date: end.toISOString(),
      })
      .select("id")
      .single();
    if (insert.error || !insert.data) {
      console.error("[activateBankTransferAction] urgent insert failed", insert.error);
      return { ok: false, error: "契約の作成に失敗しました" };
    }
    const { error: profileError } = await admin
      .from("client_profiles")
      .update({ is_urgent_option: true })
      .eq("user_id", userId);
    if (profileError) {
      console.error("[activateBankTransferAction] is_urgent_option update failed", profileError);
    }
    const { error: jobError } = await admin
      .from("jobs")
      .update({ is_urgent: true })
      .eq("id", params.jobId);
    if (jobError) {
      console.error("[activateBankTransferAction] jobs.is_urgent update failed", jobError);
    }
    await sendUrgentActivatedEmails(admin, sendEmail, params.jobId, end);
    return {
      ok: true,
      optionSubscriptionId: insert.data.id,
      periodEndLabel: formatBillingDate(end.toISOString()),
    };
  }

  // video / video_workplace（買い切り・期限なし。作り直しの再購入は許容）
  if (isSubscriptionOption(optionType)) {
    return { ok: false, error: "対応していないオプションです" };
  }
  const insert = await admin
    .from("option_subscriptions")
    .insert({
      user_id: userId,
      payment_type: "one_time",
      payment_method: "bank_transfer",
      option_type: optionType,
      status: "active",
      start_date: startIso,
      end_date: null,
    })
    .select("id")
    .single();
  if (insert.error || !insert.data) {
    console.error("[activateBankTransferAction] video insert failed", insert.error);
    return { ok: false, error: "契約の作成に失敗しました" };
  }
  await sendVideoActivatedEmails(admin, sendEmail, userId, optionType, startIso);
  return { ok: true, optionSubscriptionId: insert.data.id, periodEndLabel: null };
}
