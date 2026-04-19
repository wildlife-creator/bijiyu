/**
 * 発注者表示名・受注者表示名のフロントエンド共通ヘルパー。
 *
 * 新方針:
 * - 発注者の表示名は `client_profiles.display_name`（CLI-021 で入力）に一本化
 * - フォールバックは姓名（スペース無し結合）→ "未設定"
 * - `organizations.name` / `getActiveCorporateOrgNames()` は廃止
 */

// ============================================================
// getUserDisplayName
// ============================================================

type GetUserDisplayNameMode = "full" | "company" | "prefer-company";

/**
 * ユーザーの表示名を解決する。退会済みは "退会済みユーザー" で上書き。
 *
 * mode:
 * - `"full"`          — 姓名をスペース無しで結合。姓名が無ければ "未設定"
 * - `"company"`       — companyName を返す。無ければ "未設定"（姓名にフォールバックしない）
 * - `"prefer-company"` — companyName があれば companyName、無ければ姓名。両方無ければ "未設定"
 *
 * `"prefer-company"` は受注者の屋号表示で使う（屋号 > 姓名の優先順位。
 * `resolveParticipantName` の新シグネチャから companyName 引数が外れたため追加）。
 */
export function getUserDisplayName(
  user: {
    lastName?: string | null;
    firstName?: string | null;
    companyName?: string | null;
    deletedAt?: string | null;
  },
  mode: GetUserDisplayNameMode = "full",
): string {
  if (user.deletedAt) {
    return "退会済みユーザー";
  }

  const companyName = user.companyName?.trim() ?? "";
  const last = user.lastName?.trim() ?? "";
  const first = user.firstName?.trim() ?? "";
  const fullName = last || first ? `${last}${first}` : "";

  if (mode === "company") {
    return companyName || "未設定";
  }

  if (mode === "prefer-company") {
    return companyName || fullName || "未設定";
  }

  return fullName || "未設定";
}

// ============================================================
// resolveParticipantName
// ============================================================

/**
 * メッセージ UI・メール通知等で「参加者の表示名」を確定する共通関数。
 *
 * 優先順位:
 *   1. `displayName`（= `client_profiles.display_name`）
 *   2. `${lastName}${firstName}`（スペース無し結合）
 *   3. "未設定"
 *
 * 退会済み（`deletedAt` 非 NULL）は最優先で "退会済みユーザー" を返す。
 *
 * 旧シグネチャ（`organizationName` / `companyName`）は廃止。
 * 受注者の屋号表示は `getUserDisplayName(user, 'prefer-company')` を使用する。
 */
export function resolveParticipantName(participant: {
  displayName?: string | null;
  lastName?: string | null;
  firstName?: string | null;
  deletedAt?: string | null;
}): string {
  if (participant.deletedAt) {
    return "退会済みユーザー";
  }

  const displayName = participant.displayName?.trim() ?? "";
  if (displayName) {
    return displayName;
  }

  const last = participant.lastName?.trim() ?? "";
  const first = participant.firstName?.trim() ?? "";
  const fullName = last || first ? `${last}${first}` : "";

  return fullName || "未設定";
}

// ============================================================
// resolveClientProfileForRow（B3 対応）
// ============================================================

/**
 * 受注者から発注者を見るクエリで使う、`client_profiles` 正解解決パターン。
 *
 * 法人プランでは `client_profiles` を持つのは Owner（社長）1 人のみ。
 * Staff が作成した案件では `jobs.owner_id` が Staff を指すため、
 * Staff 自身の `client_profiles` を参照しても display_name が NULL になる
 * （B3 の中核問題）。本関数で「`organization_id` の有無で経路を切り替え、
 * 法人プランでは組織 Owner の `client_profiles` を参照する」パターンに統一する。
 */
export type RowWithOrgContext = {
  organization_id: string | null;
  owner?: UserWithProfile | null;
  organization?: {
    owner_user?: UserWithProfile | null;
  } | null;
};

type UserWithProfile = {
  last_name: string | null;
  first_name: string | null;
  deleted_at: string | null;
  client_profiles:
    | Array<{ display_name: string | null; image_url: string | null }>
    | { display_name: string | null; image_url: string | null }
    | null;
};

export type ClientProfileResolution = {
  displayName: string | null;
  imageUrl: string | null;
  lastName: string | null;
  firstName: string | null;
  deletedAt: string | null;
};

const EMPTY_RESOLUTION: ClientProfileResolution = {
  displayName: null,
  imageUrl: null,
  lastName: null,
  firstName: null,
  deletedAt: null,
};

/**
 * 受注者が発注者を見る行（`jobs` / `message_threads` / `applications` 等）から、
 * 発注者の `client_profiles` と姓名を解決する。
 *
 * - `organization_id` が NULL → `row.owner` 経由（個人/小規模プラン）
 * - `organization_id` が NOT NULL → `row.organization.owner_user` 経由（法人プラン）
 *
 * 返り値の `displayName` は `client_profiles.display_name`（無ければ NULL）。
 * 呼び出し側は `resolveParticipantName({ displayName, lastName, firstName, deletedAt })`
 * で最終的な表示文字列を確定する。
 */
export function resolveClientProfileForRow(
  row: RowWithOrgContext,
): ClientProfileResolution {
  const source =
    row.organization_id === null || row.organization_id === undefined
      ? row.owner
      : row.organization?.owner_user;

  if (!source) {
    return EMPTY_RESOLUTION;
  }

  const profile = firstClientProfile(source.client_profiles);

  return {
    displayName: profile?.display_name ?? null,
    imageUrl: profile?.image_url ?? null,
    lastName: source.last_name,
    firstName: source.first_name,
    deletedAt: source.deleted_at,
  };
}

function firstClientProfile(
  profiles: UserWithProfile["client_profiles"],
): { display_name: string | null; image_url: string | null } | null {
  if (!profiles) return null;
  if (Array.isArray(profiles)) {
    return profiles[0] ?? null;
  }
  return profiles;
}
