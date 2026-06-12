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
 * ADM-017: お問い合わせ詳細（デザインカンプなし・admin 共通スタイル）。
 * contacts の全項目表示・任意未入力は「—」・閲覧のみ（状態変更・返信なし）。
 * 添付は support-attachments の署名付きURL（画像インライン / PDF リンク）。
 */
export default async function AdminContactDetailPage({ params }: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: contact } = await admin
    .from("contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!contact) notFound();

  const attachmentDocs =
    contact.attachments && contact.attachments.length > 0
      ? await getSignedDocumentUrls({
          bucket: "support-attachments",
          paths: contact.attachments,
        })
      : [];

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        お問い合わせ詳細
      </h1>

      {/* 基本情報 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">基本情報</h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <DetailRow label="会社名/屋号" value={contact.company_name} />
          <DetailRow label="氏名" value={contact.name} />
          <DetailRow label="電話番号" value={contact.phone} />
          <DetailRow label="メールアドレス" value={contact.email} />
          <DetailRow label="所在地" value={contact.address} />
        </div>
      </section>

      {/* お問い合わせについて */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">
          お問い合わせについて
        </h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <DetailRow label="お問い合わせ内容" value={contact.inquiry_type} />
          <DetailRow label="ビジ友の利用目的" value={contact.purpose} />
          <DetailRow label="業種・職種" value={contact.industry} />
        </div>
      </section>

      {/* 案件情報 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">案件情報</h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <DetailRow
            label="工事内容"
            value={
              contact.project_description ? (
                <span className="whitespace-pre-wrap">
                  {contact.project_description}
                </span>
              ) : null
            }
          />
          <DetailRow label="工事エリア" value={contact.project_area} />
        </div>
      </section>

      {/* 動画掲載の相談・詳細・受信日時 */}
      <section className="mt-6">
        <div className="overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <DetailRow
            label="動画掲載の相談"
            value={contact.video_consultation}
          />
          <DetailRow
            label="詳細"
            value={
              contact.detail ? (
                <span className="whitespace-pre-wrap">{contact.detail}</span>
              ) : null
            }
          />
          <DetailRow
            label="受信日時"
            value={formatDateTime(contact.created_at)}
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

      {/* 登録ユーザー導線 */}
      {contact.user_id && (
        <div className="mt-6">
          <Button asChild variant="outline" className="rounded-full">
            <Link href={`/admin/users/${contact.user_id}`}>
              送信ユーザーの詳細を見る
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
          <Link href="/admin/contacts">もどる</Link>
        </Button>
      </div>
    </div>
  );
}
