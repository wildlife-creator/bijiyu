"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  withdrawalSchema,
  type WithdrawalInput,
} from "@/lib/validations/profile";
import { WITHDRAWAL_REASONS } from "@/lib/constants/profile-options";
import type { ActionResult } from "@/lib/types/action-result";
import { withdrawAction } from "./actions";

const initialState: ActionResult = { success: false, error: "" };

interface Props {
  /** 法人プラン Owner（corporate / corporate_premium）である場合のみ警告ダイアログを出す */
  isCorporateOwner: boolean;
  /** ダイアログ文言中の {display_name} に差し込む社名（未設定時はフォールバック） */
  displayName: string;
}

export function WithdrawalForm({ isCorporateOwner, displayName }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    withdrawAction,
    initialState,
  );
  const [selectedReason, setSelectedReason] = useState("");
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const {
    control,
    formState: { errors },
    trigger,
  } = useForm<WithdrawalInput>({
    resolver: zodResolver(withdrawalSchema),
    defaultValues: {
      reason: "",
      details: "",
      confirmed: undefined,
    },
  });

  useEffect(() => {
    if (state.success) {
      router.push("/");
    }
  }, [state, router]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!isCorporateOwner) return; // 通常フローはそのまま action へ
    e.preventDefault();
    setIsDialogOpen(true);
  }

  function handleConfirmedWithdraw() {
    setIsDialogOpen(false);
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    formAction(fd);
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-lg space-y-6">
        <h1 className="text-center text-heading-lg font-bold text-secondary">
          退会手続き
        </h1>

        <form
          ref={formRef}
          action={formAction}
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          {/* Reason select */}
          <div className="space-y-2">
            <Label>
              退会理由
              <span className="text-body-sm text-destructive">必須</span>
            </Label>
            <Controller
              name="reason"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                    setSelectedReason(value);
                    trigger("reason");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="お選びください" />
                  </SelectTrigger>
                  <SelectContent>
                    {WITHDRAWAL_REASONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {reason}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <input type="hidden" name="reason" value={selectedReason} />
            {errors.reason && (
              <p className="text-body-sm text-destructive">
                {errors.reason.message}
              </p>
            )}
          </div>

          {/* Details textarea */}
          <div className="space-y-2">
            <Label htmlFor="details">退会理由の詳細、改善事項等</Label>
            <Controller
              name="details"
              control={control}
              render={({ field }) => (
                <Textarea
                  id="details"
                  name="details"
                  placeholder="テキスト"
                  rows={4}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          {/* Agreement section */}
          <div className="space-y-3">
            <p className="text-body-sm text-foreground">
              退会すると以下の内容に同意したものとみなされます。
            </p>
            <ul className="list-disc space-y-1 pl-5 text-body-sm text-foreground">
              <li>アカウント情報が無効化されます</li>
              <li>公開中・下書きの案件は全て非公開になります</li>
              <li>応募中の案件はキャンセルされます</li>
              <li>有料プランは解約されます</li>
              <li>退会後にデータの復元はできません</li>
            </ul>
          </div>

          {/* Confirmation checkbox */}
          <div className="flex items-center gap-2">
            <Controller
              name="confirmed"
              control={control}
              render={({ field }) => (
                <>
                  <Checkbox
                    id="confirmed"
                    checked={field.value === true}
                    onCheckedChange={(checked) => {
                      const val = checked === true;
                      field.onChange(val ? true : undefined);
                      setIsConfirmed(val);
                      trigger("confirmed");
                    }}
                  />
                  {isConfirmed && (
                    <input type="hidden" name="confirmed" value="on" />
                  )}
                </>
              )}
            />
            <Label htmlFor="confirmed" className="text-body-sm">
              上記内容に同意して退会する
            </Label>
          </div>
          {errors.confirmed && (
            <p className="text-body-sm text-destructive">
              {errors.confirmed.message}
            </p>
          )}

          {/* Server error */}
          {!state.success && state.error && (
            <p className="text-body-sm text-destructive">{state.error}</p>
          )}

          {/* Buttons */}
          <div className="space-y-3 pt-2">
            <Button
              type="submit"
              variant="destructive"
              size="lg"
              className="w-full rounded-full"
              disabled={isPending}
            >
              {isPending ? "処理中..." : "退会する"}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full rounded-full"
              onClick={() => router.back()}
            >
              もどる
            </Button>
          </div>
        </form>
      </div>

      {/* 法人プラン Owner 用 警告ダイアログ（REQ-PF-006）*/}
      {isCorporateOwner && (
        <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>本当に退会しますか？</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-body-sm text-foreground">
                  <p>
                    退会すると、会社アカウント「
                    <span className="font-bold">{displayName}</span>
                    」は削除され、
                    <span className="font-bold">
                      あなたが招待した管理者・担当者のアカウントもまとめて利用停止
                    </span>
                    になります。招待された方々はビジ友にログインできなくなります。
                  </p>
                  <p>
                    一時的に料金だけ止めたい場合は、退会ではなく
                    <span className="font-bold">「プランの解約」</span>
                    をおすすめします。プランを解約すれば、後日あらためて法人プランにご契約いただくだけで、管理者・担当者のアカウント、作成したスカウト文例、受注者との過去メッセージ、すべてを元どおりに復活できます。
                  </p>
                  <p>
                    本当に退会した場合、同じ会社でビジ友を再開するには、新しく会社アカウントを作り直して、管理者・担当者をあらためて招待する必要があります（以前のスカウト文例・メッセージ履歴は引き継げません）。
                  </p>
                  <p className="font-bold">それでも退会しますか？</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
              <Button
                asChild
                size="lg"
                className="w-full rounded-full bg-primary text-white hover:bg-primary/90"
              >
                <Link href="/billing">プランを解約する</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full rounded-full"
                onClick={() => setIsDialogOpen(false)}
              >
                キャンセル
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="lg"
                className="w-full rounded-full"
                onClick={handleConfirmedWithdraw}
                disabled={isPending}
              >
                {isPending ? "処理中..." : "それでも退会する"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
