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
 *      → C 案退会で users.deleted_at がセットされていても、保持された社名を表示
 *   2. 退会済み（`deletedAt` 非 NULL）→ "退会済みユーザー"
 *   3. `${lastName}${firstName}`（スペース無し結合）
 *   4. "未設定"
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
  const displayName = participant.displayName?.trim() ?? "";
  if (displayName) {
    return displayName;
  }

  if (participant.deletedAt) {
    return "退会済みユーザー";
  }

  const last = participant.lastName?.trim() ?? "";
  const first = participant.firstName?.trim() ?? "";
  const fullName = last || first ? `${last}${first}` : "";

  return fullName || "未設定";
}

// ============================================================
// resolveActorDisplayName — Phase 2 統一名前解決関数
// ============================================================

/**
 * メッセージ機能の "actor" (participant or 組織) の表示名を統一手順で解決する。
 *
 * Phase 2 (message-thread-org-pair) の設計改修に伴い、既存の
 * `resolveParticipantName` を拡張して受注者側の `users.company_name` も
 * フォールバック候補に含めるための新関数。
 *
 * 優先順位:
 *   1. `displayName`（= `client_profiles.display_name`）
 *      - 発注者側の屋号/社名を最優先
 *      - C 案退会で `users.deleted_at` が set されていても、保持された社名を優先表示
 *   2. 退会済み（`deletedAt` 非 NULL）→ "退会済みユーザー"
 *   3. `companyName`（= `users.company_name`）
 *      - 受注者側の屋号（プロフィール入力の任意欄）
 *   4. `${lastName}${firstName}`（スペース無し結合）
 *   5. "未設定"
 *
 * 呼び出し側は「どの `displayName` を渡すか」を先に決める:
 *   - 相手が組織所属 → その組織 Owner の `client_profiles.display_name`
 *   - 相手が個人発注者 → 本人の `client_profiles.display_name`
 *   - 相手が個人受注者 → NULL（displayName は該当なし。companyName / 姓名 に落ちる）
 */
export function resolveActorDisplayName(actor: {
  displayName?: string | null;
  companyName?: string | null;
  lastName?: string | null;
  firstName?: string | null;
  deletedAt?: string | null;
}): string {
  const displayName = actor.displayName?.trim() ?? "";
  if (displayName) {
    return displayName;
  }

  if (actor.deletedAt) {
    return "退会済みユーザー";
  }

  const companyName = actor.companyName?.trim() ?? "";
  if (companyName) {
    return companyName;
  }

  const last = actor.lastName?.trim() ?? "";
  const first = actor.firstName?.trim() ?? "";
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
