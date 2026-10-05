"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";

import {
  uploadFilesDirect,
  DOCUMENT_UPLOAD_RULE_10MB,
} from "@/lib/storage/direct-upload";
import {
  convertImageForUpload,
  ImageConvertError,
} from "@/lib/storage/image-convert";
import type { SignedApplicationDocument } from "@/lib/storage/application-documents";
import { isPdfUrl } from "@/lib/utils/is-pdf-url";
import { ImageLightbox } from "@/components/shared/image-lightbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { updateOrderDetailsAction } from "@/app/(authenticated)/applications/actions";

interface OrderEditFormProps {
  applicationId: string;
  defaultWorkLocation: string;
  defaultClientNotes: string;
  defaultFirstWorkDate: string;
  /** 発注時に付けた書類（応募レベル）。案件の書類はここでは扱わない */
  existingDocuments: SignedApplicationDocument[];
}

export function OrderEditForm({
  applicationId,
  defaultWorkLocation,
  defaultClientNotes,
  defaultFirstWorkDate,
  existingDocuments,
}: OrderEditFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [workLocation, setWorkLocation] = useState(defaultWorkLocation);
  const [clientNotes, setClientNotes] = useState(defaultClientNotes);
  const [firstWorkDate, setFirstWorkDate] = useState(defaultFirstWorkDate);
  const [keptDocuments, setKeptDocuments] = useState(existingDocuments);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newFilePreviews, setNewFilePreviews] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"changed" | "unchanged" | null>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    const selected = Array.from(files);
    // Reset input so the same file can be re-selected (変換 await の前に退避)
    e.target.value = "";

    // iPhone の HEIC 写真は JPEG に変換してから扱う (他形式は素通し)
    const converted: File[] = [];
    for (const selectedFile of selected) {
      try {
        converted.push(await convertImageForUpload(selectedFile));
      } catch (err) {
        setError(
          err instanceof ImageConvertError
            ? err.message
            : "画像の読み込みに失敗しました。もう一度お試しください。",
        );
        return;
      }
    }

    setNewFiles((prev) => [...prev, ...converted]);
    setNewFilePreviews((prev) => [
      ...prev,
      ...converted.map((file) => URL.createObjectURL(file)),
    ]);
  }

  function removeNewFile(index: number) {
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
    setNewFilePreviews((prev) => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
  }

  function removeKeptDocument(entry: string) {
    setKeptDocuments((prev) => prev.filter((doc) => doc.entry !== entry));
  }

  async function handleSubmit() {
    setIsLoading(true);
    setError(null);

    // 書類はブラウザから Storage へ直接アップロードし、パスだけ渡す
    // (Server Action 経由の File 送信は Vercel の 4.5MB 上限で 413 になる)
    const uploaded = await uploadFilesDirect({
      bucket: "application-documents",
      files: newFiles,
      rule: DOCUMENT_UPLOAD_RULE_10MB,
      subdir: applicationId,
    });
    if (!uploaded.success) {
      setError(uploaded.error);
      setIsLoading(false);
      return;
    }

    const formData = new FormData();
    formData.set("applicationId", applicationId);
    formData.set("workLocation", workLocation);
    formData.set("clientNotes", clientNotes);
    formData.set("firstWorkDate", firstWorkDate);
    keptDocuments.forEach((doc) => {
      formData.append("keepDocuments", doc.entry);
    });
    uploaded.paths.forEach((path) => {
      formData.append("documentPaths", path);
    });

    const actionResult = await updateOrderDetailsAction(formData);

    if (actionResult.success) {
      setResult(actionResult.data?.changed === false ? "unchanged" : "changed");
    } else {
      setError(actionResult.error ?? "エラーが発生しました");
      setIsLoading(false);
    }
  }

  function handleDone() {
    router.replace(`/applications/orders/${applicationId}`);
    router.refresh();
  }

  const canSubmit = workLocation.trim() !== "" && firstWorkDate !== "";
  const hasAnyDocument = keptDocuments.length > 0 || newFiles.length > 0;

  return (
    <>
      <div className="mt-6 space-y-4">
        <p className="text-body-sm text-muted-foreground">
          発注が確定した応募者にだけ表示される勤務の詳細です。
        </p>

        <div className="space-y-2">
          <Label htmlFor="order-edit-work-location" className="text-body-md font-bold">
            勤務地 <span className="text-destructive text-body-sm">必須</span>
          </Label>
          <Input
            id="order-edit-work-location"
            value={workLocation}
            onChange={(e) => setWorkLocation(e.target.value)}
            placeholder="東京都千代田区丸の内XX-XX"
            className="rounded-[8px]"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-body-md font-bold">業務に関する書類</Label>

          {/* 登録済みの書類（✕ で外す。保存するまでは消えない） */}
          {keptDocuments.length > 0 && (
            <div className="space-y-2">
              {keptDocuments.map((doc, i) => (
                <div
                  key={doc.entry}
                  className="relative overflow-hidden rounded-[8px] border border-border"
                >
                  {isPdfUrl(doc.url) ? (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-40 flex-col items-center justify-center gap-1 bg-muted text-secondary"
                    >
                      <FileText className="size-8" />
                      <span className="text-body-xs">PDFを開く</span>
                    </a>
                  ) : (
                    <ImageLightbox
                      src={doc.url}
                      alt={`業務書類 ${i + 1}`}
                      className="block w-full"
                    >
                      <img
                        src={doc.url}
                        alt={`業務書類 ${i + 1}`}
                        className="h-40 w-full object-contain bg-muted"
                      />
                    </ImageLightbox>
                  )}
                  <button
                    type="button"
                    aria-label={`登録済みの書類 ${i + 1} を削除`}
                    className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-black/50 text-white text-xs"
                    onClick={() => removeKeptDocument(doc.entry)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 追加する書類のプレビュー */}
          {newFilePreviews.length > 0 && (
            <div className="space-y-2">
              {newFilePreviews.map((preview, i) => (
                <div
                  key={preview}
                  className="relative overflow-hidden rounded-[8px] border border-border"
                >
                  {newFiles[i]?.type === "application/pdf" ? (
                    <div className="flex h-40 flex-col items-center justify-center gap-1 bg-muted text-secondary">
                      <FileText className="size-8" />
                      <span className="max-w-[80%] truncate text-body-xs">
                        {newFiles[i]?.name}
                      </span>
                    </div>
                  ) : (
                    <img
                      src={preview}
                      alt={`追加する書類 ${i + 1}`}
                      className="h-40 w-full object-contain bg-muted"
                    />
                  )}
                  <button
                    type="button"
                    aria-label={`追加する書類 ${i + 1} を取り消す`}
                    className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-black/50 text-white text-xs"
                    onClick={() => removeNewFile(i)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {!hasAnyDocument && (
            <p className="text-body-sm text-muted-foreground">
              登録されている書類はありません。
            </p>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,image/heic,image/heif,.heic,.heif"
            multiple
            className="hidden"
            onChange={(e) => void handleFileSelect(e)}
          />
          <p className="text-body-xs text-muted-foreground">
            JPEG・PNG・WebP・PDF、iPhoneのHEIC写真も可／10MBまで
          </p>

          <div className="flex flex-col items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => fileInputRef.current?.click()}
            >
              {hasAnyDocument ? "＋追加する" : "書類を登録する"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="order-edit-client-notes" className="text-body-md font-bold">
            その他
          </Label>
          <Textarea
            id="order-edit-client-notes"
            value={clientNotes}
            onChange={(e) => setClientNotes(e.target.value)}
            placeholder="連絡事項を記入"
            className="rounded-[8px]"
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="order-edit-first-work-date" className="text-body-md font-bold">
            初回稼働日 <span className="text-destructive text-body-sm">必須</span>
          </Label>
          <Input
            id="order-edit-first-work-date"
            type="date"
            value={firstWorkDate}
            onChange={(e) => setFirstWorkDate(e.target.value)}
            className="rounded-[8px]"
          />
          <p className="text-body-xs text-muted-foreground">
            初回稼働日を変えると、受注者がキャンセルできる期限と、評価を入力できる開始日も変わります。
          </p>
        </div>

        {error && <p className="text-body-sm text-destructive">{error}</p>}

        <p className="text-center text-body-xs text-muted-foreground">
          保存すると、変更した内容が受注者にメールで通知されます。
        </p>

        <div className="mx-auto flex w-full max-w-xs flex-col gap-3">
          <Button
            type="button"
            className="w-full rounded-pill text-body-md text-white border-primary"
            disabled={!canSubmit}
            pending={isLoading}
            onClick={handleSubmit}
          >
            保存する
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full rounded-pill text-body-md"
            onClick={() => router.back()}
          >
            もどる
          </Button>
        </div>
      </div>

      <AlertDialog open={result !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {result === "unchanged" ? "変更はありません" : "保存しました"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {result === "unchanged"
                ? "発注内容は変更されていません。"
                : "発注内容を変更しました。受注者にメールでお知らせしました。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleDone}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
