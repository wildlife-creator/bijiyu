"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import { resolveSiteUrl } from "@/lib/billing/activation-emails";
import {
  BANK_TRANSFER_REQUEST_PENDING_MESSAGE,
  OPEN_BANK_TRANSFER_STATUSES,
  computeBankTransferAmount,
  describeBankTransferTarget,
  type BankTransferTarget,
  BANK_TRANSFER_SELF_SERVICE_DISABLED_MESSAGE,
  isBankTransferSelfServiceEnabled,
} from "@/lib/billing/bank-transfer";
import {
  COMPENSATION_OPTION_DISABLED_MESSAGE,
  isCompensationOptionEnabled,
} from "@/lib/billing/options";
import { FEE_COOKIE_NAME, readFeeCookie } from "@/lib/billing/fee-cookie";
import { PAID_PLAN_TYPES } from "@/lib/constants/plans";
import { resolveApplicantCompanyName } from "@/lib/email/recipients/applicant-company-name";
import {
  fetchBillingRecipient,
  formatBillingDateTime,
} from "@/lib/email/recipients/billing-recipient";
import { sendEmail } from "@/lib/email/send-email";
import { bankTransferRequestedEmail } from "@/lib/email/templates/bank-transfer-requested";
import { bankTransferRequestedOpsEmail } from "@/lib/email/templates/bank-transfer-requested-ops";
import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types/action-result";

/**
 * 銀行振込の申込（P2: docs/requirements/spec-changes-202608.md §2.1(1) / D6）。
 *
 * 決済はアプリ外。ここでは申込レコード（bank_transfer_requests）を「申込受付」で作り、
 * メール 2 通（申込者控え / 運営宛「請求書を送付してください」）を送るだけ。
 * 入金確認後の有効化は管理画面（/admin/bank-transfers/[id]）で運営が行う。
 *
 * 事前チェックは Stripe 経路（startCheckoutAction）と同じ条件を適用し、
 * どちらの経路からも同じ対象を二重に契約できないようにする。
 */

const billingCycleSchema = z.enum(["monthly", "yearly"]);

const inputSchema = z.union([
  z.object({
    type: z.literal("plan"),
    planType: z.enum(PAID_PLAN_TYPES),
    billingCycle: billingCycleSchema,
  }),
  z.object({
    type: z.literal("option"),
    optionType: z.enum(["compensation_5000", "compensation_9800"]),
    billingCycle: billingCycleSchema,
  }),
  z.object({
    type: z.literal("option"),
    optionType: z.literal("urgent"),
    jobId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("option"),
    // 買い切り動画系。video_workplace のみ発注者プラン加入者限定（下の分岐）、
    // video / video_shooting（P7）は全会員
    optionType: z.enum(["video", "video_workplace", "video_shooting"]),
  }),
]);

export type BankTransferRequestInput = z.infer<typeof inputSchema>;

export interface BankTransferRequestResult {
  requestId: string;
  targetLabel: string;
}

const POSTGRES_UNIQUE_VIOLATION = "23505";

