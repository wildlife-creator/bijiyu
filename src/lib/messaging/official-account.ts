/**
 * 管理運営アカウント（users.is_hidden = true）をメッセージで見分けるための共通ルール。
 *
 * 表示名や画像は会員が自由に登録できるため、見分けには運営が SQL でしか付けられない
 * is_hidden だけを使う（resolveCounterpartyDisplay の isOfficial）。名前や画像で判定しないこと。
 */

/** 管理運営アカウントのアイコン（ロゴのマーク部分を白地の正方形にしたもの） */
export const OFFICIAL_AVATAR_URL = "/images/logo-avatar.png";

/** メッセージの相手のアイコン。管理運営アカウントなら登録画像より公式のロゴを優先する */
export function counterpartyAvatarUrl(counterparty: {
  isOfficial: boolean;
  avatarUrl: string | null;
}): string | null {
  return counterparty.isOfficial ? OFFICIAL_AVATAR_URL : counterparty.avatarUrl;
}
