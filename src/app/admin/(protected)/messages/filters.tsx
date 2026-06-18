"use client";

import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProxyOrgOption } from "@/lib/admin/proxy-threads";

interface ProxyThreadFiltersProps {
  /** "all" | organizationId */
  initialOrganizationId: string;
  options: ProxyOrgOption[];
}

/**
 * ADM-023 の会社絞込フィルタ。
 * URL の searchParams を SSOT とし、選択で即 router.push する
 * （新規絞込時はページを 1 に戻す = page を付けない）。
 */
export function ProxyThreadFilters({
  initialOrganizationId,
  options,
}: ProxyThreadFiltersProps) {
  const router = useRouter();

  function handleChange(value: string) {
    const params = new URLSearchParams();
    if (value !== "all") params.set("organizationId", value);
    router.push(`/admin/messages${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="mt-6">
      <label className="text-body-sm font-bold">会社で絞り込み</label>
      <Select
        value={initialOrganizationId || "all"}
        onValueChange={handleChange}
      >
        <SelectTrigger className="mt-1 w-full bg-background">
          <SelectValue placeholder="すべての会社" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">すべての会社</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.organizationId} value={o.organizationId}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
