"use server";

import type Stripe from "stripe";
import { z } from "zod";

import { ensureStripeCustomer } from "@/lib/billing/ensure-stripe-customer";
import { readFeeCookie, FEE_COOKIE_NAME } from "@/lib/billing/fee-cookie";
import type { OptionType } from "@/lib/billing/options";
import { getStripeClient } from "@/lib/billing/stripe";
import { PAID_PLAN_TYPES, type PaidPlanType } from "@/lib/constants/plans";
import { getActiveOrganizationContext } from "@/lib/organization/active-org-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types/action-result";
import { cookies } from "next/headers";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const planInputSchema = z.object({
  type: z.literal("plan"),
  planType: z.enum(PAID_PLAN_TYPES),
});

const compensationOptionInputSchema = z.object({
  type: z.literal("option"),
  optionType: z.enum(["compensation_5000", "compensation_9800"]),
});

const urgentOptionInputSchema = z.object({
  type: z.literal("option"),
  optionType: z.literal("urgent"),
  jobId: z.string().uuid(),
});

const videoOptionInputSchema = z.object({
  type: z.literal("option"),
  optionType: z.literal("video"),
});

// 職場紹介動画掲載（発注者向け新規オプション、video-display Task 4.1）
const videoWorkplaceOptionInputSchema = z.object({
  type: z.literal("option"),
  optionType: z.literal("video_workplace"),
});

const startCheckoutInputSchema = z.union([
  planInputSchema,
  compensationOptionInputSchema,
  urgentOptionInputSchema,
  videoOptionInputSchema,
  videoWorkplaceOptionInputSchema,
]);

export type StartCheckoutInput = z.infer<typeof startCheckoutInputSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function priceIdForPlan(planType: PaidPlanType): string {
  switch (planType) {
    case "individual":
      return process.env.STRIPE_PRICE_INDIVIDUAL ?? "";
    case "small":
      return process.env.STRIPE_PRICE_SMALL ?? "";
    case "corporate":
      return process.env.STRIPE_PRICE_CORPORATE ?? "";
    case "corporate_premium":
      return process.env.STRIPE_PRICE_CORPORATE_PREMIUM ?? "";
  }
}

function priceIdForOption(optionType: OptionType): string {
  switch (optionType) {
    case "compensation_5000":
      return process.env.STRIPE_PRICE_COMPENSATION_5000 ?? "";
    case "compensation_9800":
      return process.env.STRIPE_PRICE_COMPENSATION_9800 ?? "";
    case "urgent":
      return process.env.STRIPE_PRICE_URGENT ?? "";
    case "video":
      return process.env.STRIPE_PRICE_VIDEO ?? "";
    case "video_workplace":
      return process.env.STRIPE_PRICE_VIDEO_WORKPLACE ?? "";
  }
}

function buildSuccessUrl(input: StartCheckoutInput): string {
  const base = appUrl();
  if (input.type === "plan") {
    // 全プラン共通で CLI-021 setup モードに遷移。
    // 法人プラン: 社名（display_name）必須
    // 個人/小規模プラン: display_name 任意（スキップ可）
    return `${base}/mypage/client-profile/edit?setup=true`;
  }
  switch (input.optionType) {
    case "compensation_5000":
    case "compensation_9800":
      return `${base}/billing?option_success=compensation`;
    case "urgent":
      return `${base}/billing?option_success=urgent`;
    case "video":
      return `${base}/billing?option_success=video`;
    case "video_workplace":
      return `${base}/billing?option_success=video_workplace`;
  }
}

// ---------------------------------------------------------------------------
// Server Action
// ---------------------------------------------------------------------------

