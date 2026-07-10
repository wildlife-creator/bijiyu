import { describe, expect, it } from "vitest";

import { isOwnedStoragePath } from "@/lib/storage/storage-path";

/**
 * direct-upload 後に Server Action が受け取るストレージパスの検証。
 * クライアント入力なので、本人フォルダ外・トラバーサル・不正拡張子を
 * 確実に弾けることが直接アップロード方式の安全性の要。
 */

const UID = "11111111-1111-1111-1111-111111111111";
const EXTS = ["jpg", "jpeg", "png"] as const;

describe("isOwnedStoragePath", () => {
  it("本人フォルダ直下のファイルを許可する", () => {
    expect(isOwnedStoragePath(`${UID}/photo.jpg`, UID, EXTS)).toBe(true);
    expect(isOwnedStoragePath(`${UID}/a-b_c.1.png`, UID, EXTS)).toBe(true);
  });

  it("サブフォルダ1階層 (applicationId 等) を許可する", () => {
    expect(
      isOwnedStoragePath(`${UID}/app-123/doc.png`, UID, EXTS),
    ).toBe(true);
  });

  it("他ユーザーのフォルダを拒否する", () => {
    expect(
      isOwnedStoragePath(
        "22222222-2222-2222-2222-222222222222/photo.jpg",
        UID,
        EXTS,
      ),
    ).toBe(false);
  });

  it("パストラバーサル・空セグメントを拒否する", () => {
    expect(isOwnedStoragePath(`${UID}/../evil.jpg`, UID, EXTS)).toBe(false);
    expect(isOwnedStoragePath(`${UID}/..%2Fevil.jpg`, UID, EXTS)).toBe(false);
    expect(isOwnedStoragePath(`${UID}//evil.jpg`, UID, EXTS)).toBe(false);
    expect(isOwnedStoragePath(`${UID}/./evil.jpg`, UID, EXTS)).toBe(false);
  });

  it("prefix が一致するだけの別ユーザー ID を拒否する", () => {
    // `${UID}x/...` のような「startsWith だけ通る」パスは folder[1] 不一致で拒否
    expect(isOwnedStoragePath(`${UID}x/photo.jpg`, UID, EXTS)).toBe(false);
  });

  it("許可外拡張子・拡張子なしを拒否する", () => {
    expect(isOwnedStoragePath(`${UID}/evil.exe`, UID, EXTS)).toBe(false);
    expect(isOwnedStoragePath(`${UID}/noext`, UID, EXTS)).toBe(false);
    expect(isOwnedStoragePath(`${UID}/trailing.`, UID, EXTS)).toBe(false);
  });

  it("大文字拡張子は小文字化して判定する", () => {
    expect(isOwnedStoragePath(`${UID}/PHOTO.JPG`, UID, EXTS)).toBe(true);
  });

  it("深すぎる階層 (4階層以上) を拒否する", () => {
    expect(isOwnedStoragePath(`${UID}/a/b/c.jpg`, UID, EXTS)).toBe(false);
  });

  it("空文字・空 ownerId を拒否する", () => {
    expect(isOwnedStoragePath("", UID, EXTS)).toBe(false);
    expect(isOwnedStoragePath(`${UID}/a.jpg`, "", EXTS)).toBe(false);
  });
});
