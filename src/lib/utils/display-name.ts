/**
 * Return a display name for a user, handling soft-deleted accounts.
 * When `deletedAt` is set the real name is replaced with "退会済みユーザー".
 */
export function getUserDisplayName(
  user: {
    lastName?: string | null;
    firstName?: string | null;
    companyName?: string | null;
    deletedAt?: string | null;
  },
  mode: "full" | "company" = "full",
): string {
  if (user.deletedAt) {
    return "退会済みユーザー";
  }

  if (mode === "company") {
    return user.companyName || "未設定";
  }

  const last = user.lastName ?? "";
  const first = user.firstName ?? "";
  return last || first ? `${last} ${first}`.trim() : "未設定";
}

/**
 * Resolve a participant's display name for messaging UI and email notifications.
 *
 * Priority:
 * 1. organizationName — corporate plan users (shared across all org members)
 * 2. companyName — individual/small plan users' trade name (屋号)
 * 3. lastName + firstName — personal name fallback
 *
 * For email greetings (recipient), use getUserDisplayName() with mode "full" instead.
 */
export function resolveParticipantName(participant: {
  organizationName?: string | null;
  companyName?: string | null;
  lastName?: string | null;
  firstName?: string | null;
  deletedAt?: string | null;
}): string {
  if (participant.deletedAt) {
    return "退会済みユーザー";
  }

  if (participant.organizationName) {
    return participant.organizationName;
  }

  if (participant.companyName) {
    return participant.companyName;
  }

  const last = participant.lastName ?? "";
  const first = participant.firstName ?? "";
  return last || first ? `${last}${first}` : "退会済みユーザー";
}
