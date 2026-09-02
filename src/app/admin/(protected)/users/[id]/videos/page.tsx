import { notFound } from "next/navigation";

import { isCloudflareStreamConfigured } from "@/lib/cloudflare/stream";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserDisplayName } from "@/lib/utils/display-name";
import { getVideoThumbnail } from "@/lib/video-embed/fetch-thumbnail";
import {
  VIDEO_PLACEMENT_DESCRIPTIONS,
  VIDEO_PLACEMENT_LABELS,
  VIDEO_PLACEMENTS,
  isVideoPlacement,
  type VideoPlacement,
} from "@/lib/videos/constants";
import { staticThumbnailForRow } from "@/lib/videos/display";

import { VideoManager, type VideoItemData } from "./video-manager";

// 掲載メール（組織 broadcast）を送る Server Action を持つため実行時間上限を延長
export const maxDuration = 60;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placement?: string; backTo?: string }>;
}

/**
 * ADM-027: ユーザー動画管理（P4 動画基盤）。
 * 旧 ADM-010（受注者PR動画）/ ADM-010B（職場紹介動画）の URL 1 本フォームを置き換え、
 * 掲載場所ごとに複数本を「ファイルアップロード or URL」で追加・ラベル・表示順・削除する。
 * デザイン: ADM-010.png（design-assets/screens）のレイアウトを踏襲。
 */
export default async function AdminUserVideosPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data: user } = await admin
    .from("users")
    .select("id, role, last_name, first_name, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (!user) notFound();

  const defaultPlacement: VideoPlacement = isVideoPlacement(sp.placement)
    ? sp.placement
    : user.role === "client"
      ? "client_page"
      : "contractor_page";
  // backTo は admin 配下の遷移元のみ受け入れる（公開リダイレクター悪用防止）
  const backHref =
    typeof sp.backTo === "string" && sp.backTo.startsWith("/admin/")
      ? sp.backTo
      : `/admin/users/${id}`;

  const { data: rows } = await admin
    .from("videos")
    .select(
      "id, placement, sort_order, provider, cloudflare_uid, embed_source_url, admin_label, status, created_at",
    )
    .eq("user_id", id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const items: VideoItemData[] = await Promise.all(
    (rows ?? []).map(async (row) => ({
      id: row.id,
      placement: row.placement,
      provider: row.provider === "cloudflare" ? "cloudflare" : "external",
      status: row.status,
      adminLabel: row.admin_label,
      source: row.cloudflare_uid ?? row.embed_source_url ?? "",
      thumbnailUrl:
        staticThumbnailForRow(row) ??
        (row.embed_source_url
          ? await getVideoThumbnail(row.embed_source_url)
          : null),
      createdAt: row.created_at,
    })),
  );

  const groups = VIDEO_PLACEMENTS.map((placement) => ({
    placement,
    label: VIDEO_PLACEMENT_LABELS[placement],
    description: VIDEO_PLACEMENT_DESCRIPTIONS[placement],
    videos: items.filter((v) => v.placement === placement),
  }));

  const displayName = getUserDisplayName({
    lastName: user.last_name,
    firstName: user.first_name,
    deletedAt: null,
  });

  return (
    <VideoManager
      userId={id}
      displayName={displayName}
      isDeleted={!!user.deleted_at}
      backHref={backHref}
      defaultPlacement={defaultPlacement}
      cloudflareEnabled={isCloudflareStreamConfigured()}
      groups={groups}
    />
  );
}
