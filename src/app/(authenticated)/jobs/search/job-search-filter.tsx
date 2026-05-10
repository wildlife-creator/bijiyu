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
import {
  TRADE_TYPES,
  PREFECTURES,
  EXPERIENCE_YEARS,
  LANGUAGES,
  WORK_START_PERIODS,
} from "@/lib/constants/options";

export function JobSearchFilter() {
  return (
    <SearchFilterSheet>
      <JobSearchFilterContent />
    </SearchFilterSheet>
  );
}

function JobSearchFilterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const closeSheet = useSheetClose();

  const [keyword, setKeyword] = useState(searchParams.get("q") ?? "");
  const [prefecture, setPrefecture] = useState(
    searchParams.get("prefecture") ?? "",
  );
  const [workPeriod, setWorkPeriod] = useState(
    searchParams.get("workPeriod") ?? "",
  );
  const [tradeType, setTradeType] = useState(
    searchParams.get("tradeType") ?? "",
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
    if (prefecture && prefecture !== "all") params.set("prefecture", prefecture);
    if (workPeriod && workPeriod !== "all") params.set("workPeriod", workPeriod);
    if (tradeType && tradeType !== "all") params.set("tradeType", tradeType);
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
        <Select value={prefecture} onValueChange={setPrefecture}>
          <SelectTrigger>
            <SelectValue placeholder="お選びください" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {PREFECTURES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Select value={tradeType} onValueChange={setTradeType}>
          <SelectTrigger>
            <SelectValue placeholder="お選びください" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {TRADE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
