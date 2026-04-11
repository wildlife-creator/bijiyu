"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { sendBulkMessagesAction } from "./actions";
import { toast } from "sonner";

interface Recipient {
  id: string;
  name: string;
}

export default function BulkSendPage() {
  const router = useRouter();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Fetch existing thread participants
  useEffect(() => {
    async function loadRecipients() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: threads } = await supabase
        .from("message_threads")
        .select(
          `id, participant_1_id, participant_2_id,
           participant_1:users!message_threads_participant_1_id_fkey(id, last_name, first_name),
           participant_2:users!message_threads_participant_2_id_fkey(id, last_name, first_name)`,
        )
        .or(
          `participant_1_id.eq.${user.id},participant_2_id.eq.${user.id}`,
        );

      if (!threads) return;

      const recipientMap = new Map<string, string>();

      for (const thread of threads) {
        const p1 = thread.participant_1 as unknown as {
          id: string;
          last_name: string | null;
          first_name: string | null;
        } | null;
        const p2 = thread.participant_2 as unknown as {
          id: string;
          last_name: string | null;
          first_name: string | null;
        } | null;

        const other = thread.participant_1_id === user.id ? p2 : p1;
        if (other && !recipientMap.has(other.id)) {
          const name =
            `${other.last_name || ""}${other.first_name || ""}`.trim() ||
            "退会済みユーザー";
          recipientMap.set(other.id, name);
        }
      }

      setRecipients(
        Array.from(recipientMap.entries()).map(([id, name]) => ({ id, name })),
      );
    }

    loadRecipients();
  }, []);

  function toggleRecipient(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
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
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium">送信先選択</label>
            {recipients.length > 0 && (
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() =>
                  setSelectedIds((prev) =>
                    prev.length === recipients.length
                      ? []
                      : recipients.map((r) => r.id),
                  )
                }
              >
                {selectedIds.length === recipients.length
                  ? "全解除"
                  : "全選択"}
              </button>
            )}
          </div>
          {recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              送信先がありません。メッセージをやりとりしたユーザーが表示されます。
            </p>
          ) : (
            <div className="space-y-3">
              {recipients.map((r) => (
                <label
                  key={r.id}
                  className="flex cursor-pointer items-center gap-3"
                >
                  <Checkbox
                    checked={selectedIds.includes(r.id)}
                    onCheckedChange={() => toggleRecipient(r.id)}
                  />
                  <span className="text-sm">{r.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex flex-col items-center gap-3 pb-8">
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full max-w-xs rounded-full bg-primary text-white hover:bg-primary/90"
          >
            {isPending ? "送信中..." : "送信する"}
          </Button>
          <Button
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
