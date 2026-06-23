import { describe, expect, it } from "vitest";

import {
  memberCreateSchema,
  memberUpdateSchema,
  memberErrorMessages,
} from "@/lib/validations/member";

/**
 * proxy-account-multi-org-support Phase 1 (Task 1.3 / 1.5)
 *
 * R6: `is_proxy_account = true AND org_role = 'admin'` の組み合わせは
 * Zod superRefine で拒否される。エラーパスはフォームレベル集約
 * (master-area-multi-select の path 戦略準拠) で `errors.<field>.message`
 * からは見えないが、`error.issues` には必ず該当メッセージが含まれる。
 */

describe("memberCreateSchema", () => {
  const baseValid = {
    lastName: "山田",
    firstName: "太郎",
    email: "test@example.com",
    orgRole: "staff" as const,
    isProxyAccount: false,
  };

  describe("正常系", () => {
    it("代理 OFF + admin を受理する", () => {
      const result = memberCreateSchema.safeParse({
        ...baseValid,
        orgRole: "admin",
        isProxyAccount: false,
      });
      expect(result.success).toBe(true);
    });

    it("代理 ON + staff を受理する", () => {
      const result = memberCreateSchema.safeParse({
        ...baseValid,
        orgRole: "staff",
        isProxyAccount: true,
      });
      expect(result.success).toBe(true);
    });

    it("代理 OFF + staff を受理する", () => {
      const result = memberCreateSchema.safeParse({
        ...baseValid,
        orgRole: "staff",
        isProxyAccount: false,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("R6: 代理 ON + admin の組み合わせを拒否する", () => {
    it("safeParse が失敗する", () => {
      const result = memberCreateSchema.safeParse({
        ...baseValid,
        orgRole: "admin",
        isProxyAccount: true,
      });
      expect(result.success).toBe(false);
    });

    it("メッセージ proxyAdminCombination を返す", () => {
      const result = memberCreateSchema.safeParse({
        ...baseValid,
        orgRole: "admin",
        isProxyAccount: true,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msgs = result.error.issues.map((i) => i.message);
        expect(msgs).toContain(memberErrorMessages.proxyAdminCombination);
      }
    });
  });
});

describe("memberUpdateSchema", () => {
  describe("正常系", () => {
    it("部分更新（lastName のみ）を受理する", () => {
      const result = memberUpdateSchema.safeParse({ lastName: "新姓" });
      expect(result.success).toBe(true);
    });

    it("代理 OFF + admin を受理する", () => {
      const result = memberUpdateSchema.safeParse({
        orgRole: "admin",
        isProxyAccount: false,
      });
      expect(result.success).toBe(true);
    });

    it("代理 ON + staff を受理する", () => {
      const result = memberUpdateSchema.safeParse({
        orgRole: "staff",
        isProxyAccount: true,
      });
      expect(result.success).toBe(true);
    });

    it("isProxyAccount だけ ON / orgRole 未指定を受理する", () => {
      // 既存メンバーの権限が staff のまま代理 ON するケース
      const result = memberUpdateSchema.safeParse({ isProxyAccount: true });
      expect(result.success).toBe(true);
    });

    it("orgRole だけ admin / isProxyAccount 未指定を受理する", () => {
      // 既存メンバー(代理ではない)の権限変更ケース
      const result = memberUpdateSchema.safeParse({ orgRole: "admin" });
      expect(result.success).toBe(true);
    });
  });

  describe("R6: 代理 ON + admin の組み合わせを拒否する", () => {
    it("両方明示指定で拒否する", () => {
      const result = memberUpdateSchema.safeParse({
        orgRole: "admin",
        isProxyAccount: true,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msgs = result.error.issues.map((i) => i.message);
        expect(msgs).toContain(memberErrorMessages.proxyAdminCombination);
      }
    });
  });
});
