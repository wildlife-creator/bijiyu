"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { sendBulkMessagesAction } from "./actions";
import { toast } from "sonner";

interface Recipient {
  id: string;
  name: string;
}

interface BulkSendFormProps {
  /** 宛先候補（職人）。サーバー側で会社単位スコープを解決済み。 */
  recipients: Recipient[];
}

export function BulkSendForm({ recipients }: BulkSendFormProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggleRecipient(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const allSelected =
    recipients.length > 0 && selectedIds.length === recipients.length;
  const someSelected = selectedIds.length > 0 && !allSelected;
  const selectAllState: boolean | "indeterminate" = allSelected
    ? true
    : someSelected
      ? "indeterminate"
      : false;

  function toggleAll() {
    setSelectedIds(allSelected ? [] : recipients.map((r) => r.id));
  }

  function handleSubmit() {
    if (!body.trim()) {
      toast.error("メッセージを入力してください");
      return;
    }
    if (selectedIds.length === 0) {
      toast.error("送信先を1名以上選択してください");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("body", body.trim());
      formData.set("recipientIds", JSON.stringify(selectedIds));

      const result = await sendBulkMessagesAction(formData);
      if (result.success && result.data) {
        toast.success(
          `${result.data.sent}名に送信しました${result.data.failed > 0 ? `（${result.data.failed}名が失敗）` : ""}`,
        );
        router.push("/messages");
      } else if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-2xl px-4">
        <h1 className="py-4 text-center text-lg font-bold text-secondary">一斉送信</h1>

        {/* Message body */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium">本文</label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="ここに本文が入ります。"
            rows={8}
            className="bg-background"
          />
        </div>

        {/* Recipient selection */}
        <div className="mb-8">
          <label className="mb-2 block text-sm font-medium">送信先選択</label>
          {recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              送信先がありません。メッセージをやりとりしたユーザーが表示されます。
            </p>
          ) : (
            <div>
              {/* Select all */}
              <label className="mb-4 flex cursor-pointer items-center gap-3">
                <Checkbox
                  checked={selectAllState}
                  onCheckedChange={toggleAll}
                  className="bg-background"
                />
                <span className="text-sm font-medium">すべて選択</span>
              </label>
              {/* Recipients */}
              <div className="space-y-3">
                {recipients.map((r) => (
                  <label
                    key={r.id}
                    className="flex cursor-pointer items-center gap-3"
                  >
                    <Checkbox
                      checked={selectedIds.includes(r.id)}
                      onCheckedChange={() => toggleRecipient(r.id)}
                      className="bg-background"
                    />
                    <span className="text-sm">{r.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex flex-col items-center gap-3 pb-8">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full max-w-xs rounded-full bg-primary text-white hover:bg-primary/90"
          >
            {isPending ? "送信中..." : "送信する"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full max-w-xs rounded-full"
            onClick={() => router.back()}
          >
            もどる
          </Button>
        </div>
      </div>
    </div>
  );
}
