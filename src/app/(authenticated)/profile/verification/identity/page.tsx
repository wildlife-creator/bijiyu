"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { submitIdentityAction } from "./actions";

export default function IdentityUploadPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const fileInput1Ref = useRef<HTMLInputElement>(null);
  const fileInput2Ref = useRef<HTMLInputElement>(null);

  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [preview1, setPreview1] = useState<string | null>(null);
  const [preview2, setPreview2] = useState<string | null>(null);

  function handleFileChange(
    fileNumber: 1 | 2,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);

    if (fileNumber === 1) {
      if (preview1) URL.revokeObjectURL(preview1);
      setFile1(file);
      setPreview1(previewUrl);
    } else {
      if (preview2) URL.revokeObjectURL(preview2);
      setFile2(file);
      setPreview2(previewUrl);
    }
  }

  function handleSubmit() {
    if (!file1 || !file2) {
      setError("書類と顔写真の両方を選択してください");
      return;
    }

    setError(null);
    const formData = new FormData();
    formData.append("document1", file1);
    formData.append("document2", file2);

    startTransition(async () => {
      const result = await submitIdentityAction(formData);
      if (result.success) {
        router.push("/profile/verification");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-heading-lg font-bold text-foreground">本人確認</h1>
      <p className="mt-2 text-body-md text-muted-foreground">
        以下のいずれかの本人確認書類を提出してください。
      </p>
      <p className="mt-1 text-body-sm text-muted-foreground">
        運転免許証 / 運転経歴証明書 / マイナンバーカード / 在留カード
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-body-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="mt-8 space-y-8">
        {/* Document upload */}
        <section className="space-y-4">
          <h2 className="text-heading-sm font-bold text-foreground">書類</h2>
          <Card>
            <CardContent>
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-48 w-full items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30">
                  {preview1 ? (
                    <Image
                      src={preview1}
                      alt="書類プレビュー"
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
                  ref={fileInput1Ref}
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  className="hidden"
                  onChange={(e) => handleFileChange(1, e)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full rounded-full"
                  onClick={() => fileInput1Ref.current?.click()}
                >
                  画像を登録する
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Face photo upload */}
        <section className="space-y-4">
          <h2 className="text-heading-sm font-bold text-foreground">顔写真</h2>
          <Card>
            <CardContent>
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-48 w-full items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30">
                  {preview2 ? (
                    <Image
                      src={preview2}
                      alt="顔写真プレビュー"
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
                  ref={fileInput2Ref}
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  className="hidden"
                  onChange={(e) => handleFileChange(2, e)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full rounded-full"
                  onClick={() => fileInput2Ref.current?.click()}
                >
                  画像を登録する
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      {/* Action buttons */}
      <div className="mt-8 space-y-4">
        <Button
          type="button"
          variant="default"
          size="lg"
          className="w-full rounded-full"
          disabled={isPending || !file1 || !file2}
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
