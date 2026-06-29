/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * メール通知 HTML プレビュー生成器
 *
 * 全 74 通分のメールを HTML 出力 + 索引ページ生成。実送信せず、見た目とリンクを
 * ブラウザで確認するためのツール。
 *
 * 使い方:
 *   GENERATE_EMAIL_PREVIEWS=1 npx vitest run src/__tests__/preview/email-preview-gen.test.ts
 *
 * 出力先 (デフォルト):
 *   $EMAIL_PREVIEW_OUTPUT_DIR
 *     ?? /private/tmp/claude-501/.../scratchpad/email-preview
 *
 * 確認手順は同階層の auth-flow-guide.md 参照。
 */
import { describe, it } from "vitest";
import fs from "fs";
import path from "path";

// === Resend テンプレ 57 件すべて import (アルファベット順) ===
import { accountCascadeFrozenProxyEmail } from "@/lib/email/templates/account-cascade-frozen-proxy";
import { accountCascadeFrozenStaffEmail } from "@/lib/email/templates/account-cascade-frozen-staff";
import { accountSuspendedByAdminEmail } from "@/lib/email/templates/account-suspended-by-admin";
import { adminClientInviteCompletedEmail } from "@/lib/email/templates/admin-client-invite-completed";
import { adminClientInvitedControlEmail } from "@/lib/email/templates/admin-client-invited-control";
import { adminPasswordChangedEmail } from "@/lib/email/templates/admin-password-changed";
import { applicationCancelledControlEmail } from "@/lib/email/templates/application-cancelled-control";
import { applicationCancelledEmail } from "@/lib/email/templates/application-cancelled";
import { applicationConfirmationEmail } from "@/lib/email/templates/application-confirmation";
import { applicationReceivedEmail } from "@/lib/email/templates/application-received";
import { completionReportToClientEmail } from "@/lib/email/templates/completion-report-to-client";
import { completionReportToContractorEmail } from "@/lib/email/templates/completion-report-to-contractor";
import { contactOpsNotificationEmail } from "@/lib/email/templates/contact-ops-notification";
import { contactReceiptEmail } from "@/lib/email/templates/contact-receipt";
import { emailChangedByAdminControlEmail } from "@/lib/email/templates/email-changed-by-admin-control";
import { emailChangedByAdminEmail } from "@/lib/email/templates/email-changed-by-admin";
import { emailRecycleFailureAlertEmail } from "@/lib/email/templates/email-recycle-failure-alert";
import { jobInquiryNotificationEmail } from "@/lib/email/templates/job-inquiry-notification";
import { jobInquiryReceiptEmail } from "@/lib/email/templates/job-inquiry-receipt";
import { matchingAcceptedEmail } from "@/lib/email/templates/matching-accepted";
import { matchingRejectedEmail } from "@/lib/email/templates/matching-rejected";
import { memberInvitedControlEmail } from "@/lib/email/templates/member-invited-control";
import { memberRoleChangedControlEmail } from "@/lib/email/templates/member-role-changed-control";
import { memberRoleChangedEmail } from "@/lib/email/templates/member-role-changed";
import { messageNotificationEmail } from "@/lib/email/templates/message-notification";
import { optionPaymentFailedEmail } from "@/lib/email/templates/option-payment-failed";
import { optionSubscriptionActivatedEmail } from "@/lib/email/templates/option-subscription-activated";
import { optionSubscriptionCancelledEmail } from "@/lib/email/templates/option-subscription-cancelled";
import { orderAcceptedControlEmail } from "@/lib/email/templates/order-accepted-control";
import { orderRejectedControlEmail } from "@/lib/email/templates/order-rejected-control";
import { orphanAuthUserAlertEmail } from "@/lib/email/templates/orphan-auth-user-alert";
import { passwordResetCompletedEmail } from "@/lib/email/templates/password-reset-completed";
import { paymentFailedEmail } from "@/lib/email/templates/payment-failed";
import { planActivatedEmail } from "@/lib/email/templates/plan-activated";
import { proxyAssignedControlEmail } from "@/lib/email/templates/proxy-assigned-control";
import { proxyAssignedEmail } from "@/lib/email/templates/proxy-assigned";
import { proxyRemovedControlEmail } from "@/lib/email/templates/proxy-removed-control";
import { proxyRemovedEmail } from "@/lib/email/templates/proxy-removed";
import { registrationCompletedEmail } from "@/lib/email/templates/registration-completed";
import { scoutDeclinedControlEmail } from "@/lib/email/templates/scout-declined-control";
import { scoutNotificationEmail } from "@/lib/email/templates/scout-notification";
import { scoutSentBroadcastEmail } from "@/lib/email/templates/scout-sent-broadcast";
import { staffRemovedControlEmail } from "@/lib/email/templates/staff-removed-control";
import { staffRemovedEmail } from "@/lib/email/templates/staff-removed";
import { subscriptionCancelledEmail } from "@/lib/email/templates/subscription-cancelled";
import { subscriptionChangedEmail } from "@/lib/email/templates/subscription-changed";
import { troubleReportOpsNotificationEmail } from "@/lib/email/templates/trouble-report-ops-notification";
import { troubleReportReceiptEmail } from "@/lib/email/templates/trouble-report-receipt";
import { urgentOptionActivatedEmail } from "@/lib/email/templates/urgent-option-activated";
import { verificationApprovedEmail } from "@/lib/email/templates/verification-approved";
import { verificationReceivedOpsEmail } from "@/lib/email/templates/verification-received-ops";
import { verificationReceivedEmail } from "@/lib/email/templates/verification-received";
import { verificationRejectedEmail } from "@/lib/email/templates/verification-rejected";
import { videoOptionActivatedEmail } from "@/lib/email/templates/video-option-activated";
import { videoOptionAppliedOpsEmail } from "@/lib/email/templates/video-option-applied-ops";
import { videoPublishedOpsEmail } from "@/lib/email/templates/video-published-ops";
import { videoPublishedEmail } from "@/lib/email/templates/video-published";
import { withdrawalCompletedEmail } from "@/lib/email/templates/withdrawal-completed";

const DEFAULT_OUTPUT_DIR =
  "/private/tmp/claude-501/-Users-nozomikinoshita-Desktop-bijiyu/ad0f2e14-f708-4aa0-a2c9-8a115e0d3ce5/scratchpad/email-preview";

const OUTPUT_DIR = process.env.EMAIL_PREVIEW_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
const SUPABASE_TEMPLATES_DIR = path.join(
  process.cwd(),
  "supabase",
  "templates",
);
const APP_URL = "http://127.0.0.1:3000";

type Classification = "新規" | "改修" | "既存維持" | "Supabase Auth";

interface Fixture {
  id: string;
  section: string;
  title: string;
  templateFile: string;
  invoke: () => { subject: string; html: string };
  meta: {
    recipient: string;
    trigger: string;
    actionFile?: string;
    specRef: string;
    classification: Classification;
    parallel?: string[];
    notes?: string;
  };
}

// === ダミー Go template 展開 (Supabase Auth テンプレ用) ===
//
// 対応構文:
//   {{ .Var }}              — 変数展開
//   {{ .Data.field }}       — ネスト変数
//   {{ if .X }}A{{ else if .Y }}B{{ else }}C{{ end }} — 条件分岐
//
// Supabase Auth テンプレで実際に使われている構文だけサポート。
function renderGoTemplate(template: string, data: Record<string, any>): string {
  // 1. if/elseif/else/end を解決
  let result = template;
  let safetyCounter = 0;
  while (result.includes("{{ if") || result.includes("{{if")) {
    safetyCounter += 1;
    if (safetyCounter > 50) {
      throw new Error("Go template if-block depth limit exceeded");
    }
    result = resolveIfBlock(result, data);
  }
  // 2. 変数展開
  result = result.replace(/\{\{\s*\.([A-Za-z][A-Za-z0-9_.]*)\s*\}\}/g, (_, p) => {
    return resolvePath(data, p) ?? "";
  });
  return result;
}

function resolveIfBlock(template: string, data: Record<string, any>): string {
  // 最も外側の {{ if ... }} ... {{ end }} を 1 つ解決
  const ifStart = template.search(/\{\{\s*if\s+\./);
  if (ifStart === -1) return template;

  // {{ end }} を入れ子対応で探す
  let depth = 0;
  let pos = ifStart;
  const re = /\{\{\s*(if|end)\b[^}]*\}\}/g;
  re.lastIndex = ifStart;
  let endMatch: RegExpExecArray | null;
  while ((endMatch = re.exec(template)) !== null) {
    if (endMatch[1] === "if") depth += 1;
    else if (endMatch[1] === "end") {
      depth -= 1;
      if (depth === 0) {
        pos = endMatch.index + endMatch[0].length;
        break;
      }
    }
  }
  const block = template.slice(ifStart, pos);

  // ブロック内の if/elseif/else/end を解析
  const branches = parseBranches(block);
  let chosen = "";
  let matched = false;
  for (const b of branches) {
    if (b.type === "if" || b.type === "elseif") {
      const cond = resolvePath(data, b.condition!);
      if (cond) {
        chosen = b.body;
        matched = true;
        break;
      }
    } else if (b.type === "else") {
      if (!matched) chosen = b.body;
    }
  }
  return template.slice(0, ifStart) + chosen + template.slice(pos);
}

function parseBranches(block: string): Array<{
  type: "if" | "elseif" | "else";
  condition?: string;
  body: string;
}> {
  // トップレベルの if/elseif/else/end のみ拾う(入れ子は body にそのまま残す)
  const tokens: Array<{ index: number; len: number; kind: string; cond?: string }> = [];
  const re = /\{\{\s*(if|else\s+if|else|end)\s*(?:\.([A-Za-z][A-Za-z0-9_.]*))?\s*\}\}/g;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const kind = m[1].replace(/\s+/g, " ");
    if (kind === "if") {
      depth += 1;
      if (depth === 1) {
        tokens.push({ index: m.index, len: m[0].length, kind: "if", cond: m[2] });
      }
    } else if (kind === "end") {
      depth -= 1;
      if (depth === 0) {
        tokens.push({ index: m.index, len: m[0].length, kind: "end" });
      }
    } else if (depth === 1) {
      tokens.push({
        index: m.index,
        len: m[0].length,
        kind: kind === "else if" ? "elseif" : "else",
        cond: m[2],
      });
    }
  }
  const branches: Array<{
    type: "if" | "elseif" | "else";
    condition?: string;
    body: string;
  }> = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const cur = tokens[i];
    const next = tokens[i + 1];
    const bodyStart = cur.index + cur.len;
    const bodyEnd = next.index;
    const body = block.slice(bodyStart, bodyEnd);
    if (cur.kind === "if") branches.push({ type: "if", condition: cur.cond, body });
    else if (cur.kind === "elseif") branches.push({ type: "elseif", condition: cur.cond, body });
    else if (cur.kind === "else") branches.push({ type: "else", body });
  }
  return branches;
}

function resolvePath(data: Record<string, any>, dottedPath: string): string {
  const parts = dottedPath.split(".");
  let cur: any = data;
  for (const p of parts) {
    if (cur == null) return "";
    cur = cur[p];
  }
  if (cur == null) return "";
  return String(cur);
}

// === Resend テンプレ fixtures ===

