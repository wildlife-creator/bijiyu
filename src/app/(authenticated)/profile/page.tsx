import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { calculateAge } from "@/lib/utils/calculate-age";

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
      "*, user_skills(*), user_qualifications(*), user_available_areas(*)"
    )
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/register/profile");
  }

  // Fetch identity verification latest record (any status)
  const { data: identityVerification } = await supabase
    .from("identity_verifications")
    .select("status")
    .eq("user_id", user.id)
    .eq("document_type", "identity")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fetch CCUS verification latest record (any status)
  const { data: ccusVerification } = await supabase
    .from("identity_verifications")
    .select("status")
    .eq("user_id", user.id)
    .eq("document_type", "ccus")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  type VerificationState = "approved" | "pending" | "none";

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
      ? `${profile.last_name}\u3000${profile.first_name}`
      : "未設定";

  const age = profile.birth_date ? calculateAge(profile.birth_date) : null;

  const genderLabel = (gender: string | null): string => {
    switch (gender) {
      case "male":
        return "男性";
      case "female":
        return "女性";
      case "other":
        return "その他";
      default:
        return "未設定";
    }
  };

  // avatar_url already stores the full public URL
  const avatarUrl = profile.avatar_url;

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Link
            href="/mypage"
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-card"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <h1 className="text-heading-lg font-bold text-foreground">
            ユーザープロフィール
          </h1>
        </div>

        {/* Profile area */}
        <section className="space-y-3">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="size-20 shrink-0 overflow-hidden rounded-full bg-card">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`${displayName}のプロフィール画像`}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <span className="text-heading-lg">
                    {profile.last_name?.charAt(0) ?? "?"}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-heading-md font-bold text-foreground">
                {displayName}
                {age !== null && (
                  <span className="text-body-md font-normal text-muted-foreground">
                    （{age}歳）
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Verified badges */}
          <div className="flex flex-wrap gap-3">
            <span className="flex items-center gap-1.5 text-body-sm text-bijiyu-gray-medium">
              <img
                src="/images/icons/icon-tag.png"
                alt=""
                className={`size-4 ${identityState === "approved" ? "" : "grayscale opacity-50"}`}
              />
              {identityState === "approved" ? "本人確認済み" : identityState === "pending" ? "本人確認申請中" : "本人確認未承認"}
            </span>
            <span className="flex items-center gap-1.5 text-body-sm text-bijiyu-gray-medium">
              <img
                src="/images/icons/icon-tag.png"
                alt=""
                className={`size-4 ${ccusState === "approved" ? "" : "grayscale opacity-50"}`}
              />
              {ccusState === "approved" ? "CCUS登録済み" : ccusState === "pending" ? "CCUS申請中" : "CCUS未登録"}
            </span>
          </div>
        </section>

        {/* Basic info */}
        <section className="space-y-3">
          <h2 className="text-heading-md font-bold text-foreground">
            基本情報
          </h2>

          <div className="rounded-lg border border-border bg-card p-4">
            <dl className="space-y-3">
              <div>
                <dt className="text-body-sm text-muted-foreground">
                  メールアドレス
                </dt>
                <dd className="text-body-md text-foreground">
                  {profile.email ?? "未設定"}
                </dd>
              </div>

              <div>
                <dt className="text-body-sm text-muted-foreground">
                  会社名/屋号
                </dt>
                <dd className="text-body-md text-foreground">
                  {profile.company_name || "未設定"}
                </dd>
              </div>

              <div>
                <dt className="text-body-sm text-muted-foreground">都道府県</dt>
                <dd className="text-body-md text-foreground">
                  {profile.prefecture || "未設定"}
                </dd>
              </div>

              <div>
                <dt className="text-body-sm text-muted-foreground">性別</dt>
                <dd className="text-body-md text-foreground">
                  {genderLabel(profile.gender)}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Bio */}
        <section className="space-y-3">
          <h2 className="text-heading-md font-bold text-foreground">
            自己紹介
          </h2>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="whitespace-pre-wrap text-body-md text-foreground">
              {profile.bio || "自己紹介が設定されていません。"}
            </p>
          </div>
        </section>

        {/* Skills & Qualifications */}
        <section className="space-y-3">
          <h2 className="text-heading-md font-bold text-foreground">能力</h2>

          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            {/* Trade types */}
            <div className="space-y-1">
              <h3 className="text-body-sm text-muted-foreground">
                職種・経験年数
              </h3>
              {profile.user_skills && profile.user_skills.length > 0 ? (
                <ul className="space-y-1">
                  {profile.user_skills.map(
                    (skill: {
                      id: string;
                      trade_type: string;
                      experience_years: number | null;
                    }) => (
                      <li key={skill.id} className="text-body-md text-foreground">
                        {skill.trade_type}
                        {skill.experience_years != null && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({skill.experience_years}年)
                          </span>
                        )}
                      </li>
                    )
                  )}
                </ul>
              ) : (
                <p className="text-body-md text-muted-foreground">未設定</p>
              )}
            </div>

            {/* Qualifications */}
            <div className="space-y-1">
              <h3 className="text-body-sm text-muted-foreground">保有資格</h3>
              {profile.user_qualifications &&
              profile.user_qualifications.length > 0 ? (
                <ul className="space-y-1">
                  {profile.user_qualifications.map(
                    (qual: { id: string; qualification_name: string }) => (
                      <li key={qual.id} className="text-body-md text-foreground">
                        {qual.qualification_name}
                      </li>
                    )
                  )}
                </ul>
              ) : (
                <p className="text-body-md text-muted-foreground">未設定</p>
              )}
            </div>

            {/* Available areas */}
            <div className="space-y-1">
              <h3 className="text-body-sm text-muted-foreground">
                対応可能エリア
              </h3>
              {profile.user_available_areas &&
              profile.user_available_areas.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.user_available_areas.map(
                    (area: { id: string; prefecture: string }) => (
                      <Badge key={area.id} variant="outline">
                        {area.prefecture}
                      </Badge>
                    )
                  )}
                </div>
              ) : (
                <p className="text-body-md text-muted-foreground">未設定</p>
              )}
            </div>
          </div>
        </section>

        {/* PR Video (conditional) */}
        {profile.video_url && (
          <section className="space-y-3">
            <h2 className="text-heading-md font-bold text-foreground">
              PR動画
            </h2>
            <div className="rounded-lg border border-border bg-card p-4">
              <a
                href={profile.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-body-md text-secondary underline"
              >
                動画を見る
              </a>
            </div>
          </section>
        )}

        {/* Action buttons */}
        <div className="space-y-3">
          <Button variant="secondary" asChild size="lg" className="w-full rounded-pill">
            <Link href="/profile/edit">編集する</Link>
          </Button>

          <Button asChild variant="outline" size="lg" className="w-full rounded-pill border-bijiyu-gray text-bijiyu-gray">
            <Link href="/mypage">もどる</Link>
          </Button>
        </div>

        {/* Withdrawal link */}
        <div className="text-center">
          <Link
            href="/profile/withdrawal"
            className="text-body-sm text-muted-foreground underline"
          >
            退会する
          </Link>
        </div>
      </div>
    </div>
  );
}
