"use server";

import { createClient } from "@/lib/supabase/server";
import { signupEmailSchema } from "@/lib/validations/auth";
import type { ActionResult } from "@/lib/types/action-result";

export async function signupAction(formData: FormData): Promise<ActionResult> {
  const raw = { email: formData.get("email") };

  const parsed = signupEmailSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "正しいメールアドレスを入力してください" };
  }

  const { email } = parsed.data;
  const supabase = await createClient();

  // Generate a crypto-random temporary password (64+ chars)
  const tempPassword = crypto.randomUUID() + crypto.randomUUID();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  await supabase.auth.signUp({
    email,
    password: tempPassword,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  // Always return success to prevent account enumeration
  return { success: true };
}
