import { describe, expect, it } from "vitest";

import {
  VIDEO_FRAME,
  VIDEO_FRAME_CLASSES,
  VIDEO_FRAME_SHAPE,
} from "@/components/video-embed/video-frame";

describe("VIDEO_FRAME（会員向け動画一覧の表示枠）", () => {
  it("基準比率は縦長 9:16", () => {
    expect(VIDEO_FRAME_SHAPE).toBe("portrait");
    expect(VIDEO_FRAME.aspect).toBe("aspect-[9/16]");
  });

  it("現在の枠は基準比率の定義そのもの", () => {
    expect(VIDEO_FRAME).toBe(VIDEO_FRAME_CLASSES[VIDEO_FRAME_SHAPE]);
  });

  it.each(Object.entries(VIDEO_FRAME_CLASSES))(
    "%s は枠・一覧幅・ダイアログ幅をすべて完全なクラス文字列で持つ",
    (_shape, classes) => {
      expect(classes.aspect).toMatch(/^aspect-/);
      expect(classes.listItemWidth).toMatch(/max-w-\[\d+px\]/);
      expect(classes.dialogWidth).toMatch(/max-w-\[\d+px\]/);
    },
  );
});
