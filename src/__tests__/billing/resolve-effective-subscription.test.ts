import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAdminFrom = vi.fn();
const mockCreateAdminClient = vi.fn(() => ({
  from: (table: string) => mockAdminFrom(table),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

import { resolveEffectiveSubscription } from "@/lib/billing/resolve-effective-subscription";
import type { ActiveOrgContext } from "@/lib/organization/active-org-context";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OWNER_ID = "22222222-2222-2222-2222-222222222222";
const ORG_ID = "55555555-5555-5555-5555-555555555555";

interface FromResult<T> {
  data: T | null;
  error: null;
}

interface QueryTracker {
  eqCalls: Array<{ column: string; value: unknown }>;
}

function makeSubscriptionsQuery<T>(result: FromResult<T>, tracker: QueryTracker) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((column: string, value: unknown) => {
      tracker.eqCalls.push({ column, value });
      return chain;
    }),
    in: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  };
  return chain;
}

function makeSupabase(result: FromResult<{ status: string; plan_type: string }>) {
  const tracker: QueryTracker = { eqCalls: [] };
  const chain = makeSubscriptionsQuery(result, tracker);
  const fromSpy = vi.fn((table: string) => {
    if (table !== "subscriptions") {
      throw new Error(`unexpected table: ${table}`);
    }
    return chain;
  });
  const supabase = { from: fromSpy };
  // resolveEffectiveSubscription は SupabaseClient<Database> 型を期待するが
  // 本テストでは subscriptions テーブルへの chain 呼び出ししか使わないため
  // 最小限の shape だけ実装した mock を渡す。
  return {
    supabase: supabase as unknown as Parameters<
      typeof import("@/lib/billing/resolve-effective-subscription").resolveEffectiveSubscription
    >[0],
    tracker,
    fromSpy,
  };
}

function makeAdminTracker(result: FromResult<{ status: string; plan_type: string }>) {
  const tracker: QueryTracker = { eqCalls: [] };
  const chain = makeSubscriptionsQuery(result, tracker);
  mockAdminFrom.mockImplementation((table: string) => {
    if (table !== "subscriptions") {
      throw new Error(`unexpected admin table: ${table}`);
    }
    return chain;
  });
  return tracker;
}

const OWNER_CONTEXT: ActiveOrgContext = {
  organizationId: ORG_ID,
  orgRole: "owner",
  isProxyAccount: false,
  orgOwnerId: USER_ID,
  isCorporate: true,
};

const STAFF_CONTEXT: ActiveOrgContext = {
  organizationId: ORG_ID,
  orgRole: "staff",
  isProxyAccount: true,
  orgOwnerId: OWNER_ID,
  isCorporate: true,
};

const ADMIN_CONTEXT: ActiveOrgContext = {
  organizationId: ORG_ID,
  orgRole: "admin",
  isProxyAccount: false,
  orgOwnerId: OWNER_ID,
  isCorporate: true,
};

beforeEach(() => {
  mockAdminFrom.mockReset();
  mockCreateAdminClient.mockClear();
});

describe("resolveEffectiveSubscription", () => {
  it("個人ユーザー（active=null）は自分の user_id で通常クライアントから解決する", async () => {
    const { supabase, tracker } = makeSupabase({
      data: { status: "active", plan_type: "individual" },
      error: null,
    });

    const result = await resolveEffectiveSubscription(supabase, USER_ID, null);

    expect(result).toEqual({ status: "active", plan_type: "individual" });
    expect(tracker.eqCalls).toEqual([{ column: "user_id", value: USER_ID }]);
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it("Owner 本人（orgRole=owner）は自分の user_id で通常クライアントから解決する", async () => {
    const { supabase, tracker } = makeSupabase({
      data: { status: "active", plan_type: "corporate" },
      error: null,
    });

    const result = await resolveEffectiveSubscription(
      supabase,
      USER_ID,
      OWNER_CONTEXT,
    );

    expect(result).toEqual({ status: "active", plan_type: "corporate" });
    expect(tracker.eqCalls).toEqual([{ column: "user_id", value: USER_ID }]);
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it("普通の担当者（orgRole=staff）は Owner の user_id で admin client 経由で解決する", async () => {
    const { supabase, fromSpy } = makeSupabase({ data: null, error: null });
    const adminTracker = makeAdminTracker({
      data: { status: "active", plan_type: "corporate" },
      error: null,
    });

    const result = await resolveEffectiveSubscription(
      supabase,
      USER_ID,
      STAFF_CONTEXT,
    );

    expect(result).toEqual({ status: "active", plan_type: "corporate" });
    expect(mockCreateAdminClient).toHaveBeenCalledTimes(1);
    expect(adminTracker.eqCalls).toEqual([
      { column: "user_id", value: OWNER_ID },
    ]);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("強い担当者（orgRole=admin）も Owner の user_id で admin client 経由で解決する", async () => {
    const { supabase, fromSpy } = makeSupabase({ data: null, error: null });
    const adminTracker = makeAdminTracker({
      data: { status: "past_due", plan_type: "corporate_premium" },
      error: null,
    });

    const result = await resolveEffectiveSubscription(
      supabase,
      USER_ID,
      ADMIN_CONTEXT,
    );

    expect(result).toEqual({ status: "past_due", plan_type: "corporate_premium" });
    expect(mockCreateAdminClient).toHaveBeenCalledTimes(1);
    expect(adminTracker.eqCalls).toEqual([
      { column: "user_id", value: OWNER_ID },
    ]);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("有効な subscription が無ければ null を返す（個人ユーザー）", async () => {
    const { supabase } = makeSupabase({ data: null, error: null });

    const result = await resolveEffectiveSubscription(supabase, USER_ID, null);

    expect(result).toBeNull();
  });

  it("有効な subscription が無ければ null を返す（Staff かつ Owner のサブスクも無し）", async () => {
    const { supabase } = makeSupabase({ data: null, error: null });
    makeAdminTracker({ data: null, error: null });

    const result = await resolveEffectiveSubscription(
      supabase,
      USER_ID,
      STAFF_CONTEXT,
    );

    expect(result).toBeNull();
    expect(mockCreateAdminClient).toHaveBeenCalledTimes(1);
  });
});
