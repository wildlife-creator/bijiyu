import { z } from "zod";

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "メールアドレスを入力してください")
    .email("正しいメールアドレスを入力してください"),
  password: z.string().min(1, "パスワードを入力してください"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Signup (email-only step)
// ---------------------------------------------------------------------------
export const signupEmailSchema = z.object({
  email: z
    .string()
    .min(1, "メールアドレスを入力してください")
    .email("正しいメールアドレスを入力してください"),
});
export type SignupEmailInput = z.infer<typeof signupEmailSchema>;

// ---------------------------------------------------------------------------
// Reset password request
// ---------------------------------------------------------------------------
export const resetPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "メールアドレスを入力してください")
    .email("正しいメールアドレスを入力してください"),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ---------------------------------------------------------------------------
// Update password (set new password)
// ---------------------------------------------------------------------------
export const updatePasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "パスワードは8文字以上で入力してください"),
    confirmPassword: z.string().min(1, "確認用パスワードを入力してください"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "パスワードが一致しません",
    path: ["confirmPassword"],
  });
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;

// ---------------------------------------------------------------------------
// Skill entry (nested in registerProfileSchema)
// ---------------------------------------------------------------------------
const skillSchema = z.object({
  tradeType: z.string().min(1, "職種を選択してください"),
  experienceYears: z
    .number({ error: "経験年数は数値で入力してください" }),
});

// ---------------------------------------------------------------------------
// Register profile (onboarding after email verification)
// ---------------------------------------------------------------------------
// Base shape (used by server action without confirmPassword)
const registerProfileBaseSchema = z.object({
  lastName: z.string().min(1, "姓を入力してください"),
  firstName: z.string().min(1, "名を入力してください"),
  gender: z.string().min(1, "性別を選択してください"),
  birthDate: z.string().min(1, "生年月日を入力してください"),
  prefecture: z.string().min(1, "都道府県を選択してください"),
  companyName: z.string().optional(),
  skills: z
    .array(skillSchema)
    .min(1, "スキルを1つ以上追加してください")
    .max(3, "スキルは3つまで登録できます"),
  availableAreas: z
    .array(z.string().min(1, "対応エリアを選択してください"))
    .min(1, "対応エリアを1つ以上選択してください"),
  password: z
    .string()
    .min(8, "パスワードは8文字以上で入力してください")
    .max(16, "パスワードは16文字以内で入力してください"),
});

// Server-side schema (no confirmPassword needed)
export const registerProfileSchema = registerProfileBaseSchema;
export type RegisterProfileInput = z.infer<typeof registerProfileSchema>;

// Client-side schema with confirmPassword and matching validation
export const registerProfileFormSchema = registerProfileBaseSchema
  .extend({
    confirmPassword: z.string().min(1, "確認用パスワードを入力してください"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "パスワードが一致しません",
    path: ["confirmPassword"],
  });
export type RegisterProfileFormInput = z.infer<typeof registerProfileFormSchema>;
