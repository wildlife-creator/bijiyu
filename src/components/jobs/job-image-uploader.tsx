"use client";

import { useCallback, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { validateJobImageFile } from "@/lib/validations/job";

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
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      setError(null);

      if (existingImages.length + newFiles.length + files.length > maxImages) {
        setError(`画像は1案件あたり最大${maxImages}枚までアップロードできます`);
        e.target.value = "";
        return;
      }

      for (const file of files) {
        const validationError = validateJobImageFile(file);
        if (validationError) {
          setError(validationError);
          e.target.value = "";
          return;
        }
      }

      onFilesChange([...newFiles, ...files]);
      e.target.value = "";
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
      <p className="text-body-md font-medium text-foreground">
        数量についての詳細
      </p>
      <p className="text-body-sm text-muted-foreground">
        マッチングが成立した際に、マッチング先に共有されます。
      </p>

      {/* Existing images */}
      {existingImages.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {existingImages.map((img) => (
            <div key={img.id} className="group relative">
              <img
                src={img.imageUrl}
                alt="案件画像"
                className="aspect-square w-full rounded-lg object-cover"
              />
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
              <img
                src={URL.createObjectURL(file)}
                alt="新規画像"
                className="aspect-square w-full rounded-lg object-cover"
              />
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

      {/* Upload button */}
      {canAdd && (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-body-md text-muted-foreground transition-colors hover:border-primary hover:bg-muted/50">
          <span>＋画像を追加する</span>
          <input
            type="file"
            accept="image/jpeg,image/png"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
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
