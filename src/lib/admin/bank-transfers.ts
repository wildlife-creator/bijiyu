import {
  BANK_TRANSFER_INQUIRY_TYPE,
  bankTransferPlanLabel,
} from "@/lib/constants/contact-options";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ADM-025 銀行振込お問い合わせ一覧 のクエリロジック（P12）。
 *
 * - contacts のうち種類が「お支払い方法（銀行振込）について」のものを新着順で 20 件ページング
 * - ステータスは持たない（対応状況はユーザー詳細の「銀行振込」枠で分かる）
 * - 各行から飛ぶ先（発注者詳細 / ユーザー詳細）を決めるため、送信者の role と退会有無を
 *   user_id でまとめてバッチ取得（N+1 禁止）
 */

export const BANK_TRANSFER_PAGE_SIZE = 20;

export interface BankTransferContactRow {
  id: string;
  userId: string | null;
  companyName: string;
  name: string;
  email: string;
  /** 希望プランの表示ラベル（未選択の旧データは null） */
  planLabel: string | null;
  createdAt: string;
  /** 送信者の詳細ページ。退会済み・不明なら users（ADM-009）に倒す */
  userDetailHref: string | null;
  userDetailLabel: "発注者詳細" | "ユーザー詳細";
}

export async function fetchBankTransferContactList(filter: {
  keyword?: string;
  page: number;
}): Promise<{ rows: BankTransferContactRow[]; totalCount: number }> {
  const admin = createAdminClient();
  const offset = (Math.max(1, filter.page) - 1) * BANK_TRANSFER_PAGE_SIZE;
  const keyword = (filter.keyword ?? "").trim();

  let query = admin
    .from("contacts")
    .select("id, user_id, company_name, name, email, bank_transfer_plan, created_at", {
      count: "exact",
    })
    .eq("inquiry_type", BANK_TRANSFER_INQUIRY_TYPE);
  if (keyword) {
    query = query.or(
      `company_name.ilike.%${keyword}%,name.ilike.%${keyword}%,email.ilike.%${keyword}%`,
    );
  }
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + BANK_TRANSFER_PAGE_SIZE - 1);
  if (error || !data) {
    return { rows: [], totalCount: 0 };
  }

  const userIds = Array.from(
    new Set(data.map((r) => r.user_id).filter((v): v is string => !!v)),
  );
  const users = new Map<string, { role: string; deleted_at: string | null }>();
  if (userIds.length > 0) {
    const { data: userRows } = await admin
      .from("users")
      .select("id, role, deleted_at")
      .in("id", userIds);
    for (const u of userRows ?? []) {
      users.set(u.id, { role: u.role, deleted_at: u.deleted_at });
    }
  }

  const rows: BankTransferContactRow[] = data.map((r) => {
    const u = r.user_id ? users.get(r.user_id) : undefined;
    const isClient = u?.role === "client" && !u.deleted_at;
    return {
      id: r.id,
      userId: r.user_id,
      companyName: r.company_name,
      name: r.name,
      email: r.email,
      planLabel: bankTransferPlanLabel(r.bank_transfer_plan),
      createdAt: r.created_at,
      userDetailHref: r.user_id
        ? isClient
          ? `/admin/clients/${r.user_id}`
          : `/admin/users/${r.user_id}`
        : null,
      userDetailLabel: isClient ? "発注者詳細" : "ユーザー詳細",
    };
  });

  return { rows, totalCount: count ?? rows.length };
}
