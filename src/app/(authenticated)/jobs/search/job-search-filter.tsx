"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchFilterSheet, useSheetClose } from "@/components/job-search/search-filter-sheet";
import { MasterCombobox } from "@/components/master/master-combobox";
import { SearchAreaPicker } from "@/components/area/search-area-picker";
import type { AreaRow } from "@/components/area/types";
import {
  EXPERIENCE_YEARS,
  LANGUAGES,
  WORK_START_PERIODS,
} from "@/lib/constants/options";

interface JobSearchFilterProps {
  activeTradeTypes: string[];
  /** master-area: 都道府県 → 市区町村[] のマップ (Server Component で取得して注入) */
  candidateMunicipalitiesByPrefecture: Record<string, string[]>;
}

export function JobSearchFilter(props: JobSearchFilterProps) {
  return (
    <SearchFilterSheet>
      <JobSearchFilterContent {...props} />
    </SearchFilterSheet>
  );
}

function JobSearchFilterContent({
  activeTradeTypes,
  candidateMunicipalitiesByPrefecture,
}: JobSearchFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const closeSheet = useSheetClose();

  // master-area-multi-select: URL searchParams を Single Source of Truth とし、popup 開閉時に
  // 直近の URL 状態から初期化する。SearchAreaPicker は controlled component なので親側で値を保持。
  // URL 形式: ?prefecture=X&municipality=A&municipality=B  (同名キー繰返し)
  const [keyword, setKeyword] = useState(searchParams.get("q") ?? "");
  const [areaValue, setAreaValue] = useState<AreaRow>({
    prefecture: searchParams.get("prefecture") ?? "",
    whole: false,
    municipalities: searchParams.getAll("municipality"),
  });
  const [workPeriod, setWorkPeriod] = useState(
    searchParams.get("workPeriod") ?? "",
  );
  const [tradeTypes, setTradeTypes] = useState<string[]>(
    searchParams.getAll("tradeType"),
  );
  const [experienceYears, setExperienceYears] = useState(
    searchParams.get("experienceYears") ?? "",
  );
  const [language, setLanguage] = useState(
    searchParams.get("language") ?? "",
  );

  function handleSearch() {
    const params = new URLSearchParams();
    if (keyword) params.set("q", keyword);
    if (areaValue.prefecture) {
      params.set("prefecture", areaValue.prefecture);
      // 複数 muni を同名キー繰返し形式で append
      for (const m of areaValue.municipalities) {
        params.append("municipality", m);
      }
    }
    if (workPeriod && workPeriod !== "all") params.set("workPeriod", workPeriod);
    for (const v of tradeTypes) params.append("tradeType", v);
    if (experienceYears && experienceYears !== "all")
      params.set("experienceYears", experienceYears);
    if (language && language !== "all") params.set("language", language);
    params.set("page", "1");
    closeSheet?.();
    router.push(`/jobs/search?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>キーワード（タイトル・発注者名）</Label>
        <Input
          placeholder="キーワードを入力"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label>エリア</Label>
        <SearchAreaPicker
          value={areaValue}
          onChange={setAreaValue}
          candidateMunicipalitiesByPrefecture={
            candidateMunicipalitiesByPrefecture
          }
        />
      </div>

      <div className="space-y-1">
        <Label>希望日程</Label>
        <Select value={workPeriod} onValueChange={setWorkPeriod}>
          <SelectTrigger>
            <SelectValue placeholder="お選びください" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {WORK_START_PERIODS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>募集職種</Label>
        <MasterCombobox
          mode="multi"
          options={activeTradeTypes}
          value={tradeTypes}
          onChange={setTradeTypes}
          placeholder="募集職種を検索"
          emptyLabel="候補がありません"
        />
      </div>

      <div className="space-y-1">
        <Label>経験年数</Label>
        <Select value={experienceYears} onValueChange={setExperienceYears}>
          <SelectTrigger>
            <SelectValue placeholder="お選びください" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {EXPERIENCE_YEARS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>言語</Label>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger>
            <SelectValue placeholder="お選びください" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {LANGUAGES.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        onClick={handleSearch}
        className="w-full rounded-[47px] bg-primary text-primary-foreground hover:bg-primary/90"
      >
        検索する
      </Button>
    </div>
  );
}
