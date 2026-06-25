import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

export type AdminClient = SupabaseClient<Database>;

export type RestoreDeletedSuffixResult =
  | { kind: "restored"; originalEmail: string }
  | {
      kind: "rejected";
      reason: "not_suffixed" | "email_collision" | "user_not_found";
      error: string;
    }
  | { kind: "failed"; reason: "api_error"; error: string };

/**
 * 印付き形式の検出パターン。`applyDeletedSuffix` と共通。
 * `{4,}` で forward 4 文字 / バックフィル 8 文字を両対応。
 */
const SUFFIX_PATTERN = /^deleted-\d{8}-[a-z0-9]{4,}-/;

/**
 * 印付き email から元 email を抽出するパターン。貪欲マッチで
 * 4 / 8 文字どちらの random token にも対応する。
 *
 * 例: `deleted-20260624-a3f2-tanaka@bijiyu.jp` → `tanaka@bijiyu.jp`
 */
const EXTRACT_PATTERN = /^deleted-\d{8}-[a-z0-9]+-(.+@.+)$/;

function formatDateISO(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function recordAudit(
  admin: AdminClient,
  params: {
    action: "auth_email_restored" | "auth_email_restore_failed";
    targetId: string;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const { error } = await admin.from("audit_logs").insert({
      actor_id: null,
      action: params.action,
      target_type: "user",
      target_id: params.targetId,
      metadata: params.metadata as Json,
    });
    if (error) {
      console.error("[restoreDeletedSuffix] audit_logs insert failed", {
        action: params.action,
        targetId: params.targetId,
        error,
      });
    }
  } catch (err) {
    console.error("[restoreDeletedSuffix] audit_logs unexpected throw", {
      action: params.action,
      targetId: params.targetId,
      err,
    });
  }
}

/**
 * 危険・運用注意
 * - 削除済み user を「印剥がし + deleted_at クリア + ban 解除」で active 状態に戻す
 * - fresh start を巻き戻すため、対象 user の旧 user_id に紐づくメッセージ / 評価 /
 *   履歴がすべて再び有効化される
 * - 呼び出し前に対象 user の public.users 状態（deleted_at セット済み・印付き済み）
 *   を確認すべき
 * - Service Role Key を持つ環境からのみ呼び出し可能。Server Action として
 *   export しない（`'use server'` を付けない）
 *
 * 主な振る舞い:
 * - 対象 user の auth email が印付き形式に合致しない → `rejected/not_suffixed`
 * - 原本 email が別 active user と衝突 → `rejected/email_collision`（事前 SELECT は
 *   行わず、updateUserById の error.code === 'email_exists' で判定）
 * - 対象 user が auth.users に存在しない → `rejected/user_not_found`
 * - その他 admin API エラー → `failed/api_error`
 * - 成功時: auth.users.email 復元 + ban_duration 解除 + public.users.deleted_at = NULL
 *   + audit_logs に `auth_email_restored` を 1 件 INSERT
 */
export async function restoreDeletedSuffix(
  admin: AdminClient,
  userId: string,
): Promise<RestoreDeletedSuffixResult> {
  const now = new Date();
  const isoDate = formatDateISO(now);

  // 1) 対象 user を取得
  let getResp: Awaited<ReturnType<AdminClient["auth"]["admin"]["getUserById"]>>;
  try {
    getResp = await admin.auth.admin.getUserById(userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordAudit(admin, {
      action: "auth_email_restore_failed",
      targetId: userId,
      metadata: {
        invoked_by: "developer",
        reason: "api_error",
        date: isoDate,
      },
    });
    return { kind: "failed", reason: "api_error", error: message };
  }

  const user = getResp.data?.user;
  if (!user) {
    const errorMessage = getResp.error?.message ?? "user not found";
    await recordAudit(admin, {
      action: "auth_email_restore_failed",
      targetId: userId,
      metadata: {
        invoked_by: "developer",
        reason: "user_not_found",
        date: isoDate,
      },
    });
    return { kind: "rejected", reason: "user_not_found", error: errorMessage };
  }

  const currentEmail = user.email ?? "";

  // 2) 印付き形式チェック
  if (!SUFFIX_PATTERN.test(currentEmail)) {
    const errorMessage = "auth.users.email does not match suffix pattern";
    await recordAudit(admin, {
      action: "auth_email_restore_failed",
      targetId: userId,
      metadata: {
        invoked_by: "developer",
        reason: "not_suffixed",
        date: isoDate,
      },
    });
    return { kind: "rejected", reason: "not_suffixed", error: errorMessage };
  }

  // 3) 元 email を抽出
  const match = EXTRACT_PATTERN.exec(currentEmail);
  if (!match || !match[1]) {
    const errorMessage = "failed to extract original email from suffixed form";
    await recordAudit(admin, {
      action: "auth_email_restore_failed",
      targetId: userId,
      metadata: {
        invoked_by: "developer",
        reason: "not_suffixed",
        date: isoDate,
      },
    });
    return { kind: "rejected", reason: "not_suffixed", error: errorMessage };
  }
  const originalEmail = match[1];

  // 4-pre) 事前衝突判定: 原本 email が別 active user に取られていれば即拒否。
  //   updateUserById の衝突時 error は HTTP 500 / code='unexpected_failure'
  //   という汎用エラーで返るため、後段 (4) の error.code 判定だけでは
  //   collision を確定できない (= api_error として誤分類される)。本 RPC
  //   で事前に SELECT EXISTS を回して collision を確実に分類する。
  //   RPC 自体が失敗した場合は通常パスに進む (updateUserById で結局
  //   弾かれるので安全性は維持される)。
  const { data: takenData, error: takenErr } = await admin.rpc(
    "email_taken_by_other_user",
    { p_email: originalEmail, p_excluding_user_id: userId },
  );
  if (!takenErr && takenData === true) {
    const errorMessage =
      "original email is already taken by another active user";
    await recordAudit(admin, {
      action: "auth_email_restore_failed",
      targetId: userId,
      metadata: {
        invoked_by: "developer",
        reason: "email_collision",
        date: isoDate,
      },
    });
    return {
      kind: "rejected",
      reason: "email_collision",
      error: errorMessage,
    };
  }

  // 4) auth.users.email を原本に戻す + ban 解除（同一 API 呼び出しで適用）
  let updateResp: Awaited<
    ReturnType<AdminClient["auth"]["admin"]["updateUserById"]>
  >;
  try {
    updateResp = await admin.auth.admin.updateUserById(userId, {
      email: originalEmail,
      email_confirm: true,
      ban_duration: "none",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordAudit(admin, {
      action: "auth_email_restore_failed",
      targetId: userId,
      metadata: {
        invoked_by: "developer",
        reason: "api_error",
        date: isoDate,
      },
    });
    return { kind: "failed", reason: "api_error", error: message };
  }

  if (updateResp.error) {
    const errObj = updateResp.error as { message: string; code?: string };
    if (errObj.code === "email_exists") {
      await recordAudit(admin, {
        action: "auth_email_restore_failed",
        targetId: userId,
        metadata: {
          invoked_by: "developer",
          reason: "email_collision",
          date: isoDate,
        },
      });
      return {
        kind: "rejected",
        reason: "email_collision",
        error: errObj.message,
      };
    }
    await recordAudit(admin, {
      action: "auth_email_restore_failed",
      targetId: userId,
      metadata: {
        invoked_by: "developer",
        reason: "api_error",
        date: isoDate,
      },
    });
    return { kind: "failed", reason: "api_error", error: errObj.message };
  }

  // 5) auth.identities も対称的に元 email に戻す (applyDeletedSuffix の
  //    逆操作)。失敗してもログのみで restored は維持する。
  const { error: identityError } = await admin.rpc(
    "email_recycle_sync_identity",
    {
      p_user_id: userId,
      p_from_email: currentEmail, // 印付き email (今の auth.users.email)
      p_to_email: originalEmail, // 原本 email (戻す先)
    },
  );
  if (identityError) {
    console.error(
      "[restoreDeletedSuffix] auth.identities sync failed (non-blocking)",
      { userId, error: identityError },
    );
  }

  // 6) public.users.deleted_at を NULL に戻す（失敗してもログのみ・restored 維持）
  const { error: usersError } = await admin
    .from("users")
    .update({ deleted_at: null })
    .eq("id", userId);
  if (usersError) {
    console.error("[restoreDeletedSuffix] public.users update failed", {
      userId,
      error: usersError,
    });
  }

  // 6) 監査ログ
  await recordAudit(admin, {
    action: "auth_email_restored",
    targetId: userId,
    metadata: {
      invoked_by: "developer",
      date: isoDate,
    },
  });

  return { kind: "restored", originalEmail };
}
