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
import { TRADE_TYPES, PREFECTURES } from "@/lib/constants/options";

const EXPERIENCE_YEARS_OPTIONS = [
  "1年未満",
  "1〜3年",
  "3〜5年",
  "5〜10年",
  "10年以上",
] as const;

export function ContractorSearchFilter() {
  return (
    <SearchFilterSheet>
      <ContractorSearchFilterContent />
    </SearchFilterSheet>
  );
}

function ContractorSearchFilterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const closeSheet = useSheetClose();

  const [keyword, setKeyword] = useState(searchParams.get("q") ?? "");
  const [tradeType, setTradeType] = useState(
    searchParams.get("tradeType") ?? "",
  );
  const [prefecture, setPrefecture] = useState(
    searchParams.get("prefecture") ?? "",
  );
  const [experienceYears, setExperienceYears] = useState(
    searchParams.get("experienceYears") ?? "",
  );
  const [skill, setSkill] = useState(
    searchParams.get("skill") ?? "",
  );
  const [qualification, setQualification] = useState(
    searchParams.get("qualification") ?? "",
  );

  function handleSearch() {
    const params = new URLSearchParams();
    if (keyword) params.set("q", keyword);
    if (tradeType && tradeType !== "all") params.set("tradeType", tradeType);
    if (prefecture && prefecture !== "all") params.set("prefecture", prefecture);
    if (experienceYears && experienceYears !== "all") params.set("experienceYears", experienceYears);
    if (skill && skill !== "all") params.set("skill", skill);
    if (qualification && qualification !== "all") params.set("qualification", qualification);
    params.set("page", "1");
    closeSheet?.();
    router.push(`/users/contractors?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
        <div className="space-y-1">
          <Label className="font-bold">キーワード（氏名）</Label>
          <Input
            placeholder="キーワードを入力"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label className="font-bold">対応職種</Label>
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
          <Label className="font-bold">対応エリア</Label>
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
          <Label className="font-bold">経験年数</Label>
          <Select value={experienceYears} onValueChange={setExperienceYears}>
            <SelectTrigger>
              <SelectValue placeholder="お選びください" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              {EXPERIENCE_YEARS_OPTIONS.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="font-bold">保有スキル</Label>
          <Select value={skill} onValueChange={setSkill}>
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
          <Label className="font-bold">保有資格</Label>
          <Select value={qualification} onValueChange={setQualification}>
            <SelectTrigger>
              <SelectValue placeholder="お選びください" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              <SelectItem value="一級建築士">一級建築士</SelectItem>
              <SelectItem value="二級建築士">二級建築士</SelectItem>
              <SelectItem value="一級建築施工管理技士">一級建築施工管理技士</SelectItem>
              <SelectItem value="二級建築施工管理技士">二級建築施工管理技士</SelectItem>
              <SelectItem value="一級土木施工管理技士">一級土木施工管理技士</SelectItem>
              <SelectItem value="二級土木施工管理技士">二級土木施工管理技士</SelectItem>
              <SelectItem value="電気工事士">電気工事士</SelectItem>
              <SelectItem value="管工事施工管理技士">管工事施工管理技士</SelectItem>
              <SelectItem value="玉掛け技能">玉掛け技能</SelectItem>
              <SelectItem value="足場組立作業主任者">足場組立作業主任者</SelectItem>
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
