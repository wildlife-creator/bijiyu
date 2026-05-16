#!/usr/bin/env node
/**
 * マスタ素材ファイル (.kiro/specs/master-skills/raw-data/cleaned/*.txt) を読み、
 * master_trade_types / master_qualifications / master_skill_tags への
 * INSERT 文を生成して標準出力に書き出す。
 *
 * 生成 SQL は Migration A に直接埋め込み、DB 自己完結性を担保する。
 * このスクリプト自体は将来マスタ素材を更新する際の再生成ツールとして
 * リポジトリに保全する。
 *
 * 実行例:
 *   node scripts/build-master-inserts.ts > /tmp/master-inserts.sql
 *
 * 仕様:
 * - 空行と "#" で始まるコメント行をスキップ
 * - 前後空白の trim 以外の正規化は行わない（ラベルの揺らぎは raw-data 側で吸収）
 * - 末尾に ON CONFLICT (label) DO NOTHING を付与し、再投入時の衝突を無視する
 */
import { readFileSync } from "node:fs";
import path from "node:path";

interface Source {
  table: string;
  file: string;
}

const ROOT = path.resolve(import.meta.dirname, "..");

const SOURCES: readonly Source[] = [
  {
    table: "master_trade_types",
    file: ".kiro/specs/master-skills/raw-data/cleaned/trade-types.txt",
  },
  {
    table: "master_qualifications",
    file: ".kiro/specs/master-skills/raw-data/cleaned/qualifications.txt",
  },
  {
    table: "master_skill_tags",
    file: ".kiro/specs/master-skills/raw-data/cleaned/skill-tags.txt",
  },
];

function escapeSqlLiteral(label: string): string {
  return label.replace(/'/g, "''");
}

function parseLabels(filePath: string): string[] {
  const content = readFileSync(filePath, "utf-8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function buildInsertSql(table: string, labels: string[], sourceFile: string): string {
  const header = `-- Source: ${sourceFile} (${labels.length} rows)`;
  if (labels.length === 0) {
    return `${header}\n-- (no rows)\n`;
  }
  const values = labels
    .map((label) => `  ('${escapeSqlLiteral(label)}')`)
    .join(",\n");
  return [
    header,
    `INSERT INTO ${table} (label) VALUES`,
    values,
    `ON CONFLICT (label) DO NOTHING;`,
    "",
  ].join("\n");
}

const seen = new Set<string>();
for (const { table, file } of SOURCES) {
  const labels = parseLabels(path.join(ROOT, file));
  const duplicates = labels.filter((l) => {
    const key = `${table}::${l}`;
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
  if (duplicates.length > 0) {
    process.stderr.write(
      `[warn] ${table}: duplicated labels in ${file}: ${duplicates.join(", ")}\n`,
    );
  }
  process.stdout.write(buildInsertSql(table, labels, file));
}
