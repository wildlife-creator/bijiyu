import { Resend } from "resend";

const FROM_ADDRESS = process.env.EMAIL_FROM || "noreply@bijiyu.com";

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[sendEmail] RESEND_API_KEY is not set. Emails will be skipped.");
    return null;
  }
  return new Resend(apiKey);
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailParams) {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.warn("[sendEmail] Skipping email (no API key):", { to, subject });
      return { success: true as const };
    }

    const { data, error } = await resend.emails.send({
      from: `ビジ友 <${FROM_ADDRESS}>`,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("[sendEmail] Failed to send email:", error);
      return { success: false as const, error: error.message };
    }

    return { success: true as const, data };
  } catch (err) {
    console.error("[sendEmail] Unexpected error:", err);
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
