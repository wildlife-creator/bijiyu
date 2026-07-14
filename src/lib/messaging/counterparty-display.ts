/**
 * Phase 2 (message-thread-org-pair) 共通ヘルパー:
 * スレッド上の相手 (counterparty) の表示情報を identity ベースで解決する。
 *
 * viewer がどちらの席 (participant_1 side / participant_2 side) にいるかを判定し、
 * その反対側の participant / organization owner から表示名・アバター・退会状態を
 * 抽出する。これにより「席2=受注者」の暗黙ルールに依存しない表示が可能になる。
 */

import { resolveActorDisplayName } from "@/lib/utils/display-name";

// ------------------------------------------------------------
// 入力型
// ------------------------------------------------------------
export type ParticipantForDisplay = {
  id: string;
  last_name: string | null;
  first_name: string | null;
  company_name?: string | null;
  avatar_url?: string | null;
  deleted_at: string | null;
  client_profiles:
    | Array<{ display_name: string | null; image_url: string | null }>
    | { display_name: string | null; image_url: string | null }
    | null;
};

export type OrgOwnerForDisplay = {
  last_name: string | null;
  first_name: string | null;
  deleted_at: string | null;
  client_profiles:
    | Array<{ display_name: string | null; image_url: string | null }>
    | { display_name: string | null; image_url: string | null }
    | null;
};

export type ThreadIdentitySides = {
  participant_1_id: string;
  participant_2_id: string;
  organization_1_id: string | null;
  organization_2_id: string | null;
  participant_1: ParticipantForDisplay | ParticipantForDisplay[] | null;
  participant_2: ParticipantForDisplay | ParticipantForDisplay[] | null;
  organization_1?: {
    owner_user: OrgOwnerForDisplay | OrgOwnerForDisplay[] | null;
  } | Array<{
    owner_user: OrgOwnerForDisplay | OrgOwnerForDisplay[] | null;
  }> | null;
  organization_2?: {
    owner_user: OrgOwnerForDisplay | OrgOwnerForDisplay[] | null;
  } | Array<{
    owner_user: OrgOwnerForDisplay | OrgOwnerForDisplay[] | null;
  }> | null;
};

export type CounterpartyResolution = {
  name: string;
  avatarUrl: string | null;
  deletedAt: string | null;
  /** viewer が side 2 (participant_2 側) にいるか。相手側の情報を追加で参照したい呼び出し用 */
  viewerOnSide2: boolean;
  /** viewer が組織側にいるか (組織 identity を持つ席) */
  viewerIsOrgSide: boolean;
};

function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function firstClientProfile(
  profiles:
    | Array<{ display_name: string | null; image_url: string | null }>
    | { display_name: string | null; image_url: string | null }
    | null
    | undefined,
): { display_name: string | null; image_url: string | null } | null {
  return firstOrNull(profiles);
}

/**
 * 退会済み counterparty の表示名に「（退会済み）」を付す。
 *
 * 設計（名前＋退会済みバッジ・対称）:
 * 退会しても氏名 / `client_profiles.display_name` は DB に保持されており（ソフト削除）、
 * 名前自体は消さない。受注者・発注者どちらが退会しても、保持された実名を表示した上で
 * 「（退会済み）」を付けて状態を示す。これにより「退会済みは発注者だけ実名が残る」
 * という旧来の非対称を解消し、残った側が取引相手を識別できる状態を保つ。
 */
export function appendWithdrawnSuffix(
  name: string,
  deletedAt: string | null,
): string {
  return deletedAt ? `${name}（退会済み）` : name;
}

/**
 * viewer がどちらの席にいるかを identity ベースで判定する。
 *   1. participant_1_id === viewerId → side 1
 *   2. participant_2_id === viewerId → side 2
 *   3. viewerOrgId が organization_2_id と一致 → side 2 (同組織メンバー)
 *   4. viewerOrgId が organization_1_id と一致 → side 1
 *   5. どれもマッチしない場合はフォールバックとして side 1 とみなす
 */
