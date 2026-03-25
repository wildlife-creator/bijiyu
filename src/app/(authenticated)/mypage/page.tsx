import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Briefcase,
  Building2,
  Calendar,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  FileText,
  Heart,
  Mail,
  MessageSquare,
  Search,
  Send,
  ShieldCheck,
  Star,
  User,
  Users,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

// -------------------------------------------------------------------
// Menu item definitions
// -------------------------------------------------------------------
interface MenuItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const CONTRACTOR_MENU: MenuItem[] = [
  { label: "募集案件一覧", href: "/jobs", icon: <Briefcase className="size-5" /> },
  { label: "発注者一覧", href: "/users/clients", icon: <Building2 className="size-5" /> },
  { label: "マイリスト", href: "/favorites", icon: <Heart className="size-5" /> },
  { label: "メッセージ/スカウト一覧", href: "/messages", icon: <MessageSquare className="size-5" /> },
  { label: "応募履歴一覧", href: "/applications", icon: <ClipboardList className="size-5" /> },
  { label: "空き日程一覧", href: "/schedule", icon: <Calendar className="size-5" /> },
  { label: "本人確認・CCUS登録", href: "/profile/verification", icon: <ShieldCheck className="size-5" /> },
  { label: "プロフィール", href: "/profile", icon: <User className="size-5" /> },
  { label: "有料プラン案内", href: "/billing", icon: <Star className="size-5" /> },
  { label: "よくある質問", href: "/faq", icon: <CircleHelp className="size-5" /> },
  { label: "お問い合わせ", href: "/contact", icon: <Mail className="size-5" /> },
];

const CLIENT_MENU: MenuItem[] = [
  { label: "募集現場一覧", href: "/jobs/manage", icon: <Briefcase className="size-5" /> },
  { label: "ユーザー一覧/職人一覧", href: "/users/search", icon: <Search className="size-5" /> },
  { label: "応募一覧", href: "/applications/manage", icon: <ClipboardList className="size-5" /> },
  { label: "発注履歴一覧", href: "/orders", icon: <FileText className="size-5" /> },
  { label: "メッセージ一斉送信", href: "/messages/broadcast", icon: <Send className="size-5" /> },
  { label: "スカウトテンプレート", href: "/scouts/templates", icon: <MessageSquare className="size-5" /> },
  { label: "発注者情報", href: "/clients/profile", icon: <Building2 className="size-5" /> },
];

const CORPORATE_ONLY_MENU: MenuItem = {
  label: "担当者一覧",
  href: "/organization/members",
  icon: <Users className="size-5" />,
};

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

  // Fetch user role
  const { data: userData } = await supabase
    .from("users")
    .select("role, last_name, first_name")
    .eq("id", user.id)
    .single();

  if (!userData) {
    redirect("/register/profile");
  }

  // Fetch subscription status for client menu visibility
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, plan_type")
    .eq("user_id", user.id)
    .in("status", ["active", "past_due"])
    .single();

  const isClient =
    (userData.role === "client" || userData.role === "staff") &&
    subscription !== null;

  const isCorporate =
    isClient &&
    subscription !== null &&
    (subscription.plan_type === "corporate" ||
      subscription.plan_type === "corporate_high");

  // Build client menu with conditional corporate item
  const clientMenu = isClient
    ? [...CLIENT_MENU, ...(isCorporate ? [CORPORATE_ONLY_MENU] : [])]
    : [];

  const displayName =
    userData.last_name && userData.first_name
      ? `${userData.last_name} ${userData.first_name}`
      : "ユーザー";

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      {/* Greeting */}
      <h1 className="text-heading-lg font-bold text-foreground">
        {displayName}さん
      </h1>
      <p className="mt-1 text-body-sm text-muted-foreground">マイページ</p>

      {/* Contractor Menu (always visible) */}
      <section className="mt-8">
        <h2 className="text-heading-sm font-bold text-foreground">メニュー</h2>
        <nav className="mt-4">
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {CONTRACTOR_MENU.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-4 py-3 text-body-md text-foreground transition-colors hover:bg-muted"
                >
                  <span className="text-muted-foreground">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>

      {/* Client Menu (visible after subscription) */}
      {clientMenu.length > 0 && (
        <section className="mt-8">
          <h2 className="text-heading-sm font-bold text-foreground">
            発注者メニュー
          </h2>
          <nav className="mt-4">
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {clientMenu.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 px-4 py-3 text-body-md text-foreground transition-colors hover:bg-muted"
                  >
                    <span className="text-muted-foreground">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </section>
      )}
    </div>
  );
}