const fixtures: Fixture[] = [
  // ============================================================
  // §1 案件・応募・スカウト
  // ============================================================
  {
    id: "1.1.A",
    section: "§1 案件・応募・スカウト",
    title: "応募通知 (発注者宛)",
    templateFile: "src/lib/email/templates/application-received.ts",
    invoke: () =>
      applicationReceivedEmail({
        recipientName: "山田工務店",
        jobTitle: "△△工事",
        applicantName: "田中さん（××建設）",
        tradeType: "型枠大工",
        headcount: 3,
        appliedAt: "2026/06/18 14:30",
        messageExcerpt: "ぜひ協力させてください。当社では型枠工事を主に手掛けており、過去にも類似の現場経験があります。",
      }),
    meta: {
      recipient: "発注者(個人=本人 / 法人=組織全員 M-03 broadcast)",
      trigger: "受注者が CON-004 応募フォームから「応募を確定する」押下時",
      actionFile: "src/app/(authenticated)/jobs/[id]/apply/actions.ts (applyJobAction)",
      specRef: "§1.1.A",
      classification: "新規",
      parallel: ["1.1.B"],
    },
  },
  {
    id: "1.1.B",
    section: "§1 案件・応募・スカウト",
    title: "応募控え (受注者本人宛)",
    templateFile: "src/lib/email/templates/application-confirmation.ts",
    invoke: () =>
      applicationConfirmationEmail({
        applicantName: "田中 太郎",
        jobTitle: "△△工事",
        clientName: "株式会社□□建設",
        tradeType: "型枠大工",
        area: "東京都 港区",
        headcount: 3,
        appliedAt: "2026/06/22 14:30",
      }),
    meta: {
      recipient: "応募した受注者本人 1 名",
      trigger: "同上 (1.1.A と並列発火)",
      actionFile: "src/app/(authenticated)/jobs/[id]/apply/actions.ts (applyJobAction)",
      specRef: "§1.1.B",
      classification: "新規",
      parallel: ["1.1.A"],
    },
  },
  {
    id: "1.2.A",
    section: "§1 案件・応募・スカウト",
    title: "発注後キャンセル通知 (発注者宛)",
    templateFile: "src/lib/email/templates/application-cancelled-control.ts",
    invoke: () =>
      applicationCancelledControlEmail({
        recipientName: "山田工務店",
        jobTitle: "△△工事",
        contractorName: "田中さん（××建設）",
        tradeType: "型枠大工",
        headcount: 3,
        firstWorkDate: "2026/06/30",
        cancelledAt: "2026/06/18 14:30",
      }),
    meta: {
      recipient: "発注者(個人=本人 / 法人=組織全員 M-03 broadcast)",
      trigger: "受注者が発注確定済応募を /applications/history/[id] からキャンセル時 (accepted → cancelled)",
      actionFile: "src/app/(authenticated)/applications/actions.ts (cancelApplicationAction)",
      specRef: "§1.2.A",
      classification: "新規",
      parallel: ["1.2.B"],
    },
  },
  {
    id: "1.2.B",
    section: "§1 案件・応募・スカウト",
    title: "受注キャンセル控え (受注者本人宛)",
    templateFile: "src/lib/email/templates/application-cancelled.ts",
    invoke: () =>
      applicationCancelledEmail({
        applicantName: "田中 太郎",
        jobTitle: "△△工事",
        clientName: "株式会社□□建設",
        tradeType: "型枠大工",
        headcount: 3,
        firstWorkDate: "2026/06/30",
        cancelledAt: "2026/06/18 14:30",
      }),
    meta: {
      recipient: "キャンセルした受注者本人 1 名",
      trigger: "同上 (1.2.A と並列発火)",
      actionFile: "src/app/(authenticated)/applications/actions.ts (cancelApplicationAction)",
      specRef: "§1.2.B",
      classification: "新規",
      parallel: ["1.2.A"],
    },
  },
  {
    id: "1.3.A",
    section: "§1 案件・応募・スカウト",
    title: "スカウト辞退通知 (発注者宛)",
    templateFile: "src/lib/email/templates/scout-declined-control.ts",
    invoke: () =>
      scoutDeclinedControlEmail({
        recipientName: "山田工務店",
        jobTitle: "△△工事",
        contractorName: "田中さん（××建設）",
        scoutSentDate: "2026/06/15",
        declinedAt: "2026/06/18 14:30",
      }),
    meta: {
      recipient: "スカウト送信元発注者(個人=本人 / 法人=組織全員 M-03 broadcast)",
      trigger: "受注者がスカウトを COM-001-A 確認画面で辞退時",
      actionFile: "src/app/(authenticated)/messages/[threadId]/actions.ts (respondToScoutAction rejected)",
      specRef: "§1.3.A",
      classification: "新規",
      notes: "受注者本人控え (1.3.B) は M-02 例外で送信なし",
    },
  },
  {
    id: "1.4.A",
    section: "§1 案件・応募・スカウト",
    title: "応募通知 (発注者宛・スカウト経由)",
    templateFile: "src/lib/email/templates/application-received.ts",
    invoke: () =>
      applicationReceivedEmail({
        recipientName: "山田工務店",
        jobTitle: "△△工事",
        applicantName: "田中さん（××建設）",
        tradeType: "型枠大工",
        headcount: 3,
        appliedAt: "2026/06/18 14:30",
        messageExcerpt: "スカウトいただきありがとうございます。当社の対応エリアと合致するため、ぜひお引き受けしたく...",
        scoutSentDate: "2026/06/15",
      }),
    meta: {
      recipient: "発注者(個人=本人 / 法人=組織全員 M-03 broadcast)",
      trigger: "スカウト accepted 後、受注者が CON-004 応募フォームから応募確定時",
      actionFile: "src/app/(authenticated)/jobs/[id]/apply/actions.ts (applyJobAction、scout_message_id 検出時)",
      specRef: "§1.4.A",
      classification: "新規",
      notes: "1.1.A と同じテンプレで scoutSentDate 引数を渡すと「(スカウト経由)」分岐に切り替わる。受注者控えは 1.1.B 流用",
    },
  },
  {
    id: "1.6.A",
    section: "§1 案件・応募・スカウト",
    title: "受注決定通知 (受注者宛)",
    templateFile: "src/lib/email/templates/matching-accepted.ts",
    invoke: () =>
      matchingAcceptedEmail({
        applicantName: "田中 太郎",
        jobTitle: "△△工事",
        clientName: "山田工務店",
        tradeType: "型枠大工",
        firstWorkDate: "2026/06/30",
        workEndDate: "2026/07/03",
      }),
    meta: {
      recipient: "受注者本人 1 名",
      trigger: "発注者が CLI-009 発注可否ポップアップで「発注する」決定時 (applied → accepted)",
      actionFile: "src/app/(authenticated)/applications/actions.ts (acceptApplicationAction)",
      specRef: "§1.6.A",
      classification: "改修",
      parallel: ["1.6.C"],
    },
  },
  {
    id: "1.6.B",
    section: "§1 案件・応募・スカウト",
    title: "発注見送り通知 (受注者宛)",
    templateFile: "src/lib/email/templates/matching-rejected.ts",
    invoke: () =>
      matchingRejectedEmail({
        applicantName: "田中 太郎",
        jobTitle: "△△工事",
        clientName: "山田工務店",
      }),
    meta: {
      recipient: "受注者本人 1 名",
      trigger: "発注者が CLI-009 で「発注を見送る」決定時 (applied → rejected)",
      actionFile: "src/app/(authenticated)/applications/actions.ts (rejectApplicationAction)",
      specRef: "§1.6.B",
      classification: "改修",
      parallel: ["1.6.D"],
    },
  },
  {
    id: "1.6.C",
    section: "§1 案件・応募・スカウト",
    title: "発注確定控え (発注者宛)",
    templateFile: "src/lib/email/templates/order-accepted-control.ts",
    invoke: () =>
      orderAcceptedControlEmail({
        recipientName: "山田工務店",
        jobTitle: "△△工事",
        contractorName: "田中さん（××建設）",
        tradeType: "型枠大工",
        headcount: 3,
        firstWorkDate: "2026/06/30",
        workEndDate: "2026/07/03",
        decidedAt: "2026/06/22 14:30",
      }),
    meta: {
      recipient: "発注者(個人=本人 / 法人=組織全員 M-03 broadcast)",
      trigger: "同上 (1.6.A と並列発火)",
      actionFile: "src/app/(authenticated)/applications/actions.ts (acceptApplicationAction)",
      specRef: "§1.6.C",
      classification: "新規",
      parallel: ["1.6.A"],
    },
  },
  {
    id: "1.6.D",
    section: "§1 案件・応募・スカウト",
    title: "発注見送り控え (発注者宛)",
    templateFile: "src/lib/email/templates/order-rejected-control.ts",
    invoke: () =>
      orderRejectedControlEmail({
        recipientName: "山田工務店",
        jobTitle: "△△工事",
        contractorName: "田中さん（××建設）",
        tradeType: "型枠大工",
        decidedAt: "2026/06/22 14:30",
      }),
    meta: {
      recipient: "発注者(個人=本人 / 法人=組織全員 M-03 broadcast)",
      trigger: "同上 (1.6.B と並列発火)",
      actionFile: "src/app/(authenticated)/applications/actions.ts (rejectApplicationAction)",
      specRef: "§1.6.D",
      classification: "新規",
      parallel: ["1.6.B"],
    },
  },
  {
    id: "1.7.A",
    section: "§1 案件・応募・スカウト",
    title: "スカウト通知 (受注者宛)",
    templateFile: "src/lib/email/templates/scout-notification.ts",
    invoke: () =>
      scoutNotificationEmail({
        recipientName: "田中 太郎",
        senderName: "山田工務店",
        jobTitle: "△△工事",
        messageExcerpt: "貴社のお仕事ぶりを拝見しました。今回の現場でぜひお力をお貸しいただけないかご相談したく...",
      }),
    meta: {
      recipient: "スカウト先受注者本人 1 名",
      trigger: "発注者が COM-007 スカウト送信フォームから送信時",
      actionFile: "src/app/(authenticated)/messages/scout-send/actions.ts (sendScoutAction)",
      specRef: "§1.7.A",
      classification: "改修",
      parallel: ["1.7.B"],
    },
  },
  {
    id: "1.7.B",
    section: "§1 案件・応募・スカウト",
    title: "スカウト送信控え (発注者組織宛)",
    templateFile: "src/lib/email/templates/scout-sent-broadcast.ts",
    invoke: () =>
      scoutSentBroadcastEmail({
        memberName: "山田 一郎",
        contractorName: "田中さん（××建設）",
        jobTitle: "△△工事",
        messageExcerpt: "貴社のお仕事ぶりを拝見しました。今回の現場でぜひお力をお貸しいただけないかご相談したく...",
        actualSenderName: "山田 花子",
      }),
    meta: {
      recipient: "発注者(個人=本人 / 法人=組織全員 M-03 broadcast)",
      trigger: "同上 (1.7.A と並列発火)",
      actionFile: "src/app/(authenticated)/messages/scout-send/actions.ts (sendScoutAction)",
      specRef: "§1.7.B",
      classification: "新規",
      parallel: ["1.7.A"],
    },
  },

  // ============================================================
  // §2 メッセージ
  // ============================================================
  {
    id: "2.1",
    section: "§2 メッセージ",
    title: "新着メッセージ受信通知",
    templateFile: "src/lib/email/templates/message-notification.ts",
    invoke: () =>
      messageNotificationEmail({
        recipientName: "田中 太郎",
        senderName: "山田工務店",
        messagePreview: "先日の応募の件について、確認したい点がいくつかあります。お時間ありましたら...",
      }),
    meta: {
      recipient: "メッセージ受信者本人 (法人は組織全員 M-03 broadcast)",
      trigger: "メッセージ送信時、15 分 throttle 経由で発火",
      actionFile: "src/app/(authenticated)/messages/[threadId]/actions.ts (sendMessageAction)",
      specRef: "§2.1",
      classification: "改修",
    },
  },

  // ============================================================
  // §3 完了・評価
  // ============================================================
  {
    id: "3.1.A",
    section: "§3 完了・評価",
    title: "完了報告催促 (発注者宛)",
    templateFile: "src/lib/email/templates/completion-report-to-client.ts",
    invoke: () =>
      completionReportToClientEmail({
        recipientName: "山田工務店",
        contractorName: "田中さん（××建設）",
        jobTitle: "△△工事",
        tradeType: "型枠大工",
        workEndDate: "2026/07/03",
        reportedAt: "2026/07/05 14:30",
      }),
    meta: {
      recipient: "発注者(個人=本人 / 法人=組織全員 M-03 broadcast)",
      trigger: "受注者が先に完了報告 + 評価を提出した時",
      actionFile: "src/app/(authenticated)/applications/actions.ts (submitContractorReportAction)",
      specRef: "§3.1.A",
      classification: "新規",
    },
  },
  {
    id: "3.1.B",
    section: "§3 完了・評価",
    title: "完了報告催促 (受注者宛)",
    templateFile: "src/lib/email/templates/completion-report-to-contractor.ts",
    invoke: () =>
      completionReportToContractorEmail({
        applicantName: "田中 太郎",
        clientName: "山田工務店",
        jobTitle: "△△工事",
        tradeType: "型枠大工",
        workEndDate: "2026/07/03",
        reportedAt: "2026/07/05 14:30",
      }),
    meta: {
      recipient: "受注者本人 1 名",
      trigger: "発注者が先に完了報告 + 評価を提出した時",
      actionFile: "src/app/(authenticated)/applications/actions.ts (submitClientReportAction)",
      specRef: "§3.1.B",
      classification: "新規",
    },
  },

  // ============================================================
  // §4 本人確認・CCUS
  // ============================================================
  {
    id: "4.1.identity",
    section: "§4 本人確認・CCUS",
    title: "申請受理控え (本人確認・受注者宛)",
    templateFile: "src/lib/email/templates/verification-received.ts",
    invoke: () =>
      verificationReceivedEmail({
        recipientName: "田中",
        documentType: "identity",
        appliedAt: "2026/06/23 10:30",
      }),
    meta: {
      recipient: "申請した受注者本人 1 名",
      trigger: "受注者が AUTH-009 で本人確認書類を提出時",
      actionFile: "src/app/(authenticated)/profile/verification/identity/actions.ts (submitIdentityAction)",
      specRef: "§4.1",
      classification: "新規",
      parallel: ["4.4.identity"],
    },
  },
  {
    id: "4.1.ccus",
    section: "§4 本人確認・CCUS",
    title: "申請受理控え (CCUS・受注者宛)",
    templateFile: "src/lib/email/templates/verification-received.ts",
    invoke: () =>
      verificationReceivedEmail({
        recipientName: "田中",
        documentType: "ccus",
        appliedAt: "2026/06/23 10:30",
      }),
    meta: {
      recipient: "申請した受注者本人 1 名",
      trigger: "受注者が AUTH-009 で CCUS 書類を提出時",
      actionFile: "src/app/(authenticated)/profile/verification/ccus/actions.ts (submitCcusAction)",
      specRef: "§4.1",
      classification: "新規",
      parallel: ["4.4.ccus"],
      notes: "4.1.identity と同テンプレで documentType を切り替え",
    },
  },
  {
    id: "4.2.identity",
    section: "§4 本人確認・CCUS",
    title: "承認通知 (本人確認・受注者宛)",
    templateFile: "src/lib/email/templates/verification-approved.ts",
    invoke: () =>
      verificationApprovedEmail({
        recipientName: "田中 太郎",
        documentType: "identity",
      }),
    meta: {
      recipient: "申請者本人 1 名",
      trigger: "admin が ADM-012 で「承認」操作時",
      actionFile: "src/app/admin/(protected)/verifications/[id]/actions.ts (approveVerificationAction)",
      specRef: "§4.2",
      classification: "改修",
    },
  },
  {
    id: "4.2.ccus",
    section: "§4 本人確認・CCUS",
    title: "承認通知 (CCUS・受注者宛)",
    templateFile: "src/lib/email/templates/verification-approved.ts",
    invoke: () =>
      verificationApprovedEmail({
        recipientName: "田中 太郎",
        documentType: "ccus",
      }),
    meta: {
      recipient: "申請者本人 1 名",
      trigger: "admin が ADM-012 で「承認」操作時",
      actionFile: "src/app/admin/(protected)/verifications/[id]/actions.ts (approveVerificationAction)",
      specRef: "§4.2",
      classification: "改修",
    },
  },
  {
    id: "4.3.identity",
    section: "§4 本人確認・CCUS",
    title: "否認通知 (本人確認・受注者宛)",
    templateFile: "src/lib/email/templates/verification-rejected.ts",
    invoke: () =>
      verificationRejectedEmail({
        recipientName: "田中 太郎",
        documentType: "identity",
        rejectionReason: "書類が不鮮明で氏名が読み取れません。明るい場所で撮影し直してください。",
      }),
    meta: {
      recipient: "申請者本人 1 名",
      trigger: "admin が ADM-012 で「否認」操作時 (rejection_reason 必須)",
      actionFile: "src/app/admin/(protected)/verifications/[id]/actions.ts (rejectVerificationAction)",
      specRef: "§4.3",
      classification: "改修",
    },
  },
  {
    id: "4.3.ccus",
    section: "§4 本人確認・CCUS",
    title: "否認通知 (CCUS・受注者宛)",
    templateFile: "src/lib/email/templates/verification-rejected.ts",
    invoke: () =>
      verificationRejectedEmail({
        recipientName: "田中 太郎",
        documentType: "ccus",
        rejectionReason: "技能者 ID と顔写真が一致しないため確認できませんでした。",
      }),
    meta: {
      recipient: "申請者本人 1 名",
      trigger: "admin が ADM-012 で「否認」操作時 (rejection_reason 必須)",
      actionFile: "src/app/admin/(protected)/verifications/[id]/actions.ts (rejectVerificationAction)",
      specRef: "§4.3",
      classification: "改修",
    },
  },
  {
    id: "4.4.identity",
    section: "§4 本人確認・CCUS",
    title: "申請受理通知 (本人確認・運営宛)",
    templateFile: "src/lib/email/templates/verification-received-ops.ts",
    invoke: () =>
      verificationReceivedOpsEmail({
        applicantName: "田中 太郎",
        documentType: "identity",
        appliedAt: "2026/06/23 10:30",
        siteUrl: APP_URL,
        verificationId: "1f873949-d7e3-4c69-8f3c-0bb3b6f2b85c",
      }),
    meta: {
      recipient: "運営 (OPS_NOTIFICATION_EMAIL)",
      trigger: "受注者が AUTH-009 で本人確認書類を提出時 (4.1 と並列)",
      actionFile: "src/app/(authenticated)/profile/verification/identity/actions.ts (submitIdentityAction)",
      specRef: "§4.4",
      classification: "新規",
      parallel: ["4.1.identity"],
      notes: "deep link 用 verificationId は seed の pending identity レコード実 UUID",
    },
  },
  {
    id: "4.4.ccus",
    section: "§4 本人確認・CCUS",
    title: "申請受理通知 (CCUS・運営宛)",
    templateFile: "src/lib/email/templates/verification-received-ops.ts",
    invoke: () =>
      verificationReceivedOpsEmail({
        applicantName: "田中 太郎",
        documentType: "ccus",
        appliedAt: "2026/06/23 10:30",
        siteUrl: APP_URL,
        verificationId: "b0b0f831-d256-47b2-a68d-975bfd6a6f7a",
      }),
    meta: {
      recipient: "運営 (OPS_NOTIFICATION_EMAIL)",
      trigger: "受注者が AUTH-009 で CCUS 書類を提出時 (4.1 と並列)",
      actionFile: "src/app/(authenticated)/profile/verification/ccus/actions.ts (submitCcusAction)",
      specRef: "§4.4",
      classification: "新規",
      parallel: ["4.1.ccus"],
      notes: "deep link 用 verificationId は seed の pending ccus レコード実 UUID",
    },
  },

  // ============================================================
  // §5 担当者管理 (5.1 / 5.5 / 5.8 は Supabase Auth、別配列)
  // ============================================================
  {
    id: "5.2.A",
    section: "§5 担当者管理",
    title: "Staff 招待控え (組織管理層宛)",
    templateFile: "src/lib/email/templates/member-invited-control.ts",
    invoke: () =>
      memberInvitedControlEmail({
        recipientName: "山田 一郎",
        memberName: "田中 太郎",
        memberEmail: "tanaka@example.com",
        roleLabel: "担当者",
        isProxyLabel: "いいえ",
        actorName: "山田 一郎",
        invitedAt: "2026/06/23 10:30",
      }),
    meta: {
      recipient: "組織内 Owner + admin (操作者本人含む)",
      trigger: "Owner/admin が CLI-022 で通常担当者を招待時 (代理 OFF)",
      actionFile: "src/app/(authenticated)/mypage/members/actions.ts (createMemberAction)",
      specRef: "§5.2.A",
      classification: "新規",
    },
  },
  {
    id: "5.2.B",
    section: "§5 担当者管理",
    title: "Client 招待控え (運営 admin 本人宛)",
    templateFile: "src/lib/email/templates/admin-client-invited-control.ts",
    invoke: () =>
      adminClientInvitedControlEmail({
        recipientName: "鈴木 運営",
        memberName: "山田 一郎",
        companyName: "株式会社□□工務店",
        memberEmail: "yamada@example.com",
        invitedAt: "2026/06/23 10:30",
      }),
    meta: {
      recipient: "操作した運営 admin 本人 1 名",
      trigger: "ビジ友 admin が ADM-006/007 で発注者を招待時",
      actionFile: "src/app/admin/(protected)/clients/new/actions.ts (createClientInviteAction)",
      specRef: "§5.2.B",
      classification: "新規",
    },
  },
  {
    id: "5.3.B",
    section: "§5 担当者管理",
    title: "Client 招待完了通知 (運営 admin 本人宛)",
    templateFile: "src/lib/email/templates/admin-client-invite-completed.ts",
    invoke: () =>
      adminClientInviteCompletedEmail({
        recipientName: "鈴木 運営",
        memberName: "山田 一郎",
        companyName: "株式会社□□工務店",
        memberEmail: "yamada@example.com",
        acceptedAt: "2026/06/24 09:15",
      }),
    meta: {
      recipient: "招待操作した運営 admin 本人 1 名",
      trigger: "招待された発注者が AUTH-008 でパスワード設定完了時",
      actionFile: "src/app/(auth)/accept-invite/confirm/actions.ts (acceptInviteAction、Client 分岐)",
      specRef: "§5.3.B",
      classification: "新規",
      notes: "Staff 招待完了 (5.3.A) は SKIP 判断",
    },
  },
  {
    id: "5.4.A",
    section: "§5 担当者管理",
    title: "メール強制変更通知 (本人宛・旧+新 両宛)",
    templateFile: "src/lib/email/templates/email-changed-by-admin.ts",
    invoke: () =>
      emailChangedByAdminEmail({
        recipientName: "田中 太郎",
        oldEmail: "tanaka.old@example.com",
        newEmail: "tanaka.new@example.com",
        organizationName: "株式会社○○建設",
      }),
    meta: {
      recipient: "変更対象本人 (旧 email + 新 email の両方に送信)",
      trigger: "Owner/admin が CLI-022 で他メンバーのメールアドレスを強制変更時",
      actionFile: "src/app/(authenticated)/mypage/members/actions.ts (updateMemberAction パターン B)",
      specRef: "§5.4.A",
      classification: "改修",
      parallel: ["5.4.B"],
    },
  },
  {
    id: "5.4.B",
    section: "§5 担当者管理",
    title: "メール強制変更控え (組織管理層宛)",
    templateFile: "src/lib/email/templates/email-changed-by-admin-control.ts",
    invoke: () =>
      emailChangedByAdminControlEmail({
        recipientName: "山田 一郎",
        targetName: "田中 太郎",
        oldEmail: "tanaka.old@example.com",
        newEmail: "tanaka.new@example.com",
        actorName: "山田 一郎",
        changedAt: "2026/06/23 10:30",
      }),
    meta: {
      recipient: "組織内 Owner + admin (変更対象本人を除外、操作者は含む)",
      trigger: "同上 (5.4.A と並列発火)",
      actionFile: "src/app/(authenticated)/mypage/members/actions.ts (updateMemberAction パターン B)",
      specRef: "§5.4.B",
      classification: "新規",
      parallel: ["5.4.A"],
    },
  },
  {
    id: "5.6.A",
    section: "§5 担当者管理",
    title: "権限変更通知 (本人宛)",
    templateFile: "src/lib/email/templates/member-role-changed.ts",
    invoke: () =>
      memberRoleChangedEmail({
        recipientName: "田中 太郎",
        oldRoleLabel: "担当者",
        newRoleLabel: "管理者",
        actorName: "山田 一郎",
        changedAt: "2026/06/23 10:30",
      }),
    meta: {
      recipient: "権限変更された本人 1 名",
      trigger: "Owner/admin が CLI-022 で org_role を admin ↔ staff に変更時",
      actionFile: "src/app/(authenticated)/mypage/members/actions.ts (updateMemberAction)",
      specRef: "§5.6.A",
      classification: "新規",
      parallel: ["5.6.B"],
    },
  },
  {
    id: "5.6.B",
    section: "§5 担当者管理",
    title: "権限変更控え (組織管理層宛)",
    templateFile: "src/lib/email/templates/member-role-changed-control.ts",
    invoke: () =>
      memberRoleChangedControlEmail({
        recipientName: "山田 一郎",
        targetName: "田中 太郎",
        oldRoleLabel: "担当者",
        newRoleLabel: "管理者",
        actorName: "山田 一郎",
        changedAt: "2026/06/23 10:30",
      }),
    meta: {
      recipient: "組織内 Owner + admin (変更対象本人除外、操作者含む)",
      trigger: "同上 (5.6.A と並列発火)",
      actionFile: "src/app/(authenticated)/mypage/members/actions.ts (updateMemberAction)",
      specRef: "§5.6.B",
      classification: "新規",
      parallel: ["5.6.A"],
    },
  },
  {
    id: "5.6.C",
    section: "§5 担当者管理",
    title: "代理アカウント設定通知 (本人宛・後付け / reuse)",
    templateFile: "src/lib/email/templates/proxy-assigned.ts",
    invoke: () =>
      proxyAssignedEmail({
        recipientName: "佐藤 運営スタッフ",
        organizationName: "株式会社○○建設",
        actorName: "山田 一郎",
        assignedAt: "2026/06/23 10:30",
      }),
    meta: {
      recipient: "代理設定された本人 1 名 (= ビジ友運営スタッフ)",
      trigger: "後付け化 (is_proxy: false → true) または既存代理が別組織に追加された時。新規招待時の代理 ON は §5.1-Proxy で完結するため発火しない",
      actionFile: "src/app/(authenticated)/mypage/members/actions.ts (updateMemberAction / createMemberAction reuse 分岐)",
      specRef: "§5.6.C",
      classification: "新規",
      parallel: ["5.6.D"],
    },
  },
  {
    id: "5.6.D",
    section: "§5 担当者管理",
    title: "代理アカウント設定控え (組織管理層宛)",
    templateFile: "src/lib/email/templates/proxy-assigned-control.ts",
    invoke: () =>
      proxyAssignedControlEmail({
        recipientName: "山田 一郎",
        targetName: "佐藤 運営スタッフ",
        actorName: "山田 一郎",
        assignedAt: "2026/06/23 10:30",
      }),
    meta: {
      recipient: "組織内 Owner + admin (設定本人除外、操作者含む)",
      trigger: "新規招待 + 代理 ON、後付け代理化、reuse パス追加の 3 ケース全てで発火",
      actionFile: "src/app/(authenticated)/mypage/members/actions.ts (updateMemberAction / createMemberAction)",
      specRef: "§5.6.D",
      classification: "新規",
      parallel: ["5.6.C", "5.1-Proxy"],
    },
  },
  {
    id: "5.7.A-1",
    section: "§5 担当者管理",
    title: "代理解除通知 (本人宛・他組織残存あり)",
    templateFile: "src/lib/email/templates/proxy-removed.ts",
    invoke: () =>
      proxyRemovedEmail({
        recipientName: "佐藤 運営スタッフ",
        organizationName: "株式会社○○建設",
        actorName: "山田 一郎",
        removedAt: "2026/06/24 10:30",
        hasRemainingMembership: true,
      }),
    meta: {
      recipient: "削除された代理本人 1 名 (= ビジ友運営スタッフ)",
      trigger: "Owner/admin が CLI-022 で代理 staff を削除、削除後も他法人で代理在籍が残っているケース",
      actionFile: "src/app/(authenticated)/mypage/members/actions.ts (deleteMemberAction)",
      specRef: "§5.7.A-1",
      classification: "新規",
      parallel: ["5.7.B"],
    },
  },
  {
    id: "5.7.A-2",
    section: "§5 担当者管理",
    title: "代理解除通知 (本人宛・残存なし全離脱)",
    templateFile: "src/lib/email/templates/proxy-removed.ts",
    invoke: () =>
      proxyRemovedEmail({
        recipientName: "佐藤 運営スタッフ",
        organizationName: "株式会社○○建設",
        actorName: "山田 一郎",
        removedAt: "2026/06/24 10:30",
        hasRemainingMembership: false,
      }),
    meta: {
      recipient: "削除された代理本人 1 名 (= ビジ友運営スタッフ)",
      trigger: "Owner/admin が CLI-022 で代理 staff を削除、削除後すべての法人組織から外れたケース",
      actionFile: "src/app/(authenticated)/mypage/members/actions.ts (deleteMemberAction)",
      specRef: "§5.7.A-2",
      classification: "新規",
      parallel: ["5.7.B"],
    },
  },
  {
    id: "5.7.B",
    section: "§5 担当者管理",
    title: "代理解除控え (組織管理層宛)",
    templateFile: "src/lib/email/templates/proxy-removed-control.ts",
    invoke: () =>
      proxyRemovedControlEmail({
        recipientName: "山田 一郎",
        targetName: "佐藤 運営スタッフ",
        actorName: "山田 一郎",
        removedAt: "2026/06/24 10:30",
      }),
    meta: {
      recipient: "組織内 Owner + admin (削除対象本人除外、操作者含む)",
      trigger: "同上 (5.7.A-1 / 5.7.A-2 と並列発火、本人の残存有無で本文非変更)",
      actionFile: "src/app/(authenticated)/mypage/members/actions.ts (deleteMemberAction)",
      specRef: "§5.7.B",
      classification: "新規",
      parallel: ["5.7.A-1", "5.7.A-2"],
    },
  },
  {
    id: "5.7.5.A",
    section: "§5 担当者管理",
    title: "通常担当者削除通知 (本人宛)",
    templateFile: "src/lib/email/templates/staff-removed.ts",
    invoke: () =>
      staffRemovedEmail({
        recipientName: "田中 太郎",
        organizationName: "株式会社○○建設",
        actorName: "山田 一郎",
        removedAt: "2026/06/24 10:30",
      }),
    meta: {
      recipient: "削除された本人 1 名 (法人組織内通常 staff / admin)",
      trigger: "Owner/admin が CLI-022 で通常 staff (is_proxy=false) を削除時",
      actionFile: "src/app/(authenticated)/mypage/members/actions.ts (deleteMemberAction)",
      specRef: "§5.7.5.A",
      classification: "新規",
      parallel: ["5.7.5.B"],
      notes: "通常 staff は 1 組織のみ在籍可能なので削除 = 即退会扱い (残存有無分岐なし)",
    },
  },
  {
    id: "5.7.5.B",
    section: "§5 担当者管理",
    title: "通常担当者削除控え (組織管理層宛)",
    templateFile: "src/lib/email/templates/staff-removed-control.ts",
    invoke: () =>
      staffRemovedControlEmail({
        recipientName: "山田 一郎",
        targetName: "田中 太郎",
        actorName: "山田 一郎",
        removedAt: "2026/06/24 10:30",
      }),
    meta: {
      recipient: "組織内 Owner + admin (削除対象本人除外、操作者含む)",
      trigger: "同上 (5.7.5.A と並列発火)",
      actionFile: "src/app/(authenticated)/mypage/members/actions.ts (deleteMemberAction)",
      specRef: "§5.7.5.B",
      classification: "新規",
      parallel: ["5.7.5.A"],
    },
  },
  {
    id: "5.8.A",
    section: "§5 担当者管理",
    title: "パスワードリセット完了通知",
    templateFile: "src/lib/email/templates/password-reset-completed.ts",
    invoke: () =>
      passwordResetCompletedEmail({
        recipientName: "田中 太郎",
        changedAt: "2026/06/24 11:00",
      }),
    meta: {
      recipient: "パスワード変更した本人 1 名",
      trigger: "/reset-password/confirm でユーザーが新しいパスワードを設定完了時",
      actionFile: "src/app/(auth)/reset-password/confirm/actions.ts (updatePasswordAction)",
      specRef: "§5.8.A",
      classification: "新規",
    },
  },

  // ============================================================
  // §6 課金・サブスクリプション
  // ============================================================
  {
    id: "6.1-A-1",
    section: "§6 課金・サブスクリプション",
    title: "プラン変更 (即時アップグレード)",
    templateFile: "src/lib/email/templates/subscription-changed.ts",
    invoke: () =>
      subscriptionChangedEmail({
        recipientName: "山田工務店",
        eventType: "upgrade-immediate",
        oldPlanName: "個人プラン",
        newPlanName: "法人プラン",
      }),
    meta: {
      recipient: "契約者 (個人 = Owner 本人 / 法人 = Owner)",
      trigger: "/billing から即時プランアップグレード時、webhook で plan_type 変化を検知",
      actionFile: "src/lib/billing/webhook/handle-subscription-lifecycle.ts",
      specRef: "§6.1-A-1",
      classification: "改修",
    },
  },
  {
    id: "6.1-A-2",
    section: "§6 課金・サブスクリプション",
    title: "プラン変更 (ダウングレード予約)",
    templateFile: "src/lib/email/templates/subscription-changed.ts",
    invoke: () =>
      subscriptionChangedEmail({
        recipientName: "山田工務店",
        eventType: "downgrade-reserved",
        oldPlanName: "法人プラン",
        newPlanName: "個人プラン",
        scheduledDate: "2026/07/22",
      }),
    meta: {
      recipient: "契約者",
      trigger: "/billing からダウングレード予約時、webhook で schedule_id null → non-null を検知",
      actionFile: "src/lib/billing/webhook/handle-subscription-lifecycle.ts",
      specRef: "§6.1-A-2",
      classification: "改修",
    },
  },
  {
    id: "6.1-B",
    section: "§6 課金・サブスクリプション",
    title: "プラン変更 (解約予約)",
    templateFile: "src/lib/email/templates/subscription-changed.ts",
    invoke: () =>
      subscriptionChangedEmail({
        recipientName: "山田工務店",
        eventType: "cancel-reserved",
        planName: "個人プラン",
        endDate: "2026/07/22",
      }),
    meta: {
      recipient: "契約者",
      trigger: "/billing から解約予約時、webhook で cancel_at_period_end false → true を検知",
      actionFile: "src/lib/billing/webhook/handle-subscription-lifecycle.ts",
      specRef: "§6.1-B",
      classification: "改修",
    },
  },
  {
    id: "6.1-C-1",
    section: "§6 課金・サブスクリプション",
    title: "プラン変更 (ダウングレード予約取消)",
    templateFile: "src/lib/email/templates/subscription-changed.ts",
    invoke: () =>
      subscriptionChangedEmail({
        recipientName: "山田工務店",
        eventType: "reservation-removed-downgrade",
        planName: "法人プラン",
      }),
    meta: {
      recipient: "契約者",
      trigger: "/billing からダウングレード予約取消時、webhook で schedule_id non-null → null を検知",
      actionFile: "src/lib/billing/webhook/handle-subscription-lifecycle.ts",
      specRef: "§6.1-C-1",
      classification: "改修",
    },
  },
  {
    id: "6.1-C-2",
    section: "§6 課金・サブスクリプション",
    title: "プラン変更 (解約予約取消)",
    templateFile: "src/lib/email/templates/subscription-changed.ts",
    invoke: () =>
      subscriptionChangedEmail({
        recipientName: "山田工務店",
        eventType: "reservation-removed-cancel",
        planName: "個人プラン",
      }),
    meta: {
      recipient: "契約者",
      trigger: "/billing から解約予約取消時、webhook で cancel_at_period_end true → false を検知",
      actionFile: "src/lib/billing/webhook/handle-subscription-lifecycle.ts",
      specRef: "§6.1-C-2",
      classification: "改修",
    },
  },
  {
    id: "6.2-manual",
    section: "§6 課金・サブスクリプション",
    title: "有料プラン解約完了 (手動解約)",
    templateFile: "src/lib/email/templates/subscription-cancelled.ts",
    invoke: () =>
      subscriptionCancelledEmail({
        recipientName: "山田工務店",
        planName: "個人プラン",
        cancelledAt: "2026/07/22",
        reason: "manual",
      }),
    meta: {
      recipient: "契約者本人",
      trigger: "予約済の解約が予約期間到達時、または即時解約 webhook 受信時",
      actionFile: "src/lib/billing/webhook/handle-subscription-lifecycle.ts (handleSubscriptionDeleted)",
      specRef: "§6.2 (manual パターン)",
      classification: "改修",
    },
  },
  {
    id: "6.2-auto",
    section: "§6 課金・サブスクリプション",
    title: "有料プラン解約完了 (7 日経過自動解約)",
    templateFile: "src/lib/email/templates/subscription-cancelled.ts",
    invoke: () =>
      subscriptionCancelledEmail({
        recipientName: "山田工務店",
        planName: "個人プラン",
        cancelledAt: "2026/06/29",
        reason: "auto-past-due",
      }),
    meta: {
      recipient: "契約者本人",
      trigger: "支払い失敗から 7 日経過、Edge Function auto-cancel-past-due 経由で自動解約時",
      actionFile: "supabase/functions/auto-cancel-past-due/index.ts → webhook → handleSubscriptionDeleted",
      specRef: "§6.4 (案 4 採用、§6.2 と同テンプレで reason 切替) / §6.2 stripe-dunning パターン",
      classification: "改修",
      notes: "§6.4 と §6.2 stripe-dunning パターンは同一 HTML、発火経路のみ異なる",
    },
  },
  {
    id: "6.3",
    section: "§6 課金・サブスクリプション",
    title: "有料プラン 支払い失敗",
    templateFile: "src/lib/email/templates/payment-failed.ts",
    invoke: () =>
      paymentFailedEmail({
        recipientName: "山田工務店",
        planName: "個人プラン",
        nextRetryDate: "2026/06/26",
      }),
    meta: {
      recipient: "契約者本人",
      trigger: "Stripe invoice.payment_failed webhook 受信時 (リトライ毎送信)",
      actionFile: "src/lib/billing/webhook/handle-subscription-lifecycle.ts (handleInvoicePaymentFailed)",
      specRef: "§6.3",
      classification: "改修",
    },
  },
  {
    id: "6.5.A",
    section: "§6 課金・サブスクリプション",
    title: "補償オプション申し込み完了",
    templateFile: "src/lib/email/templates/option-subscription-activated.ts",
    invoke: () =>
      optionSubscriptionActivatedEmail({
        recipientName: "田中 太郎",
        optionLabel: "補償（5,000円/月、最大200万円）",
        activatedAt: "2026/06/22",
      }),
    meta: {
      recipient: "申込者本人 (受注者)",
      trigger: "Stripe checkout.session.completed → handleCompensationOption 実行時",
      actionFile: "src/lib/billing/webhook/handle-checkout-completed.ts (handleCompensationOption)",
      specRef: "§6.5.A",
      classification: "新規",
    },
  },
  {
    id: "6.5.B",
    section: "§6 課金・サブスクリプション",
    title: "補償オプション 支払い失敗",
    templateFile: "src/lib/email/templates/option-payment-failed.ts",
    invoke: () =>
      optionPaymentFailedEmail({
        recipientName: "田中 太郎",
        optionLabel: "補償（5,000円/月、最大200万円）",
        nextRetryDate: "2026/06/26",
      }),
    meta: {
      recipient: "契約者本人",
      trigger: "Stripe invoice.payment_failed webhook で option_subscriptions hit 時",
      actionFile: "src/lib/billing/webhook/handle-subscription-lifecycle.ts (handleInvoicePaymentFailed)",
      specRef: "§6.5.B",
      classification: "新規",
    },
  },
  {
    id: "6.5.C-manual",
    section: "§6 課金・サブスクリプション",
    title: "補償オプション解約完了 (手動)",
    templateFile: "src/lib/email/templates/option-subscription-cancelled.ts",
    invoke: () =>
      optionSubscriptionCancelledEmail({
        recipientName: "田中 太郎",
        optionLabel: "補償（5,000円/月、最大200万円）",
        cancelledAt: "2026/07/22",
        reason: "manual",
      }),
    meta: {
      recipient: "契約者本人",
      trigger: "ユーザーが /billing で「解約」ボタンを押下、webhook で cancellation_details.reason='cancellation_requested' を検知",
      actionFile: "src/lib/billing/webhook/handle-subscription-lifecycle.ts (handleSubscriptionDeleted)",
      specRef: "§6.5.C (manual)",
      classification: "新規",
    },
  },
  {
    id: "6.5.C-dunning",
    section: "§6 課金・サブスクリプション",
    title: "補償オプション解約完了 (Stripe dunning 自動)",
    templateFile: "src/lib/email/templates/option-subscription-cancelled.ts",
    invoke: () =>
      optionSubscriptionCancelledEmail({
        recipientName: "田中 太郎",
        optionLabel: "補償（5,000円/月、最大200万円）",
        cancelledAt: "2026/06/30",
        reason: "stripe-dunning",
      }),
    meta: {
      recipient: "契約者本人",
      trigger: "Stripe dunning リトライ枯渇による自動解約、webhook で cancellation_details.reason='payment_failed' を検知",
      actionFile: "src/lib/billing/webhook/handle-subscription-lifecycle.ts (handleSubscriptionDeleted)",
      specRef: "§6.5.C (stripe-dunning)",
      classification: "新規",
    },
  },
  {
    id: "6.6.A",
    section: "§6 課金・サブスクリプション",
    title: "急募オプション 申し込み完了",
    templateFile: "src/lib/email/templates/urgent-option-activated.ts",
    invoke: () =>
      urgentOptionActivatedEmail({
        recipientName: "山田工務店",
        jobTitle: "△△工事",
        endDate: "2026/06/29",
      }),
    meta: {
      recipient: "申込者 + 法人組織メンバー全員 (M-03 broadcast)",
      trigger: "Stripe checkout.session.completed → handleUrgentOption 実行時",
      actionFile: "src/lib/billing/webhook/handle-checkout-completed.ts (handleUrgentOption)",
      specRef: "§6.6.A",
      classification: "新規",
    },
  },
  {
    id: "6.6.B-User",
    section: "§6 課金・サブスクリプション",
    title: "動画オプション 申し込み完了 (申込者向け)",
    templateFile: "src/lib/email/templates/video-option-activated.ts",
    invoke: () =>
      videoOptionActivatedEmail({
        recipientName: "田中 太郎",
        optionLabel: "受注者PR動画",
        activatedAt: "2026/06/22",
      }),
    meta: {
      recipient: "申込者 + 法人組織メンバー全員 (M-03 broadcast)",
      trigger: "Stripe checkout.session.completed → handleVideoOption / handleVideoWorkplaceOption 実行時",
      actionFile: "src/lib/billing/webhook/handle-checkout-completed.ts",
      specRef: "§6.6.B-User",
      classification: "新規",
      parallel: ["6.6.B-Ops"],
    },
  },
  {
    id: "6.6.B-Ops",
    section: "§6 課金・サブスクリプション",
    title: "動画オプション 新規申込 (運営向け)",
    templateFile: "src/lib/email/templates/video-option-applied-ops.ts",
    invoke: () =>
      videoOptionAppliedOpsEmail({
        applicantName: "田中 太郎",
        companyName: "××建設",
        appliedAt: "2026/06/22 14:30",
        optionLabel: "受注者PR動画",
        userId: "11111111-1111-1111-1111-111111111111",
        siteUrl: APP_URL,
      }),
    meta: {
      recipient: "運営 (OPS_NOTIFICATION_EMAIL)",
      trigger: "同上 (6.6.B-User と並列発火)",
      actionFile: "src/lib/billing/webhook/handle-checkout-completed.ts",
      specRef: "§6.6.B-Ops",
      classification: "新規",
      parallel: ["6.6.B-User"],
    },
  },
  {
    id: "6.6.C-User",
    section: "§6 課金・サブスクリプション",
    title: "動画掲載完了通知 (申込者向け)",
    templateFile: "src/lib/email/templates/video-published.ts",
    invoke: () =>
      videoPublishedEmail({
        recipientName: "田中 太郎",
        optionLabel: "受注者PR動画",
        publishedAt: "2026/06/25",
      }),
    meta: {
      recipient: "申込者 + 法人組織メンバー全員 (M-03 broadcast)",
      trigger: "admin が ADM-010 / ADM-010B で動画 URL を登録時 (updateVideoUrlAction / updateWorkplaceVideoUrlAction)",
      actionFile: "src/app/admin/actions.ts",
      specRef: "§6.6.C-User",
      classification: "新規",
      parallel: ["6.6.C-Ops"],
    },
  },
  {
    id: "6.6.C-Ops",
    section: "§6 課金・サブスクリプション",
    title: "動画掲載完了 + 申込者通知済確認 (運営向け)",
    templateFile: "src/lib/email/templates/video-published-ops.ts",
    invoke: () =>
      videoPublishedOpsEmail({
        applicantName: "田中 太郎",
        companyName: "××建設",
        optionLabel: "受注者PR動画",
        publishedAt: "2026/06/25 09:00",
        userId: "11111111-1111-1111-1111-111111111111",
        siteUrl: APP_URL,
      }),
    meta: {
      recipient: "運営 (OPS_NOTIFICATION_EMAIL)",
      trigger: "同上 (6.6.C-User と並列発火)",
      actionFile: "src/app/admin/actions.ts",
      specRef: "§6.6.C-Ops",
      classification: "新規",
      parallel: ["6.6.C-User"],
    },
  },
  {
    id: "6.7",
    section: "§6 課金・サブスクリプション",
    title: "基本プラン契約完了",
    templateFile: "src/lib/email/templates/plan-activated.ts",
    invoke: () =>
      planActivatedEmail({
        recipientName: "山田工務店",
        planName: "個人プラン",
        activatedAt: "2026/06/22",
      }),
    meta: {
      recipient: "契約者本人 (個人 = Owner / 法人 = Owner)",
      trigger: "初回契約 or 解約後の再契約完了時、Stripe checkout.session.completed 経由",
      actionFile: "src/lib/billing/webhook/handle-checkout-completed.ts",
      specRef: "§6.7",
      classification: "新規",
    },
  },

  // ============================================================
  // §7 お問い合わせ・トラブル報告
  // ============================================================
  {
    id: "7.1.A",
    section: "§7 お問い合わせ・トラブル報告",
    title: "お問い合わせ送信者控え",
    templateFile: "src/lib/email/templates/contact-receipt.ts",
    invoke: () =>
      contactReceiptEmail({
        name: "山田 一郎",
        inquiryType: "サービスの使い方について",
        detail: `発注者として案件を出したいのですが、画面の使い方がよくわかりません。

具体的には、以下の点で困っています。

1. 案件作成画面で「対応エリア」をどう入力すればよいか分かりません。市区町村まで指定したい場合、全部選ぶ必要があるのでしょうか?
2. 「報酬」欄は税込・税抜のどちらで記入するべきでしょうか? 表示時にどう見えるか不安です。
3. 応募が来た後、メッセージのやり取りはどの画面から行えますか?

初心者向けのチュートリアルや動画があれば共有いただけると助かります。
ご返信お待ちしております。よろしくお願いいたします。`,
        receivedAt: "2026/06/24 14:30",
      }),
    meta: {
      recipient: "フォーム入力 email (送信者本人、未ログインでも可)",
      trigger: "/contact (COM-008) フォーム送信成功時",
      actionFile: "src/app/(public)/contact/actions.ts",
      specRef: "§7.1.A",
      classification: "新規",
      parallel: ["7.1.B"],
    },
  },
  {
    id: "7.1.B",
    section: "§7 お問い合わせ・トラブル報告",
    title: "お問い合わせ運営通知",
    templateFile: "src/lib/email/templates/contact-ops-notification.ts",
    invoke: () =>
      contactOpsNotificationEmail({
        companyName: "山田工務店",
        name: "山田 一郎",
        phone: "090-1234-5678",
        email: "yamada@example.com",
        inquiryType: "サービスの使い方について",
        receivedAt: "2026/06/24 14:30",
        loginStatus: {
          kind: "logged_in",
          memberDisplayName: "株式会社山田工務店",
        },
        siteUrl: APP_URL,
        contactId: "62edfffc-d1ab-4c98-8435-7230ee0c16f7",
      }),
    meta: {
      recipient: "運営 (OPS_NOTIFICATION_EMAIL)",
      trigger: "同上 (7.1.A と並列発火)",
      actionFile: "src/app/(public)/contact/actions.ts",
      specRef: "§7.1.B",
      classification: "新規",
      parallel: ["7.1.A"],
    },
  },
  {
    id: "7.2.A",
    section: "§7 お問い合わせ・トラブル報告",
    title: "トラブル報告 送信者控え",
    templateFile: "src/lib/email/templates/trouble-report-receipt.ts",
    invoke: () =>
      troubleReportReceiptEmail({
        reporterName: "田中 太郎",
        counterpartyName: "山田工務店",
        category: "支払いに関するトラブル",
        content: `発注確定した案件について、約束の支払期日を過ぎても入金がありません。

【案件名】 △△工事 (型枠大工 3 人 / 2026 年 6 月 18 日〜25 日)
【契約金額】 480,000 円 (人工 3 人 × 8 日 × 20,000 円)
【約束の支払期日】 2026 年 6 月 30 日
【現時点 (2026/07/15)】 入金なし

経過:
・7/1 にメッセージで「振込ご確認お願いします」と送信 → 既読つかず
・7/5 に電話 (登録番号) → 不通
・7/8 に再度メッセージ送信 → 既読つかず
・7/12 に郵送で内容証明送付済 (まだ反応なし)

工事は予定通り 6/25 に完了し、発注者側から「現場確認問題なし」の口頭評価をいただいています。完了報告 + 評価提出済で applications.status も completed になっています。

引き続き連絡を試みますが、ビジ友運営からも何かしらアプローチいただけると助かります。ご対応のほどよろしくお願いいたします。`,
        receivedAt: "2026/06/24 14:30",
      }),
    meta: {
      recipient: "フォーム入力 email (送信者本人、ログイン必須)",
      trigger: "/trouble-report (COM-012) フォーム送信成功時",
      actionFile: "src/app/(authenticated)/trouble-report/actions.ts",
      specRef: "§7.2.A",
      classification: "新規",
      parallel: ["7.2.B"],
    },
  },
  {
    id: "7.2.B",
    section: "§7 お問い合わせ・トラブル報告",
    title: "トラブル報告 運営通知",
    templateFile: "src/lib/email/templates/trouble-report-ops-notification.ts",
    invoke: () =>
      troubleReportOpsNotificationEmail({
        reporterName: "田中 太郎",
        memberDisplayName: "田中 太郎",
        accountEmail: "tanaka@example.com",
        organizationName: null,
        formEmail: "tanaka@example.com",
        counterpartyName: "山田工務店",
        category: "支払いに関するトラブル",
        receivedAt: "2026/06/24 14:30",
        siteUrl: APP_URL,
        reportId: "8f8ff681-bd6c-4db0-9df9-38adef0d9908",
      }),
    meta: {
      recipient: "運営 (OPS_NOTIFICATION_EMAIL)",
      trigger: "同上 (7.2.A と並列発火)",
      actionFile: "src/app/(authenticated)/trouble-report/actions.ts",
      specRef: "§7.2.B",
      classification: "新規",
      parallel: ["7.2.A"],
    },
  },
  {
    id: "7.3.A",
    section: "§7 お問い合わせ・トラブル報告",
    title: "求人問合せ 宛先発注者通知",
    templateFile: "src/lib/email/templates/job-inquiry-notification.ts",
    invoke: () =>
      jobInquiryNotificationEmail({
        recipientName: "山田工務店",
        senderName: "田中 太郎",
        senderEmail: "tanaka@example.com",
        topics: ["業務内容", "報酬条件", "稼働期間"],
        content: "御社の募集案件に興味があります。詳細をお伺いしたいのですが...",
      }),
    meta: {
      recipient: "宛先発注者の組織メンバー全員 (M-03 broadcast)",
      trigger: "/clients/[id]/inquiry (COM-013) フォーム送信成功時",
      actionFile: "src/app/(authenticated)/clients/[id]/inquiry/actions.ts",
      specRef: "§7.3.A",
      classification: "改修",
      parallel: ["7.3.B"],
    },
  },
  {
    id: "7.3.B",
    section: "§7 お問い合わせ・トラブル報告",
    title: "求人問合せ 送信者控え",
    templateFile: "src/lib/email/templates/job-inquiry-receipt.ts",
    invoke: () =>
      jobInquiryReceiptEmail({
        senderName: "田中 太郎",
        targetDisplayName: "山田工務店",
        topics: "業務内容、報酬条件、稼働期間",
        content: `はじめまして。田中建設の田中と申します。

御社が募集されている「△△工事 (型枠大工)」の案件に興味があり、応募前にいくつかお伺いしたい点があります。

【業務内容】
募集要項を拝見しましたが、具体的な作業範囲を教えてください。例えば、墨出し・配筋検査の立ち会いも含まれるのか、それとも純粋に型枠の組立・解体のみでしょうか?

【報酬条件】
人工単価は記載されていましたが、休日出勤・夜間作業が発生した場合の追加報酬はありますか? また、交通費は別途支給でしょうか?

【稼働期間】
工期 2026 年 6 月 18 日〜25 日とのことですが、悪天候による順延が発生した場合の対応 (期間延長 / 別日振替) について教えてください。

弊社では型枠工事を主に手掛けており、過去にも類似規模の現場経験があります。前向きに検討させていただきたいので、ご返信いただけますと幸いです。`,
        sentAt: "2026/06/24 14:30",
      }),
    meta: {
      recipient: "送信者本人 1 名 (受注者)",
      trigger: "同上 (7.3.A と並列発火)",
      actionFile: "src/app/(authenticated)/clients/[id]/inquiry/actions.ts",
      specRef: "§7.3.B",
      classification: "新規",
      parallel: ["7.3.A"],
    },
  },

  // ============================================================
  // §8 アカウント管理 (8.1 は Supabase Auth、別配列)
  // ============================================================
  {
    id: "8.2",
    section: "§8 アカウント管理",
    title: "会員登録完了 welcome",
    templateFile: "src/lib/email/templates/registration-completed.ts",
    invoke: () =>
      registrationCompletedEmail({
        recipientName: "田中 太郎",
      }),
    meta: {
      recipient: "登録した本人 1 名",
      trigger: "/register/profile でプロフィール入力完了時",
      actionFile: "src/app/(auth)/register/profile/actions.ts (completeRegistrationAction)",
      specRef: "§8.2",
      classification: "改修",
    },
  },
  {
    id: "8.3",
    section: "§8 アカウント管理",
    title: "退会完了通知",
    templateFile: "src/lib/email/templates/withdrawal-completed.ts",
    invoke: () =>
      withdrawalCompletedEmail({
        recipientName: "田中 太郎",
      }),
    meta: {
      recipient: "退会した本人 1 名",
      trigger: "/mypage/withdrawal で退会実行成功後",
      actionFile: "src/app/(authenticated)/mypage/withdrawal/actions.ts (withdrawAction)",
      specRef: "§8.3",
      classification: "改修",
    },
  },
  {
    id: "8.4",
    section: "§8 アカウント管理",
    title: "admin 強制削除時の本人通知",
    templateFile: "src/lib/email/templates/account-suspended-by-admin.ts",
    invoke: () =>
      accountSuspendedByAdminEmail({
        recipientName: "田中 太郎",
      }),
    meta: {
      recipient: "強制削除された本人 1 名",
      trigger: "admin が ADM-009 でユーザーを強制削除時",
      actionFile: "src/app/admin/(protected)/users/[id]/actions.ts",
      specRef: "§8.4",
      classification: "新規",
    },
  },
  {
    id: "8.5.A-1",
    section: "§8 アカウント管理",
    title: "Owner 退会カスケード - 代理 staff (残存あり)",
    templateFile: "src/lib/email/templates/account-cascade-frozen-proxy.ts",
    invoke: () =>
      accountCascadeFrozenProxyEmail({
        recipientName: "佐藤 運営スタッフ",
        organizationName: "株式会社○○建設",
        ownerName: "山田 一郎",
        withdrawnAt: "2026/06/25 10:30",
        hasRemainingMembership: true,
      }),
    meta: {
      recipient: "凍結される代理 staff 本人",
      trigger: "法人 Owner 退会時、配下の代理 staff が他法人で代理在籍を残しているケース",
      actionFile: "src/lib/withdrawal/execute.ts (executeWithdrawal 組織カスケード)",
      specRef: "§8.5.A-1",
      classification: "新規",
    },
  },
  {
    id: "8.5.A-2",
    section: "§8 アカウント管理",
    title: "Owner 退会カスケード - 代理 staff (残存なし全離脱)",
    templateFile: "src/lib/email/templates/account-cascade-frozen-proxy.ts",
    invoke: () =>
      accountCascadeFrozenProxyEmail({
        recipientName: "佐藤 運営スタッフ",
        organizationName: "株式会社○○建設",
        ownerName: "山田 一郎",
        withdrawnAt: "2026/06/25 10:30",
        hasRemainingMembership: false,
      }),
    meta: {
      recipient: "凍結される代理 staff 本人",
      trigger: "法人 Owner 退会時、配下の代理 staff がすべての法人組織から外れるケース",
      actionFile: "src/lib/withdrawal/execute.ts (executeWithdrawal 組織カスケード)",
      specRef: "§8.5.A-2",
      classification: "新規",
    },
  },
  {
    id: "8.5.5",
    section: "§8 アカウント管理",
    title: "Owner 退会カスケード - 通常 staff / admin",
    templateFile: "src/lib/email/templates/account-cascade-frozen-staff.ts",
    invoke: () =>
      accountCascadeFrozenStaffEmail({
        recipientName: "田中 太郎",
        organizationName: "株式会社○○建設",
        ownerName: "山田 一郎",
        withdrawnAt: "2026/06/25 10:30",
      }),
    meta: {
      recipient: "凍結される通常 staff / admin 本人",
      trigger: "法人 Owner 退会時、配下の通常メンバー (is_proxy=false) 全員 1 通ずつ",
      actionFile: "src/lib/withdrawal/execute.ts (executeWithdrawal 組織カスケード)",
      specRef: "§8.5.5",
      classification: "新規",
    },
  },
  {
    id: "8.6",
    section: "§8 アカウント管理",
    title: "admin PW 変更完了通知",
    templateFile: "src/lib/email/templates/admin-password-changed.ts",
    invoke: () =>
      adminPasswordChangedEmail({
        recipientName: "鈴木 運営",
        changedAt: "2026/06/24 11:00",
      }),
    meta: {
      recipient: "PW 変更した admin 本人 1 名",
      trigger: "admin が /admin/account/password で PW を変更した時",
      actionFile: "src/app/admin/(protected)/account/password/actions.ts",
      specRef: "§8.6",
      classification: "新規",
    },
  },

  // ============================================================
  // §9 システム運用 (運営宛)
  // ============================================================
  {
    id: "9.1",
    section: "§9 システム運用 (運営宛)",
    title: "担当者追加失敗アラート",
    templateFile: "src/lib/email/templates/orphan-auth-user-alert.ts",
    invoke: () =>
      orphanAuthUserAlertEmail({
        occurredAt: "2026/06/24 14:30",
        organizationName: "株式会社○○建設",
        invitedEmail: "tanaka@example.com",
      }),
    meta: {
      recipient: "運営 (OPS_NOTIFICATION_EMAIL)",
      trigger: "createMemberAction で invite RPC 成功後、後続 DB INSERT が失敗 + cleanup も失敗した時",
      actionFile: "src/app/(authenticated)/mypage/members/actions.ts (createMemberAction エラー分岐)",
      specRef: "§9.1",
      classification: "改修",
    },
  },
  {
    id: "9.2",
    section: "§9 システム運用 (運営宛)",
    title: "使用済みメアド片付け失敗アラート",
    templateFile: "src/lib/email/templates/email-recycle-failure-alert.ts",
    invoke: () =>
      emailRecycleFailureAlertEmail({
        occurredAt: "2026/06/24 14:30",
        triggerLabel: "退会",
        targetEmail: "tanaka@example.com",
        targetDisplayName: "田中 太郎",
        organizationName: "株式会社○○建設",
      }),
    meta: {
      recipient: "運営 (OPS_NOTIFICATION_EMAIL)",
      trigger: "退会 / 担当者削除 / admin 強制削除のいずれかで auth.users.email の suffix 印付けに失敗した時",
      actionFile: "src/lib/withdrawal/execute.ts / mypage/members/actions.ts / admin actions (各カスケード)",
      specRef: "§9.2",
      classification: "新規",
    },
  },
];

