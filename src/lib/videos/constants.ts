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

/**
 * 管理画面（ADM-027）のタブ名に使う掲載場所ラベル。
 * P10（2026-09）で商品名（受注者PR動画 / 職場紹介動画）から画面名へ変更した
 * （商品は「プロフィール動画」に統合され、掲載先はプランに関係なく運営が選ぶため）。
 * 「本人が見る画面名（他の会員が見る画面名）」の形。
 */
export const VIDEO_PLACEMENT_LABELS: Record<VideoPlacement, string> = {
  contractor_page: "ユーザープロフィール（ユーザー詳細）",
  client_page: "発注者情報詳細（発注者詳細）",
};

/** 管理画面でタブの下に出す掲載先の説明。 */
export const VIDEO_PLACEMENT_DESCRIPTIONS: Record<VideoPlacement, string> = {
  contractor_page:
    "掲載先: 職人ページ（本人のユーザープロフィール / 他の会員が見るユーザー詳細 / 管理画面のユーザーアカウント詳細）",
  client_page:
    "掲載先: 会社ページ（本人の発注者情報詳細 / 他の会員が見る発注者詳細 / 管理画面の発注者アカウント詳細）",
};

/**
 * 掲載お知らせメール（§6.6.C）の【掲載先】に使う、会員向けの掲載先名。
 * 他の会員から見た画面名で表す（料金プラン画面の説明文と同じ呼び方）。
 */
export const VIDEO_PLACEMENT_MEMBER_LABELS: Record<VideoPlacement, string> = {
  contractor_page: "ユーザー詳細ページ",
  client_page: "発注者詳細ページ",
};

/**
 * 会員が見るページの動画欄の見出し・再生ボタンのラベル。
 * P10 で「PR動画」「職場紹介動画」を廃し、掲載先に関係なく「プロフィール動画」に統一。
 */
export const VIDEO_SECTION_LABEL = "プロフィール動画";

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
