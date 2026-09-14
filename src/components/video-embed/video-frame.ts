/**
 * 会員向け動画一覧（`<VideoList>`）の表示枠ルール（2026-09 表示枠サイズ統一）。
 *
 * 埋込元（TikTok 等の URL 埋込 / Cloudflare Stream アップロード）や元動画の縦横比に
 * 関係なく、全ての動画を同じ枠で表示する。枠に収まらない比率の動画は切り取らず、
 * 余白（レターボックス）を付けて収める。
 *
 * 基準比率を変えるときは `VIDEO_FRAME_SHAPE` の 1 行だけを書き換える。
 * Tailwind はソース中の文字列リテラルからクラスを生成するため、クラス名は
 * 動的に組み立てず、下の表に完全な文字列で書くこと。
 *
 * ADM-027（管理画面の動画管理）のプレビューはこの枠を使わない。
 */

export type VideoFrameShape = "portrait" | "square" | "landscape";

interface VideoFrameClasses {
  /** 枠の縦横比 */
  aspect: string;
  /** 一覧で 1 本あたりに使う最大幅（SP では画面幅に合わせて縮む） */
  listItemWidth: string;
  /** 再生ダイアログの最大幅 */
  dialogWidth: string;
}

export const VIDEO_FRAME_CLASSES: Record<VideoFrameShape, VideoFrameClasses> = {
  // 縦長 9:16（スマホ縦動画・TikTok に合わせた基準）
  portrait: {
    aspect: "aspect-[9/16]",
    listItemWidth: "w-full max-w-[280px]",
    dialogWidth: "max-w-[360px] sm:max-w-[360px]",
  },
  // 正方形 1:1
  square: {
    aspect: "aspect-square",
    listItemWidth: "w-full max-w-[320px]",
    dialogWidth: "max-w-[480px] sm:max-w-[480px]",
  },
  // 横長 16:9
  landscape: {
    aspect: "aspect-video",
    listItemWidth: "w-full max-w-[480px]",
    dialogWidth: "max-w-[640px] sm:max-w-[640px]",
  },
};

/** 基準比率。変更はこの 1 行だけで済む。 */
export const VIDEO_FRAME_SHAPE: VideoFrameShape = "portrait";

/** 現在の基準比率の枠クラス。一覧・サムネ・再生ダイアログで共有する。 */
export const VIDEO_FRAME: VideoFrameClasses =
  VIDEO_FRAME_CLASSES[VIDEO_FRAME_SHAPE];
