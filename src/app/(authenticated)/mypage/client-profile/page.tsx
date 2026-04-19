import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import { createClient } from "@/lib/supabase/server";
import { resolveParticipantName } from "@/lib/utils/display-name";

/**
 * CLI-020 発注者情報詳細
 *
 * - Owner: 自身の client_profiles を表示
 * - Admin: 所属組織 Owner の client_profiles を表示
 * - Staff: 閲覧のみ（編集ボタン非表示）
 * - 個人発注者: 自身の client_profiles を表示
 *
 * organization_id が NULL（個人/小規模プラン）→ 自身の profile
 * organization_id が NOT NULL（法人プラン）→ 組織 Owner の profile
 */

async function resolveProfileContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorUserId: string,
): Promise<{
  profileUserId: string;
  orgRole: "owner" | "admin" | "staff" | null;
  organizationId: string | null;
}> {
  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, org_role, organizations!inner(owner_id)")
    .eq("user_id", actorUserId)
    .maybeSingle();

  if (!member) {
    return { profileUserId: actorUserId, orgRole: null, organizationId: null };
  }

  const orgRole = (member.org_role as "owner" | "admin" | "staff") ?? null;
  const org = Array.isArray(member.organizations)
    ? member.organizations[0]
    : member.organizations;
  const ownerUserId =
    (org as { owner_id: string } | null)?.owner_id ?? actorUserId;

  return {
    profileUserId: ownerUserId,
    orgRole,
    organizationId: member.organization_id ?? null,
  };
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="border-t border-border first:border-t-0">
      <div className="bg-muted/60 px-4 py-2">
        <p className="text-body-sm font-medium text-muted-foreground">{label}</p>
      </div>
      <div className="bg-background px-4 py-3">
        <p className="whitespace-pre-wrap text-body-md text-foreground">
          {value && value.trim() ? value : "—"}
        </p>
      </div>
    </div>
  );
}

export default async function ClientProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { profileUserId, orgRole, organizationId } = await resolveProfileContext(
    supabase,
    user.id,
  );

  const { data: profile } = await supabase
    .from("client_profiles")
    .select(
      `display_name, address, image_url, recruit_job_types, recruit_area,
       employee_scale, working_way, language, message`,
    )
    .eq("user_id", profileUserId)
    .maybeSingle();

  const { data: ownerUser } = await supabase
    .from("users")
    .select("last_name, first_name, deleted_at")
    .eq("id", profileUserId)
    .maybeSingle();

  const displayName = resolveParticipantName({
    displayName: profile?.display_name ?? null,
    lastName: ownerUser?.last_name ?? null,
    firstName: ownerUser?.first_name ?? null,
    deletedAt: ownerUser?.deleted_at ?? null,
  });

  // 評判集計: rating_again の Good 数
  const { data: reviews } = await supabase
    .from("client_reviews")
    .select("rating_again")
    .eq("reviewee_id", profileUserId);

  const reputationGood = (reviews ?? []).filter(
    (r) => r.rating_again === "good",
  ).length;
  const totalReviews = reviews?.length ?? 0;

  const isStaff = orgRole === "staff";
  const canEdit = orgRole === "owner" || orgRole === "admin" || orgRole === null;
  const isCorporate = organizationId !== null;

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        発注者情報詳細
      </h1>

      {/* 担当者を確認する ボタン（法人プランのみ、組織メンバー全員に表示） */}
      {isCorporate && (
        <div className="mt-6 flex justify-end">
          <Button
            asChild
            variant="outline"
            className="rounded-pill border-primary text-primary hover:bg-primary/10"
          >
            <Link href="/mypage/members">担当者を確認する</Link>
          </Button>
        </div>
      )}

      {/* プロフィール画像 + 社名 + 住所 */}
      <div className="mt-4 flex items-center gap-4">
        <div className="size-20 shrink-0 overflow-hidden rounded-full bg-background border border-border">
          {profile?.image_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={profile.image_url}
              alt={`${displayName}のプロフィール画像`}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-body-xs text-muted-foreground">
              画像
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-lg font-bold text-foreground">
            {displayName}
          </p>
          {profile?.address && (
            <p className="truncate text-body-sm text-muted-foreground">
              {profile.address}
            </p>
          )}
        </div>
      </div>

      {/* 基本情報 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">基本情報</h2>
        <Card className="mt-2 overflow-hidden rounded-[8px] p-0">
          <DetailRow
            label="募集職種"
            value={
              profile?.recruit_job_types && profile.recruit_job_types.length > 0
                ? profile.recruit_job_types.join("、")
                : null
            }
          />
          <DetailRow
            label="募集エリア"
            value={
              profile?.recruit_area && profile.recruit_area.length > 0
                ? profile.recruit_area.join("、")
                : null
            }
          />
          <DetailRow
            label="従業員規模"
            value={
              profile?.employee_scale ? `${profile.employee_scale}人` : null
            }
          />
          <DetailRow label="求める働き方" value={profile?.working_way ?? null} />
          <DetailRow label="言語" value={profile?.language ?? null} />
        </Card>
      </section>

      {/* メッセージ */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">メッセージ</h2>
        <Card className="mt-2 rounded-[8px] p-4">
          <p className="whitespace-pre-wrap text-body-md text-foreground">
            {profile?.message || "—"}
          </p>
        </Card>
      </section>

      {/* 評判 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">評判</h2>
        <Card className="mt-2 rounded-[8px] p-4">
          {totalReviews === 0 ? (
            <p className="text-body-md text-muted-foreground">
              評判はまだありません
            </p>
          ) : (
            <div className="flex items-center justify-between text-body-md text-foreground">
              <span>・また仕事を受けたい</span>
              <span className="flex items-center gap-1 text-muted-foreground">
                👍 {reputationGood}
              </span>
            </div>
          )}
        </Card>
      </section>

      {/* 編集する + もどる */}
      <div className="mt-8 flex flex-col items-center gap-3">
        {canEdit && !isStaff && (
          <Button
            asChild
            size="lg"
            className="w-full max-w-xs rounded-pill bg-primary text-white hover:bg-primary/90"
          >
            <Link href="/mypage/client-profile/edit">編集する</Link>
          </Button>
        )}
        <BackButton className="w-full max-w-xs" />
      </div>
    </div>
  );
}
