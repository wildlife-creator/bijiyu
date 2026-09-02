"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin/require-admin";
import { writeAuditLog } from "@/lib/audit/log";
import { resolveSiteUrl } from "@/lib/billing/activation-emails";
import {
  CloudflareStreamError,
  createDirectUpload,
  deleteStreamVideo,
  getCloudflareStreamConfig,
  getStreamVideo,
} from "@/lib/cloudflare/stream";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types/action-result";
import {
  ExternalVideoUrlSchema,
  VideoAdminLabelSchema,
  VideoPlacementSchema,
} from "@/lib/validations/video";
import {
  CLOUDFLARE_NOT_CONFIGURED_MESSAGE,
  VIDEO_UPLOAD_MAX_DURATION_SECONDS,
  type VideoPlacement,
  type VideoStatus,
} from "@/lib/videos/constants";
import { markVideoReady } from "@/lib/videos/mark-ready";
import {
  countReadyVideos,
  sendVideoPublishedEmails,
} from "@/lib/videos/published-emails";

/**
 * ADM-027 動画管理 の Server Action（P4 動画基盤）。
 *
 * - 認可: middleware の /admin/* ガード + `requireAdmin()`（三重防御の 2 層目）。
 *   videos の書き込みは service_role（admin client）専用で RLS ポリシーを置いていない
 * - 全操作を audit_logs に記録（video_create / video_update / video_reorder / video_delete）
 * - 掲載お知らせメールは「その掲載場所で公開中が 0 → 1 本になったとき」だけ送る
 * - Cloudflare との通信は `src/lib/cloudflare/stream.ts` に閉じる（テストでは擬似化）
 */

// seed の手書き UUID（RFC 4122 非準拠）も受け付けるため z.uuid() は使わない
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idSchema = z.string().regex(UUID_LIKE, "対象が不正です");

const GENERIC_ERROR = "処理に失敗しました。しばらくしてから再度お試しください";

type AdminClient = ReturnType<typeof createAdminClient>;

interface VideoRow {
  id: string;
  user_id: string;
  placement: VideoPlacement;
  sort_order: number;
  provider: string;
  cloudflare_uid: string | null;
  embed_source_url: string | null;
  admin_label: string | null;
  status: VideoStatus;
}

const VIDEO_ROW_COLUMNS =
  "id, user_id, placement, sort_order, provider, cloudflare_uid, embed_source_url, admin_label, status";

function revalidateVideoPages(userId: string) {
  revalidatePath(`/admin/users/${userId}/videos`);
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath(`/admin/clients/${userId}`);
  revalidatePath(`/users/contractors/${userId}`);
  revalidatePath(`/clients/${userId}`);
  revalidatePath("/profile");
  revalidatePath("/mypage/client-profile");
}

async function loadTargetUser(
  admin: AdminClient,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: target } = await admin
    .from("users")
    .select("id, deleted_at")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { ok: false, error: "対象ユーザーが見つかりません" };
  if (target.deleted_at) {
    return { ok: false, error: "退会済みのユーザーには動画を登録できません" };
  }
  return { ok: true };
}

async function loadVideo(
  admin: AdminClient,
  videoId: string,
): Promise<{ ok: true; video: VideoRow } | { ok: false; error: string }> {
  const { data } = await admin
    .from("videos")
    .select(VIDEO_ROW_COLUMNS)
    .eq("id", videoId)
    .maybeSingle();
  if (!data) return { ok: false, error: "対象の動画が見つかりません" };
  return { ok: true, video: data as VideoRow };
}

async function nextSortOrder(
  admin: AdminClient,
  userId: string,
  placement: VideoPlacement,
): Promise<number> {
  const { data } = await admin
    .from("videos")
    .select("sort_order")
    .eq("user_id", userId)
    .eq("placement", placement)
    .order("sort_order", { ascending: false })
    .limit(1);
  const max = data?.[0]?.sort_order;
  return typeof max === "number" ? max + 1 : 0;
}

// ------------------------------------------------------------
// 追加（ファイルアップロード = Cloudflare Direct Creator Upload）
// ------------------------------------------------------------

