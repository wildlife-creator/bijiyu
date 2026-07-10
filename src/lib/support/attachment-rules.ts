// ---------------------------------------------------------------------------
// お問い合わせ・トラブル報告 添付ファイルの共有ルール
// ---------------------------------------------------------------------------
// クライアント (直接アップロード前の検証) とサーバー (署名付き URL 発行・
// パス検証) の両方から import するため、Node/サーバー専用 API に依存しない
// isomorphic なモジュールとして分離している。

export const SUPPORT_ATTACHMENTS_BUCKET = "support-attachments";

export const SUPPORT_ATTACHMENT_RULES = {
  maxFiles: 5,
  maxBytesPerFile: 5 * 1024 * 1024, // 5MB
  allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
  allowedExtensions: ["jpg", "jpeg", "png", "pdf"],
} as const;

export interface SupportAttachmentMeta {
  name: string;
  size: number;
  type: string;
}

export function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx < 0 || idx === fileName.length - 1) return "";
  return fileName.slice(idx + 1).toLowerCase();
}

/**
 * 添付ファイル1件のメタ情報を検証する。問題なければ null を返す。
 * (実サイズ・MIME はバケットの file_size_limit / allowed_mime_types でも強制)
 */
export function validateSupportAttachmentMeta(
  meta: SupportAttachmentMeta,
): string | null {
  if (meta.size > SUPPORT_ATTACHMENT_RULES.maxBytesPerFile) {
    return "1ファイルあたり5MBまでのファイルを添付できます";
  }
  if (
    !(SUPPORT_ATTACHMENT_RULES.allowedMimeTypes as readonly string[]).includes(
      meta.type,
    )
  ) {
    return "添付できるのは画像（JPEG／PNG）とPDFのみです";
  }
  const ext = extensionOf(meta.name);
  if (
    !(SUPPORT_ATTACHMENT_RULES.allowedExtensions as readonly string[]).includes(
      ext,
    )
  ) {
    return "添付できるのは画像（JPEG／PNG）とPDFのみです";
  }
  return null;
}

const UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const EXT_PATTERN = "(jpg|jpeg|png|pdf)";

/**
 * 署名付き URL 発行時にサーバーが生成したパス形式かを検証する。
 * - contact:  `contact/${uuid}.${ext}` (匿名可のため userId なし)
 * - trouble:  `trouble/${userId}/${uuid}.${ext}`
 */
export function isValidSupportAttachmentPath(
  path: string,
  kind: "contact" | "trouble",
  userId?: string,
): boolean {
  if (kind === "trouble") {
    if (!userId) return false;
    const re = new RegExp(
      `^trouble/${userId}/${UUID_PATTERN}\\.${EXT_PATTERN}$`,
    );
    return re.test(path);
  }
  const re = new RegExp(`^contact/${UUID_PATTERN}\\.${EXT_PATTERN}$`);
  return re.test(path);
}
