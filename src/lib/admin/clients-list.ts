import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ADM-003 発注者アカウント一覧のクエリロジック（admin spec Task 5.1）。
 *
 * - 対象: role IN ('client','staff') を人単位1行で表示（退会済み・代理アカウント含む）
 * - 区分・プラン・オプションバッジは「契約主体」（client=本人 / staff=所属組織 Owner）から導出
 * - フィルタは ID 集合の積パターン（CLI-005 基準実装と同型）でサーバー側完結
 * - 行の付加情報は20行分の契約主体 id をまとめてバッチ取得（N+1 禁止）
 */

const PAGE_SIZE = 20;

export type ClientCategory =
  | "owner"
  | "org_admin"
  | "org_staff"
  | "individual"
  | "small";

export type ClientOptionBadge = "urgent" | "video_workplace";

/** 画面表記（org_role=admin は運営のシステム管理者と区別するため「組織管理者」） */
export const CLIENT_CATEGORY_LABELS: Record<ClientCategory, string> = {
  owner: "管理責任者",
  org_admin: "組織管理者",
  org_staff: "担当者",
  individual: "個人発注者",
  small: "小規模発注者",
};

/** ADM-003 のプラン列表記（短縮形。法人と高サポートをここで見分ける） */
export const ADMIN_PLAN_LABELS: Record<string, string> = {
  individual: "個人",
  small: "小規模",
  corporate: "法人",
  corporate_premium: "法人・高サポート",
};

export const CLIENT_OPTION_BADGE_LABELS: Record<ClientOptionBadge, string> = {
  urgent: "急募",
  video_workplace: "職場紹介動画",
};

/**
 * 区分の導出（純粋関数）。
 * - staff → org_role（admin=組織管理者 / staff=担当者）。所属不明は null
 * - client → org owner なら管理責任者、それ以外は契約中プランで個人/小規模。
 *   有効サブスクなしは null（画面では「—」）
 */
export function deriveClientCategory(params: {
  role: "client" | "staff";
  orgRole: "owner" | "admin" | "staff" | null;
  planType: string | null;
}): ClientCategory | null {
  if (params.role === "staff") {
    if (params.orgRole === "admin") return "org_admin";
    if (params.orgRole === "staff") return "org_staff";
    return null;
  }
  if (params.orgRole === "owner") return "owner";
  if (params.planType === "individual") return "individual";
  if (params.planType === "small") return "small";
  return null;
}

/** プラン列の表記（純粋関数）。有効サブスクなし・未知の値は null（画面では「—」） */
export function derivePlanLabel(planType: string | null): string | null {
  if (!planType) return null;
  return ADMIN_PLAN_LABELS[planType] ?? null;
}

/**
 * 契約主体の解決（純粋関数）。
 * client → 本人。staff → 所属組織の Owner。
 * staff で組織が解決できない場合（Owner 退会カスケード後等）は null（行クリック不可）。
 */
export function resolveContractHolderId(params: {
  role: "client" | "staff";
  userId: string;
  orgOwnerId: string | null;
}): string | null {
  if (params.role === "client") return params.userId;
  return params.orgOwnerId;
}

export interface ClientListFilter {
  /** 氏名・メール・会社名 */
  keyword?: string;
  /** 枠1: 区分（単一選択） */
  category?: ClientCategory;
  /** 枠2: オプション（単一選択） */
  option?: ClientOptionBadge;
  page: number;
}

export interface ClientListRow {
  userId: string;
  /** 行クリック遷移先（ADM-004 の id）。解決不能は null（非リンク行） */
  contractHolderId: string | null;
  /** 姓名（スペースなし結合） */
  name: string;
  /** 契約主体の client_profiles.display_name */
  companyName: string | null;
  email: string;
  category: ClientCategory | null;
  /** 個人/小規模/法人/法人・高サポート */
  planLabel: string | null;
  optionBadges: ClientOptionBadge[];
  isDeleted: boolean;
}

function intersect(sets: Set<string>[]): Set<string> {
  return sets.reduce((acc, set) => {
    const next = new Set<string>();
    for (const id of acc) {
      if (set.has(id)) next.add(id);
    }
    return next;
  });
}

