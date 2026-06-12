import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils/format-date";
import { resolveParticipantName } from "@/lib/utils/display-name";

interface PageProps {
  params: Promise<{ id: string }>;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode | string | null | undefined;
}) {
  const isString = typeof value === "string";
  return (
    <div className="border-b border-border/20 last:border-b-0">
      <p className="bg-muted px-4 py-2 text-body-sm font-medium text-muted-foreground">
        {label}
      </p>
      <div className="px-4 py-3 text-body-md text-foreground">
        {value == null || (isString && !value) ? "—" : value}
      </div>
    </div>
  );
}

/**
 * ADM-021: 求人問い合わせ詳細（デザインカンプなし・admin 共通スタイル）。
 * job_inquiries の全項目表示・閲覧のみ・添付なし（job-inquiry は添付非対応）。
 * 導線: 送信者（sender_id）→ ADM-009 ／ 宛先発注者（target_client_id）→ ADM-004。
 */
export default async function AdminJobInquiryDetailPage({
  params,
}: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: inquiry } = await admin
    .from("job_inquiries")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!inquiry) notFound();

  // 宛先発注者の表示名解決
  let targetName: string | null = null;
  if (inquiry.target_client_id) {
    const [{ data: targetUser }, { data: targetProfile }] = await Promise.all([
      admin
        .from("users")
        .select("last_name, first_name, deleted_at")
        .eq("id", inquiry.target_client_id)
        .maybeSingle(),
      admin
        .from("client_profiles")
        .select("display_name")
        .eq("user_id", inquiry.target_client_id)
        .maybeSingle(),
    ]);
    if (targetUser) {
      targetName = resolveParticipantName({
        displayName: targetProfile?.display_name ?? null,
        lastName: targetUser.last_name,
        firstName: targetUser.first_name,
        deletedAt: targetUser.deleted_at,
      });
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        求人問い合わせ詳細
      </h1>

      <section className="mt-6">
        <div className="overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <DetailRow label="送信者氏名" value={inquiry.name} />
          <DetailRow label="メールアドレス" value={inquiry.email} />
          <DetailRow label="宛先発注者" value={targetName} />
          <DetailRow
            label="お問い合わせ項目"
            value={(inquiry.topics ?? []).join("、") || null}
          />
          <DetailRow
            label="お問い合わせ内容"
            value={
              inquiry.content ? (
                <span className="whitespace-pre-wrap">{inquiry.content}</span>
              ) : null
            }
          />
          <DetailRow
            label="受信日時"
            value={formatDateTime(inquiry.created_at)}
          />
        </div>
      </section>

      {/* 導線: 送信者 → ADM-009 ／ 宛先発注者 → ADM-004 */}
      {(inquiry.sender_id || inquiry.target_client_id) && (
        <div className="mt-6 flex flex-wrap gap-3">
          {inquiry.sender_id && (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={`/admin/users/${inquiry.sender_id}`}>
                送信者の詳細を見る
              </Link>
            </Button>
          )}
          {inquiry.target_client_id && (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={`/admin/clients/${inquiry.target_client_id}`}>
                宛先発注者の詳細を見る
              </Link>
            </Button>
          )}
        </div>
      )}

      <div className="mt-10 flex flex-col items-center">
        <Button
          asChild
          variant="outline"
          className="w-full max-w-xs rounded-full"
        >
          <Link href="/admin/job-inquiries">もどる</Link>
        </Button>
      </div>
    </div>
  );
}
