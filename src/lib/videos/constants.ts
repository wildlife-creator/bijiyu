import type { OptionType } from "@/lib/billing/options";
import type { Database } from "@/types/database";

/**
 * 動画基盤（P4）の定数。掲載場所・状態・アップロード制限の single source of truth。
 *
 * 掲載場所（placement）は DB の enum `video_placement` と一致させる。
 * 新しい掲載場所を足すときは migration で `ALTER TYPE video_placement ADD VALUE` し、
 * ここのラベル・対応オプションを追記する。
 */

export type VideoPlacement = Database["public"]["Enums"]["video_placement"];
export type VideoStatus = Database["public"]["Enums"]["video_status"];
export type VideoProvider = "cloudflare" | "external";

export const VIDEO_PLACEMENTS: readonly VideoPlacement[] = [
  "contractor_page",
  "client_page",
];

/** 管理画面のタブ名に使う掲載場所ラベル（商品名と同じ）。 */
export const VIDEO_PLACEMENT_LABELS: Record<VideoPlacement, string> = {
  contractor_page: "受注者PR動画",
  client_page: "職場紹介動画",
};

/** 管理画面でタブの下に出す掲載先の説明。 */
export const VIDEO_PLACEMENT_DESCRIPTIONS: Record<VideoPlacement, string> = {
  contractor_page:
    "掲載先: 職人ページ（ユーザープロフィール / 受注者詳細 / 管理画面のユーザー詳細）",
  client_page:
    "掲載先: 会社ページ（発注者詳細 / 発注者情報 / 管理画面の発注者詳細）",
};

/**
 * 掲載お知らせメール（§6.6.C）の【動画種別】に使うオプション種別。
 * 課金の購入判定には使わない（P4 で表示ゲートは撤廃済み）。
 */
export const VIDEO_PLACEMENT_OPTION_TYPE: Record<VideoPlacement, OptionType> = {
  contractor_page: "video",
  client_page: "video_workplace",
};

export const VIDEO_STATUS_LABELS: Record<VideoStatus, string> = {
  processing: "処理中",
  ready: "公開",
};

export function isVideoPlacement(value: unknown): value is VideoPlacement {
  return (
    typeof value === "string" &&
    (VIDEO_PLACEMENTS as readonly string[]).includes(value)
  );
}

/**
 * MP4 アップロードの制限。Cloudflare Stream の Direct Creator Upload（TUS なし）は
 * 200MB までなので、1 分程度の動画を想定した上限にそろえる。
 * 長さの上限（秒）はアップロード URL 発行時に Cloudflare 側でも強制する。
 */
export const VIDEO_UPLOAD_MAX_BYTES = 200 * 1024 * 1024;
export const VIDEO_UPLOAD_MAX_BYTES_LABEL = "200MB";
export const VIDEO_UPLOAD_MAX_DURATION_SECONDS = 300;
export const VIDEO_UPLOAD_ALLOWED_MIME_TYPES: readonly string[] = [
  "video/mp4",
  "video/quicktime",
];
export const VIDEO_UPLOAD_ALLOWED_EXTENSIONS: readonly string[] = ["mp4", "mov"];
export const VIDEO_UPLOAD_TYPE_ERROR_MESSAGE =
  "MP4（または MOV）形式の動画ファイルを選択してください";

/** Cloudflare 未設定環境（ローカル等）でファイルアップロードを試みたときの案内。 */
export const CLOUDFLARE_NOT_CONFIGURED_MESSAGE =
  "動画ファイルのアップロードは現在利用できません（Cloudflare Stream 未設定）。URL で登録してください";

/** 管理用ラベルの最大文字数。 */
export const VIDEO_ADMIN_LABEL_MAX_LENGTH = 100;
