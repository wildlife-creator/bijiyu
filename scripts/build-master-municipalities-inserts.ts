#!/usr/bin/env node
/**
 * マスタ素材ファイル (tmp/master-area-research/municipalities.csv) を読み、
 * master_municipalities への INSERT 文を生成して標準出力に書き出す。
 *
 * 生成 SQL は Migration 1 (master_area_a_create_master_municipalities.sql)
 * に直接埋め込み、DB 自己完結性を担保する。
 *
 * 実行例:
 *   node scripts/build-master-municipalities-inserts.ts > /tmp/master-municipalities-inserts.sql
 *
 * 仕様:
 * - sort_order の算出 (tasks.md 1.1「方式 B」):
 *   PREFECTURES 定数 (総務省コード順) の index で主ソート、
 *   市区町村は ja-JP localeCompare で副ソート (xlsx の団体コード順は再現できないが、UI 表示上の許容範囲)
 * - 末尾に ON CONFLICT (prefecture, municipality) DO NOTHING を付与し再投入時の衝突を無視する
 * - 入力データに対するアサーション:
 *   - 全 1,898 行 (research.md R 既知値)
 *   - 都道府県別件数: 北海道 194 / 富山県 15 / 東京都 62
 *   - 政令指定都市本体 20 件 (横浜市・大阪市…) が含まれないこと (行政区 171 件のみ)
 *   - 東京都の島嶼/山間部の村 8 村が含まれること (青ヶ島村・小笠原村・利島村等)
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CSV_PATH = "tmp/master-area-research/municipalities.csv";

// 総務省「全国地方公共団体コード」順に並んだ 47 都道府県
// src/lib/constants/options.ts:9 の PREFECTURES と同一順。
// 本スクリプトは独立実行のため意図的に inline 重複させる (依存最小化)。
const PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
] as const;

const PREFECTURE_INDEX = new Map<string, number>(
  PREFECTURES.map((p, i) => [p, i]),
);

// 政令指定都市本体 20 件 (本マスタには含まれず、行政区 171 件のみ)
const SEITOSHI_BODIES = [
  "横浜市",
  "大阪市",
  "名古屋市",
  "札幌市",
  "京都市",
  "神戸市",
  "福岡市",
  "北九州市",
  "広島市",
  "仙台市",
  "千葉市",
  "さいたま市",
  "静岡市",
  "浜松市",
  "新潟市",
  "岡山市",
  "熊本市",
  "相模原市",
  "堺市",
  "川崎市",
];

// 東京都に含まれる必要のある島嶼/山間部の村の代表 (tasks.md 1.1 で例示)
const EXPECTED_TOKYO_VILLAGES_SAMPLE = ["青ヶ島村", "小笠原村", "利島村"];

interface Row {
  prefecture: string;
  municipality: string;
}

function escapeSqlLiteral(s: string): string {
  return s.replace(/'/g, "''");
}

function parseCsv(filePath: string): Row[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);
  // skip header (prefecture,municipality)
  return lines
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const idx = line.indexOf(",");
      if (idx < 0) {
        throw new Error(`CSV row missing comma: "${line}"`);
      }
      const prefecture = line.slice(0, idx).trim();
      const municipality = line.slice(idx + 1).trim();
      if (!prefecture || !municipality) {
        throw new Error(`Empty prefecture or municipality: "${line}"`);
      }
      return { prefecture, municipality };
    });
}

const rows = parseCsv(path.join(ROOT, CSV_PATH));

// Sort: PREFECTURES index primary, municipality ja-JP localeCompare secondary
rows.sort((a, b) => {
  const pa = PREFECTURE_INDEX.get(a.prefecture);
  const pb = PREFECTURE_INDEX.get(b.prefecture);
  if (pa === undefined) {
    throw new Error(`Unknown prefecture: "${a.prefecture}"`);
  }
  if (pb === undefined) {
    throw new Error(`Unknown prefecture: "${b.prefecture}"`);
  }
  if (pa !== pb) return pa - pb;
  return a.municipality.localeCompare(b.municipality, "ja-JP");
});

// Assertions

const total = rows.length;
if (total !== 1898) {
  throw new Error(`Expected 1,898 rows, got ${total}`);
}

const countByPref = (pref: string) =>
  rows.filter((r) => r.prefecture === pref).length;

const hokkaidoCount = countByPref("北海道");
const toyamaCount = countByPref("富山県");
const tokyoCount = countByPref("東京都");
if (hokkaidoCount !== 194) {
  throw new Error(`北海道 expected 194, got ${hokkaidoCount}`);
}
if (toyamaCount !== 15) {
  throw new Error(`富山県 expected 15, got ${toyamaCount}`);
}
if (tokyoCount !== 62) {
  throw new Error(`東京都 expected 62, got ${tokyoCount}`);
}

const seitoshiBodyRows = rows.filter((r) =>
  SEITOSHI_BODIES.includes(r.municipality),
);
if (seitoshiBodyRows.length !== 0) {
  throw new Error(
    `Seitoshi bodies must be excluded (only wards allowed): ${seitoshiBodyRows
      .map((r) => `${r.prefecture}${r.municipality}`)
      .join(", ")}`,
  );
}

const tokyoVillages = rows.filter(
  (r) => r.prefecture === "東京都" && r.municipality.endsWith("村"),
);
for (const v of EXPECTED_TOKYO_VILLAGES_SAMPLE) {
  if (!tokyoVillages.some((r) => r.municipality === v)) {
    throw new Error(`Tokyo island village missing: ${v}`);
  }
}
if (tokyoVillages.length !== 8) {
  throw new Error(
    `東京都の村 expected 8, got ${tokyoVillages.length}: ${tokyoVillages
      .map((r) => r.municipality)
      .join(", ")}`,
  );
}

process.stderr.write(
  `[ok] rows=${total}, 北海道=${hokkaidoCount}, 富山県=${toyamaCount}, 東京都=${tokyoCount}, 東京の村=${tokyoVillages.length}, 政令市本体=${seitoshiBodyRows.length}\n`,
);

// Generate SQL

const values = rows
  .map(
    (r, i) =>
      `  ('${escapeSqlLiteral(r.prefecture)}', '${escapeSqlLiteral(r.municipality)}', ${i + 1})`,
  )
  .join(",\n");

const sql = [
  `-- Source: ${CSV_PATH} (${total} rows, sorted by PREFECTURES index + ja-JP localeCompare)`,
  `INSERT INTO master_municipalities (prefecture, municipality, sort_order) VALUES`,
  values,
  `ON CONFLICT (prefecture, municipality) DO NOTHING;`,
  "",
].join("\n");

process.stdout.write(sql);
