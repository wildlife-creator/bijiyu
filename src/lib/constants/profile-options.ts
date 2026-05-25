/**
 * Option constants for profile-related forms.
 */

// ---------------------------------------------------------------------------
// Withdrawal reasons (COM-006)
// ---------------------------------------------------------------------------
export const WITHDRAWAL_REASONS = [
  "利用する機会がなくなった",
  "他のサービスを利用するため",
  "使い方がわからなかった",
  "希望する案件が見つからなかった",
  "サービスの品質に不満がある",
  "その他",
] as const;
export type WithdrawalReason = (typeof WITHDRAWAL_REASONS)[number];
