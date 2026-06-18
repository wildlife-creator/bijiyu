import { notFound } from "next/navigation";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  ProxyMessageList,
  type ProxyMessageItem,
} from "@/components/admin/proxy-message-list";
import { resolveBackTo } from "@/lib/admin/back-to";
import { getSignedDocumentUrls } from "@/lib/admin/signed-urls";
import { fetchAllRows } from "@/lib/admin/proxy-threads";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getUserDisplayName,
  resolveParticipantName,
} from "@/lib/utils/display-name";
import { formatDateTime } from "@/lib/utils/format-date";

interface PageProps {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ backTo?: string }>;
}

/**
 * ADM-024: メッセージ詳細（代理メッセージ閲覧・デザインカンプなし・admin 共通スタイル）。
 * 閲覧専用（送信入力欄は持たない。将来の代理送信はページ側にフォームを追加する）。
 * admin_proxy_threads に存在しないスレッド id は notFound()
 * （is_proxy を含まない個人間スレッドの URL 直叩き閲覧を遮断＝プライバシー境界）。
 */
export default async function AdminProxyMessageDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { threadId } = await params;
  const sp = await searchParams;
  const backTo = resolveBackTo(sp.backTo);
  const admin = createAdminClient();

  // プライバシー境界: 代理メッセージを含むスレッドのみ閲覧可
  const { data: proxyThread } = await admin
    .from("admin_proxy_threads")
    .select("thread_id, organization_id, contractor_id")
    .eq("thread_id", threadId)
    .maybeSingle();

  if (!proxyThread) notFound();

  // 会社名（Owner の display_name → 姓名）と職人名をバッチ解決
  let clientName = "—";
  if (proxyThread.organization_id) {
    const { data: org } = await admin
      .from("organizations")
      .select("id, owner_id")
      .eq("id", proxyThread.organization_id)
      .maybeSingle();
    if (org) {
      const [{ data: owner }, { data: ownerProfile }] = await Promise.all([
        admin
          .from("users")
          .select("last_name, first_name, deleted_at")
          .eq("id", org.owner_id)
          .maybeSingle(),
        admin
          .from("client_profiles")
          .select("display_name")
          .eq("user_id", org.owner_id)
          .maybeSingle(),
      ]);
      clientName = resolveParticipantName({
        displayName: ownerProfile?.display_name ?? null,
        lastName: owner?.last_name,
        firstName: owner?.first_name,
        deletedAt: owner?.deleted_at,
      });
    }
  }

  let contractorName = "—";
  if (proxyThread.contractor_id) {
    const { data: contractor } = await admin
      .from("users")
      .select("last_name, first_name, deleted_at")
      .eq("id", proxyThread.contractor_id)
      .maybeSingle();
    if (contractor) {
      contractorName = getUserDisplayName({
        lastName: contractor.last_name,
        firstName: contractor.first_name,
        deletedAt: contractor.deleted_at,
      });
    }
  }

  // メッセージ全件（1000件超に備え fetchAllRows。並び順キーは created_at + id タイブレーク）
  const rawMessages = await fetchAllRows<{
    id: string;
    sender_id: string;
    body: string;
    image_url: string | null;
    is_proxy: boolean;
    created_at: string;
  }>((from, to) =>
    admin
      .from("messages")
      .select("id, sender_id, body, image_url, is_proxy, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  // 画像添付の署名付きURLを一括生成
  const imagePaths = rawMessages
    .map((m) => m.image_url)
    .filter((p): p is string => !!p);
  const signedDocs = await getSignedDocumentUrls({
    bucket: "message-attachments",
    paths: imagePaths,
  });
  const signedUrlByPath = new Map(signedDocs.map((d) => [d.path, d.url]));

  const messages: ProxyMessageItem[] = rawMessages.map((m) => ({
    id: m.id,
    body: m.body,
    signedImageUrl: m.image_url
      ? (signedUrlByPath.get(m.image_url) ?? null)
      : null,
    isProxy: m.is_proxy,
    isContractorSide: m.sender_id === proxyThread.contractor_id,
    createdAt: formatDateTime(m.created_at),
  }));

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        メッセージ詳細
      </h1>
      <p className="mt-2 text-center text-body-md font-medium text-foreground">
        {clientName}
        <span className="mx-2 text-muted-foreground">×</span>
        {contractorName}
      </p>
      <p className="mt-1 text-center text-body-sm text-muted-foreground">
        閲覧専用（送信はできません）
      </p>

      {/* メッセージ枠は画面高の最大 60% で固定、超過分は内部スクロール。
          一般ユーザーの /messages/[threadId] と同じ「枠固定+内部スクロール」UX。
          メッセージ数が少ないスレッドは自然な高さで縮む（max-h なので） */}
      <div className="mt-6 max-h-[60vh] overflow-y-auto rounded-[8px] border border-border/20 bg-muted/30 p-4">
        <ProxyMessageList
          messages={messages}
          clientName={clientName}
          contractorName={contractorName}
        />
      </div>

      <div className="mt-10 flex flex-col items-center gap-3">
        <Button
          asChild
          variant="outline"
          className="w-full max-w-xs rounded-full"
        >
          <Link href={backTo ?? "/admin/messages"}>もどる</Link>
        </Button>
      </div>
    </div>
  );
}
