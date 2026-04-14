import Stripe from "stripe";

/**
 * Singleton Stripe SDK client.
 *
 * Initialised with STRIPE_SECRET_KEY. Throws if the env var is missing
 * so misconfiguration is detected at first use rather than producing
 * cryptic errors deep inside the Stripe SDK.
 *
 * Module side-effect free in tests: Vitest can mock this module via
 * `vi.mock('@/lib/billing/stripe')` if needed.
 */

let cachedClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (cachedClient) {
    return cachedClient;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Configure .env.local before using the Stripe client.",
    );
  }

  cachedClient = new Stripe(secretKey, {
    // Pin the API version so SDK upgrades cannot silently change behaviour.
    // Update only after testing against the new API version.
    apiVersion: "2026-02-25.clover",
    typescript: true,
    appInfo: {
      name: "bijiyu",
      version: "0.1.0",
    },
  });

  return cachedClient;
}

/**
 * Test-only helper to reset the cached Stripe client between test runs
 * after mocking env vars.
 */
export function resetStripeClient(): void {
  cachedClient = null;
}
