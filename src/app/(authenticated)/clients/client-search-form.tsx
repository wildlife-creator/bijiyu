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
import { MasterCombobox } from "@/components/master/master-combobox";
import { SearchAreaPicker } from "@/components/area/search-area-picker";
import type { AreaRow } from "@/components/area/types";
import {
  EMPLOYEE_SCALE_RANGES,
  LANGUAGES,
  WORKING_WAYS,
} from "@/lib/constants/options";

const ALL = "all";

interface ClientSearchFormProps {
  activeTradeTypes: string[];
  /** master-area: 都道府県 → 市区町村[] のマップ */
  candidateMunicipalitiesByPrefecture: Record<string, string[]>;
}

export function ClientSearchForm(props: ClientSearchFormProps) {
  return (
    <SearchFilterSheet>
      <ClientSearchFormContent {...props} />
    </SearchFilterSheet>
  );
}

function ClientSearchFormContent({
  activeTradeTypes,
  candidateMunicipalitiesByPrefecture,
}: ClientSearchFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const closeSheet = useSheetClose();

  const [keyword, setKeyword] = useState(searchParams.get("q") ?? "");
  const [areaValue, setAreaValue] = useState<AreaRow>({
    prefecture: searchParams.get("prefecture") ?? "",
    whole: false,
    municipalities: searchParams.getAll("municipality"),
  });
  const [tradeTypes, setTradeTypes] = useState<string[]>(
    searchParams.getAll("tradeType"),
  );
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
    if (areaValue.prefecture) {
      params.set("prefecture", areaValue.prefecture);
      for (const m of areaValue.municipalities) {
        params.append("municipality", m);
      }
    }
    for (const v of tradeTypes) params.append("tradeType", v);
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
        <SearchAreaPicker
          value={areaValue}
          onChange={setAreaValue}
          candidateMunicipalitiesByPrefecture={
            candidateMunicipalitiesByPrefecture
          }
        />
      </div>

      {/* 募集職種 */}
      <div className="space-y-1">
        <Label className="font-bold">募集職種</Label>
        <MasterCombobox
          mode="multi"
          options={activeTradeTypes}
          value={tradeTypes}
          onChange={setTradeTypes}
          placeholder="募集職種を検索"
          emptyLabel="候補がありません"
        />
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
