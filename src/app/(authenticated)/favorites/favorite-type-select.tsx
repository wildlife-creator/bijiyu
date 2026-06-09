"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * マイリスト（CON-007）の種類切り替えプルダウン。
 * 案件 / 発注者 / 見込みユーザー を ?type= で切り替える。
 * 選択肢はロールに応じて Server 側から渡す（contractor は 見込みユーザー なし）。
 */

interface Option {
  value: string;
  label: string;
}

interface FavoriteTypeSelectProps {
  options: Option[];
  value: string;
}

export function FavoriteTypeSelect({ options, value }: FavoriteTypeSelectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("type", next);
    // 種類を変えたらページと並べ替え（案件専用）はリセット
    params.delete("page");
    params.delete("sort");
    router.push(`/favorites?${params.toString()}`);
  }

  return (
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger className="h-10 w-40 bg-background text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
