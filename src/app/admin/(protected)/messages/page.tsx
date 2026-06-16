import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  buildProxyOrgOptions,
  dedupeOrganizationIds,
  fetchAllRows,
} from "@/lib/admin/proxy-threads";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserDisplayName } from "@/lib/utils/display-name";
import { formatDateTime } from "@/lib/utils/format-date";

import { ProxyThreadFilters } from "./filters";

const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Promise<{ organizationId?: string; page?: string }>;
}

/**
 * ADM-023: 代理メッセージ一覧（代理メッセージ閲覧・デザインカンプなし・admin 共通スタイル）。
 * admin_proxy_threads ビュー（is_proxy を含むスレッドのみ）を
 * last_message_at DESC, thread_id DESC（タイブレーク付き）で20件ページング表示する。
 * 会社絞込ドロップダウンの選択肢はビュー全件（fetchAllRows）から導出する
 * （1000件上限の静かな欠落防止）。ADM-004 からは ?organizationId= 付きで開く。
 */
export default async function AdminProxyMessagesPage({
  searchParams,
}: PageProps) {
  const sp = await searchParams;
  const organizationId = (sp.organizationId ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const admin = createAdminClient();

  // 会社絞込の選択肢: ビューの organization_id を全件取得 → 重複排除 → 表示名をバッチ解決
  let orgOptions: Awaited<ReturnType<typeof buildProxyOrgOptions>> = [];
  try {
    const allViewRows = await fetchAllRows<{ organization_id: string | null }>(
      (from, to) =>
        admin
          .from("admin_proxy_threads")
          .select("organization_id")
          .order("thread_id", { ascending: true })
          .range(from, to),
    );
    const orgIds = dedupeOrganizationIds(allViewRows);
    if (orgIds.length > 0) {
      const { data: orgs } = await admin
        .from("organizations")
        .select("id, owner_id")
        .in("id", orgIds);
      const ownerIds = Array.from(
        new Set((orgs ?? []).map((o) => o.owner_id)),
      );
      const [{ data: ownerUsers }, { data: ownerProfiles }] =
        await Promise.all([
          admin
            .from("users")
            .select("id, last_name, first_name, deleted_at")
            .in("id", ownerIds),
          admin
            .from("client_profiles")
            .select("user_id, display_name")
            .in("user_id", ownerIds),
        ]);
      orgOptions = buildProxyOrgOptions({
        organizations: orgs ?? [],
        ownerUsers: ownerUsers ?? [],
        ownerProfiles: ownerProfiles ?? [],
      });
    }
  } catch (e) {
    console.error("[AdminProxyMessagesPage] org options fetch failed", e);
  }
  const orgNameById = new Map(
    orgOptions.map((o) => [o.organizationId, o.name]),
  );

  // 一覧ページ本体
  let threadsQuery = admin
    .from("admin_proxy_threads")
    .select("thread_id, organization_id, contractor_id, last_message_at", {
      count: "exact",
    });
  if (organizationId) {
    threadsQuery = threadsQuery.eq("organization_id", organizationId);
  }
  const { data: threads, count } = await threadsQuery
    .order("last_message_at", { ascending: false })
    .order("thread_id", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  // 相手の職人名をバッチ解決（N+1 禁止）
  const contractorIds = Array.from(
    new Set(
      (threads ?? [])
        .map((t) => t.contractor_id)
        .filter((id): id is string => !!id),
    ),
  );
  const contractorNameById = new Map<string, string>();
  if (contractorIds.length > 0) {
    const { data: contractors } = await admin
      .from("users")
      .select("id, last_name, first_name, deleted_at")
      .in("id", contractorIds);
    for (const u of contractors ?? []) {
      contractorNameById.set(
        u.id,
        getUserDisplayName({
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
    if (organizationId) params.set("organizationId", organizationId);
    if (targetPage > 1) params.set("page", String(targetPage));
    return `/admin/messages${params.toString() ? `?${params}` : ""}`;
  }

  return (
    <div className="px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        代理メッセージ一覧
      </h1>
      <p className="mt-2 text-center text-body-sm text-muted-foreground">
        代理メッセージを含むスレッドのみ表示しています（閲覧専用）
      </p>

      <ProxyThreadFilters
        initialOrganizationId={organizationId || "all"}
        options={orgOptions}
      />

      <p className="mt-6 text-body-md font-bold">検索結果：{total}件</p>

      <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
        {(threads ?? []).length === 0 ? (
          <p className="px-4 py-6 text-body-sm text-muted-foreground">
            該当するメッセージスレッドがありません
          </p>
        ) : (
          (threads ?? []).map((thread) => (
            <Link
              key={thread.thread_id}
              href={`/admin/messages/${thread.thread_id}`}
              className="flex items-center gap-3 border-b border-border/20 px-4 py-3 last:border-b-0 hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-body-sm text-muted-foreground">
                  {formatDateTime(thread.last_message_at)}
                </p>
                <p className="mt-0.5 truncate text-body-md font-medium text-foreground">
                  {(thread.organization_id
                    ? orgNameById.get(thread.organization_id)
                    : null) ?? "—"}
                  <span className="mx-2 text-muted-foreground">×</span>
                  {(thread.contractor_id
                    ? contractorNameById.get(thread.contractor_id)
                    : null) ?? "—"}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-white">
                代理
              </span>
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
          <Link href="/admin/dashboard">もどる</Link>
        </Button>
      </div>
    </div>
  );
}
