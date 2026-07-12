/** ストレージ URL / パスが PDF かどうか（クエリを除いた末尾拡張子で判定） */
export function isPdfUrl(url: string): boolean {
  return url.toLowerCase().split("?")[0].endsWith(".pdf");
}