const createUploadSchema = z.object({
  userId: idSchema,
  placement: VideoPlacementSchema,
  adminLabel: VideoAdminLabelSchema,
});

/**
 * Cloudflare の一時アップロード URL を発行し、videos 行を status='processing' で作成する。
 * ブラウザは戻り値の uploadUrl へファイルを直接 POST する（API トークンはサーバーに留まる）。
 * アップロードに失敗したらブラウザ側が `deleteVideoAction` で行を片付ける。
 */
export async function createVideoUploadAction(input: {
  userId: string;
  placement: string;
  adminLabel: string;
}): Promise<ActionResult<{ videoId: string; uploadUrl: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = createUploadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "入力内容が不正です",
    };
  }
  const { userId, adminLabel } = parsed.data;
  const placement = parsed.data.placement as VideoPlacement;

  const config = getCloudflareStreamConfig();
  if (!config) {
    return { success: false, error: CLOUDFLARE_NOT_CONFIGURED_MESSAGE };
  }

  const admin = createAdminClient();
  const target = await loadTargetUser(admin, userId);
  if (!target.ok) return { success: false, error: target.error };

  let upload: { uploadURL: string; uid: string };
  try {
    upload = await createDirectUpload(config, {
      maxDurationSeconds: VIDEO_UPLOAD_MAX_DURATION_SECONDS,
      meta: { userId, placement, ...(adminLabel ? { name: adminLabel } : {}) },
    });
  } catch (err) {
    console.error("[createVideoUploadAction] direct_upload failed", err);
    return {
      success: false,
      error:
        "アップロード URL の発行に失敗しました。しばらくしてから再度お試しください",
    };
  }

  const sortOrder = await nextSortOrder(admin, userId, placement);
  const { data: inserted, error } = await admin
    .from("videos")
    .insert({
      user_id: userId,
      placement,
      sort_order: sortOrder,
      provider: "cloudflare",
      cloudflare_uid: upload.uid,
      admin_label: adminLabel,
      status: "processing",
    })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[createVideoUploadAction] insert failed", error);
    // 行が作れなかった UID は Cloudflare 側にも残さない（失敗はログのみ）
    await deleteStreamVideo(config, upload.uid).catch((err) => {
      console.error("[createVideoUploadAction] cleanup delete failed", err);
    });
    return { success: false, error: GENERIC_ERROR };
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "video_create",
    targetType: "videos",
    targetId: inserted.id,
    metadata: {
      userId,
      placement,
      provider: "cloudflare",
      cloudflareUid: upload.uid,
      adminLabel,
    },
  });

  revalidateVideoPages(userId);
  return {
    success: true,
    data: { videoId: inserted.id, uploadUrl: upload.uploadURL },
  };
}

// ------------------------------------------------------------
// 追加（URL 貼り付け = TikTok 等の埋込）
// ------------------------------------------------------------

const addExternalSchema = z.object({
  userId: idSchema,
  placement: VideoPlacementSchema,
  url: ExternalVideoUrlSchema,
  adminLabel: VideoAdminLabelSchema,
});

/** URL で動画を追加する。即時公開（ready）。その掲載場所の 1 本目なら掲載メールを送る。 */
export async function addExternalVideoAction(input: {
  userId: string;
  placement: string;
  url: string;
  adminLabel: string;
}): Promise<ActionResult<{ videoId: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = addExternalSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "入力内容が不正です",
    };
  }
  const { userId, url, adminLabel } = parsed.data;
  const placement = parsed.data.placement as VideoPlacement;

  const admin = createAdminClient();
  const target = await loadTargetUser(admin, userId);
  if (!target.ok) return { success: false, error: target.error };

  const readyBefore = await countReadyVideos(admin, userId, placement);
  const sortOrder = await nextSortOrder(admin, userId, placement);

  const { data: inserted, error } = await admin
    .from("videos")
    .insert({
      user_id: userId,
      placement,
      sort_order: sortOrder,
      provider: "external",
      embed_source_url: url,
      admin_label: adminLabel,
      status: "ready",
    })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[addExternalVideoAction] insert failed", error);
    return { success: false, error: GENERIC_ERROR };
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "video_create",
    targetType: "videos",
    targetId: inserted.id,
    metadata: {
      userId,
      placement,
      provider: "external",
      embedSourceUrl: url,
      adminLabel,
    },
  });

  // §6.6.C: その掲載場所で公開中が 0 → 1 本になったときだけ送信。await で完了を待つ
  if (readyBefore === 0) {
    const siteUrl = await resolveSiteUrl();
    await sendVideoPublishedEmails(admin, { userId, placement, siteUrl }).catch(
      (err) => {
        console.error("[addExternalVideoAction] published emails failed", err);
      },
    );
  }

  revalidateVideoPages(userId);
  return { success: true, data: { videoId: inserted.id } };
}

