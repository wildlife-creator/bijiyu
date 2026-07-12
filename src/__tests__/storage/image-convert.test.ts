import { afterEach, describe, expect, it, vi } from "vitest";

import {
  convertImageForUpload,
  HEIC_CONVERT_ERROR_MESSAGE,
  ImageConvertError,
  isHeic,
} from "@/lib/storage/image-convert";

// heic2any はブラウザ専用 (WASM) のため、変換本体はモックする。
// convertImageForUpload の「いつ変換するか / 何を返すか」のロジックを検証する。
const heic2anyMock = vi.fn();
vi.mock("heic2any", () => ({ default: (opts: unknown) => heic2anyMock(opts) }));

function makeFile(name: string, type: string): File {
  return new File(["dummy-bytes"], name, { type });
}

afterEach(() => {
  heic2anyMock.mockReset();
});

describe("isHeic", () => {
  it("MIME が HEIC/HEIF なら true", () => {
    expect(isHeic(makeFile("a.heic", "image/heic"))).toBe(true);
    expect(isHeic(makeFile("a.heif", "image/heif"))).toBe(true);
  });

  it("MIME が空でも拡張子が .heic/.heif なら true (iOS 対策)", () => {
    expect(isHeic(makeFile("IMG_0001.HEIC", ""))).toBe(true);
    expect(isHeic(makeFile("photo.heif", "application/octet-stream"))).toBe(
      true,
    );
  });

  it("JPEG/PNG/WebP は false", () => {
    expect(isHeic(makeFile("a.jpg", "image/jpeg"))).toBe(false);
    expect(isHeic(makeFile("a.png", "image/png"))).toBe(false);
    expect(isHeic(makeFile("a.webp", "image/webp"))).toBe(false);
  });
});

describe("convertImageForUpload", () => {
  it("HEIC を JPEG File に変換する (拡張子・MIME が jpg に変わる)", async () => {
    heic2anyMock.mockResolvedValue(
      new Blob(["jpeg-data"], { type: "image/jpeg" }),
    );

    const result = await convertImageForUpload(
      makeFile("IMG_1234.HEIC", "image/heic"),
    );

    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("IMG_1234.jpg");
    expect(heic2anyMock).toHaveBeenCalledTimes(1);
  });

  it("heic2any が配列を返しても先頭 Blob を使う", async () => {
    heic2anyMock.mockResolvedValue([
      new Blob(["a"], { type: "image/jpeg" }),
      new Blob(["b"], { type: "image/jpeg" }),
    ]);

    const result = await convertImageForUpload(makeFile("x.heic", "image/heic"));
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("x.jpg");
  });

  it("JPEG/PNG/WebP はそのまま返し、変換ライブラリを呼ばない", async () => {
    const jpg = makeFile("a.jpg", "image/jpeg");
    const png = makeFile("a.png", "image/png");
    const webp = makeFile("a.webp", "image/webp");

    expect(await convertImageForUpload(jpg)).toBe(jpg);
    expect(await convertImageForUpload(png)).toBe(png);
    expect(await convertImageForUpload(webp)).toBe(webp);
    expect(heic2anyMock).not.toHaveBeenCalled();
  });

  it("変換に失敗したら ImageConvertError を throw する", async () => {
    heic2anyMock.mockRejectedValue(new Error("wasm error"));

    await expect(
      convertImageForUpload(makeFile("a.heic", "image/heic")),
    ).rejects.toBeInstanceOf(ImageConvertError);

    await expect(
      convertImageForUpload(makeFile("a.heic", "image/heic")),
    ).rejects.toThrow(HEIC_CONVERT_ERROR_MESSAGE);
  });
});
