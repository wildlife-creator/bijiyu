/**
 * admin 画面共通: 署名付きURLの書類・添付表示。
 * 統一ルール（admin spec）: 画像はインラインプレビュー（クリックで全画面ズーム）・
 * PDF はリンクで開く・生成失敗はフォールバック表示。
 * 使用画面: ADM-012（本人確認書類）/ ADM-017・019（問い合わせ添付）ほか。
 */

import { FileText } from "lucide-react";

import { ImageLightbox } from "@/components/shared/image-lightbox";

function isPdf(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

export function DocumentView({
  doc,
  alt,
}: {
  doc: { path: string; url: string | null };
  alt: string;
}) {
  if (!doc.url) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-[8px] border border-border bg-muted/30">
        <span className="text-body-sm text-muted-foreground">
          書類を表示できません
        </span>
      </div>
    );
  }
  if (isPdf(doc.path)) {
    return (
      <a
        href={doc.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-[8px] border border-border bg-muted/30 text-secondary"
      >
        <FileText className="size-8" />
        <span className="text-body-xs">PDFを開く</span>
      </a>
    );
  }
  return (
    <div className="overflow-hidden rounded-[8px] border border-border bg-background">
      <ImageLightbox src={doc.url} alt={alt} className="block w-full">
        <img src={doc.url} alt={alt} className="w-full object-contain" />
      </ImageLightbox>
    </div>
  );
}
