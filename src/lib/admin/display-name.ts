import {
  getUserDisplayName,
  resolveParticipantName,
} from "@/lib/utils/display-name";

/**
 * admin 画面用の表示名解決。
 *
 * ユーザー同士の画面と異なり、運営者には退会済みユーザーの実名が見えている必要がある
 * （トラブル調査・退会後の問い合わせ対応・法的な開示要求等）。そのため
 * `deletedAt` による「退会済みユーザー」への置換は行わず、実名の後ろに
 * 「（退会済み）」サフィックスを付けて状態を示す。
 *
 * 一覧・詳細に専用の「※退会済み」バッジがある画面（ADM-008 / ADM-010 / ADM-004）は
 * 本ヘルパーではなく `deletedAt: null` を渡して実名のみ解決し、バッジ側で状態を示す。
 */

/** 受注者等の姓名解決（admin 用）。退会済みは「姓名（退会済み）」。 */
export function adminUserDisplayName(user: {
  lastName?: string | null;
  firstName?: string | null;
  deletedAt?: string | null;
}): string {
  const name = getUserDisplayName({
    lastName: user.lastName,
    firstName: user.firstName,
    deletedAt: null,
  });
  return user.deletedAt ? `${name}（退会済み）` : name;
}

/** 発注者表示名の解決（admin 用）。display_name 優先は維持しつつ退会済みサフィックスを付す。 */
export function adminParticipantName(participant: {
  displayName?: string | null;
  lastName?: string | null;
  firstName?: string | null;
  deletedAt?: string | null;
}): string {
  const name = resolveParticipantName({
    displayName: participant.displayName,
    lastName: participant.lastName,
    firstName: participant.firstName,
    deletedAt: null,
  });
  return participant.deletedAt ? `${name}（退会済み）` : name;
}
