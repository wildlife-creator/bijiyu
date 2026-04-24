import { z } from "zod";

/**
 * CLI-025（担当者新規作成）+ CLI-024（担当者編集）用バリデーション。
 */

const NAME_MAX = 50;
const EMAIL_MAX = 254; // RFC 5321

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

export const memberCreateSchema = z.object({
  lastName,
  firstName,
  email,
  orgRole,
  isProxyAccount: z.boolean().default(false),
});

export const memberUpdateSchema = z.object({
  lastName: lastName.optional(),
  firstName: firstName.optional(),
  email: email.optional(),
  orgRole: orgRole.optional(),
  isProxyAccount: z.boolean().optional(),
});

export type MemberCreateInput = z.infer<typeof memberCreateSchema>;
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;
