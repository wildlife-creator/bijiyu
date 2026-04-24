import { Resend } from "resend";

const FROM_ADDRESS = process.env.EMAIL_FROM || "noreply@bijiyu.com";

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new Resend(apiKey);
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * dev 環境（RESEND_API_KEY 未設定）で呼ばれた時の fallback。
 * 構造化ログに To / Subject / HTML 冒頭 200 字を出して、
 * 完全 HTML は `/tmp/bijiyu-dev-mail/{timestamp}-{to}.html` に書き出す。
 * → 手動テストで「どの宛先にどの内容が送られるはずだったか」を目視可能。
 */
async function devLocalEmailFallback({ to, subject, html }: SendEmailParams) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const dir = "/tmp/bijiyu-dev-mail";
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeTo = to.replace(/[^a-zA-Z0-9.@_-]/g, "_");
  const filename = `${ts}-${safeTo}.html`;
  const fullPath = join(dir, filename);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, html, "utf8");
    console.info(
      `[sendEmail:dev] ✉️  to=${to} subject="${subject}" html-preview="${html.slice(0, 200).replace(/\s+/g, " ")}..." saved=${fullPath}`,
    );
  } catch (err) {
    // ファイル書き込み失敗しても本体処理には影響させない
    console.warn(
      `[sendEmail:dev] failed to save mail preview: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.info(
      `[sendEmail:dev] ✉️  to=${to} subject="${subject}" (file save failed)`,
    );
  }
}

export async function sendEmail({ to, subject, html }: SendEmailParams) {
  try {
    const resend = getResendClient();
    if (!resend) {
      await devLocalEmailFallback({ to, subject, html });
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
