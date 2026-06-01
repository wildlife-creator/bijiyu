import { redirect, notFound } from "next/navigation";
import type { ReactNode } from "react";

import { createClient } from "@/lib/supabase/server";
import { BackButton } from "@/components/shared/back-button";
import { formatDateTime } from "@/lib/utils/format-message-time";

interface PageProps {
  params: Promise<{ id: string }>;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-4 sm:flex-row sm:gap-6">
      <span className="w-36 shrink-0 text-body-md font-medium text-secondary">
        {label}
      </span>
      <div className="flex-1 text-body-md text-foreground">{value}</div>
    </div>
  );
}

// COM-015 求人へのお問い合わせ 受信箱詳細（/mypage/job-inquiries/[id]）
// 状態管理 UI・返信ボタンは置かない（保存して読むだけ）。メールは mailto リンクで表示。
export default async function JobInquiryDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // RLS で見えない（宛先でも組織メンバーでもない）場合は null → notFound
  const { data: inquiry } = await supabase
    .from("job_inquiries")
    .select("id, created_at, name, email, topics, content")
    .eq("id", id)
    .maybeSingle();

  if (!inquiry) {
    notFound();
  }

  return (
    <div className="min-h-dvh px-4 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        お問い合わせ詳細
      </h1>

      <div className="mt-6">
        <DetailRow label="受信日時" value={formatDateTime(inquiry.created_at)} />
        <DetailRow label="送信者氏名" value={inquiry.name} />
        <DetailRow
          label="メールアドレス"
          value={
            <a
              href={`mailto:${inquiry.email}`}
              className="text-primary underline underline-offset-2"
            >
              {inquiry.email}
            </a>
          }
        />
        <DetailRow
          label="お問い合わせ項目"
          value={(inquiry.topics ?? []).join("、")}
        />
        <DetailRow
          label="お問い合わせ内容"
          value={
            inquiry.content ? (
              <span className="whitespace-pre-wrap">{inquiry.content}</span>
            ) : (
              <span className="text-muted-foreground">（未入力）</span>
            )
          }
        />
      </div>

      <div className="mt-8">
        <BackButton href="/mypage/job-inquiries" />
      </div>
    </div>
  );
}
