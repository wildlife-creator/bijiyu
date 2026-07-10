// ---------------------------------------------------------------------------
// Server Action 側のストレージパス検証 (direct-upload の対)
// ---------------------------------------------------------------------------
// ブラウザ直接アップロード後、Server Action はファイル本体ではなくパス文字列を
// 受け取る。クライアント入力なので、以下を必ず検証してから DB に保存する:
//   1. パスが本人 (ownerId) のフォルダ配下であること
//   2. パストラバーサル・不正文字が無いこと
//   3. 拡張子が許可リスト内であること
// Storage 側の認可 (own-folder INSERT ポリシー + バケットの file_size_limit /
// allowed_mime_types) と合わせて二重防御になる。

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export function isOwnedStoragePath(
  path: string,
  ownerId: string,
  allowedExtensions: readonly string[],
): boolean {
  if (!path || !ownerId) return false;
  if (!path.startsWith(`${ownerId}/`)) return false;

  const segments = path.split("/");
  // `${ownerId}/file.ext` 〜 `${ownerId}/subdir/file.ext` の 2〜3 階層のみ許可
  if (segments.length < 2 || segments.length > 3) return false;
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") return false;
    if (!SAFE_SEGMENT.test(segment)) return false;
  }

  const base = segments[segments.length - 1];
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return false;
  const ext = base.slice(dot + 1).toLowerCase();
  return allowedExtensions.includes(ext);
}
