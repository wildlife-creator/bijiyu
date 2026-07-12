"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, FileText, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendMessageAction } from "@/app/(authenticated)/messages/[threadId]/actions";
import {
  uploadFilesDirect,
  validateFileAgainstRule,
  DOCUMENT_UPLOAD_RULE_10MB,
} from "@/lib/storage/direct-upload";
import {
  convertImageForUpload,
  ImageConvertError,
} from "@/lib/storage/image-convert";
import { toast } from "sonner";

interface MessageInputProps {
  threadId: string;
  onOptimisticSend?: (body: string) => void;
  onSendComplete?: (messageId: string) => void;
  /** A7: 退会済み相手など、送信不能な理由がある場合の表示メッセージ。
   *  設定されている場合、入力欄を隠してメッセージのみ表示する。 */
  disabledMessage?: string | null;
}

export function MessageInput({
  threadId,
  onOptimisticSend,
  onSendComplete,
  disabledMessage,
}: MessageInputProps) {
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    // iPhone の HEIC 写真は JPEG に変換してから扱う (他形式は素通し)
    let file: File;
    try {
      file = await convertImageForUpload(selected);
    } catch (err) {
      toast.error(
        err instanceof ImageConvertError
          ? err.message
          : "画像の読み込みに失敗しました。もう一度お試しください。",
      );
      return;
    }

    const validationError = validateFileAgainstRule(
      file,
      DOCUMENT_UPLOAD_RULE_10MB,
    );
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setImageFile(file);
    // PDF はプレビュー画像を作らない (下でファイル名チップを表示する)
    setImagePreview(
      file.type === "application/pdf" ? null : URL.createObjectURL(file),
    );
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
    const fileToUpload = imageFile;

    onOptimisticSend?.(body.trim());
    setBody("");
    clearImage();

    startTransition(async () => {
      try {
        // 画像はブラウザから Storage へ直接アップロードし、パスだけ渡す
        // (Server Action 経由の File 送信は Vercel の 4.5MB 上限で 413 になる)
        if (fileToUpload) {
          const uploaded = await uploadFilesDirect({
            bucket: "message-attachments",
            files: [fileToUpload],
            rule: DOCUMENT_UPLOAD_RULE_10MB,
          });
          if (!uploaded.success) {
            toast.error(uploaded.error);
            return;
          }
          formData.set("imagePath", uploaded.paths[0]);
        }

        const result = await sendMessageAction(formData);
        if (result.success && result.data?.messageId) {
          onSendComplete?.(result.data.messageId);
        } else if (!result.success) {
          toast.error(result.error);
        }
      } catch {
        toast.error(
          "送信に失敗しました。通信環境をご確認のうえ再度お試しください"
        );
      }
    });
  }

  if (disabledMessage) {
    return (
      <div className="sticky bottom-0 border-t border-border bg-muted p-4 text-center">
        <p className="text-body-sm text-muted-foreground">{disabledMessage}</p>
      </div>
    );
  }

  return (
    <div className="sticky bottom-0 border-t border-border bg-background p-3">
      {imageFile && (
        <div className="relative mb-2 inline-block">
          {imagePreview ? (
            <img
              src={imagePreview}
              alt="添付プレビュー"
              className="h-16 rounded"
            />
          ) : (
            <div className="flex h-16 items-center gap-2 rounded border border-border bg-muted px-3">
              <FileText className="h-5 w-5 text-secondary" />
              <span className="max-w-[160px] truncate text-body-xs text-muted-foreground">
                {imageFile.name}
              </span>
            </div>
          )}
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
          accept="image/jpeg,image/png,image/webp,application/pdf,image/heic,image/heif,.heic,.heif"
          className="hidden"
          onChange={(e) => void handleImageSelect(e)}
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
