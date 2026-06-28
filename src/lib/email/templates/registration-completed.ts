import { paragraph, renderLayout } from "@/lib/email/components";

interface RegistrationCompletedEmailProps {
  /** 受信者の表示名 (姓 + 名 スペースなし、CLAUDE.md「日本語の姓名結合はスペースなし」準拠) */
  recipientName: string;
}

/**
 * §8.2 会員登録完了 welcome 通知 (既存 inline → テンプレ化)。
 *
 * 発火: `completeRegistrationAction` 末尾 (password update 成功後、return success の前)。
 *
 * 旧実装からの変更点:
 * - 件名「ビジ友へようこそ！」→「【ビジ友】会員登録が完了しました」(プレフィックス統一)
 * - 「ビジ友運営チーム」署名削除 (他テンプレと統一)
 * - スペースなし結合に統一 (旧コード `${data.lastName} ${data.firstName}` はスペースあり違反)
 *
 * closing は §6「opening マーケ調一括削除」原則の **限定適用** で
 * 「ぜひサービスをご活用ください。」を 1 行残す:
 *   - §6 は「繰り返し届くメール」(プラン変更・支払い失敗等) 向け
 *   - §8.2 は「1 回限りの節目メール」のため優しめトーン許容
 *   - §1.6.A 「おめでとうございます！」削除との対比: §1.6.A は受注決定で
 *     ビジネスメールとしてマーケ調が浮きやすい文脈、§8.2 はサービス登録で
 *     「これからよろしく」のニュアンスが自然
 *
 * §8.1 と §8.2 の役割分離:
 *   - §8.1 = 「メアド確認の鍵」(認証、Supabase Auth カスタムテンプレ)
 *   - §8.2 = 「プロフィール完了の祝意」(control、Resend テンプレ = 本ファイル)
 */
export function registrationCompletedEmail({
  recipientName,
}: RegistrationCompletedEmailProps): { subject: string; html: string } {
  return {
    subject: "【ビジ友】会員登録が完了しました",
    html: renderLayout({
      title: "会員登録が完了しました",
      bodyContent: [
        paragraph(`${recipientName} 様`),
        paragraph("ビジ友への会員登録が完了しました。", { tight: true }),
        paragraph("ぜひサービスをご活用ください。", { last: true }),
      ].join(""),
    }),
  };
}
