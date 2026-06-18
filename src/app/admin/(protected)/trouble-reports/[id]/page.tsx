import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DocumentView } from "@/components/admin/document-view";
import { buildBackToValue, resolveBackTo } from "@/lib/admin/back-to";
import { getSignedDocumentUrls } from "@/lib/admin/signed-urls";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils/format-date";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ backTo?: string }>;
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
      <p className="bg-primary/[0.08] px-4 py-2 text-body-sm font-medium text-foreground">
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
 *
 * セクション構成・ラベル・色味は ADM-017 お問い合わせ詳細と統一する：
 * - 上部メタ情報: 受信日時 + 登録ユーザーバッジ
 * - 基本情報: 氏名・トラブル相手の氏名・メールアドレス（フォームのラベルに合わせる）
 * - トラブル内容: トラブル種類・内容
 * - 添付（あれば）: contacts と同じ統一ルール（画像インライン / PDF リンク）
 *
 * 任意未入力は「—」・閲覧のみ（状態変更・返信なし）。
 */
export default async function AdminTroubleReportDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const backTo = resolveBackTo(sp.backTo);
  const currentPath = `/admin/trouble-reports/${id}`;
  const backToForChildren = buildBackToValue(currentPath, backTo);
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

      {/* 上部メタ情報（admin 専用：受信日時のみ）
          トラブル報告は (authenticated) 配下＝必ずログインユーザーからの送信なので
          ADM-017 と違い「登録ユーザー」バッジは付けない */}
      <p className="mt-4 text-body-sm text-muted-foreground">
        受信日時：{formatDateTime(report.created_at)}
      </p>

      {/* 基本情報（フォームのラベルに合わせる） */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">基本情報</h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <DetailRow label="氏名" value={report.reporter_name} />
          <DetailRow
            label="トラブル相手の氏名"
            value={report.counterparty_name}
          />
          <DetailRow label="メールアドレス" value={report.email} />
        </div>
      </section>

      {/* トラブル内容 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">トラブル内容</h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <DetailRow label="トラブル種類" value={report.category} />
          <DetailRow
            label="内容"
            value={
              report.content ? (
                <span className="whitespace-pre-wrap">{report.content}</span>
              ) : null
            }
          />
        </div>
      </section>

      {/* 添付（添付がある場合のみ表示） */}
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

      {/* 導線: 報告者 → ADM-009 ／ もどる
          ADM-021 / ADM-022 に揃えて縦積み中央寄せ。
          紫文字＋紫枠で統一し、backTo を伝播 */}
      <div className="mt-10 flex flex-col items-center gap-3">
        {report.user_id && (
          <Button
            asChild
            variant="outline"
            className="w-full max-w-xs rounded-full border-secondary text-secondary"
          >
            <Link
              href={`/admin/users/${report.user_id}?backTo=${encodeURIComponent(backToForChildren)}`}
            >
              報告者の詳細を見る
            </Link>
          </Button>
        )}
        <Button
          asChild
          variant="outline"
          className="w-full max-w-xs rounded-full"
        >
          <Link href={backTo ?? "/admin/trouble-reports"}>もどる</Link>
        </Button>
      </div>
    </div>
  );
}
