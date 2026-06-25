import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

export type AdminClient = SupabaseClient<Database>;

export type ApplyDeletedSuffixResult =
  | { kind: "applied"; recycledEmail: string }
  | { kind: "already_suffixed" }
  | {
      kind: "skipped";
      reason: "invalid_format" | "user_not_found" | "max_retries_exceeded";
      error?: string;
    }
  | { kind: "failed"; reason: "api_error"; error: string };

export interface ApplyDeletedSuffixOptions {
  /** 印付け発生経路（audit_logs.metadata.path に記録） */
  path: "staff_delete" | "subscription_deleted" | "self_withdrawal";
  /** 削除を実行した actor の user id（actor_id 記録用、なければ null） */
  actorId: string | null;
}

/**
 * `^deleted-\d{8}-[a-z0-9]{4,}-` で前方一致判定。
 * `{4,}` で forward 経路（4 文字）とバックフィル（8 文字）の両方を検出する。
 */
const SUFFIX_PATTERN = /^deleted-\d{8}-[a-z0-9]{4,}-/;
const MAX_RETRIES = 3;
const RANDOM_LENGTH = 4;
const RANDOM_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function generateRandomToken(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += RANDOM_CHARS[Math.floor(Math.random() * RANDOM_CHARS.length)];
  }
  return out;
}

