import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { calculateAge } from "@/lib/utils/calculate-age";
import {
  resolveClientProfileForRow,
  resolveParticipantName,
} from "@/lib/utils/display-name";
import { SuccessToast } from "./success-toast";

// -------------------------------------------------------------------
// Menu item definitions
// -------------------------------------------------------------------
interface MenuItem {
  label: string;
  href: string;
}

// Section 1: Find work (all users)
const FIND_WORK_MENU: MenuItem[] = [
  { label: "募集案件一覧", href: "/jobs/search" },
  { label: "発注者一覧", href: "/clients" },
  { label: "マイリスト", href: "/favorites" },
  { label: "メッセージ・スカウト", href: "/messages" },
];

// Section 2: Check schedule (all users)
const CHECK_SCHEDULE_MENU: MenuItem[] = [
  { label: "応募履歴", href: "/applications/history" },
  { label: "空き日程一覧", href: "/schedule" },
];

// Section 3: Find contractors (client only)
const FIND_CONTRACTORS_MENU: MenuItem[] = [
  { label: "ユーザー一覧", href: "/users/contractors" },
  { label: "マイリスト", href: "/favorites" },
  { label: "応募一覧", href: "/applications/received" },
  { label: "メッセージ・スカウト", href: "/messages" },
];

// Section 4: Manage orders (client only)
const MANAGE_ORDERS_MENU: MenuItem[] = [
  { label: "発注履歴", href: "/applications/orders" },
  { label: "募集現場一覧", href: "/jobs/manage" },
];

// Section 5: Update info - base (all users)
const UPDATE_INFO_MENU: MenuItem[] = [
  { label: "プラン変更", href: "/billing" },
  { label: "本人確認・CCUS登録", href: "/profile/verification" },
  { label: "ユーザープロフィール変更", href: "/profile" },
];

// Section 5: Update info - client additions
const UPDATE_INFO_CLIENT_MENU: MenuItem[] = [
  { label: "スカウトメッセージテンプレート一覧", href: "/scouts/templates" },
  { label: "発注者情報詳細", href: "/clients/profile" },
];

const CORPORATE_ONLY_MENU: MenuItem = {
  label: "担当者一覧",
  href: "/organization/members",
};

// FAQ & Contact (at the end of update info section)
const SUPPORT_MENU: MenuItem[] = [
  { label: "よくある質問", href: "/faq" },
  { label: "お問い合わせ", href: "/contact" },
];

// -------------------------------------------------------------------
// Verification status types
// -------------------------------------------------------------------
type VerificationState = "approved" | "pending" | "none";

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
  const label = state === "approved" ? approvedLabel : state === "pending" ? pendingLabel : noneLabel;

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

