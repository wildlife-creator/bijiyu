import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * スカウトの「受信者」判定（画面のボタン表示と Server Action の権限チェックで共用）。
 *
 * 【背景（ステージング指摘 No.33）】
 * 旧実装は「organization_X_id が null な side（個人 identity）に居る participant = 受注者 =
 * スカウト受信者」と決め打ちしていた。しかしビジ友は「1 アカウントで受注・発注の両方が
 * 可能」で、法人プランの会員（Owner）も職人一覧に出てスカウトを受けられる。会社同士で
 * スカウトすると両側が組織 identity になり、受信側にボタンが出ず、応答も
 * 「スカウトへの応答権限がありません」で拒否されていた。
 *
 * 新ルール: **スカウトを送った人が属する side の反対側にいる人が受信者**。
 * 個人⇔個人・個人⇔組織・組織⇔組織のいずれでも対称に動く。
 * 誰が「受ける／断る」を押せるかはこの集合で決め、担当者（staff）の除外は呼び出し側で
 * `users.role` を見て行う（受注者アクションは Owner のみ。roles-and-permissions.md）。
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export interface ThreadSides {
  participant_1_id: string;
  participant_2_id: string;
  organization_1_id: string | null;
  organization_2_id: string | null;
}

/**
 * スレッドの片側（組織 identity なら組織メンバー全員 + participant、個人 identity なら
 * participant のみ）の user id 集合。吹き出しの自分側 / 相手側判定にも使う。
 * 他組織のメンバーは RLS で読めないため admin client を受け取る。
 */
export async function resolveSideUserIds(
  admin: AdminClient,
  organizationId: string | null,
  participantId: string,
): Promise<string[]> {
  if (!organizationId) return [participantId];
  const { data } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId);
  return Array.from(
    new Set([participantId, ...(data ?? []).map((m) => m.user_id)]),
  );
}

/**
 * スカウトメッセージに応答できる user id 集合（= 送信者の反対側）を返す。
 *
 * 1. 送信者が side1 / side2 のどちらに属するかを user id 集合で判定し、反対側を返す
 * 2. 両側に属する・どちらにも属さない（組織を離れた元スタッフ等）場合は
 *    participant の一致で決める
 * 3. それでも決まらないとき、組織 identity が片側だけなら「スカウトは発注者（組織）側が
 *    送る」前提で個人側を受信者とみなす。両側同種なら判定不能として null を返す
 */
export async function resolveScoutRecipientUserIds(
  admin: AdminClient,
  thread: ThreadSides,
  scoutSenderId: string,
): Promise<string[] | null> {
  const [side1, side2] = await Promise.all([
    resolveSideUserIds(admin, thread.organization_1_id, thread.participant_1_id),
    resolveSideUserIds(admin, thread.organization_2_id, thread.participant_2_id),
  ]);

  const senderOnSide1 = side1.includes(scoutSenderId);
  const senderOnSide2 = side2.includes(scoutSenderId);
  if (senderOnSide1 && !senderOnSide2) return side2;
  if (senderOnSide2 && !senderOnSide1) return side1;

  if (thread.participant_1_id === scoutSenderId) return side2;
  if (thread.participant_2_id === scoutSenderId) return side1;

  const side1IsOrg = thread.organization_1_id !== null;
  const side2IsOrg = thread.organization_2_id !== null;
  if (side1IsOrg && !side2IsOrg) return side2;
  if (side2IsOrg && !side1IsOrg) return side1;
  return null;
}
