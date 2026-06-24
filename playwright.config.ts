import { defineConfig } from "@playwright/test";
import { config } from "dotenv";

// proxy-account-multi-org-support Phase 8 / Task 8.3:
// Stripe webhook シミュレーション（handle_subscription_lifecycle_deleted RPC
// 直接呼び出し）で SUPABASE_SERVICE_ROLE_KEY を使うため、`.env.local` を
// process.env にロードする。Next.js dev server とは独立に Playwright 単独で
// 実行されるためここで明示的にロードが必要。
config({ path: ".env.local" });

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
