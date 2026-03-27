"use server";

import { createClient } from "@/lib/supabase/server";
import { contactSchema } from "@/lib/validations/profile";
import type { ActionResult } from "@/lib/types/action-result";

const MAX_SUBMISSIONS_PER_HOUR = 5;

export async function submitContactAction(
  formData: FormData,
): Promise<ActionResult> {
  // Parse and validate form data
  const raw = {
    lastName: formData.get("lastName"),
    firstName: formData.get("firstName"),
    email: formData.get("email"),
    contactTypes: formData.getAll("contactTypes"),
    content: formData.get("content"),
  };

  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "入力内容を確認してください";
    return { success: false, error: firstError };
  }

  const { lastName, firstName, email, contactTypes, content } = parsed.data;

  const supabase = await createClient();

  // Simple rate limiting: check submissions from same email in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error: countError } = await supabase
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", oneHourAgo);

  if (countError) {
    return {
      success: false,
      error: "送信中にエラーが発生しました。しばらくしてから再度お試しください。",
    };
  }

  if (count !== null && count >= MAX_SUBMISSIONS_PER_HOUR) {
    return {
      success: false,
      error: "送信回数の上限に達しました。しばらくしてから再度お試しください。",
    };
  }

  // Insert contact record
  const { error: insertError } = await supabase.from("contacts").insert({
    last_name: lastName,
    first_name: firstName,
    email,
    contact_types: contactTypes,
    content,
  });

  if (insertError) {
    return {
      success: false,
      error: "送信中にエラーが発生しました。しばらくしてから再度お試しください。",
    };
  }

  return { success: true };
}
