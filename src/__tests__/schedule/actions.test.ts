import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

import {
  createScheduleAction,
  updateScheduleAction,
  deleteScheduleAction,
} from "@/app/(authenticated)/schedule/actions";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
const SCHEDULE_ID = "33333333-3333-3333-3333-333333333333";

type AwaitedResult = { data: unknown; error: unknown };

interface ChainConfig {
  selectAwaitedResult?: AwaitedResult;
  singleResult?: AwaitedResult;
  maybeSingleResult?: AwaitedResult;
}

function makeChain(config: ChainConfig = {}) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.in = vi.fn(self);
  chain.gte = vi.fn(self);
  chain.order = vi.fn(self);
  chain.limit = vi.fn(self);
  chain.insert = vi.fn(self);
  chain.update = vi.fn(self);
  chain.delete = vi.fn(self);
  chain.single = vi
    .fn()
    .mockResolvedValue(config.singleResult ?? { data: null, error: null });
  chain.maybeSingle = vi
    .fn()
    .mockResolvedValue(config.maybeSingleResult ?? { data: null, error: null });
  chain.then = (resolve: (v: unknown) => unknown) =>
    resolve(config.selectAwaitedResult ?? { data: [], error: null });
  return chain;
}

function setUser(id: string | null) {
  mockGetUser.mockResolvedValue({
    data: { user: id ? { id } : null },
    error: null,
  });
}

function makeFormData(start: string, end: string) {
  const fd = new FormData();
  fd.set("startDate", start);
  fd.set("endDate", end);
  return fd;
}

