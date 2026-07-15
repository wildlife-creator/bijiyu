import { Resend } from "resend";

const FROM_ADDRESS = process.env.EMAIL_FROM || "noreply@bijiyuu.net";

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
 * 加えて同 prefix の `.json` sidecar に `{ to, subject, sentAt }` を書く
 * → 件名 prefix（「【ビジ友 運営】」等）の runtime 監査で参照できる土台。
 * → 手動テストで「どの宛先にどの内容が送られるはずだったか」を目視可能。
 */
async function devLocalEmailFallback({ to, subject, html }: SendEmailParams) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const dir = "/tmp/bijiyu-dev-mail";
  const sentAt = new Date().toISOString();
  const ts = sentAt.replace(/[:.]/g, "-");
  const safeTo = to.replace(/[^a-zA-Z0-9.@_-]/g, "_");
  const htmlPath = join(dir, `${ts}-${safeTo}.html`);
  const jsonPath = join(dir, `${ts}-${safeTo}.json`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(htmlPath, html, "utf8");
    await writeFile(
      jsonPath,
      JSON.stringify({ to, subject, sentAt }, null, 2),
      "utf8",
    );
    console.info(
      `[sendEmail:dev] ✉️  to=${to} subject="${subject}" html-preview="${html.slice(0, 200).replace(/\s+/g, " ")}..." saved=${htmlPath}`,
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

// Resend の送信レートは既定 2 リクエスト/秒。組織メンバー全員宛の broadcast
// (`Promise.all` で並列 send) は 3 通目以降が `rate_limit_exceeded` で黙って
// 落ちる（2026-07-15 staging 実例: 3 名の組織で代理スタッフ宛だけ届かず）。
// 対策は二段:
//   1. 同一インスタンス内の送信をモジュール内キューで直列化し、最小間隔を空ける
//   2. それでも 429 が返ったら（別インスタンスとの競合等）待って再試行する
const MIN_SEND_INTERVAL_MS = 600;
const RATE_LIMIT_RETRY_DELAY_MS = 1100;
const MAX_SEND_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let sendQueue: Promise<unknown> = Promise.resolve();

function enqueueSend<T>(task: () => Promise<T>): Promise<T> {
  const result = sendQueue.then(task);
  // 失敗してもキューの連鎖は切らず、次の送信までの間隔だけ確保する
  sendQueue = result.then(
    () => sleep(MIN_SEND_INTERVAL_MS),
    () => sleep(MIN_SEND_INTERVAL_MS),
  );
  return result;
}

async function sendWithRateLimitRetry(
  resend: Resend,
  payload: { from: string; to: string; subject: string; html: string },
) {
  let attempt = 1;
  for (;;) {
    const result = await resend.emails.send(payload);
    if (
      result.error?.name !== "rate_limit_exceeded" ||
      attempt >= MAX_SEND_ATTEMPTS
    ) {
      return result;
    }
    console.warn(
      `[sendEmail] rate limited (attempt ${attempt}/${MAX_SEND_ATTEMPTS}), retrying: to=${payload.to}`,
    );
    await sleep(RATE_LIMIT_RETRY_DELAY_MS);
    attempt += 1;
  }
}

export async function sendEmail({ to, subject, html }: SendEmailParams) {
  try {
    const resend = getResendClient();
    if (!resend) {
      await devLocalEmailFallback({ to, subject, html });
      return { success: true as const };
    }

    const { data, error } = await enqueueSend(() =>
      sendWithRateLimitRetry(resend, {
        from: `ビジ友 <${FROM_ADDRESS}>`,
        to,
        subject,
        html,
      }),
    );

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