export function determineViewerSide(
  thread: Pick<
    ThreadIdentitySides,
    | "participant_1_id"
    | "participant_2_id"
    | "organization_1_id"
    | "organization_2_id"
  >,
  viewerId: string,
  viewerOrgId: string | null,
): { viewerOnSide2: boolean } {
  if (thread.participant_1_id === viewerId) {
    return { viewerOnSide2: false };
  }
  if (thread.participant_2_id === viewerId) {
    return { viewerOnSide2: true };
  }
  if (viewerOrgId && thread.organization_2_id === viewerOrgId) {
    return { viewerOnSide2: true };
  }
  return { viewerOnSide2: false };
}

/**
 * viewer 反対側 (counterparty) の identity から表示情報を解決する。
 *
 * 名前解決の優先順位 (resolveActorDisplayName 準拠):
 *   1. counterparty が組織 identity → org Owner の client_profiles.display_name
 *   2. counterparty の individual client_profiles.display_name (発注者側)
 *   3. counterparty の users.company_name (受注者側屋号)
 *   4. 姓名 (スペース無し結合)
 *   5. "未設定"
 *
 * 退会済みの扱い（名前＋退会済みバッジ・対称）:
 * resolveActorDisplayName には `deletedAt: null` を渡して「退会済みユーザー」への
 * 置き換えを行わせず、上記 1〜5 で保持された実名を解決する。退会状態は返り値の
 * `deletedAt` で持ち、`name` には `appendWithdrawnSuffix` で「（退会済み）」を付す。
 * これにより受注者・発注者どちらの退会でも対称に「実名（退会済み）」を表示する。
 */
export function resolveCounterpartyDisplay(
  thread: ThreadIdentitySides,
  viewerId: string,
  viewerOrgId: string | null,
): CounterpartyResolution {
  const { viewerOnSide2 } = determineViewerSide(thread, viewerId, viewerOrgId);

  // viewer 反対側 identity
  const counterOrgId = viewerOnSide2
    ? thread.organization_1_id
    : thread.organization_2_id;
  const counterParticipant = viewerOnSide2
    ? firstOrNull(thread.participant_1)
    : firstOrNull(thread.participant_2);
  const counterOrg = viewerOnSide2
    ? firstOrNull(thread.organization_1)
    : firstOrNull(thread.organization_2);
  const counterOrgOwner = firstOrNull(counterOrg?.owner_user ?? null);

  // 名前解決
  let name: string;
  let avatarUrl: string | null;
  let deletedAt: string | null;

  if (counterOrgId && counterOrgOwner) {
    const ownerProfile = firstClientProfile(counterOrgOwner.client_profiles);
    deletedAt = counterOrgOwner.deleted_at;
    // deletedAt: null で「退会済みユーザー」置換を抑止し、保持された実名を解決する
    const baseName = resolveActorDisplayName({
      displayName: ownerProfile?.display_name ?? null,
      companyName: null,
      lastName: counterOrgOwner.last_name,
      firstName: counterOrgOwner.first_name,
      deletedAt: null,
    });
    name = appendWithdrawnSuffix(baseName, deletedAt);
    avatarUrl = ownerProfile?.image_url ?? null;
  } else {
    const participantProfile = firstClientProfile(
      counterParticipant?.client_profiles,
    );
    deletedAt = counterParticipant?.deleted_at ?? null;
    // deletedAt: null で「退会済みユーザー」置換を抑止し、保持された実名を解決する
    const baseName = resolveActorDisplayName({
      displayName: participantProfile?.display_name ?? null,
      companyName: counterParticipant?.company_name ?? null,
      lastName: counterParticipant?.last_name ?? null,
      firstName: counterParticipant?.first_name ?? null,
      deletedAt: null,
    });
    name = appendWithdrawnSuffix(baseName, deletedAt);
    avatarUrl =
      participantProfile?.image_url ?? counterParticipant?.avatar_url ?? null;
  }

  // viewer 自身が org side (organization_X_id 非 null) にいるか
  const viewerIsOrgSide = viewerOnSide2
    ? thread.organization_2_id !== null
    : thread.organization_1_id !== null;

  return {
    name,
    avatarUrl,
    deletedAt,
    viewerOnSide2,
    viewerIsOrgSide,
  };
}