export async function startCheckoutAction(
  rawInput: StartCheckoutInput,
): Promise<ActionResult<{ checkoutUrl: string }>> {
  // 1. Input validation
  const parsed = startCheckoutInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: "入力内容を確認してください" };
  }
  const input = parsed.data;

  // 2. Authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "ログインしてください" };
  }

  // 3. Load user record (role + email)
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("id, role, email")
    .eq("id", user.id)
    .single();
  if (userError || !userRow) {
    return { success: false, error: "ユーザー情報の取得に失敗しました" };
  }

  // 4. Role check — staff cannot purchase anything
  if (userRow.role === "staff") {
    return {
      success: false,
      error: "担当者アカウントではプランの変更はできません",
    };
  }
  if (userRow.role === "admin") {
    return {
      success: false,
      error: "管理者アカウントではプランの変更はできません",
    };
  }

  const admin = createAdminClient();
  const stripe = getStripeClient();

  // 5. Pre-flight checks per type
  if (input.type === "plan") {
    // 二重課金防止: active or past_due があれば拒否
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
          "すでにご契約中のプランがあります。プラン変更ボタンからお手続きください",
      };
    }
  } else {
    // Option-specific checks
    if (
      input.optionType === "compensation_5000" ||
      input.optionType === "compensation_9800"
    ) {
      // 補償オプション（受注者向け給与未払い保険）は contractor / client(owner)
      // のいずれも購入可。staff / admin は global ガード（step 4）で既に拒否
      // されているためここでは何もしない。基本プラン active の要件はない
      // （無料 contractor も購入可能）
      // 排他制御: 既に1つの補償が active なら拒否
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
    } else if (input.optionType === "urgent") {
      // 案件オーナー/組織メンバー確認 + 同案件で active urgent がないこと
      // - 個人プラン: owner_id === user.id
      // - 法人プラン: 自分の組織(organization_id)の案件であればOK
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
    } else if (input.optionType === "video_workplace") {
      // 職場紹介動画掲載は発注者プラン加入者のみ（要件 7.3）。
      // active な発注者プラン（individual/small/corporate/corporate_premium）が
      // 無ければ拒否。past_due は active ではないため自動的に弾かれる。
      // staff/admin は step 4 のグローバルロールガードで既に拒否済み。
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
  }

  // 6. Initial fee detection
  let needsInitialFee = false;
  if (input.type === "plan") {
    const anySub = await admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);
    const isFirstPurchase = (anySub.data?.length ?? 0) === 0;
    if (isFirstPurchase) {
      // Check fee=free Cookie
      const cookieStore = await cookies();
      const feeCookie = await readFeeCookie(
        cookieStore.get(FEE_COOKIE_NAME)?.value,
      );
      if (!feeCookie?.feeExempt) {
        needsInitialFee = true;
      }
    }
  }

  // 7. Ensure Stripe Customer
  let customerId: string;
  try {
    const ensured = await ensureStripeCustomer(admin, stripe, user.id);
    customerId = ensured.stripeCustomerId;
  } catch (err) {
    console.error("[startCheckoutAction] ensureStripeCustomer failed", err);
    return {
      success: false,
      error: "決済準備に失敗しました。しばらくしてから再度お試しください",
    };
  }

  // 7.5. Stripe API-level duplicate guard
  // DB check (step 5) can miss subscriptions when webhooks are delayed.
  // Query Stripe directly as the authoritative second line of defence.
  //
  // 補償オプション（受注者向け給与未払い保険）は basic plan とは独立した
  // 別契約で、metadata.type='option' を持つ。basic plan の二重契約のみを
  // 防ぎたいので、metadata.type='plan' のサブスクが既にあるときだけ拒否する。
  // metadata 無しのレガシーサブスクは含めない（test mode では無視可、本番
  // にも該当する旧データは存在しない前提）。
  if (input.type === "plan") {
    try {
      const stripeSubs = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
      });
      const hasActiveBasicPlan = stripeSubs.data.some(
        (s) => s.metadata?.type === "plan",
      );
      if (hasActiveBasicPlan) {
        return {
          success: false,
          error:
            "すでにご契約中のプランがあります。プラン変更ボタンからお手続きください",
        };
      }
    } catch (err) {
      console.error(
        "[startCheckoutAction] Stripe subscription check failed",
        err,
      );
      return {
        success: false,
        error: "決済準備に失敗しました。しばらくしてから再度お試しください",
      };
    }
  }

  // 8. Build line_items + Checkout Session
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  if (input.type === "plan") {
    const planPrice = priceIdForPlan(input.planType);
    if (!planPrice) {
      return {
        success: false,
        error: "プランの価格設定が見つかりません。管理者にお問い合わせください",
      };
    }
    lineItems.push({ price: planPrice, quantity: 1 });
    if (needsInitialFee) {
      const initialFeePrice = process.env.STRIPE_PRICE_INITIAL_FEE;
      if (!initialFeePrice) {
        return {
          success: false,
          error:
            "初期費用の価格設定が見つかりません。管理者にお問い合わせください",
        };
      }
      lineItems.push({ price: initialFeePrice, quantity: 1 });
    }
  } else {
    const optionPrice = priceIdForOption(input.optionType);
    if (!optionPrice) {
      return {
        success: false,
        error:
          "オプションの価格設定が見つかりません。管理者にお問い合わせください",
      };
    }
    lineItems.push({ price: optionPrice, quantity: 1 });
  }

  // Determine mode
  let mode: Stripe.Checkout.SessionCreateParams.Mode;
  if (input.type === "plan") {
    mode = "subscription";
  } else if (
    input.optionType === "compensation_5000" ||
    input.optionType === "compensation_9800"
  ) {
    mode = "subscription";
  } else {
    mode = "payment";
  }

  // Build metadata
  const metadata: Record<string, string> = {
    type: input.type,
    user_id: user.id,
  };
  if (input.type === "plan") {
    metadata.plan_type = input.planType;
  } else {
    metadata.option_type = input.optionType;
    if (input.optionType === "urgent") {
      metadata.job_id = input.jobId;
    }
  }

  // For subscription mode, also forward metadata onto the subscription so
  // future customer.subscription.* events carry it through.
  const subscriptionData =
    mode === "subscription" ? { metadata } : undefined;

  // 9. Create the Checkout Session
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode,
      customer: customerId,
      line_items: lineItems,
      metadata,
      subscription_data: subscriptionData,
      success_url: buildSuccessUrl(input),
      cancel_url: `${appUrl()}/billing`,
      // Allow promotion codes for future flexibility (no harm in test mode)
      allow_promotion_codes: false,
    });
  } catch (err) {
    console.error("[startCheckoutAction] stripe.checkout.sessions.create failed", err);
    return {
      success: false,
      error: "決済画面の作成に失敗しました。しばらくしてから再度お試しください",
    };
  }

  if (!session.url) {
    return {
      success: false,
      error: "決済URLが取得できませんでした。再度お試しください",
    };
  }

  return { success: true, data: { checkoutUrl: session.url } };
}
