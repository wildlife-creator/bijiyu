import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  FEE_COOKIE_NAME,
  getFeeCookieOptions,
  readFeeCookie,
  sealFeeCookie,
} from "@/lib/billing/fee-cookie";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.SESSION_SECRET =
    "test_session_secret_at_least_32_characters_long_for_iron_session";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("fee cookie helpers", () => {
  it("uses the documented cookie name", () => {
    expect(FEE_COOKIE_NAME).toBe("bijiyu_fee");
  });

  it("default options are httpOnly, lax and path '/'", () => {
    const options = getFeeCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBe(24 * 60 * 60);
  });

  it("seals and re-opens a fee=free payload", async () => {
    const sealed = await sealFeeCookie({ feeExempt: true });
    expect(typeof sealed).toBe("string");
    expect(sealed.length).toBeGreaterThan(0);

    const opened = await readFeeCookie(sealed);
    expect(opened).not.toBeNull();
    expect(opened?.feeExempt).toBe(true);
    expect(typeof opened?.expiresAt).toBe("number");
  });

  it("returns null for missing/empty cookie value", async () => {
    expect(await readFeeCookie(undefined)).toBeNull();
    expect(await readFeeCookie(null)).toBeNull();
    expect(await readFeeCookie("")).toBeNull();
  });

  it("returns null for tampered/garbage cookie value", async () => {
    expect(await readFeeCookie("not-a-valid-sealed-value")).toBeNull();
  });

  it("throws when SESSION_SECRET is missing", async () => {
    delete process.env.SESSION_SECRET;
    await expect(sealFeeCookie({ feeExempt: true })).rejects.toThrow(
      /SESSION_SECRET/,
    );
  });

  it("throws when SESSION_SECRET is too short", async () => {
    process.env.SESSION_SECRET = "short";
    await expect(sealFeeCookie({ feeExempt: true })).rejects.toThrow(
      /SESSION_SECRET/,
    );
  });

  it("returns null when stored expiresAt is in the past", async () => {
    const sealed = await sealFeeCookie({
      feeExempt: true,
      expiresAt: Date.now() - 1000,
    });
    expect(await readFeeCookie(sealed)).toBeNull();
  });
});
