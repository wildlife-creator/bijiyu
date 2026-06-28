import { headers } from "next/headers";

import { verificationReceivedEmail } from "@/lib/email/templates/verification-received";
import { verificationReceivedOpsEmail } from "@/lib/email/templates/verification-received-ops";
import { sendEmail } from "@/lib/email/send-email";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils/format-date";

interface SendVerificationEmailsParams {
  /** 申請者 user.id（admin client で users から email / 姓名を引く） */
  userId: string;
  /** 'identity' → 本人確認 / 'ccus' → CCUS登録 */
  documentType: "identity" | "ccus";
  /** identity_verifications.id（運営通知の deep link に埋め込む） */
  verificationId: string;
  /** identity_verifications.created_at の ISO 文字列。null なら現在時刻で stamp */
  appliedAtIso: string | null;
}

/**
 * §4.1 申請者宛控え + §4.4 運営宛通知を fire-and-forget で並列送信する共通ヘルパー。
 *
 * `submitIdentityAction` / `submitCcusAction` 末尾から呼び出す。両 Action が
 * 同じ宛先解決 + 件名規約 + URL 構築を共有するため重複コードを 1 ファイルに集約する。
 *
 * すべての失敗は console.error で握り潰す（メール失敗 ≠ 申請失敗）。Server Action は
 * 申請 INSERT 成功時点で `success: true` を返す。
 */
export async function sendVerificationEmails({
  userId,
  documentType,
  verificationId,
  appliedAtIso,
}: SendVerificationEmailsParams): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: userRow } = await admin
      .from("users")
      .select("email, last_name, first_name")
      .eq("id", userId)
      .maybeSingle();

    const recipientEmail = userRow?.email ?? null;
    const lastName = (userRow?.last_name ?? "").trim();
    const firstName = (userRow?.first_name ?? "").trim();
    const fullName = `${lastName}${firstName}` || "ご担当者";
    // 宛名は姓のみ (姓が空なら fullName フォールバック)。spec §4.1 例文「田中 様」準拠
    const recipientName = lastName || fullName;
    const appliedAt = formatDateTime(appliedAtIso ?? new Date().toISOString());

    // §4.1 申請者宛控え
    if (recipientEmail) {
      const { subject, html } = verificationReceivedEmail({
        recipientName,
        documentType,
        appliedAt,
      });
      void sendEmail({ to: recipientEmail, subject, html }).catch((err) => {
        console.error("[sendVerificationEmails] receipt email failed:", err);
      });
    }

    // §4.4 運営宛通知
    const opsEmail = process.env.OPS_NOTIFICATION_EMAIL;
    if (opsEmail) {
      const hdrs = await headers();
      const host = hdrs.get("host");
      const proto = hdrs.get("x-forwarded-proto") ?? "http";
      const siteUrl = host
        ? `${proto}://${host}`
        : (process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000");

      const { subject, html } = verificationReceivedOpsEmail({
        applicantName: fullName,
        documentType,
        appliedAt,
        siteUrl,
        verificationId,
      });
      void sendEmail({ to: opsEmail, subject, html }).catch((err) => {
        console.error("[sendVerificationEmails] ops email failed:", err);
      });
    }
  } catch (err) {
    console.error("[sendVerificationEmails] failed:", err);
  }
}
