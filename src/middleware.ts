import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/types/database";

type UserRole = Database["public"]["Enums"]["user_role"];

// Public routes that skip authentication checks entirely
const PUBLIC_PATH_PREFIXES = [
  "/auth/callback",
  "/api/webhooks",
  "/_next",
  "/favicon.ico",
] as const;

// Static file extensions that should be skipped
const STATIC_FILE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".css",
  ".js",
  ".woff",
  ".woff2",
] as const;

// Auth page paths accessible only to unauthenticated users
// These are under (auth) route group so URL has no /auth/ prefix
const AUTH_PAGE_PATHS = [
  "/login",
  "/register",
  "/reset-password",
] as const;

// Public pages accessible without authentication (static/marketing pages)
const PUBLIC_PAGES = ["/", "/about", "/terms", "/privacy", "/contact", "/faq", "/legal"] as const;

// Paths that contractors (free users) can access under /billing
const BILLING_PATH_PREFIX = "/billing";

// Client-only path prefixes (CLI screens except billing)
const CLIENT_ONLY_PREFIXES = [
  "/jobs/create",
  "/jobs/edit",
  "/organization",
  "/users/search", // CLI-005~006: contractor search for clients
  "/users/contractors", // CLI-005~006: contractor search (alternative path)
] as const;

/**
 * Check if the path is a public route that should skip all middleware logic
 */
function isPublicRoute(pathname: string): boolean {
  // Check public path prefixes
  if (
    PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return true;
  }

  // Check static file extensions
  if (
    STATIC_FILE_EXTENSIONS.some((ext) => pathname.endsWith(ext))
  ) {
    return true;
  }

  return false;
}

/**
 * Check if the path is an auth page (login, register, reset-password, etc.)
 */
function isAuthPage(pathname: string): boolean {
  return AUTH_PAGE_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Check if the path is a public page accessible without authentication
 */
function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGES.includes(pathname as (typeof PUBLIC_PAGES)[number]);
}

/**
 * Check if the path is an admin route
 */
function isAdminRoute(pathname: string): boolean {
  return pathname.startsWith("/admin");
}

/**
 * Check if the path is a client-only route (excluding billing)
 */
function isClientOnlyRoute(pathname: string): boolean {
  return CLIENT_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Create a redirect response to the specified path
 */
function redirectTo(request: NextRequest, path: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = path;
  return NextResponse.redirect(url);
}

/**
 * Create a redirect to login with an error message parameter
 */
function redirectToLoginWithError(
  request: NextRequest,
  message: string,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public routes (static files, auth callback, webhooks)
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Create Supabase client with cookie handling for middleware
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session by calling getUser (recommended by Supabase)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // --- Unauthenticated user routing ---
  if (!user) {
    // Allow access to auth pages and public pages
    if (isAuthPage(pathname) || isPublicPage(pathname)) {
      return supabaseResponse;
    }
    // Redirect all other routes to login
    return redirectTo(request, "/login");
  }

  // --- Authenticated user: fetch role from DB ---
  const { data: userData } = await supabase
    .from("users")
    .select("role, deleted_at, is_active")
    .eq("id", user.id)
    .single();

  // If user record not found in DB, allow through (new user completing registration)
  if (!userData) {
    // Allow auth pages and registration flow
    if (isAuthPage(pathname) || pathname.startsWith("/register")) {
      return supabaseResponse;
    }
    return redirectTo(request, "/register/profile");
  }

  // Check if account is deactivated
  if (!userData.is_active) {
    return redirectToLoginWithError(
      request,
      "アカウントが一時停止されています。詳しくは管理者にお問い合わせください",
    );
  }

  // Check if account is soft-deleted
  if (userData.deleted_at) {
    return redirectToLoginWithError(
      request,
      "このアカウントは退会済みです",
    );
  }

  const role: UserRole = userData.role;

  // --- Authenticated user accessing auth pages → redirect to mypage ---
  // Exception: /reset-password/confirm must be accessible by authenticated users
  // (recovery flow sets the session before redirecting to this page)
  if (isAuthPage(pathname) && pathname !== "/reset-password/confirm") {
    if (role === "admin") {
      return redirectTo(request, "/admin/dashboard");
    }
    return redirectTo(request, "/mypage");
  }

  // --- Role-based routing ---

  // Admin: only allow /admin/* routes, redirect everything else
  if (role === "admin") {
    if (isAdminRoute(pathname)) {
      return supabaseResponse;
    }
    return redirectTo(request, "/admin/dashboard");
  }

  // Non-admin roles: block /admin/* routes
  if (isAdminRoute(pathname)) {
    return redirectTo(request, "/mypage");
  }

  // Contractor (free user): block client-only paths but allow /billing/*
  if (role === "contractor") {
    if (pathname.startsWith(BILLING_PATH_PREFIX)) {
      return supabaseResponse;
    }
    if (isClientOnlyRoute(pathname)) {
      return redirectTo(request, "/mypage");
    }
  }

  // Client and staff: no additional blocking needed beyond /admin/* (already handled)

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
