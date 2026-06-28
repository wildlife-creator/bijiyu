"use server";

import { headers } from "next/headers";

import { contactOpsNotificationEmail } from "@/lib/email/templates/contact-ops-notification";
import { contactReceiptEmail } from "@/lib/email/templates/contact-receipt";
import { sendEmail } from "@/lib/email/send-email";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  removeSupportAttachments,
  uploadSupportAttachments,
} from "@/lib/support/attachments";
import { resolveParticipantName } from "@/lib/utils/display-name";
import { formatDateTime } from "@/lib/utils/format-date";
import { contactSchema } from "@/lib/validations/contact";
import type { ActionResult } from "@/lib/types/action-result";

const MAX_SUBMISSIONS_PER_HOUR = 5;
const GENERIC_ERROR =
  "送信中にエラーが発生しました。しばらくしてから再度お試しください。";

export async function submitContactAction(
  formData: FormData,
): Promise<ActionResult> {
  // 1. FormData をパース（選択肢・テキストは文字列に正規化）
  const str = (key: string) => String(formData.get(key) ?? "");
  const raw = {
    companyName: str("companyName"),
    name: str("name"),
    phone: str("phone"),
    email: str("email"),
    address: str("address"),
    inquiryType: str("inquiryType"),
    purpose: str("purpose"),
    industry: str("industry"),
    projectDescription: str("projectDescription"),
    projectArea: str("projectArea"),
    videoConsultation: str("videoConsultation"),
    detail: str("detail"),
  };

  // 2. サーバー側 Zod 検証（許可リスト含む）
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError =
      parsed.error.issues[0]?.message ?? "入力内容を確認してください";
    return { success: false, error: firstError };
  }
  const input = parsed.data;

  // 3. ログイン中なら user_id をセッションから取得（FormData からは取らない＝なりすまし防止）
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  const admin = createAdminClient();

  // 4. レート制限: 同一メールの直近1時間が5件以上なら拒否（admin クライアントで集計）
  //    contacts の SELECT は admin のみ許可のため、通常クライアントでは常に0件になり機能しない
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("email", input.email)
    .gte("created_at", oneHourAgo);

  if (countError) {
    console.error("contact rate-limit count failed:", countError.message);
    return { success: false, error: GENERIC_ERROR };
  }
  if (count !== null && count >= MAX_SUBMISSIONS_PER_HOUR) {
    return {
      success: false,
      error: "送信回数の上限に達しました。しばらくしてから再度お試しください。",
    };
  }

  // 5. レコード保存（添付は空）→ アップロード → 添付パスを更新 の順で整合を保つ
  const { data: inserted, error: insertError } = await admin
    .from("contacts")
    .insert({
      user_id: userId,
      company_name: input.companyName,
      name: input.name,
      phone: input.phone,
      email: input.email,
      address: input.address || null,
      inquiry_type: input.inquiryType,
      purpose: input.purpose,
      industry: input.industry,
      project_description: input.projectDescription || null,
      project_area: input.projectArea || null,
      video_consultation: input.videoConsultation || null,
      detail: input.detail,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("contact insert failed:", insertError?.message);
    return { success: false, error: GENERIC_ERROR };
  }

  // 6. 添付アップロード（service role）。失敗時はレコードを削除して中断
  const files = formData.getAll("attachments") as File[];
  const uploaded = await uploadSupportAttachments(files, "contact");
  if (!uploaded.success) {
    await admin.from("contacts").delete().eq("id", inserted.id);
    return { success: false, error: uploaded.error };
  }

  // 7. 添付があれば添付パスを更新。失敗時はファイル削除＋レコード削除で中断
  if (uploaded.paths.length > 0) {
    const { error: updateError } = await admin
      .from("contacts")
      .update({ attachments: uploaded.paths })
      .eq("id", inserted.id);

    if (updateError) {
      await removeSupportAttachments(uploaded.paths);
      await admin.from("contacts").delete().eq("id", inserted.id);
      console.error("contact attachment update failed:", updateError.message);
      return { success: false, error: GENERIC_ERROR };
    }
  }

  // 8. §7.1.A 送信者控え + §7.1.B 運営通知を fire-and-forget で並列送信
  //    失敗してもレコードはロールバックしない（メール失敗 ≠ 受付失敗）。
  //    日時は INSERT 直後にサーバー側で stamp（DB の created_at は本文表示で再 SELECT しない）。
  const receivedAt = formatDateTime(new Date().toISOString());

  // §7.1.A 送信者控え
  const receipt = contactReceiptEmail({
    name: input.name,
    inquiryType: input.inquiryType,
    detail: input.detail,
    receivedAt,
  });
  void sendEmail({ to: input.email, subject: receipt.subject, html: receipt.html }).catch(
    (err) => {
      console.error("[submitContactAction] receipt email failed:", err);
    },
  );

  // §7.1.B 運営通知（ログイン中なら memberDisplayName を解決）
  const opsEmail = process.env.OPS_NOTIFICATION_EMAIL;
  if (opsEmail) {
    let loginStatus:
      | { kind: "logged_in"; memberDisplayName: string }
      | { kind: "anonymous" } = { kind: "anonymous" };
    if (userId) {
      const [userRes, profileRes] = await Promise.all([
        admin
          .from("users")
          .select("last_name, first_name, deleted_at")
          .eq("id", userId)
          .maybeSingle(),
        admin
          .from("client_profiles")
          .select("display_name")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      const memberDisplayName = resolveParticipantName({
        displayName: profileRes.data?.display_name ?? null,
        lastName: userRes.data?.last_name ?? null,
        firstName: userRes.data?.first_name ?? null,
        deletedAt: userRes.data?.deleted_at ?? null,
      });
      loginStatus = { kind: "logged_in", memberDisplayName };
    }

    const hdrs = await headers();
    const host = hdrs.get("host");
    const proto = hdrs.get("x-forwarded-proto") ?? "http";
    const siteUrl = host
      ? `${proto}://${host}`
      : (process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000");

    const ops = contactOpsNotificationEmail({
      companyName: input.companyName,
      name: input.name,
      phone: input.phone,
      email: input.email,
      inquiryType: input.inquiryType,
      receivedAt,
      loginStatus,
      siteUrl,
      contactId: inserted.id,
    });
    void sendEmail({ to: opsEmail, subject: ops.subject, html: ops.html }).catch(
      (err) => {
        console.error("[submitContactAction] ops email failed:", err);
      },
    );
  }

  return { success: true };
}
