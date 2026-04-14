import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lightweight integration tests for /api/webhooks/stripe Route Handler.
 *
 * We mock the Stripe SDK + Supabase admin client + handler modules to keep
 * the test pure-unit. The goal is to confirm:
 *  - signature verification path
 *  - 400 on missing signature
 *  - 200 + skipped on unsupported event types
 *  - dispatch to handleCheckoutCompleted / handleSubscriptionLifecycle
 *  - withWebhookIdempotency wraps the dispatch
 */

// ---- mock the modules used by route.ts -----------------------------------

const handleCheckoutCompletedMock = vi.fn(
  async (_admin: unknown, _session: unknown) => undefined,
);
const handleSubscriptionLifecycleMock = vi.fn(
  async (_admin: unknown, _stripe: unknown, _event: unknown) => undefined,
);
const withWebhookIdempotencyMock = vi.fn(
  async (
    _admin: unknown,
    _event: { id: string; type: string },
    handler: () => Promise<void>,
  ) => {
    await handler();
    return { skipped: false as const };
  },
);

vi.mock("@/lib/billing/webhook/handle-checkout-completed", () => ({
  handleCheckoutCompleted: handleCheckoutCompletedMock,
}));
vi.mock("@/lib/billing/webhook/handle-subscription-lifecycle", () => ({
  handleSubscriptionLifecycle: handleSubscriptionLifecycleMock,
}));
vi.mock("@/lib/billing/webhook/idempotency", () => ({
  withWebhookIdempotency: withWebhookIdempotencyMock,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));

const constructEventMock = vi.fn();
vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent: constructEventMock },
  }),
}));

// Import the route handler AFTER mocks are registered.
const { POST } = await import("@/app/api/webhooks/stripe/route");

// ---- helpers --------------------------------------------------------------

function makeRequest({
  body = "{}",
  signature,
}: {
  body?: string;
  signature?: string | null;
}): Request {
  const headers = new Headers();
  if (signature !== null && signature !== undefined) {
    headers.set("stripe-signature", signature);
  }
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers,
    body,
  });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  vi.clearAllMocks();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// ---- tests ---------------------------------------------------------------

describe("POST /api/webhooks/stripe", () => {
  it("returns 400 when stripe-signature header is missing", async () => {
    const res = await POST(makeRequest({ signature: null }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when signature verification fails", async () => {
    constructEventMock.mockImplementationOnce(() => {
      throw new Error("invalid signature");
    });
    const res = await POST(makeRequest({ signature: "t=1,v1=bad" }));
    expect(res.status).toBe(400);
    expect(handleCheckoutCompletedMock).not.toHaveBeenCalled();
    expect(handleSubscriptionLifecycleMock).not.toHaveBeenCalled();
  });

  it("returns 200 + skipped on unsupported event types without writing to idempotency table", async () => {
    constructEventMock.mockReturnValueOnce({
      id: "evt_unsup_1",
      type: "customer.created",
      data: { object: {} },
    } as unknown as Stripe.Event);

    const res = await POST(makeRequest({ signature: "t=1,v1=ok" }));
    expect(res.status).toBe(200);
    expect(withWebhookIdempotencyMock).not.toHaveBeenCalled();
    expect(handleCheckoutCompletedMock).not.toHaveBeenCalled();
  });

  it("dispatches checkout.session.completed via withWebhookIdempotency", async () => {
    const session = { id: "cs_1", metadata: { type: "plan" } };
    constructEventMock.mockReturnValueOnce({
      id: "evt_co_1",
      type: "checkout.session.completed",
      data: { object: session },
    } as unknown as Stripe.Event);

    const res = await POST(makeRequest({ signature: "t=1,v1=ok" }));
    expect(res.status).toBe(200);
    expect(withWebhookIdempotencyMock).toHaveBeenCalledOnce();
    expect(handleCheckoutCompletedMock).toHaveBeenCalledOnce();
    expect(handleCheckoutCompletedMock).toHaveBeenCalledWith(
      expect.anything(),
      session,
    );
  });

  it("dispatches customer.subscription.updated to handleSubscriptionLifecycle", async () => {
    const sub = { id: "sub_1" };
    constructEventMock.mockReturnValueOnce({
      id: "evt_sub_upd",
      type: "customer.subscription.updated",
      data: { object: sub },
    } as unknown as Stripe.Event);

    const res = await POST(makeRequest({ signature: "t=1,v1=ok" }));
    expect(res.status).toBe(200);
    expect(handleSubscriptionLifecycleMock).toHaveBeenCalledOnce();
    const callArgs = handleSubscriptionLifecycleMock.mock.calls[0]!;
    expect(callArgs[2]).toMatchObject({
      type: "customer.subscription.updated",
      data: sub,
    });
  });

  it("dispatches invoice.payment_failed to handleSubscriptionLifecycle", async () => {
    const invoice = { id: "in_1" };
    constructEventMock.mockReturnValueOnce({
      id: "evt_inv_fail",
      type: "invoice.payment_failed",
      data: { object: invoice },
    } as unknown as Stripe.Event);

    const res = await POST(makeRequest({ signature: "t=1,v1=ok" }));
    expect(res.status).toBe(200);
    expect(handleSubscriptionLifecycleMock).toHaveBeenCalledOnce();
    const callArgs = handleSubscriptionLifecycleMock.mock.calls[0]!;
    expect(callArgs[2]).toMatchObject({
      type: "invoice.payment_failed",
      data: invoice,
    });
  });

  it("returns 500 when STRIPE_WEBHOOK_SECRET is missing", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(makeRequest({ signature: "t=1,v1=ok" }));
    expect(res.status).toBe(500);
  });
});
