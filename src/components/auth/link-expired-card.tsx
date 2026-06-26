interface LinkExpiredCardProps {
  /**
   * シナリオ別の再申請案内文。spec §8 共通 prerequisites の 5 パターン:
   *   - 招待(Staff/Proxy/Client 統合): 「お手数ですが、招待元(管理責任者または ビジ友運営)へ再送をご依頼ください。」
   *   - メール変更: 「お手数ですが、もう一度メールアドレス変更をお申し込みください。」
   *   - PW リセット: 「お手数ですが、もう一度パスワード再設定をお申し込みください。」
   *   - サインアップ確認: 「お手数ですが、もう一度ご登録をお申し込みください。」
   */
  actionText: string;
}

/**
 * メールリンクの期限切れ / 使用済み時の共通カード(spec §8 共通 prerequisites)。
 *
 * `<EmailLandingCard>` の中に置く前提(カード chrome は親が持つ)。
 * ヘッダと理由文は完全ハードコード、actionText のみ props 切替。
 * CTA ボタン無し(ログイン状態に依存する遷移を避け、テキスト案内のみで安全運用)。
 */
export function LinkExpiredCard({ actionText }: LinkExpiredCardProps) {
  return (
    <div className="space-y-6">
      <h1 className="text-heading-xl font-bold text-secondary">
        リンクが有効ではありません
      </h1>
      <p className="text-body-base leading-relaxed">
        リンクの有効期限(24 時間)が切れているか、すでに別の端末でご利用済みの可能性があります。
      </p>
      <p className="text-body-base leading-relaxed">{actionText}</p>
    </div>
  );
}
