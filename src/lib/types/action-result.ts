/**
 * Standard return type for all Server Actions.
 * On success, optionally carries data of type T.
 * On failure, carries a user-facing error message (Japanese).
 */
export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };
