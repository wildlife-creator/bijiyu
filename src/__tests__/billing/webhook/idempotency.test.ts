import { describe, expect, it, vi } from "vitest";

import { withWebhookIdempotency } from "@/lib/billing/webhook/idempotency";

/**
 * Build a fake Supabase admin client that records every chained call so we
 * can assert what the idempotency guard did. Each .from() returns a builder
 * with thenable maybeSingle() / insert / update.
 *
 * The fake exposes:
 *   - mockEvent({status}|null) → next maybeSingle() returns this
 *   - insertResult({error?}) → next insert() returns this
 *   - updateResults: queue of update() return values
 *   - calls: ordered log of operations
 */
type Status = "processing" | "completed" | "failed";

interface FakeOptions {
  initialRow: { status: Status } | null;
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
}

function makeFakeAdmin(opts: FakeOptions) {
  const calls: Array<{ op: string; payload?: unknown }> = [];

  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn((payload: unknown) => {
      calls.push({ op: "insert", payload });
      return Promise.resolve({ error: opts.insertError ?? null });
    }),
    update: vi.fn((payload: unknown) => {
      calls.push({ op: "update", payload });
      const chain = {
        eq: vi.fn(() => Promise.resolve({ error: opts.updateError ?? null })),
      };
      return chain;
    }),
    maybeSingle: vi.fn(() => {
      calls.push({ op: "select" });
      return Promise.resolve({
        data: opts.initialRow,
        error: null,
      });
    }),
  };

  const admin = {
    from: vi.fn(() => builder),
  };

  return { admin: admin as never, builder, calls };
}

const FAKE_EVENT = { id: "evt_test_001", type: "checkout.session.completed" };

describe("withWebhookIdempotency", () => {
  it("skips when the row already has status='completed'", async () => {
    const { admin } = makeFakeAdmin({ initialRow: { status: "completed" } });
    const handler = vi.fn();

    const result = await withWebhookIdempotency(admin, FAKE_EVENT, handler);

    expect(result).toEqual({
      skipped: true,
      skippedReason: "already_completed",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("skips when the row is in status='processing' (stuck or parallel)", async () => {
    const { admin } = makeFakeAdmin({ initialRow: { status: "processing" } });
    const handler = vi.fn();

    const result = await withWebhookIdempotency(admin, FAKE_EVENT, handler);

    expect(result).toEqual({
      skipped: true,
      skippedReason: "stuck_processing",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("skips with concurrent_insert when INSERT loses the UNIQUE race", async () => {
    const { admin } = makeFakeAdmin({
      initialRow: null,
      insertError: { message: "duplicate key value violates unique constraint" },
    });
    const handler = vi.fn();

    const result = await withWebhookIdempotency(admin, FAKE_EVENT, handler);

    expect(result).toEqual({
      skipped: true,
      skippedReason: "concurrent_insert",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("inserts processing row, runs handler and marks completed on success", async () => {
    const { admin, calls } = makeFakeAdmin({ initialRow: null });
    const handler = vi.fn(async () => {
      // pretend it does work
    });

    const result = await withWebhookIdempotency(admin, FAKE_EVENT, handler);

    expect(result.skipped).toBe(false);
    expect(handler).toHaveBeenCalledOnce();

    // Should have done: select, insert(processing), update(completed)
    const ops = calls.map((c) => c.op);
    expect(ops).toEqual(["select", "insert", "update"]);

    const insertCall = calls.find((c) => c.op === "insert");
    expect(insertCall?.payload).toMatchObject({
      stripe_event_id: FAKE_EVENT.id,
      event_type: FAKE_EVENT.type,
      status: "processing",
    });

    const updateCall = calls.find((c) => c.op === "update");
    const payload = updateCall?.payload as { status: string; processed_at: string };
    expect(payload.status).toBe("completed");
    expect(typeof payload.processed_at).toBe("string");
  });

  it("marks the row as failed when the handler throws", async () => {
    const { admin, calls } = makeFakeAdmin({ initialRow: null });
    const handler = vi.fn(async () => {
      throw new Error("RPC blew up");
    });

    const result = await withWebhookIdempotency(admin, FAKE_EVENT, handler);

    expect(result).toEqual({ skipped: false, skippedReason: "handler_failed" });

    // operations: select, insert(processing), update(failed)
    expect(calls.map((c) => c.op)).toEqual(["select", "insert", "update"]);

    const failedUpdate = calls.find((c) => c.op === "update");
    const payload = failedUpdate?.payload as {
      status: string;
      error_message: string;
    };
    expect(payload.status).toBe("failed");
    expect(payload.error_message).toContain("RPC blew up");
  });

  it("retries a previously failed row by flipping it back to processing", async () => {
    const { admin, calls } = makeFakeAdmin({ initialRow: { status: "failed" } });
    const handler = vi.fn(async () => {
      // success this time
    });

    const result = await withWebhookIdempotency(admin, FAKE_EVENT, handler);

    expect(result.skipped).toBe(false);
    expect(handler).toHaveBeenCalledOnce();

    // operations: select, update(processing), update(completed)
    expect(calls.map((c) => c.op)).toEqual(["select", "update", "update"]);
  });

  it("truncates very long error messages to 1000 chars", async () => {
    const { admin, calls } = makeFakeAdmin({ initialRow: null });
    const longMessage = "x".repeat(2000);
    const handler = vi.fn(async () => {
      throw new Error(longMessage);
    });

    await withWebhookIdempotency(admin, FAKE_EVENT, handler);

    const failedUpdate = calls
      .filter((c) => c.op === "update")
      .pop();
    const payload = failedUpdate?.payload as { error_message: string };
    expect(payload.error_message.length).toBeLessThanOrEqual(1000);
  });
});
