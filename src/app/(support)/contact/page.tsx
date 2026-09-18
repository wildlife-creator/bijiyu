import { createClient } from "@/lib/supabase/server";
import {
  EMPTY_CONTACT_PREFILL,
  resolveContactPrefill,
} from "@/lib/support/contact-prefill";

import { ContactForm } from "./contact-form";

/**
 * COM-008 お問い合わせ（Server Component）。
 * ログイン中なら会員情報をフォームの初期値にし、銀行振込の選択肢を出す。
 * 未ログインでも送信できる（銀行振込以外）。
 */
export default async function ContactPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const prefill = user
    ? await resolveContactPrefill(supabase, user.id)
    : EMPTY_CONTACT_PREFILL;

  return <ContactForm isLoggedIn={!!user} prefill={prefill} />;
}
