import { describe, expect, it } from "vitest";

import { hasReview } from "@/lib/utils/has-review";

describe("hasReview", () => {
  it.each([
    [null, false],
    [undefined, false],
    [[], false],
    [[{ id: "r1" }], true],
    [{ id: "r1" }, true],
  ])("%j → %s", (value, expected) => {
    expect(hasReview(value)).toBe(expected);
  });
});
