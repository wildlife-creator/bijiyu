import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { CollapsibleList } from "@/components/master/collapsible-list";
import { AreaList } from "@/components/area/area-list";
import { VideoEmbed } from "@/components/video-embed/video-embed";
import type { AreaForDisplay } from "@/lib/utils/format-areas";
import { hasActiveOption } from "@/lib/billing/options";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateAge } from "@/lib/utils/calculate-age";
import { getUserDisplayName } from "@/lib/utils/display-name";
import { formatResidence } from "@/lib/utils/format-residence";

interface PageProps {
  params: Promise<{ id: string }>;
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode | string | null | undefined;
}) {
  const isString = typeof value === "string";
  if (value == null || (isString && !value)) return null;
  return (
    <>
      <div className="bg-primary/[0.08] px-4 py-2">
        <span className="text-body-sm font-medium">{label}</span>
      </div>
      <div className="px-4 py-2">
        {isString ? <span className="text-body-sm">{value}</span> : value}
      </div>
    </>
  );
}

/**
 * ADM-009: ユーザーアカウント詳細（video-display Task 5.3）。
 *
 * 本 spec のスコープは「動画運用に必要な最小サーフェス」:
 * 購入オプションに応じた投稿ボタンの動的表示（0/1/2 個）+ PR動画表示 +
 * ユーザー特定に必要な基本情報。評価系は将来の admin spec で拡張する。
 */
export default async function AdminUserDetailPage({ params }: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: u } = await admin
    .from("users")
    .select(
      `id, avatar_url, last_name, first_name, birth_date, deleted_at,
       identity_verified, ccus_verified, bio, prefecture, municipality, gender,
       skill_tags, video_url,
       user_skills(trade_type, experience_years),
       user_qualifications(qualification_name),
       user_available_areas(prefecture, municipality)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!u) notFound();

  // active オプション判定（admin 画面のため admin client で一貫して判定）
  const [hasVideo, hasWorkplaceVideo] = await Promise.all([
    hasActiveOption(admin, id, "video"),
    hasActiveOption(admin, id, "video_workplace"),
  ]);

  const displayName = getUserDisplayName({
    lastName: u.last_name,
    firstName: u.first_name,
    deletedAt: u.deleted_at,
  });
  const age = u.birth_date ? calculateAge(u.birth_date) : null;

  const skills =
    (u.user_skills as { trade_type: string; experience_years: number | null }[]) ??
    [];
  const qualifications =
    (u.user_qualifications as { qualification_name: string }[]) ?? [];
  const areaRows =
    (u.user_available_areas as { prefecture: string; municipality: string | null }[]) ??
    [];
  const areas: AreaForDisplay[] = areaRows.map((a) => ({
    prefecture: a.prefecture,
    municipality: a.municipality,
  }));
  const skillTags = (u.skill_tags ?? []) as string[];

  const showVideo = !!u.video_url && hasVideo;

  return (
    <div className="px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        ユーザーアカウント詳細
      </h1>

      {/* 動画投稿ボタン（active オプションに応じ 0/1/2 個を動的表示） */}
      {(hasVideo || hasWorkplaceVideo) && (
        <div className="mt-4 flex flex-col items-end gap-2">
          {hasVideo && (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={`/admin/users/${id}/video`}>
                受注者PR動画を投稿する
              </Link>
            </Button>
          )}
          {hasWorkplaceVideo && (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={`/admin/users/${id}/workplace-video`}>
                職場紹介動画を投稿する
              </Link>
            </Button>
          )}
        </div>
      )}

      {/* ヘッダー（アバター + 氏名 + バッジ） */}
      <div className="mt-6 flex items-center gap-4">
        <div className="size-16 shrink-0 overflow-hidden rounded-full bg-background border border-border/30">
          {u.avatar_url && !u.deleted_at ? (
            <img
              src={u.avatar_url}
              alt={displayName}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <img
                src="/images/icons/icon-avatar.png"
                alt=""
                className="size-8 opacity-40"
              />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-body-lg font-bold text-foreground">
            {displayName}
            {age !== null && (
              <span className="text-body-md font-normal">（{age}歳）</span>
            )}
          </p>
          <div className="mt-1 flex flex-wrap gap-3 text-body-sm">
            {u.identity_verified && <span>本人確認済み</span>}
            {u.ccus_verified && <span>CCUS登録済み</span>}
          </div>
        </div>
      </div>

      {/* PR動画（video_url 設定済み かつ active な 'video' がある場合のみ） */}
      {showVideo && (
        <section className="mt-6">
          <h2 className="text-body-lg font-bold text-foreground">PR動画</h2>
          <div className="mt-2 rounded-[8px] border border-border/10 bg-background p-4">
            <VideoEmbed url={u.video_url!} label="PR動画" />
          </div>
        </section>
      )}

      {/* 基本情報 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">基本情報</h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/10 bg-background">
          <InfoRow
            label="居住地"
            value={formatResidence(u.prefecture, u.municipality)}
          />
          <InfoRow label="性別" value={u.gender} />
          <InfoRow
            label="対応可能エリア"
            value={areas.length > 0 ? <AreaList areas={areas} /> : null}
          />
        </div>
      </section>

      {/* 自己紹介 */}
      {u.bio && (
        <section className="mt-6">
          <h2 className="text-body-lg font-bold text-foreground">自己紹介</h2>
          <div className="mt-2 rounded-[8px] border border-border/10 bg-background p-4">
            <p className="whitespace-pre-wrap text-body-sm text-foreground">
              {u.bio}
            </p>
          </div>
        </section>
      )}

      {/* 能力 */}
      {(skills.length > 0 || skillTags.length > 0 || qualifications.length > 0) && (
        <section className="mt-6">
          <h2 className="text-body-lg font-bold text-foreground">能力</h2>
          <div className="mt-2 overflow-hidden rounded-[8px] border border-border/10 bg-background">
            {skills.length > 0 && (
              <InfoRow
                label="対応できる職種"
                value={
                  <CollapsibleList
                    items={skills.map((s) => s.trade_type)}
                    initialLimit={5}
                  />
                }
              />
            )}
            {skillTags.length > 0 && (
              <InfoRow
                label="保有スキル"
                value={<CollapsibleList items={skillTags} initialLimit={8} />}
              />
            )}
            {qualifications.length > 0 && (
              <InfoRow
                label="保有資格"
                value={
                  <CollapsibleList
                    items={qualifications.map((q) => q.qualification_name)}
                    initialLimit={5}
                  />
                }
              />
            )}
          </div>
        </section>
      )}

      <div className="mt-10 flex flex-col items-center gap-3">
        <Button
          asChild
          variant="outline"
          className="w-full max-w-xs rounded-full"
        >
          <Link href="/admin/users">もどる</Link>
        </Button>
      </div>
    </div>
  );
}
