import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Create a Supabase client with the service_role key.
 * This client bypasses RLS — use ONLY in server-side code
 * (Server Actions, Route Handlers, Edge Functions).
 *
 * Never expose this client or its key to the browser.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
