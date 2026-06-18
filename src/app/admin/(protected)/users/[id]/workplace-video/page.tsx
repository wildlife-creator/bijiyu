import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { VideoPostForm } from "../video-post-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * ADM-010B: 職場紹介動画投稿（client_profiles.workplace_video_url）。
 * ADM-010 と同一レイアウトを流用し、対象カラム・Server Action のみ差し替える。
 */
export default async function AdminWorkplaceVideoPostPage({
  params,
}: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: target } = await admin
    .from("users")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!target) notFound();

  const { data: profile } = await admin
    .from("client_profiles")
    .select("workplace_video_url")
    .eq("user_id", id)
    .maybeSingle();

  return (
    <VideoPostForm
      userId={id}
      currentUrl={profile?.workplace_video_url ?? null}
      variant="workplace"
      backHref={`/admin/clients/${id}`}
    />
  );
}
