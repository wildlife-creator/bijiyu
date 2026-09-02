import { NextResponse } from "next/server";

import { verifyStreamWebhookSignature } from "@/lib/cloudflare/stream";
import { createAdminClient } from "@/lib/supabase/admin";
import { markVideoReady } from "@/lib/videos/mark-ready";

/**
 * Cloudflare Stream Webhook endpoint（P4 動画基盤）。
 *
 * - 署名検証（`Webhook-Signature: time=...,sig1=...`、HMAC-SHA256）に失敗したら 400
 * - 検証後は常に 200 を返す（Stripe Webhook と同じ流儀）。処理は `markVideoReady` が
 *   冪等なので専用のイベントテーブルは持たない（再送されても二重更新・二重メールなし）
 * - `readyToStream: true` のときだけ videos.status を 'ready' にする。
 *   error 状態はログに残し、行は processing のまま（運営が管理画面で削除・再登録する）
 *
 * Runtime は Node.js（HMAC 検証に node:crypto を使うため）。
 */
export const runtime = "nodejs";

interface StreamWebhookPayload {
  uid?: string;
  readyToStream?: boolean;
  status?: { state?: string; errorReasonCode?: string; errorReasonText?: string };
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "[cloudflare-stream-webhook] CLOUDFLARE_STREAM_WEBHOOK_SECRET is not configured",
    );
    return new NextResponse("server misconfigured", { status: 500 });
  }

  // 署名検証は raw body に対して行う（パース前に読む）
  const rawBody = await request.text();
  const valid = verifyStreamWebhookSignature({
    rawBody,
    signatureHeader: request.headers.get("webhook-signature"),
    secret,
  });
  if (!valid) {
    console.error("[cloudflare-stream-webhook] signature verification failed");
    return new NextResponse("invalid signature", { status: 400 });
  }

  let payload: StreamWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as StreamWebhookPayload;
  } catch {
    return NextResponse.json({ received: true, skipped: "invalid_json" });
  }
  if (!payload.uid) {
    return NextResponse.json({ received: true, skipped: "missing_uid" });
  }

  if (payload.readyToStream !== true) {
    if (payload.status?.state === "error") {
      console.error("[cloudflare-stream-webhook] video processing failed", {
        uid: payload.uid,
        code: payload.status.errorReasonCode,
        text: payload.status.errorReasonText,
      });
    }
    return NextResponse.json({ received: true, skipped: "not_ready" });
  }

  try {
    const admin = createAdminClient();
    const host = request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const siteUrl = host
      ? `${proto}://${host}`
      : (process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000");
    const result = await markVideoReady(admin, {
      cloudflareUid: payload.uid,
      siteUrl,
    });
    return NextResponse.json({ received: true, outcome: result.outcome });
  } catch (err) {
    // 署名は正当なので 200 を返す（Cloudflare の再送に頼らず、運営が「状態を確認」で復旧）
    console.error("[cloudflare-stream-webhook] handler failed", err);
    return NextResponse.json({ received: true, outcome: "failed" });
  }
}
