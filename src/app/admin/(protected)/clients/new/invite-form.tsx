"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClientInviteAction } from "./actions";

interface InviteDraft {
  companyName: string;
  lastName: string;
  firstName: string;
  email: string;
}

const EMPTY_DRAFT: InviteDraft = {
  companyName: "",
  lastName: "",
  firstName: "",
  email: "",
};

/**
 * ADM-006（入力）/ ADM-007（確認）: 管理責任者 新規作成フォーム。
 * 1ルート内で「入力 → 確認」を useState の段階的表示で実装する（標準パターン）。
 * 「作成する」のみ type="submit"、「修正する」「もどる」は type="button"。
 */
export function ClientInviteForm() {
  const [step, setStep] = useState<"input" | "confirm">("input");
  const [draft, setDraft] = useState<InviteDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Partial<InviteDraft>>({});
  const [isPending, startTransition] = useTransition();

  function update(key: keyof InviteDraft, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function validate(): boolean {
    const next: Partial<InviteDraft> = {};
    if (!draft.companyName.trim()) next.companyName = "発注者名（会社名）を入力してください";
    if (!draft.lastName.trim()) next.lastName = "姓を入力してください";
    if (!draft.firstName.trim()) next.firstName = "名を入力してください";
    if (!draft.email.trim()) {
      next.email = "メールアドレスを入力してください";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) {
      next.email = "メールアドレスの形式が正しくありません";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleConfirm() {
    if (validate()) {
      setStep("confirm");
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("companyName", draft.companyName.trim());
    formData.set("lastName", draft.lastName.trim());
    formData.set("firstName", draft.firstName.trim());
    formData.set("email", draft.email.trim());
    startTransition(async () => {
      const result = await createClientInviteAction(formData);
      // 成功時は Server Action 内で /admin/clients へ redirect される
      if (result && !result.success) {
        toast.error(result.error);
      }
    });
  }

  if (step === "confirm") {
    return (
      <form onSubmit={handleSubmit} className="mt-6">
        <h2 className="text-center text-body-lg font-bold text-foreground">
          入力内容の確認
        </h2>
        <div className="mt-4 overflow-hidden rounded-[8px] border border-border/20 bg-background">
          <ConfirmRow label="発注者名" value={draft.companyName} />
          <ConfirmRow label="担当者名" value={`${draft.lastName}　${draft.firstName}`} />
          <ConfirmRow label="メールアドレス" value={draft.email} />
        </div>
        <p className="mt-4 text-body-sm text-muted-foreground">
          「作成する」を押すと、上記メールアドレスへ招待メールが送信されます。
          プランの選択と決済は招待された本人が行います。
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Button
            type="submit"
            disabled={isPending}
            className="h-12 w-full max-w-xs rounded-full bg-primary font-bold text-white hover:bg-primary/90"
          >
            {isPending ? "作成中..." : "作成する"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full max-w-xs rounded-full"
            onClick={() => setStep("input")}
          >
            修正する
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="space-y-2">
        <Label htmlFor="companyName">
          発注者名
          <span className="ml-1 text-body-sm text-destructive">必須</span>
        </Label>
        <Input
          id="companyName"
          type="text"
          placeholder="○○株式会社"
          value={draft.companyName}
          onChange={(e) => update("companyName", e.target.value)}
          aria-invalid={!!errors.companyName}
        />
        {errors.companyName && (
          <p className="text-body-sm text-destructive">{errors.companyName}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>
          担当者名
          <span className="ml-1 text-body-sm text-destructive">必須</span>
        </Label>
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="田中"
              aria-label="姓"
              value={draft.lastName}
              onChange={(e) => update("lastName", e.target.value)}
              aria-invalid={!!errors.lastName}
            />
            {errors.lastName && (
              <p className="mt-1 text-body-sm text-destructive">
                {errors.lastName}
              </p>
            )}
          </div>
          <div className="flex-1">
            <Input
              type="text"
              placeholder="一郎"
              aria-label="名"
              value={draft.firstName}
              onChange={(e) => update("firstName", e.target.value)}
              aria-invalid={!!errors.firstName}
            />
            {errors.firstName && (
              <p className="mt-1 text-body-sm text-destructive">
                {errors.firstName}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="inviteEmail">
          メールアドレス
          <span className="ml-1 text-body-sm text-destructive">必須</span>
        </Label>
        <Input
          id="inviteEmail"
          type="email"
          placeholder="test@example.com"
          value={draft.email}
          onChange={(e) => update("email", e.target.value)}
          aria-invalid={!!errors.email}
        />
        {errors.email && (
          <p className="text-body-sm text-destructive">{errors.email}</p>
        )}
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Button
          type="button"
          onClick={handleConfirm}
          className="h-12 w-full max-w-xs rounded-full bg-primary font-bold text-white hover:bg-primary/90"
        >
          入力内容を確認する
        </Button>
        <Button
          asChild
          type="button"
          variant="outline"
          className="w-full max-w-xs rounded-full"
        >
          <Link href="/admin/clients">もどる</Link>
        </Button>
      </div>
    </div>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border/20 last:border-b-0">
      <p className="bg-muted px-4 py-2 text-body-sm font-medium text-muted-foreground">
        {label}
      </p>
      <p className="px-4 py-3 text-body-md text-foreground">{value}</p>
    </div>
  );
}
