import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DocumentView } from "@/components/admin/document-view";
import { getSignedDocumentUrls } from "@/lib/admin/signed-urls";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils/format-date";

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
 * ADM-019: トラブル報告詳細（デザインカンプなし・admin 共通スタイル）。
 * trouble_reports の全項目表示・任意未入力は「—」・閲覧のみ。
 * 添付は contacts と同じ統一ルール（画像インライン / PDF リンク）。
 */
export default async function AdminTroubleReportDetailPage({
  params,
}: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: report } = await admin
    .from("trouble_reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!report) notFound();

  const attachmentDocs =
    report.attachments && report.attachments.length > 0
      ? await getSignedDocumentUrls({
          bucket: "support-attachments",
          paths: report.attachments,
        })
      : [];

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        トラブル報告詳細
      </h1>

      <section className="mt-6">
        <div className="overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <DetailRow label="報告者氏名" value={report.reporter_name} />
          <DetailRow
            label="トラブル相手の氏名"
            value={report.counterparty_name}
          />
          <DetailRow label="メールアドレス" value={report.email} />
          <DetailRow label="トラブル種類" value={report.category} />
          <DetailRow
            label="内容"
            value={
              report.content ? (
                <span className="whitespace-pre-wrap">{report.content}</span>
              ) : null
            }
          />
          <DetailRow
            label="受信日時"
            value={formatDateTime(report.created_at)}
          />
        </div>
      </section>

      {/* 添付 */}
      {attachmentDocs.length > 0 && (
        <section className="mt-6">
          <h2 className="text-body-lg font-bold text-foreground">添付</h2>
          <div className="mt-2 space-y-4">
            {attachmentDocs.map((doc, i) => (
              <DocumentView key={doc.path} doc={doc} alt={`添付${i + 1}`} />
            ))}
          </div>
        </section>
      )}

      {/* 報告者（登録ユーザー）導線 */}
      {report.user_id && (
        <div className="mt-6">
          <Button asChild variant="outline" className="rounded-full">
            <Link href={`/admin/users/${report.user_id}`}>
              報告者の詳細を見る
            </Link>
          </Button>
        </div>
      )}

      <div className="mt-10 flex flex-col items-center">
        <Button
          asChild
          variant="outline"
          className="w-full max-w-xs rounded-full"
        >
          <Link href="/admin/trouble-reports">もどる</Link>
        </Button>
      </div>
    </div>
  );
}
