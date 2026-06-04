import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { BulkSendForm } from "./bulk-send-form";

interface Recipient {
  id: string;
  name: string;
}

interface ThreadParticipant {
  id: string;
  last_name: string | null;
  first_name: string | null;
}

/**
 * CLI-014 一斉送信
 *
 * 宛先候補の収集をサーバー側で会社単位に行う:
 * - 組織所属の発注者（Owner / Admin / Staff）: 自組織の全スレッド（message_threads.organization_id）の
 *   相手＝職人（participant_2）を候補にする。担当者が始めた会話の相手も会社として宛先に出る。
 * - 個人発注者: 従来どおり自分が当事者であるスレッドの相手のみ。
 *
 * メッセージ系の RLS は既に is_same_org で組織対応済み。送信処理（sendBulkMessagesAction）も
 * 既に org 単位でスレッドを検索するため、ここでは宛先収集の絞り込みのみを会社単位にする。
 */
export default async function BulkSendPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: orgMember } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const organizationId = orgMember?.organization_id ?? null;

  let threadsQuery = supabase
    .from("message_threads")
    .select(
      `id, participant_1_id, participant_2_id,
       participant_1:users!message_threads_participant_1_id_fkey(id, last_name, first_name),
       participant_2:users!message_threads_participant_2_id_fkey(id, last_name, first_name)`,
    );
  threadsQuery = organizationId
    ? threadsQuery.eq("organization_id", organizationId)
    : threadsQuery.or(
        `participant_1_id.eq.${user.id},participant_2_id.eq.${user.id}`,
      );
  const { data: threads } = await threadsQuery;

  const recipientMap = new Map<string, string>();
  for (const thread of threads ?? []) {
    const p1 = thread.participant_1 as unknown as ThreadParticipant | null;
    const p2 = thread.participant_2 as unknown as ThreadParticipant | null;

    // 相手（職人）の特定:
    //  - 組織スレッド: 相手は常に participant_2（職人）。participant_1 は発注者側（誰でも）。
    //    送信側 sendBulkMessagesAction も participant_2_id でスレッドを引くため整合する。
    //  - 個人スレッド: 自分でない側を相手とする。
    const other = organizationId
      ? p2
      : thread.participant_1_id === user.id
        ? p2
        : p1;

    if (other && !recipientMap.has(other.id)) {
      const name =
        `${other.last_name || ""}${other.first_name || ""}`.trim() ||
        "退会済みユーザー";
      recipientMap.set(other.id, name);
    }
  }

  const recipients: Recipient[] = Array.from(recipientMap.entries()).map(
    ([id, name]) => ({ id, name }),
  );

  return <BulkSendForm recipients={recipients} />;
}
