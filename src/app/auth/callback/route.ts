import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/types/database";

/**
 * Auth callback route handler.
 * Handles redirect from Supabase Auth (email confirmation, password reset, etc.)
 * Exchanges the authorization code for a session and redirects based on flow type.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const next = searchParams.get("next");

  if (!code) {
    // No code provided — redirect to login with error
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "認証コードが見つかりません");
    return NextResponse.redirect(loginUrl);
  }

  const cookieStore = await cookies();

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // In edge cases, cookies may be read-only. Safe to ignore
            // because the middleware will handle cookie refresh.
          }
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "認証に失敗しました。もう一度お試しください");
    return NextResponse.redirect(loginUrl);
  }

  // Determine redirect destination based on flow type
  const flowType = type ?? next ?? "";

  if (flowType.includes("recovery")) {
    // Password reset flow → redirect to reset password confirmation
    return NextResponse.redirect(new URL("/reset-password/confirm", origin));
  }

  // Default: signup / email confirmation → redirect to profile registration
  return NextResponse.redirect(new URL("/register/profile", origin));
}
