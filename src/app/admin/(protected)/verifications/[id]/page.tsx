import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getSignedDocumentUrls } from "@/lib/admin/signed-urls";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { calculateAge } from "@/lib/utils/calculate-age";
import { getUserDisplayName } from "@/lib/utils/display-name";
import { ReviewForm } from "./review-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

function isPdf(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

/** 署名付きURLの書類表示（画像はインライン・PDF はリンク・生成失敗はフォールバック） */
function DocumentView({
  doc,
  alt,
}: {
  doc: { path: string; url: string | null };
  alt: string;
}) {
  if (!doc.url) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-[8px] border border-border bg-muted/30">
        <span className="text-body-sm text-muted-foreground">
          書類を表示できません
        </span>
      </div>
    );
  }
  if (isPdf(doc.path)) {
    return (
      <a
        href={doc.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex aspect-video w-full items-center justify-center rounded-[8px] border border-border bg-muted/30 text-body-md font-medium text-secondary underline underline-offset-2"
      >
        PDF を開く
      </a>
    );
  }
  return (
    <div className="overflow-hidden rounded-[8px] border border-border bg-background">
      <img src={doc.url} alt={alt} className="w-full object-contain" />
    </div>
  );
}

/**
 * ADM-012: 本人確認承認可否。
 * デザインカンプ: design-assets/screens/ADM-012.png
 *
 * - 画面を開いた時点で getSignedDocumentUrls（audit 付き）により
 *   audit_logs に identity_access が記録される（書類アクセスの記録漏れ防止）
 * - 両セクションの状態は自動決定（同時 pending なし）:
 *   identity 審査中 → CCUS 側「未申請」グレーアウト ／
 *   ccus 審査中 → 本人確認側は画像＋「承認済み」（ボタン非表示）
 */
