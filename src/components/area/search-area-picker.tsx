"use client";

/**
 * SearchAreaPicker (master-area-multi-select Phase B Task 2.2)
 *
 * 検索系専用のエリア入力 UI。「県 1 つ + その県内 muni 複数チェック」を
 * 配列長 1 強制で扱う。
 *
 * 仕様 (Req 7B.1〜7B.5 / 7B.8):
 *   - 単一 `AreaRow` を扱う controlled component。配列概念なし
 *   - 内部で `AreaRow` 部品 (Task 2.1) を showWholeCheckbox={false} で 1 つだけ描画
 *   - 「全域」概念は muni 0 個チェック = 県のみ指定で代替 (上位包含ルールで等価)
 *   - URL searchParams の読み書き (useSearchParams / useRouter) は本コンポーネントの
 *     責務ではない。親フォーム (job-search-filter.tsx 等) が値の管理と URL 同期を担う
 *
 * 値の型は単一 `AreaRow` (Phase A の types.ts)。検索系は配列長 1 制約のため
 * 配列ではなく単一オブジェクトで props 設計。
 */

import * as React from "react";

import { AreaRow as AreaRowComponent } from "./area-row";
import type { AreaRow } from "./types";

export interface SearchAreaPickerProps {
  /** 配列長 1 制約のため単一 AreaRow */
  value: AreaRow;
  onChange: (next: AreaRow) => void;
  candidateMunicipalitiesByPrefecture: Record<string, string[]>;
  disabled?: boolean;
  className?: string;
}

export function SearchAreaPicker({
  value,
  onChange,
  candidateMunicipalitiesByPrefecture,
  disabled = false,
  className,
}: SearchAreaPickerProps) {
  // 検索系は whole === false を強制 (Zod searchAreaRowSchema と同方針)。
  // 上位から渡された value.whole === true は false に正規化して扱う。
  const normalized: AreaRow = value.whole
    ? { ...value, whole: false, municipalities: [] }
    : value;

  const handleChange = (next: AreaRow) => {
    onChange({ ...next, whole: false });
  };

  return (
    <AreaRowComponent
      value={normalized}
      onChange={handleChange}
      candidateMunicipalitiesByPrefecture={candidateMunicipalitiesByPrefecture}
      showWholeCheckbox={false}
      disabled={disabled}
      className={className}
    />
  );
}
