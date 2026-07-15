/**
 * 利用規約・プライバシーポリシー・特定商取引法に基づく表記の本文を表す型。
 *
 * 本文は `docs/legal/*.md` を唯一の正とし、文字列はそこから一字も変えずに写す。
 * Markdown の見出し・箇条書き・表といった構造だけを、この型でアプリ側の
 * 見た目に読み替える。文言の変更が必要になった場合は、必ず先に md を直すこと
 * （`src/__tests__/legal/legal-content.test.ts` が md との一致を検証している）。
 */
export type LegalBlock =
  /** 通常の段落（条文の各項など）。 */
  | { type: "paragraph"; text: string }
  /** 「次の各号」「以下のとおり」に続く列挙。番号付きで描画する。 */
  | { type: "list"; items: string[] }
  /** 条の中の小見出し（プライバシーポリシー第2条の「1. 取得する情報」など）。 */
  | { type: "subheading"; text: string }
  /** 問い合わせ窓口のような、行を詰めて見せたい連絡先ブロック。 */
  | { type: "contact"; lines: string[] }
  /** 表（プライバシーポリシー第6条の委託先一覧）。 */
  | { type: "table"; headers: string[]; rows: string[][] };

/** 「第N条（見出し）」ひとまとまり。特商法ページでは「販売事業者」等の項目に相当する。 */
export interface LegalArticle {
  title: string;
  blocks: LegalBlock[];
}

/** よくある質問の 1 問答。 */
export interface FaqItem {
  /** 「Q1. アカウント登録の方法を教えてください。」のように、md の採番をそのまま含む。 */
  question: string;
  /** 「A. 〜」のように、md の接頭辞をそのまま含む。 */
  answer: string;
}

/** よくある質問のカテゴリ（「① アカウント・登録」など）。 */
export interface FaqCategory {
  category: string;
  items: FaqItem[];
}
