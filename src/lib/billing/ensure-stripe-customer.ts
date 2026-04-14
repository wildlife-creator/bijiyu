import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import type { Database } from "@/types/database";

/**
 * Idempotently ensure that `users.stripe_customer_id` is populated for the
 * given user, creating a fresh Stripe Customer when necessary.
 *
 * The two-RPC dance avoids race conditions without holding a long row lock
 * across the Stripe API call:
 *
 *   1. `get_or_lock_stripe_customer(uid)` — `SELECT ... FOR UPDATE` and
 *      return either the existing customer ID or a "locked: true" signal.
 *      The lock is released when the function returns control to JS.
 *
 *   2. If we got back null, we call `stripe.customers.create({ email })`
 *      to mint a new customer ID. This happens *outside* the row lock so
 *      we never hold pg locks across a network round-trip.
 *
 *   3. `set_stripe_customer_id(uid, customer_id)` — UPDATE WHERE
 *      `stripe_customer_id IS NULL`. Returns `conflicted: true` when a
 *      parallel request beat us to the punch.
 *
 *   4. On conflict we delete the orphaned Stripe Customer we just created
 *      and return the previously-stored ID, so Stripe never accumulates
 *      unused customers.
 *
 * Throws on any RPC or Stripe error so callers can surface the failure.
 */
export async function ensureStripeCustomer(
  admin: SupabaseClient<Database>,
  stripe: Stripe,
  userId: string,
): Promise<{ stripeCustomerId: string; created: boolean }> {
  // Step 1: row-locked SELECT
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lockResult = await (admin as any).rpc("get_or_lock_stripe_customer", {
    uid: userId,
  });
  if (lockResult.error) {
    throw new Error(
      `get_or_lock_stripe_customer failed: ${lockResult.error.message ?? String(lockResult.error)}`,
    );
  }

  const lockData = lockResult.data as {
    stripe_customer_id: string | null;
    email: string | null;
    locked: boolean;
  };

  if (lockData.stripe_customer_id) {
    return {
      stripeCustomerId: lockData.stripe_customer_id,
      created: false,
    };
  }

  if (!lockData.email) {
    throw new Error(
      `ensureStripeCustomer: user ${userId} has no email — cannot create Stripe Customer`,
    );
  }

  // Step 2: create a fresh Stripe Customer
  const newCustomer = await stripe.customers.create({
    email: lockData.email,
    metadata: { user_id: userId },
  });

  // Step 3: try to persist with first-write-wins
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setResult = await (admin as any).rpc("set_stripe_customer_id", {
    uid: userId,
    customer_id: newCustomer.id,
  });
  if (setResult.error) {
    // We already minted a customer — best-effort cleanup before propagating
    await stripe.customers.del(newCustomer.id).catch(() => undefined);
    throw new Error(
      `set_stripe_customer_id failed: ${setResult.error.message ?? String(setResult.error)}`,
    );
  }

  const setData = setResult.data as {
    stripe_customer_id: string;
    conflicted: boolean;
  };

  if (setData.conflicted) {
    // Step 4: someone else won the race — delete our orphan
    await stripe.customers.del(newCustomer.id).catch((err) => {
      console.error(
        "[ensureStripeCustomer] failed to delete orphan customer",
        { id: newCustomer.id, err },
      );
    });
    return {
      stripeCustomerId: setData.stripe_customer_id,
      created: false,
    };
  }

  return { stripeCustomerId: newCustomer.id, created: true };
}
