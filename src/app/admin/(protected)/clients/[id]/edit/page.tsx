import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { MemoEditForm } from "./memo-edit-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * ADM-005: 発注者アカウント編集（管理者メモのみ）。
 * デザインカンプ: design-assets/screens/ADM-005.png
 * （カンプの急募オプションチェックボックスは仕様確定で編集対象外のため置かない。
 *   加入状態の確認は ADM-004 の閲覧表示で行う = REQ-ADM-005）
 */
export default async function AdminClientEditPage({ params }: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: target } = await admin
    .from("users")
    .select("id, role, deleted_at")
    .eq("id", id)
    .maybeSingle();

  // 退会済みは編集不可（ADM-004 側でボタン非表示・URL 直叩きもブロック）
  if (!target || target.role !== "client" || target.deleted_at) notFound();

  const { data: profile } = await admin
    .from("client_profiles")
    .select("admin_memo")
    .eq("user_id", id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        発注者 アカウント編集
      </h1>
      <MemoEditForm userId={id} initialMemo={profile?.admin_memo ?? ""} />
    </div>
  );
}
