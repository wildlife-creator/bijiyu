import type { PaidPlanType } from "@/lib/constants/plans";

/**
 * 管理運営アカウント（P5 / spec-changes-202608 §2.4, D10）の定数。
 * 設定 Action（`src/app/admin/(protected)/users/[id]/ops-account-actions.ts`）と
 * テストが共有する。
 */

/** 管理運営アカウントの契約プラン（最上位 = ハイエンド）。 */
export const OPS_ACCOUNT_PLAN_TYPE: PaidPlanType = "corporate_premium";

/** 手動サブスクの有効期限（実質無期限。期限バッジ・期限通知は 30 日前まで発火しない）。 */
export const OPS_ACCOUNT_PERIOD_END_DATE = "2099-12-31";
