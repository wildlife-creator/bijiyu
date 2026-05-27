/**
 * Option constants for profile-related forms.
 */

// ---------------------------------------------------------------------------
// Withdrawal reasons (COM-006)
// ---------------------------------------------------------------------------
// 依頼人提供の選択肢をカテゴリ順に並べ替え（文言は原文どおり / 追加・削除なし）。
// 「その他」は常に末尾固定。
//
// code = 集計のグルーピングキー（文言を変えても不変。退会理由を DB に保存する際の
//        正規キー）。label = 画面表示文。文言を言い換えても code が同じなら集計は
//        1 つにまとまる（label だけ保存すると名寄せが必要になる）。
export const WITHDRAWAL_REASONS = [
  // マッチング
  { code: "no_inquiries", label: "仕事の依頼が来なかった" },
  { code: "no_suitable_jobs", label: "希望に合う案件が見つからなかった" },
  // 料金
  { code: "price_high", label: "料金が高い" },
  // プロダクト
  { code: "hard_to_use", label: "サイトが使いづらい" },
  { code: "missing_features", label: "ほしい機能がなかった" },
  { code: "not_as_expected", label: "期待していたサービスと違った" },
  // 状況変化
  { code: "got_busy", label: "仕事が忙しくなった" },
  { code: "left_construction", label: "建設業を辞めた" },
  // 他社移行
  { code: "switched_tsukurink", label: "他社サービスに乗り換えた（ツクリンク）" },
  { code: "switched_suketto", label: "他社サービスに乗り換えた（助太刀）" },
  { code: "switched_other", label: "他社サービスに乗り換えた（その他）" },
  // その他（末尾固定）
  { code: "other", label: "その他" },
] as const;

export type WithdrawalReasonCode = (typeof WITHDRAWAL_REASONS)[number]["code"];

/** 退会理由の code から表示文を引く（未知の code は null） */
export function getWithdrawalReasonLabel(code: string): string | null {
  return WITHDRAWAL_REASONS.find((r) => r.code === code)?.label ?? null;
}
