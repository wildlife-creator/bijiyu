import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { VideoPostForm } from "../video-post-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * ADM-010: 受注者PR動画投稿（users.video_url）。
 */
export default async function AdminVideoPostPage({ params }: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: target } = await admin
    .from("users")
    .select("id, video_url")
    .eq("id", id)
    .maybeSingle();

  if (!target) notFound();

  return (
    <VideoPostForm userId={id} currentUrl={target.video_url} variant="pr" />
  );
}
