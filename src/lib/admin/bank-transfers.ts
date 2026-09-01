import {
  BANK_TRANSFER_STATUS_LABELS,
  describeBankTransferTarget,
  targetFromRequestRow,
  type BankTransferRequestStatus,
} from "@/lib/billing/bank-transfer";
import type { BillingCycle, PaymentMethod } from "@/lib/constants/plans";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ADM-025 銀行振込申込一覧 / ADM-026 銀行振込申込詳細 のクエリロジック（P2）。
 *
 * - 申込レコード（bank_transfer_requests）を新着順で 20 件ページング。状態で絞込
 * - 申込者情報（氏名・メール・会社名）は user_id をまとめてバッチ取得（N+1 禁止）
 * - 表示ラベル（対象・状態）は pure 関数（bank-transfer.ts）に委譲
 */

export const BANK_TRANSFER_PAGE_SIZE = 20;

export const BANK_TRANSFER_STATUS_FILTERS: readonly BankTransferRequestStatus[] = [
  "requested",
  "invoiced",
  "paid",
  "cancelled",
];

export function isBankTransferStatus(value: string | undefined): value is BankTransferRequestStatus {
  return !!value && (BANK_TRANSFER_STATUS_FILTERS as readonly string[]).includes(value);
}

export interface BankTransferListRow {
  id: string;
  userId: string;
  applicantName: string;
  companyName: string | null;
  email: string;
  targetLabel: string;
  amount: number;
  initialFee: number;
  status: BankTransferRequestStatus;
  statusLabel: string;
  createdAt: string;
}