// ------------------------------------------------------------
// ラベル更新
// ------------------------------------------------------------

const updateLabelSchema = z.object({
  videoId: idSchema,
  adminLabel: VideoAdminLabelSchema,
});

export async function updateVideoLabelAction(input: {
  videoId: string;
  adminLabel: string;
}): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = updateLabelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "入力内容が不正です",
    };
  }

  const admin = createAdminClient();
  const loaded = await loadVideo(admin, parsed.data.videoId);
  if (!loaded.ok) return { success: false, error: loaded.error };

  const { error } = await admin
    .from("videos")
    .update({ admin_label: parsed.data.adminLabel })
    .eq("id", loaded.video.id);
  if (error) {
    console.error("[updateVideoLabelAction] update failed", error);
    return { success: false, error: GENERIC_ERROR };
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "video_update",
    targetType: "videos",
    targetId: loaded.video.id,
    metadata: {
      userId: loaded.video.user_id,
      field: "admin_label",
      before: loaded.video.admin_label,
      after: parsed.data.adminLabel,
    },
  });

  revalidateVideoPages(loaded.video.user_id);
  return { success: true };
}

// ------------------------------------------------------------
// 表示順入替
// ------------------------------------------------------------

const moveSchema = z.object({
  videoId: idSchema,
  direction: z.enum(["up", "down"]),
});

/**
 * 同一 (user, placement) 内で 1 つ上 / 下と入れ替える。
 * 入替後は 0..n-1 に振り直し、欠番・重複を解消する。
 */
export async function moveVideoAction(input: {
  videoId: string;
  direction: "up" | "down";
}): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "入力内容が不正です",
    };
  }

  const admin = createAdminClient();
  const loaded = await loadVideo(admin, parsed.data.videoId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { video } = loaded;

  const { data: siblings, error: listError } = await admin
    .from("videos")
    .select("id, sort_order")
    .eq("user_id", video.user_id)
    .eq("placement", video.placement)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (listError || !siblings) {
    console.error("[moveVideoAction] list failed", listError);
    return { success: false, error: GENERIC_ERROR };
  }

  const ids = siblings.map((s) => s.id);
  const index = ids.indexOf(video.id);
  const swapWith = parsed.data.direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= ids.length) {
    // 端にあるときは何もしない（UI 側でもボタンを無効化している）
    return { success: true };
  }
  [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];

  for (let i = 0; i < ids.length; i++) {
    const { error } = await admin
      .from("videos")
      .update({ sort_order: i })
      .eq("id", ids[i]);
    if (error) {
      console.error("[moveVideoAction] update failed", error);
      return { success: false, error: GENERIC_ERROR };
    }
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "video_reorder",
    targetType: "videos",
    targetId: video.id,
    metadata: {
      userId: video.user_id,
      placement: video.placement,
      direction: parsed.data.direction,
      order: ids,
    },
  });

  revalidateVideoPages(video.user_id);
  return { success: true };
}

// ------------------------------------------------------------
// 削除
// ------------------------------------------------------------

const videoIdSchema = z.object({ videoId: idSchema });

/**
 * 動画を削除する。Cloudflare 動画は Cloudflare 側のファイルも削除する
 * （失敗しても DB 行は消し、エラーはログ + 監査 metadata に残す）。
 */
