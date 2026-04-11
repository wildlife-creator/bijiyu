"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendMessageAction } from "@/app/(authenticated)/messages/[threadId]/actions";
import { toast } from "sonner";

interface MessageInputProps {
  threadId: string;
  onOptimisticSend?: (body: string) => void;
  onSendComplete?: (messageId: string) => void;
}

export function MessageInput({ threadId, onOptimisticSend, onSendComplete }: MessageInputProps) {
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("画像は10MB以下にしてください");
      return;
    }
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("画像はJPEGまたはPNG形式のみ対応しています");
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    setImageFile(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleSubmit() {
    if (!body.trim() && !imageFile) return;

    // Build FormData BEFORE clearing state
    const formData = new FormData();
    formData.set("threadId", threadId);
    formData.set("body", body.trim());
    if (imageFile) {
      formData.set("image", imageFile);
    }

    onOptimisticSend?.(body.trim());
    setBody("");
    clearImage();

    startTransition(async () => {
      const result = await sendMessageAction(formData);
      if (result.success && result.data?.messageId) {
        onSendComplete?.(result.data.messageId);
      } else if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="sticky bottom-0 border-t border-border bg-background p-3">
      {imagePreview && (
        <div className="relative mb-2 inline-block">
          <img src={imagePreview} alt="添付プレビュー" className="h-16 rounded" />
          <button
            type="button"
            onClick={clearImage}
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={handleImageSelect}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mb-2 flex-shrink-0"
        >
          <Camera className="h-5 w-5 text-primary/70" />
        </button>
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            // Auto-resize
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
          }}
          placeholder="メッセージ"
          rows={1}
          className="flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          style={{ maxHeight: "120px" }}
        />
        <Button
          type="button"
          size="icon"
          onClick={handleSubmit}
          disabled={isPending || (!body.trim() && !imageFile)}
          className="h-9 w-9 flex-shrink-0 rounded-full bg-primary hover:bg-primary/90"
        >
          <Send className="h-4 w-4 text-white" />
        </Button>
      </div>
    </div>
  );
}
