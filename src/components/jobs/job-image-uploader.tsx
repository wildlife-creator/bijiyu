"use client";

import { useCallback, useState } from "react";
import { Camera, FileText, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { validateJobImageFile } from "@/lib/validations/job";
import {
  convertImageForUpload,
  ImageConvertError,
} from "@/lib/storage/image-convert";

/** ストレージ URL が PDF かどうか (クエリを除いた末尾拡張子で判定) */
function isPdfUrl(url: string): boolean {
  return url.toLowerCase().split("?")[0].endsWith(".pdf");
}

interface ExistingImage {
  id: string;
  imageUrl: string;
  imageType: string;
  sortOrder: number;
}

interface JobImageUploaderProps {
  existingImages?: ExistingImage[];
  newFiles: File[];
  onFilesChange: (files: File[]) => void;
  onDeleteExisting?: (imageId: string) => void;
  maxImages?: number;
}

export function JobImageUploader({
  existingImages = [],
  newFiles,
  onFilesChange,
  onDeleteExisting,
  maxImages = 10,
}: JobImageUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const totalCount = existingImages.length + newFiles.length;
  const canAdd = totalCount < maxImages;

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawFiles = Array.from(e.target.files ?? []);
      e.target.value = "";
      setError(null);
      if (rawFiles.length === 0) return;

      if (existingImages.length + newFiles.length + rawFiles.length > maxImages) {
        setError(`画像は1案件あたり最大${maxImages}枚までアップロードできます`);
        return;
      }

      // iPhone の HEIC 写真は JPEG に変換してから扱う (他形式は素通し)
      const files: File[] = [];
      for (const f of rawFiles) {
        try {
          files.push(await convertImageForUpload(f));
        } catch (err) {
          setError(
            err instanceof ImageConvertError
              ? err.message
              : "画像の読み込みに失敗しました。もう一度お試しください。",
          );
          return;
        }
      }

      for (const file of files) {
        const validationError = validateJobImageFile(file);
        if (validationError) {
          setError(validationError);
          return;
        }
      }

      onFilesChange([...newFiles, ...files]);
    },
    [existingImages.length, newFiles, maxImages, onFilesChange]
  );

  const handleRemoveNew = useCallback(
    (index: number) => {
      const updated = newFiles.filter((_, i) => i !== index);
      onFilesChange(updated);
      setError(null);
    },
    [newFiles, onFilesChange]
  );

  return (
    <div className="space-y-3">
      {/* Placeholder when no images */}
      {existingImages.length === 0 && newFiles.length === 0 && (
        <div className="flex aspect-video w-full items-center justify-center rounded-[8px] border border-border bg-muted/40">
          <Camera className="size-12 text-muted-foreground/30" />
        </div>
      )}

      {/* Existing images */}
      {existingImages.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {existingImages.map((img) => (
            <div key={img.id} className="group relative">
              {isPdfUrl(img.imageUrl) ? (
                <a
                  href={img.imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border border-border bg-muted text-secondary"
                >
                  <FileText className="size-8" />
                  <span className="text-body-xs">PDFを開く</span>
                </a>
              ) : (
                <img
                  src={img.imageUrl}
                  alt="案件画像"
                  className="aspect-square w-full rounded-lg object-cover"
                />
              )}
              {onDeleteExisting && (
                <button
                  type="button"
                  onClick={() => onDeleteExisting(img.id)}
                  className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New file previews */}
      {newFiles.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {newFiles.map((file, index) => (
            <div key={`new-${index}`} className="group relative">
              {file.type === "application/pdf" ? (
                <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border border-border bg-muted px-1 text-secondary">
                  <FileText className="size-8" />
                  <span className="w-full truncate text-center text-body-xs">
                    {file.name}
                  </span>
                </div>
              ) : (
                <img
                  src={URL.createObjectURL(file)}
                  alt="新規画像"
                  className="aspect-square w-full rounded-lg object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => handleRemoveNew(index)}
                className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button — 0枚時は「画像を登録する」、1枚以上で「＋追加する」に切替（重複排除） */}
      {canAdd && (
        <div className="flex flex-col items-center gap-2">
          <label className="inline-flex cursor-pointer items-center justify-center rounded-[47px] border border-secondary px-8 py-2 text-body-md text-secondary transition-colors hover:bg-secondary/10">
            <span>{totalCount > 0 ? "＋追加する" : "画像を登録する"}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf,image/heic,image/heif,.heic,.heif"
              multiple
              onChange={(e) => void handleFileSelect(e)}
              className="hidden"
            />
          </label>
        </div>
      )}

      <p className="text-body-sm text-muted-foreground">
        {totalCount}/{maxImages}枚
      </p>

      {error && (
        <p className="text-body-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
