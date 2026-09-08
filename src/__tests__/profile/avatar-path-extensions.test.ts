import { describe, expect, it } from "vitest";

import { isOwnedStoragePath } from "@/lib/storage/storage-path";
import {
  AVATAR_PATH_EXTENSIONS,
  DOCUMENT_PATH_EXTENSIONS,
} from "@/lib/validations/profile";
import { IMAGE_UPLOAD_RULE_5MB } from "@/lib/storage/direct-upload";

/**
 * プロフィール写真（アバター）の拡張子許可リストの回帰防止。
 *
 * 2026-09 ステージング確認-3(b): 画面案内・direct-upload ルール・avatars バケットは
 * WebP を許可しているのに、DB 保存直前の `AVATAR_PATH_EXTENSIONS` だけ webp が漏れていて、
 * WebP を選ぶと Storage 保存は成功するのに「ファイルを選択してください」で弾かれていた。
 * 4 つの関門が揃っていることをここで固定する。
 */
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("AVATAR_PATH_EXTENSIONS", () => {
  it("webp を含む（jpg / jpeg / png / webp）", () => {
    expect([...AVATAR_PATH_EXTENSIONS]).toEqual(["jpg", "jpeg", "png", "webp"]);
  });

  it("direct-upload の画像ルール（IMAGE_UPLOAD_RULE_5MB）と拡張子が一致する", () => {
    // ブラウザ側で通した形式をサーバー側の DB 保存でも必ず受け入れる
    expect([...AVATAR_PATH_EXTENSIONS].sort()).toEqual(
      [...IMAGE_UPLOAD_RULE_5MB.allowedExtensions].sort(),
    );
  });

  it("isOwnedStoragePath: 本人フォルダ配下の webp / jpg / png を許可する", () => {
    for (const ext of ["webp", "jpg", "jpeg", "png", "WEBP"]) {
      expect(
        isOwnedStoragePath(`${USER_ID}/avatar.${ext}`, USER_ID, AVATAR_PATH_EXTENSIONS),
      ).toBe(true);
    }
  });

  it("isOwnedStoragePath: gif / pdf / 他人フォルダは拒否する", () => {
    expect(
      isOwnedStoragePath(`${USER_ID}/avatar.gif`, USER_ID, AVATAR_PATH_EXTENSIONS),
    ).toBe(false);
    // 書類用には pdf があるがアバターには無い
    expect(
      isOwnedStoragePath(`${USER_ID}/avatar.pdf`, USER_ID, AVATAR_PATH_EXTENSIONS),
    ).toBe(false);
    expect(
      isOwnedStoragePath(
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/avatar.webp",
        USER_ID,
        AVATAR_PATH_EXTENSIONS,
      ),
    ).toBe(false);
  });

  it("書類用（DOCUMENT_PATH_EXTENSIONS）も webp を許可している（アバターと揃っている）", () => {
    expect(DOCUMENT_PATH_EXTENSIONS).toContain("webp");
  });
});
