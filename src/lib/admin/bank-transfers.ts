import {
  BANK_TRANSFER_INQUIRY_TYPE,
  bankTransferPlanLabel,
} from "@/lib/constants/contact-options";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ADM-025 銀行振込お問い合わせ一覧 のクエリロジック。
 *
 * - contacts のうち種類が「お支払い方法（銀行振込）について」のものを新着順で 20 件ページング
 * - ステータスは持たない（対応状況は ADM-009 ユーザー詳細の「銀行振込」枠で分かる）
 * - 各行のリンクは「お問い合わせ詳細」（ADM-017）のみ。契約の操作は ADM-009 ユーザー詳細で行う
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

  const rows: BankTransferContactRow[] = data.map((r) => ({
    id: r.id,
    userId: r.user_id,
    companyName: r.company_name,
    name: r.name,
    email: r.email,
    planLabel: bankTransferPlanLabel(r.bank_transfer_plan),
    createdAt: r.created_at,
  }));

  return { rows, totalCount: count ?? rows.length };
}
