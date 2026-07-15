import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { FAQ_CATEGORIES } from "@/app/(support)/faq/content";
import { LEGAL_ARTICLES } from "@/app/(support)/legal/content";
import {
  PRIVACY_ARTICLES,
  PRIVACY_CLOSING,
  PRIVACY_PREAMBLE,
} from "@/app/(support)/privacy/content";
import { TERMS_ARTICLES, TERMS_PREAMBLE } from "@/app/(support)/terms/content";
import type { LegalArticle, LegalBlock } from "@/lib/legal/types";

/**
 * 法務 4 ページの本文が docs/legal/*.md と一言一句一致していることを検証する。
 *
 * これらのページは文言そのものが成果物であり、要約・言い換え・誤字修正のいずれも
 * 許されない。md → TypeScript への書き写しは人手なので、ここで機械的に突き合わせる。
 * 文言を直すときは必ず md を先に直し、その差分をページ側へ反映すること。
 */

const DOCS_DIR = resolve(__dirname, "../../../docs/legal");

function readDoc(fileName: string): string {
  return readFileSync(resolve(DOCS_DIR, fileName), "utf-8");
}

/**
 * 比較用に「文字列の中身だけ」を取り出す。
 * 見た目のための記法（強調・リンク・エスケープ・箇条書きの採番）は
 * md 側とページ側で表現が違うだけで本文ではないため、両側から等しく落とす。
 */
function normalize(text: string): string {
  return text
    .replace(/\*\*/g, "") // **強調**
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [ラベル](リンク先)
    .replace(/\\/g, "") // 1\. のエスケープ
    .replace(/^\d+\.\s*/, "") // 箇条書きの採番（描画側で振り直す）
    .replace(/\s+/g, " ")
    .trim();
}

interface SourceOptions {
  /** md 側にだけあり、ページには意図的に載せていない行。 */
  drop?: string[];
  /** 「項目名：内容」で 1 行になっている行を項目名と内容に割る（特商法ページ用）。 */
  splitOnColon?: boolean;
}

/** md を、ページ側と 1 対 1 で突き合わせられる文字列の並びに変換する。 */
function sourceUnits(markdown: string, options: SourceOptions = {}): string[] {
  const { drop = [], splitOnColon = false } = options;
  const units: string[] = [];
  // 1 行目はファイル全体のタイトル。ページ側の h1 はアプリ既存の文言を使うため対象外。
  const lines = markdown.split("\n").slice(1);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // 表: 区切り行（| :---- | ... |）は捨て、セルだけを取り出す
    if (line.startsWith("|")) {
      if (/^\|[\s:|-]+\|$/.test(line)) continue;
      for (const cell of line.split("|").slice(1, -1)) {
        units.push(normalize(cell));
      }
      continue;
    }

    const text = normalize(line.replace(/^#+\s*/, ""));
    if (!text) continue;
    if (drop.includes(text)) continue;

    if (splitOnColon && text.includes("：")) {
      const at = text.indexOf("：");
      units.push(text.slice(0, at));
      const value = text.slice(at + 1).trim();
      if (value) units.push(value);
      continue;
    }

    units.push(text);
  }

  return units;
}

function blockUnits(block: LegalBlock): string[] {
  switch (block.type) {
    case "paragraph":
      return [normalize(block.text)];
    case "subheading":
      return [normalize(block.text)];
    case "list":
      return block.items.map(normalize);
    case "contact":
      return block.lines.map(normalize);
    case "table":
      return [
        ...block.headers.map(normalize),
        ...block.rows.flatMap((row) => row.map(normalize)),
      ];
  }
}

function articleUnits(articles: LegalArticle[]): string[] {
  return articles.flatMap((article) => [
    normalize(article.title),
    ...article.blocks.flatMap(blockUnits),
  ]);
}

describe("法務ページの本文は docs/legal/*.md と一致する", () => {
  it("利用規約 (/terms)", () => {
    const expected = sourceUnits(readDoc("terms.md"));
    const actual = [
      ...TERMS_PREAMBLE.flatMap(blockUnits),
      ...articleUnits(TERMS_ARTICLES),
    ];

    expect(actual).toEqual(expected);
  });

  it("プライバシーポリシー (/privacy)", () => {
    const expected = sourceUnits(readDoc("privacy.md"), {
      // 規約作成者から当社への申し送りメモ。利用者向けの記載ではないため
      // ユーザー判断により非掲載（2026-07-15）。
      drop: [
        "（注：本条と同内容の登録資格要件〔満18歳未満は法定代理人の同意が必要〕を利用規約第3条にも明記するよう、利用規約側の修正を推奨します。本ポリシー自体の記載に変更は不要です。）",
      ],
    });
    const actual = [
      ...PRIVACY_PREAMBLE.flatMap(blockUnits),
      ...articleUnits(PRIVACY_ARTICLES),
      ...PRIVACY_CLOSING.flatMap(blockUnits),
    ];

    expect(actual).toEqual(expected);
  });

  it("特定商取引法に基づく表記 (/legal)", () => {
    const expected = sourceUnits(readDoc("tokushoho.md"), {
      splitOnColon: true,
    });
    const actual = articleUnits(LEGAL_ARTICLES);

    expect(actual).toEqual(expected);
  });

  it("よくある質問 (/faq)", () => {
    const expected = sourceUnits(readDoc("faq.md"));
    const actual = FAQ_CATEGORIES.flatMap((section) => [
      normalize(section.category),
      ...section.items.flatMap((item) => [
        normalize(item.question),
        normalize(item.answer),
      ]),
    ]);

    expect(actual).toEqual(expected);
  });
});

describe("差し替え前のダミー文言が残っていない", () => {
  const stale = [
    "株式会社ビジ友", // 旧・特商法ページの仮の販売事業者名
    "support@bijiyu.jp", // 旧・特商法ページの仮の連絡先
    "（準備中）",
  ];

  it("4 ページのいずれにも残っていない", () => {
    const rendered = [
      ...TERMS_PREAMBLE.flatMap(blockUnits),
      ...articleUnits(TERMS_ARTICLES),
      ...PRIVACY_PREAMBLE.flatMap(blockUnits),
      ...articleUnits(PRIVACY_ARTICLES),
      ...PRIVACY_CLOSING.flatMap(blockUnits),
      ...articleUnits(LEGAL_ARTICLES),
      ...FAQ_CATEGORIES.flatMap((section) =>
        section.items.flatMap((item) => [item.question, item.answer]),
      ),
    ].join("\n");

    for (const phrase of stale) {
      expect(rendered).not.toContain(phrase);
    }
  });
});
