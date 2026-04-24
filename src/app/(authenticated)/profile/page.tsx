import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/shared/back-button";
import { createClient } from "@/lib/supabase/server";
import { calculateAge } from "@/lib/utils/calculate-age";

/**
 * COM-001: ユーザープロフィール（受注者向け自己プロフィール閲覧）
 *
 * CLI-020 と同じ視覚パターンを採用:
 * - plain div の情報テーブル（bg-primary/[0.08] ラベル + 白値セル、min-h-[40px]）
 * - CLI-006 由来の色味
 * - 編集 / もどる ボタンは centered stacked (max-w-xs rounded-pill)
 * - ※ Admin/Staff は middleware で CLI-024 にリダイレクトされる（REQ-ORG-011）
 */

type VerificationState = "approved" | "pending" | "none";

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <>
      <div className="flex min-h-[40px] items-center bg-primary/[0.08] px-4 py-2">
        <span className="text-body-sm font-medium">{label}</span>
      </div>
      <div className="flex min-h-[40px] items-center px-4 py-2">
        <span className="whitespace-pre-wrap text-body-sm">
          {value && value.trim() ? value : "—"}
        </span>
      </div>
    </>
  );
}

function VerificationBadge({
  state,
  approvedLabel,
  pendingLabel,
  noneLabel,
}: {
  state: VerificationState;
  approvedLabel: string;
  pendingLabel: string;
  noneLabel: string;
}) {
  const isApproved = state === "approved";
  const label =
    state === "approved"
      ? approvedLabel
      : state === "pending"
        ? pendingLabel
        : noneLabel;
  return (
    <span className="flex items-center gap-1 text-body-xs font-medium text-foreground">
      <img
        src="/images/icons/icon-tag.png"
        alt=""
        className={`size-3.5 ${isApproved ? "" : "grayscale opacity-50"}`}
      />
      {label}
    </span>
  );
}

function genderLabel(gender: string | null): string {
  switch (gender) {
    case "male":
      return "男性";
    case "female":
      return "女性";
    case "other":
      return "その他";
    default:
      return "";
  }
}

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select(
      "*, user_skills(*), user_qualifications(*), user_available_areas(*)",
    )
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/register/profile");
  }

  // Identity / CCUS verification states
  const { data: identityVerification } = await supabase
    .from("identity_verifications")
    .select("status")
    .eq("user_id", user.id)
    .eq("document_type", "identity")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: ccusVerification } = await supabase
    .from("identity_verifications")
    .select("status")
    .eq("user_id", user.id)
    .eq("document_type", "ccus")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const identityState: VerificationState =
    profile.identity_verified || identityVerification?.status === "approved"
      ? "approved"
      : identityVerification?.status === "pending"
        ? "pending"
        : "none";

  const ccusState: VerificationState =
    profile.ccus_verified || ccusVerification?.status === "approved"
      ? "approved"
      : ccusVerification?.status === "pending"
        ? "pending"
        : "none";

  const displayName =
    profile.last_name && profile.first_name
      ? `${profile.last_name}　${profile.first_name}`
      : "未設定";

  const age = profile.birth_date ? calculateAge(profile.birth_date) : null;
  const avatarUrl = profile.avatar_url;

  // 能力の表示用整形
  type Skill = {
    id: string;
    trade_type: string;
    experience_years: number | null;
  };
  type Qualification = { id: string; qualification_name: string };
  type Area = { id: string; prefecture: string };

  const skills = (profile.user_skills ?? []) as Skill[];
  const qualifications = (profile.user_qualifications ?? []) as Qualification[];
  const areas = (profile.user_available_areas ?? []) as Area[];

  const tradeTypeText =
    skills.length > 0 ? skills.map((s) => s.trade_type).join("、") : null;
  const experienceYearsText =
    skills.length > 0
      ? skills
          .filter((s) => s.experience_years != null)
          .map((s) => `${s.trade_type} ${s.experience_years}年`)
          .join("、") || null
      : null;
  const skillTags = (profile.skill_tags ?? []) as string[];
  const skillTagsText = skillTags.length > 0 ? skillTags.join("、") : null;
  const qualificationsText =
    qualifications.length > 0
      ? qualifications.map((q) => q.qualification_name).join("、")
      : null;
  const areasText =
    areas.length > 0 ? areas.map((a) => a.prefecture).join("、") : null;

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      {/* タイトル */}
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        ユーザープロフィール
      </h1>

      {/* プロフィール領域（アバター + 氏名 + バッジ） */}
      <div className="mt-6 flex items-center gap-4">
        <div className="size-20 shrink-0 overflow-hidden rounded-full bg-background border border-border/30">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`${displayName}のプロフィール画像`}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <img
                src="/images/icons/icon-avatar.png"
                alt=""
                className="size-10 opacity-40"
              />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-body-lg font-bold text-foreground">
            {displayName}
            {age !== null && (
              <span className="text-body-md font-normal">（{age}歳）</span>
            )}
          </p>
          <div className="flex flex-wrap gap-3">
            <VerificationBadge
              state={identityState}
              approvedLabel="本人確認済み"
              pendingLabel="本人確認申請中"
              noneLabel="本人確認未承認"
            />
            <VerificationBadge
              state={ccusState}
              approvedLabel="CCUS登録済み"
              pendingLabel="CCUS申請中"
              noneLabel="CCUS未登録"
            />
          </div>
        </div>
      </div>

      {/* 基本情報 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">基本情報</h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/10 bg-background">
          <DetailRow label="メールアドレス" value={profile.email} />
          <DetailRow label="会社名/屋号" value={profile.company_name} />
          <DetailRow label="お住まい" value={profile.prefecture} />
          <DetailRow label="対応可能エリア" value={areasText} />
          <DetailRow label="性別" value={genderLabel(profile.gender)} />
        </div>
      </section>

      {/* 自己紹介 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">自己紹介</h2>
        <div className="mt-2 rounded-[8px] border border-border/10 bg-background p-4">
          <p className="whitespace-pre-wrap text-body-sm text-foreground">
            {profile.bio && profile.bio.trim()
              ? profile.bio
              : "自己紹介が設定されていません。"}
          </p>
        </div>
      </section>

      {/* 能力 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">能力</h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/10 bg-background">
          <DetailRow label="対応できる職種" value={tradeTypeText} />
          <DetailRow label="経験年数" value={experienceYearsText} />
          <DetailRow label="保有スキル" value={skillTagsText} />
          <DetailRow label="保有資格" value={qualificationsText} />
        </div>
      </section>

      {/* PR 動画（登録があれば） */}
      {profile.video_url && (
        <section className="mt-6">
          <h2 className="text-body-lg font-bold text-foreground">PR動画</h2>
          <div className="mt-2 rounded-[8px] border border-border/10 bg-background p-4">
            <a
              href={profile.video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-body-sm text-primary underline"
            >
              動画を見る
            </a>
          </div>
        </section>
      )}

      {/* アクションボタン */}
      <div className="mt-8 flex flex-col items-center gap-3">
        <Button
          asChild
          size="lg"
          className="w-full max-w-xs rounded-pill bg-primary text-white hover:bg-primary/90"
        >
          <Link href="/profile/edit">編集する</Link>
        </Button>
        <BackButton className="w-full max-w-xs" href="/mypage" />
      </div>

      {/* 退会希望リンク */}
      <div className="mt-6 text-center">
        <Link
          href="/profile/withdrawal"
          className="text-body-sm text-muted-foreground underline"
        >
          退会希望の方はこちら
        </Link>
      </div>
    </div>
  );
}
