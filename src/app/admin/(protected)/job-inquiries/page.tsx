import Link from "next/link";

import { Button } from "@/components/ui/button";
import { KeywordSearchForm } from "@/components/admin/keyword-search-form";
import { KEYWORD_ID_SET_LIMIT } from "@/lib/admin/applications-list";
import { buildBackToValue, resolveBackTo } from "@/lib/admin/back-to";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils/format-date";
import { resolveParticipantName } from "@/lib/utils/display-name";

const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string; backTo?: string }>;
}

/**
 * ADM-020: 求人問い合わせ一覧（デザインカンプなし・admin 共通スタイル）。
 * 受信日時降順・20件・絞込なし（共通方針）。
 * 宛先発注者の表示名はページ20行分の target_client_id をまとめてバッチ取得し
 * resolveParticipantName() で解決する（N+1 禁止）。
 */
export default async function AdminJobInquiriesPage({
  searchParams,
}: PageProps) {
  const sp = await searchParams;
  const keyword = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const backTo = resolveBackTo(sp.backTo);

  const admin = createAdminClient();

  let query = admin
    .from("job_inquiries")
    .select("id, created_at, name, topics, target_client_id", {
      count: "exact",
    });

  if (keyword) {
    // 発注者名（client_profiles.display_name または users.last_name/first_name）
    // でヒットする user_id 集合を先に取り、target_client_id IN (…) として OR に組み込む。
    // 既存の name / email 直 ILIKE と併せて 4軸 OR 検索になる。
    const [{ data: profileMatches }, { data: userMatches }] = await Promise.all([
      admin
        .from("client_profiles")
        .select("user_id")
        .ilike("display_name", `%${keyword}%`)
        .limit(KEYWORD_ID_SET_LIMIT),
      admin
        .from("users")
        .select("id")
        .or(`last_name.ilike.%${keyword}%,first_name.ilike.%${keyword}%`)
        .limit(KEYWORD_ID_SET_LIMIT),
    ]);
    const targetIds = Array.from(
      new Set([
        ...(profileMatches ?? []).map((p) => p.user_id),
        ...(userMatches ?? []).map((u) => u.id),
      ]),
    );

    const orParts = [
      `name.ilike.%${keyword}%`,
      `email.ilike.%${keyword}%`,
    ];
    if (targetIds.length > 0) {
      orParts.push(`target_client_id.in.(${targetIds.join(",")})`);
    }
    query = query.or(orParts.join(","));
  }

  const { data: inquiries, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  // 宛先発注者の表示名をバッチ解決
  const targetIds = Array.from(
    new Set(
      (inquiries ?? [])
        .map((i) => i.target_client_id)
        .filter((id): id is string => !!id),
    ),
  );
  const targetNameById = new Map<string, string>();
  if (targetIds.length > 0) {
    const [{ data: targetUsers }, { data: targetProfiles }] =
      await Promise.all([
        admin
          .from("users")
          .select("id, last_name, first_name, deleted_at")
          .in("id", targetIds),
        admin
          .from("client_profiles")
          .select("user_id, display_name")
          .in("user_id", targetIds),
      ]);
    const profileByUser = new Map(
      (targetProfiles ?? []).map((p) => [p.user_id, p.display_name]),
    );
    for (const u of targetUsers ?? []) {
      targetNameById.set(
        u.id,
        resolveParticipantName({
          displayName: profileByUser.get(u.id) ?? null,
          lastName: u.last_name,
          firstName: u.first_name,
          deletedAt: u.deleted_at,
        }),
      );
    }
  }

  const total = count ?? 0;
  const hasPrev = page > 1;
  const hasNext = offset + PAGE_SIZE < total;

  function pageHref(targetPage: number): string {
    const params = new URLSearchParams();
    if (keyword) params.set("q", keyword);
    if (targetPage > 1) params.set("page", String(targetPage));
    if (backTo) params.set("backTo", backTo);
    return `/admin/job-inquiries${params.toString() ? `?${params}` : ""}`;
  }

  // 行クリックで詳細に行く際の backTo 値（自分の URL + 上位 backTo を継承）
  const currentListPath = pageHref(page);
  const rowBackToValue = buildBackToValue(currentListPath, backTo);

  return (
    <div className="px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        求人問い合わせ一覧
      </h1>

      <KeywordSearchForm
        basePath="/admin/job-inquiries"
        placeholder="送信者氏名・メールアドレス・発注者名"
        initialKeyword={keyword}
      />

      <p className="mt-6 text-body-md font-bold">検索結果：{total}件</p>

      <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
        {(inquiries ?? []).length === 0 ? (
          <p className="px-4 py-6 text-body-sm text-muted-foreground">
            該当する求人問い合わせがありません
          </p>
        ) : (
          (inquiries ?? []).map((inquiry) => (
            <Link
              key={inquiry.id}
              href={`/admin/job-inquiries/${inquiry.id}?backTo=${encodeURIComponent(rowBackToValue)}`}
              className="flex items-center gap-3 border-b border-border/20 px-4 py-3 last:border-b-0 hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-body-sm text-muted-foreground">
                  {formatDateTime(inquiry.created_at)}
                </p>
                <p className="mt-0.5 truncate text-body-md font-medium text-foreground">
                  {inquiry.name}
                  <span className="mx-2 text-muted-foreground">→</span>
                  {inquiry.target_client_id
                    ? (targetNameById.get(inquiry.target_client_id) ?? "—")
                    : "—"}
                </p>
                <p className="truncate text-body-sm text-primary">
                  {(inquiry.topics ?? []).join("、") || "—"}
                </p>
              </div>
              <span className="text-muted-foreground">›</span>
            </Link>
          ))
        )}
      </div>

      {(hasPrev || hasNext) && (
        <div className="mt-4 flex justify-center gap-3">
          {hasPrev && (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={pageHref(page - 1)}>＜前の20件</Link>
            </Button>
          )}
          {hasNext && (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={pageHref(page + 1)}>次の20件＞</Link>
            </Button>
          )}
        </div>
      )}

      <div className="mt-10 flex flex-col items-center gap-3">
        <Button
          asChild
          variant="outline"
          className="w-full max-w-xs rounded-full"
        >
          <Link href={backTo ?? "/admin/dashboard"}>もどる</Link>
        </Button>
      </div>
    </div>
  );
}
