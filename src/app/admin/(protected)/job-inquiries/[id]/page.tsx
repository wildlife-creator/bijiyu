import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { buildBackToValue, resolveBackTo } from "@/lib/admin/back-to";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils/format-date";
import { resolveParticipantName } from "@/lib/utils/display-name";

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
 * ADM-021: 求人問い合わせ詳細（デザインカンプなし・admin 共通スタイル）。
 *
 * セクション構成・ラベル・色味は ADM-017 / ADM-019 と統一する：
 * - 上部メタ情報: 受信日時のみ（求人問い合わせは authenticated 配下＝必ず登録ユーザー
 *   からの送信なのでバッジは付けない。ADM-019 と同じ方針）
 * - 基本情報: 氏名・メールアドレス・宛先発注者（フォームのラベルに合わせる）
 * - お問い合わせ内容: お問い合わせ項目・お問い合わせ内容
 * - 添付なし（job-inquiry は添付非対応）
 *
 * 導線: 送信者（sender_id）→ ADM-009 ／ 宛先発注者（target_client_id）→ ADM-004。
 * いずれも backTo を伝播して戻り導線を保つ。
 */
export default async function AdminJobInquiryDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const backTo = resolveBackTo(sp.backTo);
  const currentPath = `/admin/job-inquiries/${id}`;
  const backToForChildren = buildBackToValue(currentPath, backTo);
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

      {/* 上部メタ情報（admin 専用：受信日時のみ）
          求人問い合わせは (authenticated) 配下＝必ずログインユーザーからの送信なので
          ADM-019 と同じく「登録ユーザー」バッジは付けない */}
      <p className="mt-4 text-body-sm text-muted-foreground">
        受信日時：{formatDateTime(inquiry.created_at)}
      </p>

      {/* 基本情報（フォームのラベルに合わせる） */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">基本情報</h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <DetailRow label="氏名" value={inquiry.name} />
          <DetailRow label="メールアドレス" value={inquiry.email} />
          <DetailRow label="宛先発注者" value={targetName} />
        </div>
      </section>

      {/* お問い合わせ内容 */}
      <section className="mt-6">
        <h2 className="text-body-lg font-bold text-foreground">
          お問い合わせ内容
        </h2>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-border/20 bg-background">
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
        </div>
      </section>

      {/* 導線: 送信者 → ADM-009 ／ 宛先発注者 → ADM-004 ／ もどる
          ADM-022 に揃えて 3 つを縦積みで中央寄せ。
          紫文字＋紫枠で統一し、いずれも backTo を伝播 */}
      <div className="mt-10 flex flex-col items-center gap-3">
        {inquiry.sender_id && (
          <Button
            asChild
            variant="outline"
            className="w-full max-w-xs rounded-full border-secondary text-secondary"
          >
            <Link
              href={`/admin/users/${inquiry.sender_id}?backTo=${encodeURIComponent(backToForChildren)}`}
            >
              送信者の詳細を見る
            </Link>
          </Button>
        )}
        {inquiry.target_client_id && (
          <Button
            asChild
            variant="outline"
            className="w-full max-w-xs rounded-full border-secondary text-secondary"
          >
            <Link
              href={`/admin/clients/${inquiry.target_client_id}?backTo=${encodeURIComponent(backToForChildren)}`}
            >
              宛先発注者の詳細を見る
            </Link>
          </Button>
        )}
        <Button
          asChild
          variant="outline"
          className="w-full max-w-xs rounded-full"
        >
          <Link href={backTo ?? "/admin/job-inquiries"}>もどる</Link>
        </Button>
      </div>
    </div>
  );
}
