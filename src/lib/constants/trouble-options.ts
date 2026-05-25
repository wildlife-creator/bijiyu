// ---------------------------------------------------------------------------
// Trouble report options (COM-012)
// ---------------------------------------------------------------------------
// 値はラベル文字列で保存する（Requirements 9.1-9.3）。

// トラブル種類（任意・単一選択）
export const TROUBLE_CATEGORIES = [
  "連絡が取れない",
  "支払いトラブル",
  "仕事内容が違う",
  "迷惑行為",
  "その他",
] as const;
export type TroubleCategory = (typeof TROUBLE_CATEGORIES)[number];
