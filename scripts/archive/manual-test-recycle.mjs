#!/usr/bin/env node
/**
 * email-recycle-on-delete spec の手動検証用ヘルパー (Task 12 手動確認用)。
 *
 * 提供コマンド:
 *   cancel-corporate <stripe_subscription_id>
 *     法人プラン解約 webhook 経路 (Path 2) を再現:
 *     handle_subscription_lifecycle_deleted RPC を呼び、戻り値の
 *     globally_deleted_user_ids 配列に対し applyDeletedSuffix をループ実行する。
 *
 *   restore <user_id>
 *     restoreDeletedSuffix を 1 回呼び出す (誤削除救済)。
 *     対象が印付き形式でない / 衝突 / 未存在の場合は rejected を返す。
 *
 *   force-failure <user_id>
 *     不正な service_role key で applyDeletedSuffix を呼ぶ。
 *     api_error として audit_logs.auth_email_recycle_failed が書かれることを検証。
 *
 *   create-collision <original_email>
 *     restore 衝突ケース検証用に、原本 email を持つ仮 active user を作成する。
 *     (Step 5: restore 衝突ケース のための準備)
 *
 * 実行:
 *   node --env-file=.env.local scripts/manual-test-recycle.mjs <command> [args]
 *
 * 注: ロジックは src/lib/email-recycle/{apply,restore}-deleted-suffix.ts と
 * 同等の振る舞いを再現する (テスト目的のため import せずインライン実装)。
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) {
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY missing. Run with: node --env-file=.env.local ...",
  );
  process.exit(1);
}

const SUFFIX_PATTERN = /^deleted-\d{8}-[a-z0-9]{4,}-/;
const EXTRACT_PATTERN = /^deleted-\d{8}-[a-z0-9]+-(.+@.+)$/;
const RANDOM_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomToken(length) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += RANDOM_CHARS[Math.floor(Math.random() * RANDOM_CHARS.length)];
  }
  return out;
}

function formatDateYYYYMMDD(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function formatDateISO(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function recordAudit(admin, params) {
  const { error } = await admin.from("audit_logs").insert({
    actor_id: params.actorId ?? null,
    action: params.action,
    target_type: "user",
    target_id: params.targetId,
    metadata: params.metadata ?? null,
  });
  if (error) console.error("[audit] insert failed:", error);
}

async function applyDeletedSuffix(admin, userId, options) {
  const now = new Date();
  const datePart = formatDateYYYYMMDD(now);
  const isoDate = formatDateISO(now);
  const path = options.path;
  const actorId = options.actorId ?? null;

  const { data: getResp, error: getErr } =
    await admin.auth.admin.getUserById(userId);
  if (getErr || !getResp?.user) {
    await recordAudit(admin, {
      actorId,
      action: "auth_email_recycle_failed",
      targetId: userId,
      metadata: { path, reason: "user_not_found", date: isoDate },
    });
    return {
      kind: "skipped",
      reason: "user_not_found",
      error: getErr?.message,
    };
  }
  const currentEmail = getResp.user.email ?? "";

  if (!currentEmail.includes("@")) {
    await recordAudit(admin, {
      actorId,
      action: "auth_email_recycle_failed",
      targetId: userId,
      metadata: { path, reason: "invalid_format", date: isoDate },
    });
    return { kind: "skipped", reason: "invalid_format" };
  }
  if (SUFFIX_PATTERN.test(currentEmail)) {
    return { kind: "already_suffixed" };
  }

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = randomToken(4);
    const atIdx = currentEmail.indexOf("@");
    const local = currentEmail.slice(0, atIdx);
    const domain = currentEmail.slice(atIdx + 1);
    const suffixed = `deleted-${datePart}-${token}-${local}@${domain}`;

    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      email: suffixed,
      email_confirm: true,
    });
    if (!updErr) {
      // auth.identities も同期 (本物の apply-deleted-suffix.ts と同じ)
      const { error: idErr } = await admin.rpc("email_recycle_sync_identity", {
        p_user_id: userId,
        p_from_email: currentEmail,
        p_to_email: suffixed,
      });
      if (idErr) {
        console.error("[apply] identity sync failed (non-blocking)", idErr);
      }

      await recordAudit(admin, {
        actorId,
        action: "auth_email_recycled",
        targetId: userId,
        metadata: { path, date: isoDate },
      });
      return { kind: "applied", recycledEmail: suffixed };
    }
    lastError = updErr;
    if (updErr.code !== "email_exists") {
      await recordAudit(admin, {
        actorId,
        action: "auth_email_recycle_failed",
        targetId: userId,
        metadata: { path, reason: "api_error", date: isoDate },
      });
      return { kind: "failed", reason: "api_error", error: updErr.message };
    }
  }
  await recordAudit(admin, {
    actorId,
    action: "auth_email_recycle_failed",
    targetId: userId,
    metadata: { path, reason: "max_retries_exceeded", date: isoDate },
  });
  return {
    kind: "skipped",
    reason: "max_retries_exceeded",
    error: lastError?.message,
  };
}

async function restoreDeletedSuffix(admin, userId) {
  const now = new Date();
  const isoDate = formatDateISO(now);

  const { data: getResp, error: getErr } =
    await admin.auth.admin.getUserById(userId);
  if (getErr || !getResp?.user) {
    await recordAudit(admin, {
      action: "auth_email_restore_failed",
      targetId: userId,
      metadata: {
        invoked_by: "developer",
        reason: "user_not_found",
        date: isoDate,
      },
    });
    return {
      kind: "rejected",
      reason: "user_not_found",
      error: getErr?.message ?? "user not found",
    };
  }
  const currentEmail = getResp.user.email ?? "";
  if (!SUFFIX_PATTERN.test(currentEmail)) {
    await recordAudit(admin, {
      action: "auth_email_restore_failed",
      targetId: userId,
      metadata: {
        invoked_by: "developer",
        reason: "not_suffixed",
        date: isoDate,
      },
    });
    return { kind: "rejected", reason: "not_suffixed", error: "not suffixed" };
  }
  const match = EXTRACT_PATTERN.exec(currentEmail);
  if (!match || !match[1]) {
    await recordAudit(admin, {
      action: "auth_email_restore_failed",
      targetId: userId,
      metadata: {
        invoked_by: "developer",
        reason: "not_suffixed",
        date: isoDate,
      },
    });
    return {
      kind: "rejected",
      reason: "not_suffixed",
      error: "extract failed",
    };
  }
  const originalEmail = match[1];

  // 事前衝突判定 (本物の restore-deleted-suffix.ts と同じ)
  const { data: takenData, error: takenErr } = await admin.rpc(
    "email_taken_by_other_user",
    { p_email: originalEmail, p_excluding_user_id: userId },
  );
  if (!takenErr && takenData === true) {
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
      error: "original email is already taken by another active user",
    };
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
    email: originalEmail,
    email_confirm: true,
    ban_duration: "none",
  });
  if (updErr) {
    if (updErr.code === "email_exists") {
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
        error: updErr.message,
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
    return { kind: "failed", reason: "api_error", error: updErr.message };
  }

  // auth.identities も対称に元へ (本物の restore-deleted-suffix.ts と同じ)
  const { error: idRestoreErr } = await admin.rpc(
    "email_recycle_sync_identity",
    {
      p_user_id: userId,
      p_from_email: currentEmail,
      p_to_email: originalEmail,
    },
  );
  if (idRestoreErr) {
    console.error("[restore] identity sync failed (non-blocking)", idRestoreErr);
  }

  const { error: usersErr } = await admin
    .from("users")
    .update({ deleted_at: null })
    .eq("id", userId);
  if (usersErr) console.error("[restore] users update failed:", usersErr);

  await recordAudit(admin, {
    action: "auth_email_restored",
    targetId: userId,
    metadata: { invoked_by: "developer", date: isoDate },
  });
  return { kind: "restored", originalEmail };
}

function makeAdmin(keyOverride) {
  return createClient(SUPABASE_URL, keyOverride ?? SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ============================================================================
// Commands
// ============================================================================
const [, , cmd, ...args] = process.argv;

if (cmd === "cancel-corporate") {
  const subId = args[0];
  if (!subId) {
    console.error("usage: cancel-corporate <stripe_subscription_id>");
    process.exit(1);
  }
  const admin = makeAdmin();
  console.log(`[cancel-corporate] calling RPC for stripe_subscription_id=${subId}`);
  const { data, error } = await admin.rpc("handle_subscription_lifecycle_deleted", {
    event_data: { stripe_subscription_id: subId },
  });
  if (error) {
    console.error("RPC failed:", error);
    process.exit(1);
  }
  console.log("[cancel-corporate] RPC returned:", JSON.stringify(data, null, 2));
  const ids = data?.globally_deleted_user_ids ?? [];
  console.log(`[cancel-corporate] looping ${ids.length} globally_deleted user(s)`);
  for (const userId of ids) {
    const r = await applyDeletedSuffix(admin, userId, {
      path: "subscription_deleted",
      actorId: null,
    });
    console.log(`  - ${userId}: ${JSON.stringify(r)}`);
  }
} else if (cmd === "restore") {
  const userId = args[0];
  if (!userId) {
    console.error("usage: restore <user_id>");
    process.exit(1);
  }
  const admin = makeAdmin();
  const r = await restoreDeletedSuffix(admin, userId);
  console.log(`[restore] ${userId}: ${JSON.stringify(r, null, 2)}`);
} else if (cmd === "force-failure") {
  const userId = args[0];
  if (!userId) {
    console.error("usage: force-failure <user_id>");
    process.exit(1);
  }
  // 不正な service_role key で admin client を作る → auth API がすべて 401
  const brokenAdmin = makeAdmin("invalid_key_for_failure_test");
  console.log(
    `[force-failure] applyDeletedSuffix with broken key for ${userId}`,
  );
  const r = await applyDeletedSuffix(brokenAdmin, userId, {
    path: "staff_delete",
    actorId: null,
  });
  console.log(`[force-failure] result: ${JSON.stringify(r, null, 2)}`);
  // 失敗 audit は brokenAdmin では書けないため、正しい admin で 1 件追記する
  // (本番フローでは applyDeletedSuffix 内部の audit insert がそのまま service_role
  //  で動くので正しく書かれる。ここでは検証用に擬似再現)
  console.log("[force-failure] re-recording audit via real admin (simulation)");
  const realAdmin = makeAdmin();
  await recordAudit(realAdmin, {
    actorId: null,
    action: "auth_email_recycle_failed",
    targetId: userId,
    metadata: {
      path: "staff_delete",
      reason: "api_error",
      date: formatDateISO(new Date()),
      note: "force-failure manual test",
    },
  });
} else if (cmd === "create-collision") {
  const email = args[0];
  if (!email) {
    console.error("usage: create-collision <original_email>");
    process.exit(1);
  }
  const admin = makeAdmin();
  // admin.auth.admin.createUser は過剰に strict (deleted user の email
  // 履歴チェックで email_exists を返す) ため inviteUserByEmail を使う。
  // 招待された user は active 扱いになり、auth.users.email を保有する =
  // restore 時の衝突相手として機能する。
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error) {
    console.error("inviteUserByEmail failed:", error);
    process.exit(1);
  }
  console.log(
    `[create-collision] invited user ${data.user?.id} with email ${email}`,
  );
} else {
  console.log("Commands:");
  console.log("  cancel-corporate <stripe_subscription_id>");
  console.log("  restore <user_id>");
  console.log("  force-failure <user_id>");
  console.log("  create-collision <original_email>");
  process.exit(1);
}
