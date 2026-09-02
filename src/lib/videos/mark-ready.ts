import type { createAdminClient } from "@/lib/supabase/admin";
import { isVideoPlacement } from "@/lib/videos/constants";
import {
  countReadyVideos,
  sendVideoPublishedEmails,
} from "@/lib/videos/published-emails";

type AdminClient = ReturnType<typeof createAdminClient>;

export type MarkVideoReadyResult =
  | { outcome: "not_found" }
  | { outcome: "already_ready" }
  | { outcome: "marked_ready"; videoId: string; emailSent: boolean };

/**
 * Cloudflare の処理完了（readyToStream）を受けて videos.status を 'ready' にする。
 *
 * Webhook（`/api/webhooks/cloudflare-stream`）と管理画面の「状態を確認」ボタン
 * （`refreshVideoStatusAction`）の両方から呼ばれる共通処理。冪等:
 * - 該当 UID の行が無い → 何もしない（削除済み・別環境の動画など）
 * - 既に ready → 何もしない（Webhook 再送・二重確認）
 * - processing → ready に更新。その掲載場所で公開中が 0 本だった場合のみ掲載メール送信
 */
export async function markVideoReady(
  admin: AdminClient,
  params: { cloudflareUid: string; siteUrl: string },
): Promise<MarkVideoReadyResult> {
  const { data: row, error } = await admin
    .from("videos")
    .select("id, user_id, placement, status")
    .eq("cloudflare_uid", params.cloudflareUid)
    .maybeSingle();
  if (error) throw error;
  if (!row) return { outcome: "not_found" };
  if (row.status === "ready") return { outcome: "already_ready" };
  if (!isVideoPlacement(row.placement)) return { outcome: "not_found" };

  const readyBefore = await countReadyVideos(admin, row.user_id, row.placement);

  // status が processing のままの行だけを更新する（並行実行時の二重メール防止）
  const { data: updated, error: updateError } = await admin
    .from("videos")
    .update({ status: "ready" })
    .eq("id", row.id)
    .eq("status", "processing")
    .select("id");
  if (updateError) throw updateError;
  if (!updated || updated.length === 0) return { outcome: "already_ready" };

  let emailSent = false;
  if (readyBefore === 0) {
    await sendVideoPublishedEmails(admin, {
      userId: row.user_id,
      placement: row.placement,
      siteUrl: params.siteUrl,
    }).catch((err) => {
      console.error("[markVideoReady] published emails failed", err);
    });
    emailSent = true;
  }

  return { outcome: "marked_ready", videoId: row.id, emailSent };
}
