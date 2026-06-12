"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { maskEmail, writeAuditLog } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types/action-result";

const clientInviteSchema = z.object({
  companyName: z
    .string()
    .min(1, "発注者名（会社名）を入力してください")
    .max(100, "発注者名は100文字以内で入力してください"),
  lastName: z
    .string()
    .min(1, "担当者の姓を入力してください")
    .max(50, "姓は50文字以内で入力してください"),
  firstName: z
    .string()
    .min(1, "担当者の名を入力してください")
    .max(50, "名は50文字以内で入力してください"),
  email: z.string().email("メールアドレスの形式が正しくありません"),
});

export type ClientInviteInput = z.infer<typeof clientInviteSchema>;

const DUPLICATE_EMAIL_ERROR = "このメールアドレスは既に登録されています";
const GENERIC_ERROR =
  "アカウントの作成に失敗しました。時間をおいて再度お試しください";

/**
 * ADM-006/007: 管理責任者 新規作成（招待）。
 *
 * 作成するのは auth アカウント＋招待メールのみ。
 * role=client・組織・課金レコードは作らない（発注者化は本人の決済時に
 * 通常の Webhook が行う）。
 *
 * - metadata に invited_role は**付けない**（handle_new_user トリガーの
 *   staff 化防止。role は contractor のまま）
 * - invited_last_name / invited_first_name はトリガーが public.users の
 *   氏名にセットする（middleware の登録完了判定を満たすため必須）
 * - invited_company_name は決済 Webhook で client_profiles.display_name に反映される
 */
export async function createClientInviteAction(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const parsed = clientInviteSchema.safeParse({
    companyName: formData.get("companyName"),
    lastName: formData.get("lastName"),
    firstName: formData.get("firstName"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }
  const input = parsed.data;

  const admin = createAdminClient();

  // email 重複の事前チェック（auth.users とはトリガー同期により等価。
  // 漏れたケースも inviteUserByEmail 自体のエラーで捕捉する二段構え）
  const { data: existing } = await admin
    .from("users")
    .select("id")
    .eq("email", input.email)
    .maybeSingle();
  if (existing) {
    return { success: false, error: DUPLICATE_EMAIL_ERROR };
  }

  // emailRedirectTo はユーザーがアクセスしている host に揃える（CLAUDE.md ルール）
  const hdrs = await headers();
  const host = hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const siteUrl = host
    ? `${proto}://${host}`
    : (process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000");

  // 招待メール送信 + auth.users 作成（implicit flow＋フラグメントトークン。
  // redirectTo は既存スタッフ招待と同じ /accept-invite/confirm）
  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: `${siteUrl}/accept-invite/confirm`,
      data: {
        invited_last_name: input.lastName,
        invited_first_name: input.firstName,
        invited_company_name: input.companyName,
      },
    });

  if (inviteError || !invited?.user) {
    console.error("[createClientInviteAction] inviteUserByEmail failed", {
      email: maskEmail(input.email),
      code: inviteError?.code,
      message: inviteError?.message,
    });

    // 幽霊アカウント防止: auth アカウントが作成済みなら削除する
    if (invited?.user?.id) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(
        invited.user.id,
      );
      if (cleanupError) {
        console.error(
          "[createClientInviteAction] cleanup deleteUser failed",
          cleanupError,
        );
      }
    }

    // invite 段階で重複が検出されたケース（事前チェックの漏れ）
    if (
      inviteError?.code === "email_exists" ||
      inviteError?.message?.includes("already registered")
    ) {
      return { success: false, error: DUPLICATE_EMAIL_ERROR };
    }
    return { success: false, error: GENERIC_ERROR };
  }

  await writeAuditLog({
    actorId: auth.adminId,
    action: "admin_client_invite",
    targetType: "users",
    targetId: invited.user.id,
    metadata: {
      email: maskEmail(input.email),
      company_name: input.companyName,
    },
  });

  redirect("/admin/clients");
}