export async function fetchClientListPage(
  filter: ClientListFilter,
): Promise<{ rows: ClientListRow[]; totalCount: number }> {
  const admin = createAdminClient();
  const keyword = filter.keyword?.trim() ?? "";
  const offset = (Math.max(1, filter.page) - 1) * PAGE_SIZE;

  // ----- フィルタ用 id 集合（積で AND。空集合確定なら即 0 件） -----
  const idSets: Set<string>[] = [];

  if (keyword) {
    // 氏名・メールの部分一致（対象 role 内）
    const { data: userHits } = await admin
      .from("users")
      .select("id")
      .in("role", ["client", "staff"])
      .or(
        `last_name.ilike.%${keyword}%,first_name.ilike.%${keyword}%,email.ilike.%${keyword}%`,
      );

    // 会社名（client_profiles.display_name）一致 → 契約主体 → 自身＋配下メンバーに展開
    const { data: cpHits } = await admin
      .from("client_profiles")
      .select("user_id")
      .ilike("display_name", `%${keyword}%`);
    const ownerIds = (cpHits ?? []).map((r) => r.user_id);

    let memberIds: string[] = [];
    if (ownerIds.length > 0) {
      const { data: orgs } = await admin
        .from("organizations")
        .select("id")
        .in("owner_id", ownerIds);
      const orgIds = (orgs ?? []).map((o) => o.id);
      if (orgIds.length > 0) {
        const { data: members } = await admin
          .from("organization_members")
          .select("user_id")
          .in("organization_id", orgIds);
        memberIds = (members ?? []).map((m) => m.user_id);
      }
    }

    idSets.push(
      new Set([
        ...(userHits ?? []).map((u) => u.id),
        ...ownerIds,
        ...memberIds,
      ]),
    );
  }

  if (filter.category) {
    let ids: string[] = [];
    if (
      filter.category === "owner" ||
      filter.category === "org_admin" ||
      filter.category === "org_staff"
    ) {
      const orgRole =
        filter.category === "owner"
          ? "owner"
          : filter.category === "org_admin"
            ? "admin"
            : "staff";
      const { data } = await admin
        .from("organization_members")
        .select("user_id")
        .eq("org_role", orgRole);
      ids = (data ?? []).map((r) => r.user_id);
    } else {
      const { data } = await admin
        .from("subscriptions")
        .select("user_id")
        .eq("plan_type", filter.category)
        .in("status", ["active", "past_due"]);
      ids = (data ?? []).map((r) => r.user_id);
    }
    idSets.push(new Set(ids));
  }

  if (filter.option) {
    // 契約主体基準: active なオプション保有者 → 自身＋配下メンバーに展開
    // （staff 行にも所属会社のバッジ・フィルタを効かせる）
    const { data: optRows } = await admin
      .from("option_subscriptions")
      .select("user_id")
      .eq("option_type", filter.option)
      .eq("status", "active");
    const holderIds = Array.from(
      new Set((optRows ?? []).map((r) => r.user_id)),
    );

    let memberIds: string[] = [];
    if (holderIds.length > 0) {
      const { data: orgs } = await admin
        .from("organizations")
        .select("id")
        .in("owner_id", holderIds);
      const orgIds = (orgs ?? []).map((o) => o.id);
      if (orgIds.length > 0) {
        const { data: members } = await admin
          .from("organization_members")
          .select("user_id")
          .in("organization_id", orgIds);
        memberIds = (members ?? []).map((m) => m.user_id);
      }
    }

    idSets.push(new Set([...holderIds, ...memberIds]));
  }

  let restrictIds: string[] | null = null;
  if (idSets.length > 0) {
    restrictIds = Array.from(intersect(idSets));
    if (restrictIds.length === 0) {
      return { rows: [], totalCount: 0 };
    }
  }

  // ----- メインクエリ（登録日時の新しい順・20件・count exact） -----
  let query = admin
    .from("users")
    .select("id, role, last_name, first_name, email, deleted_at", {
      count: "exact",
    })
    .in("role", ["client", "staff"]);

  if (restrictIds) {
    query = query.in("id", restrictIds);
  }

  const { data: users, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const pageUsers = users ?? [];
  if (pageUsers.length === 0) {
    return { rows: [], totalCount: count ?? 0 };
  }

  // ----- 20行分の付加情報をバッチ取得（N+1 禁止） -----
  const userIds = pageUsers.map((u) => u.id);

  // 1. 組織所属（org_role / organization_id）
  const { data: memberRows } = await admin
    .from("organization_members")
    .select("user_id, org_role, organization_id")
    .in("user_id", userIds);
  const membershipByUser = new Map(
    (memberRows ?? []).map((m) => [m.user_id, m]),
  );

  // 2. 組織 → Owner（staff 行の契約主体解決）
  const orgIds = Array.from(
    new Set((memberRows ?? []).map((m) => m.organization_id)),
  );
  const ownerByOrg = new Map<string, string>();
  if (orgIds.length > 0) {
    const { data: orgRows } = await admin
      .from("organizations")
      .select("id, owner_id")
      .in("id", orgIds);
    for (const o of orgRows ?? []) {
      ownerByOrg.set(o.id, o.owner_id);
    }
  }

  // 契約主体 id 一覧
  const holderIdByUser = new Map<string, string | null>();
  for (const u of pageUsers) {
    const membership = membershipByUser.get(u.id);
    const orgOwnerId = membership
      ? (ownerByOrg.get(membership.organization_id) ?? null)
      : null;
    holderIdByUser.set(
      u.id,
      resolveContractHolderId({
        role: u.role as "client" | "staff",
        userId: u.id,
        orgOwnerId,
      }),
    );
  }
  const holderIds = Array.from(
    new Set(
      Array.from(holderIdByUser.values()).filter((id): id is string => !!id),
    ),
  );

  // 3. 会社名 / 4. プラン / 5. オプションバッジ（契約主体 id でバッチ）
  const companyByHolder = new Map<string, string | null>();
  const planByHolder = new Map<string, string>();
  const badgesByHolder = new Map<string, Set<ClientOptionBadge>>();
  if (holderIds.length > 0) {
    const [{ data: profileRows }, { data: subRows }, { data: optRows }] =
      await Promise.all([
        admin
          .from("client_profiles")
          .select("user_id, display_name")
          .in("user_id", holderIds),
        admin
          .from("subscriptions")
          .select("user_id, plan_type")
          .in("user_id", holderIds)
          .in("status", ["active", "past_due"]),
        admin
          .from("option_subscriptions")
          .select("user_id, option_type")
          .in("user_id", holderIds)
          .eq("status", "active")
          .in("option_type", ["urgent", "video_workplace"]),
      ]);
    for (const p of profileRows ?? []) {
      companyByHolder.set(p.user_id, p.display_name);
    }
    for (const s of subRows ?? []) {
      planByHolder.set(s.user_id, s.plan_type);
    }
    for (const o of optRows ?? []) {
      const set = badgesByHolder.get(o.user_id) ?? new Set<ClientOptionBadge>();
      set.add(o.option_type as ClientOptionBadge);
      badgesByHolder.set(o.user_id, set);
    }
  }

  const rows: ClientListRow[] = pageUsers.map((u) => {
    const membership = membershipByUser.get(u.id);
    const holderId = holderIdByUser.get(u.id) ?? null;
    const planType = holderId ? (planByHolder.get(holderId) ?? null) : null;
    return {
      userId: u.id,
      contractHolderId: holderId,
      name: `${u.last_name ?? ""}${u.first_name ?? ""}`.trim() || "未設定",
      companyName: holderId ? (companyByHolder.get(holderId) ?? null) : null,
      email: u.email,
      category: deriveClientCategory({
        role: u.role as "client" | "staff",
        orgRole: membership?.org_role ?? null,
        planType,
      }),
      planLabel: derivePlanLabel(planType),
      optionBadges: holderId
        ? Array.from(badgesByHolder.get(holderId) ?? [])
        : [],
      isDeleted: !!u.deleted_at,
    };
  });

  return { rows, totalCount: count ?? 0 };
}
