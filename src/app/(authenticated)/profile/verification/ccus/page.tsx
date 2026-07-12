"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackButton } from "@/components/shared/back-button";

import {
  uploadFilesDirect,
  DOCUMENT_UPLOAD_RULE_10MB,
} from "@/lib/storage/direct-upload";
import {
  convertImageForUpload,
  ImageConvertError,
} from "@/lib/storage/image-convert";

import { submitCcusAction } from "./actions";

export default function CcusUploadPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [ccusWorkerId, setCcusWorkerId] = useState("");

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return;

    // iPhone の HEIC 写真は JPEG に変換してから扱う (他形式は素通し)
    let selectedFile: File;
    try {
      selectedFile = await convertImageForUpload(selected);
    } catch (err) {
      setError(
        err instanceof ImageConvertError
          ? err.message
          : "画像の読み込みに失敗しました。もう一度お試しください。",
      );
      return;
    }

    if (preview) URL.revokeObjectURL(preview);
    setFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
  }

  function handleSubmit() {
    if (!file) {
      setError("カード画像を選択してください");
      return;
    }

    if (!ccusWorkerId.trim()) {
      setError("技能者IDを入力してください");
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        // ファイルはブラウザから Storage へ直接アップロードし、パスだけ渡す
        // (Server Action 経由の File 送信は Vercel の 4.5MB 上限で 413 になる)
        const uploaded = await uploadFilesDirect({
          bucket: "ccus-documents",
          files: [file],
          rule: DOCUMENT_UPLOAD_RULE_10MB,
        });
        if (!uploaded.success) {
          setError(uploaded.error);
          return;
        }

        const result = await submitCcusAction({
          documentPath: uploaded.paths[0],
          ccusWorkerId: ccusWorkerId.trim(),
        });
        if (result.success) {
          router.push("/profile/verification");
        } else {
          setError(result.error);
        }
      } catch {
        setError("送信に失敗しました。通信環境をご確認のうえ再度お試しください");
      }
    });
  }

  return (
    <div className="min-h-dvh bg-muted">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-center text-heading-lg font-bold text-secondary">CCUS登録</h1>
      <p className="mt-2 text-center text-body-md text-muted-foreground">
        建設キャリアアップシステム（CCUS）のカードを登録してください。
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-body-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="mt-8 space-y-8">
        {/* Card upload */}
        <section className="space-y-4">
          <h2 className="text-heading-sm font-bold text-foreground">カード</h2>
          <Card>
            <CardContent>
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-48 w-full items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30">
                  {preview ? (
                    <Image
                      src={preview}
                      alt="カードプレビュー"
                      width={320}
                      height={192}
                      className="h-full w-auto rounded-lg object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <ImagePlus className="size-10" />
                      <span className="text-body-sm">
                        画像を選択してください
                      </span>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf,image/heic,image/heif,.heic,.heif"
                  className="hidden"
                  onChange={(e) => void handleFileChange(e)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full rounded-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  画像を登録する
                </Button>
                <p className="text-body-xs text-muted-foreground">
                  JPEG・PNG・WebP・PDF、iPhoneのHEIC写真も可／10MBまで
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* CCUS Worker ID */}
        <section className="space-y-4">
          <div className="space-y-2">
            <Label
              htmlFor="ccusWorkerId"
              className="text-heading-sm font-bold text-foreground"
            >
              技能者ID
            </Label>
            <Input
              id="ccusWorkerId"
              type="text"
              placeholder="12345678912345"
              value={ccusWorkerId}
              onChange={(e) => setCcusWorkerId(e.target.value)}
            />
            <p className="text-body-sm text-muted-foreground">
              ※名前の上にある、14桁の数字（ハイフンより前）をご入力ください。
            </p>
          </div>
        </section>
      </div>

      {/* Action buttons */}
      <div className="mt-8 flex flex-col items-center gap-3">
        <Button
          type="button"
          variant="default"
          className="w-full max-w-xs rounded-full"
          disabled={isPending || !file || !ccusWorkerId.trim()}
          onClick={handleSubmit}
        >
          {isPending ? "送信中..." : "送信する"}
        </Button>
        <BackButton href="/profile/verification" />
      </div>
      </div>
    </div>
  );
}
