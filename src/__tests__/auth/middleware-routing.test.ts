import { describe, expect, it } from "vitest";

// 本体定数・ヘルパーを import する（テスト内コピー禁止ルール。
// コピーすると本体更新とテストの同期が取れず、古い実装に対して
// テストが通り続ける事故が起きる — 2026-04-21 実例）
import {
  PUBLIC_PAGES,
  isAuthPage,
  isPublicPage,
  isAdminRoute,
  isClientOnlyRoute,
} from "@/middleware";

/**
 * Unit tests for middleware routing logic.
 * ルーティング判定（getRoutingResult）は middleware.ts の決定木を
 * 本体ヘルパーの上に再現したもの。期待値は admin spec Task 4.2 の
 * 新ルーティング（未認証 /admin/* → /admin/login）に準拠する。
 */

type Role = "contractor" | "client" | "staff" | "admin";

interface RoutingResult {
  allowed: boolean;
  redirectTo?: string;
}

/**
 * Determine routing result for a user based on role and path
 * (mirrors the decision tree in src/middleware.ts using the real helpers)
 */
function getRoutingResult(
  role: Role,
  pathname: string,
  isAuthenticated: boolean,
): RoutingResult {
  // Unauthenticated routing
  if (!isAuthenticated) {
    if (isAuthPage(pathname) || isPublicPage(pathname)) {
      return { allowed: true };
    }
    // 未認証の /admin/*（/admin/login 以外）は /admin/login へ
    if (isAdminRoute(pathname)) {
      return { allowed: false, redirectTo: "/admin/login" };
    }
    return { allowed: false, redirectTo: "/login" };
  }

  // Authenticated on auth pages → redirect
  if (isAuthPage(pathname)) {
    return {
      allowed: false,
      redirectTo: role === "admin" ? "/admin/dashboard" : "/mypage",
    };
  }

  // Admin: only /admin/* allowed
  if (role === "admin") {
    if (isAdminRoute(pathname)) {
      return { allowed: true };
    }
    return { allowed: false, redirectTo: "/admin/dashboard" };
  }

  // Non-admin: block /admin/*
  if (isAdminRoute(pathname)) {
    return { allowed: false, redirectTo: "/mypage" };
  }

  // Contractor: block client-only paths (except /billing)
  if (role === "contractor") {
    if (pathname.startsWith("/billing")) {
      return { allowed: true };
    }
    if (isClientOnlyRoute(pathname)) {
      return { allowed: false, redirectTo: "/mypage" };
    }
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Unauthenticated routing
// ---------------------------------------------------------------------------
describe("unauthenticated user routing", () => {
  it("allows access to /login", () => {
    const result = getRoutingResult("contractor", "/login", false);
    expect(result.allowed).toBe(true);
  });

  it("allows access to /register", () => {
    const result = getRoutingResult("contractor", "/register", false);
    expect(result.allowed).toBe(true);
  });

  it("allows access to /register/profile", () => {
    const result = getRoutingResult("contractor", "/register/profile", false);
    expect(result.allowed).toBe(true);
  });

  it("allows access to /reset-password", () => {
    const result = getRoutingResult("contractor", "/reset-password", false);
    expect(result.allowed).toBe(true);
  });

  it("allows access to /admin/login (admin auth page)", () => {
    const result = getRoutingResult("contractor", "/admin/login", false);
    expect(result.allowed).toBe(true);
  });

  it("allows access to landing page /", () => {
    const result = getRoutingResult("contractor", "/", false);
    expect(result.allowed).toBe(true);
  });

  it("allows access to public pages", () => {
    for (const page of PUBLIC_PAGES) {
      const result = getRoutingResult("contractor", page, false);
      expect(result.allowed).toBe(true);
    }
  });

  it("redirects to /login for /mypage", () => {
    const result = getRoutingResult("contractor", "/mypage", false);
    expect(result.allowed).toBe(false);
    expect(result.redirectTo).toBe("/login");
  });

  it("redirects to /admin/login for /admin/dashboard (admin spec Task 4.2)", () => {
    const result = getRoutingResult("contractor", "/admin/dashboard", false);
    expect(result.allowed).toBe(false);
    expect(result.redirectTo).toBe("/admin/login");
  });

  it("redirects to /admin/login for /admin/users", () => {
    const result = getRoutingResult("contractor", "/admin/users", false);
    expect(result.allowed).toBe(false);
    expect(result.redirectTo).toBe("/admin/login");
  });
});

// ---------------------------------------------------------------------------
// Authenticated contractor routing
// ---------------------------------------------------------------------------
describe("authenticated contractor routing", () => {
  const role: Role = "contractor";

  it("redirects /login to /mypage", () => {
    const result = getRoutingResult(role, "/login", true);
    expect(result.allowed).toBe(false);
    expect(result.redirectTo).toBe("/mypage");
  });

  it("redirects /admin/login to /mypage (authenticated non-admin)", () => {
    const result = getRoutingResult(role, "/admin/login", true);
    expect(result.allowed).toBe(false);
    expect(result.redirectTo).toBe("/mypage");
  });

  it("allows /mypage", () => {
    const result = getRoutingResult(role, "/mypage", true);
    expect(result.allowed).toBe(true);
  });

  it("allows /jobs (browse)", () => {
    const result = getRoutingResult(role, "/jobs", true);
    expect(result.allowed).toBe(true);
  });

  it("blocks /admin/dashboard", () => {
    const result = getRoutingResult(role, "/admin/dashboard", true);
    expect(result.allowed).toBe(false);
    expect(result.redirectTo).toBe("/mypage");
  });

  it("blocks /jobs/create (client-only)", () => {
    const result = getRoutingResult(role, "/jobs/create", true);
    expect(result.allowed).toBe(false);
    expect(result.redirectTo).toBe("/mypage");
  });

  it("blocks /mypage/members (client-only)", () => {
    const result = getRoutingResult(role, "/mypage/members", true);
    expect(result.allowed).toBe(false);
    expect(result.redirectTo).toBe("/mypage");
  });

  it("allows /billing (exception for CLI-026~027)", () => {
    const result = getRoutingResult(role, "/billing", true);
    expect(result.allowed).toBe(true);
  });

  it("allows /billing/plans", () => {
    const result = getRoutingResult(role, "/billing/plans", true);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Authenticated client routing
// ---------------------------------------------------------------------------
describe("authenticated client routing", () => {
  const role: Role = "client";

  it("redirects /login to /mypage", () => {
    const result = getRoutingResult(role, "/login", true);
    expect(result.allowed).toBe(false);
    expect(result.redirectTo).toBe("/mypage");
  });

  it("allows /mypage", () => {
    const result = getRoutingResult(role, "/mypage", true);
    expect(result.allowed).toBe(true);
  });

  it("allows /jobs/create", () => {
    const result = getRoutingResult(role, "/jobs/create", true);
    expect(result.allowed).toBe(true);
  });

  it("allows /mypage/members", () => {
    const result = getRoutingResult(role, "/mypage/members", true);
    expect(result.allowed).toBe(true);
  });

  it("blocks /admin/dashboard", () => {
    const result = getRoutingResult(role, "/admin/dashboard", true);
    expect(result.allowed).toBe(false);
    expect(result.redirectTo).toBe("/mypage");
  });
});

// ---------------------------------------------------------------------------
// Authenticated staff routing
// ---------------------------------------------------------------------------
describe("authenticated staff routing", () => {
  const role: Role = "staff";

  it("allows /mypage", () => {
    const result = getRoutingResult(role, "/mypage", true);
    expect(result.allowed).toBe(true);
  });

  it("allows /jobs/create", () => {
    const result = getRoutingResult(role, "/jobs/create", true);
    expect(result.allowed).toBe(true);
  });

  it("blocks /admin/dashboard", () => {
    const result = getRoutingResult(role, "/admin/dashboard", true);
    expect(result.allowed).toBe(false);
    expect(result.redirectTo).toBe("/mypage");
  });
});

// ---------------------------------------------------------------------------
// Authenticated admin routing
// ---------------------------------------------------------------------------
describe("authenticated admin routing", () => {
  const role: Role = "admin";

  it("redirects /login to /admin/dashboard", () => {
    const result = getRoutingResult(role, "/login", true);
    expect(result.allowed).toBe(false);
    expect(result.redirectTo).toBe("/admin/dashboard");
  });

  it("redirects /admin/login to /admin/dashboard (already authenticated)", () => {
    const result = getRoutingResult(role, "/admin/login", true);
    expect(result.allowed).toBe(false);
    expect(result.redirectTo).toBe("/admin/dashboard");
  });

  it("allows /admin/dashboard", () => {
    const result = getRoutingResult(role, "/admin/dashboard", true);
    expect(result.allowed).toBe(true);
  });

  it("allows /admin/users", () => {
    const result = getRoutingResult(role, "/admin/users", true);
    expect(result.allowed).toBe(true);
  });

  it("blocks /mypage (admin cannot access general pages)", () => {
    const result = getRoutingResult(role, "/mypage", true);
    expect(result.allowed).toBe(false);
    expect(result.redirectTo).toBe("/admin/dashboard");
  });

  it("blocks /jobs", () => {
    const result = getRoutingResult(role, "/jobs", true);
    expect(result.allowed).toBe(false);
    expect(result.redirectTo).toBe("/admin/dashboard");
  });
});
