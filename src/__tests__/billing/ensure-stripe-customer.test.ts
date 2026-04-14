import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ensureStripeCustomer } from "@/lib/billing/ensure-stripe-customer";

interface RpcResult {
  data?: unknown;
  error?: { message: string } | null;
}

function makeAdmin(rpcResults: Record<string, RpcResult[]>) {
  const callQueueByFn: Record<string, number> = {};
  const calls: Array<{ fn: string; payload: unknown }> = [];

  const admin = {
    rpc: vi.fn((fn: string, payload: unknown) => {
      calls.push({ fn, payload });
      const queue = rpcResults[fn] ?? [];
      const idx = callQueueByFn[fn] ?? 0;
      callQueueByFn[fn] = idx + 1;
      const result = queue[idx] ?? queue[queue.length - 1] ?? {};
      return Promise.resolve({
        data: result.data ?? null,
        error: result.error ?? null,
      });
    }),
  };
  return { admin: admin as never, calls };
}

function makeStripe(): Stripe & {
  _createCalls: Array<{ email: string }>;
  _delCalls: string[];
  _customerToCreate: { id: string };
  _createShouldThrow?: () => never;
  _delShouldThrow?: () => never;
} {
  const createCalls: Array<{ email: string }> = [];
  const delCalls: string[] = [];
  const stripe = {
    _createCalls: createCalls,
    _delCalls: delCalls,
    _customerToCreate: { id: "cus_new_123" },
    customers: {
      create: vi.fn(async function (
        this: { _customerToCreate: { id: string }; _createShouldThrow?: () => never },
        params: { email: string },
      ) {
        if (this._createShouldThrow) this._createShouldThrow();
        createCalls.push({ email: params.email });
        return this._customerToCreate;
      }),
      del: vi.fn(async function (
        this: { _delShouldThrow?: () => never },
        id: string,
      ) {
        if (this._delShouldThrow) this._delShouldThrow();
        delCalls.push(id);
        return { id, deleted: true };
      }),
    },
  };
  // bind so customers methods see the outer object via `this`
  stripe.customers.create = stripe.customers.create.bind(stripe);
  stripe.customers.del = stripe.customers.del.bind(stripe);
  return stripe as never;
}

const USER_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureStripeCustomer", () => {
  it("returns existing customer ID without calling Stripe when row already has one", async () => {
    const { admin, calls } = makeAdmin({
      get_or_lock_stripe_customer: [
        {
          data: {
            stripe_customer_id: "cus_existing_999",
            email: "user@test.local",
            locked: false,
          },
        },
      ],
    });
    const stripe = makeStripe();

    const result = await ensureStripeCustomer(admin, stripe, USER_ID);

    expect(result).toEqual({
      stripeCustomerId: "cus_existing_999",
      created: false,
    });
    expect(stripe._createCalls).toHaveLength(0);
    expect(stripe._delCalls).toHaveLength(0);
    // Should NOT call set_stripe_customer_id at all
    expect(calls.find((c) => c.fn === "set_stripe_customer_id")).toBeUndefined();
  });

  it("creates a new Stripe customer + persists it on the first write", async () => {
    const { admin, calls } = makeAdmin({
      get_or_lock_stripe_customer: [
        {
          data: {
            stripe_customer_id: null,
            email: "newuser@test.local",
            locked: true,
          },
        },
      ],
      set_stripe_customer_id: [
        {
          data: { stripe_customer_id: "cus_new_123", conflicted: false },
        },
      ],
    });
    const stripe = makeStripe();

    const result = await ensureStripeCustomer(admin, stripe, USER_ID);

    expect(result).toEqual({
      stripeCustomerId: "cus_new_123",
      created: true,
    });
    expect(stripe._createCalls).toEqual([{ email: "newuser@test.local" }]);
    expect(stripe._delCalls).toHaveLength(0);
    // Both RPCs called in order
    const order = calls.map((c) => c.fn);
    expect(order).toEqual([
      "get_or_lock_stripe_customer",
      "set_stripe_customer_id",
    ]);
    const setPayload = calls.find((c) => c.fn === "set_stripe_customer_id")!;
    expect(setPayload.payload).toEqual({
      uid: USER_ID,
      customer_id: "cus_new_123",
    });
  });

  it("on conflict deletes the orphan and returns the previously stored ID", async () => {
    const { admin } = makeAdmin({
      get_or_lock_stripe_customer: [
        {
          data: {
            stripe_customer_id: null,
            email: "race@test.local",
            locked: true,
          },
        },
      ],
      set_stripe_customer_id: [
        {
          data: {
            stripe_customer_id: "cus_winner_777",
            conflicted: true,
          },
        },
      ],
    });
    const stripe = makeStripe();

    const result = await ensureStripeCustomer(admin, stripe, USER_ID);

    expect(result).toEqual({
      stripeCustomerId: "cus_winner_777",
      created: false,
    });
    // Created the orphan, then deleted it
    expect(stripe._createCalls).toHaveLength(1);
    expect(stripe._delCalls).toEqual(["cus_new_123"]);
  });

  it("throws when get_or_lock RPC returns an error", async () => {
    const { admin } = makeAdmin({
      get_or_lock_stripe_customer: [
        { error: { message: "user not found" } },
      ],
    });
    const stripe = makeStripe();

    await expect(
      ensureStripeCustomer(admin, stripe, USER_ID),
    ).rejects.toThrow(/get_or_lock_stripe_customer failed/);
    expect(stripe._createCalls).toHaveLength(0);
  });

  it("throws when the locked user has no email", async () => {
    const { admin } = makeAdmin({
      get_or_lock_stripe_customer: [
        {
          data: {
            stripe_customer_id: null,
            email: null,
            locked: true,
          },
        },
      ],
    });
    const stripe = makeStripe();

    await expect(
      ensureStripeCustomer(admin, stripe, USER_ID),
    ).rejects.toThrow(/no email/);
    expect(stripe._createCalls).toHaveLength(0);
  });

  it("throws and best-effort deletes the customer when set_stripe_customer_id errors", async () => {
    const { admin } = makeAdmin({
      get_or_lock_stripe_customer: [
        {
          data: {
            stripe_customer_id: null,
            email: "err@test.local",
            locked: true,
          },
        },
      ],
      set_stripe_customer_id: [{ error: { message: "constraint violated" } }],
    });
    const stripe = makeStripe();

    await expect(
      ensureStripeCustomer(admin, stripe, USER_ID),
    ).rejects.toThrow(/set_stripe_customer_id failed/);
    expect(stripe._delCalls).toEqual(["cus_new_123"]);
  });

  it("does not throw if cleanup delete fails (logs only)", async () => {
    const { admin } = makeAdmin({
      get_or_lock_stripe_customer: [
        {
          data: {
            stripe_customer_id: null,
            email: "race2@test.local",
            locked: true,
          },
        },
      ],
      set_stripe_customer_id: [
        {
          data: { stripe_customer_id: "cus_winner_2", conflicted: true },
        },
      ],
    });
    const stripe = makeStripe();
    stripe._delShouldThrow = () => {
      throw new Error("network down");
    };

    const result = await ensureStripeCustomer(admin, stripe, USER_ID);

    expect(result).toEqual({
      stripeCustomerId: "cus_winner_2",
      created: false,
    });
  });
});
