import { z } from "zod";

/**
 * CLI-025（担当者新規作成）+ CLI-024（担当者編集）用バリデーション。
 *
 * R6 (proxy-account-multi-org-support): `is_proxy_account = true AND
 * org_role = 'admin'` の組み合わせは superRefine で拒否する。エラーパスは
 * フォームレベル集約 (master-area-multi-select の path 戦略準拠)。
 */

const NAME_MAX = 50;
const EMAIL_MAX = 254; // RFC 5321

export const memberErrorMessages = {
  proxyAdminCombination:
    "代理アカウントは担当者権限でのみ作成・編集できます",
} as const;

const lastName = z
  .string()
  .trim()
  .min(1, "姓を入力してください")
  .max(NAME_MAX, `姓は${NAME_MAX}文字以内で入力してください`);

const firstName = z
  .string()
  .trim()
  .min(1, "名を入力してください")
  .max(NAME_MAX, `名は${NAME_MAX}文字以内で入力してください`);

const email = z
  .string()
  .trim()
  .min(1, "メールアドレスを入力してください")
  .max(EMAIL_MAX, `メールアドレスは${EMAIL_MAX}文字以内で入力してください`)
  .email("メールアドレスの形式が正しくありません");

const orgRole = z.enum(["admin", "staff"]);

export const memberCreateSchema = z
  .object({
    lastName,
    firstName,
    email,
    orgRole,
    isProxyAccount: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.isProxyAccount === true && data.orgRole === "admin") {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: memberErrorMessages.proxyAdminCombination,
      });
    }
  });

export const memberUpdateSchema = z
  .object({
    lastName: lastName.optional(),
    firstName: firstName.optional(),
    email: email.optional(),
    orgRole: orgRole.optional(),
    isProxyAccount: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.isProxyAccount === true && data.orgRole === "admin") {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: memberErrorMessages.proxyAdminCombination,
      });
    }
  });

export type MemberCreateInput = z.infer<typeof memberCreateSchema>;
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;