function formatDateYYYYMMDD(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function formatDateISO(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildSuffixedEmail(
  originalEmail: string,
  datePart: string,
  randomToken: string,
): string {
  const atIndex = originalEmail.indexOf("@");
  const local = originalEmail.slice(0, atIndex);
  const domain = originalEmail.slice(atIndex + 1);
  return `deleted-${datePart}-${randomToken}-${local}@${domain}`;
}

async function recordAudit(
  admin: AdminClient,
  params: {
    actorId: string | null;
    action: "auth_email_recycled" | "auth_email_recycle_failed";
    targetId: string;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const { error } = await admin.from("audit_logs").insert({
      actor_id: params.actorId,
      action: params.action,
      target_type: "user",
      target_id: params.targetId,
      metadata: params.metadata as Json,
    });
    if (error) {
      console.error("[applyDeletedSuffix] audit_logs insert failed", {
        action: params.action,
        targetId: params.targetId,
        error,
      });
    }
  } catch (err) {
    console.error("[applyDeletedSuffix] audit_logs unexpected throw", {
      action: params.action,
      targetId: params.targetId,
      err,
    });
  }
}

/**
 * 対象 user の `auth.users.email` に「削除印」を付け、元のメールアドレスを解放する。
 *
 * 印付き形式: `deleted-{YYYYMMDD UTC}-{ランダム4文字 [a-z0-9]}-{元のローカル部}@{元のドメイン}`
 *
 * 主な振る舞い:
 * - 既に印付き形式の場合は no-op（`already_suffixed`）
 * - UNIQUE 衝突は別 random で最大 3 回まで再試行
 * - 失敗時は throw せず、結果 union 型で返す（呼び出し元の削除完了を維持するため）
 * - `email_confirm: true` を付与し、確認メール送信を抑止（架空アドレスへの bounce 抑止）
 *
 * Side effects:
 * - `auth.users.email` UPDATE（成功時のみ）
 * - `audit_logs` INSERT 1 件（成功 `auth_email_recycled` / 失敗 `auth_email_recycle_failed`）
 *   - `metadata` に元 email を含めない（個人情報二重保存回避）
 */
export async function applyDeletedSuffix(
  admin: AdminClient,
  userId: string,
  options: ApplyDeletedSuffixOptions,
): Promise<ApplyDeletedSuffixResult> {
  const now = new Date();
  const datePart = formatDateYYYYMMDD(now);
  const isoDate = formatDateISO(now);

  // 1) 対象 user を取得
  let getResp: Awaited<ReturnType<AdminClient["auth"]["admin"]["getUserById"]>>;
  try {
    getResp = await admin.auth.admin.getUserById(userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordAudit(admin, {
      actorId: options.actorId,
      action: "auth_email_recycle_failed",
      targetId: userId,
      metadata: { path: options.path, reason: "api_error", date: isoDate },
    });
    return { kind: "failed", reason: "api_error", error: message };
  }

  const user = getResp.data?.user;
  if (!user) {
    await recordAudit(admin, {
      actorId: options.actorId,
      action: "auth_email_recycle_failed",
      targetId: userId,
      metadata: { path: options.path, reason: "user_not_found", date: isoDate },
    });
    return {
      kind: "skipped",
      reason: "user_not_found",
      error: getResp.error?.message,
    };
  }

  const currentEmail = user.email ?? "";

  // 2) 不正形式（@ 無し）
  if (!currentEmail.includes("@")) {
    await recordAudit(admin, {
      actorId: options.actorId,
      action: "auth_email_recycle_failed",
      targetId: userId,
      metadata: {
        path: options.path,
        reason: "invalid_format",
        date: isoDate,
      },
    });
    return { kind: "skipped", reason: "invalid_format" };
  }

  // 3) 既に印付き → no-op
  if (SUFFIX_PATTERN.test(currentEmail)) {
    return { kind: "already_suffixed" };
  }

  // 4) リトライループ
  let lastError: { message: string; code?: string } | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const randomToken = generateRandomToken(RANDOM_LENGTH);
    const suffixedEmail = buildSuffixedEmail(
      currentEmail,
      datePart,
      randomToken,
    );

    let updateResp: Awaited<
      ReturnType<AdminClient["auth"]["admin"]["updateUserById"]>
    >;
    try {
      updateResp = await admin.auth.admin.updateUserById(userId, {
        email: suffixedEmail,
        email_confirm: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordAudit(admin, {
        actorId: options.actorId,
        action: "auth_email_recycle_failed",
        targetId: userId,
        metadata: { path: options.path, reason: "api_error", date: isoDate },
      });
      return { kind: "failed", reason: "api_error", error: message };
    }

    if (!updateResp.error) {
      // auth.identities も同期する (Supabase Auth の signUp は identities の
      // email 列も一意性判定に使うため、auth.users.email だけ書き換えると
      // user_already_exists で詰まる)。RPC は SECURITY DEFINER で service_role
      // のみ実行可。失敗してもメインの印付け処理は成功扱いとし業務を止めない。
      const { error: identityError } = await admin.rpc(
        "email_recycle_sync_identity",
        {
          p_user_id: userId,
          p_from_email: currentEmail,
          p_to_email: suffixedEmail,
        },
      );
      if (identityError) {
        console.error(
          "[applyDeletedSuffix] auth.identities sync failed (non-blocking)",
          { userId, error: identityError },
        );
      }

      await recordAudit(admin, {
        actorId: options.actorId,
        action: "auth_email_recycled",
        targetId: userId,
        metadata: { path: options.path, date: isoDate },
      });
      return { kind: "applied", recycledEmail: suffixedEmail };
    }

    const errObj = updateResp.error as { message: string; code?: string };
    lastError = { message: errObj.message, code: errObj.code };

    // email_exists 以外は再試行しない（リトライしても結果は変わらない）
    if (errObj.code !== "email_exists") {
      await recordAudit(admin, {
        actorId: options.actorId,
        action: "auth_email_recycle_failed",
        targetId: userId,
        metadata: { path: options.path, reason: "api_error", date: isoDate },
      });
      return { kind: "failed", reason: "api_error", error: errObj.message };
    }
    // 衝突 → 次のランダムで再試行
  }

  // 5) 3 回連続衝突
  await recordAudit(admin, {
    actorId: options.actorId,
    action: "auth_email_recycle_failed",
    targetId: userId,
    metadata: {
      path: options.path,
      reason: "max_retries_exceeded",
      date: isoDate,
    },
  });
  return {
    kind: "skipped",
    reason: "max_retries_exceeded",
    error: lastError?.message,
  };
}
