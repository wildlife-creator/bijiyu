import { resolveParticipantName } from "@/lib/utils/display-name";

/**
 * ADM-023/024 代理メッセージ閲覧のヘルパー（admin spec Task 12）。
 *
 * - fetchAllRows: PostgREST の1クエリ1000件上限による静かな打ち切りを防ぐ
 *   全件ページネーションループ（`src/lib/master/fetch.ts` の fetchAllPages と同型）。
 *   会社絞込ドロップダウンの選択肢取得（admin_proxy_threads 全件）と
 *   ADM-024 のメッセージ全件取得で使用する
 * - dedupeOrganizationIds / buildProxyOrgOptions: 会社絞込の選択肢導出（純粋関数）
 */

export const ADMIN_FETCH_PAGE_SIZE = 1000;

/**
 * range ページングで全件を取得して結合する。
 * 1ページが PAGE_SIZE 未満になったら最終ページとみなして打ち切る。
 * 途中ページで error が出たら部分データを返さず throw する（呼び出し側でフォールバック）。
 * 並び順キーは一意なカラム（thread_id / messages.id 等）を呼び出し側で指定すること。
 */
export async function fetchAllRows<T>(
  buildPageQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += ADMIN_FETCH_PAGE_SIZE) {
    const to = from + ADMIN_FETCH_PAGE_SIZE - 1;
    const { data, error } = await buildPageQuery(from, to);
    if (error || !data) {
      throw new Error("ページ取得に失敗しました");
    }
    rows.push(...data);
    if (data.length < ADMIN_FETCH_PAGE_SIZE) break;
  }
  return rows;
}

/** ビュー行から organization_id を重複排除して返す（null は除外） */
export function dedupeOrganizationIds(
  rows: { organization_id: string | null }[],
): string[] {
  return Array.from(
    new Set(
      rows
        .map((r) => r.organization_id)
        .filter((id): id is string => !!id),
    ),
  );
}

export interface ProxyOrgOption {
  organizationId: string;
  name: string;
}

/**
 * 会社絞込ドロップダウンの選択肢を導出する（純粋関数）。
 * 会社名は Owner の client_profiles.display_name → 姓名 の優先順位で解決し、
 * 会社名の昇順（ja ロケール）でソートする。
 */
export function buildProxyOrgOptions(params: {
  organizations: { id: string; owner_id: string }[];
  ownerUsers: {
    id: string;
    last_name: string | null;
    first_name: string | null;
    deleted_at: string | null;
  }[];
  ownerProfiles: { user_id: string; display_name: string | null }[];
}): ProxyOrgOption[] {
  const userById = new Map(params.ownerUsers.map((u) => [u.id, u]));
  const profileByUser = new Map(
    params.ownerProfiles.map((p) => [p.user_id, p.display_name]),
  );

  return params.organizations
    .map((org) => {
      const owner = userById.get(org.owner_id);
      return {
        organizationId: org.id,
        name: resolveParticipantName({
          displayName: profileByUser.get(org.owner_id) ?? null,
          lastName: owner?.last_name,
          firstName: owner?.first_name,
          deletedAt: owner?.deleted_at,
        }),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}
