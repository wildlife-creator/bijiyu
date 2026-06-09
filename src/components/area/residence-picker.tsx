"use client";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PREFECTURES } from "@/lib/constants/options";

/**
 * お住まい（個人居住地）入力用の階層プルダウン。
 *
 * 「都道府県を選ぶ → その県の市区町村を 1 つ選ぶ」というシンプルな 2 段選択。
 * 市区町村は任意（「指定しない」で都道府県のみ）。
 *
 * 対応可能エリア(AreaRow) は複数県・複数市区町村・全域を扱うが、こちらは
 * 1 県 + 任意で 1 市区町村のみ。視覚スタイル（shadcn Select / text-sm）は
 * AreaRow に合わせて統一している。
 */

const NO_MUNICIPALITY = "__none__";

export interface ResidenceValue {
  prefecture: string;
  /** 市区町村。未指定は null（都道府県のみ） */
  municipality: string | null;
}

interface ResidencePickerProps {
  value: ResidenceValue;
  onChange: (next: ResidenceValue) => void;
  /** 都道府県別の active 市区町村候補（Server Component から JSON 注入） */
  candidateMunicipalitiesByPrefecture: Record<string, string[]>;
  /** 都道府県 Select に振る id（外側の Label htmlFor と対応付ける） */
  prefectureId?: string;
  disabled?: boolean;
  className?: string;
}

export function ResidencePicker({
  value,
  onChange,
  candidateMunicipalitiesByPrefecture,
  prefectureId,
  disabled,
  className,
}: ResidencePickerProps) {
  const candidates = value.prefecture
    ? candidateMunicipalitiesByPrefecture[value.prefecture] ?? []
    : [];

  // 既存登録の市区町村が候補に無い（廃止された等）場合でも失わないよう option に含める
  const muniOptions = [...candidates];
  if (value.municipality && !muniOptions.includes(value.municipality)) {
    muniOptions.unshift(value.municipality);
  }

  function handlePrefectureChange(next: string) {
    // 都道府県を変えたら市区町村はリセットする
    onChange({ prefecture: next, municipality: null });
  }

  function handleMunicipalityChange(next: string) {
    onChange({
      prefecture: value.prefecture,
      municipality: next === NO_MUNICIPALITY ? null : next,
    });
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Select
        value={value.prefecture}
        onValueChange={handlePrefectureChange}
        disabled={disabled}
      >
        <SelectTrigger
          id={prefectureId}
          className="min-h-10 w-full bg-background text-sm"
        >
          <SelectValue placeholder="都道府県を選択" />
        </SelectTrigger>
        <SelectContent>
          {PREFECTURES.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value.prefecture !== "" && (
        <Select
          // 未指定（null）は空値 → プレースホルダー表示。「指定しない」item を
          // 選ぶと NO_MUNICIPALITY が来るので handleMunicipalityChange で null に戻す
          value={value.municipality ?? ""}
          onValueChange={handleMunicipalityChange}
          disabled={disabled}
        >
          <SelectTrigger className="min-h-10 w-full bg-background text-sm">
            <SelectValue placeholder="市区町村を選択（任意）" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_MUNICIPALITY}>指定しない</SelectItem>
            {muniOptions.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