// -------------------------------------------------------------------
// Reusable menu list component
// -------------------------------------------------------------------
function MenuList({ items }: { items: MenuItem[] }) {
  return (
    <ul className="divide-y divide-[rgba(30,30,30,0.1)] rounded-lg border border-[rgba(30,30,30,0.1)] bg-white">
      {items.map((item) => (
        <li key={item.href + item.label}>
          <Link
            href={item.href}
            className="flex items-center px-4 py-3 text-body-lg font-medium text-foreground transition-colors hover:bg-muted"
          >
            <span className="flex-1">{item.label}</span>
            <ChevronRight className="size-4 text-bijiyu-purple-bright" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// -------------------------------------------------------------------
// Page
// -------------------------------------------------------------------
export default async function MyPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch user data including profile fields
  const { data: userData } = await supabase
    .from("users")
    .select("role, last_name, first_name, birth_date, bio, avatar_url, identity_verified, ccus_verified")
    .eq("id", user.id)
    .single();

  if (!userData) {
    redirect("/register/profile");
  }

  // Fetch user skills
  const { data: userSkills } = await supabase
    .from("user_skills")
    .select("trade_type, experience_years")
    .eq("user_id", user.id);

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

  // Fetch accepted applications (稼働予定) with job details
  const { data: acceptedApplications } = await supabase
    .from("applications")
    .select(`
      id,
      client_reviews (id),
      user_reviews (id),
      jobs (
        id,
        title,
        trade_type,
        headcount,
        recruit_end_date,
        reward_lower,
        reward_upper,
        prefecture,
        recruit_start_date,
        recruit_end_date,
        owner_id,
        organization_id,
        owner:users!owner_id(
          last_name, first_name, deleted_at,
          client_profiles(display_name, image_url)
        ),
        organization:organizations(
          owner_user:users!owner_id(
            last_name, first_name, deleted_at,
            client_profiles(display_name, image_url)
          )
        )
      )
    `)
    .eq("applicant_id", user.id)
    .eq("status", "accepted")
    .order("updated_at", { ascending: false });

  // Fetch subscription status for client menu visibility
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, plan_type")
    .eq("user_id", user.id)
    .in("status", ["active", "past_due"])
    .maybeSingle();

  const isClient =
    (userData.role === "client" || userData.role === "staff") &&
    subscription !== null;

  const isCorporate =
    isClient &&
    subscription !== null &&
    (subscription.plan_type === "corporate" ||
      subscription.plan_type === "corporate_premium");

  const displayName =
    userData.last_name && userData.first_name
      ? `${userData.last_name}\u3000${userData.first_name}`
      : "ユーザー";

  const age = userData.birth_date ? calculateAge(userData.birth_date) : null;

  // Determine verification states
  const identityState: VerificationState =
    userData.identity_verified || identityVerification?.status === "approved"
      ? "approved"
      : identityVerification?.status === "pending"
        ? "pending"
        : "none";

  const ccusState: VerificationState =
    userData.ccus_verified || ccusVerification?.status === "approved"
      ? "approved"
      : ccusVerification?.status === "pending"
        ? "pending"
        : "none";

  // avatar_url already stores the full public URL from upload action
  const avatarUrl = userData.avatar_url;

  // Build section 5 menu items
  const updateInfoItems: MenuItem[] = [
    ...UPDATE_INFO_MENU,
    ...(isClient ? UPDATE_INFO_CLIENT_MENU : []),
    ...(isCorporate ? [CORPORATE_ONLY_MENU] : []),
    ...SUPPORT_MENU,
  ];

  // Max experience years from skills
  const maxExperienceYears = userSkills?.reduce((max, skill) => {
    return skill.experience_years && skill.experience_years > max
      ? skill.experience_years
      : max;
  }, 0) ?? 0;

  const skillNames = userSkills?.map((s) => s.trade_type).join("、") || null;

  return (
    <div className="min-h-dvh bg-muted px-4 py-6 md:px-8 md:py-8">
      <SuccessToast />
      {/* Page title — CSS: 22px, bold, #601986 */}
      <h1 className="text-center text-[22px] leading-[32px] font-bold text-bijiyu-purple">マイページ</h1>

      {/* Profile area */}
      <div className="mt-6 flex items-start gap-4">
        {/* Avatar — 60-80px round */}
        <div className="size-16 shrink-0 overflow-hidden rounded-full bg-white md:size-20">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`${displayName}のプロフィール画像`}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-muted">
              <img
                src="/images/icons/icon-avatar.png"
                alt=""
                className="size-8 opacity-50 md:size-10"
              />
            </div>
          )}
        </div>

        {/* User info — CSS: name 16px bold, skills 11px, badges 11px medium */}
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-[16px] leading-[23px] font-bold text-foreground">
            {displayName}
            {age !== null && `（${age}歳）`}
          </p>
          {skillNames && (
            <p className="text-body-xs text-foreground">{skillNames}</p>
          )}
          {maxExperienceYears > 0 && (
            <p className="text-body-xs text-foreground">
              経験年数　{maxExperienceYears}年
            </p>
          )}
          <div className="flex flex-wrap gap-3 pt-0.5">
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

      {/* Bio section — heading CSS: 15px, bold */}
      {userData.bio && (
        <section className="mt-6">
          <h2 className="text-body-lg font-bold text-foreground">自己紹介</h2>
          <div className="mt-2 rounded-lg border border-[rgba(30,30,30,0.1)] bg-white p-4">
            <p className="whitespace-pre-wrap text-body-md text-foreground">
              {userData.bio}
            </p>
          </div>
        </section>
      )}

      {/* Edit profile button */}
      <div className="mt-4">
        <Button size="lg" className="w-full rounded-pill bg-primary text-white hover:bg-primary/90" asChild>
          <Link href="/profile">プロフィールを変更する</Link>
        </Button>
      </div>

      {/* Sectioned menus — section headings CSS: 15px, bold */}

      {/* Section 1: Find work */}
      <section className="mt-8">
        <h2 className="text-body-lg font-bold text-foreground">仕事を探す</h2>
        <nav className="mt-3">
          <MenuList items={FIND_WORK_MENU} />
        </nav>
      </section>

      {/* Scheduled jobs (稼働予定) */}
      {acceptedApplications && acceptedApplications.length > 0 && (
        <section className="mt-8 space-y-4">
          {acceptedApplications.map((app) => {
            const job = app.jobs as unknown as {
              id: string;
              title: string;
              trade_type: string | null;
              headcount: number | null;
              recruit_end_date: string | null;
              reward_lower: number | null;
              reward_upper: number | null;
              prefecture: string | null;
              recruit_start_date: string | null;
              owner_id: string;
              organization_id: string | null;
              owner: {
                last_name: string | null;
                first_name: string | null;
                deleted_at: string | null;
                client_profiles:
                  | Array<{ display_name: string | null; image_url: string | null }>
                  | null;
              } | null;
              organization: {
                owner_user: {
                  last_name: string | null;
                  first_name: string | null;
                  deleted_at: string | null;
                  client_profiles:
                    | Array<{ display_name: string | null; image_url: string | null }>
                    | null;
                } | null;
              } | null;
            };
            if (!job) return null;

            const clientReview = app.client_reviews as unknown as { id: string } | null;
            const userReview = app.user_reviews as unknown as { id: string } | null;
            const hasClientReview = clientReview !== null;
            const hasUserReview = userReview !== null;
            const resolution = resolveClientProfileForRow(job);
            const companyName = resolveParticipantName({
              displayName: resolution.displayName,
              lastName: resolution.lastName,
              firstName: resolution.firstName,
              deletedAt: resolution.deletedAt,
            });
            const tradeLabel = [job.trade_type, job.headcount ? `${job.headcount}人` : null]
              .filter(Boolean)
              .join("・");
            const rewardText = job.reward_lower
              ? `${job.reward_lower.toLocaleString()}円（人工）`
              : "要相談";
            const recruitPeriod = [job.recruit_start_date, job.recruit_end_date]
              .map((d) => (d ? d.replace(/-/g, "/") : ""))
              .join("〜");

            return (
              <div
                key={app.id}
                className="rounded-lg border border-[rgba(30,30,30,0.1)] bg-white p-5"
              >
                {/* Badge */}
                <span className={`inline-block rounded-full px-3 py-1 text-body-xs font-medium border ${
                  hasClientReview
                    ? "bg-orange-50 text-orange-400 border-orange-100"
                    : hasUserReview
                      ? "bg-yellow-50 text-yellow-500 border-yellow-100"
                      : "bg-[rgba(146,7,131,0.05)] text-primary/60 border-[rgba(146,7,131,0.1)]"
                }`}>
                  {hasClientReview ? "評価登録済み" : hasUserReview ? "評価登録未入力" : "稼働予定"}
                </span>

                {/* Title & Company */}
                <h3 className="mt-2 text-body-lg font-bold text-foreground">
                  {job.title}
                </h3>
                {companyName && (
                  <p className="mt-0.5 text-body-md font-bold text-bijiyu-purple">
                    {companyName}
                  </p>
                )}

                {/* Trade type & deadline */}
                <div className="mt-1 flex items-center justify-between text-body-xs text-muted-foreground">
                  <span>{tradeLabel}</span>
                  {job.recruit_end_date && (
                    <span>
                      締め切り：{job.recruit_end_date.replace(/-/g, "/")}
                    </span>
                  )}
                </div>

                {/* Divider */}
                <div className="my-3 border-t border-[rgba(30,30,30,0.1)]" />

                {/* Details — grid layout to align values */}
                <div className="space-y-2 text-body-sm">
                  <div className="flex items-center">
                    <img src="/images/icons/icon-coin.png" alt="" className="size-4 shrink-0" />
                    <span className="ml-2 w-16 shrink-0 font-bold text-bijiyu-purple">報酬</span>
                    <span className="text-foreground">{rewardText}</span>
                  </div>
                  <div className="flex items-center">
                    <img src="/images/icons/icon-pin.png" alt="" className="size-4 shrink-0" />
                    <span className="ml-2 w-16 shrink-0 font-bold text-bijiyu-purple">エリア</span>
                    <span className="text-foreground">{job.prefecture ?? "未設定"}</span>
                  </div>
                  <div className="flex items-center">
                    <img src="/images/icons/icon-calendar.png" alt="" className="size-4 shrink-0" />
                    <span className="ml-2 w-16 shrink-0 font-bold text-bijiyu-purple">募集期間</span>
                    <span className="text-foreground">{recruitPeriod || "未設定"}</span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="mt-5 flex gap-3">
                  <Button
                    size="lg"
                    className="flex-1 rounded-pill bg-primary text-white hover:bg-primary/90"
                    asChild
                  >
                    <Link href={`/messages`}>メッセージ</Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="flex-1 rounded-pill border-primary text-primary hover:bg-primary/5"
                    asChild
                  >
                    <Link href={`/applications/history/${app.id}`}>応募詳細</Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Section 2: Check schedule */}
      <section className="mt-8">
        <h2 className="text-body-lg font-bold text-foreground">予定を確認する</h2>
        <nav className="mt-3">
          <MenuList items={CHECK_SCHEDULE_MENU} />
        </nav>
      </section>

      {/* Section 3: Find contractors (client only) */}
      {isClient && (
        <section className="mt-8">
          <h2 className="text-body-lg font-bold text-foreground">発注先を探す</h2>
          <nav className="mt-3">
            <MenuList items={FIND_CONTRACTORS_MENU} />
          </nav>
        </section>
      )}

      {/* Section 4: Manage orders (client only) */}
      {isClient && (
        <section className="mt-8">
          <h2 className="text-body-lg font-bold text-foreground">発注先を管理する</h2>
          <nav className="mt-3">
            <MenuList items={MANAGE_ORDERS_MENU} />
          </nav>
        </section>
      )}

      {/* Section 5: Update info */}
      <section className="mt-8">
        <h2 className="text-body-lg font-bold text-foreground">情報を更新する</h2>
        <nav className="mt-3">
          <MenuList items={updateInfoItems} />
        </nav>
      </section>
    </div>
  );
}