export default async function AdminVerificationDetailPage({
  params,
}: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: verification } = await admin
    .from("identity_verifications")
    .select(
      `id, user_id, document_type, status, document_url_1, document_url_2, ccus_worker_id,
       user:users!identity_verifications_user_id_fkey(
         avatar_url, last_name, first_name, birth_date, deleted_at, identity_verified
       )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!verification) notFound();
  // 審査済みレコードの URL 直叩き（stale タブ等）は一覧へ戻す
  if (verification.status !== "pending") {
    redirect("/admin/verifications");
  }

  // audit の actor（layout で admin 保証済み）
  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) redirect("/admin/login");

  const target = verification.user;
  const name = getUserDisplayName({
    lastName: target?.last_name,
    firstName: target?.first_name,
    deletedAt: target?.deleted_at,
  });
  const age = target?.birth_date ? calculateAge(target.birth_date) : null;
  const isCcusReview = verification.document_type === "ccus";

  // 審査対象書類の署名付きURL（audit 付き＝画面を開いた時点で identity_access 記録）
  let identityDocs: { path: string; url: string | null }[] = [];
  let ccusDoc: { path: string; url: string | null } | null = null;
  let approvedCcusWorkerId: string | null = null;

  if (!isCcusReview) {
    // identity 審査中: 本人確認画像2枚
    const paths = [
      verification.document_url_1,
      ...(verification.document_url_2 ? [verification.document_url_2] : []),
    ];
    identityDocs = await getSignedDocumentUrls({
      bucket: "identity-documents",
      paths,
      audit: {
        actorId: actor.id,
        targetType: "identity_verifications",
        targetId: verification.id,
        documentType: "identity",
      },
    });
  } else {
    // ccus 審査中: CCUS 画像＋承認済み本人確認の画像（参考表示）
    const ccusDocs = await getSignedDocumentUrls({
      bucket: "ccus-documents",
      paths: [verification.document_url_1],
      audit: {
        actorId: actor.id,
        targetType: "identity_verifications",
        targetId: verification.id,
        documentType: "ccus",
      },
    });
    ccusDoc = ccusDocs[0] ?? null;
    approvedCcusWorkerId = verification.ccus_worker_id;

    const { data: approvedIdentity } = await admin
      .from("identity_verifications")
      .select("id, document_url_1, document_url_2")
      .eq("user_id", verification.user_id)
      .eq("document_type", "identity")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (approvedIdentity) {
      const paths = [
        approvedIdentity.document_url_1,
        ...(approvedIdentity.document_url_2
          ? [approvedIdentity.document_url_2]
          : []),
      ];
      identityDocs = await getSignedDocumentUrls({
        bucket: "identity-documents",
        paths,
        audit: {
          actorId: actor.id,
          targetType: "identity_verifications",
          targetId: approvedIdentity.id,
          documentType: "identity",
        },
      });
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">
        本人確認承認可否
      </h1>

      {/* アイコン + 氏名（年齢） */}
      <div className="mt-6 flex items-center gap-4">
        <div className="size-16 shrink-0 overflow-hidden rounded-full border border-border/30 bg-background">
          {target?.avatar_url && !target.deleted_at ? (
            <img
              src={target.avatar_url}
              alt={name}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <img
                src="/images/icons/icon-avatar.png"
                alt=""
                className="size-8 opacity-40"
              />
            </div>
          )}
        </div>
        <p className="text-body-lg font-bold text-foreground">
          {name}
          {age !== null && (
            <span className="text-body-md font-normal">（{age}歳）</span>
          )}
        </p>
      </div>

      {/* 本人確認セクション */}
      <section className="mt-8">
        <div className="flex items-center gap-3">
          <h2 className="text-body-lg font-bold text-foreground">本人確認</h2>
          {isCcusReview && (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-body-xs font-medium text-primary">
              承認済み
            </span>
          )}
        </div>

        {identityDocs.length > 0 ? (
          <div className="mt-3 space-y-4">
            {identityDocs.map((doc, i) => (
              <DocumentView
                key={doc.path}
                doc={doc}
                alt={`本人確認書類${i + 1}`}
              />
            ))}
          </div>
        ) : (
          <div className="mt-3 flex aspect-video w-full items-center justify-center rounded-[8px] border border-border bg-muted/30">
            <span className="text-body-sm text-muted-foreground">
              書類がありません
            </span>
          </div>
        )}

        {/* identity 審査中のみ否認理由＋ボタンを出す（承認は常時活性） */}
        {!isCcusReview && (
          <ReviewForm verificationId={verification.id} enabled={true} />
        )}
      </section>

      {/* CCUS登録セクション */}
      <section className="mt-10">
        <h2 className="text-body-lg font-bold text-foreground">CCUS登録</h2>

        {isCcusReview ? (
          <>
            <div className="mt-3">
              {ccusDoc && <DocumentView doc={ccusDoc} alt="CCUS書類" />}
            </div>
            <div className="mt-4">
              <p className="text-body-sm font-bold text-foreground">技能者ID</p>
              <p className="mt-1 rounded-[8px] border border-border bg-background px-4 py-3 text-body-md text-foreground">
                {approvedCcusWorkerId || "—"}
              </p>
            </div>
            {/* CCUS の承認は identity_verified=true の場合のみ活性（要件どおり実装） */}
            <ReviewForm
              verificationId={verification.id}
              enabled={!!target?.identity_verified}
            />
          </>
        ) : (
          // identity 審査中: CCUS 側は「未申請」グレーアウト（ボタン非活性）
          <div className="mt-3 opacity-50">
            <div className="flex aspect-video w-full items-center justify-center rounded-[8px] border border-border bg-muted/30">
              <span className="text-body-sm text-muted-foreground">未申請</span>
            </div>
            <div className="mt-4">
              <p className="text-body-sm font-bold text-foreground">否認理由</p>
              <Textarea
                disabled
                placeholder="テキスト"
                className="mt-1 min-h-24 bg-muted"
              />
            </div>
            <div className="mt-4 flex justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                disabled
                className="w-36 rounded-full"
              >
                否認
              </Button>
              <Button
                type="button"
                disabled
                className="w-36 rounded-full bg-secondary text-white"
              >
                承認
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* もどる（審査確定の redirect 経由でも一覧へ確実に戻れるよう明示） */}
      <div className="mt-10 flex flex-col items-center">
        <Button
          asChild
          variant="outline"
          className="w-full max-w-xs rounded-full"
        >
          <Link href="/admin/verifications">もどる</Link>
        </Button>
      </div>
    </div>
  );
}