// === Supabase Auth テンプレ fixtures (4 ファイル、招待は 3 ケース) ===

interface AuthFixture {
  id: string;
  section: string;
  title: string;
  templateFile: string;
  goTemplateFile: string;
  data: Record<string, any>;
  subject: string;
  meta: {
    recipient: string;
    trigger: string;
    actionFile?: string;
    specRef: string;
    classification: Classification;
    parallel?: string[];
    notes?: string;
  };
}

const authFixtures: AuthFixture[] = [
  {
    id: "5.1-Staff",
    section: "§5 担当者管理",
    title: "招待メール (通常 staff)",
    templateFile: "supabase/templates/invite.html",
    goTemplateFile: "invite.html",
    data: {
      Email: "tanaka@example.com",
      ConfirmationURL: `${APP_URL}/accept-invite/confirm#access_token=DUMMY&refresh_token=DUMMY`,
      Data: {
        invited_last_name: "田中",
        invited_first_name: "太郎",
        invited_org_name: "株式会社○○建設",
        is_proxy_account: "",
        invited_company_name: "",
        invited_by_name: "山田 一郎",
        invited_at: "2026/06/23 10:30",
      },
    },
    subject: "【ビジ友】ビジ友へのご招待",
    meta: {
      recipient: "新規 staff 招待対象者本人 1 名",
      trigger: "Owner/admin が CLI-022 で通常担当者を招待時 (代理 OFF)",
      actionFile: "src/app/(authenticated)/mypage/members/actions.ts (createMemberAction)",
      specRef: "§5.1-Staff",
      classification: "Supabase Auth",
      parallel: ["5.2.A"],
    },
  },
  {
    id: "5.1-Proxy",
    section: "§5 担当者管理",
    title: "招待メール (代理 staff)",
    templateFile: "supabase/templates/invite.html",
    goTemplateFile: "invite.html",
    data: {
      Email: "sato@example.com",
      ConfirmationURL: `${APP_URL}/accept-invite/confirm#access_token=DUMMY&refresh_token=DUMMY`,
      Data: {
        invited_last_name: "佐藤",
        invited_first_name: "運営スタッフ",
        invited_org_name: "株式会社○○建設",
        is_proxy_account: "true",
        invited_company_name: "",
        invited_by_name: "山田 一郎",
        invited_at: "2026/06/23 10:30",
      },
    },
    subject: "【ビジ友 運営】「株式会社○○建設」の代理アカウントとしてご招待",
    meta: {
      recipient: "新規代理 staff 招待対象者本人 1 名 (= ビジ友運営スタッフ)",
      trigger: "Owner/admin が CLI-022 で代理 ON で招待時",
      actionFile: "src/app/(authenticated)/mypage/members/actions.ts (createMemberAction)",
      specRef: "§5.1-Proxy",
      classification: "Supabase Auth",
      parallel: ["5.6.D"],
    },
  },
  {
    id: "5.1-Client",
    section: "§5 担当者管理",
    title: "招待メール (発注者)",
    templateFile: "supabase/templates/invite.html",
    goTemplateFile: "invite.html",
    data: {
      Email: "yamada@example.com",
      ConfirmationURL: `${APP_URL}/accept-invite/confirm#access_token=DUMMY&refresh_token=DUMMY`,
      Data: {
        invited_last_name: "山田",
        invited_first_name: "一郎",
        invited_company_name: "株式会社□□工務店",
        is_proxy_account: "",
        invited_org_name: "",
      },
    },
    subject: "【ビジ友】ビジ友へのご招待",
    meta: {
      recipient: "新規発注者招待対象者本人 1 名",
      trigger: "ビジ友 admin が ADM-006/007 で発注者を招待時",
      actionFile: "src/app/admin/(protected)/clients/new/actions.ts (createClientInviteAction)",
      specRef: "§5.1-Client",
      classification: "Supabase Auth",
      parallel: ["5.2.B"],
    },
  },
  {
    id: "5.5",
    section: "§5 担当者管理",
    title: "メールアドレス変更確認 (旧+新 両宛 共通テンプレ)",
    templateFile: "supabase/templates/email-change-new.html",
    goTemplateFile: "email-change-new.html",
    data: {
      Email: "tanaka@example.com",
      NewEmail: "tanaka.new@example.com",
      ConfirmationURL: `${APP_URL}/email-change-confirmed#access_token=DUMMY&refresh_token=DUMMY`,
    },
    subject: "【ビジ友】メールアドレス変更のご確認",
    meta: {
      recipient: "変更前 email + 変更後 email の両方 (パターン X 統合により同一本文)",
      trigger: "/profile/edit または /mypage/members でメールアドレス変更操作時",
      actionFile: "src/app/(authenticated)/profile/edit/actions.ts / mypage/members/actions.ts (updateMemberAction パターン A)",
      specRef: "§5.5",
      classification: "Supabase Auth",
      notes: "パターン X = 単一テンプレで旧+新 両宛に同一本文配信 (CLI v2.75.0 検証済)",
    },
  },
  {
    id: "5.8",
    section: "§5 担当者管理",
    title: "パスワードリセット",
    templateFile: "supabase/templates/recovery.html",
    goTemplateFile: "recovery.html",
    data: {
      Email: "tanaka@example.com",
      ConfirmationURL: `${APP_URL}/auth/callback?next=/reset-password/confirm&code=DUMMY`,
    },
    subject: "【ビジ友】パスワード再設定のご案内",
    meta: {
      recipient: "パスワードリセット申請した本人 1 名",
      trigger: "/reset-password でユーザーがメールアドレス入力 + 送信時",
      actionFile: "src/app/(auth)/reset-password/actions.ts (resetPasswordAction)",
      specRef: "§5.8",
      classification: "Supabase Auth",
      parallel: ["5.8.A"],
    },
  },
  {
    id: "8.1",
    section: "§8 アカウント管理",
    title: "サインアップ確認メール",
    templateFile: "supabase/templates/confirmation.html",
    goTemplateFile: "confirmation.html",
    data: {
      Email: "tanaka@example.com",
      ConfirmationURL: `${APP_URL}/register/verify#access_token=DUMMY&refresh_token=DUMMY`,
    },
    subject: "【ビジ友】ご登録確認のお願い",
    meta: {
      recipient: "新規サインアップ申請したユーザー本人 1 名",
      trigger: "/register でメールアドレス + パスワード入力 + 送信時",
      actionFile: "src/app/(auth)/register/actions.ts (signupAction)",
      specRef: "§8.1",
      classification: "Supabase Auth",
    },
  },
];

