// ---------------------------------------------------------------------------
// Contact form options (COM-008)
// ---------------------------------------------------------------------------
// 値はラベル文字列で保存する。後から増減・改名・削除しても過去データは壊れない
// （Requirements 9.1-9.3）。将来 master テーブル化する場合もこの定数を起点にする。

// お問い合わせ内容（必須・単一選択）
export const CONTACT_INQUIRY_TYPES = [
  "登録方法",
  "料金について",
  "仕事掲載",
  "協力会社募集",
  "職人募集",
  "その他",
] as const;
export type ContactInquiryType = (typeof CONTACT_INQUIRY_TYPES)[number];

// ビジ友の利用目的（必須・単一選択）
export const CONTACT_PURPOSES = [
  "仕事を依頼したい",
  "協力会社を探したい",
  "職人として仕事を探したい",
  "元請けになりたい",
  "サービスを詳しく知りたい",
] as const;
export type ContactPurpose = (typeof CONTACT_PURPOSES)[number];

// 業種・職種（必須・単一選択）
// ※ profile の master_trade_types とは別の、問い合わせ分類用の簡易リスト。
//   user_skills.trade_type と紛らわしいため列名・定数名は industry とする。
export const CONTACT_INDUSTRIES = [
  "大工",
  "左官",
  "タイル",
  "電気",
  "設備",
  "内装",
  "解体",
  "外構",
  "塗装",
  "その他",
] as const;
export type ContactIndustry = (typeof CONTACT_INDUSTRIES)[number];

// 動画掲載の相談（任意・単一選択）
export const CONTACT_VIDEO_CONSULTATIONS = [
  "会社紹介動画を作りたい",
  "施工動画を掲載したい",
  "相談したい",
] as const;
export type ContactVideoConsultation =
  (typeof CONTACT_VIDEO_CONSULTATIONS)[number];
