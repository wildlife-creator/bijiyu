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
import { PREFECTURES } from "@/lib/constants/options";

const EXPERIENCE_YEARS_OPTIONS = [
  "1年未満",
  "1〜3年",
  "3〜5年",
  "5〜10年",
  "10年以上",
] as const;

interface ContractorSearchFilterProps {
  activeTradeTypes: string[];
  activeSkillTags: string[];
  activeQualifications: string[];
}

export function ContractorSearchFilter(props: ContractorSearchFilterProps) {
  return (
    <SearchFilterSheet>
      <ContractorSearchFilterContent {...props} />
    </SearchFilterSheet>
  );
}

function ContractorSearchFilterContent({
  activeTradeTypes,
  activeSkillTags,
  activeQualifications,
}: ContractorSearchFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const closeSheet = useSheetClose();

  const [keyword, setKeyword] = useState(searchParams.get("q") ?? "");
  // 配列: 同名キーの繰り返しで encode/decode する
  const [tradeTypes, setTradeTypes] = useState<string[]>(
    searchParams.getAll("tradeType"),
  );
  const [prefecture, setPrefecture] = useState(
    searchParams.get("prefecture") ?? "",
  );
  const [experienceYears, setExperienceYears] = useState(
    searchParams.get("experienceYears") ?? "",
  );
  const [skillTags, setSkillTags] = useState<string[]>(
    searchParams.getAll("skillTag"),
  );
  const [qualifications, setQualifications] = useState<string[]>(
    searchParams.getAll("qualification"),
  );

  function handleSearch() {
    const params = new URLSearchParams();
    if (keyword) params.set("q", keyword);
    for (const v of tradeTypes) params.append("tradeType", v);
    if (prefecture && prefecture !== "all") params.set("prefecture", prefecture);
    if (experienceYears && experienceYears !== "all")
      params.set("experienceYears", experienceYears);
    for (const v of skillTags) params.append("skillTag", v);
    for (const v of qualifications) params.append("qualification", v);
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
        <MasterCombobox
          mode="multi"
          options={activeTradeTypes}
          value={tradeTypes}
          onChange={setTradeTypes}
          placeholder="対応職種を検索"
          emptyLabel="候補がありません"
        />
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
        <MasterCombobox
          mode="multi"
          options={activeSkillTags}
          value={skillTags}
          onChange={setSkillTags}
          placeholder="保有スキルを検索"
          emptyLabel="候補がありません"
        />
      </div>

      <div className="space-y-1">
        <Label className="font-bold">保有資格</Label>
        <MasterCombobox
          mode="multi"
          options={activeQualifications}
          value={qualifications}
          onChange={setQualifications}
          placeholder="保有資格を検索"
          emptyLabel="候補がありません"
        />
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
