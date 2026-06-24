import { getStripeClient } from "@/lib/billing/stripe";
import { getWithdrawalReasonLabel } from "@/lib/constants/profile-options";
import { applyDeletedSuffix } from "@/lib/email-recycle/apply-deleted-suffix";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * C案カスケード退会の共有関数（admin spec Task 3.4 で withdrawAction から抽出）。
 *
 * 本人退会（withdrawAction）と admin によるアカウント削除
 * （deleteClientAccountAction / deleteUserAccountAction）の両方から呼ばれる。
 *
 * 【契約の要点】
 * - 退会前ガード（applied/accepted 応募あり・受注者作業中の案件あり → 拒否）は
 *   本人退会・admin 削除の両方で適用する。admin はまず ADM-014 の発注取消等で
 *   進行中の取引を整理してから削除する運用（エラー文言は admin 画面にそのまま表示）
 * - DB 書き込みはすべて createAdminClient()（service_role）で行う
 *   （本人セッションが無い admin 削除でも動作させるため）
 * - カスケード内で cancelled にする応募に cancelledBy を記録する
 * - Stripe 解約（stripe.subscriptions.cancel）の失敗は削除をブロックしない（ログのみ）
 * - セッションの signOut・退会完了メールは呼び出し側の責務
 *   （本人退会: 両方実行 ／ admin 削除: どちらも行わない。admin のセッションを
 *   誤って切らない・強制削除相手に「退会手続き完了」メールを送らない）
 */

/** 退会理由 survey の入力（本人退会のみ。admin 削除では渡さない） */
export interface WithdrawalSurveyInput {
  reasonCode: string;
  details: string | null;
}

const BAN_DURATION = "876600h"; // 約100年 = 恒久 ban

