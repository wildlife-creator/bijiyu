/**
 * admin 画面共通: 署名付きURLの書類・添付表示。
 * 統一ルール（admin spec）: 画像はインラインプレビュー・PDF はリンクで開く・
 * 生成失敗はフォールバック表示。
 * 使用画面: ADM-012（本人確認書類）/ ADM-017・019（問い合わせ添付）ほか。
 */

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
        className="flex aspect-video w-full items-center justify-center rounded-[8px] border border-border bg-muted/30 text-body-md font-medium text-secondary underline underline-offset-2"
      >
        PDF を開く
      </a>
    );
  }
  return (
    <div className="overflow-hidden rounded-[8px] border border-border bg-background">
      <img src={doc.url} alt={alt} className="w-full object-contain" />
    </div>
  );
}
