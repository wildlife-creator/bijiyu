"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ExternalVideoUrlSchema,
  VideoAdminLabelSchema,
} from "@/lib/validations/video";
import {
  VIDEO_UPLOAD_MAX_BYTES_LABEL,
  type VideoPlacement,
} from "@/lib/videos/constants";
import {
  uploadVideoToCloudflare,
  validateVideoFile,
} from "@/lib/videos/upload-client";

import {
  addExternalVideoAction,
  createVideoUploadAction,
  deleteVideoAction,
} from "./actions";

interface VideoAddFormProps {
  userId: string;
  placement: VideoPlacement;
  cloudflareEnabled: boolean;
  onAdded: () => void;
}

/**
 * 動画の追加フォーム（2 way）。
 * - ファイル: ドラッグ＆ドロップ or 選択 → Cloudflare へ直接アップロード（進捗バー・二重送信防止）
 * - URL: TikTok 等の URL を貼り付けて即時公開
 */
export function VideoAddForm({
  userId,
  placement,
  cloudflareEnabled,
  onAdded,
}: VideoAddFormProps) {
  const [fileLabel, setFileLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [url, setUrl] = useState("");
  const [urlLabel, setUrlLabel] = useState("");
  const [urlPending, startUrlTransition] = useTransition();

  function pickFile(candidate: File | null | undefined) {
    if (!candidate) return;
    const error = validateVideoFile(candidate);
    if (error) {
      toast.error(error);
      return;
    }
    setFile(candidate);
  }

  async function handleUpload() {
    if (!file || uploading) return;
    const labelParsed = VideoAdminLabelSchema.safeParse(fileLabel);
    if (!labelParsed.success) {
      toast.error(labelParsed.error.issues[0]?.message ?? "入力内容が不正です");
      return;
    }
    setUploading(true);
    setProgress(0);

    const created = await createVideoUploadAction({
      userId,
      placement,
      adminLabel: fileLabel,
    });
    if (!created.success || !created.data) {
      setUploading(false);
      toast.error(
        created.success ? "アップロード URL を取得できませんでした" : created.error,
      );
      return;
    }
    const { videoId, uploadUrl } = created.data;

    try {
      await uploadVideoToCloudflare({
        uploadUrl,
        file,
        onProgress: setProgress,
      });
    } catch (err) {
      console.error("[VideoAddForm] upload failed", err);
      // 途中で失敗した行は残さない（Cloudflare 側も削除される）
      await deleteVideoAction({ videoId }).catch(() => undefined);
      setUploading(false);
      toast.error(
        "アップロードに失敗しました。通信状況を確認して再度お試しください",
      );
      onAdded();
      return;
    }

    setUploading(false);
    setFile(null);
    setFileLabel("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    toast.success(
      "アップロードしました。Cloudflare での処理が完了すると自動で公開されます",
    );
    onAdded();
  }

  function handleAddUrl(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const urlParsed = ExternalVideoUrlSchema.safeParse(url);
    if (!urlParsed.success) {
      toast.error(urlParsed.error.issues[0]?.message ?? "入力内容が不正です");
      return;
    }
    const labelParsed = VideoAdminLabelSchema.safeParse(urlLabel);
    if (!labelParsed.success) {
      toast.error(labelParsed.error.issues[0]?.message ?? "入力内容が不正です");
      return;
    }
    startUrlTransition(async () => {
      const result = await addExternalVideoAction({
        userId,
        placement,
        url,
        adminLabel: urlLabel,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("動画を追加しました");
      setUrl("");
      setUrlLabel("");
      onAdded();
    });
  }

  return (
    <div className="mt-2 flex flex-col gap-6">
      {/* ファイルアップロード */}
      <div className="rounded-[8px] border border-border/20 bg-background p-4">
        <p className="text-body-sm font-bold">ファイルをアップロード（MP4）</p>
        {!cloudflareEnabled && (
          <p className="mt-2 rounded-[8px] bg-muted p-3 text-body-xs text-muted-foreground">
            この環境では Cloudflare Stream が設定されていないため、ファイルのアップロードは利用できません。URL で登録してください。
          </p>
        )}
        <div
          role="button"
          tabIndex={0}
          aria-label="動画ファイルを選択"
          aria-disabled={!cloudflareEnabled || uploading}
          onClick={() => {
            if (cloudflareEnabled && !uploading) fileInputRef.current?.click();
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && cloudflareEnabled && !uploading) {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (cloudflareEnabled && !uploading) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!cloudflareEnabled || uploading) return;
            pickFile(e.dataTransfer.files?.[0]);
          }}
          className={`mt-3 flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-[8px] border-2 border-dashed p-4 text-center text-body-sm transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-border/40 bg-background"
          } ${!cloudflareEnabled || uploading ? "cursor-not-allowed opacity-60" : ""}`}
        >
          {file ? (
            <>
              <span className="font-bold text-foreground">{file.name}</span>
              <span className="mt-1 text-body-xs text-muted-foreground">
                {(file.size / (1024 * 1024)).toFixed(1)} MB
              </span>
            </>
          ) : (
            <>
              <span className="text-foreground">
                ここに動画ファイルをドラッグ＆ドロップ
              </span>
              <span className="mt-1 text-body-xs text-muted-foreground">
                またはクリックして選択（MP4、{VIDEO_UPLOAD_MAX_BYTES_LABEL}以下・5 分以内）
              </span>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,.mp4,.mov"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />

        <div className="mt-3">
          <Label htmlFor={`file-label-${placement}`} className="text-body-sm font-bold">
            管理用ラベル（任意）
          </Label>
          <Input
            id={`file-label-${placement}`}
            value={fileLabel}
            onChange={(e) => setFileLabel(e.target.value)}
            placeholder="例: ユーザー撮影 2026-09"
            maxLength={100}
            disabled={uploading}
            className="mt-2 bg-background"
          />
        </div>

        {uploading && (
          <div className="mt-3" aria-live="polite">
            <progress
              value={progress}
              max={100}
              aria-label="アップロードの進捗"
              className="h-2 w-full overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
            />
            <p className="mt-1 text-body-xs text-muted-foreground">
              アップロード中… {progress}%
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="default"
            disabled={!cloudflareEnabled || !file || uploading}
            onClick={handleUpload}
            className="rounded-full text-white"
          >
            {uploading ? "アップロード中…" : "アップロードして追加"}
          </Button>
        </div>
      </div>

      {/* URL 貼り付け */}
      <form
        onSubmit={handleAddUrl}
        className="rounded-[8px] border border-border/20 bg-background p-4"
      >
        <p className="text-body-sm font-bold">URL で追加（TikTok 等）</p>
        <div className="mt-3">
          <Label htmlFor={`url-${placement}`} className="text-body-sm font-bold">
            URL
          </Label>
          <Input
            id={`url-${placement}`}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.tiktok.com/@.../video/..."
            disabled={urlPending}
            className="mt-2 bg-background"
          />
        </div>
        <div className="mt-3">
          <Label htmlFor={`url-label-${placement}`} className="text-body-sm font-bold">
            管理用ラベル（任意）
          </Label>
          <Input
            id={`url-label-${placement}`}
            value={urlLabel}
            onChange={(e) => setUrlLabel(e.target.value)}
            placeholder="例: TikTok 投稿（2026-09）"
            maxLength={100}
            disabled={urlPending}
            className="mt-2 bg-background"
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            type="submit"
            variant="default"
            disabled={urlPending || url.trim() === ""}
            className="rounded-full text-white"
          >
            {urlPending ? "追加中…" : "URL で追加"}
          </Button>
        </div>
      </form>
    </div>
  );
}
