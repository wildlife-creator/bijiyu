"use server";

import { randomUUID } from "crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  removeSupportAttachments,
  uploadSupportAttachments,
} from "@/lib/support/attachments";
import { troubleReportSchema } from "@/lib/validations/trouble";
import type { ActionResult } from "@/lib/types/action-result";

const MAX_SUBMISSIONS_PER_HOUR = 5;
const GENERIC_ERROR =
  "送信中にエラーが発生しました。しばらくしてから再度お試しください。";

export async function submitTroubleReportAction(
  formData: FormData,
): Promise<ActionResult> {
  // 1. 認証必須（middleware と二重防御）。未ログインは拒否
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "ログインが必要です" };
  }

  // 2. FormData パース + サーバー側 Zod 検証
  const str = (key: string) => String(formData.get(key) ?? "");
  const raw = {
    reporterName: str("reporterName"),
    counterpartyName: str("counterpartyName"),
    email: str("email"),
    category: str("category"),
    content: str("content"),
  };
  const parsed = troubleReportSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError =
      parsed.error.issues[0]?.message ?? "入力内容を確認してください";
    return { success: false, error: firstError };
  }
  const input = parsed.data;

  const admin = createAdminClient();

  // 3. 連投防止: 同一ユーザーの直近1時間が5件以上なら拒否（admin クライアントで集計）
  //    trouble_reports の SELECT は admin のみ許可のため、通常クライアントでは集計できない
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from("trouble_reports")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", oneHourAgo);

  if (countError) {
    console.error("trouble rate-limit count failed:", countError.message);
    return { success: false, error: GENERIC_ERROR };
  }
  if (count !== null && count >= MAX_SUBMISSIONS_PER_HOUR) {
    return {
      success: false,
      error: "送信回数の上限に達しました。しばらくしてから再度お試しください。",
    };
  }

  // 4. レコード保存（添付は空）。INSERT は通常クライアントで RLS（本人 WITH CHECK）を効かせる。
  //    SELECT が admin 限定のため RETURNING は使えず、id はサーバーで採番する
  const reportId = randomUUID();
  const { error: insertError } = await supabase.from("trouble_reports").insert({
    id: reportId,
    user_id: user.id,
    reporter_name: input.reporterName,
    counterparty_name: input.counterpartyName,
    email: input.email,
    category: input.category || null,
    content: input.content,
  });

  if (insertError) {
    console.error("trouble insert failed:", insertError.message);
    return { success: false, error: GENERIC_ERROR };
  }

  // 5. 添付アップロード（service role）。失敗時はレコードを削除して中断
  //    UPDATE/DELETE は一般ユーザー不許可のため、削除・添付更新は admin クライアント
  const files = formData.getAll("attachments") as File[];
  const uploaded = await uploadSupportAttachments(files, `trouble/${user.id}`);
  if (!uploaded.success) {
    await admin.from("trouble_reports").delete().eq("id", reportId);
    return { success: false, error: uploaded.error };
  }

  // 6. 添付があれば添付パスを更新。失敗時はファイル削除＋レコード削除で中断
  if (uploaded.paths.length > 0) {
    const { error: updateError } = await admin
      .from("trouble_reports")
      .update({ attachments: uploaded.paths })
      .eq("id", reportId);

    if (updateError) {
      await removeSupportAttachments(uploaded.paths);
      await admin.from("trouble_reports").delete().eq("id", reportId);
      console.error("trouble attachment update failed:", updateError.message);
      return { success: false, error: GENERIC_ERROR };
    }
  }

  return { success: true };
}
