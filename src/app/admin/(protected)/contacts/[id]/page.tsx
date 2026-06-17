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
 * ADM-017: お問い合わせ詳細（デザインカンプなし・admin 共通スタイル）。
 *
 * セクション構成は入力フォーム（COM-008 /contact）と一致させ、
 * admin が「ユーザーが入力したまま」を読めるようにしている。
 * - 基本情報: 会社名／屋号〜業種・職種（フォーム同順）
 * - お問い合わせ内容: お問い合わせの種類、問い合わせ詳細
 * - 案件情報: 工事エリア、工事内容
 * - 動画掲載の相談（任意）
 * - 添付（任意）
 *
 * 受信日時は admin 専用メタ情報として上部に独立表示する。
 * 任意未入力は「—」・閲覧のみ（状態変更・返信なし）。
 * 添付は support-attachments の署名付きURL（画像インライン / PDF リンク）。
 */
export default async function AdminContactDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const backTo = resolveBackTo(sp.backTo);
  const currentPath = `/admin/contacts/${id}`;
  const backToForChildren = buildBackToValue(currentPath, backTo);
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

      {/* 上部メタ情報（admin 専用：受信日時 + 登録ユーザーバッジ） */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p className="text-body-sm text-muted-foreground">
          受信日時：{formatDateTime(contact.created_at)}
        </p>
        {contact.user_id && (
          <span className="rounded-full bg-primary/10 px-3 py-0.5 text-body-xs font-medium text-primary">
            登録ユーザー
          </span>
        )}
      </div>

      {/* 基本情報（フォーム COM-008 の基本情報セクションに準拠） */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">基本情報</h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <DetailRow label="会社名／屋号" value={contact.company_name} />
          <DetailRow label="氏名" value={contact.name} />
          <DetailRow label="電話番号" value={contact.phone} />
          <DetailRow label="メールアドレス" value={contact.email} />
          <DetailRow label="所在地" value={contact.address} />
          <DetailRow label="ビジ友の利用目的" value={contact.purpose} />
          <DetailRow label="業種・職種" value={contact.industry} />
        </div>
      </section>

      {/* お問い合わせ内容 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">
          お問い合わせ内容
        </h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <DetailRow
            label="お問い合わせの種類"
            value={contact.inquiry_type}
          />
          <DetailRow
            label="問い合わせ詳細"
            value={
              contact.detail ? (
                <span className="whitespace-pre-wrap">{contact.detail}</span>
              ) : null
            }
          />
        </div>
      </section>

      {/* 案件情報（フォーム同順: 工事エリア → 工事内容） */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">案件情報</h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <DetailRow label="工事エリア" value={contact.project_area} />
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
        </div>
      </section>

      {/* 動画掲載の相談 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">
          動画掲載の相談
        </h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <DetailRow
            label="動画掲載の相談"
            value={contact.video_consultation}
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

      {/* 導線: 送信ユーザー → ADM-009 ／ もどる
          ADM-021 / ADM-022 に揃えて縦積み中央寄せ。
          紫文字＋紫枠で統一し、backTo を伝播 */}
      <div className="mt-10 flex flex-col items-center gap-3">
        {contact.user_id && (
          <Button
            asChild
            variant="outline"
            className="w-full max-w-xs rounded-full border-secondary text-secondary"
          >
            <Link
              href={`/admin/users/${contact.user_id}?backTo=${encodeURIComponent(backToForChildren)}`}
            >
              送信ユーザーの詳細を見る
            </Link>
          </Button>
        )}
        <Button
          asChild
          variant="outline"
          className="w-full max-w-xs rounded-full"
        >
          <Link href={backTo ?? "/admin/contacts"}>もどる</Link>
        </Button>
      </div>
    </div>
  );
}
