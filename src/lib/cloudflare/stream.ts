import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cloudflare Stream との通信（P4 動画基盤）。SDK は使わず REST を直接叩く。
 *
 * - 認証情報はサーバー専用の環境変数（ブラウザに出さない）
 *   - CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_STREAM_API_TOKEN（Stream 編集権限）
 *   - CLOUDFLARE_STREAM_WEBHOOK_SECRET（Webhook 署名検証用。`PUT /stream/webhook` の戻り値）
 * - 未設定（ローカル等）でも URL 貼り付けでの登録は動く（graceful degradation）。
 *   ファイルアップロードは `isCloudflareStreamConfigured()` で事前に判定して案内する
 * - テストでは `fetch` をモックする（実通信しない）
 */

const API_BASE = "https://api.cloudflare.com/client/v4";
const FETCH_TIMEOUT_MS = 15_000;
/** Webhook の time ヘッダとの許容ずれ（秒）。再送遅延を考慮して 5 分。 */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export interface CloudflareStreamConfig {
  accountId: string;
  apiToken: string;
}

export function getCloudflareStreamConfig(): CloudflareStreamConfig | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN?.trim();
  if (!accountId || !apiToken) return null;
  return { accountId, apiToken };
}

export function isCloudflareStreamConfigured(): boolean {
  return getCloudflareStreamConfig() !== null;
}

export class CloudflareStreamError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
  ) {
    super(message);
    this.name = "CloudflareStreamError";
  }
}

interface CloudflareApiEnvelope<T> {
  success?: boolean;
  result?: T;
  errors?: Array<{ code?: number; message?: string }>;
}

async function callStreamApi<T>(
  config: CloudflareStreamConfig,
  path: string,
  init: { method: "GET" | "POST" | "DELETE" | "PUT"; body?: unknown },
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${API_BASE}/accounts/${config.accountId}/stream${path}`,
      {
        method: init.method,
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          ...(init.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      },
    );
    let json: CloudflareApiEnvelope<T> | null = null;
    try {
      json = (await res.json()) as CloudflareApiEnvelope<T>;
    } catch {
      json = null;
    }
    if (!res.ok || !json || json.success === false || json.result === undefined) {
      const detail = json?.errors?.map((e) => e.message).filter(Boolean).join("; ");
      throw new CloudflareStreamError(
        `Cloudflare Stream API ${init.method} ${path} failed (${res.status})${
          detail ? `: ${detail}` : ""
        }`,
        res.status,
      );
    }
    return json.result;
  } catch (err) {
    if (err instanceof CloudflareStreamError) throw err;
    throw new CloudflareStreamError(
      `Cloudflare Stream API ${init.method} ${path} unreachable: ${
        err instanceof Error ? err.message : String(err)
      }`,
      null,
    );
  } finally {
    clearTimeout(timer);
  }
}

export interface DirectUploadResult {
  /** ブラウザが動画ファイルを multipart/form-data（field: file）で POST する一時 URL */
  uploadURL: string;
  /** 作成される動画の UID（アップロード前に確定する） */
  uid: string;
}

/**
 * Direct Creator Upload の一時 URL を発行する（200MB 以下の単発 POST 用）。
 * API トークンはサーバーに留まり、ブラウザには uploadURL だけを渡す。
 */
export async function createDirectUpload(
  config: CloudflareStreamConfig,
  params: { maxDurationSeconds: number; meta?: Record<string, string> },
): Promise<DirectUploadResult> {
  const result = await callStreamApi<{ uploadURL?: string; uid?: string }>(
    config,
    "/direct_upload",
    {
      method: "POST",
      body: {
        maxDurationSeconds: params.maxDurationSeconds,
        ...(params.meta ? { meta: params.meta } : {}),
      },
    },
  );
  if (!result.uploadURL || !result.uid) {
    throw new CloudflareStreamError(
      "Cloudflare Stream direct_upload returned no uploadURL/uid",
      null,
    );
  }
  return { uploadURL: result.uploadURL, uid: result.uid };
}

export interface StreamVideoDetails {
  uid: string;
  readyToStream: boolean;
  /** ready / inprogress / queued / pendingupload / error */
  state: string | null;
  errorReasonText: string | null;
}

/** 動画の処理状態を取得する（Webhook 未達時の「状態を確認」ボタン用）。 */
export async function getStreamVideo(
  config: CloudflareStreamConfig,
  uid: string,
): Promise<StreamVideoDetails> {
  const result = await callStreamApi<{
    uid?: string;
    readyToStream?: boolean;
    status?: { state?: string; errorReasonText?: string };
  }>(config, `/${encodeURIComponent(uid)}`, { method: "GET" });
  return {
    uid: result.uid ?? uid,
    readyToStream: result.readyToStream === true,
    state: result.status?.state ?? null,
    errorReasonText: result.status?.errorReasonText ?? null,
  };
}

/** Cloudflare 側の動画ファイルを削除する。 */
export async function deleteStreamVideo(
  config: CloudflareStreamConfig,
  uid: string,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${API_BASE}/accounts/${config.accountId}/stream/${encodeURIComponent(uid)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${config.apiToken}` },
        signal: controller.signal,
      },
    );
    // 既に存在しない（404）は削除済みとみなす
    if (!res.ok && res.status !== 404) {
      throw new CloudflareStreamError(
        `Cloudflare Stream API DELETE /${uid} failed (${res.status})`,
        res.status,
      );
    }
  } catch (err) {
    if (err instanceof CloudflareStreamError) throw err;
    throw new CloudflareStreamError(
      `Cloudflare Stream API DELETE /${uid} unreachable: ${
        err instanceof Error ? err.message : String(err)
      }`,
      null,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Webhook 署名（`Webhook-Signature: time=<unix>,sig1=<hex>`）を検証する。
 * 署名対象は `${time}.${rawBody}`、アルゴリズムは HMAC-SHA256（hex）。
 *
 * @returns true = 正当。ヘッダ不正・署名不一致・time が許容範囲外なら false
 */
export function verifyStreamWebhookSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  /** テスト用。省略時は現在時刻 */
  nowSeconds?: number;
  toleranceSeconds?: number;
}): boolean {
  const { rawBody, signatureHeader, secret } = params;
  if (!signatureHeader) return false;

  let time: string | null = null;
  let sig: string | null = null;
  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.trim().split("=");
    if (key === "time" && value) time = value;
    if (key === "sig1" && value) sig = value;
  }
  if (!time || !sig || !/^\d+$/.test(time)) return false;

  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = params.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS;
  if (Math.abs(now - Number(time)) > tolerance) return false;

  const expected = createHmac("sha256", secret)
    .update(`${time}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig.toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** テスト・スクリプト用: 署名ヘッダを生成する（検証関数と対になる）。 */
export function buildStreamWebhookSignature(params: {
  rawBody: string;
  secret: string;
  timeSeconds: number;
}): string {
  const sig = createHmac("sha256", params.secret)
    .update(`${params.timeSeconds}.${params.rawBody}`)
    .digest("hex");
  return `time=${params.timeSeconds},sig1=${sig}`;
}