export async function requestBankTransferAction(
  rawInput: BankTransferRequestInput,
): Promise<ActionResult<BankTransferRequestResult>> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: "入力内容が正しくありません" };
  }
  const input = parsed.data;

  // P9: 本人申込は既定で停止（画面からボタンを消しても直接呼べるためここでも拒否）。
  // 運営が ADM-025 で代理登録する経路（createBankTransferRequestByAdminAction）は別
  if (!isBankTransferSelfServiceEnabled()) {
    return { success: false, error: BANK_TRANSFER_SELF_SERVICE_DISABLED_MESSAGE };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "ログインしてください" };
  }

  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("id, role, email")
    .eq("id", user.id)
    .single();
  if (userError || !userRow) {
    return { success: false, error: "ユーザー情報の取得に失敗しました" };
  }
  if (userRow.role === "staff") {
    return {
      success: false,
      error: "担当者アカウントではお申し込みできません",
    };
  }
  if (userRow.role === "admin") {
    return {
      success: false,
      error: "管理者アカウントではお申し込みできません",
    };
  }

  const admin = createAdminClient();

  // ---- 事前チェック（Stripe 経路と同条件） ----
  let target: BankTransferTarget;
  let jobId: string | null = null;
  let needsInitialFee = false;

  if (input.type === "plan") {
    const existingActive = await admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["active", "past_due"])
      .limit(1);
    if ((existingActive.data?.length ?? 0) > 0) {
      return {
        success: false,
        error:
          "すでにご契約中のプランがあります。プランの変更は運営までご連絡ください",
      };
    }

    // 初回事務手数料: これまで一度も基本プランを契約していない場合のみ
    const anySub = await admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);
    if ((anySub.data?.length ?? 0) === 0) {
      const cookieStore = await cookies();
      const feeCookie = await readFeeCookie(
        cookieStore.get(FEE_COOKIE_NAME)?.value,
      ).catch(() => null);
      needsInitialFee = !feeCookie?.feeExempt;
    }

    target = {
      kind: "plan",
      planType: input.planType,
      billingCycle: input.billingCycle,
    };
  } else if (
    input.optionType === "compensation_5000" ||
    input.optionType === "compensation_9800"
  ) {
    // P8: 補償オプションは販売停止中（フラグで復活可）
    if (!isCompensationOptionEnabled()) {
      return { success: false, error: COMPENSATION_OPTION_DISABLED_MESSAGE };
    }
    const existingComp = await admin
      .from("option_subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .in("option_type", ["compensation_5000", "compensation_9800"])
      .eq("status", "active")
      .limit(1);
    if ((existingComp.data?.length ?? 0) > 0) {
      return {
        success: false,
        error: "既に補償オプションにご加入いただいています",
      };
    }
    target = {
      kind: "option",
      optionType: input.optionType,
      billingCycle: input.billingCycle,
    };
  } else if (input.optionType === "urgent") {
    const job = await admin
      .from("jobs")
      .select("id, owner_id, organization_id, is_urgent")
      .eq("id", input.jobId)
      .maybeSingle();
    if (!job.data) {
      return {
        success: false,
        error: "対象の案件が見つからないか、操作する権限がありません",
      };
    }
    let authorized = job.data.owner_id === user.id;
    if (!authorized && job.data.organization_id) {
      const { active } = await getActiveOrganizationContext(supabase);
      authorized = active?.organizationId === job.data.organization_id;
    }
    if (!authorized) {
      return {
        success: false,
        error: "対象の案件が見つからないか、操作する権限がありません",
      };
    }
    const existingUrgent = await admin
      .from("option_subscriptions")
      .select("id")
      .eq("job_id", input.jobId)
      .eq("option_type", "urgent")
      .eq("status", "active")
      .limit(1);
    if ((existingUrgent.data?.length ?? 0) > 0) {
      return {
        success: false,
        error: "この案件は既に急募オプションが適用されています",
      };
    }
    jobId = input.jobId;
    target = { kind: "option", optionType: "urgent" };
  } else {
    if (input.optionType === "video_workplace") {
      const planSub = await admin
        .from("subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .in("plan_type", PAID_PLAN_TYPES)
        .limit(1);
      if ((planSub.data?.length ?? 0) === 0) {
        return {
          success: false,
          error: "職場紹介動画掲載は発注者プラン加入者のみご利用いただけます",
        };
      }
    }
    target = { kind: "option", optionType: input.optionType };
  }

  // 同じ対象の申込を処理中なら拒否（DB の部分ユニーク index が最終防御）
  let openQuery = admin
    .from("bank_transfer_requests")
    .select("id")
    .eq("user_id", user.id)
    .eq("target_kind", target.kind)
    .in("status", [...OPEN_BANK_TRANSFER_STATUSES]);
  if (target.kind === "option") {
    openQuery = openQuery.eq("option_type", target.optionType);
    if (jobId) openQuery = openQuery.eq("job_id", jobId);
  }
  const { data: openRows } = await openQuery.limit(1);
  if ((openRows?.length ?? 0) > 0) {
    return { success: false, error: BANK_TRANSFER_REQUEST_PENDING_MESSAGE };
  }

  // ---- 申込レコード作成 ----
  const { amount, initialFee } = computeBankTransferAmount(target, {
    needsInitialFee,
  });
  const billingCycle =
    target.kind === "plan"
      ? target.billingCycle
      : (target.billingCycle ?? "monthly");

  const insert = await admin
    .from("bank_transfer_requests")
    .insert({
      user_id: user.id,
      target_kind: target.kind,
      plan_type: target.kind === "plan" ? target.planType : null,
      option_type: target.kind === "option" ? target.optionType : null,
      job_id: jobId,
      billing_cycle: billingCycle,
      amount,
      initial_fee: initialFee,
      status: "requested",
    })
    .select("id, created_at")
    .single();

  if (insert.error || !insert.data) {
    if (insert.error?.code === POSTGRES_UNIQUE_VIOLATION) {
      return { success: false, error: BANK_TRANSFER_REQUEST_PENDING_MESSAGE };
    }
    console.error("[requestBankTransferAction] insert failed", insert.error);
    return {
      success: false,
      error: "お申し込みの受付に失敗しました。しばらくしてから再度お試しください",
    };
  }

  const requestId = insert.data.id;
  const requestedAt = formatBillingDateTime(insert.data.created_at);
  const targetLabel = describeBankTransferTarget(target);

  // ---- メール 2 通（失敗しても申込は成立させる。送信完了は待つ） ----
  await sendRequestedEmails(admin, {
    userId: user.id,
    userEmail: userRow.email,
    requestId,
    requestedAt,
    targetLabel,
    amount,
    initialFee,
  });

  return { success: true, data: { requestId, targetLabel } };
}

async function sendRequestedEmails(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    userId: string;
    userEmail: string;
    requestId: string;
    requestedAt: string;
    targetLabel: string;
    amount: number;
    initialFee: number;
  },
): Promise<void> {
  // 申込者控え
  try {
    const recipient = await fetchBillingRecipient(admin, params.userId);
    if (recipient) {
      const tpl = bankTransferRequestedEmail({
        recipientName: recipient.name,
        targetLabel: params.targetLabel,
        requestedAt: params.requestedAt,
      });
      await sendEmail({ to: recipient.email, subject: tpl.subject, html: tpl.html });
    }
  } catch (err) {
    console.error("[requestBankTransferAction] user email failed", err);
  }

  // 運営宛（請求書送付依頼）
  try {
    const opsEmail = process.env.OPS_NOTIFICATION_EMAIL;
    if (!opsEmail) return;

    const { data: applicant } = await admin
      .from("users")
      .select("last_name, first_name")
      .eq("id", params.userId)
      .maybeSingle();
    const applicantName =
      `${applicant?.last_name ?? ""}${applicant?.first_name ?? ""}`.trim() ||
      "申込者";
    const companyName = await resolveApplicantCompanyName(admin, params.userId);
    const siteUrl = await resolveSiteUrl();

    const tpl = bankTransferRequestedOpsEmail({
      applicantName,
      companyName,
      applicantEmail: params.userEmail,
      requestedAt: params.requestedAt,
      targetLabel: params.targetLabel,
      amount: params.amount,
      initialFee: params.initialFee,
      requestId: params.requestId,
      siteUrl,
    });
    await sendEmail({ to: opsEmail, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.error("[requestBankTransferAction] ops email failed", err);
  }
}
