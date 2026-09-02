"use client";

import {
  VIDEO_UPLOAD_ALLOWED_EXTENSIONS,
  VIDEO_UPLOAD_ALLOWED_MIME_TYPES,
  VIDEO_UPLOAD_MAX_BYTES,
  VIDEO_UPLOAD_MAX_BYTES_LABEL,
  VIDEO_UPLOAD_TYPE_ERROR_MESSAGE,
} from "@/lib/videos/constants";

/**
 * ブラウザ → Cloudflare Stream 直接アップロード（P4 動画基盤）。
 *
 * Server Action（`createVideoUploadAction`）が発行した一時 URL へ、ファイル本体を
 * multipart/form-data（field: file）で POST する。Vercel の Server Action ボディ上限
 * （約 4.5MB）を通さないため、ファイルは必ずブラウザから直接送る。
 * 進捗は XHR の upload.progress で取る（fetch は送信進捗を取れない）。
 */

/** ファイルの事前検証。問題なければ null。 */
export function validateVideoFile(file: File): string | null {
  const ext = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase()
    : "";
  const mimeOk =
    file.type === "" || VIDEO_UPLOAD_ALLOWED_MIME_TYPES.includes(file.type);
  const extOk = VIDEO_UPLOAD_ALLOWED_EXTENSIONS.includes(ext);
  if (!mimeOk || !extOk) return VIDEO_UPLOAD_TYPE_ERROR_MESSAGE;
  if (file.size > VIDEO_UPLOAD_MAX_BYTES) {
    return `ファイルサイズは${VIDEO_UPLOAD_MAX_BYTES_LABEL}以下にしてください`;
  }
  return null;
}

export function uploadVideoToCloudflare(params: {
  uploadUrl: string;
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const { uploadUrl, file, onProgress } = params;
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("upload failed (network)"));
    xhr.onabort = () => reject(new Error("upload aborted"));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