export async function fetchBankTransferRequestList(filter: {
  status?: BankTransferRequestStatus;
  page: number;
}): Promise<{ rows: BankTransferListRow[]; totalCount: number }> {
  const admin = createAdminClient();
  const offset = (Math.max(1, filter.page) - 1) * BANK_TRANSFER_PAGE_SIZE;

  let query = admin
    .from("bank_transfer_requests")
    .select(
      "id, user_id, target_kind, plan_type, option_type, billing_cycle, amount, initial_fee, status, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + BANK_TRANSFER_PAGE_SIZE - 1);
  if (filter.status) {
    query = query.eq("status", filter.status);
  }
  const { data, count, error } = await query;
  if (error || !data) {
    return { rows: [], totalCount: 0 };
  }

  const userIds = Array.from(new Set(data.map((r) => r.user_id)));
  const { users, companies } = await fetchApplicants(admin, userIds);

  const rows: BankTransferListRow[] = data.map((r) => {
    const u = users.get(r.user_id);
    const target = targetFromRequestRow(r);
    return {
      id: r.id,
      userId: r.user_id,
      applicantName:
        `${u?.last_name ?? ""}${u?.first_name ?? ""}`.trim() || "未設定",
      companyName: companies.get(r.user_id) ?? null,
      email: u?.email ?? "",
      targetLabel: target ? describeBankTransferTarget(target) : "（不明）",
      amount: r.amount,
      initialFee: r.initial_fee,
      status: r.status,
      statusLabel: BANK_TRANSFER_STATUS_LABELS[r.status],
      createdAt: r.created_at,
    };
  });

  return { rows, totalCount: count ?? rows.length };
}

export interface BankTransferDetail {
  id: string;
  userId: string;
  applicant: {
    name: string;
    email: string;
    companyName: string | null;
    role: string;
    isDeleted: boolean;
  };
  targetKind: "plan" | "option";
  planType: string | null;
  optionType: string | null;
  jobId: string | null;
  jobTitle: string | null;
  billingCycle: BillingCycle;
  targetLabel: string;
  amount: number;
  initialFee: number;
  status: BankTransferRequestStatus;
  statusLabel: string;
  createdAt: string;
  invoicedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  startDate: string | null;
  adminMemo: string | null;
  handledByName: string | null;
  /** 申込者の現在の有効プラン（D8: Stripe 契約中なら期間終了日を開始日に） */
  currentSubscription: {
    planType: string;
    status: string;
    paymentMethod: PaymentMethod;
    currentPeriodEnd: string | null;
  } | null;
  /** 有効化で作成された契約行の期限（paid のとき） */
  activatedPeriodEnd: string | null;
}

export async function fetchBankTransferRequestDetail(
  id: string,
): Promise<BankTransferDetail | null> {
  const admin = createAdminClient();
  const { data: r } = await admin
    .from("bank_transfer_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!r) return null;

  const [{ data: user }, { data: profile }, { data: sub }, job, handler, activated] =
    await Promise.all([
      admin
        .from("users")
        .select("last_name, first_name, email, role, deleted_at")
        .eq("id", r.user_id)
        .maybeSingle(),
      admin
        .from("client_profiles")
        .select("display_name")
        .eq("user_id", r.user_id)
        .maybeSingle(),
      admin
        .from("subscriptions")
        .select("plan_type, status, payment_method, current_period_end")
        .eq("user_id", r.user_id)
        .in("status", ["active", "past_due"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      r.job_id
        ? admin.from("jobs").select("title").eq("id", r.job_id).maybeSingle()
        : Promise.resolve({ data: null }),
      r.handled_by
        ? admin
            .from("users")
            .select("last_name, first_name")
            .eq("id", r.handled_by)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      r.activated_subscription_id
        ? admin
            .from("subscriptions")
            .select("current_period_end")
            .eq("id", r.activated_subscription_id)
            .maybeSingle()
        : r.activated_option_subscription_id
          ? admin
              .from("option_subscriptions")
              .select("end_date")
              .eq("id", r.activated_option_subscription_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
    ]);

  const target = targetFromRequestRow(r);
  const activatedRow = activated.data as
    | { current_period_end?: string | null; end_date?: string | null }
    | null;

  return {
    id: r.id,
    userId: r.user_id,
    applicant: {
      name: `${user?.last_name ?? ""}${user?.first_name ?? ""}`.trim() || "未設定",
      email: user?.email ?? "",
      companyName: profile?.display_name ?? null,
      role: user?.role ?? "",
      isDeleted: !!user?.deleted_at,
    },
    targetKind: r.target_kind,
    planType: r.plan_type,
    optionType: r.option_type,
    jobId: r.job_id,
    jobTitle: job.data?.title ?? null,
    billingCycle: r.billing_cycle,
    targetLabel: target ? describeBankTransferTarget(target) : "（不明）",
    amount: r.amount,
    initialFee: r.initial_fee,
    status: r.status,
    statusLabel: BANK_TRANSFER_STATUS_LABELS[r.status],
    createdAt: r.created_at,
    invoicedAt: r.invoiced_at,
    paidAt: r.paid_at,
    cancelledAt: r.cancelled_at,
    startDate: r.start_date,
    adminMemo: r.admin_memo,
    handledByName: handler.data
      ? `${handler.data.last_name ?? ""}${handler.data.first_name ?? ""}`.trim() || null
      : null,
    currentSubscription: sub
      ? {
          planType: sub.plan_type,
          status: sub.status,
          paymentMethod: sub.payment_method,
          currentPeriodEnd: sub.current_period_end,
        }
      : null,
    activatedPeriodEnd:
      activatedRow?.current_period_end ?? activatedRow?.end_date ?? null,
  };
}

/** 発注者詳細（ADM-004）で使う: 当該ユーザーの申込一覧（新着順、全状態）。 */
export async function fetchBankTransferRequestsForUser(userId: string): Promise<
  Array<{
    id: string;
    targetLabel: string;
    status: BankTransferRequestStatus;
    statusLabel: string;
    createdAt: string;
  }>
> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("bank_transfer_requests")
    .select("id, target_kind, plan_type, option_type, billing_cycle, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((r) => {
    const target = targetFromRequestRow(r);
    return {
      id: r.id,
      targetLabel: target ? describeBankTransferTarget(target) : "（不明）",
      status: r.status,
      statusLabel: BANK_TRANSFER_STATUS_LABELS[r.status],
      createdAt: r.created_at,
    };
  });
}

async function fetchApplicants(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
): Promise<{
  users: Map<string, { last_name: string | null; first_name: string | null; email: string }>;
  companies: Map<string, string | null>;
}> {
  const users = new Map<
    string,
    { last_name: string | null; first_name: string | null; email: string }
  >();
  const companies = new Map<string, string | null>();
  if (userIds.length === 0) return { users, companies };

  const [{ data: userRows }, { data: profileRows }] = await Promise.all([
    admin.from("users").select("id, last_name, first_name, email").in("id", userIds),
    admin.from("client_profiles").select("user_id, display_name").in("user_id", userIds),
  ]);
  for (const u of userRows ?? []) {
    users.set(u.id, { last_name: u.last_name, first_name: u.first_name, email: u.email });
  }
  for (const p of profileRows ?? []) {
    companies.set(p.user_id, p.display_name);
  }
  return { users, companies };
}
