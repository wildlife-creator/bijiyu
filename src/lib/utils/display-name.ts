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
