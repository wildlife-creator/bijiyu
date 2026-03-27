"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { submitCcusAction } from "./actions";

export default function CcusUploadPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [ccusWorkerId, setCcusWorkerId] = useState("");

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    if (!selectedFile) return;

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
    const formData = new FormData();
    formData.append("document", file);
    formData.append("ccusWorkerId", ccusWorkerId.trim());

    startTransition(async () => {
      const result = await submitCcusAction(formData);
      if (result.success) {
        router.push("/profile/verification");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-heading-lg font-bold text-foreground">CCUS登録</h1>
      <p className="mt-2 text-body-md text-muted-foreground">
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
                  accept="image/jpeg,image/png,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
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
      <div className="mt-8 space-y-4">
        <Button
          type="button"
          variant="default"
          size="lg"
          className="w-full rounded-full"
          disabled={isPending || !file || !ccusWorkerId.trim()}
          onClick={handleSubmit}
        >
          {isPending ? "送信中..." : "送信する"}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="w-full rounded-full"
          asChild
        >
          <Link href="/profile/verification">もどる</Link>
        </Button>
      </div>
    </div>
  );
}