export async function executeWithdrawal(params: {
  targetUserId: string;
  /** 退会理由 survey を記録する場合に渡す（本人退会のみ） */
  recordSurvey?: WithdrawalSurveyInput | null;
  /** カスケードで cancelled になる応募に記録する主体 */
  cancelledBy: "contractor" | "admin";
}): Promise<{ success: true } | { success: false; error: string }> {
  const { targetUserId, recordSurvey, cancelledBy } = params;
  const admin = createAdminClient();

  // --- Guard 1: 応募者としての進行中応募 ---
  const { count: activeApplicationCount } = await admin
    .from("applications")
    .select("*", { count: "exact", head: true })
    .eq("applicant_id", targetUserId)
    .in("status", ["applied", "accepted"]);

  if (activeApplicationCount && activeApplicationCount > 0) {
    return {
      success: false,
      error:
        "応募中または進行中の案件があるため退会できません。応募の取り下げまたは完了後に再度お試しください。",
    };
  }

  // --- 組織メンバーシップ（以降の accepted 応募チェック範囲の判定に使う） ---
  const { data: orgMembership } = await admin
    .from("organization_members")
    .select("org_role, organization_id")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (orgMembership && orgMembership.org_role !== "owner") {
    return {
      success: false,
      error:
        "法人プランの管理責任者のみ退会手続きが可能です。管理責任者にお問い合わせください。",
    };
  }

  // --- Guard 2: 発注責任者としての進行中案件 ---
  //    - 個人発注者 / 小規模プラン Owner（組織無し）: jobs.owner_id = target
  //    - 法人プラン Owner: 組織全体の案件 (jobs.organization_id = org.id)
  let ownedJobQuery = admin
    .from("applications")
    .select("id, jobs!inner(owner_id, organization_id)")
    .eq("status", "accepted");

  if (orgMembership?.org_role === "owner" && orgMembership.organization_id) {
    ownedJobQuery = ownedJobQuery.eq(
      "jobs.organization_id",
      orgMembership.organization_id,
    );
  } else {
    ownedJobQuery = ownedJobQuery.eq("jobs.owner_id", targetUserId);
  }

  const { data: ownedJobApplications } = await ownedJobQuery;

  if (ownedJobApplications && ownedJobApplications.length > 0) {
    return {
      success: false,
      error:
        "受注者が作業中の案件があるため退会できません。案件の完了後に再度お試しください。",
    };
  }

  // --- 事前読み取り（cancel 前に Stripe id と plan_type を確保する） ---
  const { data: activeSubs } = await admin
    .from("subscriptions")
    .select("plan_type, stripe_subscription_id")
    .eq("user_id", targetUserId)
    .in("status", ["active", "past_due"]);

  const { data: activeOptions } = await admin
    .from("option_subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", targetUserId)
    .eq("status", "active");

  // --- 退会理由 survey（本人退会のみ。保存失敗は退会をブロックしない） ---
  if (recordSurvey) {
    try {
      const { data: snapshotUser } = await admin
        .from("users")
        .select("role")
        .eq("id", targetUserId)
        .maybeSingle();

      const { error: surveyError } = await admin
        .from("withdrawal_surveys")
        .insert({
          user_id: targetUserId,
          reason_code: recordSurvey.reasonCode,
          reason_label:
            getWithdrawalReasonLabel(recordSurvey.reasonCode) ??
            recordSurvey.reasonCode,
          details: recordSurvey.details,
          role: snapshotUser?.role ?? null,
          plan_type: activeSubs?.[0]?.plan_type ?? null,
        });
      if (surveyError) {
        console.error(
          "[executeWithdrawal] withdrawal survey insert failed (non-blocking)",
          surveyError,
        );
      }
    } catch (surveyError) {
      console.error(
        "[executeWithdrawal] withdrawal survey capture failed (non-blocking)",
        surveyError,
      );
    }
  }

  // --- カスケード本体 ---

  // 対象ユーザーのソフトデリート
  await admin
    .from("users")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", targetUserId);

  // Task 9: 印付けで元 email を解放（同メール再登録経路の常時開通）。
  // 順序: 印付け → ban の順（防御的、逆でも機能する）。
  // 失敗時も退会自体は継続させるため try/catch で隔離。
  try {
    await applyDeletedSuffix(admin, targetUserId, {
      path: "self_withdrawal",
      actorId: cancelledBy === "contractor" ? targetUserId : null,
    });
  } catch (e) {
    console.error("[executeWithdrawal] applyDeletedSuffix unexpected throw", {
      targetUserId,
      error: e,
    });
  }

  // 募集中・下書き案件のクローズ
  await admin
    .from("jobs")
    .update({ status: "closed" })
    .eq("owner_id", targetUserId)
    .in("status", ["draft", "open"]);

  // 応募のキャンセル（実行者を記録。Guard 1 通過後の保険＝レース対策）
  await admin
    .from("applications")
    .update({ status: "cancelled", cancelled_by: cancelledBy })
    .eq("applicant_id", targetUserId)
    .in("status", ["applied", "accepted"]);

  // サブスクリプションの DB 上の解約
  await admin
    .from("subscriptions")
    .update({ status: "cancelled" })
    .eq("user_id", targetUserId)
    .in("status", ["active", "past_due"]);

  // オプションの DB 上の解約
  await admin
    .from("option_subscriptions")
    .update({ status: "cancelled" })
    .eq("user_id", targetUserId)
    .eq("status", "active");

  // --- 組織カスケード（C案: organization spec Task 13.4） ---
  // Owner 退会時は組織ごとソフトデリートし、配下 Admin / Staff の
  // users.deleted_at も連動設定してログイン不可化。
  // client_profiles / scout_templates は削除せず保持（履歴）。
  if (orgMembership) {
    const orgId = orgMembership.organization_id;

    if (orgMembership.org_role === "owner") {
      const { data: memberRows } = await admin
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId)
        .neq("user_id", targetUserId);

      const memberIds = (memberRows ?? [])
        .map((m) => m.user_id as string)
        .filter(Boolean);

      if (memberIds.length > 0) {
        await admin
          .from("users")
          .update({ deleted_at: new Date().toISOString() })
          .in("id", memberIds);
      }

      // Task 9: 配下メンバーごとに「印付け → ban」の順で適用。
      // 印付けは Owner 退会カスケードの actor = targetUserId (退会する Owner)。
      // ban は public.users.deleted_at だけでは auth 側 signin が通ってしまうため
      // 即時ブロック用に必須。
      for (const memberId of memberIds) {
        try {
          await applyDeletedSuffix(admin, memberId, {
            path: "self_withdrawal",
            actorId: targetUserId,
          });
        } catch (e) {
          console.error(
            "[executeWithdrawal] applyDeletedSuffix unexpected throw (org cascade)",
            { memberId, error: e },
          );
        }
        try {
          await admin.auth.admin.updateUserById(memberId, {
            ban_duration: BAN_DURATION,
          });
        } catch (err) {
          console.error(
            "[executeWithdrawal] failed to ban org member (non-blocking)",
            { memberId, err },
          );
        }
      }

      // organization_members は **意図的に残す**（B 案・admin 監査表示用）。
      // 組織自体は deleted_at で論理削除し、organizations.deleted_at を絞り込む
      // 既存クエリで自然と除外される。残したメンバー行は退会済み user を
      // 旧所属組織に紐づける履歴として admin の発注者一覧で会社名表示に使う。
      // 個別退会（else 節）は従来通り削除する（プラン slot を解放するため）。
      await admin
        .from("organizations")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", orgId);
    } else {
      // Owner 以外（現在は上部ガードで到達不可だが将来の仕様変更に備える）
      await admin
        .from("organization_members")
        .delete()
        .eq("user_id", targetUserId);
    }
  }

  // --- Stripe 解約（新規実装。失敗は削除をブロックしない） ---
  // one_time オプションは stripe_subscription_id が NULL（CHECK 制約）のため
  // filter で自然に除外される
  const stripeSubscriptionIds = [
    ...(activeSubs ?? []).map((s) => s.stripe_subscription_id),
    ...(activeOptions ?? []).map((o) => o.stripe_subscription_id),
  ].filter((id): id is string => Boolean(id));

  if (stripeSubscriptionIds.length > 0) {
    try {
      const stripe = getStripeClient();
      for (const subscriptionId of new Set(stripeSubscriptionIds)) {
        try {
          await stripe.subscriptions.cancel(subscriptionId);
        } catch (err) {
          console.error(
            "[executeWithdrawal] stripe cancel failed (non-blocking)",
            { subscriptionId, err },
          );
        }
      }
    } catch (err) {
      console.error(
        "[executeWithdrawal] stripe client unavailable (non-blocking)",
        err,
      );
    }
  }

  // --- 対象本人の auth ban（ログイン不可化） ---
  await admin.auth.admin.updateUserById(targetUserId, {
    ban_duration: BAN_DURATION,
  });

  return { success: true };
}
