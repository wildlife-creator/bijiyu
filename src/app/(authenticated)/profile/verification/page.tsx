import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
type VerificationStatus = "pending" | "approved" | "rejected" | null;

interface StatusBadgeProps {
  status: VerificationStatus;
}

function StatusBadge({ status }: StatusBadgeProps) {
  switch (status) {
    case "approved":
      return (
        <Badge variant="default" className="bg-green-600 text-white">
          承認済み
        </Badge>
      );
    case "pending":
      return <Badge variant="default">申請中</Badge>;
    case "rejected":
      return <Badge variant="destructive">否認</Badge>;
    default:
      return <Badge variant="outline">未申請</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function VerificationPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch latest identity verification
  const { data: identityVerification } = await supabase
    .from("identity_verifications")
    .select("id, status, rejection_reason")
    .eq("user_id", user.id)
    .eq("document_type", "identity")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fetch latest CCUS verification
  const { data: ccusVerification } = await supabase
    .from("identity_verifications")
    .select("id, status, rejection_reason")
    .eq("user_id", user.id)
    .eq("document_type", "ccus")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const identityStatus =
    (identityVerification?.status as VerificationStatus) ?? null;
  const ccusStatus =
    (ccusVerification?.status as VerificationStatus) ?? null;

  const canSubmitIdentity =
    identityStatus === null || identityStatus === "rejected";
  const identityApproved = identityStatus === "approved";
  const canSubmitCcus = identityApproved;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-heading-lg font-bold text-foreground">
        本人確認・CCUS登録
      </h1>
      <p className="mt-2 text-body-md text-muted-foreground">
        ビジ友をご利用いただくために、以下の2つのステップを完了してください。
      </p>

      <div className="mt-8 space-y-8">
        {/* Step 1: Identity Verification */}
        <section className="space-y-4">
          <h2 className="text-heading-sm font-bold text-foreground">
            Step1: 本人確認
          </h2>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-5" />
                  本人確認書類
                </CardTitle>
                <StatusBadge status={identityStatus} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-body-md text-muted-foreground">
                運転免許証やマイナンバーカードなどの本人確認書類を提出してください。
              </p>

              {identityStatus === "rejected" &&
                identityVerification?.rejection_reason && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <div>
                      <p className="text-body-sm font-medium text-destructive">
                        否認理由
                      </p>
                      <p className="text-body-sm text-destructive">
                        {identityVerification.rejection_reason}
                      </p>
                    </div>
                  </div>
                )}

              {canSubmitIdentity && (
                <Button
                  variant="default"
                  size="lg"
                  className="w-full rounded-full"
                  asChild
                >
                  <Link href="/profile/verification/identity">
                    {identityStatus === "rejected"
                      ? "再提出する"
                      : "本人確認にすすむ"}
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Step 2: CCUS Registration */}
        <section className="space-y-4">
          <h2 className="text-heading-sm font-bold text-foreground">
            Step2: CCUS登録
          </h2>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-5" />
                  CCUS登録
                </CardTitle>
                <StatusBadge status={ccusStatus} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-body-md text-muted-foreground">
                建設キャリアアップシステム（CCUS）のカードを登録してください。
              </p>

              {ccusStatus === "rejected" &&
                ccusVerification?.rejection_reason && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <div>
                      <p className="text-body-sm font-medium text-destructive">
                        否認理由
                      </p>
                      <p className="text-body-sm text-destructive">
                        {ccusVerification.rejection_reason}
                      </p>
                    </div>
                  </div>
                )}

              {canSubmitCcus && (
                <Button
                  variant="default"
                  size="lg"
                  className="w-full rounded-full"
                  asChild
                >
                  <Link href="/profile/verification/ccus">
                    {ccusStatus === "rejected"
                      ? "再提出する"
                      : "登録に進む"}
                  </Link>
                </Button>
              )}

              {!canSubmitCcus && !identityApproved && (
                <p className="text-body-sm text-muted-foreground">
                  ※ CCUS登録は本人確認が承認された後に申請できます。
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {/* Back button */}
      <div className="mt-8">
        <Button
          variant="outline"
          size="lg"
          className="w-full rounded-full"
          asChild
        >
          <Link href="/mypage">もどる</Link>
        </Button>
      </div>
    </div>
  );
}