describe("schedule actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15T10:00:00Z"));
    mockGetUser.mockReset();
    mockFrom.mockReset();
    mockRevalidatePath.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------
  // createScheduleAction
  // -------------------------------------------------------------------
  describe("createScheduleAction", () => {
    it("rejects when user is not authenticated", async () => {
      setUser(null);
      const result = await createScheduleAction(
        makeFormData("2030-07-01", "2030-07-05"),
      );
      expect(result).toEqual({ success: false, error: "ログインが必要です" });
    });

    it("rejects staff role", async () => {
      setUser(USER_ID);
      mockFrom.mockReturnValueOnce(
        makeChain({ singleResult: { data: { role: "staff" }, error: null } }),
      );
      const result = await createScheduleAction(
        makeFormData("2030-07-01", "2030-07-05"),
      );
      expect(result).toEqual({
        success: false,
        error: "この操作は実行できません",
      });
    });

    it("rejects past startDate via Zod", async () => {
      setUser(USER_ID);
      mockFrom.mockReturnValueOnce(
        makeChain({
          singleResult: { data: { role: "contractor" }, error: null },
        }),
      );
      const result = await createScheduleAction(
        makeFormData("2020-01-01", "2020-01-05"),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("今日以降");
      }
    });

    it("inserts and returns success without warning when no overlap", async () => {
      setUser(USER_ID);
      mockFrom
        .mockReturnValueOnce(
          makeChain({
            singleResult: { data: { role: "contractor" }, error: null },
          }),
        )
        .mockReturnValueOnce(
          makeChain({ selectAwaitedResult: { data: [], error: null } }),
        )
        .mockReturnValueOnce(
          makeChain({ selectAwaitedResult: { data: null, error: null } }),
        );
      const result = await createScheduleAction(
        makeFormData("2030-07-01", "2030-07-05"),
      );
      expect(result).toEqual({ success: true });
      expect(mockRevalidatePath).toHaveBeenCalledWith("/schedule");
    });

    it("returns warning when candidate overlaps existing schedule", async () => {
      setUser(USER_ID);
      mockFrom
        .mockReturnValueOnce(
          makeChain({
            singleResult: { data: { role: "client" }, error: null },
          }),
        )
        .mockReturnValueOnce(
          makeChain({
            selectAwaitedResult: {
              data: [
                {
                  id: "existing-1",
                  start_date: "2030-07-03",
                  end_date: "2030-07-08",
                },
              ],
              error: null,
            },
          }),
        )
        .mockReturnValueOnce(
          makeChain({ selectAwaitedResult: { data: null, error: null } }),
        );
      const result = await createScheduleAction(
        makeFormData("2030-07-01", "2030-07-05"),
      );
      expect(result).toEqual({
        success: true,
        data: { warning: "同じ期間が登録されています" },
      });
    });

    it("returns error when Supabase insert fails", async () => {
      setUser(USER_ID);
      mockFrom
        .mockReturnValueOnce(
          makeChain({
            singleResult: { data: { role: "contractor" }, error: null },
          }),
        )
        .mockReturnValueOnce(
          makeChain({ selectAwaitedResult: { data: [], error: null } }),
        )
        .mockReturnValueOnce(
          makeChain({
            selectAwaitedResult: { data: null, error: { message: "boom" } },
          }),
        );
      const result = await createScheduleAction(
        makeFormData("2030-07-01", "2030-07-05"),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("保存に失敗");
      }
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // updateScheduleAction
  // -------------------------------------------------------------------
  describe("updateScheduleAction", () => {
    it("rejects when user is not authenticated", async () => {
      setUser(null);
      const result = await updateScheduleAction(
        SCHEDULE_ID,
        makeFormData("2030-07-01", "2030-07-05"),
      );
      expect(result).toEqual({ success: false, error: "ログインが必要です" });
    });

    it("rejects staff role", async () => {
      setUser(USER_ID);
      mockFrom.mockReturnValueOnce(
        makeChain({ singleResult: { data: { role: "staff" }, error: null } }),
      );
      const result = await updateScheduleAction(
        SCHEDULE_ID,
        makeFormData("2030-07-01", "2030-07-05"),
      );
      expect(result.success).toBe(false);
    });

    it("rejects when target row belongs to another user", async () => {
      setUser(USER_ID);
      mockFrom
        .mockReturnValueOnce(
          makeChain({
            singleResult: { data: { role: "contractor" }, error: null },
          }),
        )
        .mockReturnValueOnce(
          makeChain({
            maybeSingleResult: {
              data: { user_id: OTHER_USER_ID },
              error: null,
            },
          }),
        );
      const result = await updateScheduleAction(
        SCHEDULE_ID,
        makeFormData("2030-07-01", "2030-07-05"),
      );
      expect(result).toEqual({
        success: false,
        error: "この空き日程は編集できません",
      });
    });

    it("excludes self from overlap detection on edit", async () => {
      setUser(USER_ID);
      mockFrom
        .mockReturnValueOnce(
          makeChain({
            singleResult: { data: { role: "contractor" }, error: null },
          }),
        )
        .mockReturnValueOnce(
          makeChain({
            maybeSingleResult: { data: { user_id: USER_ID }, error: null },
          }),
        )
        .mockReturnValueOnce(
          makeChain({
            selectAwaitedResult: {
              data: [
                {
                  id: SCHEDULE_ID,
                  start_date: "2030-07-01",
                  end_date: "2030-07-05",
                },
              ],
              error: null,
            },
          }),
        )
        .mockReturnValueOnce(
          makeChain({ selectAwaitedResult: { data: null, error: null } }),
        );

      const result = await updateScheduleAction(
        SCHEDULE_ID,
        makeFormData("2030-07-01", "2030-07-06"),
      );
      // Only own row in existing → after exclude, no overlap
      expect(result).toEqual({ success: true });
    });
  });

  // -------------------------------------------------------------------
  // deleteScheduleAction
  // -------------------------------------------------------------------
  describe("deleteScheduleAction", () => {
    it("rejects when user is not authenticated", async () => {
      setUser(null);
      const result = await deleteScheduleAction(SCHEDULE_ID);
      expect(result).toEqual({ success: false, error: "ログインが必要です" });
    });

    it("rejects staff role", async () => {
      setUser(USER_ID);
      mockFrom.mockReturnValueOnce(
        makeChain({ singleResult: { data: { role: "staff" }, error: null } }),
      );
      const result = await deleteScheduleAction(SCHEDULE_ID);
      expect(result.success).toBe(false);
    });

    it("rejects when target row belongs to another user", async () => {
      setUser(USER_ID);
      mockFrom
        .mockReturnValueOnce(
          makeChain({
            singleResult: { data: { role: "contractor" }, error: null },
          }),
        )
        .mockReturnValueOnce(
          makeChain({
            maybeSingleResult: {
              data: { user_id: OTHER_USER_ID },
              error: null,
            },
          }),
        );
      const result = await deleteScheduleAction(SCHEDULE_ID);
      expect(result.success).toBe(false);
    });

    it("returns success on successful delete", async () => {
      setUser(USER_ID);
      mockFrom
        .mockReturnValueOnce(
          makeChain({
            singleResult: { data: { role: "contractor" }, error: null },
          }),
        )
        .mockReturnValueOnce(
          makeChain({
            maybeSingleResult: { data: { user_id: USER_ID }, error: null },
          }),
        )
        .mockReturnValueOnce(
          makeChain({ selectAwaitedResult: { data: null, error: null } }),
        );
      const result = await deleteScheduleAction(SCHEDULE_ID);
      expect(result).toEqual({ success: true });
      expect(mockRevalidatePath).toHaveBeenCalledWith("/schedule");
    });

    it("returns error when Supabase delete fails", async () => {
      setUser(USER_ID);
      mockFrom
        .mockReturnValueOnce(
          makeChain({
            singleResult: { data: { role: "contractor" }, error: null },
          }),
        )
        .mockReturnValueOnce(
          makeChain({
            maybeSingleResult: { data: { user_id: USER_ID }, error: null },
          }),
        )
        .mockReturnValueOnce(
          makeChain({
            selectAwaitedResult: { data: null, error: { message: "boom" } },
          }),
        );
      const result = await deleteScheduleAction(SCHEDULE_ID);
      expect(result.success).toBe(false);
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });
});