// === HTML 生成ヘルパー ===

function wrapWithMeta(
  result: { subject: string; html: string },
  meta: {
    id: string;
    section: string;
    title: string;
    templateFile: string;
    recipient: string;
    trigger: string;
    actionFile?: string;
    specRef: string;
    classification: Classification;
    parallel?: string[];
    notes?: string;
  },
): string {
  const parallel = meta.parallel?.length ? meta.parallel.join(" / ") : "なし";
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(meta.id)} ${escapeHtml(meta.title)} | メールプレビュー</title>
<style>
  body { margin: 0; font-family: 'Zen Kaku Gothic New', 'ヒラギノ角ゴ ProN', sans-serif; background: #f0eef3; }
  .meta-panel {
    background: #fff;
    border-bottom: 3px solid #920783;
    padding: 16px 24px;
    font-size: 13px;
    line-height: 1.7;
    color: #333;
  }
  .meta-panel h1 {
    margin: 0 0 8px;
    font-size: 16px;
    color: #920783;
  }
  .meta-panel dl {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 4px 16px;
    margin: 0;
  }
  .meta-panel dt {
    color: #666;
    font-weight: normal;
  }
  .meta-panel dd {
    margin: 0;
    color: #222;
  }
  .meta-panel .tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    margin-left: 4px;
  }
  .meta-panel .tag-new { background: #d4edda; color: #155724; }
  .meta-panel .tag-mod { background: #fff3cd; color: #856404; }
  .meta-panel .tag-keep { background: #d1ecf1; color: #0c5460; }
  .meta-panel .tag-auth { background: #e2e3e5; color: #383d41; }
  .meta-panel .nav {
    margin-top: 12px;
    font-size: 12px;
  }
  .meta-panel .nav a {
    color: #920783;
    text-decoration: none;
    margin-right: 12px;
  }
  .email-frame {
    padding: 16px;
  }
  .email-frame .container {
    margin: 0 auto;
    max-width: 700px;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    overflow: hidden;
  }
  .links-extracted {
    margin: 16px auto;
    max-width: 700px;
    background: #fff;
    border-radius: 8px;
    padding: 16px 20px;
    font-size: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  .links-extracted h2 {
    margin: 0 0 8px;
    font-size: 13px;
    color: #920783;
  }
  .links-extracted ul { margin: 0; padding-left: 18px; }
  .links-extracted li { color: #666; word-break: break-all; }
  .links-extracted .url { color: #1a73e8; }
</style>
</head>
<body>
<div class="meta-panel">
  <h1>${escapeHtml(meta.id)} ${escapeHtml(meta.title)} <span class="tag ${classificationTagClass(meta.classification)}">${escapeHtml(meta.classification)}</span></h1>
  <dl>
    <dt>件名</dt><dd>${escapeHtml(result.subject)}</dd>
    <dt>宛先</dt><dd>${escapeHtml(meta.recipient)}</dd>
    <dt>いつ送られるか</dt><dd>${escapeHtml(meta.trigger)}</dd>
    ${meta.actionFile ? `<dt>発火元</dt><dd><code>${escapeHtml(meta.actionFile)}</code></dd>` : ""}
    <dt>並列発火</dt><dd>${escapeHtml(parallel)}</dd>
    <dt>テンプレ</dt><dd><code>${escapeHtml(meta.templateFile)}</code></dd>
    <dt>仕様参照</dt><dd>${escapeHtml(meta.specRef)} (.kiro/specs/notifications/email-decisions-wip.md)</dd>
    <dt>セクション</dt><dd>${escapeHtml(meta.section)}</dd>
    ${meta.notes ? `<dt>備考</dt><dd>${escapeHtml(meta.notes)}</dd>` : ""}
  </dl>
  <div class="nav">
    <a href="./index.html">← 索引に戻る</a>
  </div>
</div>
<div class="email-frame">
  <div class="container">
${result.html}
  </div>
</div>
${renderLinksExtracted(result.html)}
</body>
</html>`;
}

function renderLinksExtracted(html: string): string {
  const links = extractHrefs(html);
  if (links.length === 0) {
    return `<div class="links-extracted"><h2>メール内リンク</h2><p style="margin:0;color:#999;">なし (M-04 適合)</p></div>`;
  }
  const items = links
    .map((url) => `<li><a href="${escapeHtml(url)}" class="url" target="_blank" rel="noopener">${escapeHtml(url)}</a></li>`)
    .join("");
  return `<div class="links-extracted"><h2>メール内リンク (クリックで dev server に遷移)</h2><ul>${items}</ul></div>`;
}

function extractHrefs(html: string): string[] {
  const re = /href="([^"]+)"/g;
  const seen = new Set<string>();
  const result: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    if (!seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }
  return result;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function classificationTagClass(c: Classification): string {
  if (c === "新規") return "tag-new";
  if (c === "改修") return "tag-mod";
  if (c === "既存維持") return "tag-keep";
  return "tag-auth";
}

function safeFilename(id: string): string {
  return id.replace(/\./g, "-").replace(/[^A-Za-z0-9_-]/g, "_") + ".html";
}

function generateIndex(
  entries: Array<{
    id: string;
    section: string;
    title: string;
    subject: string;
    recipient: string;
    trigger: string;
    classification: Classification;
    filename: string;
    specRef: string;
    notes?: string;
  }>,
): string {
  // 節ごとにグルーピング
  const bySection = new Map<string, typeof entries>();
  for (const e of entries) {
    if (!bySection.has(e.section)) bySection.set(e.section, []);
    bySection.get(e.section)!.push(e);
  }

  const sectionOrder = [
    "§1 案件・応募・スカウト",
    "§2 メッセージ",
    "§3 完了・評価",
    "§4 本人確認・CCUS",
    "§5 担当者管理",
    "§6 課金・サブスクリプション",
    "§7 お問い合わせ・トラブル報告",
    "§8 アカウント管理",
    "§9 システム運用 (運営宛)",
  ];

  let bodyContent = "";
  for (const section of sectionOrder) {
    const list = bySection.get(section);
    if (!list) continue;
    bodyContent += `<h2 class="section-header">${escapeHtml(section)} <span class="count">(${list.length} 通)</span></h2>`;
    bodyContent += `<table class="entries"><thead><tr>
      <th class="col-id">ID</th>
      <th class="col-title">タイトル / 件名</th>
      <th class="col-recipient">宛先</th>
      <th class="col-trigger">いつ送られるか</th>
      <th class="col-class">種別</th>
      <th class="col-action">プレビュー</th>
    </tr></thead><tbody>`;
    for (const e of list) {
      bodyContent += `<tr>
        <td class="col-id"><code>${escapeHtml(e.id)}</code></td>
        <td class="col-title">
          <strong>${escapeHtml(e.title)}</strong>
          <div class="subject">${escapeHtml(e.subject)}</div>
          ${e.notes ? `<div class="notes">※ ${escapeHtml(e.notes)}</div>` : ""}
        </td>
        <td class="col-recipient">${escapeHtml(e.recipient)}</td>
        <td class="col-trigger">${escapeHtml(e.trigger)}</td>
        <td class="col-class"><span class="tag ${classificationTagClass(e.classification)}">${escapeHtml(e.classification)}</span></td>
        <td class="col-action"><a href="./${escapeHtml(e.filename)}" target="_blank">[開く]</a></td>
      </tr>`;
    }
    bodyContent += `</tbody></table>`;
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>ビジ友 メール通知プレビュー (全 ${entries.length} 通)</title>
<style>
  body {
    margin: 0;
    font-family: 'Zen Kaku Gothic New', 'ヒラギノ角ゴ ProN', sans-serif;
    background: #f5f3f7;
    color: #222;
  }
  header {
    background: #920783;
    color: #fff;
    padding: 24px 32px;
  }
  header h1 { margin: 0; font-size: 22px; }
  header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
  main {
    padding: 24px 32px 80px;
    max-width: 1400px;
    margin: 0 auto;
  }
  .section-header {
    margin: 36px 0 12px;
    padding: 8px 12px;
    background: #fff;
    border-left: 4px solid #920783;
    font-size: 16px;
    border-radius: 4px;
  }
  .section-header .count {
    font-size: 12px;
    color: #666;
    font-weight: normal;
    margin-left: 8px;
  }
  table.entries {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    border-radius: 6px;
    overflow: hidden;
    font-size: 13px;
  }
  table.entries th {
    background: #f0eef3;
    padding: 10px 12px;
    text-align: left;
    font-size: 12px;
    color: #555;
    border-bottom: 1px solid #ddd;
    font-weight: normal;
  }
  table.entries td {
    padding: 12px;
    border-bottom: 1px solid #eee;
    vertical-align: top;
    line-height: 1.6;
  }
  table.entries tr:last-child td { border-bottom: none; }
  table.entries tr:hover { background: #faf7fb; }
  .col-id { width: 80px; }
  .col-title { width: 25%; }
  .col-recipient { width: 18%; }
  .col-trigger { width: 30%; color: #555; }
  .col-class { width: 70px; }
  .col-action { width: 60px; text-align: center; }
  .col-id code, code {
    font-family: 'SF Mono', Consolas, monospace;
    font-size: 12px;
    background: #f5f3f7;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .subject {
    color: #666;
    font-size: 12px;
    margin-top: 4px;
  }
  .notes {
    color: #999;
    font-size: 11px;
    margin-top: 4px;
    font-style: italic;
  }
  .tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
  }
  .tag-new { background: #d4edda; color: #155724; }
  .tag-mod { background: #fff3cd; color: #856404; }
  .tag-keep { background: #d1ecf1; color: #0c5460; }
  .tag-auth { background: #e2e3e5; color: #383d41; }
  .col-action a {
    display: inline-block;
    padding: 4px 12px;
    background: #920783;
    color: #fff;
    text-decoration: none;
    border-radius: 4px;
    font-size: 12px;
  }
  .col-action a:hover { background: #6f0563; }
  .toc {
    background: #fff;
    padding: 16px 20px;
    margin: 16px 0;
    border-radius: 6px;
    font-size: 13px;
  }
  .toc a {
    color: #920783;
    text-decoration: none;
    margin-right: 16px;
    display: inline-block;
    padding: 2px 0;
  }
  .guide {
    background: #fff4e5;
    border-left: 4px solid #f7a01b;
    padding: 16px 20px;
    margin: 16px 0;
    border-radius: 4px;
    font-size: 13px;
    line-height: 1.7;
  }
  .guide h3 {
    margin: 0 0 8px;
    font-size: 14px;
    color: #c4761a;
  }
  .guide ul { margin: 0; padding-left: 20px; }
</style>
</head>
<body>
<header>
  <h1>ビジ友 メール通知プレビュー</h1>
  <p>全 ${entries.length} 通 (45 種 × 分岐展開) | クリックで HTML 表示、メール内リンクを押すと dev server (${APP_URL}) に遷移</p>
</header>
<main>
  <div class="guide">
    <h3>使い方</h3>
    <ul>
      <li><strong>見た目だけ確認したい</strong> → 各行の [開く] をクリック → 別タブで HTML 表示 (情報パネル + メール本文 + 抽出されたリンク一覧)</li>
      <li><strong>リンク先 page も確認したい</strong> → 事前に <code>supabase start</code> + <code>npm run dev</code> で dev server 起動 → ログイン (テストユーザー: contractor@test.local / client@test.local / admin@test.local) → メール内 CTA や 「お問い合わせ窓口: /contact」をクリック → 飛び先ページのデザイン確認</li>
      <li><strong>Auth flow 4 系統 (招待 / メール変更 / PW リセット / サインアップ確認)</strong> → 同階層の <a href="./auth-flow-guide.md" target="_blank"><code>auth-flow-guide.md</code></a> 参照 (Inbucket 経由で実 token を取って成功 page のデザイン確認)</li>
    </ul>
  </div>
  <div class="toc">
    <strong>節ジャンプ:</strong>
    ${sectionOrder
      .filter((s) => bySection.has(s))
      .map((s) => `<a href="#${encodeURIComponent(s)}">${escapeHtml(s)}</a>`)
      .join("")}
  </div>
  ${bodyContent.replace(/<h2 class="section-header">(§[^ ]+ [^<]+)/g, (_, sec) => `<h2 class="section-header" id="${encodeURIComponent(sec.trim().replace(/ \(.+\)$/, ""))}">${sec}`)}
</main>
</body>
</html>`;
}

// === 実行 ===

describe.skipIf(!process.env.GENERATE_EMAIL_PREVIEWS)("email preview generator", () => {
  it("generates HTML previews for all email branches", () => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const entries: Array<{
      id: string;
      section: string;
      title: string;
      subject: string;
      recipient: string;
      trigger: string;
      classification: Classification;
      filename: string;
      specRef: string;
      notes?: string;
    }> = [];

    // Resend テンプレ
    for (const f of fixtures) {
      const result = f.invoke();
      const filename = safeFilename(f.id);
      const wrapped = wrapWithMeta(result, {
        id: f.id,
        section: f.section,
        title: f.title,
        templateFile: f.templateFile,
        recipient: f.meta.recipient,
        trigger: f.meta.trigger,
        actionFile: f.meta.actionFile,
        specRef: f.meta.specRef,
        classification: f.meta.classification,
        parallel: f.meta.parallel,
        notes: f.meta.notes,
      });
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), wrapped, "utf-8");
      entries.push({
        id: f.id,
        section: f.section,
        title: f.title,
        subject: result.subject,
        recipient: f.meta.recipient,
        trigger: f.meta.trigger,
        classification: f.meta.classification,
        filename,
        specRef: f.meta.specRef,
        notes: f.meta.notes,
      });
    }

    // Supabase Auth テンプレ
    for (const af of authFixtures) {
      const raw = fs.readFileSync(
        path.join(SUPABASE_TEMPLATES_DIR, af.goTemplateFile),
        "utf-8",
      );
      const rendered = renderGoTemplate(raw, af.data);
      const filename = safeFilename(af.id);
      const wrapped = wrapWithMeta(
        { subject: af.subject, html: rendered },
        {
          id: af.id,
          section: af.section,
          title: af.title,
          templateFile: af.templateFile,
          recipient: af.meta.recipient,
          trigger: af.meta.trigger,
          actionFile: af.meta.actionFile,
          specRef: af.meta.specRef,
          classification: af.meta.classification,
          parallel: af.meta.parallel,
          notes: af.meta.notes,
        },
      );
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), wrapped, "utf-8");
      entries.push({
        id: af.id,
        section: af.section,
        title: af.title,
        subject: af.subject,
        recipient: af.meta.recipient,
        trigger: af.meta.trigger,
        classification: af.meta.classification,
        filename,
        specRef: af.meta.specRef,
        notes: af.meta.notes,
      });
    }

    // 索引
    const indexHtml = generateIndex(entries);
    fs.writeFileSync(path.join(OUTPUT_DIR, "index.html"), indexHtml, "utf-8");

    // 標準出力に件数報告 (vitest reporter で見える)
    // eslint-disable-next-line no-console
    console.log(
      `\n[email-preview-gen] generated ${entries.length} email previews + index.html\n  output: ${OUTPUT_DIR}\n  open:   file://${path.join(OUTPUT_DIR, "index.html")}\n`,
    );
  });
});
