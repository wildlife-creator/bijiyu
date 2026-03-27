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

// ---------------------------------------------------------------------------
// Contact types (COM-008)
// ---------------------------------------------------------------------------
export const CONTACT_TYPES = [
  "サービスについて",
  "アカウントについて",
  "課金・お支払いについて",
  "不具合の報告",
  "その他",
] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];
