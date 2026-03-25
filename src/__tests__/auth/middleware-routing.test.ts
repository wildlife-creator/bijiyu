import { describe, expect, it } from "vitest";

/**
 * Unit tests for middleware routing logic.
 * These test the routing rule functions extracted from middleware.ts
 * without requiring the full Next.js middleware runtime.
 */

// Replicate the routing helper functions from middleware for isolated testing
const AUTH_PAGE_PATHS = ["/login", "/register", "/reset-password"] as const;
const PUBLIC_PAGES = [
  "/",
  "/about",
  "/terms",
  "/privacy",
  "/contact",
  "/faq",
] as const;
const CLIENT_ONLY_PREFIXES = [
  "/jobs/create",
  "/jobs/edit",
  "/organization",
  "/users/search",
] as const;

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGE_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGES.includes(pathname as (typeof PUBLIC_PAGES)[number]);
}

function isAdminRoute(pathname: string): boolean {
  return pathname.startsWith("/admin");
}

function isClientOnlyRoute(pathname: string): boolean {
  return CLIENT_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

type Role = "contractor" | "client" | "staff" | "admin";

interface RoutingResult {
  allowed: boolean;
  redirectTo?: string;
}

/**
 * Determine routing result for an authenticated user based on role and path
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

  it("redirects to /login for /admin/dashboard", () => {
    const result = getRoutingResult("contractor", "/admin/dashboard", false);
    expect(result.allowed).toBe(false);
    expect(result.redirectTo).toBe("/login");
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

  it("blocks /organization (client-only)", () => {
    const result = getRoutingResult(role, "/organization/members", true);
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

  it("allows /organization/members", () => {
    const result = getRoutingResult(role, "/organization/members", true);
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
