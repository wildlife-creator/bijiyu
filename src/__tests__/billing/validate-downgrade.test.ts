import { describe, expect, it, vi } from "vitest";

import { validateDowngradePrerequisites } from "@/lib/billing/validate-downgrade";

type QueryResult = { data?: unknown; error?: unknown; count?: number | null };

function makeAdmin(config: {
  openJobsCount?: number;
  jobIds?: string[];
  pendingAppsCount?: number;
  orgId?: string | null;
  staffCount?: number;
}) {
  const {
    openJobsCount = 0,
    jobIds = [],
    pendingAppsCount = 0,
    orgId = null,
    staffCount = 0,
  } = config;

  const admin = {
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        neq: vi.fn(() => builder),
        in: vi.fn(() => builder),
        is: vi.fn(() => builder),
        // Promise-like resolution for counting / listing queries
        then: vi.fn((resolve: (r: QueryResult) => unknown) => {
          if (table === "jobs") {
            return Promise.resolve(
              resolve({
                data: jobIds.map((id) => ({ id })),
                count: openJobsCount,
                error: null,
              }),
            );
          }
          if (table === "applications") {
            return Promise.resolve(
              resolve({
                data: [],
                count: pendingAppsCount,
                error: null,
              }),
            );
          }
          if (table === "organization_members") {
            return Promise.resolve(
              resolve({
                data: [],
                count: staffCount,
                error: null,
              }),
            );
          }
          return Promise.resolve(resolve({ data: null, error: null }));
        }),
        maybeSingle: vi.fn(() =>
          Promise.resolve({
            data: orgId ? { id: orgId } : null,
            error: null,
          }),
        ),
      };
      return builder;
    }),
  };
  return admin as never;
}

const USER = "user-1";

describe("validateDowngradePrerequisites", () => {
  it("passes when all conditions are met for downgrade to individual", async () => {
    const admin = makeAdmin({
      openJobsCount: 1,
      jobIds: ["job-1"],
      pendingAppsCount: 0,
      orgId: null,
    });
    const result = await validateDowngradePrerequisites(
      admin,
      USER,
      "corporate",
      "individual",
    );
    expect(result.ok).toBe(true);
  });

  it("fails on open jobs exceeding target limit", async () => {
    const admin = makeAdmin({
      openJobsCount: 3,
      jobIds: ["j1", "j2", "j3"],
      pendingAppsCount: 0,
    });
    const result = await validateDowngradePrerequisites(
      admin,
      USER,
      "corporate",
      "individual", // maxOpenJobs = 1
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("1件以下にして");
      expect(result.errors[0]).toContain("現在3件");
    }
  });

  it("fails on pending applications", async () => {
    const admin = makeAdmin({
      openJobsCount: 0,
      jobIds: ["j1"],
      pendingAppsCount: 2,
    });
    const result = await validateDowngradePrerequisites(
      admin,
      USER,
      "corporate",
      "individual",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("未対応の応募");
    }
  });

  it("fails on staff count exceeding target limit", async () => {
    const admin = makeAdmin({
      openJobsCount: 0,
      jobIds: [],
      pendingAppsCount: 0,
      orgId: "org-1",
      staffCount: 5,
    });
    const result = await validateDowngradePrerequisites(
      admin,
      USER,
      "corporate", // maxStaff=10
      "individual", // maxStaff=0
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("担当者を0人以下");
      expect(result.errors[0]).toContain("現在5人");
    }
  });

  it("cancellation (free) requires zero everything", async () => {
    const admin = makeAdmin({
      openJobsCount: 1,
      jobIds: ["j1"],
      pendingAppsCount: 0,
      orgId: "org-1",
      staffCount: 1,
    });
    const result = await validateDowngradePrerequisites(
      admin,
      USER,
      "corporate",
      "free",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Should have two errors: open jobs + staff
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("allows downgrade to small (unlimited jobs, 0 staff)", async () => {
    const admin = makeAdmin({
      openJobsCount: 50,
      jobIds: Array.from({ length: 50 }, (_, i) => `j${i}`),
      pendingAppsCount: 0,
      orgId: "org-1",
      staffCount: 0,
    });
    const result = await validateDowngradePrerequisites(
      admin,
      USER,
      "corporate_premium",
      "small", // maxOpenJobs=Infinity, maxStaff=0
    );
    expect(result.ok).toBe(true);
  });
});
