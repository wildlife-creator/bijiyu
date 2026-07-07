/**
 * メッセージスレッドの "actor identity" 抽象。
 *
 * Phase 2 (message-thread-org-pair) でスレッドの一意性を「席」ではなく
 * 「identity ペア」で定義する。個人ユーザーはそのユーザー ID が identity、
 * 組織所属者はその組織 ID が identity になる。これにより:
 *   - 個人⇔個人（受注者同士・発注者同士）
 *   - 個人⇔組織（従来の受注者⇔発注者）
 *   - 組織⇔組織（法人発注者同士など将来ケース）
 * を統一的に扱える。
 */

/**
 * スレッド上の一方の「アクター」を表す識別情報。
 * userId は常に存在する（participant_X_id）。
 * organizationId が非 null なら、この席は組織として振る舞う。
 */
export interface ThreadActorIdentity {
  /** participant_X_id（常に存在） */
  userId: string;
  /** organization_X_id。個人アクターは null */
  organizationId: string | null;
}

/**
 * identity 単位で比較・一意化するためのキー。
 * 組織所属なら organization_id、そうでなければ user_id を返す。
 * スレッド検索・重複判定で使う。
 */
export function actorIdentityKey(actor: ThreadActorIdentity): string {
  return actor.organizationId ?? actor.userId;
}

/**
 * 2 つの identity が同一実体を指すかを判定する。
 * organizationId が両方 non-null なら organizationId 比較、
 * どちらかが null なら userId 比較でも一致は起こらない（=別実体）とみなす。
 */
export function isSameActorIdentity(
  a: ThreadActorIdentity,
  b: ThreadActorIdentity,
): boolean {
  return actorIdentityKey(a) === actorIdentityKey(b);
}

/**
 * 2 つの identity ペアを順序無関係で比較する。
 * スレッドの一意性判定用: (A, B) と (B, A) を同一とみなす。
 */
export function areIdentityPairsEqual(
  pair1: readonly [ThreadActorIdentity, ThreadActorIdentity],
  pair2: readonly [ThreadActorIdentity, ThreadActorIdentity],
): boolean {
  const [a1, a2] = pair1;
  const [b1, b2] = pair2;
  return (
    (isSameActorIdentity(a1, b1) && isSameActorIdentity(a2, b2)) ||
    (isSameActorIdentity(a1, b2) && isSameActorIdentity(a2, b1))
  );
}
