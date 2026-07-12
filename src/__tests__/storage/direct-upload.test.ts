import { describe, expect, it } from "vitest";

import {
  validateFileAgainstRule,
  IMAGE_UPLOAD_RULE_10MB,
  IMAGE_UPLOAD_RULE_5MB,
  DOCUMENT_UPLOAD_RULE_10MB,
} from "@/lib/storage/direct-upload";

/**
 * direct-upload のクライアント側ファイル検証。
 * 旧 Server Action 内バリデーション (validateJobImageFile /
 * uploadClientProfileImageAction 等) と同等のガードを維持していることを確認。
 * 実サイズ・MIME の強制はバケットの file_size_limit / allowed_mime_types
 * (20260710120000_bucket_upload_limits.sql) が担う。
 */

function file(name: string, type: string, sizeBytes: number): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: sizeBytes });
  return f;
}

describe("validateFileAgainstRule", () => {
  it("画像ルール: JPEG/PNG を許可する", () => {
    expect(
      validateFileAgainstRule(
        file("a.jpg", "image/jpeg", 1024),
        IMAGE_UPLOAD_RULE_10MB,
      ),
    ).toBeNull();
    expect(
      validateFileAgainstRule(
        file("a.png", "image/png", 1024),
        IMAGE_UPLOAD_RULE_10MB,
      ),
    ).toBeNull();
  });

  it("画像ルール: WebP を許可する", () => {
    expect(
      validateFileAgainstRule(
        file("a.webp", "image/webp", 1024),
        IMAGE_UPLOAD_RULE_10MB,
      ),
    ).toBeNull();
    expect(
      validateFileAgainstRule(
        file("a.webp", "image/webp", 1024),
        IMAGE_UPLOAD_RULE_5MB,
      ),
    ).toBeNull();
  });

  it("画像ルール: PDF・GIF を拒否する", () => {
    expect(
      validateFileAgainstRule(
        file("a.pdf", "application/pdf", 1024),
        IMAGE_UPLOAD_RULE_10MB,
      ),
    ).toContain("JPEG");
    expect(
      validateFileAgainstRule(
        file("a.gif", "image/gif", 1024),
        IMAGE_UPLOAD_RULE_10MB,
      ),
    ).toContain("JPEG");
  });

  it("MIME は許可でも拡張子が不正なら拒否する", () => {
    expect(
      validateFileAgainstRule(
        file("a.exe", "image/png", 1024),
        IMAGE_UPLOAD_RULE_10MB,
      ),
    ).toContain("JPEG");
  });

  it("拡張子なしのファイル名は MIME から補完して許可する", () => {
    expect(
      validateFileAgainstRule(
        file("clipboard-image", "image/png", 1024),
        IMAGE_UPLOAD_RULE_10MB,
      ),
    ).toBeNull();
  });

  it("サイズ上限を超えると拒否する (10MB / 5MB)", () => {
    expect(
      validateFileAgainstRule(
        file("a.jpg", "image/jpeg", 10 * 1024 * 1024 + 1),
        IMAGE_UPLOAD_RULE_10MB,
      ),
    ).toContain("10MB");
    expect(
      validateFileAgainstRule(
        file("a.jpg", "image/jpeg", 5 * 1024 * 1024 + 1),
        IMAGE_UPLOAD_RULE_5MB,
      ),
    ).toContain("5MB");
    // 上限ちょうどは許可
    expect(
      validateFileAgainstRule(
        file("a.jpg", "image/jpeg", 5 * 1024 * 1024),
        IMAGE_UPLOAD_RULE_5MB,
      ),
    ).toBeNull();
  });

  it("書類ルール: PDF も許可する", () => {
    expect(
      validateFileAgainstRule(
        file("doc.pdf", "application/pdf", 1024),
        DOCUMENT_UPLOAD_RULE_10MB,
      ),
    ).toBeNull();
  });

  it("書類ルール: WebP も許可する", () => {
    expect(
      validateFileAgainstRule(
        file("doc.webp", "image/webp", 1024),
        DOCUMENT_UPLOAD_RULE_10MB,
      ),
    ).toBeNull();
  });

  it("大文字拡張子 (IMG_1234.JPG) を許可する", () => {
    expect(
      validateFileAgainstRule(
        file("IMG_1234.JPG", "image/jpeg", 1024),
        IMAGE_UPLOAD_RULE_10MB,
      ),
    ).toBeNull();
  });
});