export async function deleteVideoAction(input: {
  videoId: string;
}): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = videoIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "対象が不正です" };

  const admin = createAdminClient();
  const loaded = await loadVideo(admin, parsed.data.videoId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { video } = loaded;

  let cloudflareDeleteError: string | null = null;
  if (video.provider === "cloudflare" && video.cloudflare_uid) {
    const config = getCloudflareStreamConfig();
    if (!config) {
      cloudflareDeleteError = "Cloudflare Stream not configured";
    } else {
      try {
        await deleteStreamVideo(config, video.cloudflare_uid);
      } catch (err) {
        cloudflareDeleteError =
          err instanceof CloudflareStreamError ? err.message : String(err);
        console.error("[deleteVideoAction] Cloudflare delete failed", {
          uid: video.cloudflare_uid,
          err,
        });
      }
    }
  }

  const { data: deleted, error } = await admin
    .from("videos")
    .delete()
    .eq("id", video.id)
    .select("id");
  if (error || !deleted || deleted.length === 0) {
    console.error("[deleteVideoAction] delete failed", error);
    return { success: false, error: GENERIC_ERROR };
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "video_delete",
    targetType: "videos",
    targetId: video.id,
    metadata: {
      userId: video.user_id,
      placement: video.placement,
      provider: video.provider,
      cloudflareUid: video.cloudflare_uid,
      embedSourceUrl: video.embed_source_url,
      adminLabel: video.admin_label,
      status: video.status,
      cloudflareDeleteError,
    },
  });

  revalidateVideoPages(video.user_id);
  return { success: true };
}

// ------------------------------------------------------------
// 状態確認（Webhook 未達時の保険）
// ------------------------------------------------------------

/** Cloudflare に処理状態を問い合わせ、完了していれば公開（ready）にする。 */
export async function refreshVideoStatusAction(input: {
  videoId: string;
}): Promise<ActionResult<{ status: VideoStatus; detail: string | null }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = videoIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "対象が不正です" };

  const admin = createAdminClient();
  const loaded = await loadVideo(admin, parsed.data.videoId);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const { video } = loaded;

  if (video.status === "ready") {
    return { success: true, data: { status: "ready", detail: null } };
  }
  if (video.provider !== "cloudflare" || !video.cloudflare_uid) {
    return { success: true, data: { status: video.status, detail: null } };
  }

  const config = getCloudflareStreamConfig();
  if (!config) {
    return { success: false, error: CLOUDFLARE_NOT_CONFIGURED_MESSAGE };
  }

  let details: Awaited<ReturnType<typeof getStreamVideo>>;
  try {
    details = await getStreamVideo(config, video.cloudflare_uid);
  } catch (err) {
    console.error("[refreshVideoStatusAction] getStreamVideo failed", err);
    return {
      success: false,
      error: "状態の取得に失敗しました。しばらくしてから再度お試しください",
    };
  }

  if (!details.readyToStream) {
    const detail =
      details.state === "error"
        ? `変換に失敗しました${details.errorReasonText ? `（${details.errorReasonText}）` : ""}。削除して再登録してください`
        : `処理中です（${details.state ?? "状態不明"}）`;
    return { success: true, data: { status: "processing", detail } };
  }

  const siteUrl = await resolveSiteUrl();
  const result = await markVideoReady(admin, {
    cloudflareUid: video.cloudflare_uid,
    siteUrl,
  }).catch((err) => {
    console.error("[refreshVideoStatusAction] markVideoReady failed", err);
    return null;
  });
  if (!result) return { success: false, error: GENERIC_ERROR };

  if (result.outcome === "marked_ready") {
    await writeAuditLog({
      actorId: auth.adminId,
      action: "video_update",
      targetType: "videos",
      targetId: video.id,
      metadata: {
        userId: video.user_id,
        field: "status",
        before: "processing",
        after: "ready",
        via: "refresh",
      },
    });
  }

  revalidateVideoPages(video.user_id);
  return { success: true, data: { status: "ready", detail: null } };
}
