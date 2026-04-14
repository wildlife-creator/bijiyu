import { sealData, unsealData } from "iron-session";

/**
 * Helpers for the fee=free Cookie used to suppress the initial setup fee
 * during the billing flow when a user arrives via /billing?fee=free.
 *
 * - Cookie name: `bijiyu_fee`
 * - Lifetime: 24 hours
 * - Encrypted with iron-session (SESSION_SECRET)
 *
 * The Cookie is set by the middleware when /billing?fee=free is hit, read by
 * BillingPage / startCheckoutAction to decide whether to add the initial fee
 * line item, and deleted by the middleware once the user has an active /
 * past_due subscription.
 */

export const FEE_COOKIE_NAME = "bijiyu_fee";

const FEE_COOKIE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export interface FeeCookiePayload {
  feeExempt: boolean;
  expiresAt: number; // epoch milliseconds
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is not set or shorter than 32 chars. Configure .env.local.",
    );
  }
  return secret;
}

export function getFeeCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: FEE_COOKIE_TTL_SECONDS,
  };
}

/**
 * Build the encrypted Cookie value (string) for fee=free.
 * Returns the sealed payload — caller is responsible for setting the Cookie
 * with the options from getFeeCookieOptions().
 */
export async function sealFeeCookie(
  payload: Omit<FeeCookiePayload, "expiresAt"> & { expiresAt?: number },
): Promise<string> {
  const sealed = await sealData(
    {
      feeExempt: payload.feeExempt,
      expiresAt: payload.expiresAt ?? Date.now() + FEE_COOKIE_TTL_SECONDS * 1000,
    } satisfies FeeCookiePayload,
    {
      password: getSessionSecret(),
      ttl: FEE_COOKIE_TTL_SECONDS,
    },
  );
  return sealed;
}

/**
 * Decrypt and validate the Cookie value. Returns null when:
 * - Cookie is missing
 * - Decryption fails
 * - Payload is expired (expiresAt is in the past)
 */
export async function readFeeCookie(
  rawValue: string | undefined | null,
): Promise<FeeCookiePayload | null> {
  if (!rawValue) {
    return null;
  }

  try {
    const data = await unsealData<FeeCookiePayload>(rawValue, {
      password: getSessionSecret(),
      ttl: FEE_COOKIE_TTL_SECONDS,
    });

    if (!data || typeof data.feeExempt !== "boolean") {
      return null;
    }
    if (typeof data.expiresAt === "number" && data.expiresAt < Date.now()) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}
