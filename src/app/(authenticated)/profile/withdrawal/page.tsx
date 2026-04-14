"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { withdrawalSchema, type WithdrawalInput } from "@/lib/validations/profile";
import { WITHDRAWAL_REASONS } from "@/lib/constants/profile-options";
import type { ActionResult } from "@/lib/types/action-result";
import { withdrawAction } from "./actions";

const initialState: ActionResult = { success: false, error: "" };

export default function WithdrawalPage() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(withdrawAction, initialState);
  const [selectedReason, setSelectedReason] = useState("");
  const [isConfirmed, setIsConfirmed] = useState(false);

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

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-lg space-y-6">
        <h1 className="text-center text-heading-lg font-bold text-secondary">
          退会手続き
        </h1>

        <form action={formAction} className="space-y-4">
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
              <p className="text-body-sm text-destructive">{errors.reason.message}</p>
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
            <p className="text-body-sm text-destructive">{errors.confirmed.message}</p>
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
    </div>
  );
}
