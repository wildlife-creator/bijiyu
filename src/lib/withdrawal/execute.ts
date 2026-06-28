import { getStripeClient } from "@/lib/billing/stripe";
import { getWithdrawalReasonLabel } from "@/lib/constants/profile-options";
import { applyDeletedSuffix } from "@/lib/email-recycle/apply-deleted-suffix";
import { sendEmail } from "@/lib/email/send-email";
import { accountCascadeFrozenProxyEmail } from "@/lib/email/templates/account-cascade-frozen-proxy";
import { accountCascadeFrozenStaffEmail } from "@/lib/email/templates/account-cascade-frozen-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils/format-date";

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

  // §8 prereq: cancelledBy に応じて applyDeletedSuffix の path を切り替える
  //   - contractor (本人退会) → self_withdrawal → §9.2 triggerLabel「退会」
  //   - admin (admin 強制削除)→ admin_force_delete → §9.2 triggerLabel「管理者による強制削除」
  const recyclePath =
    cancelledBy === "admin" ? "admin_force_delete" : "self_withdrawal";

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
      path: recyclePath,
      actorId: cancelledBy === "contractor" ? targetUserId : null,
      organizationId: orgMembership?.organization_id ?? null,
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

  // --- 組織カスケード（C案: organization spec Task 13.4 + §8 prereq cascade 修正） ---
  // Owner 退会時は組織ごとソフトデリートし、配下 Admin / Staff を本人種別に応じて処理。
  // §8 prereq (§8.5 関連): 代理 staff は他組織で代理継続中なら凍結しない (残存件数判定)。
  // §8.5 / §8.5.5: カスケード完了後に本人宛通知メールを fire-and-forget で送信。
  // client_profiles / scout_templates は削除せず保持（履歴）。
  if (orgMembership) {
    const orgId = orgMembership.organization_id;

    if (orgMembership.org_role === "owner") {
      // 配下メンバーの本人種別判定に必要な情報を一括取得。
      // applyDeletedSuffix 後は email が印付けで書き換わるため、ループ内ではなく
      // **事前に email + 姓名を取得しておく** (§8.5 / §8.5.5 メール本文用)。
      const { data: memberRows } = await admin
        .from("organization_members")
        .select("user_id, is_proxy_account")
        .eq("organization_id", orgId)
        .neq("user_id", targetUserId);

      const members = (memberRows ?? [])
        .filter((m): m is { user_id: string; is_proxy_account: boolean } =>
          typeof m.user_id === "string",
        );

      // メンバー本人の email + 姓名を一括取得 (印付け前に保持)
      const memberUserRows =
        members.length > 0
          ? (
              await admin
                .from("users")
                .select("id, email, last_name, first_name")
                .in(
                  "id",
                  members.map((m) => m.user_id),
                )
            ).data ?? []
          : [];
      const memberUserMap = new Map(
        memberUserRows.map((u) => [u.id as string, u]),
      );

      // §8.5 / §8.5.5 メール本文用に Owner 自身の名前と組織名を解決
      const [ownerUserRes, ownerProfileRes] = await Promise.all([
        admin
          .from("users")
          .select("last_name, first_name")
          .eq("id", targetUserId)
          .maybeSingle(),
        admin
          .from("client_profiles")
          .select("display_name")
          .eq("user_id", targetUserId)
          .maybeSingle(),
      ]);
      const ownerName =
        `${ownerUserRes.data?.last_name ?? ""}${ownerUserRes.data?.first_name ?? ""}`.trim() ||
        "管理責任者";
      const organizationName =
        ownerProfileRes.data?.display_name?.trim() || "ご所属組織";
      const withdrawnAt = formatDateTime(new Date().toISOString());

      // メンバー単位で path を決定し、freeze 実行 → メール用 spec を蓄積
      interface CascadeEmailSpec {
        to: string;
        recipientName: string;
        kind: "proxy" | "staff";
        hasRemainingMembership: boolean;
      }
      const emailSpecs: CascadeEmailSpec[] = [];

      for (const m of members) {
        const userRow = memberUserMap.get(m.user_id);
        const memberEmail = (userRow?.email as string | null) ?? "";
        const recipientName =
          `${userRow?.last_name ?? ""}${userRow?.first_name ?? ""}`.trim() ||
          "ご担当者";

        // 代理 staff のみ残存件数判定 (proxy-account-multi-org-support の
        // delete_staff_member v2 と同じロジック適用)。
        // 通常 staff / admin は 1 組織のみ在籍可能なので残存判定不要 = 常に全凍結。
        let hasRemaining = false;
        if (m.is_proxy_account === true) {
          const { count } = await admin
            .from("organization_members")
            .select("*", { count: "exact", head: true })
            .eq("user_id", m.user_id)
            .neq("organization_id", orgId);
          hasRemaining = (count ?? 0) > 0;
        }

        if (m.is_proxy_account === true && hasRemaining) {
          // §8.5.A-1: 代理 staff + 他組織残存 → この組織の org_members 行のみ削除、
          // users / auth はそのまま残す (他組織で代理業務継続)
          await admin
            .from("organization_members")
            .delete()
            .eq("user_id", m.user_id)
            .eq("organization_id", orgId);
        } else {
          // §8.5.A-2 (proxy + 残存なし) or §8.5.5 (regular staff/admin):
          // users.deleted_at セット + 印付け + ban で全凍結。
          // 通常 staff の org_members 行は既存パターンに従い保持 (admin 監査用)。
          // proxy A-2 でも保持で OK (グローバル凍結後に行が残っても影響なし)。
          await admin
            .from("users")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", m.user_id);
          try {
            await applyDeletedSuffix(admin, m.user_id, {
              path: recyclePath,
              actorId: targetUserId,
              organizationId: orgId,
            });
          } catch (e) {
            console.error(
              "[executeWithdrawal] applyDeletedSuffix unexpected throw (org cascade)",
              { memberId: m.user_id, error: e },
            );
          }
          try {
            await admin.auth.admin.updateUserById(m.user_id, {
              ban_duration: BAN_DURATION,
            });
          } catch (err) {
            console.error(
              "[executeWithdrawal] failed to ban org member (non-blocking)",
              { memberId: m.user_id, err },
            );
          }
        }

        if (memberEmail) {
          emailSpecs.push({
            to: memberEmail,
            recipientName,
            kind: m.is_proxy_account === true ? "proxy" : "staff",
            hasRemainingMembership: hasRemaining,
          });
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

      // §8.5 / §8.5.5 メール送信 (fire-and-forget で並列、失敗はログのみ)
      void Promise.all(
        emailSpecs.map(async (spec) => {
          try {
            const { subject, html } =
              spec.kind === "proxy"
                ? accountCascadeFrozenProxyEmail({
                    recipientName: spec.recipientName,
                    organizationName,
                    ownerName,
                    withdrawnAt,
                    hasRemainingMembership: spec.hasRemainingMembership,
                  })
                : accountCascadeFrozenStaffEmail({
                    recipientName: spec.recipientName,
                    organizationName,
                    ownerName,
                    withdrawnAt,
                  });
            await sendEmail({ to: spec.to, subject, html });
          } catch (err) {
            console.error(
              "[executeWithdrawal] §8.5 / §8.5.5 cascade email failed (non-blocking)",
              { to: spec.to, kind: spec.kind, err },
            );
          }
        }),
      ).catch((err) =>
        console.error(
          "[executeWithdrawal] cascade email Promise.all threw (non-blocking)",
          err,
        ),
      );
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
