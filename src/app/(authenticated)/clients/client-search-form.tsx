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
import {
  SearchFilterSheet,
  useSheetClose,
} from "@/components/job-search/search-filter-sheet";
import {
  EMPLOYEE_SCALE_RANGES,
  LANGUAGES,
  PREFECTURES,
  TRADE_TYPES,
  WORKING_WAYS,
} from "@/lib/constants/options";

const ALL = "all";

export function ClientSearchForm() {
  return (
    <SearchFilterSheet>
      <ClientSearchFormContent />
    </SearchFilterSheet>
  );
}

function ClientSearchFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const closeSheet = useSheetClose();

  const [keyword, setKeyword] = useState(searchParams.get("q") ?? "");
  const [prefecture, setPrefecture] = useState(
    searchParams.get("prefecture") ?? "",
  );
  const [tradeType, setTradeType] = useState(searchParams.get("tradeType") ?? "");
  const [employeeScale, setEmployeeScale] = useState(
    searchParams.get("employeeScale") ?? "",
  );
  const [workingWay, setWorkingWay] = useState(
    searchParams.get("workingWay") ?? "",
  );
  const [language, setLanguage] = useState(searchParams.get("language") ?? "");

  function handleSearch() {
    const params = new URLSearchParams();
    if (keyword) params.set("q", keyword);
    if (prefecture && prefecture !== ALL) params.set("prefecture", prefecture);
    if (tradeType && tradeType !== ALL) params.set("tradeType", tradeType);
    if (employeeScale && employeeScale !== ALL)
      params.set("employeeScale", employeeScale);
    if (workingWay && workingWay !== ALL) params.set("workingWay", workingWay);
    if (language && language !== ALL) params.set("language", language);
    params.set("page", "1");
    closeSheet?.();
    router.push(`/clients?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      {/* キーワード */}
      <div className="space-y-1">
        <Label className="font-bold">キーワード</Label>
        <div className="relative">
          <img
            src="/images/icons/icon-search.png"
            alt=""
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60"
          />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="bg-background pl-9"
          />
        </div>
      </div>

      {/* 募集エリア */}
      <div className="space-y-1">
        <Label className="font-bold">募集エリア</Label>
        <Select value={prefecture} onValueChange={setPrefecture}>
          <SelectTrigger className="bg-background">
            <SelectValue placeholder="お選びください" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>すべて</SelectItem>
            {PREFECTURES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 募集職種 */}
      <div className="space-y-1">
        <Label className="font-bold">募集職種</Label>
        <Select value={tradeType} onValueChange={setTradeType}>
          <SelectTrigger className="bg-background">
            <SelectValue placeholder="お選びください" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>すべて</SelectItem>
            {TRADE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 従業員規模 */}
      <div className="space-y-1">
        <Label className="font-bold">従業員規模</Label>
        <Select value={employeeScale} onValueChange={setEmployeeScale}>
          <SelectTrigger className="bg-background">
            <SelectValue placeholder="お選びください" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>すべて</SelectItem>
            {EMPLOYEE_SCALE_RANGES.map((r) => (
              <SelectItem key={r.label} value={r.label}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 求める働き方 */}
      <div className="space-y-1">
        <Label className="font-bold">求める働き方</Label>
        <Select value={workingWay} onValueChange={setWorkingWay}>
          <SelectTrigger className="bg-background">
            <SelectValue placeholder="お選びください" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>すべて</SelectItem>
            {WORKING_WAYS.map((w) => (
              <SelectItem key={w} value={w}>
                {w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 言語 */}
      <div className="space-y-1">
        <Label className="font-bold">言語</Label>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger className="bg-background">
            <SelectValue placeholder="お選びください" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>すべて</SelectItem>
            {LANGUAGES.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
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
